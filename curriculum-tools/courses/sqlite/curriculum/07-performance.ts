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
      prerequisites: ["integrity-and-domain-checks"],
      overview:
        "Build a moderately large table and ask SQLite to describe the same selective lookup before and after adding an index. Read the compact EXPLAIN QUERY PLAN vocabulary directly: SCAN means the table is visited broadly, SEARCH means an indexed or rowid-constrained lookup is available, and USING COVERING INDEX means the index contains every selected column. The output is access-path evidence, not a runtime profile or a promise that one plan is faster on every workload; the timer is supporting context.",
      syntaxBreakdown:
        "### In plain terms\n\nThis experiment answers a SQLite-specific question: after an index is added, does EXPLAIN QUERY PLAN show a different way to reach the matching rows, and does that way avoid looking up the table for the requested payload? The words SCAN, SEARCH, and USING COVERING INDEX are compact descriptions of the access path. They do not report elapsed time, cache misses, pages touched, or a stable cost estimate, so the timer is only a secondary observation.\n\n### What you are learning\n\n- **SCAN versus SEARCH:** SCAN describes a broad walk through the table, while SEARCH says SQLite has a constrained lookup path for the predicate; neither word alone is a latency measurement.\n- **USING COVERING INDEX:** A covering index contains the filtered and selected columns, so SQLite can satisfy this query from the index without a separate table-row lookup.\n- **Plan boundaries:** The plan text is SQLite's access-path evidence for this statement, schema, and data shape; changing selectivity or ordering can add a different step even when an index exists.\n- **Timing as context:** **.timer on** and **.timer off** expose CLI wall-clock measurements, which vary with machine, cache, and run order and therefore support rather than replace the plan evidence.\n\n### Piece by piece\n\n- **DROP TABLE IF EXISTS** and **DROP INDEX IF EXISTS** (idempotent SQLite DDL)\n  - What they are: Cleanup statements whose IF EXISTS clause suppresses an error when the named object is absent.\n  - What they do here: They make setup safe to rerun by removing the prior plan_events table and its prior index before rebuilding the experiment.\n  - What they give us: A known schema, so SCAN in the first plan is evidence that no leftover index is being used.\n\n- **WITH RECURSIVE** (SQL recursive common-table expression)\n  - What it is: A query-local generator that repeatedly applies a `SELECT` until its `WHERE` condition is false.\n  - What it does here: It creates the integers 1 through 20,000 for the test workload.\n  - What it gives us: A repeatable enough table size and tenant distribution for the before/after access-path comparison.\n\n- **printf** (SQLite formatting function)\n  - What it is: A SQLite function that formats values using printf-style placeholders.\n  - What it does here: It makes tenant names repeat every 100 rows and gives payloads fixed-width numeric suffixes.\n  - What it gives us: The predicate `tenant = 'tenant-37'` matches 200 rows, while the generated values remain easy to recognize in the plan experiment.\n\n- **PRAGMA optimize** (SQLite maintenance command)\n  - What it is: A request for SQLite to perform appropriate lightweight planner maintenance for the current connection and database.\n  - What it does here: It leaves the setup in a normal optimized state before the plans are inspected.\n  - What it gives us: A realistic starting point without claiming that it supplies runtime measurements or replaces explicit index creation.\n\n- **.timer on** and **.timer off** (sqlite3 CLI dot commands)\n  - What they are: CLI controls for printing elapsed wall-clock timing around statements.\n  - What they do here: They bracket the two plan inspections and count queries so timing can be compared as supporting context.\n  - What they give us: Host- and cache-dependent measurements; the durable evidence is the plan text, not a particular time.\n\n- **EXPLAIN QUERY PLAN** (SQLite statement prefix)\n  - What it is: A SQLite-specific explanation mode that reports the selected access-path steps without running the query for its result set.\n  - What it does here: Before the index it should expose `SCAN plan_events`; afterward it should expose `SEARCH plan_events USING COVERING INDEX plan_events_tenant_idx` for the same predicate and ordering.\n  - What it gives us: The detail column's SCAN/SEARCH wording, index name, and covering-index claim. It does not give elapsed time, rows actually visited, cache state, or a universal cost ranking.\n\n- **CREATE INDEX plan_events_tenant_idx ON plan_events(tenant, event_id, payload)** (DDL statement)\n  - What it is: A persistent SQLite B-tree access path ordered by the listed columns.\n  - What it does here: It puts the filter column first, preserves event order within each tenant, and stores the selected payload as the trailing index column.\n  - What it gives us: The named index that changes the second plan to an indexed search and can cover this query's selected column.\n\n- **ORDER BY event_id** (SQL ordering clause)\n  - What it is: A request for result rows in ascending event-id order.\n  - What it does here: It makes the index column order part of the evidence rather than testing only the equality predicate.\n  - What it gives us: A way to notice when a later predicate variation needs additional sorting work, even if the plan still says SEARCH.\n\n- **count(*) AS matching_rows** (SQLite aggregate expression)\n  - What it is: A row-count aggregate with a label for its output column.\n  - What it does here: It confirms that adding the index changes the access path, not the logical result: the tenant predicate still matches 200 rows.\n  - What it gives us: The checkable `matching_rows` value that anchors the plan comparison to the same result set.",
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
SELECT count(*) AS matching_rows FROM plan_events WHERE tenant = 'tenant-37';
CREATE INDEX plan_events_tenant_idx ON plan_events(tenant, event_id, payload);
EXPLAIN QUERY PLAN SELECT payload FROM plan_events WHERE tenant = 'tenant-37' ORDER BY event_id;
SELECT count(*) AS matching_rows FROM plan_events WHERE tenant = 'tenant-37';
.timer off
`,
      expectedResult:
        "The first plan contains SCAN plan_events and the second contains SEARCH plan_events USING COVERING INDEX plan_events_tenant_idx (or an equivalent indexed search). Both counts are 200. Timing is workload- and machine-dependent, so use it only as supporting evidence; the access-path change is the durable observation.",
      systemsLens:
        "SQLite's EXPLAIN QUERY PLAN is a compact access-path interface: SCAN and SEARCH tell you whether the planner chose a broad walk or a constrained lookup, and USING COVERING INDEX tells you that the requested columns can come from the index itself. This is evidence about the mechanism SQLite selected for one statement, schema, and data shape; it does not measure execution time, cache behavior, pages touched, or external effects. Systems engineers should pair this SQLite-specific evidence with workload measurements, just as they pair a storage or network mechanism with an observed service-level result.",
      challenge:
        "Run the indexed query with the SQLite range predicate `WHERE tenant >= 'tenant-50'` so roughly half the table qualifies. Predict whether EXPLAIN QUERY PLAN still reports SEARCH, whether it adds a temporary sort for ORDER BY event_id, and what the result count should be; then compare the plan text first and the timer only as supporting evidence. This tests where SQLite's access-path description changes as selectivity and ordering pressure change, rather than asking for a universal index-speed threshold.",
      caution:
        "Do not infer a universal speedup from one warm-cache run. Keep the data size, SQLite build, cache state, and predicate visible when recording a result.",
      safetyLevel: "ddl",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 2,
      estimatedMinutes: 20,
    },
    {
      slug: "index-read-write-tradeoff",
      title: "Measure the read and write cost of indexes",
      difficulty: "intermediate",
      tags: ["indexes", "pages", "write-amplification", "capacity"],
      prerequisites: ["query-plan-as-evidence"],
      overview:
        "Populate equivalent indexed and unindexed tables, compare their page footprints and lookup plans, then apply the same batch update to each. An index is a materialized access path whose maintenance is part of the write cost.",
      syntaxBreakdown:
        "PRAGMA page_count and page_size expose the database's current page footprint. EXPLAIN QUERY PLAN exposes whether a named index is used. A transaction makes the batch update one measured unit.",
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
UPDATE trade_no_index SET amount = amount + 1 WHERE id BETWEEN 1 AND 4000;
COMMIT;
BEGIN;
UPDATE trade_with_indexes SET amount = amount + 1 WHERE id BETWEEN 1 AND 4000;
COMMIT;
SELECT 'after_index_maintenance' AS observation, page_count, page_size FROM pragma_page_count, pragma_page_size;
.timer off
`,
      expectedResult:
        "The before_indexes dbstat rows show only the two table objects. After creating indexes, dbstat adds trade_account_idx, trade_state_idx, and trade_amount_idx pages, and the indexed lookup shows SEARCH trade_with_indexes USING INDEX trade_account_idx. The two sums are equal. Exact page counts and elapsed times vary, but added index pages and extra update maintenance are the observed trade-off.",
      systemsLens:
        "Indexes are materialized views: they reduce read amplification for matching predicates but consume capacity and add work to every affected insert, update, and delete. Capacity planning must include both sides of that trade.",
      challenge:
        "Drop trade_amount_idx, repeat the update, and compare the page growth and timer output. Which changed columns actually require index maintenance?",
      caution:
        "The two tables share one database, so page_count is a database-wide measure rather than an exact per-table size. Use dbstat when that optional virtual table is available and label the limitation.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.53.4",
      estimatedMinutes: 25,
    },
    {
      slug: "analyze-changes-plans",
      title: "Let ANALYZE replace a guess with observed statistics",
      difficulty: "advanced",
      tags: ["statistics", "query-planner", "observability"],
      prerequisites: ["index-read-write-tradeoff"],
      overview:
        "Create a deliberately skewed two-column workload with two competing indexes. Compare the plan before and after ANALYZE and inspect sqlite_stat1 so the optimizer's model becomes visible rather than mystical.",
      syntaxBreakdown:
        "ANALYZE records sampled cardinality in sqlite_stat1. EXPLAIN QUERY PLAN reports the selected index. sqlite_stat1 is ordinary queryable metadata, but applications should treat its format as planner statistics rather than an API for hand editing.",
      setup: code`
DROP TABLE IF EXISTS skewed_events;
CREATE TABLE skewed_events(id INTEGER PRIMARY KEY, region TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL);
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 10000)
INSERT INTO skewed_events
SELECT x, CASE WHEN x <= 100 THEN 'rare-region' ELSE 'region-' || printf('%03d', x % 99) END,
  CASE WHEN x % 2 = 0 THEN 'common-kind' ELSE 'other-kind' END, 'body-' || x FROM n;
CREATE INDEX skewed_region_idx ON skewed_events(region);
CREATE INDEX skewed_kind_idx ON skewed_events(kind);
PRAGMA optimize;
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
        "An optimizer acts on a compressed and potentially stale model of reality. ANALYZE is an observability and maintenance operation: it can improve decisions, but only while its statistics still represent the workload.",
      challenge:
        "Insert 100,000 common-region rows, rerun ANALYZE, and compare the stats and plan. Predict the change before measuring it.",
      caution:
        "Do not edit sqlite_stat1 as a tuning shortcut in a lesson run. Statistics formats and planner decisions are implementation details; validate the chosen plan after each meaningful data-shape change.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.53.4",
      estimatedMinutes: 25,
    },
    {
      slug: "measure-the-writer-envelope",
      title: "Measure a workload-specific single-writer envelope",
      difficulty: "advanced",
      tags: ["transactions", "busy", "capacity", "backpressure"],
      prerequisites: ["analyze-changes-plans"],
      overview:
        "Run bounded autocommit and batched writes against a disposable rollback-mode database, then launch two bounded writer processes. Record throughput and busy outcomes for this filesystem instead of inventing a universal SQLite limit.",
      syntaxBreakdown:
        "sqlite3 -cmd applies PRAGMAs before a script. .timer reports CLI timing. timeout bounds a process so contention cannot leave a lesson hanging. BEGIN and COMMIT define the unit over which the writer lock and durability work are amortized.",
      code: code`
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
parent=$(dirname -- "$db")
if [ "$parent" = / ] || [ ! -d "$parent" ] || [ ! -w "$parent" ]; then echo 'database parent must be an existing writable non-root directory' >&2; exit 2; fi
if [ -L "$db" ] || { [ -e "$db" ] && [ ! -f "$db" ]; }; then echo 'database path must not be a symlink or non-regular file' >&2; exit 2; fi
base=$db
lab_dir=$(dirname -- "$base")
db=$lab_dir/writer-envelope.sqlite
rm -f "$db" "$db-journal" "$db-wal" "$db-shm"
sqlite3 "$db" 'PRAGMA journal_mode=DELETE; CREATE TABLE writes(id INTEGER PRIMARY KEY, worker TEXT, payload TEXT);'

echo '--- autocommit: 200 transactions ---'
time sh -c 'i=1; while [ "$i" -le 200 ]; do sqlite3 "$1" "INSERT INTO writes(worker,payload) VALUES ('\''auto'\'', $i);" >/dev/null; i=$((i + 1)); done' sh "$db"
echo '--- one batch: 200 rows ---'
time sqlite3 "$db" <<'SQL'
BEGIN;
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 200)
INSERT INTO writes(worker, payload) SELECT 'batch', x FROM n;
COMMIT;
SQL
echo '--- two competing writers: holder keeps the lock 1 s, racer budget 100 ms per attempt ---'
(printf '%s\n' "PRAGMA busy_timeout=0; BEGIN IMMEDIATE; INSERT INTO writes(worker,payload) VALUES ('holder','lock');"; sleep 1; printf '%s\n' 'ROLLBACK;') | sqlite3 "$db" >/dev/null &
holder=$!
sleep 0.2
set +e
time timeout 5 sh -c 'i=1; while [ "$i" -le 50 ]; do sqlite3 "$1" "PRAGMA busy_timeout=100; BEGIN IMMEDIATE; INSERT INTO writes(worker,payload) VALUES ('\''racer'\'', $i); COMMIT;" >/dev/null 2>&1 || echo busy; i=$((i + 1)); done' sh "$db" >"$lab_dir/writer-racer.out"
racer_status=$?
set -e
wait "$holder"
printf 'racer_exit=%s busy_attempts=%s racer_rows=%s rows=%s pages=%s\n' "$racer_status" "$(wc -l < "$lab_dir/writer-racer.out")" "$(sqlite3 "$db" "SELECT count(*) FROM writes WHERE worker='racer'")" "$(sqlite3 "$db" 'SELECT count(*) FROM writes')" "$(sqlite3 "$db" 'PRAGMA page_count')"
rm -f "$db" "$db-journal" "$db-wal" "$db-shm"
`,
      expectedResult:
        "The script prints timings for 200 autocommit transactions and one 200-row transaction; the batch takes far less transaction-boundary work than autocommit (on the validated host about 0.15 s versus several seconds). The competing-writer run then prints racer_exit=0 with busy_attempts plus racer_rows equal to 50: while the holder keeps the lock for its first second, each 100 ms attempt fails (about 7 to 9 busy attempts), and every attempt after the holder rolls back succeeds, so rows is 400 plus racer_rows. Record the exact host-specific numbers as the measured envelope; a racer_exit of 124 means the 5 s bound cut the loop short and the host is slower than expected.",
      systemsLens:
        "SQLite has one writer at a time. Batching amortizes commit work, while competing writers turn the serialization point into a queue whose throughput, wait budget, and failure rate must be measured for the actual workload: the same 50 attempts split into failures and successes purely by when the holder released.",
      challenge:
        "Repeat with batches of 10, 50, and 500 and graph rows per second against batch size. Then raise the racer's busy_timeout to 2000 and predict busy_attempts and the total elapsed time before running it.",
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
          "Across lessons 35–38 you observed scans become searches, measured index read/write costs, let ANALYZE change a plan, and measured a workload-specific writer envelope. Read these sections before continuing to connect that evidence to search cost, locality, sorting work, and the trade-offs behind WITHOUT ROWID; the paper is optional historical context, not a source of current benchmark promises.",
      },
      caution:
        "Run this only with a uniquely named disposable path. The holder releases its lock by rolling back after one second, the racer loop is bounded by timeout, and the outputs are workload evidence, not a durability or power-loss test.",
      safetyLevel: "locking",
      runIn: "shell",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 3,
      estimatedMinutes: 30,
    },
  ],
};
