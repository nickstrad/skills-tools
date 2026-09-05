import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function amplification(noop: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\nnoop_comparison = ${noop ? "True" : "False"}\n` + code`
rows = 200
reports = []

def fixture(indexed=False):
    sql("drop table if exists amp")
    sql("create table amp(id int primary key, amount int, payload text) "
        "with (fillfactor=50,autovacuum_enabled=false)")
    sql("insert into amp select g,g,repeat('x',40) from generate_series(1,200) g")
    if indexed:
        sql("create index amp_amount_idx on amp(amount)")
    sql("vacuum amp")

def measure(label, script, useful_rows, expected_commits):
    # The script file and all initial table/index contents exist BEFORE measured boundaries.
    source = root / (label + ".sql")
    source.write_text(script + "\n")
    sql("checkpoint")
    lower = sql("select pg_current_wal_insert_lsn()")
    run([str(bindir / "psql"), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(source)], 30)
    upper = sql("select pg_current_wal_insert_lsn()")
    sql("insert into amp_flush default values")
    assert sql("select pg_current_wal_flush_lsn() >= '" + upper + "'::pg_lsn") == "t"
    # Guarded no-op may produce no WAL at all; do not ask the decoder to find a nonexistent record.
    record_sql = "select * from pg_get_wal_records_info('" + lower + "','" + upper + "')"
    if lower == upper:
        records = []
    else:
        records = json.loads(sql("select coalesce(json_agg(r),'[]') from (select xid::text,resource_manager,"
            "record_type,record_length,fpi_length from (" + record_sql + ") w) r"))
    commits = sum(r["resource_manager"] == "Transaction" and r["record_type"] == "COMMIT" for r in records)
    assert commits == expected_commits, (label, commits, expected_commits)
    heap = [] if lower == upper else json.loads(sql("select coalesce(json_agg(b),'[]') from "
        "(select distinct start_lsn,resource_manager,record_type,record_length from "
        "pg_get_wal_block_info('" + lower + "','" + upper + "',false) where "
        "reldatabase=(select oid from pg_database where datname=current_database()) and "
        "relfilenode=pg_relation_filenode('amp') and relforknumber=0) b"))
    grouped = {}
    for r in records:
        key = r["resource_manager"] + "/" + r["record_type"]
        group = grouped.setdefault(key, dict(records=0, bytes=0, image_bytes=0))
        group["records"] += 1
        group["bytes"] += r["record_length"]
        group["image_bytes"] += r["fpi_length"]
    interval = int(sql("select pg_wal_lsn_diff('" + upper + "','" + lower + "')"))
    result = dict(label=label, useful_rows=useful_rows, interval_bytes=interval,
        interval_bytes_per_row=round(interval/useful_rows, 2), commit_records=commits,
        record_bytes=sum(r["record_length"] for r in records), records=grouped,
        owned_heap_records=len(heap),
        owned_heap_record_bytes=sum(r["record_length"] for r in heap),
        owned_heap_bytes_per_row=round(sum(r["record_length"] for r in heap)/useful_rows, 2),
        commit_record_bytes=sum(r["record_length"] for r in records if r["resource_manager"] == "Transaction" and r["record_type"] == "COMMIT"),
        owned_heap_hot=sum(r["record_type"] == "HOT_UPDATE" for r in heap),
        owned_heap_updates=sum(r["record_type"] in ("HOT_UPDATE", "UPDATE") for r in heap))
    # Decode details retained separately; interval bytes include address-space and catalog overhead.
    (root / (label + "-records.json")).write_text(json.dumps(dict(lower=lower,upper=upper,records=records,heap=heap),indent=2))
    reports.append(result)
    return result

def verify(delta=0, payload="x"*40):
    answer = json.loads(sql("select json_build_object('rows',count(*),'distinct_ids',count(distinct id),"
        "'min_id',min(id),'max_id',max(id),'amount',sum(amount),"
        "'bad_rows',count(*) filter(where amount is distinct from id+" + str(delta) + " or payload is distinct from '" + payload + "')) from amp"))
    assert answer == dict(rows=200, distinct_ids=200, min_id=1, max_id=200,
        amount=20100 + 200*delta, bad_rows=0), answer
    return answer

try:
    start()
    sql("create extension pg_walinspect")
    sql("create table amp_flush(id int generated always as identity)")
    if not noop_comparison:
        # Exactly the same empty heap shape, row values, and absence of indexes in all four trials.
        inserts = ["insert into amp values(" + str(i) + "," + str(i) + ",repeat('x',40));" for i in range(1,rows+1)]
        copy_rows = [str(i) + "\t" + str(i) + "\t" + "x"*40 for i in range(1,rows+1)]
        cases = [
            ("insert_select", "insert into amp select g,g,repeat('x',40) from generate_series(1,200) g;", 1),
            ("insert_loop_one_tx", "begin;\n" + "\n".join(inserts) + "\ncommit;", 1),
            ("insert_autocommit", "\n".join(inserts), 200),
            ("copy_one_tx", "copy amp from stdin;\n" + "\n".join(copy_rows) + "\n\\.", 1),
        ]
        for label, script, commits in cases:
            sql("drop table if exists amp")
            sql("create table amp(id int, amount int, payload text) with (fillfactor=50,autovacuum_enabled=false)")
            result = measure(label, script, rows, commits)
            result["outcome"] = verify()
        for indexed in (False, True):
            fixture(indexed)
            result = measure("update_indexed" if indexed else "update_plain", "update amp set amount=amount+1;", rows, 1)
            result["outcome"] = verify(1)
            assert result["owned_heap_updates"] == rows
            assert result["owned_heap_hot"] == (0 if indexed else rows)
        # A structural write has a different output denominator: a new index over the same200 rows.
        fixture(False)
        result = measure("build_amount_index", "create index amp_amount_idx on amp(amount);", rows, 1)
        result["outcome"] = verify()
        result["index_bytes"] = int(sql("select pg_relation_size('amp_amount_idx')"))
        assert sql("select indisvalid and indisready from pg_index where indexrelid='amp_amount_idx'::regclass") == "t"
    else:
        # Both methods request the same200 final row values. Only the no-change guard differs.
        for guarded in (False, True):
            fixture(False)
            query = "update amp set amount=id" + (" where amount is distinct from id" if guarded else "") + ";"
            result = measure("noop_guarded" if guarded else "noop_unconditional", query, rows, 0 if guarded else 1)
            result["outcome"] = verify()
            assert result["owned_heap_updates"] == (0 if guarded else rows)
    for report in reports:
        print(json.dumps(report, sort_keys=True), flush=True)
    (root / "results.json").write_text(json.dumps(reports, indent=2))
    print("PASS: matched initial layouts, verified final rows and measured transaction/heap records.", flush=True)
finally:
    stop()
    print("Private server stopped; retained scripts, record details and results at", root, flush=True)
PY`;
}

export const WAL_AMPLIFICATION_VARIATION = amplification(true);
export const WAL_AMPLIFICATION: Draft = {
  slug: "wal-size-of-operations",
  revision: 4,
  tags: ["wal", "write-amplification", "hot-updates", "capacity"],
  title: "WAL cost per verified row: ingestion, indexes and avoided writes",
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 30,
  prerequisites: [
    "every-change-is-a-wal-record",
    "hot-updates-and-fillfactor",
    "commit-means-fsync",
  ],
  overview: code`
Compare how much physical work different write paths require to produce the same200 rows. Start
from fresh matching layouts, separate transaction batching from bulk loading, then change only a
secondary index for the same update. Use record evidence and verified final values to decide which
costs could matter to an archive, replica or migration workload.`,
  reading:
    code`PostgreSQL 14 Internals, Chapter 11 "WAL Modes" (sections "Fault Tolerance", "WAL Levels"); Chapter 5 "Page Pruning and HOT Updates" (section "HOT Updates")`,
  readingNotes: code`
The book supplies WAL-mode and HOT eligibility mechanisms. It does not directly price these
COPY/INSERT/batching comparisons; the measured workload extends that background. Read Chapter5
again if the same amount update produces different index work in the two matched fixtures.`,
  caution: code`
Run the complete script in a shell with Python3 and PostgreSQL server binaries plus pg_walinspect.
PGBIN may choose the binary directory. The embedded helper creates a unique /tmp/pg-owned-* cluster
and socket, disables TCP, clears inherited PG connection settings and stops only its own server.
Root uses the postgres OS account via runuser; non-root uses the invoking account. The printed
stopped directory retains SQL inputs, raw record details and results for inspection and later
removal. fsync, synchronous_commit and full_page_writes stay enabled.`,
  syntaxBreakdown: code`
### In plain terms

A fair byte comparison first requires equivalent useful work. Each ingestion method loads the same
values into a newly created heap with no indexes, and every update starts from the same rows. The
secondary-index comparison changes whether amount is indexed; the guarded variation changes only
whether PostgreSQL is asked to write tuples whose values already satisfy the request.

### What you are learning

- **Statement versus transaction batching:** fewer SQL statements and fewer transaction decisions
  are separate changes, with different physical record consequences.
- **Bulk insertion:** COPY can group tuples into physical multi-insert records.
- **Index maintenance:** an index on a changed column prevents the HOT path used by the matched plain case.
- **Avoided writes:** a guard can preserve the same requested result while generating no tuple updates.

### Piece by piece

- **python3** runs the supplied complete driver. The included owned-cluster helper uses
  **tempfile.mkdtemp**, **PGBIN** or **pg_config --bindir** and an isolated socket. **runuser -u ... --**
  and **os.chown** select the postgres OS owner only for a root invocation.
- **initdb -D ... -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** chooses the allocated data directory, names its database superuser, confines local
  trusted access behind the private directory, rejects host authentication, removes locale variation,
  enables page checksums and limits segments to1MB. TCP is disabled by listen_addresses.
- **pg_ctl -D ... -l ... -w -t20 start** starts that server with a retained log and bounded wait;
  **-m fast stop** disconnects clients and shuts it down in finally. Driver subprocesses and observer
  queries have deadlines through Python timeouts, PGCONNECT_TIMEOUT, statement_timeout and lock_timeout.
- **fillfactor=50** reserves page space so this one-update-per-row fixture can remain HOT when the
  changed column is unindexed. **autovacuum_enabled=false** suppresses background table maintenance.
  **VACUUM** prepares each populated update fixture before its measured boundary.
- **psql -X -q -v ON_ERROR_STOP=1 -f** ignores personal startup commands, suppresses command tags,
  fails on SQL errors and reads the owned SQL file. Unlike multiple commands inside one **-c** string,
  individual unwrapped file statements each receive their own autocommit transaction.
- **INSERT SELECT** uses one statement and transaction; the generated200 INSERT statements are
  either enclosed by **BEGIN/COMMIT** or run independently. **COPY FROM STDIN** reads the same
  tab-separated row values from the SQL file until **\\.**. It requires no server-wide CSV pathname.
- **CHECKPOINT** precedes every measured action. **pg_current_wal_insert_lsn** brackets its WAL;
  **amp_flush** then commits a marker outside that interval and **pg_current_wal_flush_lsn** verifies
  decoder readiness. **pg_wal_lsn_diff** measures address-space bytes, including alignment and headers.
- **pg_get_wal_records_info** supplies actual resource_manager/record_type/length/image metadata.
  The report counts Transaction COMMIT records:1,1,200,1 for the ingestion matrix. These are WAL
  decisions, not counts of physical fsync calls. A guarded zero-row UPDATE may have no WAL interval;
  the driver handles equal endpoints without trying to decode a nonexistent record.
- **pg_get_wal_block_info(...,false)** preserves block metadata while omitting raw page images.
  Database OID, **pg_relation_filenode('amp')** and the main-fork filter identify the owned heap.
  Deduplicating record positions distinguishes record counts from referenced block counts. The
  **owned_heap_record_bytes/owned_heap_bytes_per_row** fields isolate those heap records;
  **commit_record_bytes** reports transaction-decision bytes separately from catalog hint images.
- **json_build_object**, aggregate checks and **json_agg** verify200 distinct IDs spanning1–200,
  exact amount values, payloads and totals. Every reported byte ratio has200 requested rows as its
  denominator; the guarded variation also reports zero actual tuple updates explicitly.
- **CREATE INDEX**, **pg_relation_size** and **pg_index.indisvalid/indisready** establish the final
  structural trial's built output and physical size. Its WAL includes catalog and page work, so
  index_bytes and interval_bytes are different measures rather than equal-size promises.
- **IS DISTINCT FROM** compares requested and stored amount values with null-aware semantics.
  In this non-null fixture the guard prevents all200 redundant tuple updates; triggers or required
  per-attempt side effects would need a separate equivalence decision in a real application.`,
  code: amplification(false),
  expectedResult: code`
All four ingestion trials return200 rows,200 distinct IDs, min1/max200, amount20100 and bad_rows0.
Their Transaction COMMIT counts are1,1,200,1. COPY emits Heap2 MULTI_INSERT records; ordinary INSERT
paths emit per-tuple Heap INSERT records. In the verified fixture all three INSERT methods log
20800 owned heap-record bytes (104/row); COPY logs11845 (59.23/row). Commit-record bytes are34 for
a single transaction versus6800 for200 transactions. Other settings or versions may change lengths.

Whole-interval totals contain unequal catalog hint-image overhead despite matched heap layouts.
They can even rank methods differently from the isolated heap/decision costs. Use the owned heap
bytes, commit bytes and record breakdown to explain that difference; do not call a whole-interval
ratio an intrinsic method cost, universal speedup or a flush count.

The plain and amount-indexed update fixtures both end with the same200 IDs and amount20300, with
no bad values. Each has200 heap updates: the matched plain fixture is entirely HOT, the indexed
fixture has zero HOT updates and additional B-tree work. The separate index-build trial preserves
amount20100, creates a valid/ready index and reports index_bytes alongside its WAL cost.
The script asserts these results before PASS and stops its private server. Whole-interval byte counts
vary with WAL/catalog page state, alignment, server version and background work; interval bytes are
not exact application-only accounting.`,
  systemsLens: code`
Useful output, transaction decisions and physical representation have different denominators.
Batching can reduce decision records without changing per-tuple insertion, while a bulk path may
change both representation and record count. An index buys a read path while adding maintenance to
eligible writes; avoiding unnecessary writes can preserve answers and reduce that work. Measure the
actual workload's byte rate and correctness before extrapolating to replication bandwidth, archive
capacity or recovery cost. This experiment measures WAL volume, not throughput or recovery duration.`,
  challenge: code`
For200 rows already satisfying amount=id, predict the difference between an unconditional UPDATE
and one guarded by amount IS DISTINCT FROM id. Run the exact pgcoach hint2 comparison, check equal
final values and count actual heap updates. Explain what further application assumptions make
skipping a no-op safe before projecting these small-run savings onto a million-row workload.`,
};
