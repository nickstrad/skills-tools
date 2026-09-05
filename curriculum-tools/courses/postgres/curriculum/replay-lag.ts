import { code, type Draft } from "../../../src/types.ts";
import { OWNED_REPLICATION_PY } from "./owned-replication.ts";

function replayExperiment(rows: number): string {
  return "python3 - <<'PY'\n" + OWNED_REPLICATION_PY + `\nrequested_rows = ${rows}\n` + code`
def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def positions():
    return json.loads(replica_sql("select json_build_object('receive_lsn',pg_last_wal_receive_lsn(),"
        "'replay_lsn',pg_last_wal_replay_lsn(),'replay_state',pg_get_wal_replay_pause_state(),"
        "'last_xact_replay_timestamp',pg_last_xact_replay_timestamp(),"
        "'receive_minus_replay_bytes',pg_wal_lsn_diff(pg_last_wal_receive_lsn(),pg_last_wal_replay_lsn()))"))

def outcome(query):
    return json.loads(query("select json_build_object('rows',count(*),'distinct_ids',count(distinct id),"
        "'first',min(id),'last',max(id),'amount',sum(amount),"
        "'all_correct',bool_and(amount=case when id=0 then 1 else id end and pad=repeat('r',200))) from replay_receipts"))

def lsn(value):
    high,low=value.split('/')
    return (int(high,16)<<32)+int(low,16)

try:
    start()
    sql('create table replay_receipts(id int primary key,amount int not null check(amount>0),pad text not null)')
    sql("insert into replay_receipts values(0,1,repeat('r',200))")
    clone_standby()
    baseline_bound=sql('select pg_current_wal_insert_lsn()')
    wait_replay(baseline_bound)
    before=outcome(replica_sql)
    assert before==dict(rows=1,distinct_ids=1,first=0,last=0,amount=1,all_correct=True)
    replica_sql('select pg_wal_replay_pause()')
    wait_for('actual paused replay',lambda: replica_sql('select pg_get_wal_replay_pause_state()')=='paused')
    paused_at=positions()
    sql("insert into replay_receipts select g,g,repeat('r',200) from generate_series(1,"+str(requested_rows)+") g")
    bound=sql('select pg_current_wal_insert_lsn()')
    assert lsn(bound)>lsn(paused_at['replay_lsn'])
    # Observe durable receive separately from replay, then wait for sender-side feedback too.
    wait_for('standby flushed receive through committed bound',lambda:
        len(receiver())==1 and lsn(receiver()[0]['flushed_lsn'])>=lsn(bound))
    wait_for('sender has received flush acknowledgement',lambda:
        len(sender())==1 and sender()[0]['flush_lsn'] is not None and lsn(sender()[0]['flush_lsn'])>=lsn(bound))
    paused=positions()
    assert paused['replay_state']=='paused' and paused['replay_lsn']==paused_at['replay_lsn']
    assert lsn(paused['receive_lsn'])>=lsn(bound)>lsn(paused['replay_lsn'])
    assert paused['receive_minus_replay_bytes']>0
    stale=outcome(replica_sql)
    source=outcome(sql)
    expected=dict(rows=requested_rows+1,distinct_ids=requested_rows+1,first=0,last=requested_rows,
        amount=requested_rows*(requested_rows+1)//2+1,all_correct=True)
    assert stale==before and source==expected
    emit('received_but_not_applied',dict(requested_rows=requested_rows,commit_bound=bound,paused_at=paused_at,
        positions=paused,sender=sender(),receiver=receiver(),stale=stale,source=source))
    began=time.monotonic()
    replica_sql('select pg_wal_replay_resume()')
    wait_for('replay resumed',lambda: replica_sql('select pg_get_wal_replay_pause_state()')=='not paused')
    wait_replay(bound)
    applied=positions()
    final=outcome(replica_sql)
    assert final==expected==outcome(sql)
    assert lsn(applied['replay_lsn'])>=lsn(bound)
    feedback=json.loads(sql("select coalesce(json_agg(s),'[]') from (select sent_lsn,write_lsn,flush_lsn,replay_lsn,"
        "write_lag,flush_lag,replay_lag from pg_stat_replication where application_name='owned_standby') s"))
    emit('replayed_and_verified',dict(positions=applied,outcome=final,sender_feedback_sample=feedback,
        resume_to_verified_ms=round(1000*(time.monotonic()-began),2)))
    print('PASS: receive/flush advanced while replay and rows stayed stale; resumed replay restores exact complete receipt state.',flush=True)
finally:
    # Shutdown does not depend on resuming a deliberately paused standby.
    stop_replication()
PY`;
}

export const REPLAY_LAG_VARIATION = replayExperiment(4000);
export const REPLAY_LAG: Draft = {
  slug: "replication-lag-under-load",
  revision: 4,
  tags: ["streaming-replication", "hot-standby", "replicated-log", "consistency", "wal"],
  title: "Received, flushed and replayed: measure a deliberately stale standby",
  difficulty: "intermediate",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 25,
  prerequisites: ["build-a-streaming-standby", "every-change-is-a-wal-record"],
  overview: code`
Pause actual standby replay while leaving streaming active. Commit2,000 receipts, prove their WAL
has reached the standby's flush position and the primary has received that acknowledgement, then
show a query still sees only the original row. Resume and require both a replay boundary and every
expected receipt value before calling the copy caught up.`,
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
  caution: code`
Run the complete shell script with Python3 and matching PostgreSQL16 binaries, including
pg_basebackup/pg_verifybackup; PGBIN may select the folder. It creates an owned source/standby,
private sockets and physical slot, ignores existing PG/PGLAB settings and disables TCP. Root uses
runuser as the postgres OS owner. Replay pauses only on the new standby; the fixed small workload
bounds retained WAL. Finally stops standby, removes its inactive slot and stops source, even if
replay remains paused. Keep the printed stopped paths/logs for inspection; allow a few hundred MB.`,
  syntaxBreakdown: code`
### In plain terms

A standby can have durable WAL without making that WAL's rows visible. Pausing the replay process
isolates that stage while reception continues. Data freshness must be checked after apply, and a
recent transport acknowledgement cannot substitute for it.

### What you are learning

- **Pipeline stages:** sent, written, flushed and replayed positions expose different completed work.
- **Controlled backlog:** actual pause state and stale rows establish delayed apply while transport lives.
- **Data readiness:** a replay gate plus a fresh complete query proves the requested dataset arrived.
- **Feedback limits:** source-side status and time-lag samples are asynchronous, not a continuous queue clock.

### Piece by piece

- **python3** includes the full owned-replication helper. **PGBIN / pg_config --bindir** locates
  binaries; **tempfile.mkdtemp**, private sockets, cleared PG variables and root-only
  **runuser/os.chown** isolate process ownership. **initdb -D ... -U postgres --auth-local=trust
  --auth-host=reject --no-locale --data-checksums --wal-segsize=1** creates the protected local
  cluster with checksums and1MB WAL segments. TCP is disabled.
- **fsync/synchronous_commit/full_page_writes** stay on, **wal_level=replica** enables streaming,
  and small buffers, **max_wal_size=128MB**, **checkpoint_timeout=1h**, **autovacuum=off** and
  **wal_sender_timeout=5s** bound this fixture. No existing cluster setting changes.
- **psql -X -At -v ON_ERROR_STOP=1 -c**, **PGCONNECT_TIMEOUT**, **statement_timeout** and
  **lock_timeout** make SQL isolated and bounded. **pg_ctl -D ... -l ... -w -t20** controls each
  owned server; **-m fast stop** cleans up. Standby connections explicitly select its private socket.
- **CREATE TABLE** constrains unique receipt IDs, positive non-null amounts and non-null payloads.
  Row0/amount1 is in the verified backup. **generate_series** and **repeat** later insert IDs1–2,000,
  amount=id and200-character payloads in one committed transaction; the variation doubles that count.
- **clone_standby** creates a **LOGIN REPLICATION** role and uses **pg_basebackup -U owned_repl
  -D ... -c fast -X stream -R -C -S owned_standby --manifest-checksums=SHA256 -v**. The copied
  manifest verifies before socket/name settings change. **standby.signal**, **primary_conninfo**
  and **primary_slot_name** configure recovery and the retained-WAL consumer. **archive_mode=off**,
  **hot_standby=on**, **wal_receiver_status_interval=1s** and retry100ms configure the copy.
- **pg_current_wal_insert_lsn** is sampled after COMMIT. Its position contains the completed
  receipt transaction within this fixed history; it is not an exact per-request record address.
  **wait_replay** polls **pg_last_wal_replay_lsn >= bound** before the initial and final row queries.
- **pg_wal_replay_pause** requests a pause. **pg_get_wal_replay_pause_state='paused'** must actually
  hold before writing the workload; a requested-but-not-yet-paused state is insufficient. A saved
  replay LSN must remain fixed while receipt WAL arrives.
- **pg_stat_wal_receiver.flushed_lsn** proves the standby has flushed through the commit bound.
  **pg_stat_replication.flush_lsn** separately proves that the source received feedback about it.
  Fresh connections and **wait_for** poll both conditions with deadlines. Other source sent/write/
  replay fields are retained as observed samples rather than assumed instant agreement.
- **pg_last_wal_receive_lsn**, **pg_last_wal_replay_lsn** and **pg_wal_lsn_diff** show the positive
  durable-receive versus apply gap on the standby. The Python **lsn** helper converts hexadecimal
  positions for comparisons. **pg_last_xact_replay_timestamp** is the source commit timestamp of
  the last replayed transaction; its age can grow on an idle caught-up system and is not a backlog timer.
- **count**, **count(distinct id)**, **min/max**, **sum** and **bool_and** check both complete result
  sets. **CASE** accounts for row0's amount1; all other amounts must equal IDs and every payload
  must match. During pause, standby remains one row while the source has all2,001 rows.
- **pg_wal_replay_resume** releases apply. The driver waits for **not paused**, then replay through
  the bound, then exact source/standby domain agreement. **time.monotonic** measures resume through
  verified data including polling and SQL overhead, not just startup-process CPU or service RTO.
- Source **write_lag/flush_lag/replay_lag** fields are final feedback samples. They describe delays
  measured for recent acknowledgements and can be NULL or lag current standby observations; they
  are not a promise of how long future backlog will take. No assertion requires zero time lag.
- **json_build_object/json_agg/json.loads/dumps** retain structured evidence before and after.
  Finally stops standby, polls its **pg_replication_slots.active** state, drops only the owned slot
  through **pg_drop_replication_slot**, verifies absence and stops the source.`,
  code: replayExperiment(2000),
  expectedResult: code`
Actual pause state is paused and the replay position stays fixed. Standby flushed_lsn and the
source's acknowledged flush_lsn reach the post-COMMIT bound while pg_last_wal_replay_lsn remains
behind it, giving a positive received-minus-replayed gap. The standby still returns only row0,
amount1; the source has2,001 distinct IDs0–2,000, sum2,001,001 and every correct amount/payload.

After resume, state is not paused and replay reaches the bound. Both complete queries return the
same2,001 correct rows. The variation returns4,001 rows and sum8,002,001 after the same controlled
stale-read phase. Actual LSN distances and sampled resume times vary. Source lag fields are retained
as asynchronous feedback, with no assertion that they instantaneously become zero or non-NULL.
All servers stop and the owned physical slot is removed.`,
  systemsLens: code`
Durable delivery and visible application state are separate boundaries. A consumer can accept and
persist log bytes while the state machine is paused; neither a healthy connection nor a flush
acknowledgement makes a particular read current. Use an apply boundary tied to the intended history,
then query under a fresh snapshot. Read-your-writes additionally needs a deadline and a defined
response when the boundary cannot be met, which the next experiment implements.`,
  challenge: code`
Double only the committed receipt workload to4,000 using the complete pgcoach hint2 variation.
Predict the paused result and final sum, then compare receive/replay byte gaps and measured resume
cost. Explain why doubling rows need not exactly double WAL bytes, elapsed time or reported time lag.`,
};
