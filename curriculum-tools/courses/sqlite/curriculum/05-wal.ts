import { code, type Module } from "../../../src/types.ts";

export const WAL: Module = {
  category: "wal",
  title: "WAL, snapshots, and checkpoints",
  lessons: [
    {
      slug: "wal-sidecar-files",
      title: "WAL turns one database into a live file set",
      difficulty: "intermediate",
      tags: ["wal", "file-format", "pager", "observability"],
      prerequisites: ["idempotent-retry-ledger"],
      safetyLevel: "writes-data",
      runIn: "mixed",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        code`Enable WAL, commit a row, and inspect the main database plus -wal and -shm sidecars while connections remain open.`,
      syntaxBreakdown:
        code`PRAGMA journal_mode=WAL changes the persistent mode. PRAGMA wal_autocheckpoint=0 prevents automatic checkpointing, leaving frames observable. .shell stat inspects file existence and bytes.`,
      setup: code`PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS notes;
CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT);
INSERT INTO notes VALUES (1, 'baseline');`,
      code: code`-- Session A
PRAGMA journal_mode;
PRAGMA wal_autocheckpoint=0;
INSERT INTO notes VALUES (2, 'frame-in-wal');
SELECT count(*) FROM notes;
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-wal" "$TUTOR_SQLITE_DB-shm"

-- Session B
PRAGMA journal_mode;
SELECT 'B sees committed WAL state', count(*) FROM notes;
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-wal" "$TUTOR_SQLITE_DB-shm";`,
      expectedResult:
        code`Both connections report journal_mode wal and count 2. While the connections are live, the main file, -wal, and -shm files exist; the WAL size is nonzero after the commit. Exact byte sizes depend on page size and SQLite build.`,
      systemsLens:
        code`A single-file logical database has a multi-file live lifecycle. Operational tooling must treat the main file, WAL, and SHM as one coordinated state machine.`,
      challenge:
        code`Run PRAGMA wal_checkpoint(TRUNCATE) after closing the reader. Which sidecar changes, and why is that a separate operation from committing?`,
      caution:
        code`Never copy just the main file while WAL contains committed frames; use an engine-coordinated backup.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "reader-and-writer-overlap",
      title: "WAL readers and the writer overlap safely",
      difficulty: "intermediate",
      tags: ["wal", "snapshots", "isolation", "transactions"],
      prerequisites: ["wal-sidecar-files"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        code`Hold a read transaction in A while B commits a new row. WAL lets the writer complete without evicting A's original snapshot.`,
      syntaxBreakdown:
        code`A read transaction establishes a snapshot. WAL appends committed frames while readers continue using the older database image.`,
      setup: code`PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS items;
CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT);
INSERT INTO items VALUES (1, 'old');`,
      code: code`-- Session A
BEGIN;
SELECT 'A before', count(*), group_concat(value) FROM items;

-- Session B
INSERT INTO items VALUES (2, 'new');
SELECT 'B committed', count(*) FROM items;

-- Session A
SELECT 'A snapshot after B commit', count(*), group_concat(value) FROM items;
COMMIT;
SELECT 'A current', count(*) FROM items;`,
      expectedResult:
        code`B commits and reports count 2 while A remains in its transaction. A's second query still reports count 1 and only old; after COMMIT, A's new query reports count 2.`,
      systemsLens:
        code`WAL's append-only frames decouple readers from the active writer, providing snapshot isolation without removing the single-writer serialization point.`,
      challenge:
        code`Add a second concurrent writer. Predict which operation waits or returns busy and why WAL is not distributed replication.`,
      caution:
        code`Readers must actually keep a transaction open; two autocommit SELECT statements can observe different snapshots.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "snapshot-reader",
      title: "A long-lived snapshot pins a temporal view",
      difficulty: "intermediate",
      tags: ["wal", "snapshots", "isolation", "checkpoints"],
      prerequisites: ["reader-and-writer-overlap"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 12,
      overview:
        code`Count rows inside a long-lived A snapshot while B performs several commits. End A's transaction and observe the handoff to current state.`,
      syntaxBreakdown:
        code`BEGIN fixes the read view for that transaction. B's two autocommit INSERT statements each append a committed state; A's snapshot does not move until it ends.`,
      setup: code`PRAGMA journal_mode=WAL;
DROP TABLE IF EXISTS log;
CREATE TABLE log(id INTEGER PRIMARY KEY, marker TEXT);
INSERT INTO log VALUES (1, 'base');`,
      code: code`-- Session A
BEGIN;
SELECT 'A snapshot start', count(*) FROM log;

-- Session B
INSERT INTO log(marker) VALUES ('b1');
INSERT INTO log(marker) VALUES ('b2');
SELECT 'B current', count(*) FROM log;

-- Session A
SELECT 'A stable snapshot', count(*) FROM log;
COMMIT;
SELECT 'A after transaction', count(*) FROM log;`,
      expectedResult:
        code`A starts at 1. B sees and commits 3 rows. A still reports 1 inside its transaction; after COMMIT, A's fresh query reports 3.`,
      systemsLens:
        code`A snapshot is a temporal isolation boundary and a reclamation horizon: old readers can constrain how quickly newer log state is reusable.`,
      challenge:
        code`Keep A open while running a passive checkpoint. Predict which frames can be reclaimed.`,
      caution:
        code`The snapshot is connection/transaction state, not a copy you can safely move between files.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "busy-snapshot-upgrade",
      title: "A stale WAL snapshot cannot silently become a writer",
      difficulty: "advanced",
      tags: ["wal", "snapshots", "busy", "optimistic-concurrency"],
      prerequisites: ["snapshot-reader"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        code`Let A read an old snapshot, let B commit, and then ask A to write. SQLite rejects the stale snapshot upgrade instead of risking a write based on obsolete state.`,
      syntaxBreakdown:
        code`SQLite documents SQLITE_BUSY_SNAPSHOT for a WAL reader-to-writer upgrade after another connection commits. Here that extended-code mapping is a documented inference; the primary evidence is the CLI's database is locked result. .timer shows that the failure is immediate: no amount of busy timeout can make a stale snapshot current, so the busy handler is not consulted.`,
      setup: code`PRAGMA journal_mode=WAL;
DROP TABLE IF EXISTS docs;
CREATE TABLE docs(id INTEGER PRIMARY KEY, body TEXT);
INSERT INTO docs VALUES (1, 'v1');`,
      code: code`-- Session A
.timeout 100
BEGIN;
SELECT 'A read', body FROM docs WHERE id=1;

-- Session B
UPDATE docs SET body='v2' WHERE id=1;
SELECT 'B committed', body FROM docs WHERE id=1;

-- Session A
.timer on
UPDATE docs SET body='A stale write' WHERE id=1;
.timer off
SELECT 'A still snapshot', body FROM docs WHERE id=1;
ROLLBACK;
SELECT 'A retry view', body FROM docs WHERE id=1;`,
      expectedResult:
        code`A first reads v1. B commits v2. A's UPDATE returns the primary CLI evidence database is locked with Run Time: real 0.000, well inside the 100 ms budget, because the snapshot can never become current by waiting; mapping it to the documented stale-snapshot SQLITE_BUSY_SNAPSHOT condition is an inference. A still reads v1 inside its transaction; after rollback, a fresh A query sees v2.`,
      systemsLens:
        code`A stale read cannot become a write without revalidation. This is the same optimistic-concurrency rule behind compare-and-swap and conflict-aware retries.`,
      challenge:
        code`Retry A with BEGIN IMMEDIATE after rolling back. Why does admission plus a fresh read avoid the stale upgrade?`,
      caution:
        code`The default CLI exposes the primary error text; bindings can inspect the extended SQLITE_BUSY_SNAPSHOT result code.`,
      revision: 2,
      minVersion: "3.53.4",
    },
    {
      slug: "checkpoint-modes",
      title: "Checkpoint modes trade progress for coordination",
      difficulty: "advanced",
      tags: ["wal", "checkpoints", "backpressure", "observability"],
      prerequisites: ["busy-snapshot-upgrade"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      overview:
        code`Generate WAL frames, hold a reader snapshot, and run PASSIVE, FULL, RESTART, and TRUNCATE checkpoints. Compare result triples and sidecar sizes as coordination gets stronger.`,
      syntaxBreakdown:
        code`PRAGMA wal_checkpoint(mode) returns busy, log frames, and checkpointed frames. PASSIVE does not wait; FULL waits for writers; RESTART also waits for readers to end; TRUNCATE additionally truncates the WAL.`,
      setup: code`PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS frames;
CREATE TABLE frames(id INTEGER PRIMARY KEY, note TEXT);
INSERT INTO frames(note) VALUES ('base');`,
      code: code`-- Session A
PRAGMA wal_autocheckpoint=0;

-- Session B
BEGIN;
SELECT 'reader pins snapshot', count(*) FROM frames;

-- Session A
INSERT INTO frames(note) VALUES ('frame-1'), ('frame-2'), ('frame-3'), ('frame-4'), ('frame-5'), ('frame-6'), ('frame-7'), ('frame-8');
.timeout 100
PRAGMA wal_checkpoint(PASSIVE);
PRAGMA wal_checkpoint(FULL);
PRAGMA wal_checkpoint(RESTART);
PRAGMA wal_checkpoint(TRUNCATE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal"

-- Session B
COMMIT;

-- Session A
PRAGMA wal_checkpoint(FULL);
PRAGMA wal_checkpoint(RESTART);
PRAGMA wal_checkpoint(TRUNCATE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal";`,
      expectedResult:
        code`On SQLite 3.53.4 with the default 4 KiB layout, the four calls while B's snapshot is open report PASSIVE 0|6|5, then FULL 1|6|5, RESTART 1|6|5, and TRUNCATE 1|6|5. After B commits, FULL and RESTART report 0|6|6, TRUNCATE reports 0|0|0, and the WAL stat is 0 bytes. Page layout can change the frame counts, but the relationship is stable: PASSIVE makes partial progress, the stronger calls cannot finish past the reader, and release permits full checkpoint plus truncation.`,
      systemsLens:
        code`Applying log frames and reclaiming log space are distinct operations. A slow observer sets the safe reclamation horizon and can turn checkpoint work into backpressure.`,
      challenge:
        code`Repeat with no reader. Which modes converge to the same result, and why is PASSIVE still useful for low-latency maintenance?`,
      caution:
        code`Checkpoint results and exact sidecar sizes vary with page size and scheduling; compare the busy/log/checkpointed relationship rather than relying on one literal triple.`,
      revision: 2,
      minVersion: "3.53.4",
    },
    {
      slug: "checkpoint-starvation",
      title: "A slow reader can grow the WAL indefinitely",
      difficulty: "advanced",
      tags: ["wal", "checkpoints", "backpressure", "capacity", "snapshots"],
      prerequisites: ["checkpoint-modes"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      overview:
        code`Pin an old reader, commit repeated batches, and attempt passive checkpoints. Observe WAL growth and incomplete progress until the reader releases its snapshot.`,
      syntaxBreakdown:
        code`wal_autocheckpoint=0 makes the backlog visible. A passive checkpoint reports progress without waiting; TRUNCATE after the reader ends reclaims the file.`,
      setup: code`PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS queue;
CREATE TABLE queue(id INTEGER PRIMARY KEY, payload TEXT);
INSERT INTO queue(payload) VALUES ('anchor');`,
      code: code`-- Session B
BEGIN;
SELECT 'old reader', count(*) FROM queue;

-- Session A
PRAGMA wal_autocheckpoint=0;
INSERT INTO queue(payload) VALUES ('batch-1');
INSERT INTO queue(payload) VALUES ('batch-2');
INSERT INTO queue(payload) VALUES ('batch-3');
PRAGMA wal_checkpoint(PASSIVE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal"
INSERT INTO queue(payload) VALUES ('batch-4');
INSERT INTO queue(payload) VALUES ('batch-5');
INSERT INTO queue(payload) VALUES ('batch-6');
PRAGMA wal_checkpoint(PASSIVE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal"

-- Session B
COMMIT;

-- Session A
PRAGMA wal_checkpoint(TRUNCATE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal";
SELECT 'current rows', count(*) FROM queue;`,
      expectedResult:
        code`While B's snapshot is open, passive checkpoints report a WAL backlog and the sidecar grows after each batch. After B commits, TRUNCATE can reclaim the WAL; current rows then total 7.`,
      systemsLens:
        code`The slowest observer controls garbage collection. In WAL this is a local form of backpressure: unbounded reader lifetimes become unbounded log-space demand.`,
      challenge:
        code`Set a WAL size alert and choose a policy for readers that exceed it: cancellation, restart, or allowing growth.`,
      studyCheckpoint: {
        core: [
          {
            source: "[SQLite Write-Ahead Logging](https://sqlite.org/wal.html)",
            locator:
              "§1 “Overview”; §§2–2.3 “How WAL Works”; §§3–3.3 “Activating And Configuring WAL Mode”; §9 “Sometimes Queries Return SQLITE_BUSY In WAL Mode”; omit the struck-through pre-3.11 warning and §11 bug mechanics",
          },
        ],
        optionalDepth: [
          {
            source: "[SQLite Database File Format](https://sqlite.org/fileformat.html)",
            locator:
              "Section 4, especially 4.3–4.6 (checkpointing, reset and reuse, the reader algorithm, and the WAL-index)",
          },
        ],
        rationale:
          "You just saw a live reader hold back checkpoint progress while committed writes enlarged the WAL sidecar. Read these bounded sections before continuing to connect that evidence to WAL append and commit records, reader end-marks, checkpointing, reuse, and the fact that WAL still has busy cases and one writer. The 3.53.4 course minimum includes the WAL-reset fix; older SQLite 3.7.0–3.51.2 installations should use 3.51.3+ or an official fixed backport for production.",
      },
      caution:
        code`WAL is same-host coordination, not replication or consensus; do not place the files on NFS, SMB, or a synchronized cloud directory.`,
      revision: 1,
      minVersion: "3.53.4",
    },
  ],
};
