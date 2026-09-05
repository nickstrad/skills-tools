import { code, type Draft } from "../../../src/types.ts";
import { OWNED_REPLICATION_PY } from "./owned-replication.ts";

function slotExperiment(invalidate: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_REPLICATION_PY +
    `\ninvalidate = ${invalidate ? "True" : "False"}\n` + code`
def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def lsn(value):
    high,low=value.split('/')
    return (int(high,16)<<32)+int(low,16)

def slot():
    return json.loads(sql("select row_to_json(s) from (select slot_name,slot_type,active,restart_lsn,wal_status,"
        "safe_wal_size,pg_wal_lsn_diff(pg_current_wal_insert_lsn(),restart_lsn) as required_distance "
        "from pg_replication_slots where slot_name='owned_standby') s"))

def files():
    return json.loads(sql("select json_build_object('count',count(*),'bytes',sum(size),'names',json_agg(name order by name)) "
        "from pg_ls_waldir() where name ~ '^[0-9A-F]{24}$'"))

def outcome(query):
    return json.loads(query("select json_build_object('rows',count(*),'ids',count(distinct id),"
        "'first',min(id),'last',max(id),'sum',sum(id),'payload_ok',bool_and(pad=repeat('s',1000))) from slot_receipts"))

def restart_standby():
    server('pg_ctl','-D',standby,'-l',standby_log,'-w','-t','20','start',timeout=25)
    assert replica_sql('show data_directory')==str(standby)
    wait_for('streaming reconnected',lambda: len(sender())==1 and sender()[0]['state']=='streaming')

try:
    start()
    sql('create table slot_receipts(id int primary key,pad text not null)')
    sql("insert into slot_receipts values(0,repeat('s',1000))")
    clone_standby()
    baseline=sql("select pg_create_restore_point('slot_baseline')")
    wait_replay(baseline)
    wait_for('slot has consumed baseline',lambda: slot()['restart_lsn'] is not None and lsn(slot()['restart_lsn'])>=lsn(baseline))
    assert outcome(replica_sql)==dict(rows=1,ids=1,first=0,last=0,sum=0,payload_ok=True)
    server('pg_ctl','-D',standby,'-m','fast','-w','-t','20','stop',timeout=25)
    wait_for('owned consumer disconnected',lambda: not slot()['active'] and sender()==[])
    # Keep the retention promise unlimited for the identical workload in both paths.
    sql("alter system set max_wal_size='8MB'")
    sql("alter system set max_slot_wal_keep_size='-1'")
    sql("alter system set wal_keep_size='0'")
    sql('select pg_reload_conf()')
    wait_for('private retention settings',lambda: sql('show max_wal_size')=='8MB'
        and sql('show max_slot_wal_keep_size')=='-1' and sql('show wal_keep_size')=='0')
    anchor=slot()
    anchor_file=sql("select pg_walfile_name('"+anchor['restart_lsn']+"'::pg_lsn)")
    before_files=files()
    for batch in range(16):
        first=batch*2000+1
        sql("insert into slot_receipts select g,repeat('s',1000) from generate_series("+str(first)+","+str(first+1999)+") g")
    work_bound=sql("select pg_create_restore_point('offline_receipts_complete')")
    sql('checkpoint')
    sql('checkpoint')
    retained=slot()
    retained_files=files()
    assert retained['restart_lsn']==anchor['restart_lsn'] and not retained['active']
    assert retained['wal_status']=='extended' and retained['safe_wal_size'] is None
    assert retained['required_distance']>8*1024*1024 and retained_files['bytes']>8*1024*1024
    assert anchor_file in retained_files['names']
    expected=dict(rows=32001,ids=32001,first=0,last=32000,sum=32000*32001//2,payload_ok=True)
    assert outcome(sql)==expected
    emit('offline_retention',dict(anchor=anchor,anchor_file=anchor_file,before_files=before_files,
        slot=retained,files=retained_files,source=outcome(sql),work_bound=work_bound))
    if invalidate:
        log_offset=log.stat().st_size
        sql("alter system set max_slot_wal_keep_size='4MB'")
        sql('select pg_reload_conf()')
        wait_for('finite slot retention',lambda: sql('show max_slot_wal_keep_size')=='4MB')
        sql('checkpoint')
        sql('checkpoint')
        wait_for('owned slot lost',lambda: slot()['wal_status']=='lost')
        invalidated=slot()
        assert invalidated['restart_lsn'] is None and invalidated['safe_wal_size'] is None
        assert anchor_file not in files()['names']
        invalidation_log=log.read_text()[log_offset:]
        assert 'invalidating obsolete replication slot' in invalidation_log and 'owned_standby' in invalidation_log
        # Actually attempt the old consumer. A running postmaster is not successful catch-up.
        old_log_offset=standby_log.stat().st_size
        attempt=subprocess.run(prefix+[str(bindir/'pg_ctl'),'-D',str(standby),'-l',str(standby_log),
            '-w','-t','5','start'],env=env,text=True,capture_output=True,timeout=10)
        def rejection():
            value=standby_log.read_text()[old_log_offset:]
            return value if ('invalidated' in value or 'already been removed' in value) else False
        rejected=wait_for('old consumer rejected for missing history',rejection,10)
        assert slot()['wal_status']=='lost'
        stale=None
        if attempt.returncode==0:
            stale=outcome(replica_sql)
            assert stale==dict(rows=1,ids=1,first=0,last=0,sum=0,payload_ok=True)
            assert lsn(replica_sql('select pg_last_wal_replay_lsn()'))<lsn(work_bound)
        emit('lost_history_rejected',dict(slot=invalidated,source_log=invalidation_log,consumer_log=rejected,
            startup_returncode=attempt.returncode,startup_output=attempt.stdout+attempt.stderr,
            stale_consumer=stale,files=files()))
        if (standby/'postmaster.pid').exists():
            server('pg_ctl','-D',standby,'-m','fast','-w','-t','20','stop',timeout=25)
        wait_for('invalidated consumer inactive',lambda: not slot()['active'])
        standby.rename(root/'invalidated-standby')
        standby_log.rename(root/'invalidated-standby.log')
        (root/'standby-basebackup.log').rename(root/'original-basebackup.log')
        sql("select pg_drop_replication_slot('owned_standby')")
        sql('drop role owned_repl')
        # A new full verified backup replaces missing history; preserve the failed copy above.
        sql("alter system set max_slot_wal_keep_size='-1'")
        sql('select pg_reload_conf()')
        wait_for('rebuild retention restored',lambda: sql('show max_slot_wal_keep_size')=='-1')
        clone_standby()
    else:
        restart_standby()
    wait_replay(work_bound)
    assert outcome(sql)==outcome(replica_sql)==expected
    caught_up=slot()
    wait_for('slot restart position advances beyond old anchor',lambda: slot()['restart_lsn'] is not None
        and lsn(slot()['restart_lsn'])>lsn(anchor['restart_lsn']))
    # A post-reconnect/post-backup receipt proves this is a live stream, not only a readable copy.
    sql("insert into slot_receipts values(32001,repeat('s',1000))")
    final_bound=sql("select pg_create_restore_point('after_consumer_return')")
    wait_replay(final_bound)
    wait_for('slot acknowledges final bound',lambda: slot()['restart_lsn'] is not None
        and lsn(slot()['restart_lsn'])>=lsn(final_bound))
    expected=dict(rows=32002,ids=32002,first=0,last=32001,sum=32001*32002//2,payload_ok=True)
    assert outcome(sql)==outcome(replica_sql)==expected
    sql('checkpoint')
    sql('checkpoint')
    reclaimed_files=files()
    assert anchor_file not in reclaimed_files['names']
    assert reclaimed_files['bytes']<retained_files['bytes']
    assert slot()['wal_status']=='reserved' and slot()['active']
    emit('consumer_returned_and_reclaimed',dict(rebuilt=invalidate,caught_up_slot=caught_up,slot=slot(),
        files=reclaimed_files,source=outcome(sql),standby=outcome(replica_sql)))
    print('PASS: offline consumer retained WAL beyond target; consumer returned with complete receipts and obsolete WAL reclaimed.',flush=True)
finally:
    stop_replication()
PY`;
}

export const SLOT_RETENTION_VARIATION = slotExperiment(true);
export const SLOT_RETENTION: Draft = {
  slug: "replication-slot-retains-wal",
  revision: 4,
  tags: ["replication-slots", "wal", "capacity", "streaming-replication", "observability"],
  title: "WAL retention: catch up the consumer or rebuild its lost history",
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 35,
  prerequisites: ["replication-lag-under-load", "wal-files-and-recycling"],
  overview: code`
Stop an owned standby after it has actually consumed a baseline receipt, then commit32,000 more
receipts while its physical slot keeps the needed WAL. Checkpoint and measure retention beyond a
small primary WAL target. Reconnect and prove complete replay plus reclamation; the variation
instead limits the slot, observes an actual failed consumer restart and rebuilds the copy before
proving that new post-backup work streams again.`,
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
  caution: code`
Run the complete shell script with Python3 and matching PostgreSQL16 binaries, including
pg_basebackup/pg_verifybackup; PGBIN may select the binary folder. It creates private source/standby
files and sockets, clears inherited PG/PGLAB settings and disables TCP. Root uses runuser as the
postgres OS owner. The fixed32,000-row workload bounds the trial; the unlimited slot is never left
running. Finally stops the owned standby, removes its inactive slot and stops source. Allow several
hundred MB and retain the printed stopped paths/logs. The variation preserves the failed copy under
invalidated-standby before taking another full backup; only these owned files, role and slot change.`,
  syntaxBreakdown: code`
### In plain terms

A physical slot tells the primary which WAL an attached consumer may still require. That retention
obligation persists when the consumer disconnects, so normal checkpoint recycling may not reclaim
those files. A finite retention policy can release the files by invalidating the consumer's slot;
without another source of the missing history, returning to service then requires a fresh copy.

### What you are learning

- **Retention anchor:** an inactive slot still protects the WAL at its restart position.
- **Soft target versus promise:** max_wal_size does not override an unlimited slot obligation.
- **Reconnection versus rebuild:** catch-up works with retained history; an invalidated slot needs an explicit recovery path.
- **End-to-end evidence:** complete receipts and a later streamed receipt prove more than server startup.

### Piece by piece

- **python3** includes the complete owned-replication helper. **PGBIN / pg_config --bindir** locates
  binaries. **tempfile.mkdtemp**, private sockets and cleared PG variables isolate ownership;
  root-only **runuser/os.chown** assigns server files to postgres.
- **initdb -D** names a new data directory; **-U postgres** names its administrator;
  **--auth-local=trust** permits connections through the protected socket directory;
  **--auth-host=reject** rejects host authentication; **--no-locale**, **--data-checksums** and
  **--wal-segsize=1** choose fixed locale, checksums and1MB segments. **listen_addresses=''**
  disables TCP. **pg_ctl -D ... -l ... -w -t20** identifies data/log files and bounds startup waiting;
  **-m fast stop** stops only the owned server and rolls back active work.
- **fsync/synchronous_commit/full_page_writes=on**, **wal_level=replica**, small buffers,
  **checkpoint_timeout=1h**, **autovacuum=off** and **wal_sender_timeout=5s** configure this private
  fixture. The helper initially uses **max_wal_size=128MB** while bootstrapping the copy.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, prints unaligned tuples only,
  stops on SQL errors and executes supplied commands. **PGCONNECT_TIMEOUT**, **statement_timeout**,
  **lock_timeout** and Python subprocess timeouts bound client/utility calls.
- **slot_receipts** has a unique integer request ID and non-null payload. ID0 is in the baseline
  backup. **generate_series** and **repeat('s',1000)** add IDs1–32,000 in16 separate2,000-row commits
  after the standby stops. The final ID32,001 commits after reconnection or rebuilt bootstrap.
- **clone_standby** creates a dedicated **LOGIN REPLICATION** role. **pg_basebackup -U** selects
  that role, **-D** chooses the copy, **-c fast** requests a checkpoint, **-X stream** includes WAL,
  **-R** writes recovery settings, **-C -S owned_standby** creates/names the physical slot and
  **--manifest-checksums=SHA256 -v** supplies checksums/diagnostics. **pg_verifybackup** verifies
  before configuration edits. **standby.signal/primary_conninfo/primary_slot_name** configure
  recovery; private socket, **hot_standby=on**, **archive_mode=off**, status interval1s and
  retry100ms configure the copy. Its backup and server logs are retained.
- **pg_create_restore_point** supplies an actual WAL marker's record end. **wait_replay** polls
  **pg_last_wal_replay_lsn >= marker** within this fixed history. First require baseline replay and
  primary slot acknowledgement, then stop the consumer and wait for **active=false** and no
  **pg_stat_replication** sender. An idle slot invented without an actual consumer is insufficient.
- **ALTER SYSTEM SET** changes only this primary; **pg_reload_conf** requests reload and **SHOW**
  polling checks effective values. **max_wal_size=8MB** is the private checkpoint/recycling target,
  **wal_keep_size=0** adds no separate retention floor, and **max_slot_wal_keep_size=-1** keeps the
  slot's promise unlimited during the fixed workload. No archive supplies another retention cause.
- **pg_replication_slots.restart_lsn** is the oldest WAL position the slot may still require.
  **active/slot_type** identify its disconnected physical consumer; **wal_status=extended** shows
  retained history beyond the normal target. **safe_wal_size** is NULL under unlimited retention;
  NULL does not mean zero bytes of remaining capacity. **pg_wal_lsn_diff** measures distance from
  current insertion position to the anchor, including intervening WAL beyond useful receipt bytes.
- **pg_walfile_name(restart_lsn)** identifies the segment protected at the anchor in this run.
  **pg_ls_waldir** lists actual files. A24-hex-digit regular expression selects segment filenames;
  **count/sum(size)/json_agg ORDER BY name** preserve count, bytes and the complete file inventory.
  Distance and directory size differ because files contain whole segments and recycled future space.
- Two explicit **CHECKPOINT** commands complete cleanup cycles. The disconnected anchor must stay
  fixed, its named segment must remain, status must be extended and segment bytes must exceed8MB.
  These are sampled retention observations; WAL also includes index, checkpoint and possible hint
  page records, so the measurement is not an exact per-receipt charge or a steady-state disk forecast.
- In the core, restarting the same standby must restore **state=streaming** and replay the work
  marker. The slot's restart position advances beyond its old anchor and complete receipt values
  agree before the final new receipt is written.
- The variation changes the return path by setting **max_slot_wal_keep_size=4MB**, reloading and
  checkpointing the already oversized inactive slot. Require **wal_status=lost**, NULL restart_lsn
  and safe_wal_size, disappearance of the original needed segment and a fresh primary invalidation
  log message. The cap is evaluated during checkpoint processing and is not a hard directory-byte
  ceiling. A lost slot's NULL safe_wal_size has a different meaning from the unlimited case.
- The driver actually starts the old standby with **pg_ctl -t5** and inspects newly appended logs
  for invalidated-slot or removed-WAL rejection. Startup can succeed while replication cannot.
  If the old copy is queryable, it must still contain only receipt0 and replay must remain behind
  the work marker. A nonready startup cannot be treated as a successful catch-up either.
- After stopping that failed attempt and observing the inactive slot, **Path.rename** preserves
  its data/logs under **invalidated-standby** and preserves the original backup log. Only the owned
  lost slot and dedicated role are dropped. Restoring unlimited retention and rerunning the full
  clone helper creates a new slot, role and verified backup of all current receipts. This fixture
  has no alternate WAL archive; it does not claim that every missing-history incident universally
  requires this specific rebuild method.
- **count**, **count(distinct id)**, **min/max**, **sum** and **bool_and** jointly verify every ID
  and payload: the number of distinct integers fills the entire asserted interval, and each payload
  matches. Python **json.loads/dumps** and SQL **json_build_object/row_to_json** retain structured
  evidence. ID32,001 plus a new replay marker proves live streaming after the consumer returns,
  including after a fresh backup rather than accepting only backup contents.
- After final slot acknowledgement, two checkpoints remove/recycle old WAL. The original anchor
  filename must disappear, actual segment bytes decrease and the active slot becomes reserved.
  Recycled/preallocated segments can remain; no assertion requires an empty pg_wal directory.
- Finally stops standby, polls **pg_replication_slots.active=false**, uses
  **pg_drop_replication_slot** only on its owned slot, verifies absence and stops the source.`,
  code: slotExperiment(false),
  expectedResult: code`
The baseline copy contains only ID0. After the real consumer stops,32,000 committed receipts leave
the slot inactive at its saved restart LSN. Following checkpoints, wal_status is extended, the
anchor segment is still present and actual segment bytes exceed the8MB target; safe_wal_size is
NULL under unlimited retention. Source has32,001 distinct IDs0–32,000, sum512,016,000 and every
correct1,000-character payload.

Core reconnection catches up all receipts and advances the slot. Variation's4MB cap instead makes
the slot lost with NULL restart_lsn/safe_wal_size, removes the needed segment and generates an
actual invalidation message. The old consumer logs missing-history rejection; when startup returns
ready, its query still sees only ID0. Preserving that failed copy and taking a fresh verified backup
restores the consumer. In both paths a later streamed ID32,001 yields32,002 exact rows,
sum512,048,001. Final checkpoints remove the old anchor filename and reduce segment bytes while
slot status returns to reserved. Actual bytes/LSNs and log timing vary. All servers stop and the
owned slot is removed.`,
  systemsLens: code`
A consumer's restart position is a resource obligation even while its connection is absent.
Retention policy chooses how long to honor that obligation; invalidation trades storage pressure
for recovery work and unavailable freshness. Verify the complete consumer state after catch-up or
rebuild, then prove new work still arrives. Slot status and postmaster readiness alone cannot
establish application readiness.`,
  challenge: code`
Use pgcoach hint2 to cap the oversized disconnected slot at4MB before returning the consumer.
Predict which slot fields and files change, inspect the actual failed restart, then verify the
supplied rebuild and later streamed receipt. Choose a retention budget and reinitialization policy
for a replica whose offline duration is uncertain; explain what measurements beyond this bounded
trial would support that budget.`,
};
