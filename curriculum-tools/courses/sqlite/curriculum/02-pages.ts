import { code, type Module } from "../../../src/types.ts";

export const PAGES: Module = {
  category: "pages",
  title: "Pages, B-trees, and space",
  lessons: [
    {
      slug: "pages-and-dbstat",
      title: "Observe pages with dbstat",
      difficulty: "beginner",
      tags: ["pages", "btree", "file-format"],
      prerequisites: ["strict-storage-contracts"],
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 15,
      overview:
        "Grow a SQLite table and inspect its leaf and internal pages. The PostgreSQL course already establishes pages as storage units; the new difference is that this table is itself a B-tree rather than a heap reached through a separate index. Use object-level evidence to keep that physical model concrete.",
      syntaxBreakdown: code`### In plain terms

This experiment grows one table until its logical rows occupy many fixed-size pages. SQLite's dbstat inspection table lets us correlate the page count with B-tree roles, while rollback mode keeps the main file representation straightforward. The exact page counts are evidence from this build, not constants to memorize.

### What you are learning

- **Page geometry** is the pager's allocation and I/O unit.
- **B-tree roles** distinguish leaf pages holding table cells from internal pages routing searches.
- **Runtime measurements** such as dbstat counts should be reported without claiming a universal shape.

### Piece by piece

- **PRAGMA journal_mode=DELETE** (persistent setting): selects rollback mode so the main file is the committed representation; WAL would require inspecting sidecars too.
- **PRAGMA page_size=1024** (database setting): requests 1024-byte pages before the rebuild.
- **VACUUM** (rewrite command): applies the requested page size and clears prior layout before setup.
- **WITH RECURSIVE** (SQL row generator): emits 2000 deterministic integers; the recursive bound controls workload size.
- **printf** (SQLite scalar function): formats each value as a fixed-width string, making row payloads comparable.
- **pragma_page_size and pragma_page_count** (table-valued PRAGMAs): expose page size and allocated page count; their product is the expected file bytes.
- **dbstat** (virtual table): exposes one row per B-tree page; name identifies the object and pagetype identifies leaf/internal/overflow.
- **sum(ncell) and count(*)** (SQL aggregates): count cells and pages in each role; exact totals are build evidence.
- **.headers on / .mode box** (CLI display commands): label columns and make the grouped output readable.
`,
      setup: code`PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
VACUUM;
DROP TABLE IF EXISTS samples;
CREATE TABLE samples(id INTEGER PRIMARY KEY, value TEXT NOT NULL);`,
      code:
        code`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 2000) INSERT INTO samples SELECT x, printf('row-%05d', x) FROM n;
.headers on
.mode box
SELECT page_size, page_count, page_size * page_count AS file_bytes FROM pragma_page_size, pragma_page_count;
SELECT name, pagetype, count(*) AS pages, sum(ncell) AS cells FROM dbstat WHERE name='samples' GROUP BY name, pagetype ORDER BY pagetype;`,
      expectedResult:
        code`file_bytes equals page_size multiplied by page_count and is page-aligned. dbstat reports samples occupying leaf pages and at least one internal page once the table is large enough; the exact counts depend on SQLite's page layout but are concrete in the output.`,
      systemsLens:
        "A rowid table stores rows in a B-tree keyed by integer identity. That differs from PostgreSQL's heap plus index indirection, and it changes what a primary-key lookup traverses. dbstat describes page structure, not a count of physical disk reads or the engine's cumulative writes.",
      challenge:
        code`Repeat with page_size=4096 and predict whether the table needs fewer pages for the same rows.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "btree-splits",
      title: "Cause B-tree splits with ordered inserts",
      difficulty: "intermediate",
      tags: ["btree", "pages", "write-amplification"],
      prerequisites: ["pages-and-dbstat"],
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 15,
      overview:
        "Insert three bounded batches and observe a larger B-tree with internal routing. The samples show structural growth, not a trace of every split or write. Focus on how a SQLite table maintains key order as it grows, carrying forward the B-tree model you learned in PostgreSQL.",
      syntaxBreakdown: code`### In plain terms

An SQLite B-tree cannot grow smoothly forever: when a page fills, the engine allocates or rewrites pages to preserve sorted search structure. Ordered batches make those discrete allocation steps visible. We sample after bounded batches and inspect ancestry depth, but do not infer a fixed amount of write amplification per insert.

### What you are learning

- **B-tree split** is structural maintenance caused by a full page.
- **Sampling boundaries** reveal page-allocation jumps without pretending to observe every internal write.
- **Path depth** is a shape observation, not a universal performance guarantee.

### Piece by piece

- **PRAGMA journal_mode=DELETE / page_size=1024 / VACUUM** (pager setup): create a fresh rollback-mode, 1024-byte layout so prior lessons cannot change geometry.
- **WITH RECURSIVE ... INSERT** (deterministic batch): inserts 100, then 900, then 4000 ordered rows; each bound identifies the sample point.
- **pragma_page_count** (table-valued PRAGMA): page_count after each commit is the allocation sample.
- **dbstat.path** (inspection column): encodes page ancestry; counting slash components gives an observed depth.
- **max(length(path) - length(replace(...)))** (SQL expression and aggregate): computes the deepest path without asserting how many splits caused it.
`,
      setup: code`PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
VACUUM;
DROP TABLE IF EXISTS ordered;
CREATE TABLE ordered(id INTEGER PRIMARY KEY, payload TEXT NOT NULL);`,
      code: code`.headers on
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 100) INSERT INTO ordered SELECT x, printf('batch-a-%04d', x) FROM n;
SELECT 'after_100' AS sample, page_count FROM pragma_page_count;
WITH RECURSIVE n(x) AS (VALUES(101) UNION ALL SELECT x + 1 FROM n WHERE x < 1000) INSERT INTO ordered SELECT x, printf('batch-b-%04d', x) FROM n;
SELECT 'after_1000' AS sample, page_count FROM pragma_page_count;
WITH RECURSIVE n(x) AS (VALUES(1001) UNION ALL SELECT x + 1 FROM n WHERE x < 5000) INSERT INTO ordered SELECT x, printf('batch-c-%04d', x) FROM n;
SELECT 'after_5000' AS sample, page_count FROM pragma_page_count;
SELECT max(length(path) - length(replace(path, '/', ''))) AS observed_depth FROM dbstat WHERE name='ordered';`,
      expectedResult:
        code`The three page_count values increase in discrete jumps rather than one byte at a time. observed_depth is greater than the single-leaf case (typically 2 or more slash components), showing an internal page/root. Exact thresholds can vary with payload and SQLite build details.`,
      systemsLens:
        "Maintaining ordered physical structure creates work beyond the logical INSERT. These post-batch samples establish allocation and depth growth; they do not measure per-insert amplification or prove the timing of individual splits. For a write-cost claim, add instrumentation at the relevant layer.",
      challenge:
        code`Insert the same keys in a random order in another file and compare page count and depth; explain any difference as locality, not a universal guarantee.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "rowid-storage",
      title: "Compare rowid and indexed identity",
      difficulty: "intermediate",
      tags: ["rowid", "btree", "pages"],
      prerequisites: ["btree-splits"],
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 15,
      overview:
        "Compare an implicit rowid table, an INTEGER PRIMARY KEY alias, and a text-key table with a unique secondary index. All hold 1,000 logical records, but the identity representation and object count differ. This is a layout choice, not an equal-byte encoding benchmark.",
      syntaxBreakdown: code`### In plain terms

SQLite rowid tables already have an internal integer identity. Declaring INTEGER PRIMARY KEY aliases that rowid, while a separate unique index creates another B-tree that points back to table rows. This experiment inserts equivalent records and uses dbstat to make the extra object and its pages visible.

### What you are learning

- **Rowid aliasing** can store an integer identity directly in the table B-tree.
- **Secondary index indirection** adds a maintained B-tree and a lookup hop.
- **Object-level accounting** separates table pages from index pages.

### Piece by piece

- **PRAGMA journal_mode=DELETE, page_size=1024, VACUUM** (pager setup): stabilizes rollback mode and page geometry for comparable counts.
- **CREATE TABLE normal / alias / indexed** (SQL definitions): normal has an implicit rowid, alias names it with INTEGER PRIMARY KEY, and indexed keeps a text logical key.
- **CREATE UNIQUE INDEX indexed_key** (index definition): creates a second B-tree enforcing uniqueness on indexed.logical_key.
- **WITH RECURSIVE and printf** (row generator and formatter): produce the same 1000-key workload and similar payload lengths for all tables.
- **dbstat name, count(*), sum(pgsize)** (inspection columns and aggregates): count pages and bytes per table/index object.
- **EXPLAIN QUERY PLAN** (query-plan command in the challenge): names SCAN or SEARCH paths and exposes use of the separate indexed_key B-tree.
`,
      setup: code`PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
VACUUM;
DROP TABLE IF EXISTS normal;
DROP TABLE IF EXISTS alias;
DROP TABLE IF EXISTS indexed;
CREATE TABLE normal(logical_key TEXT, payload TEXT);
CREATE TABLE alias(id INTEGER PRIMARY KEY, payload TEXT);
CREATE TABLE indexed(logical_key TEXT, payload TEXT);
CREATE UNIQUE INDEX indexed_key ON indexed(logical_key);`,
      code: code`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 1000)
INSERT INTO normal SELECT printf('key-%05d', x), printf('payload-%05d', x) FROM n;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 1000)
INSERT INTO alias SELECT x, printf('payload-%05d', x) FROM n;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 1000)
INSERT INTO indexed SELECT printf('key-%05d', x), printf('payload-%05d', x) FROM n;
.headers on
.mode box
SELECT name, count(*) AS pages, sum(pgsize) AS bytes FROM dbstat WHERE name IN ('normal', 'alias', 'indexed', 'indexed_key') GROUP BY name ORDER BY name;
SELECT (SELECT count(*) FROM normal) AS normal_rows, (SELECT count(*) FROM alias) AS alias_rows, (SELECT count(*) FROM indexed) AS indexed_rows;`,
      expectedResult:
        code`All three row counts are 1000. dbstat shows the alias table stores its integer key in the table B-tree, while indexed has a separate indexed_key object with pages in addition to its table; normal has only its table object. The exact bytes depend on page size and payload.`,
      systemsLens:
        "SQLite's exact INTEGER PRIMARY KEY declaration can alias physical row identity, unlike PostgreSQL's usual primary-key index over a heap. A text logical key plus unique index preserves a different representation and adds an access structure. Separate the cost of encoding the key from the cost of maintaining the extra B-tree.",
      challenge:
        code`Use EXPLAIN QUERY PLAN to look up one key in normal and indexed and identify the extra B-tree used by the indexed table.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "without-rowid-layout",
      title: "Compare WITHOUT ROWID layouts",
      difficulty: "intermediate",
      tags: ["without-rowid", "btree", "query-planner"],
      prerequisites: ["rowid-storage"],
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 15,
      overview:
        "Give equivalent data a composite primary key in ordinary and WITHOUT ROWID tables, then compare the structures and lookup plans. The question is where the records are physically keyed, not whether a feature with 'optimization' in its description must always win. A secondary-index variation tests the other side of that choice.",
      syntaxBreakdown: code`### In plain terms

The same composite primary key can be represented two ways. A normal rowid table stores rows in a rowid B-tree and maintains a separate primary-key index; WITHOUT ROWID makes the declared key the table B-tree key. Comparing dbstat and plans exposes the locality trade-off without declaring one layout universally smaller.

### What you are learning

- **Rowid composite key** means the declared key is an additional unique access path.
- **WITHOUT ROWID** clusters table records by the declared composite key.
- **Clustering trade-off** depends on secondary lookups and update patterns, so measure both pages and plans.

### Piece by piece

- **PRAGMA journal_mode=DELETE, page_size=1024, VACUUM** (pager setup): supplies identical rollback-mode geometry for both tables.
- **PRIMARY KEY(a,b)** (composite constraint): requires unique pairs; on a rowid table it creates an autoindex.
- **WITHOUT ROWID** (table option): uses the composite key as the table's B-tree key instead of allocating a hidden rowid table.
- **WITH RECURSIVE and printf** (workload generator): insert 2000 deterministic pairs and payloads into each representation.
- **dbstat name, count(*), sum(pgsize)** (inspection): reports pages and bytes for table objects and the rowid table's sqlite_autoindex object.
- **EXPLAIN QUERY PLAN** (planner inspection): reports which table or index supplies the lookup for a=12 and b=34.
- **The two payload indexes** add the same search key to each representation. **pragma_index_xinfo** shows indexed and auxiliary locator columns: key=1 marks the declared search key, while key=0 marks additional stored locator fields. cid=-1 represents a rowid locator; the WITHOUT ROWID index instead carries a and b. Compare their extra page objects without assuming a universal size winner.
`,
      setup: code`PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
VACUUM;
DROP TABLE IF EXISTS with_rowid;
DROP TABLE IF EXISTS without_rowid;
CREATE TABLE with_rowid(a INTEGER, b INTEGER, payload TEXT, PRIMARY KEY(a,b));
CREATE TABLE without_rowid(a INTEGER, b INTEGER, payload TEXT, PRIMARY KEY(a,b)) WITHOUT ROWID;`,
      code: code`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 2000)
INSERT INTO with_rowid SELECT x / 100, x % 100, printf('payload-%05d', x) FROM n;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 2000)
INSERT INTO without_rowid SELECT x / 100, x % 100, printf('payload-%05d', x) FROM n;
.headers on
.mode box
SELECT name, count(*) AS pages, sum(pgsize) AS bytes FROM dbstat WHERE name IN ('with_rowid', 'without_rowid', 'sqlite_autoindex_with_rowid_1') GROUP BY name ORDER BY name;
EXPLAIN QUERY PLAN SELECT payload FROM with_rowid WHERE a=12 AND b=34;
EXPLAIN QUERY PLAN SELECT payload FROM without_rowid WHERE a=12 AND b=34;
SELECT (SELECT count(*) FROM with_rowid) AS ordinary_rows, (SELECT count(*) FROM without_rowid) AS clustered_rows;
CREATE INDEX rowid_payload_idx ON with_rowid(payload);
CREATE INDEX clustered_payload_idx ON without_rowid(payload);
SELECT 'rowid secondary locator', cid, name, key FROM pragma_index_xinfo('rowid_payload_idx');
SELECT 'clustered secondary locator', cid, name, key FROM pragma_index_xinfo('clustered_payload_idx');
SELECT name, count(*) AS pages FROM dbstat WHERE name IN ('rowid_payload_idx', 'clustered_payload_idx') GROUP BY name;`,
      expectedResult:
        code`Both tables contain 2000 rows. The rowid table has a table object plus a primary-key index, while WITHOUT ROWID has one table B-tree for the composite key. The two query plans name different physical paths. Both row counts are 2000; index_xinfo shows a rowid auxiliary locator for rowid_payload_idx and a/b auxiliary locators for clustered_payload_idx. Record actual page totals rather than assuming one layout always wins.`,
      systemsLens:
        "WITHOUT ROWID trades the hidden integer table key for the declared primary key. That can remove one lookup structure for composite-key access, while secondary indexes must carry the primary-key columns needed to locate records. Unlike treating PostgreSQL CLUSTER as a durable ordering guarantee, this ordering is part of the SQLite table representation.",
      challenge:
        code`Add a secondary index on payload to both tables and compare the incremental pages; predict which key is clustered.`,
      revision: 3,
      minVersion: "3.53.4",
    },
    {
      slug: "overflow-pages",
      title: "Create overflow pages with large values",
      difficulty: "intermediate",
      tags: ["overflow-pages", "pages", "write-amplification"],
      prerequisites: ["without-rowid-layout"],
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 12,
      overview:
        "Insert 20 values larger than the deliberately small page size and inspect leaf versus overflow payload. Reuse your PostgreSQL TOAST intuition only at the level of out-of-line storage: SQLite uses overflow-page chains here and does not automatically compress these values. Distinguish logical value length from local page payload.",
      syntaxBreakdown: code`### In plain terms

SQLite keeps a record's local payload on its B-tree page when possible. A value larger than the page's local capacity spills into a linked chain of overflow pages. This lesson inserts high-entropy values and reads dbstat's payload and page-type columns to observe that physical chain; it is analogous to PostgreSQL needing out-of-line large-value storage, but SQLite's mechanism is not a compression claim.

### What you are learning

- **Overflow pages** extend a record beyond the local B-tree page.
- **Local versus overflow payload** separates bytes in the leaf from bytes in the chain.
- **High-entropy test data** avoids accidental small representation caused by repetition.

### Piece by piece

- **PRAGMA journal_mode=DELETE, page_size=1024, VACUUM** (pager setup): forces a small rollback-mode page so overflow appears with bounded values.
- **randomblob(5000)** (SQLite byte generator): returns 5000 pseudo-random bytes with poor compression opportunities.
- **hex(...)** (SQLite scalar function): converts bytes to text, so max_value_chars is about 10000 and the record is certainly large.
- **WITH RECURSIVE ... INSERT** (workload generator): makes 20 intentionally large records.
- **dbstat pagetype** (inspection column): distinguishes leaf from overflow pages.
- **dbstat payload and mx_payload** (inspection columns): show local payload bytes and the largest record payload observed for the object.
- **count(*) and max(length(value))** (aggregates): verify row count and logical value size before interpreting page counts.
`,
      setup: code`PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
VACUUM;
DROP TABLE IF EXISTS blobs;
CREATE TABLE blobs(id INTEGER PRIMARY KEY, value TEXT NOT NULL);`,
      code: code`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 20)
INSERT INTO blobs SELECT x, hex(randomblob(5000)) FROM n;
.headers on
.mode box
SELECT count(*) AS rows, max(length(value)) AS max_value_chars FROM blobs;
SELECT pagetype, count(*) AS pages, sum(payload) AS payload_bytes, max(mx_payload) AS max_payload FROM dbstat WHERE name='blobs' GROUP BY pagetype ORDER BY pagetype;
SELECT count(*) AS overflow_page_count FROM dbstat WHERE name='blobs' AND pagetype='overflow';`,
      expectedResult:
        code`rows = 20 and max_value_chars is about 10000. dbstat reports one or more overflow pages for blobs and overflow_page_count > 0; the leaf payload is only the local portion of each large record.`,
      systemsLens:
        "An apparently small point lookup can require traversing additional pages for a large record. SQLite's overflow chains and PostgreSQL's TOAST share that question about locality, not an identical storage or compression mechanism. Page structure predicts possible extra work; actual I/O still depends on access and cache state.",
      caution:
        code`The values are intentionally large and the database is disposable. Do not run this workload against a production path or a synchronized folder.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "freelist-vacuum-and-reuse",
      title: "Observe freelist reuse and VACUUM compaction",
      difficulty: "intermediate",
      tags: ["freelist", "vacuum", "pages", "capacity"],
      prerequisites: ["overflow-pages"],
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 18,
      overview:
        "Delete most rows, reuse some freed pages, then compact a lab copy and compare its length. This is an important naming trap after PostgreSQL: SQLite VACUUM is a database rewrite, not ordinary PostgreSQL VACUUM's routine reclamation of dead tuples. The freelist already supplies a different way to reuse space without shrinking the file.",
      syntaxBreakdown: code`### In plain terms

Deleting rows can release pages without shrinking the file. New inserts may reuse those pages, while VACUUM performs a separate rewrite that compacts a copy. We measure all three states and preserve the original evidence so a size improvement cannot hide data loss.

### What you are learning

- **Freelist reuse** recycles pages inside the file before allocating more.
- **VACUUM compaction** rewrites a database and is an availability/copy decision, not ordinary row deletion.
- **Evidence preservation** makes the compacted result comparable with the unmodified source.

### Piece by piece

- **PRAGMA journal_mode=DELETE, page_size=1024, VACUUM** (pager setup): creates a stable rollback-mode, small-page workload.
- **WITH RECURSIVE ... INSERT** (row generator): grows retained to 3000 rows so deleting most rows frees whole pages.
- **pragma_page_count and pragma_freelist_count** (table-valued PRAGMAs): report allocated pages and currently reusable free pages.
- **DELETE WHERE id > 500** (data change): removes 2500 rows while leaving file allocation available for reuse.
- **.shell stat -c** (host inspection): records byte length before and after deletion and vacuum.
- **.shell cp SOURCE DEST** (host copy): preserves the source before rewriting only the uniquely named vacuum copy.
- **VACUUM** (rewrite command): packs live rows into a new file; its post-rewrite freelist should be zero.
`,
      setup: code`PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
VACUUM;
DROP TABLE IF EXISTS retained;
CREATE TABLE retained(id INTEGER PRIMARY KEY, payload TEXT);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 3000) INSERT INTO retained SELECT x, printf('payload-%05d', x) FROM n;`,
      code: code`.headers on
.mode box
SELECT 'before_delete' AS phase, page_count, freelist_count FROM pragma_page_count, pragma_freelist_count;
.shell stat -c 'before_delete_bytes=%s' "$TUTOR_SQLITE_DB"
DELETE FROM retained WHERE id > 500;
SELECT 'after_delete' AS phase, page_count, freelist_count FROM pragma_page_count, pragma_freelist_count;
.shell stat -c 'after_delete_bytes=%s' "$TUTOR_SQLITE_DB"
WITH RECURSIVE n(x) AS (VALUES(3001) UNION ALL SELECT x + 1 FROM n WHERE x < 3100) INSERT INTO retained SELECT x, printf('replacement-%05d', x) FROM n;
SELECT 'after_reuse' AS phase, page_count, freelist_count FROM pragma_page_count, pragma_freelist_count;
.shell cp "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-vacuum.db"
.shell sqlite3 "$TUTOR_SQLITE_DB-vacuum.db" "VACUUM; SELECT page_count, freelist_count FROM pragma_page_count, pragma_freelist_count;"
.shell stat -c 'after_vacuum_bytes=%s' "$TUTOR_SQLITE_DB-vacuum.db"`,
      expectedResult:
        code`after_delete has a positive freelist_count while page_count and file bytes remain at least as large as before deletion. after_reuse shows that inserts consume free pages before growing the file. The copied database remains valid and after_vacuum has freelist_count = 0 and fewer pages/bytes than the un-compacted source.`,
      systemsLens:
        "Reusable space and returned filesystem space are different resources. SQLite's freelist can satisfy new allocations inside the existing file; VACUUM rewrites the database to compact it. Budget the rewrite's temporary storage and availability separately, much as PostgreSQL VACUUM FULL differs from ordinary vacuum.",
      caution:
        "The copy path is the reserved lab artifact TUTOR_SQLITE_DB-vacuum.db and a rerun overwrites that copy. The source is quiescent in DELETE mode at the copy step; this is not a generally safe recipe for copying a live WAL database.",
      studyCheckpoint: {
        core: [
          {
            source: "[SQLite Database File Format](https://sqlite.org/fileformat.html)",
            locator:
              `§1.2 “Pages”; §1.3.2 “Page Size”; §§1.5–1.7 “The Freelist”, “B-tree Pages”, and “Cell Payload Overflow Pages”; §§2.3–2.5 on rowid tables, WITHOUT ROWID tables, and indexes`,
          },
        ],
        optionalDepth: [
          {
            source: "[Architecture of SQLite](https://sqlite.org/arch.html)",
            locator: `“Overview”, “B-Tree”, and “Page Cache”`,
          },
        ],
        rationale: code`
You just observed page-aligned growth, B-tree shape, rowid and WITHOUT ROWID layout differences,
overflow chains, and freelist reuse across lessons 8–13. Read these bounded file-format sections to
connect those observations into one physical model of pages, keys, payload, and free space before
moving on to journals; the optional architecture excerpts are enrichment, not a prerequisite.
        `,
      },
      revision: 1,
      minVersion: "3.53.4",
    },
  ],
};
