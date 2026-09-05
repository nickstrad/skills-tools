import { code, type Module } from "../../../src/types.ts";
import { MIGRATION } from "./migration-workload.ts";

export const INDEXES: Module = {
  category: "indexes",
  title: "Indexes: B-tree internals, concurrent builds, and bloat",
  lessons: [
    {
      slug: "btree-page-anatomy",
      tags: [
        "btree",
        "index-access-methods",
        "pages-and-tuples",
        "index-scans",
      ],
      title: "Open a B-tree: metapage, root, internal pages, leaves",
      revision: 4,
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: [
        "page-header-and-line-pointers",
        "install-lab-extensions",
      ],
      overview: code`
Inspect the root and leaves of two B-trees containing the same 100,000 unique logical keys. Both
indexes are bulk-built after loading the table, so the comparison avoids mixing insertion and build
histories. Compare their integer and wide-text representations, then locate one leaf entry by its
heap address; page layout and cache behavior are separate observations.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 25 "B-tree" (sections "Overview", "Page Layout")`,
      readingNotes: code`
Chapter 25 explains the B-tree levels, page layout, high keys, and leaf links that this lesson
opens with pageinspect. The experiment adds a size comparison between integer and wide text keys,
and uses amcheck to verify the structure. Read the chapter before or after; the block-by-block
inspection is a useful concrete companion to its diagrams.`,
      syntaxBreakdown: code`
### In plain terms

This experiment opens an index file as a tree of 8 KB pages. You compare a narrow integer key with a
wide text key, identify the root and leaf levels, and follow one key to the heap row it references.
The output turns the abstract idea of an index into pages, links, item offsets, and physical row
addresses that can be checked for consistency.

### What you are learning

- **B-tree fanout:** Wider keys fit fewer entries per page, increasing index size and sometimes height.
- **Internal versus leaf pages:** Internal pages choose child blocks; leaves hold searchable keys and heap addresses.
- **High keys and sibling links:** Boundary entries and links let scans move between leaf pages in key order.
- **Structural checking:** amcheck validates ordering and downlink invariants rather than returning query results.

### Piece by piece

- **pg_relation_size(...) / 8192** (size function and page conversion)
  - What it is: pg_relation_size returns relation bytes; dividing by 8192 converts them to PostgreSQL pages.
  - What it does here: It compares heap and index footprints for equal row counts.
  - What it gives us: Page counts showing the storage cost of wide keys.
- **bt_metap(index)** (pageinspect function)
  - What it is: It decodes block zero, the B-tree metapage.
  - What it does here: It identifies root, level, fastroot, fastlevel, and allequalimage for each index.
  - What it gives us: Tree height and root block; level 1 means root plus leaves.
- **bt_page_stats(index, blkno)** (pageinspect function)
  - What it is: It summarizes one B-tree page by block number.
  - What it does here: It groups the wide index by btpo_level and inspects root and leaf blocks.
  - What it gives us: type, live_items, avg_item_size, free_size, btpo_prev, btpo_next, and btpo_level.
- **bt_page_items(index, blkno)** (pageinspect function)
  - What it is: It lists individual items stored on one index page.
  - What it does here: It shows internal downlinks, leaf heap tuple addresses, item lengths, and key bytes.
  - What it gives us: itemoffset, ctid, itemlen, and data; item 1 is a high key except on the rightmost page.
- **generate_series and LATERAL** (SQL row generator and per-row subquery)
  - What they are: generate_series emits candidate block numbers; LATERAL lets page inspection use each number.
  - What they do here: They census every non-metapage block and search all leaves for one heap ctid.
  - What they give us: A per-level page count and the exact leaf/item containing id 50000.
- **ctid** (system column)
  - What it is: A physical tuple address written as block and item offset.
  - What it does here: The heap ctid is matched to the index item's ctid.
  - What it gives us: The bridge from an indexed key to its table page and tuple slot.
- **\gset and :leaf** (psql variable capture and substitution)
  - What they are: \gset saves a single-row query's columns as psql variables; :leaf substitutes one later.
  - What they do here: They capture the discovered leaf block instead of hard-coding it.
  - What they give us: Repeatable inspection of the exact page found by the search.
- **bt_index_check(index)** (amcheck function)
  - What it is: It checks B-tree ordering and link invariants and returns void on success.
  - What it does here: It validates both indexes after manual inspection.
  - What it gives us: A successful statement with blank values; corruption would raise an error.
- **generate_series and lpad** (SQL functions)
  - What they are: generate_series emits the 100000 test IDs; lpad left-pads text to a fixed width.
  - What they do here: They create distinct integer keys and corresponding 40-character text keys.
  - What they give us: A controlled key-width comparison.
- **VACUUM (ANALYZE)** (maintenance command)
  - What it is: It cleans eligible tuples and refreshes planner statistics.
  - What it does here: It prepares the index inspection with current row counts.
  - What it gives us: A stable, analyzed table before comparing the bulk-built structures; maintenance can affect layout in other states.
`,
      setup: code`
drop table if exists ix_btree;
create table ix_btree(id int not null, wide text collate "C" not null, payload text) with (autovacuum_enabled = off);
insert into ix_btree
select g, 'key-' || lpad(g::text, 36, '0'), 'row-' || g from generate_series(1, 100000) g;
alter table ix_btree add primary key(id);
create unique index ix_btree_wide_idx on ix_btree(wide);
vacuum (analyze) ix_btree;`,
      code: code`
-- Two indexes over exactly the same 100000 rows, using narrow and wide key representations with matched bulk-build history.
select pg_relation_size('ix_btree') / 8192 as heap_pages,
       pg_relation_size('ix_btree_pkey') / 8192 as pkey_pages,
       pg_relation_size('ix_btree_wide_idx') / 8192 as wide_pages;

-- The metapage (block 0) says where the root is and how tall the tree is.
select 'pkey (int)' as index, root, level, fastroot, fastlevel, allequalimage
from bt_metap('ix_btree_pkey')
union all
select 'wide (text)', root, level, fastroot, fastlevel, allequalimage
from bt_metap('ix_btree_wide_idx');

-- Every page of the wide index, grouped by its level. Level 0 is the leaf level.
select btpo_level, type, count(*) as pages,
       round(avg(live_items)) as avg_items, round(avg(free_size)) as avg_free_bytes
from generate_series(1, pg_relation_size('ix_btree_wide_idx') / 8192 - 1) blk,
     lateral bt_page_stats('ix_btree_wide_idx', blk::int)
group by 1, 2 order by 1 desc;

-- The root of the int index: one downlink per leaf page.
select blkno, type, live_items, avg_item_size, free_size, btpo_level
from bt_page_stats('ix_btree_pkey', (select root::int from bt_metap('ix_btree_pkey')));

select itemoffset, ctid as downlink, itemlen, data as key_bytes
from bt_page_items('ix_btree_pkey', (select root::int from bt_metap('ix_btree_pkey'))) order by itemoffset limit 4;

-- A leaf page: item 1 is the high key, the rest are real entries, and btpo_prev /
-- btpo_next chain the leaf level together in key order.
select blkno, type, live_items, btpo_prev, btpo_next, btpo_level
from bt_page_stats('ix_btree_pkey', 2);

select itemoffset, ctid as heap_tuple, itemlen, data as key_bytes
from bt_page_items('ix_btree_pkey', 2) order by itemoffset limit 3;

-- Now locate the leaf entry by scanning the diagnostic page inventory. Where does id = 50000 live, physically?
select ctid as heap_ctid from ix_btree where id = 50000;

select b.blkno as leaf_page, i.itemoffset, i.ctid as heap_tuple, i.data as key_bytes
from generate_series(1, pg_relation_size('ix_btree_pkey') / 8192 - 1) b(blkno),
     lateral bt_page_stats('ix_btree_pkey', b.blkno::int) st,
     lateral bt_page_items('ix_btree_pkey', b.blkno::int) i
where st.btpo_level = 0 and (st.btpo_next = 0 or i.itemoffset > 1) and i.ctid = (select ctid from ix_btree where id = 50000);

-- Capture that leaf's block number so the next queries do not hard-code it.
select b.blkno as leaf
from generate_series(1, pg_relation_size('ix_btree_pkey') / 8192 - 1) b(blkno),
     lateral bt_page_stats('ix_btree_pkey', b.blkno::int) st,
     lateral bt_page_items('ix_btree_pkey', b.blkno::int) i
where st.btpo_level = 0 and (st.btpo_next = 0 or i.itemoffset > 1) and i.ctid = (select ctid from ix_btree where id = 50000) \gset

select blkno, type, live_items, btpo_prev, btpo_next from bt_page_stats('ix_btree_pkey', :leaf);
select itemoffset, ctid as heap_tuple, data as key_bytes
from bt_page_items('ix_btree_pkey', :leaf) order by itemoffset limit 2;

-- amcheck asserts the invariants you just read by eye.
select bt_index_check('ix_btree_pkey') as pkey_checked,
       bt_index_check('ix_btree_wide_idx') as wide_checked;`,
      expectedResult: code`
Both indexes contain 100,000 distinct logical keys built from the same rows. In the validated
8 KiB-page fixture the integer index occupied about276 pages at root level1 and the 40-character
text index about831 pages at root level2. This compares two key representations, including their
type and collation; it is not a byte-width-only microbenchmark. Inspect your measured page counts
and levels instead of assuming a fixed fanout or height threshold.

Level0 contains leaves, while higher levels direct searches to children. The metapage supplies the
root block rather than requiring a fixed block number. The leaf census locates the actual entry for
id50000 while excluding high keys and internal downlinks. That search scans the diagnostic page
inventory; it is not a simulation of a normal root-to-leaf index lookup.

A tree with an extra level can require extra traversal and has a larger cache footprint, but these
page-inspection calls do not measure device reads per query. Root metadata and pages can be cached.
bt_index_check succeeds with blank void results; that verifies its structural checks, not every
possible corruption or application invariant.`,
      systemsLens: code`
Key representation affects the amount of ordered lookup state a system must retain. Wider keys can
reduce entries per page and increase cache footprint or height. Measure both traversal and workload
cost before choosing a compact representation: truncation or hashing needs its own collision and
correctness policy. Ordered leaves also support range continuation, unlike an unordered lookup map.`,
      challenge: code`
Build a composite (wide,payload) index over the same rows, compare its bytes and root level with the
wide-only index, then drop it. Does a larger footprint necessarily add another tree level?`,
    },
    {
      slug: "create-index-concurrently-and-invalid-indexes",
      tags: [
        "index-access-methods",
        "ddl",
        "migrations",
        "relation-locks",
        "btree",
      ],
      title: "CREATE INDEX CONCURRENTLY: build, wait, validate, flip",
      difficulty: "advanced",
      safetyLevel: "ddl",
      runIn: "tool",
      sessions: 3,
      estimatedMinutes: 20,
      prerequisites: ["btree-page-anatomy", "ddl-behind-a-long-query"],
      revision: 4,
      overview: code`
A concurrent index build keeps ordinary writes possible while advancing through several phases.
Hold an old snapshot, observe the builder waiting, and distinguish an index maintained for writes
from one valid for planning. Then cause a duplicate-key failure, inspect the invalid artifact and
repair the data before a successful rebuild.`,
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 12 "Relation-Level Locks".`,
      syntaxBreakdown: code`
### In plain terms

CREATE INDEX CONCURRENTLY is an online-build protocol rather than one instant operation. One session
holds a repeatable-read snapshot while another builds, so you can watch the builder wait and inspect
the index catalog entry before it becomes valid. A deliberately duplicated value then makes a unique
build fail, leaving an invalid index that must be removed safely.

### What you are learning

- **Concurrent index phases:** Build, validation, and catalog state changes happen in separate phases.
- **Snapshot waits:** An old transaction can delay the moment an index becomes valid for queries.
- **Invalid-index cleanup:** A failed build can leave a physical index entry behind.
- **Online DDL trade-off:** Concurrent builds reduce blocking but require more time, state, and disk.

### Piece by piece

- **CREATE INDEX CONCURRENTLY** (online DDL command)
  - What it is: It builds an index while allowing ordinary reads and writes, using multiple transactions.
  - What it does here: Session A waits for Session B's old snapshot, then completes after B commits.
  - What it gives us: A usable index after the wait, or an invalid catalog row after the duplicate failure.
- **BEGIN ISOLATION LEVEL REPEATABLE READ and COMMIT** (transaction commands)
  - What they are: BEGIN opens a transaction with one stable snapshot; COMMIT ends it and releases transaction resources.
  - What they do here: Session B keeps an old snapshot alive until Session A's build is observable.
  - What they give us: A reproducible waiting phase and the unblocking event.
- **pg_index.indisready and indisvalid** (catalog columns)
  - What they are: Flags saying whether an index is maintained for new writes and valid for query planning.
  - What they do here: They reveal the half-finished state and the failed unique build.
  - What they give us: indisready true with indisvalid false means maintenance happens but the planner cannot trust it.
- **pg_stat_progress_create_index** (progress view)
  - What it is: A live view of index-build phases and progress.
  - What it does here: It identifies the current phase and locker PID while the build waits.
  - What it gives us: phase, current_locker_pid, blocks_done, and blocks_total.
- **pg_stat_activity** (activity view)
  - What it is: One row per backend and its current state or wait event.
  - What it does here: It finds the CREATE INDEX CONCURRENTLY backend waiting on the old snapshot.
  - What it gives us: pid, state, wait_event_type, wait_event, and a shortened query text.
- **pg_relation_size(indexrelid)** (size function)
  - What it is: It returns an index's physical size in bytes.
  - What it does here: It confirms a half-built or invalid index occupies disk.
  - What it gives us: bytes for comparing finished and failed catalog entries.
- **CREATE UNIQUE INDEX CONCURRENTLY** (unique online DDL)
  - What it is: It builds a concurrent index while enforcing uniqueness.
  - What it does here: The duplicate email causes the build to error.
  - What it gives us: An invalid index visible through pg_index and \d output.
- **DROP INDEX CONCURRENTLY** (online cleanup DDL)
  - What it is: It removes an invalid index while allowing ordinary access, but still acquiring locks and potentially waiting.
  - What it does here: It cleans up ix_cic_email_uk after the failed build.
  - What it gives us: A safe final state; it also cannot run inside a transaction block.
- **\d ix_cic** (psql relation description command)
  - What it is: It prints columns, indexes, and constraints for a table.
  - What it does here: It exposes the failed index in a human-readable table summary.
  - What it gives us: A quick deployment-style check alongside the catalog query.
- **generate_series and ::regclass** (SQL function and cast)
  - What they are: generate_series creates the initial rows; the regclass cast resolves a relation name to its catalog identity.
  - What they do here: They create the build input and let pg_index filters name ix_cic safely.
  - What they give us: A repeatable table and catalog lookups tied to that table.
- **DO, FOR, EXISTS, pg_sleep and RAISE EXCEPTION** (bounded readiness observation)
  - What they are: An anonymous procedural block repeats a condition check with short pauses and fails when its budget expires.
  - What they do here: C checks up to50 times at0.1-second intervals for this table's old-snapshot phase; sleep alone is not the evidence.
  - What they give us: Either the expected phase is observed or the trial explicitly fails.
- **statement_timeout and application_name** (session controls)
  - What they are: A statement deadline and a client label.
  - What they do here: They bound and identify A's build; both reset at the end.
  - What they give us: A hung schedule terminates within15 seconds rather than waiting indefinitely.
- **pg_blocking_pids** (blocker lookup function)
  - What it is: It returns processes blocking the selected backend's lock acquisition.
  - What it does here: It connects the progress row to the old transaction. Each poll clears the cached statistics snapshot so a phase transition can become visible.
  - What it gives us: A blocker array; a virtual transaction wait is still a diagnosable lock wait.
`,
      setup: code`
drop table if exists ix_cic;
create table ix_cic(id int, email text);
insert into ix_cic select g, 'user' || g || '@example.com' from generate_series(1, 5000) g;
analyze ix_cic;`,
      code: code`
-- Session A
set application_name='pgpivot_cic_builder';
set statement_timeout='15s';
select count(*) as indexes_on_ix_cic from pg_index where indrelid='ix_cic'::regclass;
-- Session B
begin isolation level repeatable read;
select count(*) as rows_b_can_see from ix_cic;
-- Session A (blocks until B commits)
create index concurrently ix_cic_email_idx on ix_cic(email);
-- Session C: wait for evidence, with a five-second observation budget.
do $$
declare ready boolean := false;
begin
  for attempt in 1..50 loop
    perform pg_stat_clear_snapshot();
    select exists(select 1 from pg_stat_progress_create_index
      where datid=(select oid from pg_database where datname=current_database())
        and relid='ix_cic'::regclass and phase='waiting for old snapshots') into ready;
    exit when ready;
    perform pg_sleep(0.1);
  end loop;
  if not ready then raise exception 'old-snapshot phase not observed; stop this trial'; end if;
end $$;
select p.phase,p.current_locker_pid,a.wait_event_type,a.wait_event,pg_blocking_pids(a.pid) as blockers
from pg_stat_progress_create_index p join pg_stat_activity a using(pid)
where p.datid=(select oid from pg_database where datname=current_database()) and p.relid='ix_cic'::regclass;
select indexrelid::regclass as index,indisready,indisvalid,pg_relation_size(indexrelid) as bytes
from pg_index where indrelid='ix_cic'::regclass;
-- Session B: this transaction's catalog snapshot predates the index.
select indexrelid::regclass as index,indisready,indisvalid
from pg_index where indrelid='ix_cic'::regclass;
commit;
-- Session A
select indexrelid::regclass as index,indisready,indisvalid
from pg_index where indrelid='ix_cic'::regclass;
insert into ix_cic values(5001,'user1@example.com');
-- Expected23505: continue with the catalog observation and owned cleanup below.
create unique index concurrently ix_cic_email_uk on ix_cic(email);
select indexrelid::regclass as invalid_index,indisready,indisvalid
from pg_index where indrelid='ix_cic'::regclass and not indisvalid;
\d ix_cic
drop index concurrently ix_cic_email_uk;
delete from ix_cic where id=5001;
create unique index concurrently ix_cic_email_uk on ix_cic(email);
select indexrelid::regclass as index,indisready,indisvalid
from pg_index where indrelid='ix_cic'::regclass;
select count(*) as rows,count(distinct email) as unique_emails from ix_cic;
reset statement_timeout;
reset application_name;`,
      expectedResult: code`
B's repeatable-read snapshot sees5,000 rows before A creates the index. C's bounded observation
must find A in waiting for old snapshots; otherwise stop and investigate the schedule. The progress
row and pg_blocking_pids connect the wait to a transaction. In validation it was a virtualxid wait.

B's ordinary pg_index query cannot see the later catalog row in its fixed snapshot. C can see
ix_cic_email_idx with indisready=true and indisvalid=false. Ending B's transaction allows A to
finish; both flags then become true. The index size and progress counters are observations, not
stable values or a readiness test by themselves.

The deliberate duplicate makes CREATE UNIQUE INDEX CONCURRENTLY raise23505 and leave an invalid
ix_cic_email_uk. Its ready state depends on the failure phase; inspect it. A ready-but-invalid
index can still impose maintenance or uniqueness costs. The owned invalid-artifact query must name
ix_cic, not unrelated indexes in the database.

Cleanup drops the failed artifact, removes only the inserted id5001 duplicate and retries the unique
build. The retry finishes with both flags true and5,000 rows with5,000 distinct emails. Concurrent
DDL still uses locks, takes resources and can wait; it does not mean a migration is nonblocking.`,
      systemsLens: code`
A multi-phase operation can leave durable intermediate state after an error. Recovery must identify
that state and decide whether to resume, replace or clean it up. A catalog row existing is weaker
than being usable. This transfers to migration orchestration, but each protocol has its own reader,
writer and activation conditions; do not assume every online change waits on the same boundary.`,
      challenge: code`
Starting from setup, introduce one duplicate, attempt the unique concurrent build, inspect the
invalid artifact, then remove the duplicate and retry after dropping the failed index. Finish by
checking catalog flags and unique email count. Exact commands are available in the coaching hint.`,
      caution: code`
The second half deliberately fails a DDL statement and leaves an invalid index until the final DROP.
Run it only in the lab. If the readiness check or15-second deadline fails, end B's transaction,
inspect and drop only the named invalid index, then rerun setup before continuing.`,
    },
    MIGRATION,
    {
      slug: "partial-and-covering-indexes",
      tags: ["index-scans", "query-planning", "explain", "btree"],
      title: "Index less, or index more: partial and covering indexes",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["visibility-map-and-index-only-scans"],
      revision: 4,
      overview: code`
Compare a partial index for a small pending subset with a covering index that carries amount for
tenant reads. Keep the measured answer fixed while changing the access path, then request a column
that the covering index lacks. Finally, compare identical updates on matched small tables to expose
the HOT cost of indexing an updated payload.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 19 "Index Access Methods" (section "Indexing Engine Interface"); Chapter 20 "Index Scans" (section "Index-Only Scans")`,
      readingNotes: code`
Chapter 19 explains index access-method properties and Chapter 20 explains index-only scans. This
lesson applies those ideas to partial predicates and INCLUDE payload columns, measuring both the
smaller hot-set index and the wider covering index. Read the chapters before or after; the plan and
size comparisons show the trade-off the book describes.`,
      syntaxBreakdown: code`
### In plain terms

A partial index stores only rows matching a predicate, while a covering index stores extra columns
so a query can answer from the index alone. PostgreSQL uses a partial index only when it can prove
the query condition implies the index predicate; logically equivalent wording may fail that proof.
You will measure the saved index space, the I/O benefit of INCLUDE, and the write cost of carrying it.

### What you are learning

- **Partial indexes:** Indexing only a hot subset can save storage and maintenance work.
- **Predicate implication:** The planner needs a supported implication proof that the query is covered.
- **INCLUDE columns:** Payload columns can satisfy reads but cannot search or order the index.
- **Read/write trade-off:** Covering data reduces heap reads while adding storage and maintenance for indexed changes.

### Piece by piece

- **CREATE INDEX ... WHERE status = 'pending'** (partial-index DDL)
  - What it is: It stores entries only for rows satisfying the WHERE predicate.
  - What it does here: It keeps 1000 pending rows instead of all 100000 orders.
  - What it gives us: A small index that can answer matching pending queries.
- **EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)** (plan command and options)
  - What it is: It executes the query, reports buffers, and hides cost numbers.
  - What it does here: It tests when the partial and covering indexes are selected.
  - What it gives us: Index Only Scan or Seq Scan, Heap Fetches, and page totals.
- **Predicate implication** (planner reasoning)
  - What it is: A proof that every row requested by a query belongs to the indexed subset.
  - What it does here: status = 'pending' matches the predicate, while status <> 'done' is equivalent only on today's rows, not for all states the schema permits.
  - What it gives us: The presence or absence of the partial index in the plan.
- **CREATE INDEX ... INCLUDE (amount)** (covering-index DDL)
  - What it is: It adds amount as non-key payload on leaf entries.
  - What it does here: It lets sum(amount) be answered from ix_orders_tenant_cov.
  - What it gives us: Index Only Scan and lower buffers, at the cost of a larger index.
- **pg_relation_size and pg_size_pretty** (size functions)
  - What they are: The first returns bytes; the second formats bytes for people.
  - What they do here: They compare full, partial, key-only, and covering index sizes.
  - What they give us: Byte and kB totals that quantify storage and cache cost.
- **CREATE INDEX ... ON tenant** (key-only index DDL)
  - What it is: It indexes tenant without storing amount as payload.
  - What it does here: It finds matching rows but requires heap access for sum(amount).
  - What it gives us: The baseline Bitmap Heap Scan and its scattered page reads.
- **VACUUM (ANALYZE)** (maintenance command)
  - What it is: It marks visible pages and refreshes planner statistics.
  - What it does here: It makes the covering index's index-only result have zero Heap Fetches.
  - What it gives us: A fair buffer comparison between the two index designs.
- **INCLUDE columns and equality search** (index limitation)
  - What they are: Included fields are stored data, not ordering keys.
  - What they do here: amount = 700 cannot use the tenant index as a search structure.
  - What they give us: A Seq Scan proving that coverage is not the same as lookup ability.
- **generate_series, repeat, and SUM** (setup function and SQL aggregate)
  - What they are: generate_series creates rows, repeat supplies note padding, and SUM adds amount values.
  - What they do here: They build the measured table and the covering query's aggregate.
  - What they give us: Predictable 100000-row size and a query that needs the amount column.

- **LIKE ... INCLUDING ALL and fillfactor70** (matched write fixture)
  - What they are: LIKE copies the table definition and indexes; the fillfactor leaves space on heap pages at load time.
  - What they do here: Two small tables receive the same rows before one adds INCLUDE(amount) to its tenant index.
  - What they give us: Comparable update history and room for HOT where no indexed value changes.
- **pg_stat_xact_user_tables** (transaction-local counters)
  - What it is: This session's table activity in the current transaction.
  - What it does here: It reads n_tup_upd and n_tup_hot_upd before COMMIT, after two100-row updates.
  - What it gives us: Direct update evidence without asynchronous cumulative-statistics lag.
- **id % 20 = 0 and \gset** (selection and result capture)
  - What they are: Modulo picks every twentieth row; the psql command stores a one-row result in named variables.
  - What they do here: They distribute100 updates across available page space and capture the read aggregate before/after adding coverage.
  - What they give us: same_contents and unchanged_sum must be true alongside the physical-work comparison.
`,
      setup: code`
drop table if exists ix_orders;
create table ix_orders(id int primary key, tenant int, status text, amount int, note text)
  with (autovacuum_enabled = off);
insert into ix_orders
select g, g % 100, case when g % 100 = 0 then 'pending' else 'done' end, g, repeat('n', 50)
from generate_series(1, 100000) g;
create index ix_orders_status on ix_orders(status);
create index ix_orders_pending on ix_orders(status) where status = 'pending';
create index ix_orders_tenant on ix_orders(tenant);
vacuum (analyze) ix_orders;
-- Matched write-cost fixtures: same history, rows and spare space; one index includes amount.
drop table if exists ix_hot_plain,ix_hot_cover;
create table ix_hot_plain(id int primary key,tenant int,amount int,note text)
  with(fillfactor=70,autovacuum_enabled=off);
create table ix_hot_cover(like ix_hot_plain including all)
  with(fillfactor=70,autovacuum_enabled=off);
insert into ix_hot_plain select g,g%100,g,repeat('n',20) from generate_series(1,2000) g;
insert into ix_hot_cover select * from ix_hot_plain;
create index ix_hot_plain_tenant on ix_hot_plain(tenant);
create index ix_hot_cover_tenant on ix_hot_cover(tenant) include(amount);
vacuum(analyze) ix_hot_plain;
vacuum(analyze) ix_hot_cover;`,
      code: code`
select indexrelid::regclass as index,pg_relation_size(indexrelid) as bytes
from pg_index where indrelid='ix_orders'::regclass order by indexrelid::regclass::text;
drop index ix_orders_status;
explain(analyze,buffers,costs off) select count(*) from ix_orders where status='pending';
-- These conditions differ: the first retains500 rows, the second1,000 in today's fixture.
explain(analyze,buffers,costs off) select count(*) from ix_orders where status='pending' and amount>50000;
explain(analyze,buffers,costs off) select count(*) from ix_orders where status<>'done';
select sum(amount) as before_sum from ix_orders where tenant=7 \gset
explain(analyze,buffers,costs off) select sum(amount) from ix_orders where tenant=7;
create index ix_orders_tenant_cov on ix_orders(tenant) include(amount);
vacuum(analyze) ix_orders;
explain(analyze,buffers,costs off) select sum(amount) from ix_orders where tenant=7;
select sum(amount) as after_sum from ix_orders where tenant=7 \gset
select :before_sum=:after_sum as unchanged_sum,:after_sum as tenant_sum;
select indexrelid::regclass as index,pg_relation_size(indexrelid) as bytes
from pg_index where indexrelid in ('ix_orders_tenant'::regclass,'ix_orders_tenant_cov'::regclass);
-- The missing column still requires heap access despite the amount covering index.
explain(analyze,buffers,costs off) select sum(length(note)) from ix_orders where tenant=7;
-- INCLUDE is payload; it does not make amount a searchable B-tree key.
explain(costs off) select id from ix_orders where amount=700;

-- Both updates commit the same100 logical changes with different HOT eligibility.
begin;
update ix_hot_plain set amount=amount+1 where id%20=0;
update ix_hot_cover set amount=amount+1 where id%20=0;
select relname,n_tup_upd,n_tup_hot_upd from pg_stat_xact_user_tables
where relid in ('ix_hot_plain'::regclass,'ix_hot_cover'::regclass) order by relname;
commit;
select (select count(*) from ix_hot_plain)=(select count(*) from ix_hot_cover)
   and (select sum(amount) from ix_hot_plain)=(select sum(amount) from ix_hot_cover) as same_contents;`,
      expectedResult: code`
The fixture contains1,000 pending orders out of100,000. Compare the full status index's bytes with
the partial index before dropping the full index. With freshly vacuumed pages, the pending COUNT
can use index-only access with zero heap fetches. The predicate with amount>50000 returns500;
status<>'done' returns1,000 for today's data but also permits future values outside the partial
predicate. Data coincidence does not prove that the partial index covers that query.

For tenant7, the before/after SUM is49,957,000 and unchanged_sum=true. Validation changed the
key-only bitmap heap path to covering index-only access, reducing about1,003 buffer accesses to6.
Sizes were about728KiB for the key-only tenant index and2,224KiB for INCLUDE(amount); exact values
vary. The comparison includes B-tree deduplication being unavailable with INCLUDE, so the size cost
is more than simply four extra bytes per row. Requesting note still needs heap data. Visibility
checks can also require heap fetches even when every requested column is covered.

The two2,000-row update fixtures have identical rows and fillfactor70. Both change amount on100
well-spaced rows in one transaction. The key-only fixture permits HOT; INCLUDE(amount) makes the
changed payload indexed and therefore prevents these HOT updates. Read pg_stat_xact_user_tables
inside that same transaction: validation should report100 updates and100 HOT for ix_hot_plain,
versus100 updates and0 HOT for ix_hot_cover. This direct transaction-local view avoids waiting for
cumulative statistics to publish. Row counts and amount sums must match after commit.

HOT eligibility is a mechanism result, not a throughput benchmark. Layout and free space still
matter, and the larger read index is justified only by the workload's reads, writes and footprint.`,
      systemsLens: code`
An index is maintained derived state. Selecting fewer rows can reduce its scope; carrying more
columns can improve read locality while adding maintenance and cache demand. Keep the application
answer and data invariant fixed during that comparison. A small active subset and a read-mostly
payload may justify different designs from a frequently changing payload.`,
      challenge: code`
Repeat the matched update trial, changing note instead of amount on the same100 spaced rows.
Because neither secondary index stores note, can both tables now use HOT? Compare transaction-local
counters and equal post-update contents. The hint recreates neither table beyond the supplied setup.`,
    },
    {
      slug: "index-bloat-from-churn",
      tags: [
        "bloat",
        "rebuilding-tables-and-indexes",
        "btree",
        "vacuum",
        "write-amplification",
      ],
      title: "Measure index churn before deciding to rebuild",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["btree-page-anatomy", "vacuum-reclaims-in-place"],
      revision: 4,
      overview: code`
Apply two bounded rounds of indexed-key updates, vacuum between them and measure the resulting
index structure. Then compare the same range answer and plan before and after a concurrent rebuild.
Two rounds can demonstrate reuse; they cannot establish an indefinitely stable size or justify a
rebuild for every workload.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 5 "Page Pruning and HOT Updates" (section "Page Pruning for Indexes"); Chapter 8 "Rebuilding Tables and Indexes" (sections "Full Vacuuming", "Other Rebuilding Methods"); Chapter 25 "B-tree" (section "Page Layout")`,
      readingNotes: code`
Chapter 5 explains dead index entries and page pruning, Chapter 8 explains rebuilding, and Chapter
25 supplies B-tree page-layout context. This experiment measures bloat after indexed-column churn,
shows why VACUUM cannot shrink the file, and then uses REINDEX CONCURRENTLY to replace it. Read the
chapters after the first measurements so density and fragmentation have visible examples.`,
      syntaxBreakdown: code`
### In plain terms

Updating an indexed value adds a new index entry; it cannot simply overwrite the old entry because
other transactions may still need the old row version. Vacuum can remove dead entries, but it does
not generally return the already-sized index file to the operating system. You will measure the
holes produced by two bounded rounds of churn and then watch a concurrent rebuild pack a fresh copy.

### What you are learning

- **Index bloat:** Dead entries and page splits leave a larger, less dense structure after updates.
- **Density versus file size:** Removing dead entries does not necessarily reduce the relation's bytes.
- **Fragmentation:** Leaf links can visit pages in an order that is no longer sequential on disk.
- **Concurrent rebuilding:** REINDEX CONCURRENTLY creates and swaps a replacement while allowing access.

### Piece by piece

- **pgstatindex('ix_churn_k')** (pgstattuple extension function)
  - What it is: It scans a B-tree and reports structural and density metrics.
  - What it does here: It measures the fresh index, both churn rounds, and the rebuilt result.
  - What it gives us: index_size, tree_level, leaf_pages, empty_pages, deleted_pages, avg_leaf_density, and leaf_fragmentation.
- **UPDATE of indexed column k** (DML operation)
  - What it is: It changes the value used as an index key.
  - What it does here: It rewrites half the keys to scattered positions, causing new entries and page splits.
  - What it gives us: A larger, lower-density index for pgstatindex to measure.
- **VACUUM** (index cleanup command)
  - What it is: It removes index entries whose row versions are no longer needed.
  - What it does here: It clears dead entries between churn rounds but leaves the relation file size.
  - What it gives us: A clean measure of persistent empty space rather than live dead tuples.
- **pg_class.relfilenode** (catalog column)
  - What it is: The physical file identity for a relation.
  - What it does here: It is read before and after the rebuild.
  - What it gives us: A changed number proving the index was replaced by a new file.
- **REINDEX INDEX CONCURRENTLY** (online rebuild command)
  - What it is: It constructs a packed replacement index and swaps it in through a concurrent protocol.
  - What it does here: It reduces the bloated index to its original page count while allowing ordinary access, with lock waits and extra resource demand still possible.
  - What it gives us: Smaller index_size, higher avg_leaf_density, low fragmentation, and a new relfilenode.
- **pg_index.indisvalid** (catalog flag)
  - What it is: It says whether the planner may trust an index.
  - What it does here: The final query verifies the rebuilt index is valid.
  - What it gives us: indisvalid = true for the surviving index.
- **generate_series and repeat** (SQL functions)
  - What they are: generate_series emits IDs; repeat creates fixed-width padding text.
  - What they do here: They create 100000 keys and predictable row sizes for the churn test.
  - What they give us: A repeatable baseline for index size and leaf density.

- **SET enable_seqscan=off, EXPLAIN and \gset** (range comparison)
  - What they are: A diagnostic planner bias, an executed plan and one-row result capture.
  - What they do here: They expose index buffer work and preserve the post-churn range count and sum across the rebuild.
  - What they give us: unchanged_range=true and measured before/after work; RESET restores ordinary planning.
`,
      setup: code`
drop table if exists ix_churn;
create table ix_churn(id int primary key, k int, pad text) with (autovacuum_enabled = off);
insert into ix_churn
select g, (g * 7919) % 100000, repeat('p', 40) from generate_series(1, 100000) g;
create index ix_churn_k on ix_churn(k);
vacuum (analyze) ix_churn;`,
      code: code`
select index_size, tree_level, leaf_pages, empty_pages, deleted_pages,
       avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');

-- Round 1: rewrite the indexed column of half the rows to scattered new values.
update ix_churn set k = (k * 31 + 17) % 100000 where id % 2 = 0;
vacuum ix_churn;
select index_size, leaf_pages, deleted_pages, avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');

-- Round 2: exactly the same amount of churn again.
update ix_churn set k = (k * 31 + 17) % 100000 where id % 2 = 0;
vacuum ix_churn;
select index_size, leaf_pages, deleted_pages, avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');

-- Compare the current post-churn answer under the same forced range path.
set enable_seqscan=off;
select count(*) as range_count,sum(k) as range_sum from ix_churn where k between 1000 and 2000 \gset
explain(analyze,buffers,costs off) select count(*) from ix_churn where k between 1000 and 2000;
-- Rebuild it. Note that the file identity changes.
select relfilenode from pg_class where relname = 'ix_churn_k';
reindex index concurrently ix_churn_k;
select relfilenode from pg_class where relname = 'ix_churn_k';

select index_size, leaf_pages, deleted_pages, avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');
select indexrelid::regclass as index, indisvalid from pg_index where indrelid = 'ix_churn'::regclass;
explain(analyze,buffers,costs off) select count(*) from ix_churn where k between 1000 and 2000;
select count(*)=:range_count and sum(k)=:range_sum as unchanged_range
from ix_churn where k between 1000 and 2000;
reset enable_seqscan;`,
      expectedResult: code`
The fresh index measured about2,260,992 bytes in validation. After the first bounded churn and
VACUUM it measured about4,513,792 bytes; a second round reused space with little further growth.
These two rounds are evidence for this fixture's reuse, not proof that every index converges to2x
size. Splits, reclamation, key distribution and old snapshots affect later behavior.

Immediately before rebuilding, capture the current range count and sum: the churn intentionally
changed keys, so comparing with the original pre-churn answer would test a different result set.
REINDEX CONCURRENTLY changes the file identity and restores a denser index in validation. Both
range aggregates stay equal and final indisvalid is true. The forced range plan makes index work
visible; it does not claim the planner's ordinary choice or that rebuilding necessarily lowers
latency. Record your buffers before and after even if they barely change.

Density and logical leaf order describe layout. They do not measure physical-device access order
or establish an application slowdown. Budget time, extra storage and lock waits for rebuilding,
then decide whether the measured benefit warrants those costs.`,
      systemsLens: code`
Reclamation can make existing space reusable without producing a smaller file. A rebuild creates
a replacement structure and has its own resource and availability costs. Distinguish waste that
harms the workload from spare capacity the workload will reuse; a density metric alone cannot
make that decision.`,
      challenge: code`
Use the same current data and compare a wider range before and after a concurrent rebuild. Keep
its count and sum fixed, capture buffers and bytes, and decide whether your evidence supports paying
for the rebuild. The exact hint includes both measurements and restores planner controls.`,
    },
    {
      slug: "unique-index-enforcement-under-concurrency",
      tags: [
        "unique-constraints",
        "btree",
        "optimistic-concurrency",
        "concurrency",
        "index-access-methods",
      ],
      title: "A partial unique index enforces one active owner row",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: ["unique-constraint-race", "partial-and-covering-indexes"],
      revision: 4,
      overview: code`
Two clients can both observe no active owner before either commits. A partial unique index
arbitrates their inserts and enforces at most one active row for a nonnull resource, while allowing
released history. Exercise that boundary and an atomic handover; it provides neither expiry nor
protection against a stale writer at an external service.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 19 "Index Access Methods" (section "Indexing Engine Interface"); Chapter 12 "Relation-Level Locks" (section "Locks on Transaction IDs")`,
      readingNotes: code`
Chapter 19 explains the indexing-engine uniqueness property, and Chapter 12 explains waits on a
transaction ID when a conflicting change is uncommitted. This experiment makes a partial unique
index enforce one active owner row and observes the losing insert wait and error. Read both chapters
before or after; use the live wait to connect the index invariant to transaction locking.`,
      syntaxBreakdown: code`
### In plain terms

Two clients can both observe that a resource is free, so a check followed by an insert is not enough
to enforce one owner. A partial unique B-tree puts the rule inside the database's insert path: only
rows marked active participate, and one wins while the other waits for its transaction's outcome.
This lesson also demonstrates a safe release-and-claim handover in one transaction.

### What you are learning

- **Unique-index enforcement:** The index, not a separate check query, serializes competing claims.
- **Partial uniqueness:** A predicate limits the rule to active rows while allowing many released rows.
- **Transaction-ID wait:** A conflicting uncommitted entry makes the second insert wait before it errors.
- **Identity sequences:** Generated IDs are not rolled back, so failed attempts leave gaps.

### Piece by piece

- **GENERATED ALWAYS AS IDENTITY** (table column definition)
  - What it is: It obtains each id from a sequence managed by PostgreSQL.
  - What it does here: It labels rows without the sessions choosing IDs.
  - What it gives us: A visible hole after the blocked insert loses, because sequence allocation is not transactional.
- **CREATE UNIQUE INDEX ... WHERE state = 'active'** (partial unique-index DDL)
  - What it is: It enforces uniqueness only for rows satisfying the predicate.
  - What it does here: It permits at most one active row per resource.
  - What it gives us: The ix_uniq_one_active index that decides the race.
- **pg_constraint.conindid and pg_index.indisunique/indisprimary** (catalog columns)
  - What they are: conindid links a declared constraint to its backing index; the pg_index flags describe index properties.
  - What they do here: The catalog queries contrast the primary-key constraint with the bare partial unique index.
  - What they give us: Constraint name/type, backing index, uniqueness, primary status, and predicate.
- **pg_get_expr(indpred, indrelid)** (catalog expression function)
  - What it is: It reconstructs a stored index predicate as readable SQL.
  - What it does here: It prints state = active for the partial index.
  - What it gives us: The exact subset in which uniqueness applies.
- **BEGIN, COMMIT, and ROLLBACK** (transaction commands)
  - What they are: They start, publish, or abandon a transaction's changes.
  - What they do here: A holds the winning insert, B waits, then B rolls back; later release and claim are one transaction.
  - What they give us: The unblock event and an atomic handover with no two active owners.
- **pg_stat_activity** (activity view)
  - What it is: A live row for each backend and its wait state.
  - What it does here: Session A finds B waiting on the unique insert.
  - What it gives us: wait_event_type = Lock and wait_event = transactionid.
- **pg_stat_user_indexes** (index usage view)
  - What it is: Per-table index scan and tuple counters.
  - What it does here: It reports search counters, which can lag; enforcing uniqueness itself does not increment idx_scan.
  - What it gives us: idx_scan, idx_tup_read, and idx_tup_fetch for each index.

- **NOT NULL and CHECK** (schema boundaries)
  - What they are: Constraints requiring a resource and one of the two supported state values.
  - What they do here: They prevent a null resource or misspelled state from bypassing the intended ownership domain.
  - What they give us: The partial uniqueness rule applies to well-defined active resource rows.
- **DO with50 bounded polls, pg_blocking_pids and statement_timeout** (wait evidence)
  - What they are: A repeated condition check, a blocker lookup and a15-second statement deadline.
  - What they do here: A waits up to5 seconds to observe the specifically labelled B backend blocked by A; otherwise the trial fails.
  - What they give us: An observed conflict before commit rather than an assumed race based on sleeping.
`,
      setup: code`
drop table if exists ix_uniq;
create table ix_uniq(id int generated always as identity primary key,
                     resource text not null, owner text not null, state text not null
                     check (state in ('active','released')));
create unique index ix_uniq_one_active on ix_uniq(resource) where state = 'active';
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-a', 'released');`,
      code: code`
-- Session A
select c.conname, c.contype, c.conindid::regclass as backing_index
from pg_constraint c where c.conrelid = 'ix_uniq'::regclass;
select indexrelid::regclass as index, indisunique, indisprimary,
       pg_get_expr(indpred, indrelid) as predicate
from pg_index where indrelid = 'ix_uniq'::regclass order by 1;
-- Session A
begin;
select count(*) as active_now from ix_uniq where resource = 'shard-1' and state = 'active';
-- Session B
set application_name='pgpivot_unique_b';
set statement_timeout='15s';
begin;
select count(*) as active_now from ix_uniq where resource = 'shard-1' and state = 'active';
-- Session A
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-a', 'active');
-- Session B (blocks until A commits)
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-b', 'active');
-- Session A
do $$
declare ready boolean := false;
begin
  for attempt in 1..50 loop
    perform pg_stat_clear_snapshot();
    select exists(select 1 from pg_stat_activity where datname=current_database()
      and application_name='pgpivot_unique_b' and pg_backend_pid()=any(pg_blocking_pids(pid)))
    into ready;
    exit when ready;
    perform pg_sleep(0.1);
  end loop;
  if not ready then raise exception 'competing insert wait not observed'; end if;
end $$;
select pid, state, wait_event_type, wait_event from pg_stat_activity
where datname=current_database() and application_name='pgpivot_unique_b';
-- Session A
commit;
-- Session B
rollback;
select id, resource, owner, state from ix_uniq order by id;
-- Session A
-- The rule only covers the indexed subset: any number of non-active rows may coexist.
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-b', 'released');
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-c', 'released');
select state, count(*) from ix_uniq where resource = 'shard-1' group by state order by state;
-- Session A
-- Handing ownership over is one transaction: release, then claim.
begin;
update ix_uniq set state = 'released' where resource = 'shard-1' and state = 'active';
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-b', 'active');
commit;
select id, owner, state from ix_uniq where resource = 'shard-1' and state = 'active';
-- Session A
select indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
from pg_stat_user_indexes where relname = 'ix_uniq' order by indexrelname;
select count(*) as active_count, min(owner) as owner from ix_uniq
where resource='shard-1' and state='active';
-- Session B
reset statement_timeout;
reset application_name;`,
      expectedResult: code`
The catalog distinguishes the primary-key constraint from the bare partial unique index. Both
clients initially read active_now=0, but B's conflicting active insert waits for A's transaction.
The bounded observation must identify that wait. After A commits, B receives23505 for
ix_uniq_one_active and rolls back. A failed identity allocation may leave a gap; IDs are not a
row count or a gapless commit ordering.

Released rows for the same resource coexist because they do not participate in the active
predicate. The handover transaction replaces the active row as one committed state transition:
other readers see the old or new committed state, while inside the transaction the two statements
still execute separately. Final active_count=1 and owner=node-b.

Uniqueness enforcement is not counted as an ordinary index scan. The table is tiny and planner
choices/statistics publication vary, so idx_scan need not be2 or any fixed value. A zero scan count
cannot justify dropping an index that enforces a correctness invariant.`,
      systemsLens: code`
Move a race-sensitive invariant into the atomic write path when the database can express it.
The domain here is one database's resource key, with nonnull fields and a constrained state value.
A paused process may still issue external writes after ownership changes; that boundary requires
an enforcement protocol at the external resource, taught later. Neither a uniqueness constraint nor
an allocated sequence value alone establishes distributed authority.`,
      challenge: code`
Add another released row for the same resource and then attempt two active rows. Use the unique
index to reject the second active insert, and finish with one active row plus retained history.
Do not add expiry or external-fencing claims to this local invariant.`,
    },
    {
      slug: "keyset-pagination-and-concurrent-writes",
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 20 "Index Scans".`,
      tags: ["btree", "pagination", "concurrency", "index-scans"],
      title: "Continue from a key boundary while new rows arrive",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: ["partial-and-covering-indexes"],
      revision: 1,
      overview: code`
OFFSET asks PostgreSQL to walk past every earlier result, while keyset pagination seeks from a saved
ordered key. This lesson uses a nonunique timestamp plus id tie-breaker, compares a deep OFFSET with
a keyset page from the same boundary, and then inserts a row before that boundary. In READ COMMITTED,
OFFSET 5 repeats a row after the insert; the keyset predicate continues after the saved pair.
`,
      syntaxBreakdown: code`
### In plain terms

A cursor boundary is the last sort key a client actually saw. With a composite index on created_at
and id, a query using **(created_at, id) > boundary** can seek after that pair. OFFSET has no such
boundary: it discards the first N rows of the current result, so an earlier insert changes which row
is N+1.

### What you are learning

- **Tie-breaker:** A nonunique timestamp needs id in both ORDER BY and the cursor predicate.
- **Keyset seek:** A composite B-tree can continue after a supplied pair without visiting every prior row.
- **Read Committed drift:** Separate statements take fresh snapshots, so neither pagination form alone
  creates a stable view across inserted, deleted, or re-sorted rows.

### Piece by piece

- **CREATE INDEX ... (created_at, id)** creates the ordered access path used by both pagination queries.
  It lets PostgreSQL seek on the complete ordering rather than sorting 100,000 rows.
- **OFFSET 50005 LIMIT 5** discards a deep prefix before returning five rows. EXPLAIN reports rows
  visited and buffers; the returned answer is compared with the keyset result.
- **\gset** saves the actual fifth row of the first page as **:boundary_created_at** and
  **:boundary_id**. The later predicate uses this observed value, not an invented timestamp.
- **(created_at, id) > (...)** is a row comparison matching the composite sort order. It returns rows
  strictly after the saved cursor pair.
- **INSERT** in Session B adds a row sorting before A's first five rows. It is committed before A's
  next READ COMMITTED statements, deliberately changing their snapshot.
- **BEGIN ISOLATION LEVEL REPEATABLE READ** in the variation fixes one snapshot. It prevents this
  insert from changing later pages in that transaction, but does not let a keyset cursor jump to an
  arbitrary deep page for free.
`,
      setup: code`
drop table if exists ix_page;
create table ix_page(id bigint primary key, created_at timestamptz not null, body text not null);
insert into ix_page
select g, timestamptz '2026-01-01 00:00:00+00' + (g / 10) * interval '1 second', repeat('x', 80)
from generate_series(1, 100000) g;
create index ix_page_created_id on ix_page(created_at, id);
vacuum (analyze) ix_page;`,
      code: code`
-- Session A: use autocommit READ COMMITTED with no pre-existing transaction.
set default_transaction_isolation='read committed';
select id, created_at from ix_page order by created_at, id limit 5;
select created_at as boundary_created_at, id as boundary_id
from ix_page order by created_at, id offset 4 limit 1 \gset

-- Acquire a separate deep boundary, then compare the same next five rows two ways.
select created_at as deep_created_at, id as deep_id
from ix_page order by created_at, id offset 50004 limit 1 \gset
explain (analyze, buffers, costs off)
select id, created_at from ix_page order by created_at, id offset 50005 limit 5;
explain (analyze, buffers, costs off)
select id, created_at from ix_page
where (created_at, id) > (:'deep_created_at'::timestamptz, :deep_id)
order by created_at, id limit 5;
select array_agg(id order by id) as offset_ids from (
  select id from ix_page order by created_at, id offset 50005 limit 5
) s \gset
select array_agg(id order by id) as keyset_ids from (
  select id from ix_page where (created_at, id) > (:'deep_created_at'::timestamptz, :deep_id)
  order by created_at, id limit 5
) s \gset
select :'offset_ids' as offset_ids, :'keyset_ids' as keyset_ids,
  :'offset_ids'::bigint[]=:'keyset_ids'::bigint[] as same_deep_page;

-- Session B: commit a row that sorts before A's saved first-page boundary.
insert into ix_page values (100001, timestamptz '2025-12-31 23:59:59+00', repeat('n', 80));

-- Session A: a fresh READ COMMITTED OFFSET repeats id 5; keyset continues after the saved pair.
select id as offset_after_insert from ix_page order by created_at, id offset 5 limit 1;
select id as keyset_after_insert from ix_page
where (created_at, id) > (:'boundary_created_at'::timestamptz, :boundary_id)
order by created_at, id limit 1;
delete from ix_page where id = 100001;
reset default_transaction_isolation;`,
      expectedResult: code`
Before B inserts, both deep result arrays contain ids 50006 through 50010. The deep OFFSET plan visits 50,010 index entries to return its five rows, while the keyset plan visits five after a composite index
condition; buffers and exact plan labels vary by cache state. After B commits id 100001 before the
first page, OFFSET 5 returns id 5 again, while the saved keyset predicate returns id 6. The cleanup
removes the inserted row. These are separate READ COMMITTED statements: deleting a row or updating a
sort key can still change a later keyset page, and acquiring a cursor is separate from jumping to an
arbitrary page.
`,
      systemsLens: code`
A keyset is an ordered continuation token, not a snapshot or a page number. The same distinction
appears in change-feed offsets and object-listing cursors: a stable ordering plus a tie-breaker makes
continuation efficient, while consistency across a changing collection needs an explicit snapshot or
application policy.
`,
      challenge: code`
Rerun setup. In A begin isolation level repeatable read, acquire the first-page boundary, then let B
insert id 100001 before it. Repeat OFFSET 5 and the keyset query inside A before COMMIT: both retain
the original snapshot. Delete id 100001 after A commits.
`,
    },
  ],
};
