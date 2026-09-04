import { code, type Module } from "../../../src/types.ts";

export const PERFORMANCE: Module = {
  category: "performance",
  title: "Performance and capacity envelopes",
  lessons: [
    {
      slug: "query-plan-as-evidence",
      title: "Read SQLite's SCAN, SEARCH, and covering-index evidence",
      difficulty: "intermediate",
      tags: ["query-planner", "indexes", "observability"],
      prerequisites: ["recover-damaged-copy"],
      overview:
        "Compare the same 200-row answer before and after indexing a 20,000-row table. You already know why indexes exist from PostgreSQL; here the new skill is separating SQLite's plan vocabulary from actual virtual-machine work. A covering SEARCH and falling Fullscan Steps are stronger evidence than one shorter warm-cache time.",
      syntaxBreakdown: code`### In plain terms

A plan is a proposed route through data, not a record of everything execution did. This experiment keeps the answer fixed and changes the available route, then uses SQLite's statement counters to check that the work changed. Unlike PostgreSQL EXPLAIN ANALYZE, EXPLAIN QUERY PLAN does not execute and instrument the query.

### What you are learning

- **Access path:** SCAN walks broadly; SEARCH restricts the traversal using a key. Either may involve a table or an index.
- **Covering:** All columns needed by this query are in the index, so SQLite need not fetch the corresponding table records.
- **Evidence levels:** A plan, statement counters, and elapsed time answer different questions. None alone measures device I/O.

### Piece by piece

- **WITH RECURSIVE n(x), printf, and %** generate 20,000 deterministic rows. The remainder operator spreads them evenly across 100 tenant names; tenant-37 therefore matches 200 rows.
- **DROP ... IF EXISTS** makes reruns recreate the intended pre-index baseline. **PRAGMA optimize** requests opportunistic planner maintenance; no competing index exists at this stage.
- **EXPLAIN QUERY PLAN** prints a tree whose detail text names SCAN, SEARCH, and the selected index. Read the access path, not node numbers or exact formatting, which are not a stable application interface.
- **CREATE INDEX ... (tenant, event_id, payload)** places the equality key first, then the requested ordering and projected value. That ordering lets one index satisfy both filtering and ordered payload retrieval.
- **.stats on/off** brackets each count statement. Compare **Fullscan Steps** and **Virtual Machine Steps** in the two reports; page-cache hits/misses describe SQLite's cache, not necessarily physical storage reads. Statistics are off during index construction so construction is not confused with query execution.
- **.timer on/off** adds real, user, and system time. The same answer can have different work yet similar elapsed time when the small fixture is cached.
- **tenant >= 'tenant-50'** in the challenge widens the predicate to 10,000 rows. Tenant-first index ordering does not automatically provide global event_id order across many tenants; look for a temporary sort.`,
      setup: code`
DROP TABLE IF EXISTS plan_events;
CREATE TABLE plan_events(event_id INTEGER PRIMARY KEY, tenant TEXT NOT NULL, payload TEXT NOT NULL);
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 20000)
INSERT INTO plan_events(event_id, tenant, payload)
SELECT x, 'tenant-' || printf('%02d', x % 100), 'payload-' || printf('%06d', x) FROM n;
DROP INDEX IF EXISTS plan_events_tenant_idx;
PRAGMA optimize;
`,
      code: code`
.timer on
EXPLAIN QUERY PLAN SELECT payload FROM plan_events WHERE tenant = 'tenant-37' ORDER BY event_id;
.stats on
SELECT count(*) AS matching_rows FROM plan_events WHERE tenant = 'tenant-37';
.stats off
CREATE INDEX plan_events_tenant_idx ON plan_events(tenant, event_id, payload);
EXPLAIN QUERY PLAN SELECT payload FROM plan_events WHERE tenant = 'tenant-37' ORDER BY event_id;
.stats on
SELECT count(*) AS matching_rows FROM plan_events WHERE tenant = 'tenant-37';
.stats off
.timer off
`,
      expectedResult:
        "Both count queries return 200. The first plan scans plan_events; the second searches the covering plan_events_tenant_idx. The count's Fullscan Steps fall from approximately 19,999 to 0, and Virtual Machine Steps fall substantially. Exact instruction totals, plan formatting and timings depend on the build. The ordered payload plan and the separately measured count are related queries, not a runtime profile of the same statement.",
      systemsLens:
        "Use PostgreSQL's indexing intuition, but learn SQLite's observability boundary. A covering SQLite index avoids a table-B-tree lookup without PostgreSQL's heap visibility-map condition for index-only scans. That is a concrete storage-engine difference, not permission to infer physical reads or universal speedups from the word covering.",
      challenge:
        "Run the indexed query with the SQLite range predicate `WHERE tenant >= 'tenant-50'` so roughly half the table qualifies. Predict whether EXPLAIN QUERY PLAN still reports SEARCH, whether it adds a temporary sort for ORDER BY event_id, and what the result count should be; then compare the plan text first and the timer only as supporting evidence. This tests where SQLite's access-path description changes as selectivity and ordering pressure change, rather than asking for a universal index-speed threshold.",
      caution:
        "Do not infer a universal speedup from one warm-cache run. Keep the data size, SQLite build, cache state, and predicate visible when recording a result.",
      safetyLevel: "ddl",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 3,
      estimatedMinutes: 20,
    },
    {
      slug: "index-read-write-tradeoff",
      title: "Measure the read and write cost of indexes",
      difficulty: "intermediate",
      tags: ["indexes", "pages", "write-amplification", "capacity"],
      prerequisites: ["query-plan-as-evidence"],
      overview:
        "Give one of two identical tables three indexes, then measure the new page objects and the work of changing an indexed column. The useful contrast is not another introduction to indexes: SQLite's single writer means extra maintenance also consumes the admission capacity shared by unrelated writes to that file.",
      syntaxBreakdown: code`### In plain terms

An index is a stored copy of a particular ordering of your data. Read savings are visible in the lookup plan; its maintenance cost is visible when an update must keep that ordering correct. We compare equal data and equal updates, rather than compare two unrelated timing samples.

### What you are learning

- **Read versus write amplification:** A faster lookup can require extra stored pages and more work per update.
- **Measurement scope:** dbstat attributes pages to objects; page_count measures the entire database.
- **Serialization cost:** More work inside SQLite's write transaction keeps the file's writer position occupied longer.

### Piece by piece

- **WITH RECURSIVE, printf, %, and CASE** generate 12,000 reproducible rows with account, state, and amount distributions. **INSERT ... SELECT** copies the exact rows to the comparison table.
- **PRAGMA optimize** requests planner maintenance. It is not a benchmark timer and does not create an index.
- **dbstat** is an optional page-inspection virtual table enabled in this lab. Grouping by **name** and counting rows measures pages assigned to each named table or index, not the whole file's allocated/free space.
- **EXPLAIN QUERY PLAN** describes the account lookup. Look for SCAN on the unindexed table and SEARCH using trade_account_idx on the indexed one; the two sums should agree.
- **CREATE INDEX** makes independent account, state, and amount B-trees. These are not a single covering index: the account index still needs table lookups for amount.
- **BEGIN/COMMIT** make each 4,000-row update one transaction. Only amount changes, so trade_amount_idx needs key maintenance while account and state keys remain unchanged.
- **.stats on/off** scopes the statement work reports to each UPDATE. Compare Virtual Machine Steps, not all prior statements' cumulative work. **.timer on/off** supplies supporting elapsed times, which need not separate reliably on a cached fixture.
- **pragma_page_count and pragma_page_size** expose PRAGMA results as tables. Their product is main-database logical size; it is not a per-table cost or live WAL-size measurement.
- **DROP INDEX trade_amount_idx** in the challenge removes the index whose key changes. Repeat equivalent update ranges and explain which work disappears before interpreting timing.`,
      setup: code`
DROP TABLE IF EXISTS trade_no_index;
DROP TABLE IF EXISTS trade_with_indexes;
CREATE TABLE trade_no_index(id INTEGER PRIMARY KEY, account TEXT NOT NULL, state TEXT NOT NULL, amount INTEGER NOT NULL);
CREATE TABLE trade_with_indexes(id INTEGER PRIMARY KEY, account TEXT NOT NULL, state TEXT NOT NULL, amount INTEGER NOT NULL);
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 12000)
INSERT INTO trade_no_index SELECT x, 'acct-' || printf('%04d', x % 1000), CASE WHEN x % 7 = 0 THEN 'open' ELSE 'closed' END, x % 10000 FROM n;
INSERT INTO trade_with_indexes SELECT * FROM trade_no_index;
PRAGMA optimize;
`,
      code: code`
.timer on
SELECT 'before_indexes' AS observation, name, count(*) AS pages FROM dbstat WHERE name IN ('trade_no_index', 'trade_with_indexes') GROUP BY name ORDER BY name;
EXPLAIN QUERY PLAN SELECT sum(amount) FROM trade_no_index WHERE account = 'acct-0042';
SELECT sum(amount) FROM trade_no_index WHERE account = 'acct-0042';
CREATE INDEX trade_account_idx ON trade_with_indexes(account);
CREATE INDEX trade_state_idx ON trade_with_indexes(state);
CREATE INDEX trade_amount_idx ON trade_with_indexes(amount);
EXPLAIN QUERY PLAN SELECT sum(amount) FROM trade_with_indexes WHERE account = 'acct-0042';
SELECT sum(amount) FROM trade_with_indexes WHERE account = 'acct-0042';
SELECT 'after_indexes' AS observation, name, count(*) AS pages FROM dbstat WHERE name IN ('trade_no_index', 'trade_with_indexes', 'trade_account_idx', 'trade_state_idx', 'trade_amount_idx') GROUP BY name ORDER BY name;
BEGIN;
.stats on
UPDATE trade_no_index SET amount = amount + 1 WHERE id BETWEEN 1 AND 4000;
.stats off
COMMIT;
BEGIN;
.stats on
UPDATE trade_with_indexes SET amount = amount + 1 WHERE id BETWEEN 1 AND 4000;
.stats off
COMMIT;
SELECT 'after_index_maintenance' AS observation, page_count, page_size FROM pragma_page_count, pragma_page_size;
.timer off
`,
      expectedResult:
        "The tables begin with equivalent contents and their account-0042 sums agree. After index creation, dbstat includes three additional named B-trees and the account lookup uses trade_account_idx. The indexed UPDATE reports more Virtual Machine Steps than the otherwise equivalent unindexed UPDATE. Exact pages, instruction totals and elapsed times vary; database-wide page_count cannot attribute growth to one table.",
      systemsLens:
        "PostgreSQL also pays for index maintenance, but SQLite funnels writes to all these objects through one file-wide writer. An index can improve read latency while reducing the write workload your embedded application can admit. Measure the affected columns and transaction duration before calling a larger index set an optimization.",
      challenge:
        "Drop trade_amount_idx, repeat the update, and compare the page growth and timer output. Which changed columns actually require index maintenance?",
      caution:
        "The two tables share one database, so page_count is a database-wide measure rather than an exact per-table size. Use dbstat when that optional virtual table is available and label the limitation.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.53.4",
      estimatedMinutes: 25,
      revision: 3,
    },
    {
      slug: "analyze-changes-plans",
      title: "Let ANALYZE replace a guess with observed statistics",
      difficulty: "advanced",
      tags: ["statistics", "query-planner", "observability"],
      prerequisites: ["index-read-write-tradeoff"],
      overview:
        "Create competing indexes whose usefulness differs sharply, inspect the plan before collecting statistics, then run ANALYZE. The lesson is how an embedded application's maintenance schedule shapes the planner's model—not a promise that every build will change its mind.",
      syntaxBreakdown: code`### In plain terms

The planner must choose a route before it knows which rows actually match. Without statistics it uses defaults; with statistics it has a compressed model of the data. We deliberately do not run PRAGMA optimize in setup, because that could collect the statistics whose absence this experiment needs.

### What you are learning

- **Selectivity:** An index that narrows 10,000 rows to about 100 is a better starting point here than one that narrows them to about 5,000.
- **Compressed statistics:** sqlite_stat1 describes average key populations, not every correlation or exact result.
- **Maintenance ownership:** An embedded application must decide when planner statistics are refreshed.

### Piece by piece

- **WITH RECURSIVE, CASE, printf, and %** create a controlled distribution. Only 100 rows use rare-region; half of those use common-kind, so the answer is 50.
- **CREATE INDEX** provides two competing single-column paths. Dropping and recreating the table removes its old indexes and statistics so the baseline is reproducible.
- **EXPLAIN QUERY PLAN** is run before and after ANALYZE. Record the chosen index even when both runs choose the same one; index choice is evidence, not an assertion we can demand of every future planner.
- **ANALYZE skewed_events** explicitly collects this table's index statistics. The experiment uses deterministic full analysis rather than relying on opportunistic maintenance.
- **sqlite_stat1(tbl, idx, stat)** stores one row per analyzed index here. The first integer in stat is the approximate total index rows; the next is the average rows sharing the first key column. A smaller second number means greater average selectivity.
- **PRAGMA optimize** is the application-oriented maintenance interface to consider after this experiment. It may run bounded ANALYZE work when useful; do not insert it before the baseline comparison.
- **The challenge's extra common-region rows** change the model's input. Record both the distribution and refreshed stat text; a stable plan can still be a correct response.`,
      setup: code`
DROP TABLE IF EXISTS skewed_events;
CREATE TABLE skewed_events(id INTEGER PRIMARY KEY, region TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL);
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 10000)
INSERT INTO skewed_events
SELECT x, CASE WHEN x <= 100 THEN 'rare-region' ELSE 'region-' || printf('%03d', x % 99) END,
  CASE WHEN x % 2 = 0 THEN 'common-kind' ELSE 'other-kind' END, 'body-' || x FROM n;
CREATE INDEX skewed_region_idx ON skewed_events(region);
CREATE INDEX skewed_kind_idx ON skewed_events(kind);
`,
      code: code`
EXPLAIN QUERY PLAN SELECT body FROM skewed_events WHERE region = 'rare-region' AND kind = 'common-kind';
SELECT count(*) AS expected_matches FROM skewed_events WHERE region = 'rare-region' AND kind = 'common-kind';
ANALYZE skewed_events;
SELECT tbl, idx, stat FROM sqlite_stat1 WHERE tbl = 'skewed_events' ORDER BY idx;
EXPLAIN QUERY PLAN SELECT body FROM skewed_events WHERE region = 'rare-region' AND kind = 'common-kind';
`,
      expectedResult:
        "The count is 50. After ANALYZE, sqlite_stat1 contains one row for each named index with cardinality text (the exact numbers are build/data dependent but show region is much more selective than kind). The post-ANALYZE plan uses skewed_region_idx; on this fixed 10,000-row dataset it is a reproducible change from the pre-statistics choice of skewed_kind_idx. If a build chooses region before ANALYZE, record that the plan did not change and use the stats to explain why rather than claiming a change that did not occur.",
      systemsLens:
        "Statistics are cached knowledge, and stale knowledge can produce poor decisions even when execution is correct. PostgreSQL can delegate statistics collection to server maintenance; with SQLite, connection lifecycle and application scheduling determine when that maintenance gets requested. Keep that ownership in your operational design.",
      challenge:
        "Insert 100,000 common-region rows, rerun ANALYZE, and compare the stats and plan. Predict the change before measuring it.",
      caution:
        "Do not edit sqlite_stat1 as a tuning shortcut in a lesson run. Statistics formats and planner decisions are implementation details; validate the chosen plan after each meaningful data-shape change.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.53.4",
      estimatedMinutes: 25,
      revision: 3,
    },
    {
      slug: "measure-the-writer-envelope",
      title: "Measure a workload-specific single-writer envelope",
      difficulty: "advanced",
      tags: ["transactions", "busy", "capacity", "backpressure"],
      prerequisites: ["analyze-changes-plans"],
      overview:
        "Run equal 40-row workloads with one persistent writer and different transaction sizes, then isolate a controlled contention window with a second writer. Every connection installs its own WAL, synchronization and wait policies. Treat the instrumented results as a bounded workload experiment, not SQLite's peak capacity.",
      syntaxBreakdown: code`### In plain terms

This exercise separates two costs often collapsed into one benchmark number: doing work under the writer reservation, and failing to obtain that reservation. The batching comparison changes transaction count while holding total rows fixed. The second experiment intentionally makes ten attempts fail before releasing the holder; it explains contention rather than simulating random production traffic.

### What you are learning

- **Fair comparison:** Count rows, transactions, settings, and connection lifetimes separately.
- **Admission outcome:** A busy attempt is not a completed transaction and must not disappear from the denominator.
- **Observer overhead:** Measuring every transaction through a shell adds polling, process-launch and logging costs.
- **Capacity boundary:** File-wide serialization is a mechanism; an acceptable workload envelope must include latency, errors, storage growth and recovery requirements.

### Piece by piece

- **set -eu, case, dirname, test, and mktemp -d** reject an absent or unsafe lab path and create a unique evidence directory. **rm -f** only clears explicitly named artifacts inside that newly created directory.
- **mkfifo and exec 4/5** feed commands to persistent sqlite3 processes. The shell keeps their input descriptors open so per-connection settings survive every transaction. **sqlite3 -bail** stops baseline workers on SQL errors; the racer deliberately continues after expected busy errors.
- **PRAGMA journal_mode=WAL, synchronous=NORMAL, wal_autocheckpoint=0, and busy_timeout** install the actual worker policies. NORMAL here is a workload choice, not a claim of power-loss durability; disabled automatic checkpointing makes live WAL growth observable.
- **BEGIN IMMEDIATE, WITH RECURSIVE, and COMMIT** admit one writer, generate a bounded batch, and publish it. Batch 1 runs 40 transactions; batch 10 runs four, both inserting 40 rows.
- **printf, grep -Fxq, seq, and bounded sleep loops** send commands and wait for complete READY/DONE marker lines. -F means literal matching, -x means a whole line, and -q suppresses output. Deadlines turn missing acknowledgments into errors instead of hanging forever.
- **date +%s%N** samples epoch nanoseconds around each send/wait cycle. **stat -c %s** reads WAL bytes while the writer is still open. These observer latencies include shell polling; they are not engine-only commit latency.
- **sort -n, wc -l, awk, and percentile ranks** order those observed samples and select p50/p95. The throughput denominator also includes instrumentation and final verification. **.timer on** retains separate SQLite statement timings in the worker log, not one aggregate transaction profile.
- **The unpaced phase** generates 4,000 identical INSERTs before timing, then feeds either 4,000 single-row transactions or 400 ten-row transactions to a persistent worker. The timer excludes file generation and connection setup; it includes SQL transport, parsing, execution and one final polling handshake. No per-transaction shell sampling runs in this phase. Both row counts and live WAL sizes are checked before closure, and rows/s is reported separately from the instrumented 40-row comparison.
- **The holder and racer** have separate connections. The holder reserves the writer until ten racer statements have returned busy, then commits its own row. Each racer attempt is one atomic INSERT, avoiding a failed BEGIN followed by accidentally autocommitted work.
- **grep error classification, wait status, and row assertions** require zero unexpected errors, ten busy attempts and ten committed racer rows. The final total is eleven including the holder. The mixed percentile combines failed waits and successful writes; inspect those populations separately for a production report.
- **trap, kill -0, kill -KILL, and wait** detect, terminate if necessary, and reap only processes this script created. Logs and latency samples remain at the printed evidence path.`,
      code: code`(
set -eu
db=${"$"}{TUTOR_SQLITE_DB:-}
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
parent=$(dirname -- "$db")
[ "$parent" != / ] && [ -d "$parent" ] && [ -w "$parent" ] || { echo 'database parent must be a writable non-root directory' >&2; exit 2; }
scratch=$(mktemp -d "$parent/sqlite-envelope.XXXXXX")
printf 'scratch_dir=%s\n' "$scratch"
pid=0; holder=0; racer=0
cleanup() { for process in "$pid" "$holder" "$racer"; do if [ "$process" -gt 0 ] && kill -0 "$process" 2>/dev/null; then kill -KILL "$process" 2>/dev/null || true; wait "$process" 2>/dev/null || true; fi; done; printf 'evidence_retained=%s\n' "$scratch"; }
trap cleanup EXIT

percentiles() {
  file=$1
  count=$(wc -l < "$file")
  [ "$count" -gt 0 ] || { echo 'observer_latency_samples=0 observer_p50_ns=NA observer_p95_ns=NA'; return; }
  p50=$(( (count + 1) / 2 )); p95=$(( (95 * count + 99) / 100 ));
  sort -n "$file" > "$file.sorted"
  awk -v p50="$p50" -v p95="$p95" '{ a[NR]=$1 } END { print "observer_latency_samples=" NR " observer_p50_ns=" a[p50] " observer_p95_ns=" a[p95] }' "$file.sorted"
}
run_persistent() {
  name=$1; batch=$2; total=$3; database="$scratch/$name-$batch.db"; fifo="$scratch/$name-$batch.fifo"; log="$scratch/$name-$batch.log"; samples="$scratch/$name-$batch.latency"
  rm -f "$database" "$database-wal" "$database-shm" "$fifo" "$log" "$samples"
  mkfifo "$fifo"
  sqlite3 -bail "$database" < "$fifo" > "$log" 2>&1 & pid=$!
  exec 4>"$fifo"
  printf '%s\n' "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=100; CREATE TABLE writes(id INTEGER PRIMARY KEY, worker TEXT, batch INTEGER, payload TEXT);" ".timer on" "SELECT 'READY';" >&4
  ready=0; for n in $(seq 1 100); do if grep -q READY "$log"; then ready=1; break; fi; sleep 0.01; done
  [ "$ready" -eq 1 ] || { echo "$name readiness deadline exceeded" >&2; return 3; }
  start_total=$(date +%s%N)
  for tx in $(seq 1 "$total"); do
    start=$(date +%s%N)
    printf '%s\n' "BEGIN IMMEDIATE; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < $batch) INSERT INTO writes(worker,batch,payload) SELECT '$name', $batch, 'row-' || x FROM n; COMMIT; SELECT 'DONE-$tx';" >&4
    done=0; for n in $(seq 1 100); do if grep -Fxq "DONE-$tx" "$log"; then done=1; break; fi; sleep 0.01; done
    [ "$done" -eq 1 ] || { echo "$name transaction $tx deadline exceeded" >&2; return 3; }
    end=$(date +%s%N); printf '%s\n' "$((end - start))" >> "$samples"
    printf '%s batch=%s txn=%02d observer_latency_ns=%s wal_bytes=%s\n' "$name" "$batch" "$tx" "$((end - start))" "$(stat -c '%s' "$database-wal" 2>/dev/null || echo 0)"
  done
  printf '.quit\n' >&4; exec 4>&-; wait "$pid"; pid=0
  busy=$(grep -ic 'database is locked' "$log" || true)
  unexpected=$(grep -Ei 'error|failed' "$log" | grep -Eiv 'database is locked' | wc -l || true)
  rows=$(sqlite3 "$database" "SELECT count(*) FROM writes WHERE worker='$name';")
  finish=$(date +%s%N); elapsed=$((finish - start_total)); throughput=$(awk -v rows="$rows" -v ns="$elapsed" 'BEGIN { if (ns > 0) printf "%.2f", rows/(ns/1000000000); else print "0" }')
  timer_lines=$(grep -c 'Run Time:' "$log" || true)
  [ "$busy" -eq 0 ] && [ "$unexpected" -eq 0 ] || { echo "$name produced an unexpected baseline error; inspect $log" >&2; return 4; }
  [ "$rows" -eq "$((total * batch))" ] || { echo 'baseline row assertion failed' >&2; return 4; }
  printf '%s attempts=%s successes=%s busy=%s unexpected_errors=%s rows=%s throughput_rows_s=%s engine_timer_lines=%s ' "$name" "$total" "$total" "$busy" "$unexpected" "$rows" "$throughput" "$timer_lines"
  percentiles "$samples"
}
echo '--- one persistent writer, same SQL settings, batch sizes 1 and 10 ---'
run_persistent single 1 40
run_persistent single 10 4
echo '--- unpaced comparison: pre-generated 4000-row workloads, no per-transaction polling ---'
for batch in 1 10; do
  database="$scratch/unpaced-$batch.db"; fifo="$scratch/unpaced-$batch.fifo"; log="$scratch/unpaced-$batch.log"
  workload="$scratch/unpaced-$batch.sql"; transactions=$((4000 / batch))
  awk -v batch="$batch" -v txs="$transactions" 'BEGIN {
    for (t=1; t<=txs; t++) {
      print "BEGIN IMMEDIATE;";
      for (i=1; i<=batch; i++) print "INSERT INTO writes VALUES (" ((t-1)*batch+i) ");";
      print "COMMIT;";
    }
  }' > "$workload"
  mkfifo "$fifo"
  sqlite3 -bail "$database" < "$fifo" > "$log" 2>&1 & pid=$!
  exec 4>"$fifo"
  printf '%s\n' 'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=100; CREATE TABLE writes(id INTEGER PRIMARY KEY);' "SELECT 'READY';" >&4
  ready=0; for n in $(seq 1 200); do if grep -Fxq READY "$log"; then ready=1; break; fi; sleep 0.01; done
  [ "$ready" -eq 1 ] || { echo 'unpaced readiness deadline exceeded' >&2; exit 3; }
  started=$(date +%s%N)
  cat "$workload" >&4
  printf "%s\n" "SELECT 'WORK_DONE';" >&4
  done=0; for n in $(seq 1 1000); do if grep -Fxq WORK_DONE "$log"; then done=1; break; fi; sleep 0.01; done
  [ "$done" -eq 1 ] || { echo 'unpaced workload deadline exceeded' >&2; exit 3; }
  elapsed=$(( $(date +%s%N) - started ))
  wal_bytes=$(stat -c '%s' "$database-wal")
  printf '%s\n' "SELECT 'ROWS=' || count(*) FROM writes;" '.quit' >&4
  exec 4>&-; wait "$pid"; pid=0
  grep -Fxq 'ROWS=4000' "$log" || { echo 'unpaced row assertion failed' >&2; exit 4; }
  awk -v batch="$batch" -v txs="$transactions" -v ns="$elapsed" -v wal="$wal_bytes" 'BEGIN { printf "unpaced batch=%d transactions=%d rows=4000 elapsed_ns=%.0f throughput_rows_s=%.2f live_wal_bytes=%s\n", batch, txs, ns, 4000/(ns/1000000000), wal; }'
done
echo '--- two persistent writers: holder owns first half, then releases by marker ---'
database="$scratch/two.db"; fifo_a="$scratch/a.fifo"; fifo_b="$scratch/b.fifo"; log_a="$scratch/a.log"; log_b="$scratch/b.log"; samples="$scratch/racer.latency"
sqlite3 "$database" 'PRAGMA journal_mode=WAL; CREATE TABLE writes(id INTEGER PRIMARY KEY, worker TEXT, batch INTEGER, payload TEXT);' >/dev/null
mkfifo "$fifo_a" "$fifo_b"; sqlite3 "$database" < "$fifo_a" > "$log_a" 2>&1 & holder=$!; sqlite3 "$database" < "$fifo_b" > "$log_b" 2>&1 & racer=$!
exec 4>"$fifo_a"; exec 5>"$fifo_b"
printf '%s\n' "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=0; BEGIN IMMEDIATE; INSERT INTO writes(worker,batch,payload) VALUES ('holder',1,'lock');" "SELECT 'HOLDER_READY';" ".timer on" >&4
ready=0; for n in $(seq 1 100); do if grep -Fxq HOLDER_READY "$log_a"; then ready=1; break; fi; sleep 0.01; done
[ "$ready" -eq 1 ] || { echo 'holder readiness deadline exceeded' >&2; exit 3; }
printf '%s\n' "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=50;" "SELECT 'RACER_READY';" ".timer on" >&5
ready=0; for n in $(seq 1 100); do if grep -Fxq RACER_READY "$log_b"; then ready=1; break; fi; sleep 0.01; done
[ "$ready" -eq 1 ] || { echo 'racer readiness deadline exceeded' >&2; exit 3; }
: > "$samples"
for tx in $(seq 1 20); do
  start=$(date +%s%N)
  printf '%s\n' "INSERT INTO writes(worker,batch,payload) VALUES ('racer',1,'row-$tx'); SELECT 'RACER-DONE-$tx';" >&5
  done=0; for n in $(seq 1 100); do if grep -Fxq "RACER-DONE-$tx" "$log_b"; then done=1; break; fi; sleep 0.01; done
  [ "$done" -eq 1 ] || { echo "racer transaction $tx deadline exceeded" >&2; exit 3; }
  end=$(date +%s%N); printf '%s\n' "$((end - start))" >> "$samples"
  printf 'racer txn=%02d observer_latency_ns=%s wal_bytes=%s\n' "$tx" "$((end - start))" "$(stat -c '%s' "$database-wal" 2>/dev/null || echo 0)"
  [ "$tx" -eq 10 ] && { printf '%s\n' "COMMIT; SELECT 'HOLDER_RELEASED';" '.quit' >&4; exec 4>&-; holder_status=0; wait "$holder" || holder_status=$?; holder=0; [ "$holder_status" -eq 0 ] || { echo "holder exited unexpectedly; inspect $log_a" >&2; exit 4; }; }
done
printf '.quit\n' >&5; exec 5>&-; racer_status=0; wait "$racer" || racer_status=$?; racer=0
busy=$(grep -ic 'database is locked' "$log_b" || true); unexpected=$(grep -Ei 'error|failed' "$log_b" | grep -Eiv 'database is locked' | wc -l || true)
rows=$(sqlite3 "$database" "SELECT count(*) FROM writes WHERE worker='racer';")
timer_lines=$(grep -c 'Run Time:' "$log_b" || true)
[ "$unexpected" -eq 0 ] || { echo "unexpected racer error; inspect $log_b" >&2; exit 4; }
[ "$racer_status" -le 1 ] && [ "$busy" -eq 10 ] && [ "$rows" -eq 10 ] || { echo 'contention outcome assertion failed' >&2; exit 4; }
[ "$(sqlite3 "$database" 'SELECT count(*) FROM writes;')" -eq 11 ] || { echo 'final row assertion failed' >&2; exit 4; }
printf 'two_writer attempts=20 successes=%s busy=%s unexpected_errors=%s rows=%s engine_timer_lines=%s ' "$((rows))" "$busy" "$unexpected" "$rows" "$timer_lines"; percentiles "$samples"
printf 'two_writer final_rows=%s final_wal_bytes=%s logs=%s,%s\n' "$(sqlite3 "$database" 'SELECT count(*) FROM writes;')" "$(stat -c '%s' "$database-wal" 2>/dev/null || echo 0)" "$log_a" "$log_b"
)`,
      expectedResult:
        "Both single-writer runs assert 40 rows, zero busy errors and zero unexpected errors: batch 1 has 40 successful transactions, batch 10 has four. Each prints observer latency p50/p95, instrumented rows/s and engine timer-line counts. The additional unpaced runs both assert 4000 rows, using 4000 versus 400 transactions, and report workload rows/s plus live WAL bytes. In the distinct contention experiment, exactly 20 racer attempts split into ten busy outcomes and ten successes; final_rows is 11 including the holder. WAL bytes are measured live; final WAL may be zero after all connections close. Timing ratios are host- and instrumentation-dependent, not a required outcome or a peak-throughput estimate.",
      systemsLens:
        "Batching trades fewer commits for longer writer occupancy and a larger retry unit. Busy timeout is a bounded admission wait, not extra write capacity. Carry the mechanism into an architecture decision, but obtain sustained, minimally instrumented measurements of the actual workload before claiming that its latency/error budgets fit.",
      challenge:
        "Keep the total row count fixed while changing batch size. Then repeat the contention case with busy_timeout 100: predict the first ten outcomes and total waiting before measuring. For the ADR, adapt the supplied unpaced phase to a representative workload and separate successful transaction latency from rejected admission latency; label measurements you have not made.",
      studyCheckpoint: {
        core: [
          {
            source: "[SQLite Query Planning](https://sqlite.org/queryplanner.html)",
            locator:
              "Sections 1.1–1.3 (Tables Without Indices, Lookup By Rowid, Lookup By Index), 1.6–1.7 (Multi-Column Indices, Covering Indexes), 2 (Sorting), 3 (Searching And Sorting At The Same Time), and 4 (WITHOUT ROWID tables)",
          },
        ],
        optionalDepth: [
          {
            source:
              "[SQLite: Past, Present, and Future](https://www.vldb.org/pvldb/vol15/p3535-gaffney.pdf)",
            locator: "Section 2, “Architecture”",
          },
        ],
        rationale:
          "Across lessons 38–41 you observed scans become searches, measured index read/write costs, let ANALYZE change a plan, and measured a workload-specific writer envelope. Read these sections before continuing to connect that evidence to search cost, locality, sorting work, and the trade-offs behind WITHOUT ROWID; the paper is optional historical context, not a source of current benchmark promises.",
      },
      caution:
        "Use only the printed disposable evidence directory. The holder releases after ten acknowledged attempts, not a guessed sleep interval. This instrumented CLI fixture excludes realistic arrivals, host crashes and power loss; its throughput is not a sizing recommendation.",
      safetyLevel: "locking",
      runIn: "shell",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 3,
      estimatedMinutes: 30,
    },
  ],
};
