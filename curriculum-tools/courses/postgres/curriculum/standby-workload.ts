import { code, type Draft } from "../../../src/types.ts";
import { OWNED_REPLICATION_PY } from "./owned-replication.ts";

function standbyExperiment(reconnect: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_REPLICATION_PY +
    `\nreconnect = ${reconnect ? "True" : "False"}\n` + code`
def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def rows(query):
    return json.loads(query("select json_agg(r) from (select id,amount,note from stream_receipts order by id) r"))

try:
    start()
    sql('create table stream_receipts(id int primary key,amount int not null check(amount>0),note text not null)')
    sql("insert into stream_receipts values(0,1,'in backup')")
    clone_standby()
    source_id=sql('select system_identifier from pg_control_system()')
    assert replica_sql('select system_identifier from pg_control_system()')==source_id
    assert sql('select pg_is_in_recovery()')=='f'
    assert replica_sql('select pg_is_in_recovery()')=='t'
    assert replica_sql('show archive_mode')=='off' and replica_sql('show hot_standby')=='on'
    link_sender,link_receiver=sender()[0],receiver()[0]
    assert link_sender['usename']=='owned_repl' and link_sender['sync_state']=='async'
    assert link_receiver['sender_host']==str(sock) and link_receiver['sender_port']==6543
    assert link_receiver['slot_name']=='owned_standby' and link_receiver['received_tli']==1
    expected=[dict(id=0,amount=1,note='in backup')]
    assert rows(replica_sql)==expected
    sql("insert into stream_receipts values(1,10,'streamed after backup')")
    committed_bound=sql('select pg_current_wal_insert_lsn()')
    wait_replay(committed_bound)
    expected.append(dict(id=1,amount=10,note='streamed after backup'))
    assert rows(sql)==rows(replica_sql)==expected
    # This fresh direct connection attempts an actual standby write; classify SQLSTATE precisely.
    failed=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
        '-c',"insert into stream_receipts values(99,99,'forbidden standby write')"],env=replica_env,
        text=True,capture_output=True,timeout=10)
    (root/'standby-write-error.log').write_text(failed.stdout+failed.stderr)
    assert failed.returncode!=0 and '25006' in failed.stderr and 'read-only transaction' in failed.stderr
    assert rows(sql)==rows(replica_sql)==expected
    core_log=standby_log.read_text()
    for marker in ('entering standby mode','consistent recovery state reached','ready to accept read-only connections',
                   'started streaming WAL from primary'):
        assert marker in core_log, 'Missing actual standby evidence: '+marker
    emit('streaming_ready',dict(system_identifier=source_id,source_directory=str(data),standby_directory=str(standby),
        source_recovery=False,standby_recovery=True,sender=sender(),receiver=receiver(),committed_bound=committed_bound,
        outcome=expected,standby_write_sqlstate='25006'))
    if reconnect:
        original_pid=receiver()[0]['pid']
        offset=standby_log.stat().st_size
        import signal
        os.kill(original_pid,signal.SIGTERM)
        sql("insert into stream_receipts values(2,20,'after receiver restart')")
        new_bound=sql('select pg_current_wal_insert_lsn()')
        wait_for('a replacement streaming receiver',lambda:
            len(receiver())==1 and receiver()[0]['pid']!=original_pid and receiver()[0]['status']=='streaming')
        wait_replay(new_bound)
        expected.append(dict(id=2,amount=20,note='after receiver restart'))
        assert rows(sql)==rows(replica_sql)==expected
        fresh=standby_log.read_bytes()[offset:].decode()
        assert 'started streaming WAL from primary' in fresh
        (root/'receiver-reconnect.log').write_text(fresh)
        emit('receiver_reconnected',dict(old_pid=original_pid,new_receiver=receiver(),new_bound=new_bound,outcome=expected))
    assert replica_sql('select pg_is_in_recovery()')=='t' and sql('select pg_is_in_recovery()')=='f'
    print('PASS: actual base backup and streaming, role/link/identity checks, complete receipts and rejected standby write.',flush=True)
finally:
    stop_replication()
PY`;
}

export const STANDBY_VARIATION = standbyExperiment(true);
export const STANDBY_WORKLOAD: Draft = {
  slug: "build-a-streaming-standby",
  revision: 4,
  tags: ["streaming-replication", "hot-standby", "backup", "replicated-log"],
  title: "Build and verify an owned physical streaming standby",
  difficulty: "intermediate",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 25,
  prerequisites: ["base-backup"],
  overview: code`
Create an owned primary and a real physical standby from a verified base backup. Identify the
sender/receiver link, then follow a committed post-backup receipt through replay and an independent
standby query. Actually reject a standby write. The variation replaces the receiver process and
verifies reconnection plus a later receipt, without treating reconnection as leader election.`,
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".`,
  caution: code`
Use Python3 and matching PostgreSQL16 server tools, pg_basebackup and pg_verifybackup; PGBIN may
select their folder. The script creates its own /tmp/pg-owned-* primary, standby and sockets with
TCP disabled. Existing PG/PGLAB settings are ignored. Root uses runuser as the postgres OS owner.
The variation terminates only the receiver PID queried from this owned standby. Cleanup stops the
standby, removes its inactive owned slot and stops the source. Retained paths contain stopped
clusters and logs; allow a few hundred MB. Two local processes do not test independent-host failure.`,
  syntaxBreakdown: code`
### In plain terms

A physical standby starts from copied files and keeps applying the primary's WAL. A streaming
connection alone does not prove a particular committed row is readable, so we require a replay
boundary and the complete expected result. Being in recovery also restricts the standby to reads.

### What you are learning

- **Bootstrap plus streaming:** distinguish data in the base backup from a later replicated receipt.
- **Replication roles:** a source sender, standby receiver and startup replay process have separate work.
- **Readiness evidence:** role, identity, connection, replay position and actual rows answer different questions.
- **Reconnection:** replacing a receiver can resume transport without changing writer authority.

### Piece by piece

- **python3** runs the supplied owned-topology helper and experiment. **PGBIN** or **pg_config --bindir**
  selects binaries. **tempfile.mkdtemp** and private sockets isolate paths; root uses
  **runuser -u ... -- / os.chown** while other users run directly.
- **initdb -D ... -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** selects data directory and superuser, confines local trust behind the private
  directory, rejects host authentication, fixes locale and enables checksums/1MB segments.
  **listen_addresses=''** disables TCP. **shared_buffers=16MB**, **max_connections=10**,
  **max_wal_size=128MB**, **checkpoint_timeout=1h** and **autovacuum=off** bound this fixture.
- **fsync**, **synchronous_commit** and **full_page_writes** remain on; **wal_level=replica**
  permits physical streaming. **wal_sender_timeout=5s** bounds a sender's unresponsive connection.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, returns unaligned tuples and fails
  on SQL errors. Cleared inherited PG variables, **PGCONNECT_TIMEOUT**, **statement_timeout** and
  **lock_timeout** isolate and bound SQL. Standby queries use its explicit **PGHOST** socket.
- **CREATE TABLE** establishes primary-key, positive-amount and non-null receipt constraints.
  Receipt0 exists before the backup; receipt1 is committed only after streaming starts. Ordered
  **json_agg** returns every identity, amount and note for independent source/standby equality.
- **CREATE ROLE owned_repl LOGIN REPLICATION** creates the dedicated replication connection role.
  The fresh initdb HBA allows local replication through the protected socket. It is not an
  application superuser; **pg_stat_replication.usename** verifies the actual connection identity.
- **pg_basebackup -D ... -U owned_repl -c fast -X stream -R -C -S owned_standby
  --manifest-checksums=SHA256 -v** copies the source and required WAL, writes standby.signal and
  connection settings, creates/names a persistent physical slot, enables manifest checksums and
  records verbose output. **pg_verifybackup** verifies this copy before configuration changes.
- **postgresql.auto.conf** already contains **primary_conninfo/primary_slot_name** from **-R**.
  The helper appends the private standby socket, **cluster_name=owned_standby**, **archive_mode=off**,
  **hot_standby=on**, **wal_receiver_status_interval=1s** and **wal_retrieve_retry_interval=100ms**.
  The first controls periodic feedback; the second bounds retry delay for this lab. Keeping the
  generated source connection avoids accidentally pointing the copy at itself.
- **pg_ctl -D ... -l ... -w -t20 start** bounds startup and saves separate source/standby logs;
  **SHOW data_directory** verifies the answering copy. **pg_is_in_recovery** is false on the source
  and true on the hot standby. **pg_control_system.system_identifier** must match because the
  standby is a physical copy; matching identity alone does not prove current data or authority.
- **pg_stat_replication** reports the owned application's sender PID, user, state, sync_state,
  sent/write/flush/replay positions and backend_xmin. **pg_stat_wal_receiver** reports receiver PID,
  streaming status, source socket/port, slot, received timeline and written/flushed positions.
  Fresh connections and bounded polling require one streaming row at each end.
- **pg_current_wal_insert_lsn** is sampled after receipt COMMIT. It is an upper bound containing
  that commit, not an exact per-request charge. **pg_last_wal_replay_lsn >= bound** gates the
  subsequent fresh standby query within this fixed source history; complete rows still must match.
- The separate standby INSERT uses **VERBOSITY=verbose** so the driver can require SQLSTATE
  **25006** plus the read-only transaction error. Both servers are reread afterward to prove
  receipt99 was not added. An arbitrary connection or syntax error is not accepted as the result.
- The variation sends **os.kill(pid, signal.SIGTERM)** to the actual owned
  **pg_stat_wal_receiver.pid**,
  terminating that auxiliary process under the same OS owner. It commits receipt2 on the source and polls for a different streaming receiver PID. A fresh log
  offset must contain a new streaming start; the new commit's replay bound and complete rows pass.
  The experiment does not require a particular stale-read window during this brief reconnection.
- Fresh logs must include standby mode, consistent recovery, read-only readiness and streaming.
  **json.loads/dumps** retain role/link/row observations. **stop_replication** stops the standby,
  polls **pg_replication_slots.active=false**, calls **pg_drop_replication_slot** for only the owned
  slot, verifies its absence and stops the source in finally. No downstream lesson depends on a
  leftover running server; each builds its own topology.`,
  code: standbyExperiment(false),
  expectedResult: code`
The verified backup contains receipt0. Actual sender and receiver rows report streaming, the
source socket/port, owned_repl user and owned_standby slot. The source is out of recovery; the
standby remains in recovery with read-only queries enabled. Both retain the same system identifier.

After replay reaches the post-COMMIT bound, both queries return receipt0/amount1/note in backup and
receipt1/amount10/note streamed after backup. A real standby INSERT fails with SQLSTATE25006 and
read-only transaction text; neither server has receipt99. The variation replaces the receiver PID,
requires a fresh streaming log line and verifies receipt2/amount20/note after receiver restart.
No promotion occurs. Exact PIDs, LSNs and timing vary.

PASS follows link/identity/role/domain/error assertions. The standby stops, its physical slot is
removed after becoming inactive, and the source stops. The printed owned directory retains evidence.
Replication here proves local transport and replay, not automatic election, fencing or host resilience.`,
  systemsLens: code`
A replicated log needs an initial state, continued delivery, replay and application verification.
Transport reconnection solves only one of those responsibilities. Asynchronous replication does not
wait for each commit to become readable on the follower, and the existence of a hot standby does not
choose a new leader or stop an old writer. The next experiments separate those boundaries explicitly.`,
  challenge: code`
Terminate the owned receiver, commit one additional receipt and observe a different streaming PID
plus complete caught-up rows using the pgcoach hint2 variation. Identify which evidence establishes
reconnection and which establishes application catch-up; explain what source unavailability would
require that this receiver-only failure did not exercise.`,
};
