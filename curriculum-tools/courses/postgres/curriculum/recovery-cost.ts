import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

const RECOVERY_TRIAL = OWNED_CLUSTER_PY + code`
import re, sys
rows, checkpoint_bulk = int(sys.argv[1]), sys.argv[2] == 'yes'
for name in ('pg_controldata','pg_waldump'):
    assert (bindir / name).is_file(), 'Missing server tool: ' + name
with (data / 'postgresql.conf').open('a') as config:
    config.write("\nshared_buffers='32MB'\nmax_wal_size='128MB'\nbgwriter_lru_maxpages=0\nautovacuum=off\n")

def lsn(value):
    high, low = value.split('/')
    return (int(high,16)<<32) + int(low,16)

try:
    start()
    settings = json.loads(sql("select json_object_agg(name,setting) from pg_settings where name in "
        "('server_version','shared_buffers','max_wal_size','checkpoint_timeout','bgwriter_lru_maxpages',"
        "'autovacuum','fsync','full_page_writes','synchronous_commit')"))
    assert all(settings[k]=='on' for k in ('fsync','full_page_writes','synchronous_commit'))
    sql('create extension pg_buffercache')
    sql("create table recovery_receipts(id int primary key, amount int not null check(amount>0), "
        "pad text not null) with(autovacuum_enabled=false)")
    sql('checkpoint')
    baseline = json.loads(sql('select row_to_json(c) from pg_control_checkpoint() c'))
    bulk = json.loads(sql("with ins as (insert into recovery_receipts select g,g,repeat('r',200) "
        "from generate_series(1," + str(rows) + ") g returning id) "
        "select json_build_object('rows',count(*),'sum_ids',sum(id),'xid',pg_current_xact_id()::text) from ins"))
    assert bulk['rows']==rows and bulk['sum_ids']==rows*(rows+1)//2
    heap_bytes = int(sql("select pg_relation_size('recovery_receipts')"))
    assert heap_bytes < 16*1024*1024, 'Keep the main heap below half the configured cache'
    assert sql('select redo_lsn from pg_control_checkpoint()') == baseline['redo_lsn']
    if checkpoint_bulk:
        sql('checkpoint')
    before = json.loads(sql('select row_to_json(c) from pg_control_checkpoint() c'))
    assert (lsn(before['redo_lsn']) > lsn(baseline['redo_lsn'])) == checkpoint_bulk
    dirty = json.loads(sql("select json_build_object('resident',count(*),'dirty',count(*) filter(where isdirty)) "
        "from pg_buffercache where reldatabase=(select oid from pg_database where datname=current_database()) "
        "and reltablespace=(select dattablespace from pg_database where datname=current_database()) "
        "and relfilenode=pg_relation_filenode('recovery_receipts') and relforknumber=0"))
    # Warm position-function lookups before the final synchronous commit can flush observer hint WAL.
    sql('select pg_current_wal_insert_lsn(),pg_current_wal_flush_lsn()')
    # Identical committed tail in both conditions requires actual redo in each restart.
    tail_xid = sql("with ins as (insert into recovery_receipts values(" + str(rows+1) + ",7,repeat('r',200))) "
        "select pg_current_xact_id()::text")
    upper = sql('select pg_current_wal_insert_lsn()')
    assert lsn(sql('select pg_current_wal_flush_lsn()')) >= lsn(upper)
    offset = log.stat().st_size
    server('pg_ctl','-D',data,'-m','immediate','-w','-t','20','stop',timeout=25)
    assert not (data/'postmaster.pid').exists()
    control_text = server('pg_controldata','-D',data)
    (root/'unclean-control.txt').write_text(control_text)
    assert re.search(r'Database cluster state:\s+in production',control_text)
    saved_redo = re.search(r"Latest checkpoint's REDO location:\s+(\S+)",control_text).group(1)
    assert saved_redo == before['redo_lsn']
    # Decode before restart can recycle the range, and exclude the end address itself.
    dump = run([str(bindir/'pg_waldump'),'-p',str(data/'pg_wal'),'-s',saved_redo,'-e',upper],timeout=30)
    (root/'recovery-range.waldump').write_text(dump)
    lines = [line for line in dump.splitlines() if line.startswith('rmgr:')]
    assert lines
    def xid_lines(xid):
        return [line for line in lines if re.search(r'tx:\s+' + xid + r'\b',line)]
    bulk_lines, tail_lines = xid_lines(bulk['xid']), xid_lines(tail_xid)
    assert bool(bulk_lines) == (not checkpoint_bulk)
    assert any('INSERT' in line for line in tail_lines) and any('COMMIT' in line for line in tail_lines)
    last_record_start = re.search(r'lsn:\s+(\S+),',lines[-1]).group(1)
    # The wall-clock sample includes pg_ctl's readiness polling and a fresh SQL connection.
    began = time.monotonic()
    start()
    client_ms = 1000*(time.monotonic()-began)
    actual = json.loads(sql("select json_build_object('rows',count(*),'distinct_ids',count(distinct id),"
        "'first',min(id),'last',max(id),'amount',sum(amount),"
        "'all_correct',bool_and(amount=case when id=" + str(rows+1) + " then 7 else id end "
        "and pad=repeat('r',200))) from recovery_receipts"))
    expected = dict(rows=rows+1,distinct_ids=rows+1,first=1,last=rows+1,
        amount=rows*(rows+1)//2+7,all_correct=True)
    assert actual==expected
    assert sql('select pg_is_in_recovery()') == 'f'
    assert sql('select timeline_id from pg_control_checkpoint()') == str(before['timeline_id'])
    domain_ms = 1000*(time.monotonic()-began)
    fresh_log = log.read_bytes()[offset:].decode()
    (root/'recovery.log').write_text(fresh_log)
    for marker in ('immediate shutdown request','database system was interrupted','automatic recovery in progress',
                   'redo starts at','redo done at','ready to accept connections'):
        assert marker in fresh_log, 'Missing actual recovery marker: ' + marker
    redo_start = re.search(r'redo starts at (\S+)',fresh_log).group(1)
    redo_done = re.search(r'redo done at (\S+).*?elapsed: ([0-9.]+) s',fresh_log)
    assert redo_start==saved_redo and lsn(redo_done.group(1))==lsn(last_record_start)
    result = dict(root=str(root),checkpoint_bulk=checkpoint_bulk,settings=settings,rows=rows,heap_bytes=heap_bytes,
        baseline=baseline,before=before,flushed_upper=upper,redo_distance_bytes=lsn(upper)-lsn(saved_redo),
        decoded_records=len(lines),bulk_records_in_range=len(bulk_lines),tail_records_in_range=len(tail_lines),
        last_record_start=last_record_start,last_record_end=upper,buffers_before_tail=dirty,outcome=actual,
        observed_redo_start=redo_start,observed_redo_done=redo_done.group(1),
        redo_log_elapsed_s=float(redo_done.group(2)),client_ready_ms=round(client_ms,2),domain_verified_ms=round(domain_ms,2))
    (root/'result.json').write_text(json.dumps(result,indent=2))
    print('trial_result: ' + json.dumps(result,sort_keys=True),flush=True)
    print(fresh_log,flush=True)
finally:
    stop()
    print('Private server stopped; retained actual recovery evidence at',root,flush=True)
`;

function recoveryExperiment(rows: number): string {
  return "python3 - <<'PY'\nimport json, pathlib, subprocess, sys, tempfile\n" +
    `trial_source = ${JSON.stringify(RECOVERY_TRIAL)}\nrows = ${rows}\n` + code`
report = pathlib.Path(tempfile.mkdtemp(prefix='pg-recovery-cost-',dir='/tmp'))
results = []
# Reverse the pair order on pass two; each trial initializes and stops a fresh cluster.
for index, checkpoint_bulk in enumerate((False, True, True, False),1):
    result = subprocess.run([sys.executable,'-c',trial_source,str(rows),'yes' if checkpoint_bulk else 'no'],
        text=True,capture_output=True)
    output = result.stdout + result.stderr
    (report/('trial-' + str(index) + '.log')).write_text(output)
    print(output,flush=True)
    assert result.returncode==0, 'Trial failed; inspect ' + str(report)
    value = json.loads(next(line.removeprefix('trial_result: ') for line in result.stdout.splitlines()
        if line.startswith('trial_result: ')))
    value['trial_order'] = index
    results.append(value)
assert len({r['heap_bytes'] for r in results})==1
assert all(r['outcome']==results[0]['outcome'] and r['settings']==results[0]['settings'] for r in results)
for stale, recent in ((results[0],results[1]),(results[3],results[2])):
    assert stale['redo_distance_bytes'] > recent['redo_distance_bytes']
    assert stale['decoded_records'] > recent['decoded_records']
(report/'results.json').write_text(json.dumps(results,indent=2))
print('PASS: four matched crashes, actual redo, equal complete receipt states; compare sampled timings without a speed-ratio assertion.')
print('Retained comparison:',report,flush=True)
PY`;
}

export const RECOVERY_COST_VARIATION = recoveryExperiment(40000);
export const RECOVERY_COST: Draft = {
  slug: "redo-point-bounds-recovery",
  revision: 4,
  tags: ["checkpoints", "recovery", "wal", "durability"],
  title: "Recovery cost: compare redo work with actual readiness",
  difficulty: "advanced",
  safetyLevel: "dangerous",
  runIn: "shell",
  estimatedMinutes: 30,
  prerequisites: ["checkpoint-anatomy", "crash-and-redo"],
  overview: code`
Recover matching receipt datasets with either an old checkpoint or a checkpoint after their bulk
load. Each case includes the same committed tail write, so both must actually replay WAL. Run two
pairs in reversed order on fresh owned clusters, inspect the replayed interval, and measure client
and domain readiness separately from the log's sampled redo duration.`,
  reading:
    code`PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "Checkpoint", "Recovery")`,
  readingNotes: code`
Chapter 10 explains the redo position and startup recovery. Read after comparing the stopped control
file with the fresh recovery log. This experiment adds bounded readiness and domain checks; neither
WAL address distance nor the log's rounded elapsed time is an application's recovery-time objective.`,
  caution: code`
This shell script deliberately crashes four newly allocated /tmp/pg-owned-* clusters in sequence.
It ignores existing PG connection variables and PGLAB. Use Python3 and PostgreSQL16 server tools,
including pg_controldata, pg_waldump and pg_buffercache; PGBIN may select the binary directory.
Each child owns a private socket with TCP disabled, and finally stops its server; root uses runuser
with the postgres OS account. Evidence and stopped data directories remain at printed paths.
This tests server-process failure on intact local storage, with warm OS caches. It does not test
power loss, lost devices, cold storage, traffic failover or application restart.`,
  syntaxBreakdown: code`
### In plain terms

A recent checkpoint can shorten the retained interval that crash recovery must examine. The amount
of log and the time until a real query returns are separate measurements. We preserve the same final
receipts in both conditions and require fresh recovery evidence instead of assuming a restart did
useful replay work.

### What you are learning

- **Matched recovery trials:** compare equal rows, layout, settings and failure type.
- **Recovery bounds:** a redo position selects a WAL interval; records and page state determine work.
- **Readiness layers:** process startup, successful SQL and verified domain state have different costs.
- **Record boundaries:** redo done reports a record's start address, not necessarily the log end.

### Piece by piece

- **python3**, **subprocess.run**, **sys.executable** and **sys.argv** run four complete child trials
  in order: old/recent, recent/old. Each child initializes a new cluster. The outer driver retains
  stdout/stderr and parsed results under **tempfile.mkdtemp**'s pg-recovery-cost directory; assertions
  reject failed child processes or unequal datasets/settings/heap sizes.
- The embedded helper locates binaries through **PGBIN** or **pg_config --bindir** and allocates a
  unique private socket/data directory. Root uses **runuser -u ... --** and **os.chown**; non-root
  runs directly. **initdb -D ... -U postgres --auth-local=trust --auth-host=reject --no-locale
  --data-checksums --wal-segsize=1** chooses the directory and database owner, restricts connection
  mechanisms, fixes locale, enables checksums and uses1MB WAL segments. TCP listening is disabled.
- **shared_buffers=32MB**, **max_wal_size=128MB**, **checkpoint_timeout=1h** and disabled
  **bgwriter_lru_maxpages/autovacuum** bound interference in this small private fixture. The heap
  must stay under16MB. **fsync/full_page_writes/synchronous_commit** stay on; **pg_settings** records
  actual values. No caller session setting is changed.
- **psql -X -At -v ON_ERROR_STOP=1 -c** returns predictable output and stops on SQL errors.
  **PGCONNECT_TIMEOUT**, **statement_timeout** and **lock_timeout** bound helper operations.
  **pg_ctl -D ... -l ... -w -t20 start** bounds startup and saves its log; a SQL query then verifies
  the owned **data_directory**. Final **-m fast stop** shuts down cleanly after each trial.
- **CREATE TABLE** supplies primary-key, positive-amount and non-null constraints.
  **generate_series** and **repeat** make20,000 receipts. **WITH ins AS (INSERT ... RETURNING id)**
  allows **count/sum** to verify the bulk input while **pg_current_xact_id** records its writing
  transaction. Both conditions then commit one receipt with id20,001 and amount7.
- **CHECKPOINT** first establishes a common empty-table baseline. Only the recent condition runs
  it again after the bulk load. **pg_control_checkpoint** saves both metadata states, and checks
  reject an unexpected intermediate redo advance. **pg_relation_size** checks identical heap size.
- **pg_current_wal_insert_lsn** saves the interval end after the committed tail;
  **pg_current_wal_flush_lsn** must cover it. All buffer sampling and initial position-function
  lookups occur before the tail commit, which also flushes any observer hint WAL. The Python **lsn** function converts hexadecimal LSN
  halves to byte positions. The difference from **redo_lsn** measures address distance, not seconds.
- **pg_buffercache** samples dirty and resident main-fork heap buffers, matched by database,
  tablespace, filenode and **relforknumber=0**, before the tail write. These are observations, not a count of pages that
  recovery must rewrite; already-written pages can cause redo to skip page work.
- **pg_ctl -m immediate stop** deliberately stops without a shutdown checkpoint. A missing
  **postmaster.pid** plus **pg_controldata**'s **in production** state establishes the unclean stop.
  Its saved REDO location must match the pre-crash SQL control value.
- **pg_waldump -p ... -s REDO -e END** reads the stopped cluster's WAL before restart can recycle
  it. **rmgr**, **tx**, **lsn** and record descriptions identify record count, transaction IDs and
  the last record's start. Bulk transaction records occur only in the old-checkpoint range; tail
  INSERT and COMMIT records must occur in both. The end LSN is an exclusive interval boundary.
- **time.monotonic** measures restart through **pg_ctl** readiness polling and a fresh successful
  SQL query, then through independent domain verification. The sample includes helper/process and
  query overhead. It does not include failure detection or application reconnection policy.
- **count**, **count(distinct id)**, **min/max**, **sum** and **bool_and** verify all expected IDs,
  amounts and payloads after restart. **pg_is_in_recovery** must be false, and **timeline_id** must
  remain unchanged. A tiny receipt aggregate is this fixture's definition of domain readiness.
- The saved log-byte offset isolates **recovery.log**. Python **re.search** requires interruption,
  automatic recovery, redo start/done and ready messages. The redo start must equal the saved redo
  position; redo done must equal the offline dump's last record start after normalizing optional
  leading hexadecimal zeroes. The log's elapsed value is
  rounded and can be0.00s without meaning no work occurred.
- **json_build_object**, **row_to_json**, **json_object_agg**, **json.loads/dumps** preserve control,
  settings, intervals, rows and times as retained JSON. The variation doubles only the bulk row
  count to40,000; the tail becomes id40,001 with amount7 and the same payload.`,
  code: recoveryExperiment(20000),
  expectedResult: code`
Four independent clusters recover from actual immediate shutdowns. In both old-checkpoint trials,
the decoded recovery range contains the bulk transaction; in both recent-checkpoint trials it does
not. All four ranges contain the common tail INSERT and COMMIT. Old-checkpoint distance and decoded
record count exceed the recent case in each pair. The heap size, settings and final dataset match.

Every final query returns20,001 distinct receipts, IDs1–20,001, total amount200,010,007, correct
per-ID amounts and payloads. The stopped control state is in production. Each fresh log reports
actual recovery with redo start equal to the saved control position and redo done equal to the last
record's start in the offline dump. That address can precede the saved end because a record occupies
bytes after its starting address; this difference alone does not show lost or unflushed WAL.

Compare the log's rounded redo duration, client_ready_ms and domain_verified_ms across both pairs.
Small cached samples may overlap or reverse in elapsed-time order; no speed ratio is required.
Each child stops its cluster, and the outer driver prints PASS only after cross-trial invariants.
The variation preserves40,001 receipts and total amount800,020,007 with the same matching checks.`,
  systemsLens: code`
A recovery-time objective is a service requirement, while replay distance is one measured input to
recovery cost. Checkpoint position shifts work between normal running and startup; storage/cache
state, WAL record types, checkpoint-at-recovery work, orchestration and application readiness also
matter. Log bytes are neither elapsed time nor proof that each referenced page was rewritten.

Commit durability comes from the configured WAL and storage contract in both cases. The recent
checkpoint reduces required replay without strengthening an acknowledgement beyond that contract.
These local trials preserve intact data files and WAL; backup recovery must separately prove that
an independently restored starting state and available history suffice.`,
  challenge: code`
Double only the bulk workload to40,000 receipts using the complete pgcoach hint2 variation. Predict
which record counts and final sum change, then compare both order-reversed pairs. Identify the
measurements still missing before defending a production recovery-time objective.`,
};
