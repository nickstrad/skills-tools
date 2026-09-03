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
      prerequisites: ["application-id-schema-versioning"],
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 15,
      overview:
        code`Grow a table with fixed-size rows, then correlate page_count, file bytes, and the dbstat virtual table.`,
      syntaxBreakdown:
        code`PRAGMA page_size/page_count report pager geometry; dbstat exposes one row per B-tree page; pagetype distinguishes leaf, internal, and overflow pages.`,
      setup: code`PRAGMA page_size=1024;
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
        code`Pages are the unit of I/O and persistence. A logical table grows by allocating B-tree pages, not by appending an abstract row to an infinite array.`,
      challenge:
        code`Repeat with page_size=4096 and predict whether the table needs fewer pages for the same rows.`,
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
        code`Insert ordered batches while sampling page count and B-tree depth. Discrete allocation steps reveal structural splits and root growth.`,
      syntaxBreakdown:
        code`A recursive CTE generates deterministic batches; dbstat.path describes page ancestry; page_count samples allocated pages after each batch.`,
      setup: code`PRAGMA page_size=1024;
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
        code`Bounded fanout forces structural splits. A split rewrites or allocates several pages, producing bursty write amplification even when each logical insert is small.`,
      challenge:
        code`Insert the same keys in a random order in another file and compare page count and depth; explain any difference as locality, not a universal guarantee.`,
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
        code`Store equivalent records in a normal rowid table, an INTEGER PRIMARY KEY alias, and a table with a secondary unique index; compare their B-tree page footprints.`,
      syntaxBreakdown:
        code`INTEGER PRIMARY KEY aliases the table's rowid; a secondary index is another B-tree; dbstat aggregates page counts by object name.`,
      setup: code`PRAGMA page_size=1024;
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
        code`Logical identity choices change physical indirection and storage cost. An INTEGER PRIMARY KEY can avoid an extra lookup structure; a secondary index is a maintained materialized access path.`,
      challenge:
        code`Use EXPLAIN QUERY PLAN to look up one key in normal and indexed and identify the extra B-tree used by the indexed table.`,
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
        code`Build equivalent composite-key tables with and without WITHOUT ROWID, then compare their page use and lookup plans.`,
      syntaxBreakdown:
        code`PRIMARY KEY(a,b) on a rowid table creates a separate unique index; WITHOUT ROWID makes the declared composite key the table's B-tree key; EXPLAIN QUERY PLAN reports access paths.`,
      setup: code`PRAGMA page_size=1024;
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
EXPLAIN QUERY PLAN SELECT payload FROM without_rowid WHERE a=12 AND b=34;`,
      expectedResult:
        code`Both tables contain 2000 rows. The rowid table has a table object plus a primary-key index, while WITHOUT ROWID has one table B-tree for the composite key. The two query plans name different physical paths. Record actual page totals rather than assuming one layout always wins.`,
      systemsLens:
        code`Clustering trades one access path against update and secondary-index costs. Physical layout is a workload decision, not merely a declaration of logical keys.`,
      challenge:
        code`Add a secondary index on payload to both tables and compare the incremental pages; predict which key is clustered.`,
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
        code`Insert poorly compressible values larger than a page and inspect dbstat's payload and page types.`,
      syntaxBreakdown:
        code`randomblob creates high-entropy bytes; hex doubles their textual representation; dbstat pagetype=overflow identifies chained overflow pages and mx_payload reports the largest record.`,
      setup: code`PRAGMA page_size=1024;
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
        code`Oversized values turn a point lookup into multiple page I/Os and amplify rewrites. The logical row abstraction hides a physical chain whose length is visible to the pager.`,
      caution:
        code`The values are intentionally large and the database is disposable. Do not run this workload against a production path or a synchronized folder.`,
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
        code`Delete most rows, observe free pages and unchanged file size, reuse some pages with new inserts, and run VACUUM on a uniquely named copy.`,
      syntaxBreakdown:
        code`freelist_count counts reusable pages; VACUUM rewrites a compact database; .shell cp preserves the source before the rewrite; page_count and stat expose size.`,
      setup: code`PRAGMA page_size=1024;
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
        code`Reuse and compaction are separate policies. Freelist reuse avoids immediate allocation, while VACUUM trades availability and a rewrite for a smaller file and denser layout.`,
      caution:
        code`Only the uniquely named TUTOR_SQLITE_DB-vacuum.db copy is rewritten. Keep the original evidence and never VACUUM a live production file merely to chase a size number.`,
    },
  ],
};
