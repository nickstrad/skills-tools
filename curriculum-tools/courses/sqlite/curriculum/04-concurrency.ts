import { code, type Module } from "../../../src/types.ts";

export const CONCURRENCY: Module = {
  category: "concurrency",
  title: "Concurrency, isolation, and safe retries",
  lessons: [
    {
      slug: "deferred-write-race",
      title: "Deferred transactions discover contention at the write",
      difficulty: "intermediate",
      tags: ["transactions", "locking", "busy", "isolation"],
      prerequisites: ["batching-changes-the-cost"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        code`Two DEFERRED transactions can both read before either has reserved the single writer slot. Create that race and observe that the conflict is reported when one reader tries to become a writer.`,
      syntaxBreakdown:
        code`BEGIN DEFERRED starts a transaction without immediately taking a RESERVED write lock. A busy timeout bounds waiting, and changes() reports whether the preceding write changed a row.`,
      setup: code`PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS counter;
CREATE TABLE counter(id INTEGER PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO counter VALUES (1, 0);`,
      code: code`-- Session A
PRAGMA busy_timeout=100;
BEGIN DEFERRED;
SELECT 'A snapshot', value FROM counter WHERE id=1;

-- Session B
PRAGMA busy_timeout=100;
BEGIN DEFERRED;
SELECT 'B snapshot', value FROM counter WHERE id=1;

-- Session A
UPDATE counter SET value=value+1 WHERE id=1;
SELECT 'A changes', changes();

-- Session B
UPDATE counter SET value=value+1 WHERE id=1;
SELECT 'B first changes (may be 0 after SQLITE_BUSY)', changes();

-- Session A
ROLLBACK;

-- Session B
UPDATE counter SET value=value+1 WHERE id=1;
COMMIT;
SELECT 'committed value', value FROM counter WHERE id=1;`,
      expectedResult:
        code`Both sessions initially print value 0. A's update reports 1. B's first update normally prints a database-is-locked error; after A rolls back, B can update and commit, leaving value 1.`,
      systemsLens:
        code`DEFERRED acquisition is optimistic admission control: work can begin before the serialization point is secured, so a retry must know whether application work is safe to repeat.`,
      challenge:
        code`Repeat with A committing instead of rolling back. Predict which transaction can finish and why.`,
      caution:
        code`The exact busy error text is CLI/version dependent; the lock boundary, not the wording, is the evidence.`,
      revision: 1,
      minVersion: "3.45",
    },
    {
      slug: "immediate-reserves-writer",
      title: "BEGIN IMMEDIATE makes writer admission explicit",
      difficulty: "intermediate",
      tags: ["transactions", "locking", "busy", "serialization"],
      prerequisites: ["deferred-write-race"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 12,
      overview:
        code`Compare BEGIN IMMEDIATE with the deferred race: the second writer learns it cannot enter at the transaction boundary, before doing write work.`,
      syntaxBreakdown:
        code`BEGIN IMMEDIATE obtains a RESERVED lock up front. .timeout controls how long sqlite3 waits for a lock before returning SQLITE_BUSY.`,
      setup: code`PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS events;
CREATE TABLE events(id INTEGER PRIMARY KEY, note TEXT);
INSERT INTO events(note) VALUES ('baseline');`,
      code: code`-- Session A
.timeout 100
BEGIN IMMEDIATE;
INSERT INTO events(note) VALUES ('A owns writer');

-- Session B
.timeout 250
.timer on
BEGIN IMMEDIATE;
.timer off
SELECT 'B entered', changes();

-- Session A
COMMIT;

-- Session B
BEGIN IMMEDIATE;
INSERT INTO events(note) VALUES ('B after admission');
COMMIT;
SELECT id, note FROM events ORDER BY id;`,
      expectedResult:
        code`B's timed first BEGIN IMMEDIATE returns database is locked after roughly the configured 250 ms (the timer reports the measured wait), while A remains the only writer. After A commits, B can begin and commit; final rows are baseline, A owns writer, and B after admission.`,
      systemsLens:
        code`An explicit admission point makes overload visible before expensive application work and defines a clean retry boundary.`,
      challenge:
        code`Set B's timeout to 0 and then to 1000. What latency budget and user-visible failure does each policy create?`,
      caution:
        code`B's first BEGIN is intentionally a bounded 250 ms failure, not a release-dependent blocking step. A commits only after that failure; do not run both transactions in one sqlite3 process.`,
      revision: 1,
      minVersion: "3.45",
    },
    {
      slug: "rollback-reader-writer-blocking",
      title: "Rollback mode moves contention to writer commit",
      difficulty: "intermediate",
      tags: ["rollback-journal", "locking", "transactions", "isolation"],
      prerequisites: ["immediate-reserves-writer"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        code`Hold a rollback-mode reader open while a writer changes data. The writer can prepare changes, but its commit needs an exclusive lock and waits for the reader.`,
      syntaxBreakdown:
        code`A read transaction keeps a SHARED lock. A writer's COMMIT is the blocking operation in rollback mode; .timeout makes the wait finite.`,
      setup: code`PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS messages;
CREATE TABLE messages(id INTEGER PRIMARY KEY, body TEXT);
INSERT INTO messages(body) VALUES ('before');`,
      code: code`-- Session A
.timeout 5000
BEGIN;
SELECT 'A sees', count(*) FROM messages;

-- Session B
.timeout 2000
BEGIN IMMEDIATE;
INSERT INTO messages(body) VALUES ('after');

-- Session B (blocks until A ends its read)
COMMIT;

-- Session A
COMMIT;
SELECT 'A after release', count(*) FROM messages;

-- Session B
SELECT 'B committed', count(*) FROM messages;`,
      expectedResult:
        code`A first sees 1. B's INSERT succeeds inside its transaction, but COMMIT waits while A's read is open; after A commits, B completes and the final count is 2.`,
      systemsLens:
        code`Lock-upgrade protocols determine where latency appears: rollback mode can defer a writer conflict until commit, making the commit path a queue.`,
      challenge:
        code`Switch both sessions to WAL and repeat. Which step stops blocking, and which single-writer constraint remains?`,
      caution:
        code`A's transaction must remain open between SELECT and COMMIT; an autocommit SELECT releases its lock immediately.`,
      revision: 1,
      minVersion: "3.45",
    },
    {
      slug: "busy-timeout-bounds-wait",
      title: "A busy timeout is a bounded queue budget",
      difficulty: "intermediate",
      tags: ["busy", "locking", "retries", "backpressure"],
      prerequisites: ["rollback-reader-writer-blocking"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        code`Make one writer hold the lock longer than a peer's wait budget, then release it and retry. Observe a bounded failure instead of an indefinite hang.`,
      syntaxBreakdown:
        code`.timeout N sets sqlite3's busy timeout in milliseconds. A retry is a new statement after the lock holder has released its transaction.`,
      setup: code`PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS work;
CREATE TABLE work(id INTEGER PRIMARY KEY, done INTEGER NOT NULL);
INSERT INTO work VALUES (1, 0);`,
      code: code`-- Session A
BEGIN IMMEDIATE;
UPDATE work SET done=1 WHERE id=1;
.shell sleep 0.4

-- Session B
.timeout 150
.timer on
UPDATE work SET done=2 WHERE id=1;
.timer off
SELECT 'B after first attempt', done FROM work;

-- Session A
COMMIT;

-- Session B
UPDATE work SET done=2 WHERE id=1;
SELECT 'B retry', changes(), done FROM work;`,
      expectedResult:
        code`B's first timed UPDATE reports database is locked after approximately 150 ms (the timer reports the measured wait) and its read still sees committed value 0. A then commits. B's retry succeeds and reports changes() = 1 with done = 2.`,
      systemsLens:
        code`Every queue needs a wait and cancellation budget. Busy timeout plus retry policy turns lock contention into bounded backpressure rather than unbounded latency.`,
      challenge:
        code`Change A's sleep to 0.05 seconds. Predict whether B succeeds on the first attempt with the same timeout.`,
      caution:
        code`The sleep is only a deterministic demonstration delay; it is not a durability or power-loss test.`,
      revision: 1,
      minVersion: "3.45",
    },
    {
      slug: "compare-and-swap-update",
      title: "Use a version predicate as compare-and-swap",
      difficulty: "intermediate",
      tags: ["optimistic-concurrency", "transactions", "retries", "consistency"],
      prerequisites: ["busy-timeout-bounds-wait"],
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        code`Have two actors read version 1, then condition each update on that version. Exactly one decision wins and the loser gets an observable zero-row result.`,
      syntaxBreakdown:
        code`UPDATE ... WHERE version=? is the compare-and-swap predicate. changes() is the conditional-write result that drives conflict handling.`,
      setup: code`DROP TABLE IF EXISTS document;
CREATE TABLE document(id INTEGER PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL);
INSERT INTO document VALUES (1, 'base', 1);`,
      code: code`-- Session A
SELECT 'A read', body, version FROM document WHERE id=1;

-- Session B
SELECT 'B read', body, version FROM document WHERE id=1;

-- Session A
UPDATE document SET body='A edit', version=version+1 WHERE id=1 AND version=1;
SELECT 'A changed', changes();

-- Session B
UPDATE document SET body='B edit', version=version+1 WHERE id=1 AND version=1;
SELECT 'B changed', changes();

-- Session A
SELECT 'winner', body, version FROM document WHERE id=1;`,
      expectedResult:
        code`Both reads report version 1. One update reports changes() = 1 and advances version to 2; the other reports 0 and cannot overwrite the winner. With this ordering A wins and the final body is A edit.`,
      systemsLens:
        code`Optimistic concurrency converts an invisible lost update into a detectable conflict that the caller can merge, retry, or surface.`,
      challenge:
        code`Run B's UPDATE before A's. Predict the winner without changing the SQL predicate.`,
      caution:
        code`The version check and mutation must be one SQL statement; separate SELECT and unconditional UPDATE reintroduces the race.`,
      revision: 1,
      minVersion: "3.45",
    },
    {
      slug: "idempotent-retry-ledger",
      title: "Put retry identity and its effect in one transaction",
      difficulty: "intermediate",
      tags: ["idempotency", "retries", "atomicity", "deduplication", "transactions"],
      prerequisites: ["compare-and-swap-update"],
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 15,
      overview:
        code`Apply the same operation twice through a unique ledger row and a domain update. The first attempt changes the account; the replay records no second effect.`,
      syntaxBreakdown:
        code`A UNIQUE operation_id makes the ledger the deduplication boundary. INSERT OR IGNORE is idempotent, and changes() gates the domain mutation to the newly claimed operation.`,
      setup: code`DROP TABLE IF EXISTS applied_operations;
DROP TABLE IF EXISTS account;
CREATE TABLE account(id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);
CREATE TABLE applied_operations(operation_id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT INTO account VALUES (1, 100);`,
      code: code`-- Session A
BEGIN IMMEDIATE;
INSERT OR IGNORE INTO applied_operations VALUES ('op-42', 'first-attempt');
SELECT 'claim 1', changes();
UPDATE account SET balance=balance+10 WHERE id=1 AND changes()=1;
COMMIT;
SELECT 'after first', balance FROM account;

BEGIN IMMEDIATE;
INSERT OR IGNORE INTO applied_operations VALUES ('op-42', 'replay');
SELECT 'claim 2', changes();
UPDATE account SET balance=balance+10 WHERE id=1 AND changes()=1;
COMMIT;
SELECT 'after replay', balance, (SELECT count(*) FROM applied_operations) FROM account;`,
      expectedResult:
        code`The first claim reports 1 and balance becomes 110. The replay claim reports 0, its gated UPDATE changes no row, and final output is balance 110 with one ledger row.`,
      systemsLens:
        code`At-least-once delivery becomes safe when operation identity and the side effect share an atomic commit boundary; retries then collapse to one durable effect.`,
      challenge:
        code`Make the first transaction roll back after claiming. What should the retry observe, and why is that desirable?`,
      caution:
        code`Do not split the ledger insert and account update into separate transactions: a crash between them can create a permanently skipped effect.`,
      revision: 1,
      minVersion: "3.45",
    },
  ],
};
