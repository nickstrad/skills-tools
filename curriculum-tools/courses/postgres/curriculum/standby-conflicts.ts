import { code, type Draft } from "../../../src/types.ts";
import { OWNED_REPLICATION_PY } from "./owned-replication.ts";

function conflictExperiment(stride: number): string {
  return "python3 - <<'PY'\n" + OWNED_REPLICATION_PY + `\ndelete_stride = ${stride}\n` + code`
readers=[]
row_count=10000

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def outcome_query(table):
    return "select json_build_object('rows',count(*),'ids',count(distinct id),'sum',sum(id)," \
        "'payload_ok',bool_and(pad=repeat('c',100)),'ids_valid',bool_and(id between 1 and "+str(row_count)+")," \
        "'delete_candidates',count(*) filter (where id % "+str(delete_stride)+"=0)) from "+table

def outcome(query,table):
    return json.loads(query(outcome_query(table)))

def conflicts():
    return json.loads(replica_sql("select row_to_json(s) from (select confl_snapshot,confl_lock,confl_bufferpin,"
        "confl_deadlock,confl_tablespace from pg_stat_database_conflicts where datname=current_database()) s"))

def slot_horizon():
    return json.loads(sql("select row_to_json(s) from (select slot_name,xmin::text,catalog_xmin::text,active "
        "from pg_replication_slots where slot_name='owned_standby') s"))

def physical(table):
    return json.loads(sql("select json_build_object('live',tuple_count,'dead',dead_tuple_count,"
        "'bytes',table_len,'free_bytes',free_space) from pgstattuple('"+table+"')"))

def vacuum(table,label):
    result=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',
        'vacuum (verbose,truncate false,disable_page_skipping true,index_cleanup on) '+table],
        env=env,text=True,capture_output=True,timeout=10)
    (root/(label+'-vacuum.log')).write_text(result.stdout+result.stderr)
    assert result.returncode==0,result.stderr
    return result.stderr

def reader_state(label):
    return json.loads(replica_sql("select coalesce(json_agg(s),'[]') from (select pid,state,wait_event_type,"
        "wait_event,backend_xmin::text as xmin from pg_stat_activity where application_name='"+label+"') s"))

def launch_reader(table):
    label='reader_'+table
    stdout=(root/(label+'.stdout')).open('w')
    stderr=(root/(label+'.stderr')).open('w')
    reader_env=dict(replica_env,PGAPPNAME=label,PGOPTIONS='-c statement_timeout=20000 -c lock_timeout=1000')
    query='begin isolation level repeatable read; '+outcome_query(table)+'; select pg_sleep(12); '+outcome_query(table)+'; commit'
    process=subprocess.Popen([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',query],
        env=reader_env,text=True,stdout=stdout,stderr=stderr)
    item=dict(label=label,process=process,stdout=stdout,stderr=stderr)
    readers.append(item)
    state=wait_for('reader holding snapshot in PgSleep',lambda:
        (lambda rows: rows[0] if len(rows)==1 and rows[0]['wait_event']=='PgSleep' and rows[0]['xmin'] else False)(reader_state(label)),5)
    item['state']=state
    return item

def finish_reader(item,expect_conflict):
    rc=item['process'].wait(timeout=16)
    item['stdout'].close(); item['stderr'].close()
    stdout=(root/(item['label']+'.stdout')).read_text()
    stderr=(root/(item['label']+'.stderr')).read_text()
    values=[json.loads(line) for line in stdout.splitlines() if line.startswith('{')]
    if expect_conflict:
        assert rc!=0 and '40001' in stderr and 'canceling statement due to conflict with recovery' in stderr,stderr
        assert 'row versions that must be removed' in stderr,stderr
        assert len(values)==1 and values[0]==original,values
    else:
        assert rc==0 and stderr=='' and values==[original,original],(rc,stdout,stderr)
        assert 'COMMIT' in stdout
    return dict(returncode=rc,stdout=stdout,stderr=stderr,snapshots=values)

try:
    start()
    sql('create extension pgstattuple')
    for table in ('conflict_off','conflict_on'):
        sql('create table '+table+'(id int primary key,pad text not null)')
        sql("insert into "+table+" select g,repeat('c',100) from generate_series(1,"+str(row_count)+") g")
        vacuum(table,'initial_'+table)
    clone_standby()
    replica_sql("alter system set max_standby_streaming_delay='1s'")
    replica_sql("alter system set max_standby_archive_delay='1s'")
    replica_sql("alter system set hot_standby_feedback='off'")
    replica_sql('select pg_reload_conf()')
    wait_for('effective conflict settings',lambda: replica_sql('show max_standby_streaming_delay')=='1s'
        and replica_sql('show max_standby_archive_delay')=='1s' and replica_sql('show hot_standby_feedback')=='off')
    wait_replay(sql("select pg_create_restore_point('conflict_baseline')"))
    original=dict(rows=row_count,ids=row_count,sum=row_count*(row_count+1)//2,payload_ok=True,
        ids_valid=True,delete_candidates=row_count//delete_stride)
    deleted=row_count//delete_stride
    expected_ids=[i for i in range(1,row_count+1) if i%delete_stride!=0]
    expected=dict(rows=len(expected_ids),ids=len(expected_ids),sum=sum(expected_ids),payload_ok=True,
        ids_valid=True,delete_candidates=0)
    for feedback,table in [(False,'conflict_off'),(True,'conflict_on')]:
        if feedback:
            replica_sql("alter system set hot_standby_feedback='on'")
            replica_sql('select pg_reload_conf()')
            wait_for('effective feedback on',lambda: replica_sql('show hot_standby_feedback')=='on')
        before_conflicts=conflicts()
        assert outcome(replica_sql,table)==original
        reader=launch_reader(table)
        xmin=reader['state']['xmin']
        if feedback:
            def feedback_ready():
                sample=json.loads(sql("select json_build_object('reader_xmin','"+xmin+"','reader_age',age('"+xmin+
                    "'::xid),'slot_xmin',xmin::text,'slot_age',age(xmin),"
                    "'protects',xmin is not null and age(xmin)>=age('"+xmin+
                    "'::xid)) from pg_replication_slots where slot_name='owned_standby'"))
                (root/'feedback-horizon-poll.json').write_text(json.dumps(sample,indent=2))
                return sample['protects']
            wait_for('primary acknowledges a horizon protecting the reader',feedback_ready,5)
            emit('feedback_horizon',dict(reader_xmin=xmin,sender=sender(),slot=slot_horizon()))
        else:
            assert len(sender())==1 and sender()[0]['backend_xmin'] is None and slot_horizon()['xmin'] is None
        horizon=dict(sender=sender(),slot=slot_horizon())
        assert reader['process'].poll() is None
        sql('delete from '+table+' where id % '+str(delete_stride)+'=0')
        vacuum_log=vacuum(table,table)
        retained=physical(table)
        assert outcome(sql,table)==expected
        bound=sql("select pg_create_restore_point('"+table+"_vacuum_complete')")
        if feedback:
            assert retained['live']==row_count-deleted and retained['dead']==deleted,retained
            assert str(deleted)+' are dead but not yet removable' in vacuum_log,vacuum_log
            wait_replay(bound)
            assert outcome(replica_sql,table)==expected
            assert reader['process'].poll() is None and reader_state(reader['label'])[0]['xmin']==xmin
            assert conflicts()==before_conflicts
            emit('feedback_retains_versions',dict(reader=reader['state'],primary_horizon=horizon,
                physical=retained,fresh_primary=outcome(sql,table),fresh_standby=outcome(replica_sql,table)))
            result=finish_reader(reader,False)
            assert conflicts()==before_conflicts
            # Disable feedback after the reader's normal commit and observe release, rather than assume it.
            replica_sql("alter system set hot_standby_feedback='off'")
            replica_sql('select pg_reload_conf()')
            wait_for('feedback horizon released',lambda: len(sender())==1 and sender()[0]['backend_xmin'] is None
                and slot_horizon()['xmin'] is None)
            reclaimed_log=vacuum(table,'released_feedback')
            reclaimed=physical(table)
            assert reclaimed['dead']==0 and reclaimed['live']==row_count-deleted,reclaimed
            assert reclaimed['free_bytes']>retained['free_bytes']
            wait_replay(sql("select pg_create_restore_point('feedback_released')"))
            assert outcome(sql,table)==outcome(replica_sql,table)==expected
            emit('reader_survived_then_reclaimed',dict(reader_result=result,before=retained,after=reclaimed,
                primary_horizon=dict(sender=sender(),slot=slot_horizon()),final=outcome(replica_sql,table)))
        else:
            result=finish_reader(reader,True)
            wait_replay(bound)
            wait_for('snapshot conflict counter',lambda: conflicts()['confl_snapshot']==before_conflicts['confl_snapshot']+1)
            after_conflicts=conflicts()
            assert all(after_conflicts[k]==v for k,v in before_conflicts.items() if k!='confl_snapshot')
            assert retained['dead']==0 and retained['live']==row_count-deleted,retained
            assert outcome(replica_sql,table)==expected
            emit('snapshot_conflict_canceled',dict(reader_result=result,primary_horizon=horizon,
                before_conflicts=before_conflicts,after_conflicts=after_conflicts,physical=retained,
                source=outcome(sql,table),standby=outcome(replica_sql,table)))
    print('PASS: actual snapshot cancellation without feedback; retained primary versions and surviving old snapshot with feedback; release permits reclamation.',flush=True)
finally:
    for item in readers:
        if item['process'].poll() is None:
            try:
                replica_sql("select pg_cancel_backend(pid) from pg_stat_activity where application_name='"+item['label']+"'")
                item['process'].wait(timeout=5)
            except (RuntimeError,subprocess.TimeoutExpired):
                item['process'].kill(); item['process'].wait(timeout=5)
        item['stdout'].close(); item['stderr'].close()
    stop_replication()
PY`;
}

export const STANDBY_CONFLICTS_VARIATION = conflictExperiment(4);
export const STANDBY_CONFLICTS: Draft = {
  slug: "hot-standby-query-conflict",
  revision: 4,
  tags: ["hot-standby", "vacuum", "mvcc", "consistency", "gc-horizon"],
  title: "Standby conflicts: cancel the reader or retain its old versions",
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 35,
  prerequisites: ["replication-lag-under-load", "xmin-horizon-blocks-cleanup"],
  overview: code`
Hold an old snapshot on an owned physical standby, then delete and vacuum the rows it needs on
the primary. First classify the actual recovery cancellation. Then enable feedback and wait for
its protecting horizon on the primary: the reader survives while primary VACUUM retains deleted
versions. Release the reader and feedback, reclaim those versions and compare fresh application
results; the variation deletes one quarter instead of one half of the rows.`,
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".`,
  caution: code`
Run the complete shell script with Python3, matching PostgreSQL16 binaries and pgstattuple,
including pg_basebackup/pg_verifybackup; PGBIN may select the binary folder. It creates a private
source/standby, clears inherited PG/PGLAB settings and disables TCP. Root uses runuser as the
postgres OS owner. Only owned reader queries are deliberately canceled. Readers have20-second
statement limits, observation gates and process waits are bounded, and finally stops readers,
standby and source and removes the owned physical slot. Retain the printed stopped paths/logs;
allow a few hundred MB. The12-second sleeping statement holds a known snapshot, not a benchmark.`,
  syntaxBreakdown: code`
### In plain terms

A standby reading an old snapshot needs row versions that primary cleanup may remove. Replaying
that cleanup can force cancellation of the read. Feedback asks the primary to retain the required
versions instead; the cost becomes occupied space until the reader's horizon is released.

### What you are learning

- **Snapshot conflict:** cleanup WAL can invalidate a standby reader even though its SELECT writes nothing.
- **Feedback horizon:** observe the actual primary retention state before assuming the reader is protected.
- **Space cost:** retained dead versions and reusable free space expose the cost of reader survival.
- **Release and retry:** a finished old snapshot permits cleanup; a canceled transaction needs a new snapshot.

### Piece by piece

- **python3** includes the complete owned-replication helper. **PGBIN / pg_config --bindir** finds
  binaries. **tempfile.mkdtemp**, private sockets and cleared PG variables isolate files and
  connections; root-only **runuser/os.chown** assigns server ownership to postgres.
- **initdb -D** names the new data directory; **-U postgres** names its administrator;
  **--auth-local=trust** permits access through the protected local socket directory;
  **--auth-host=reject** rejects host authentication; **--no-locale**, **--data-checksums** and
  **--wal-segsize=1** select fixed locale, checksums and1MB WAL segments. **listen_addresses=''**
  disables TCP. **pg_ctl -D ... -l ... -w -t20** names data/log files and bounds startup waiting;
  **-m fast stop** stops only the owned server, rolling back active work.
- **fsync/synchronous_commit/full_page_writes=on**, **wal_level=replica**, small shared buffers,
  **max_wal_size=128MB**, **checkpoint_timeout=1h**, **autovacuum=off** and
  **wal_sender_timeout=5s** keep this small controlled fixture separate from any existing cluster.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, prints unaligned tuples only,
  stops on SQL errors and executes supplied commands. **VERBOSITY=verbose** retains SQLSTATE,
  detail and location. **PGCONNECT_TIMEOUT**, **statement_timeout**, **lock_timeout** and Python
  process timeouts bound calls. A failed expected reader is inspected, not silently accepted.
- **CREATE EXTENSION pgstattuple** supplies physical tuple/free-space inspection. Two identically
  seeded tables, **conflict_off/conflict_on**, each contain10,000 unique IDs and100-character
  **repeat** payloads from **generate_series**. Each table is used once, avoiding residual
  versions from the first policy contaminating the second policy's measurement.
- **VACUUM (VERBOSE, TRUNCATE false, DISABLE_PAGE_SKIPPING true, INDEX_CLEANUP on)** reports actual
  removed/retained versions, prevents end-of-file truncation from introducing a lock conflict,
  visits pages instead of trusting visibility-map skipping, and requests index cleanup. Initial
  vacuum settles both fixtures before the backup. Later verbose stderr is preserved separately.
- **clone_standby** creates a **LOGIN REPLICATION** role. **pg_basebackup -U** selects it,
  **-D** names the copy, **-c fast** requests a checkpoint, **-X stream** includes WAL,
  **-R** writes recovery settings, **-C -S owned_standby** creates/names the physical slot and
  **--manifest-checksums=SHA256 -v** adds checksums/diagnostics. **pg_verifybackup** verifies before
  config changes. **standby.signal/primary_conninfo/primary_slot_name** connect recovery to the
  source; private socket, **hot_standby=on**, **archive_mode=off**, status interval1s and retry100ms
  configure the copy.
- **ALTER SYSTEM SET** writes only the owned standby's configuration; **pg_reload_conf** requests
  reload. Poll **SHOW** for effective **max_standby_streaming_delay=1s**,
  **max_standby_archive_delay=1s** and the requested **hot_standby_feedback** value. The streaming
  limit concerns accumulated delay applying received WAL; it is not a guaranteed fresh one-second
  allowance for each query. Archive delay bounds the corresponding archive/local recovery case.
- **pg_create_restore_point** writes an explicit WAL marker and returns its record end.
  **wait_replay** polls **pg_last_wal_replay_lsn >= marker** before baseline reads and after each
  cleanup. This produces a replayable boundary even when an idle post-backup insertion position
  names space for a future record. These markers are apply gates, not actual PITR restores.
- **BEGIN ISOLATION LEVEL REPEATABLE READ** keeps the first SELECT's snapshot. **pg_sleep(12)**
  parks an active statement while that snapshot is held. A second result query and **COMMIT**
  are queued on the same connection. **subprocess.Popen** supplies concurrency; **PGAPPNAME**
  identifies the owned reader and stdout/stderr files retain its complete response.
- **pg_stat_activity.backend_xmin** on the standby identifies the reader's snapshot horizon.
  **wait_event=PgSleep**, a non-null xmin and a live client process establish the held snapshot
  before deletion. Query completion is never inferred from sleeping a guessed interval.
- **hot_standby_feedback=off** leaves the primary unaware of this reader's horizon. With the
  physical slot used here, both sender **pg_stat_replication.backend_xmin** and
  **pg_replication_slots.xmin** are observed NULL before the off-policy deletion.
- With feedback on, PostgreSQL16 stores the reported cleanup horizon in the active physical
  slot's **xmin**; sender **backend_xmin** may still be NULL. **catalog_xmin** is also retained
  as evidence but is not substituted for the user-table horizon. Poll the actual slot xmin;
  **age(slot.xmin) >= age(reader_xmin::xid)** confirms it is old enough to protect this snapshot.
  Compare XID ages on one primary query rather than assuming ordinary numeric XID ordering.
- **DELETE ... WHERE id % delete_stride=0** removes even IDs in the core and multiples of4 in
  the variation. It commits before VACUUM. **pgstattuple.tuple_count/dead_tuple_count** measure
  remaining live and deleted versions; **table_len/free_space** distinguish occupied bytes from
  reusable space. These scans run after the controlled mutation without concurrent primary writers.
- **pg_stat_database_conflicts.confl_snapshot** must increase by one after the off-policy reader
  fails with **40001** and row-version recovery-conflict detail. **confl_lock**, **confl_bufferpin**,
  **confl_deadlock** and **confl_tablespace** must stay unchanged. Cumulative counters are compared
  to each phase's baseline. Fresh connections and bounded polling allow statistics to be reported.
- **json_build_object**, **row_to_json** and Python **json.loads/dumps** retain structured evidence.
  **count**, **count(distinct id)**, **sum**, **bool_and**, **BETWEEN** and **FILTER** jointly check
  every possible ID and payload: all IDs lie in1–10,000, all expected distinct IDs are present,
  and no deleted candidate remains in the fresh result. Counts alone would be weaker evidence.
- With feedback protecting the reader, VACUUM reports5,000 dead versions not yet removable and
  pgstattuple counts them. A new standby snapshot already sees only5,000 survivors, while the
  still-running old transaction later returns all10,000 original rows again and commits normally.
  Conflict counters stay unchanged; this proves survival and snapshot preservation through replay.
- After that normal COMMIT, feedback is disabled and the driver polls slot xmin and sender xmin
  until both are NULL. A new VACUUM reduces dead versions to zero and increases reusable free
  space. **TRUNCATE false** means file size need not shrink; reclamation is in-place reuse.
  A final replay marker and complete fresh queries prove primary/standby agreement.
- Finally targets any remaining owned reader with **pg_cancel_backend**, then bounded
  **wait/kill** cleans up its client. Standby stops, **pg_replication_slots.active** becomes false,
  **pg_drop_replication_slot** removes only the owned slot and the primary stops.`,
  code: conflictExperiment(2),
  expectedResult: code`
Without feedback, the reader first sees10,000 correct rows, then fails during its sleeping
statement with40001 and a recovery conflict about removed row versions. confl_snapshot increases
by one; other captured conflict counters do not change. Primary VACUUM leaves5,000 live and zero
dead versions. After replay, fresh source/standby queries agree on all odd IDs, sum25,000,000.

With feedback on, the observed slot xmin protects the reader before deletion. VACUUM leaves5,000
live and5,000 dead-but-not-removable versions. Fresh primary and standby snapshots see5,000
survivors, while the same old transaction still sees all10,000 rows before normal COMMIT, with no
new conflict. Releasing reader/feedback clears the actual horizon; VACUUM removes all dead
versions and increases free space. Both fresh results remain correct.

The variation deletes only multiples of4:7,500 survivors/sum37,500,000,2,500 retained versions while
feedback protects the old reader, then zero dead versions after release. Both old snapshots still
contain10,000 rows/sum50,005,000. Exact bytes, XIDs and cancellation timing vary; the delay setting
is not an exact per-query runtime. All owned processes stop and the slot is removed.`,
  systemsLens: code`
A distributed reader can extend the primary's garbage-collection horizon. Feedback trades this
cleanup conflict for retained versions, and observing the horizon plus physical reclamation exposes
that cost directly. It does not prevent every kind of recovery conflict or make an unlimited old
snapshot free. Treat cancellation as a reason to restart the entire read transaction under a fresh
snapshot, and budget retained space when reader survival is the chosen policy.`,
  challenge: code`
Change only deletion density using pgcoach hint2: delete multiples of4 instead of every even ID.
Predict the surviving result, retained-version count and final free-space change under both
feedback policies. Choose a policy for an interactive replica versus long analytics reads, including
retry behavior, permitted retained space and evidence that a reader's horizon has been released.`,
};
