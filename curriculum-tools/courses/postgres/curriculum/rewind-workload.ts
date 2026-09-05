import { code, type Draft } from "../../../src/types.ts";
import { OWNED_REPLICATION_PY } from "./owned-replication.ts";

function rewindExperiment(oldWrites: number): string {
  return "python3 - <<'PY'\n" + OWNED_REPLICATION_PY + `\nold_writes = ${oldWrites}\n` + code`
import hashlib, tarfile
acknowledged=[]
promoted=False

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def rows(query):
    return json.loads(query("select coalesce(json_agg(r order by id),'[]') from rewind_receipts r"))

def write(target,id,note):
    result=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',
        "insert into rewind_receipts values("+str(id)+",'"+note+"') returning row_to_json(rewind_receipts)"],
        env=dict(target,PGUSER='app_writer'),text=True,capture_output=True,timeout=10)
    assert result.returncode==0,result.stderr
    row=json.loads(next(x for x in result.stdout.splitlines() if x.startswith('{')))
    assert row==dict(id=id,note=note)
    acknowledged.append(row)

def identity(query):
    return json.loads(query("select json_build_object('system',system_identifier::text,'recovery',pg_is_in_recovery(),"
        "'timeline',timeline_id,'directory',current_setting('data_directory')) from pg_control_system(),pg_control_checkpoint()"))

def new_slot():
    return json.loads(replica_sql("select row_to_json(s) from (select slot_name,active,restart_lsn,wal_status "
        "from pg_replication_slots where slot_name='owned_rejoined') s"))

def new_sender():
    return json.loads(replica_sql("select coalesce(json_agg(s),'[]') from (select application_name,usename,state,"
        "sent_lsn,flush_lsn,replay_lsn from pg_stat_replication where application_name='owned_rejoined') s"))

def target_receiver():
    return json.loads(sql("select coalesce(json_agg(s),'[]') from (select status,sender_host,sender_port,slot_name,"
        "received_tli from pg_stat_wal_receiver) s"))

try:
    with (data/'postgresql.conf').open('a') as config:
        config.write("\nwal_keep_size='32MB'\n")
    start()
    assert sql('show data_checksums')=='on' and sql('show full_page_writes')=='on'
    assert sql('show wal_keep_size')=='32MB'
    sql('create table rewind_receipts(id int primary key,note text not null)')
    sql('create role app_writer login')
    sql('grant select,insert on rewind_receipts to app_writer')
    write(env,0,'common receipt')
    clone_standby()
    wait_replay(sql("select pg_create_restore_point('rewind_common')"))
    replica_sql("alter system set primary_conninfo=''")
    replica_sql('select pg_reload_conf()')
    wait_for('transport disconnected',lambda: sender()==[] and receiver()==[])
    server('pg_ctl','-D',standby,'-w','-t','20','promote',timeout=25)
    wait_for('new source promoted',lambda: replica_sql('select pg_is_in_recovery()')=='f')
    promoted=True
    replica_sql('checkpoint')
    for id in range(1,old_writes+1):
        write(env,id,'old branch acknowledged '+str(id))
    write(replica_env,100,'chosen branch acknowledged')
    old_rows=rows(sql)
    chosen_rows=rows(replica_sql)
    old_identity=identity(sql)
    chosen_identity=identity(replica_sql)
    assert old_identity['system']==chosen_identity['system']
    assert old_identity['timeline']==1 and chosen_identity['timeline']==2
    discarded=[dict(id=id,note='old branch acknowledged '+str(id)) for id in range(1,old_writes+1)]
    assert old_rows==[dict(id=0,note='common receipt')]+discarded
    assert chosen_rows==[dict(id=0,note='common receipt'),dict(id=100,note='chosen branch acknowledged')]
    history=(standby/'pg_wal'/'00000002.history').read_text()
    emit('before_history_choice',dict(acknowledged=acknowledged,old=old_rows,chosen=chosen_rows,
        old_identity=old_identity,chosen_identity=chosen_identity,history=history,
        discarded_by_this_choice=discarded))
    # Explicitly choose timeline2; rewind will not merge or preserve the old branch's acknowledgements.
    sql('alter role app_writer nologin')
    assert sql("select count(*) from pg_stat_activity where usename='app_writer'")=='0'
    wait_for('old physical slot inactive',lambda: sql("select not active from pg_replication_slots where slot_name='owned_standby'")=='t')
    sql("select pg_drop_replication_slot('owned_standby')")
    stop()
    assert not (data/'postmaster.pid').exists()
    probe=subprocess.run([str(bindir/'psql'),'-X','-At','-c',"insert into rewind_receipts values(90,'fenced probe')"],
        env=dict(env,PGUSER='app_writer'),text=True,capture_output=True,timeout=5)
    assert probe.returncode!=0 and 'connection to server' in probe.stderr
    control=server('pg_controldata','-D',data)
    assert 'shut down' in control
    (root/'target-before-rewind.control').write_text(control)
    # Preserve a cold physical image plus independently verified per-file hashes before rewriting target files.
    before_hashes={str(p.relative_to(data)):hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(data.rglob('*')) if p.is_file()}
    archive=root/'old-primary-before-rewind.tar.gz'
    with tarfile.open(archive,'w:gz') as saved:
        saved.add(data,arcname='data')
    with tarfile.open(archive,'r:gz') as saved:
        archived_hashes={str(pathlib.PurePosixPath(m.name).relative_to('data')):
            hashlib.sha256(saved.extractfile(m).read()).hexdigest() for m in saved.getmembers() if m.isfile()}
    assert archived_hashes==before_hashes
    (root/'target-before-rewind.sha256.json').write_text(json.dumps(before_hashes,indent=2))
    emit('target_fenced_and_preserved',dict(stopped_endpoint_error=probe.stderr,archive=str(archive),
        archive_bytes=archive.stat().st_size,verified_files=len(before_hashes),chosen_authority=chosen_identity))
    replica_sql("select pg_create_physical_replication_slot('owned_rejoined',true)")
    connection='host='+str(standby_sock)+' port=6543 user=postgres dbname=postgres'
    args=prefix+[str(bindir/'pg_rewind'),'--target-pgdata='+str(data),'--source-server='+connection,'-P']
    dry=subprocess.run(args+['--dry-run'],env=env,text=True,capture_output=True,timeout=60)
    dry_log=dry.stdout+dry.stderr
    (root/'rewind-dry-run.log').write_text(dry_log)
    assert dry.returncode==0 and 'servers diverged' in dry_log and 'rewinding from last common checkpoint' in dry_log,dry_log
    after_dry={str(p.relative_to(data)):hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(data.rglob('*')) if p.is_file()}
    assert after_dry==before_hashes
    actual=subprocess.run(args+['-R'],env=env,text=True,capture_output=True,timeout=60)
    actual_log=actual.stdout+actual.stderr
    (root/'rewind-actual.log').write_text(actual_log)
    assert actual.returncode==0 and 'Done!' in actual_log and 'servers diverged' in actual_log,actual_log
    assert (data/'standby.signal').is_file()
    copied_config=(data/'postgresql.auto.conf').read_text()
    (root/'rewind-copied.auto.conf').write_text(copied_config)
    # Source config was copied. Append explicit target endpoint and a dedicated replication connection.
    with (data/'postgresql.auto.conf').open('a') as config:
        config.write("\nunix_socket_directories='"+str(sock)+"'\ncluster_name='owned_rejoined'\n"
            "primary_conninfo='host="+str(standby_sock)+" port=6543 user=owned_repl application_name=owned_rejoined'\n"
            "primary_slot_name='owned_rejoined'\nrecovery_target_timeline='2'\narchive_mode=off\nhot_standby=on\n")
    (root/'rewind-final.auto.conf').write_text((data/'postgresql.auto.conf').read_text())
    emit('rewind_executed',dict(dry_run=dry_log,actual=actual_log,target=str(data),source=str(standby),
        preserved_image=str(archive),standby_signal=True))
    start()
    assert sql('select pg_is_in_recovery()')=='t'
    assert identity(sql)['system']==chosen_identity['system']
    wait_for('rewound target streams timeline2',lambda: len(target_receiver())==1
        and target_receiver()[0]['received_tli']==2 and len(new_sender())==1 and new_sender()[0]['state']=='streaming')
    assert target_receiver()[0]['slot_name']=='owned_rejoined'
    assert target_receiver()[0]['sender_host']==str(standby_sock)
    assert new_sender()[0]['usename']=='owned_repl'
    bound=replica_sql("select pg_create_restore_point('rewound_target_ready')")
    wait_for('target replay reaches chosen marker',lambda: sql("select pg_last_wal_replay_lsn()>='"+bound+"'::pg_lsn")=='t')
    assert rows(sql)==rows(replica_sql)==chosen_rows
    readonly=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',
        "insert into rewind_receipts values(91,'old endpoint write probe')"],
        env=dict(env,PGUSER='app_writer'),text=True,capture_output=True,timeout=5)
    assert readonly.returncode!=0 and '25006' in readonly.stderr and 'read-only' in readonly.stderr,readonly.stderr
    write(replica_env,200,'streamed after rewind')
    bound=replica_sql("select pg_create_restore_point('post_rewind_receipt')")
    wait_for('new receipt replays',lambda: sql("select pg_last_wal_replay_lsn()>='"+bound+"'::pg_lsn")=='t')
    final=chosen_rows+[dict(id=200,note='streamed after rewind')]
    assert rows(sql)==rows(replica_sql)==final
    assert all(row not in final for row in discarded)
    assert (root/'before_history_choice.json').is_file() and archive.is_file()
    emit('rejoined_chosen_history',dict(source=rows(replica_sql),target=rows(sql),target_identity=identity(sql),receiver=target_receiver(),
        sender=new_sender(),slot=new_slot(),read_only_error=readonly.stderr,discarded_acknowledgements=discarded,
        preserved_old_inventory=old_rows,all_client_acknowledgements=acknowledged))
    print('PASS: actual rewind follows the chosen history, preserves old-branch evidence, rejects target writes and streams a new receipt.',flush=True)
finally:
    # Roles have swapped: stop the target before dropping its slot on the chosen source.
    if promoted:
        if (data/'postmaster.pid').exists() and sql('select pg_is_in_recovery()')=='f':
            sql("select pg_drop_replication_slot(slot_name) from pg_replication_slots "
                "where slot_name='owned_standby' and not active")
        stop()
        if (standby/'postmaster.pid').exists():
            wait_for('rejoin slot inactive',lambda: replica_sql("select not exists(select 1 from "
                "pg_replication_slots where slot_name='owned_rejoined' and active)")=='t')
            replica_sql("select pg_drop_replication_slot(slot_name) from pg_replication_slots "
                "where slot_name='owned_rejoined'")
            server('pg_ctl','-D',standby,'-m','fast','-w','-t','20','stop',timeout=25)
        print('Rewind target and chosen source stopped; owned slots removed; evidence retained at',root,flush=True)
    else:
        stop_replication()
PY`;
}

export const REWIND_VARIATION = rewindExperiment(3);
export const REWIND_WORKLOAD: Draft = {
  slug: "rewind-the-old-primary",
  revision: 4,
  tags: ["failover", "timelines", "recovery", "fencing", "split-brain"],
  title: "Rewind into a chosen history and account for discarded acknowledgements",
  difficulty: "advanced",
  safetyLevel: "dangerous",
  runIn: "shell",
  estimatedMinutes: 40,
  prerequisites: ["promote-the-standby"],
  overview: code`
Create related but divergent primary histories and acknowledge work on both. Select the promoted
history explicitly, fence and stop the old writer, and preserve its complete receipt inventory
plus a verified cold file archive before running pg_rewind. Inspect the dry run and actual rewrite,
repair copied endpoint settings, then prove the target follows the selected history read-only and
receives a new receipt. The variation adds three old-branch acknowledgements instead of one.`,
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
  caution: code`
Run the complete shell script with Python3 and matching PostgreSQL16 binaries, including pg_rewind,
pg_controldata, pg_basebackup and pg_verifybackup; PGBIN may select the binary folder. Only fresh
owned source/standby files and private sockets are used; inherited PG/PGLAB settings are ignored and
TCP is disabled. Root uses runuser as the postgres OS owner. The experiment deliberately forks
histories, then rewrites its stopped old-primary directory. It first preserves the acknowledged
rows and a per-file-hash-verified compressed cold archive. Finally stops both nodes and removes
owned slots, including on failure. Retain the printed evidence paths; allow a few hundred MB.

The chosen history omits real acknowledged old-branch work. Rewind does not reconcile those
application outcomes. The driver owns every writer and no supervisor restarts the old process;
this is a local controlled repair, not an external election or fencing service.`,
  syntaxBreakdown: code`
### In plain terms

Two related primaries can hold different committed work. Rewind makes one directory compatible
with a chosen source history so recovery can follow it again; it does not merge the two histories.
Save the old evidence first, then distinguish a successful file rewrite from a working read-only
standby with complete application data.

### What you are learning

- **Explicit history choice:** acknowledged old-branch work is classified before target bytes are overwritten.
- **Rewind prerequisites:** retained target WAL, checksums or hint logging, full-page writes and clean shutdown support repair.
- **Configuration repair:** source settings accompany data and must be corrected for the target endpoint.
- **Rejoin evidence:** actual streaming, read-only rejection and a later receipt prove operational recovery.

### Piece by piece

- **python3** includes the complete owned-replication helper. **PGBIN / pg_config --bindir** finds
  binaries. **tempfile.mkdtemp**, private sockets and cleared PG variables isolate files/connections;
  root-only **runuser/os.chown** assigns server ownership to postgres.
- **initdb -D** names new data; **-U postgres** names its administrator; **--auth-local=trust**
  permits access through the protected local socket directory; **--auth-host=reject** rejects host
  authentication; **--no-locale**, **--data-checksums** and **--wal-segsize=1** select fixed locale,
  checksums and1MB segments. **listen_addresses=''** disables TCP.
- **fsync/synchronous_commit/full_page_writes=on**, **wal_level=replica**, small buffers,
  **max_wal_size=128MB**, **checkpoint_timeout=1h**, **autovacuum=off** and
  **wal_sender_timeout=5s** configure the private fixture. **wal_keep_size=32MB** is appended before
  startup to retain target WAL back through this tiny divergence. **SHOW data_checksums** and
  **SHOW full_page_writes** verify the supported prerequisites before any branch work. Checksums
  were enabled at initialization; alternatively wal_log_hints must provide the required prior WAL
  evidence. Turning a prerequisite on after missing changes would not reconstruct that evidence.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, prints unaligned tuples only,
  stops on SQL errors and executes commands. **PGCONNECT_TIMEOUT**, **statement_timeout**,
  **lock_timeout** and Python subprocess timeouts bound calls. **VERBOSITY=verbose** exposes the
  read-only probe's SQLSTATE. Only expected failures are accepted by their actual error detail.
- **rewind_receipts** constrains unique request IDs and non-null notes. **app_writer LOGIN** has
  **SELECT, INSERT** privileges on that table; actual app connections use **PGUSER=app_writer**.
  **INSERT ... RETURNING row_to_json** captures each receipt, and the driver records acknowledgement
  only after the command succeeds. **json_agg ORDER BY id** preserves complete independent sets.
- **clone_standby** creates a **LOGIN REPLICATION** role. **pg_basebackup -U** selects it,
  **-D** names the copy, **-c fast** requests a checkpoint, **-X stream** includes WAL,
  **-R** writes recovery settings, **-C -S owned_standby** creates/names the physical slot and
  **--manifest-checksums=SHA256 -v** supplies checksums/diagnostics. **pg_verifybackup** verifies
  before config edits. **standby.signal/primary_conninfo/primary_slot_name** connect recovery;
  private socket, **hot_standby=on**, **archive_mode=off**, status interval1s and retry100ms configure
  the copy. Common receipt0 is already in its verified backup.
- **pg_create_restore_point** provides a real marker record end; **wait_replay** polls
  **pg_last_wal_replay_lsn >= marker** within the shared history before divergence. Clearing
  **primary_conninfo** with **ALTER SYSTEM** and reloading via **pg_reload_conf** disables transport;
  poll empty sender/receiver views before promotion instead of relying on a fixed sleep.
- **pg_ctl -D ... -w -t20 promote** requests bounded promotion. Poll **pg_is_in_recovery=false**
  and checkpoint the new source before comparing **pg_control_checkpoint.timeline_id**.
  **pg_control_system.system_identifier** matches across branches and
  **current_setting('data_directory')** identifies endpoints. The new **00000002.history** file
  records timeline1 ancestry; it does not choose authority on behalf of an application.
- The old primary acknowledges ID1 (IDs1–3 in the variation), while the promoted source acknowledges
  ID100. Independent queries retain old/common and chosen/common receipt sets, identities and every
  successful client acknowledgement in **before_history_choice.json**. Selecting timeline2 is an
  explicit fixture decision. The old-only IDs are listed as discarded by that choice before rewind.
- **ALTER ROLE app_writer NOLOGIN** prevents new old-primary app sessions; **pg_stat_activity**
  must show zero existing sessions because NOLOGIN does not terminate them. Drop its inactive
  original physical slot, then **pg_ctl -m fast -w -t20 stop** shuts the target down cleanly.
  Require its PID file absent and a direct old-endpoint write to fail connecting.
- **pg_controldata -D** reads the stopped target's control state; require shut down and retain
  the full output. Python **tarfile** saves a compressed cold directory archive outside the target.
  **hashlib.sha256** hashes every regular file, then reading each archive member verifies an
  identical file/path/hash map. This preserves physical evidence plus the independent row inventory;
  the archive is not presented as a tested full restore procedure.
- On the chosen source, **pg_create_physical_replication_slot('owned_rejoined',true)** immediately
  reserves WAL for the returning consumer. **--source-server** uses an owned administrative SQL
  connection for the file functions needed by pg_rewind; later streaming uses the dedicated
  replication role instead of retaining this administrator as the receiver user.
- **pg_rewind --target-pgdata=... --source-server=... -P --dry-run** identifies the stopped target,
  live chosen source and progress reporting. It must report actual divergence and a shared
  checkpoint. Rehashing all target regular files proves no target contents changed; dry-run output
  can print copy/progress/Done messages even though it did not write the target.
- A second actual **pg_rewind ... -P -R** rewrites the target and appends recovery configuration.
  **-R** creates standby.signal and primary_conninfo. No **--no-sync** shortcut is used. Rewind
  scans target WAL from the common checkpoint for changed blocks, copies required source files
  and sets up subsequent recovery; successful tool exit alone is not a consistency/rejoin check.
  Missing required target WAL would need an available archive or another rebuild path, neither
  of which is claimed as executed by this supplied retained-WAL experiment.
- Preserve **postgresql.auto.conf** as copied, then append only explicit owned target overrides:
  its original private socket, **cluster_name=owned_rejoined**, new source socket in
  **primary_conninfo**, dedicated **user=owned_repl/application_name=owned_rejoined**,
  **primary_slot_name=owned_rejoined**, **recovery_target_timeline='2'**, archive off and hot standby
  on. These override copied source/obsolete receiver settings. The pinned timeline deliberately
  follows this chosen history; a later topology change requires a new configuration decision.
- Start the target only after those settings and standby.signal exist. Require the original
  target data directory, same system identifier, **pg_is_in_recovery=true**,
  **pg_stat_wal_receiver.received_tli=2** with the correct source socket and slot, and a matching
  streaming sender using owned_repl on the chosen source. Control checkpoint timeline is retained
  as an observation and may lag active replay; received_tli establishes the streaming timeline.
- Replay a new source marker before requiring exact IDs0,100 on both nodes. Source catalogs were
  copied too, so the old NOLOGIN role change need not persist; the rejoined server's recovery role
  must actually reject an app INSERT with **25006/read-only**. Then source ID200 acknowledges and
  a later marker gates its arrival, yielding exact IDs0,100,200 on both nodes.
- The final report lists every discarded old acknowledgement alongside the surviving source/target
  result and preserved archive path. Python **json.loads/dumps** retains structured evidence. Probe
  rows90/91 must be absent. This is accounting for lost branch work, not application reconciliation.
- Cleanup accounts for swapped roles: stop the rewound target first, wait for its slot to become
  inactive on the chosen source, drop only **owned_rejoined**, then stop that source. If a failure
  occurs before promotion, use the original source/standby cleanup order instead.`,
  code: rewindExperiment(1),
  expectedResult: code`
Before choice, old history contains IDs0,1 and chosen history IDs0,100; both ID1 and ID100 were
acknowledged. They share a system identifier but use timelines1 and2. The stopped target's cold
archive verifies against every saved regular-file hash. Dry run identifies a real divergence/common
checkpoint and leaves those target hashes unchanged; the actual run reports Done and creates
standby.signal before restart.

After endpoint/receiver configuration repair, target is in recovery and streams timeline2 from the
chosen source through owned_rejoined. Both nodes contain exactly IDs0,100; old acknowledged ID1
has disappeared from the live target but remains in the saved inventory and cold image. An old
endpoint app INSERT fails25006/read-only. New source receipt200 then streams, and exact final
IDs0,100,200 agree on both nodes with correct notes and no probe rows. The variation acknowledges
three old-only IDs1–3 and explicitly accounts for all three discarded outcomes after the same
repair. Actual LSNs, file/copy sizes and timings vary; no speedup ratio is promised. All owned
servers stop and slots are removed.`,
  systemsLens: code`
Physical repair follows an explicitly chosen history; it cannot determine which independent
application acknowledgements should win or merge their effects. Preserve evidence before rewrite,
classify discarded work and verify new replication after recovery. Rewind may avoid copying
unchanged relation blocks, but data correctness and lost-work accounting matter before any copied-byte
or elapsed-time comparison.`,
  challenge: code`
Use pgcoach hint2 to acknowledge three old-branch writes instead of one before choosing timeline2.
Predict the exact discarded set and final target/source inventory. Explain what reconciliation
would be required if any discarded receipt represented a customer-visible obligation, and why
successful pg_rewind plus streaming does not resolve that business outcome.`,
};
