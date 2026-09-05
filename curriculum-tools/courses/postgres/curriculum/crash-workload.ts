import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function crashExperiment(commitSecond: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\ncommit_second = ${commitSecond ? "True" : "False"}\n` + code`
import re
for name in ("pg_controldata", "pg_waldump"):
    assert (bindir / name).is_file(), "Missing server tool: " + name
pending = None
out = (root / "pending.stdout").open("w")
err = (root / "pending.stderr").open("w")

def emit(label, value):
    print(label + ": " + json.dumps(value, sort_keys=True), flush=True)
    (root / (label + ".json")).write_text(json.dumps(value, indent=2))

def send(statement):
    pending.stdin.write(statement + "\n")
    pending.stdin.flush()

def pending_text():
    return (root / "pending.stdout").read_text()

try:
    start()
    sql("create extension pg_walinspect")
    sql("create extension pageinspect")
    sql("create table crash_receipts(id int primary key, amount int check(amount>0)) with (autovacuum_enabled=false)")
    sql("create table flush_marker(id int primary key)")
    sql("checkpoint")
    control_before = json.loads(sql("select row_to_json(c) from pg_control_checkpoint() c"))
    lower = sql("select pg_current_wal_insert_lsn()")
    # One SQL statement owns one committed transaction. Its returned xid identifies the WAL.
    committed_xid = sql("with ins as (insert into crash_receipts values(1,10)) select pg_current_xact_id()::text")
    client_env = dict(env, PGAPPNAME="owned_crash_pending")
    pending = subprocess.Popen([str(bindir / "psql"), "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
        env=client_env, text=True, stdin=subprocess.PIPE, stdout=out, stderr=err)
    send("begin; insert into crash_receipts values(2,20); select 'pending_xid=' || pg_current_xact_id()::text;")
    wait_for("pending transaction xid", lambda: re.search(r"pending_xid=(\d+)", pending_text()))
    pending_xid = re.search(r"pending_xid=(\d+)", pending_text()).group(1)
    wait_for("an idle unfinished transaction", lambda: sql("select count(*) from pg_stat_activity where "
        "application_name='owned_crash_pending' and state='idle in transaction'") == "1")
    if commit_second:
        send("commit;\n\\echo decision_committed")
        wait_for("second COMMIT acknowledgement", lambda: "decision_committed" in pending_text())
    # A separate synchronous commit makes even the unfinished transaction's earlier WAL durable.
    sql("insert into flush_marker values(1)")
    upper = sql("select pg_current_wal_insert_lsn()")
    assert sql("select pg_current_wal_flush_lsn() >= '" + upper + "'::pg_lsn") == "t"
    records = json.loads(sql("select coalesce(json_agg(r),'[]') from (select start_lsn,end_lsn,xid::text,"
        "resource_manager,record_type,block_ref from pg_get_wal_records_info('" + lower + "','" + upper + "') "
        "where xid::text in ('" + committed_xid + "','" + pending_xid + "') order by start_lsn) r"))
    for xid in (committed_xid, pending_xid):
        assert any(r["xid"] == xid and r["resource_manager"] == "Heap" and "INSERT" in r["record_type"] for r in records)
    def has_commit(xid):
        return any(r["xid"] == xid and r["resource_manager"] == "Transaction" and r["record_type"] == "COMMIT" for r in records)
    assert has_commit(committed_xid) and has_commit(pending_xid) == commit_second
    expected_ids = [1, 2] if commit_second else [1]
    assert json.loads(sql("select json_agg(id order by id) from crash_receipts")) == expected_ids
    emit("before_crash", dict(commit_second=commit_second, committed_xid=committed_xid,
        pending_xid=pending_xid, lower=lower, flushed_upper=upper, checkpoint=control_before,
        independent_visible_ids=expected_ids, records=records))

    # The client remains connected across this boundary; it is not closed to trigger a rollback.
    offset = log.stat().st_size
    server("pg_ctl", "-D", data, "-m", "immediate", "-w", "-t", "20", "stop", timeout=25)
    assert not (data / "postmaster.pid").exists()
    # psql can wait on stdin after its backend dies. Reap the client only AFTER the server stopped.
    pending.stdin.close()
    pending.wait(timeout=5)
    control = server("pg_controldata", "-D", data)
    (root / "unclean-control.txt").write_text(control)
    assert re.search(r"Database cluster state:\s+in production", control)
    dump = run([str(bindir / "pg_waldump"), "-p", str(data / "pg_wal"), "-s", lower, "-e", upper])
    (root / "crash-range.waldump").write_text(dump)
    assert "COMMIT" in dump and "INSERT" in dump
    began = time.monotonic()
    start()
    service_ms = 1000 * (time.monotonic() - began)
    fresh_log = log.read_bytes()[offset:].decode()
    (root / "recovery.log").write_text(fresh_log)
    for marker in ("immediate shutdown request", "database system was interrupted", "redo starts at", "redo done at", "ready to accept connections"):
        assert marker in fresh_log, "Missing actual crash/recovery evidence: " + marker
    # Inspect physical tuple headers before the ordinary SELECT can add visibility hint bits.
    physical = json.loads(sql("select json_agg(p) from (select lp,t_xmin::text,t_xmax::text "
        "from heap_page_items(get_raw_page('crash_receipts',0)) where lp_flags=1 order by lp) p"))
    assert {committed_xid, pending_xid}.issubset({r["t_xmin"] for r in physical})
    outcome = json.loads(sql("select json_build_object('ids',json_agg(id order by id),'amount',sum(amount)) from crash_receipts"))
    assert outcome == dict(ids=expected_ids, amount=30 if commit_second else 10)
    assert sql("select count(*) from flush_marker") == "1"
    assert sql("select pg_is_in_recovery()") == "f"
    control_after = json.loads(sql("select row_to_json(c) from pg_control_checkpoint() c"))
    assert control_after["timeline_id"] == control_before["timeline_id"]
    emit("after_recovery", dict(physical=physical, outcome=outcome, checkpoint=control_after,
        service_ready_ms=round(service_ms, 2), domain_verified_ms=round(1000*(time.monotonic()-began), 2)))
    print("PASS: actual crash recovery, both physical inserts, and visibility matching the commit decision.", flush=True)
finally:
    if pending is not None and pending.poll() is None:
        pending.kill()
        pending.wait(timeout=5)
    out.close()
    err.close()
    stop()
    print("Private server stopped; retained WAL, control, client and recovery evidence at", root, flush=True)
PY`;
}

export const CRASH_WORKLOAD_VARIATION = crashExperiment(true);
export const CRASH_WORKLOAD: Draft = {
  slug: "crash-and-redo",
  revision: 4,
  tags: ["wal", "recovery", "durability", "transactions"],
  title: "Crash recovery: physical replay and the commit decision",
  difficulty: "advanced",
  safetyLevel: "dangerous",
  runIn: "shell",
  estimatedMinutes: 30,
  prerequisites: [
    "every-change-is-a-wal-record",
    "commit-visibility-and-clog",
    "wal-files-and-recycling",
  ],
  overview: code`
Both committed and unfinished changes can reach durable WAL before a crash. Run an actual crash in
an owned cluster, decode the two transactions' records, then compare physical tuple headers with
independently visible receipts after recovery. Explain why replaying an INSERT is insufficient to
promise a successful application operation.`,
  reading:
    code`PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "Checkpoint", "Recovery")`,
  readingNotes: code`
Chapter 10 explains restarting from a checkpoint's redo point and applying physical records. Read it
after predicting the result; the experiment connects that model to the transaction-status and page
visibility mechanisms from earlier lessons. pg_walinspect is a newer SQL inspection interface.`,
  caution: code`
This script deliberately uses immediate shutdown on its newly allocated /tmp/pg-owned-* cluster.
It does not use your existing lab connection or PGLAB. Use a shell with Python3, PostgreSQL server
binaries and the pageinspect/pg_walinspect extensions installed; PGBIN may select the binary folder.
The embedded helper disables TCP, owns a unique socket and stops the cluster in finally. Root uses
the postgres OS account through runuser. Retained files include the stopped cluster and raw WAL;
inspect the printed directory before removing that experiment later.
This tests process failure on intact local storage. It does not simulate power loss, device-cache
failure, lost disks or restoring onto a different host.`,
  syntaxBreakdown: code`
### In plain terms

Recovery replays physical changes, while transaction status determines which resulting rows a new
reader may see. We deliberately flush an unfinished INSERT before crashing, so its absence from
SELECT cannot be explained away as missing WAL. The post-recovery raw page provides a second,
independent view of the data.

### What you are learning

- **WAL durability:** one later synchronous commit can flush earlier records from other transactions.
- **Transaction outcome:** redo of a tuple does not confer a COMMIT decision on its transaction.
- **Recovery evidence:** combine an unclean control file, fresh replay log, raw page and domain query.
- **Readiness:** a server accepting queries and a verified application result are distinct observations.

### Piece by piece

- **python3** executes the complete supplied experiment. The included owned-cluster helper uses
  **PGBIN** or **pg_config --bindir**, **tempfile.mkdtemp**, a private socket and cleared PG variables.
  **runuser -u ... --** and **os.chown** select the postgres OS owner only when invoked as root.
- **initdb -D ... -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** creates only the allocated data directory, names the database superuser, confines
  trusted local access behind its private directory, rejects host authentication, removes locale
  variation, enables checksums and uses1MB WAL segments. TCP listen_addresses is empty.
- **fsync**, **synchronous_commit** and **full_page_writes** stay on. Small WAL/buffer settings bound
  this fixture; **checkpoint_timeout=1h** reduces timer interference. **pg_ctl -w -t20** bounds each
  startup/shutdown wait; **-D** names the owned directory and **-l** retains its log.
- **psql -X -At -v ON_ERROR_STOP=1 -c** runs SQL with no personal startup file, unaligned tuple-only
  output and immediate SQL-error failure. The persistent client also uses **-q** to suppress command
  tags. **PGCONNECT_TIMEOUT**, **statement_timeout** and **lock_timeout** bound observer operations.
- **CREATE EXTENSION pg_walinspect/pageinspect** installs the SQL interfaces for decoding WAL and
  physical heap pages in this fresh database. **autovacuum_enabled=false** keeps background tuple
  cleanup from erasing the tiny fixture's physical evidence before inspection.
- **CHECKPOINT** establishes the recovery starting state. **pg_control_checkpoint** records its
  redo_lsn and timeline_id; **pg_current_wal_insert_lsn** supplies an interval for our later records.
- **WITH ins AS (INSERT ...) SELECT pg_current_xact_id()** inserts receipt1 and returns its writing
  transaction ID in one implicit transaction. A second live psql process runs **BEGIN**, inserts
  receipt2 and reports its own ID. **PGAPPNAME** identifies that session in **pg_stat_activity**;
  observing **idle in transaction** proves it is left open between commands.
- **subprocess.Popen** keeps the second client's stdin open. Its output and errors go to owned
  files; **wait_for** checks actual output/state with a deadline. In the variation, **COMMIT** followed
  by a psql **\\echo** marker establishes acknowledgement before the same crash.
- **flush_marker** receives a separate synchronous commit after both INSERTs. A comparison with
  **pg_current_wal_flush_lsn** proves the entire selected interval was flushed before inspection.
- **pg_get_wal_records_info** returns xid, resource_manager, record_type and block_ref for that
  interval. Filtering by the two xids and asserting Heap INSERT records for each distinguishes
  physical work from the presence or absence of their Transaction COMMIT records.
- **pg_ctl -m immediate stop** aborts the owned server processes without a clean shutdown. The
  driver reaps the persistent client only after this boundary; closing that client first would
  change the experiment by rolling back the unfinished transaction before the crash.
- **pg_controldata -D** reads the stopped cluster's control file; its **in production** state is
  evidence of an unclean stop. **pg_waldump -p ... -s ... -e ...** reads the retained WAL directory
  between the saved start and end LSNs. The complete physical record listing is retained for inspection.
- **log.stat().st_size** captures a log offset before the crash. Only bytes appended after that
  offset become recovery.log; assertions require actual interrupted-server, redo and ready messages.
- **heap_page_items(get_raw_page('crash_receipts',0))** exposes first-page tuple headers. **lp_flags=1**
  selects normal items and **t_xmin** identifies each inserting transaction, including the unfinished
  one. Then an ordinary aggregate query independently checks visible IDs and total amount.
- **pg_is_in_recovery** must be false after completion; the timeline_id remains unchanged for this
  local crash recovery. **time.monotonic** measures sampled startup-plus-query and later domain-check
  elapsed times. These tiny, cached local measurements are not production recovery-time guarantees.`,
  code: crashExperiment(false),
  expectedResult: code`
Before the crash, both transaction IDs have Heap INSERT records in a flushed interval, but only
receipt1's transaction has a COMMIT record. An independent SELECT sees [1]. The stopped control file
still says in production; the newly appended log reports interruption, redo start, redo completion
and readiness after restart.

After recovery, both inserting transaction IDs appear in physical first-page tuple headers, while
the ordinary query returns ids[1] and amount10. The flush marker remains present, recovery is over
and timeline_id is unchanged. The unfinished tuple's physical presence does not make receipt2
visible. The script prints PASS only after these assertions and stops the owned server. LSNs, xids
and measured startup times vary. Read crash-range.waldump and recovery.log at the printed path for
the actual record stream and recovery boundary. This does not establish which pages had already
reached disk before the crash; redo may skip page work using its page LSN.`,
  systemsLens: code`
Physical reconstruction and authoritative operation outcome are separate responsibilities. A log
can contain changes from work that never became an accepted transaction; recovery must combine that
physical history with transaction decisions and visibility rules. Client uncertainty requires a
durable application receipt too: neither an INSERT record nor an open connection is proof that a
caller received success. Local recovery also depends on an intact starting state and retained WAL;
an arbitrary WAL suffix cannot reconstruct the complete database.`,
  challenge: code`
Change only the second transaction's decision: commit it before the same immediate shutdown.
Predict its Transaction record, physical header and post-recovery receipt totals, then run the
complete pgcoach hint2 variation. Compare the recorded intervals and explain why the physical INSERT
alone cannot distinguish these two outcomes.`,
};
