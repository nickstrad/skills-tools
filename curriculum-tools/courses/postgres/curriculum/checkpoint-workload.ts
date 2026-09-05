import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function checkpointExperiment(rounds: number): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY + `\nrounds = ${rounds}\n` + code`
# Keep this small, quiet fixture in memory until the requested checkpoint.
with (data / "postgresql.conf").open("a") as config:
    config.write("\nmax_wal_size='128MB'\nbgwriter_lru_maxpages=0\nautovacuum=off\n")

def emit(label, value):
    print(label + ": " + json.dumps(value, sort_keys=True), flush=True)
    (root / (label + ".json")).write_text(json.dumps(value, indent=2))

def control():
    return json.loads(sql("select row_to_json(c) from pg_control_checkpoint() c"))

def counters():
    return json.loads(sql("select row_to_json(s) from pg_stat_bgwriter s"))

def buffers():
    return json.loads(sql("select json_build_object('resident',count(*),'dirty',count(*) filter(where isdirty)) "
        "from pg_buffercache where reldatabase=(select oid from pg_database where datname=current_database()) "
        "and reltablespace=(select dattablespace from pg_database where datname=current_database()) "
        "and relfilenode=pg_relation_filenode('checkpoint_receipts') and relforknumber=0"))

def page():
    return json.loads(sql("select json_build_object('memory_lsn',"
        "(page_header(get_raw_page('checkpoint_receipts',0))).lsn, 'file_lsn',"
        "(page_header(pg_read_binary_file(pg_relation_filepath('checkpoint_receipts'),0,"
        "current_setting('block_size')::int))).lsn, 'flushed_lsn',pg_current_wal_flush_lsn())"))

def lsn(value):
    high, low = value.split('/')
    return (int(high,16)<<32) + int(low,16)

try:
    start()
    version = int(sql("show server_version_num"))
    assert 160000 <= version < 170000, "This counter fixture requires PostgreSQL16; select its PGBIN."
    settings = json.loads(sql("select json_object_agg(name,setting) from pg_settings where name in "
        "('server_version','shared_buffers','block_size','max_wal_size','checkpoint_timeout',"
        "'bgwriter_lru_maxpages','autovacuum','fsync','full_page_writes','synchronous_commit')"))
    assert all(settings[n] == 'on' for n in ('fsync','full_page_writes','synchronous_commit'))
    emit("settings", settings)
    for extension in ('pg_buffercache','pageinspect','pg_walinspect'):
        sql('create extension ' + extension)
    sql("create table checkpoint_receipts(id int primary key, amount int not null check(amount>=0), "
        "pad text not null) with(fillfactor=30,autovacuum_enabled=false)")
    sql("create table checkpoint_flush_marker(id int primary key)")
    sql("insert into checkpoint_receipts select g,0,repeat('p',200) from generate_series(1,2000) g")
    # Set visibility hints before the clean baseline, so later outcome checks do not dirty it.
    assert sql("select count(*) from checkpoint_receipts") == '2000'
    sql("checkpoint")
    wait_for("baseline checkpoint statistics", lambda: counters()['checkpoints_req'] >= 1)
    before_control, before_stats, before_page = control(), counters(), page()
    before_buffers = buffers()
    assert before_buffers['dirty'] == 0
    assert before_page['memory_lsn'] == before_page['file_lsn']
    lower = sql("select pg_current_wal_insert_lsn()")
    xids = []
    for _ in range(rounds):
        xids.append(sql("with changed as (update checkpoint_receipts set amount=amount+1) "
            "select pg_current_xact_id()::text"))
    # This SELECT also sets any commit hints before the final checkpoint.
    outcome = json.loads(sql("select json_build_object('rows',count(*),'amount',sum(amount),"
        "'all_correct',bool_and(amount=" + str(rounds) + " and pad=repeat('p',200))) from checkpoint_receipts"))
    assert outcome == dict(rows=2000, amount=2000*rounds, all_correct=True)
    # The outcome scan can emit hint-bit WAL after the update committed. Flush it too.
    sql("insert into checkpoint_flush_marker values(1)")
    upper = sql("select pg_current_wal_insert_lsn()")
    dirty_buffers, dirty_page, dirty_control = buffers(), page(), control()
    assert dirty_buffers['dirty'] > 0
    assert dirty_control['redo_lsn'] == before_control['redo_lsn'], "Unexpected intervening checkpoint"
    assert lsn(dirty_page['memory_lsn']) > lsn(dirty_page['file_lsn'])
    assert lsn(dirty_page['flushed_lsn']) >= lsn(dirty_page['memory_lsn'])
    # The marker synchronous commit flushes the entire chosen interval.
    assert lsn(sql("select pg_current_wal_flush_lsn()")) >= lsn(upper)
    records = json.loads(sql("select coalesce(json_agg(r),'[]') from (select resource_manager,record_type,"
        "count(*) as records,sum(record_length) as bytes from pg_get_wal_records_info('" + lower + "','" + upper + "') "
        "where xid::text in (" + ','.join("'" + x + "'" for x in xids) + ") "
        "group by resource_manager,record_type order by resource_manager,record_type) r"))
    assert sum(r['records'] for r in records if r['resource_manager']=='Heap' and 'UPDATE' in r['record_type']) == 2000*rounds
    emit("before_checkpoint", dict(rounds=rounds, xids=xids, outcome=outcome, baseline_page=before_page,
        baseline_buffers=before_buffers, dirty_buffers=dirty_buffers, page=dirty_page, checkpoint=dirty_control,
        lower=lower, upper=upper, interval_bytes=lsn(upper)-lsn(lower), records=records,
        redo_distance_bytes=lsn(upper)-lsn(dirty_control['redo_lsn'])))
    offset = log.stat().st_size
    sql("checkpoint")
    wait_for("published requested-checkpoint delta", lambda: counters()['checkpoints_req'] > before_stats['checkpoints_req'])
    after_stats, after_control = counters(), control()
    after_buffers = buffers()  # Sample before get_raw_page can fetch a missing page.
    after_page = page()
    after_end = sql("select pg_current_wal_insert_lsn()")
    assert after_stats['stats_reset'] == before_stats['stats_reset']
    fields = ('checkpoints_req','checkpoints_timed','buffers_checkpoint','buffers_clean','buffers_backend',
              'checkpoint_write_time','checkpoint_sync_time')
    delta = {key: after_stats[key]-before_stats[key] for key in fields}
    assert delta['checkpoints_req'] == 1 and delta['checkpoints_timed'] == 0
    assert delta['buffers_checkpoint'] > 0
    assert after_buffers['dirty'] == 0 and after_buffers['resident'] == dirty_buffers['resident']
    assert after_page['memory_lsn'] == after_page['file_lsn'] == dirty_page['memory_lsn']
    assert lsn(after_page['flushed_lsn']) >= lsn(after_page['file_lsn'])
    assert lsn(after_control['redo_lsn']) > lsn(before_control['redo_lsn'])
    remaining = lsn(after_end)-lsn(after_control['redo_lsn'])
    assert 0 < remaining < lsn(upper)-lsn(dirty_control['redo_lsn'])
    checkpoint_record = json.loads(sql("select row_to_json(r) from pg_get_wal_record_info('" + after_control['checkpoint_lsn'] + "') r"))
    assert checkpoint_record['resource_manager'] == 'XLOG' and checkpoint_record['record_type'] == 'CHECKPOINT_ONLINE'
    fresh_log = log.read_bytes()[offset:].decode()
    assert 'checkpoint starting: immediate force wait' in fresh_log and 'checkpoint complete:' in fresh_log
    (root / 'checkpoint.log').write_text(fresh_log)
    emit("after_checkpoint", dict(checkpoint=after_control, counters_before=before_stats,counters_after=after_stats,
        delta=delta, buffers=after_buffers,page=after_page,redo_distance_bytes=remaining,record=checkpoint_record))
    print(fresh_log, flush=True)
    assert sql("select count(*)=2000 and sum(amount)=" + str(2000*rounds) + " from checkpoint_receipts") == 't'
    print("PASS: dirty heap written, resident pages retained, redo advanced, WAL/checkpoint and row assertions agree.", flush=True)
finally:
    stop()
    print("Private server stopped; retained checkpoint evidence at", root, flush=True)
PY`;
}

export const CHECKPOINT_VARIATION = checkpointExperiment(2);
export const CHECKPOINT_ANATOMY: Draft = {
  slug: "checkpoint-anatomy",
  revision: 4,
  tags: ["checkpoints", "wal", "buffer-cache", "durability"],
  title: "What a checkpoint actually does",
  difficulty: "intermediate",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 25,
  prerequisites: ["buffer-cache-and-io", "every-change-is-a-wal-record"],
  overview: code`
Change 2,000 receipts in a quiet owned cluster and compare a heap page in shared buffers with the
same page in the data file. Request a checkpoint, then connect the written page, retained cache
entries, advanced redo point, checkpoint WAL record and published counter delta. This makes the
checkpoint's recovery responsibility visible without treating WAL distance as elapsed recovery time.`,
  reading:
    code`PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "Checkpoint", "Background Writing", "WAL Setup")`,
  readingNotes: code`
Chapter 10 explains write-ahead ordering, checkpoint completion and background writing. Read after
the experiment to separate the redo starting boundary from the later checkpoint record. This fixture
uses PostgreSQL16 pg_stat_bgwriter counters and the newer pg_walinspect interface.`,
  caution: code`
Run the supplied script in a shell with Python3, PostgreSQL16 server binaries and pg_buffercache,
pageinspect and pg_walinspect installed. Set PGBIN to the PostgreSQL16 binary directory if needed.
It allocates /tmp/pg-owned-* with a unique private socket and no TCP listener; root uses runuser to
start it as the postgres OS user. All settings belong to this fresh cluster, which is stopped in
finally. Retained files contain the stopped cluster and observations; inspect the printed directory
before removing it later. Background writing and autovacuum are disabled only in this bounded
fixture to preserve page evidence. fsync, synchronous_commit and full_page_writes remain on.`,
  syntaxBreakdown: code`
### In plain terms

WAL can already be durable while an updated heap page is still dirty in shared memory. A checkpoint
makes the required data-file state durable and records a new recovery starting position. Clean pages
can remain cached, and the redo position differs from the end of WAL even in this quiet experiment.

### What you are learning

- **Write-ahead ordering:** WAL describing a page change must become durable before that data page.
- **Checkpoint completion:** compare control metadata, the checkpoint record and actual page state.
- **Cache residency:** writing a dirty buffer need not evict its contents.
- **Measurement scope:** table-specific page samples and cluster-wide counters measure different work.

### Piece by piece

- **python3** runs the supplied driver. **PGBIN** or **pg_config --bindir** locates server binaries;
  **tempfile.mkdtemp** allocates a unique directory. **runuser -u postgres --** and **os.chown**
  provide the server owner when invoked as root. Other users run their own processes directly.
- **initdb -D ... -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** creates the private cluster, superuser and local authentication, rejects host
  authentication, fixes locale, enables page checksums and uses1MB WAL files. The containing private
  directory protects the trusted socket; **listen_addresses=''** disables TCP.
- **shared_buffers=16MB**, **max_connections=10**, **checkpoint_timeout=1h**, and the override
  **max_wal_size=128MB** keep this small workload cached and reduce competing checkpoints.
  **bgwriter_lru_maxpages=0** and **autovacuum=off** suppress background interference for the fixture.
  **wal_level=replica**, **fsync**, **full_page_writes** and **synchronous_commit** retain WAL protection.
- **pg_ctl -D ... -l ... -w -t20 start/stop** owns and bounds server lifecycle; **-m fast** stops
  cleanly in finally. **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup customization, emits
  unaligned tuple-only output and fails on SQL errors. The helper clears inherited PG variables;
  **PGCONNECT_TIMEOUT**, **statement_timeout** and **lock_timeout** bound connection and SQL waits.
- **pg_settings** records actual settings. **server_version_num** requires PostgreSQL16 because
  checkpoint counters moved to a separate view in newer releases. **CREATE EXTENSION** installs
  **pg_buffercache**, **pageinspect**, and **pg_walinspect** for cache, page and WAL inspection.
- **CREATE TABLE**, **PRIMARY KEY**, **NOT NULL** and **CHECK(amount>=0)** constrain receipt state.
  **fillfactor=30** leaves room for updates on existing pages; **generate_series** and **repeat**
  build2,000 equal-width rows. The initial SELECT establishes visibility hints before CHECKPOINT.
- **WITH changed AS (UPDATE ...) SELECT pg_current_xact_id()** updates all receipts and returns
  that transaction's ID. One round is one committed transaction. **count**, **sum** and **bool_and**
  independently check all amounts and padding; the variation changes only rounds from1 to2.
- **pg_buffercache** counts main-fork entries with **relforknumber=0**, matching **reldatabase**,
  **reltablespace** and **relfilenode** using this database's catalog IDs and
  **pg_relation_filenode**. **FILTER(WHERE isdirty)** counts dirty entries; resident includes clean
  entries too. The default tablespace fixture needs no custom-tablespace path handling.
- **page_header(get_raw_page(...,0))** reads page0 through shared buffers. **pg_relation_filepath**
  locates its heap file; **pg_read_binary_file(path,0,block_size)** reads its first block through the
  filesystem, bypassing shared buffers. **page_header(...).lsn** decodes each last-change position.
  File reads can hit the OS cache; they do not prove physical device persistence by themselves.
- **pg_current_wal_insert_lsn** brackets the workload; **pg_current_wal_flush_lsn** establishes its
  flush boundary. A separate synchronous INSERT into **checkpoint_flush_marker** flushes any
  hint-bit WAL generated by the outcome scan after the UPDATE commit. The Python **lsn** function converts the two hexadecimal halves to a byte position.
  Their subtraction is WAL address distance, including framing, rather than a per-request byte charge.
- **pg_get_wal_records_info** decodes the flushed interval. Filtering **xid** to the saved writing
  transactions and grouping **resource_manager/record_type** counts actual Heap UPDATE records;
  **record_length** sums their encoded sizes. Both HOT_UPDATE and UPDATE match this assertion.
- **pg_control_checkpoint** exposes **redo_lsn**, **checkpoint_lsn**, time and timeline. A fresh
  SQL connection per poll observes published **pg_stat_bgwriter** statistics. **stats_reset** must
  stay fixed; **checkpoints_req/timed**, **buffers_checkpoint/clean/backend**, and write/sync times
  are differenced without resetting any counter. These are cluster totals, including catalog pages.
- **CHECKPOINT** waits for the requested checkpoint. **wait_for** polls its published counter with
  a deadline. **pg_get_wal_record_info(checkpoint_lsn)** verifies the actual XLOG CHECKPOINT_ONLINE
  record; the later record and its redo position are distinct addresses.
- **log.stat().st_size** saves an offset, so **checkpoint.log** contains only newly appended lines.
  **immediate force wait** identifies the manual request; completion reports buffers and write/sync
  accounting. **json_build_object**, **row_to_json**, **json_agg**, **json_object_agg** and **coalesce**
  preserve structured observations in printed and retained JSON. Assertions fail before PASS if
  the controlled conditions or domain outcomes do not hold.`,
  code: checkpointExperiment(1),
  expectedResult: code`
The clean baseline has equal page0 memory/file LSNs and zero dirty receipt buffers. One committed
round produces2,000 Heap UPDATE records and leaves2,000 receipts with total amount2,000 and correct
padding. Before checkpoint, receipt buffers are dirty, page0's memory LSN is newer than its file
LSN, and flushed WAL has reached the memory LSN. The redo point has not changed.

After the requested checkpoint, checkpoints_req rises by1 with no timed checkpoint or statistics
reset. buffers_checkpoint rises, the receipt buffers are clean and remain resident, and page0's file
LSN catches up to the observed memory LSN. The redo point advances; the small remaining WAL distance
is positive. The actual checkpoint record is XLOG CHECKPOINT_ONLINE, and the fresh log contains the
manual checkpoint start and completion. Receipt totals still match. The owned cluster stops.

Absolute LSNs, bytes, timings, buffer counts and catalog work vary. Do not require the checkpoint
buffer delta to equal the earlier table dirty count: its scope and sampling time differ. These
observations show a controlled quiet case; concurrent writers can dirty buffers during a checkpoint.
The file read observes OS-visible bytes. Durability ordering also relies on PostgreSQL's checkpoint
and flush guarantees with the protection settings enabled, not on a simulated device failure.`,
  systemsLens: code`
A checkpoint advances the recovery boundary of existing data files and their log. It is not a full,
transactionally consistent database snapshot, a backup, or a cache eviction operation. Dirty pages
can also be written by other processes before a checkpoint, so committed data is not confined to
shared buffers. WAL needed by archives or replicas may remain after the local redo point advances.

Repeated updates can generate many records while checkpoint work concerns changed pages. Trading
checkpoint frequency against writes, full-page images and recovery work requires workload evidence;
WAL address distance alone neither predicts elapsed recovery nor specifies an application's RTO.`,
  challenge: code`
Run two committed update rounds before the same final checkpoint. Predict the receipt sum, Heap
UPDATE count and whether writing pages once requires one page write per update record. Use the
complete pgcoach hint2 variation, compare its JSON with the core, and explain any page-layout or
catalog overhead before interpreting byte or buffer ratios.`,
};
