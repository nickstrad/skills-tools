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
        code`Two DEFERRED transactions can both read before either has reserved the single writer slot. Create that race and observe that the loser is told immediately, even with a generous busy timeout, because waiting inside an open read transaction could deadlock.`,
      syntaxBreakdown:
        code`BEGIN DEFERRED starts a transaction without taking the RESERVED write lock. .timeout sets the busy handler's wait budget, and .timer prints how long a statement really took. SQLite skips the busy handler when a connection that already holds a read transaction asks for RESERVED while another connection holds it: the holder's commit would need this reader gone, so waiting cannot help.`,
      setup: code`.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS counter;
CREATE TABLE counter(id INTEGER PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO counter VALUES (1, 0);`,
      code: code`-- Session A
.timeout 2000
BEGIN DEFERRED;
SELECT 'A snapshot', value FROM counter WHERE id=1;

-- Session B
.timeout 2000
BEGIN DEFERRED;
SELECT 'B snapshot', value FROM counter WHERE id=1;

-- Session A
UPDATE counter SET value=value+1 WHERE id=1;
SELECT 'A changes', changes();

-- Session B
.timer on
UPDATE counter SET value=value+1 WHERE id=1;
.timer off
SELECT 'B still inside its read transaction', value FROM counter WHERE id=1;

-- Session A
ROLLBACK;

-- Session B
UPDATE counter SET value=value+1 WHERE id=1;
COMMIT;
SELECT 'committed value', value FROM counter WHERE id=1;`,
      expectedResult:
        code`Both sessions initially print value 0 and A's update reports changes 1. B's timed update prints database is locked with Run Time: real 0.000 (a few microseconds), not after the 2 second budget: the busy handler was never invoked. B's transaction is still open and still reads 0. After A rolls back, B's retry succeeds and the committed value is 1.`,
      systemsLens:
        code`DEFERRED acquisition is optimistic admission control: work begins before the serialization point is secured, and the engine refuses to queue a reader that wants to become a writer because queueing it could deadlock the writer that is ahead of it. A retry loop that never releases its read transaction spins forever; the correct retry is ROLLBACK, then begin again.`,
      challenge:
        code`Repeat with A running COMMIT instead of ROLLBACK while B still holds its read transaction. A's commit needs an EXCLUSIVE lock that B's SHARED lock blocks. Predict which side waits for its full timeout, which side fails instantly, and which one must give up for either to finish.`,
      caution:
        code`The exact busy error text is CLI/version dependent; the lock boundary and the measured zero wait, not the wording, are the evidence.`,
      revision: 2,
      minVersion: "3.53.4",
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
      setup: code`.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
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
SELECT 'B refused admission, still autocommit', count(*) AS committed_rows FROM events;

-- Session A
COMMIT;

-- Session B
BEGIN IMMEDIATE;
INSERT INTO events(note) VALUES ('B after admission');
COMMIT;
SELECT id, note FROM events ORDER BY id;`,
      expectedResult:
        code`B's timed first BEGIN IMMEDIATE returns database is locked after roughly the configured 250 ms (the timer reports the measured wait), while A remains the only writer; B is left in autocommit and reads committed_rows = 1. After A commits, B can begin and commit; final rows are baseline, A owns writer, and B after admission.`,
      systemsLens:
        code`An explicit admission point makes overload visible before expensive application work and defines a clean retry boundary.`,
      challenge:
        code`Set B's timeout to 0 and then to 1000. What latency budget and user-visible failure does each policy create?`,
      caution:
        code`B's first BEGIN is intentionally a bounded 250 ms failure, not a release-dependent blocking step. A commits only after that failure; do not run both transactions in one sqlite3 process.`,
      revision: 1,
      minVersion: "3.53.4",
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
      setup: code`.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS messages;
CREATE TABLE messages(id INTEGER PRIMARY KEY, body TEXT);
INSERT INTO messages(body) VALUES ('before');`,
      code: code`-- Session A
.timeout 5000
BEGIN;
SELECT 'A sees', count(*) FROM messages;

-- Session B
.timeout 30000
BEGIN IMMEDIATE;
INSERT INTO messages(body) VALUES ('after');

-- Session B (blocks until A ends its read; run A's COMMIT within 30 seconds)
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
        code`A's transaction must remain open between SELECT and COMMIT; an autocommit SELECT releases its lock immediately. B's COMMIT waits up to 30 seconds, so switch to A and commit while it waits. If it does time out, B's transaction is still open (a failed COMMIT does not roll back): commit A, then run B's COMMIT again.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "busy-timeout-bounds-wait",
      title: "A busy timeout is a bounded queue budget",
      difficulty: "intermediate",
      tags: ["busy", "locking", "retries", "backpressure"],
      prerequisites: ["rollback-reader-writer-blocking"],
      safetyLevel: "locking",
      runIn: "mixed",
      sessions: 1,
      estimatedMinutes: 15,
      overview:
        code`Start a background writer that holds the lock for a known time, then contend with it twice: once with a wait budget larger than the hold, once with a budget smaller than it. The timer shows a short wait followed by success, then a bounded failure instead of an indefinite hang.`,
      syntaxBreakdown:
        code`.shell runs a host command; the command starts a second sqlite3 process in the background that holds BEGIN IMMEDIATE for a fixed sleep and then commits. .timeout N sets this session's busy timeout in milliseconds. .timer on prints how long the statement actually waited. A retry is a new statement after the holder has released its transaction.`,
      setup: code`.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS work;
CREATE TABLE work(id INTEGER PRIMARY KEY, done INTEGER NOT NULL);
INSERT INTO work VALUES (1, 0);`,
      code: code`.print -- round 1: holder keeps the lock 0.5 s, our budget is 2 s
.shell (echo 'BEGIN IMMEDIATE; UPDATE work SET done=1 WHERE id=1;'; sleep 0.5; echo 'COMMIT;') | sqlite3 "$TUTOR_SQLITE_DB" >/dev/null 2>&1 &
.shell sleep 0.1
.timeout 2000
.timer on
UPDATE work SET done=2 WHERE id=1;
.timer off
SELECT 'within budget', changes() AS changed, done FROM work;
.print -- round 2: holder keeps the lock 1 s, our budget is 150 ms
.shell (echo 'BEGIN IMMEDIATE; UPDATE work SET done=3 WHERE id=1;'; sleep 1; echo 'COMMIT;') | sqlite3 "$TUTOR_SQLITE_DB" >/dev/null 2>&1 &
.shell sleep 0.1
.timeout 150
.timer on
UPDATE work SET done=4 WHERE id=1;
.timer off
SELECT 'over budget, still committed value', done FROM work;
.shell sleep 1
UPDATE work SET done=4 WHERE id=1;
SELECT 'retry after release', changes() AS changed, done FROM work;`,
      expectedResult:
        code`Round 1: the timed UPDATE succeeds after a measured wait of roughly 0.4 s (the remainder of the holder's 0.5 s hold), and within budget prints changed = 1, done = 2. Round 2: the timed UPDATE prints database is locked after roughly 0.15 s, the bounded budget, and the following read still shows the committed value 2. After the holder commits and the sleep passes, the retry prints changed = 1, done = 4.`,
      systemsLens:
        code`Every queue needs a wait and cancellation budget. Busy timeout plus retry policy turns lock contention into bounded backpressure: the budget decides whether a caller waits for the holder or is told to come back, and neither outcome is an indefinite hang.`,
      challenge:
        code`Set round 2's budget to 1500 ms and predict the measured wait. Then set the holder's sleep to 5 s: what does a caller learn from a 150 ms budget, and what does it cost the caller that waits the whole time?`,
      caution:
        code`The background holder is a disposable sqlite3 process that commits or exits on its own within a few seconds; the sleeps are demonstration delays, not a durability or power-loss test.`,
      revision: 2,
      minVersion: "3.53.4",
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
      minVersion: "3.53.4",
    },
    {
      slug: "idempotent-retry-ledger",
      title: "Deduplicate retries within SQLite's one-file commit boundary",
      difficulty: "intermediate",
      tags: ["idempotency", "retries", "atomicity", "deduplication", "transactions"],
      prerequisites: ["compare-and-swap-update"],
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 15,
      overview:
        code`Assume an at-least-once caller may submit the same operation more than once. Put a unique operation identity and its account change in one transaction against one SQLite database file, then replay that identity and observe that the balance changes only once. This local commit boundary does not include an email, payment call, or other effect performed outside the file.`,
      syntaxBreakdown: code`### In plain terms

Assume an at-least-once caller can retry an operation after losing its response. An operation identity is a stable key for that logical operation, and the local transaction boundary is the point where SQLite commits all writes to this one database file together. This experiment stores the identity in a ledger table and the domain effect in an account table, so a replay can be recognized before it changes the balance again. A side effect outside the file, such as sending an email or charging a card, is not part of SQLite's transaction and cannot be rolled back by it.

### What you are learning

- **One-file atomicity** means the ledger claim and account update become visible together at COMMIT or neither remains after ROLLBACK.
- **Unique operation identity** turns a repeated delivery into a primary-key conflict on the same logical operation rather than a second ledger row.
- **Conflict-as-no-op** uses INSERT OR IGNORE and changes() so only a newly inserted identity gates the domain update.
- **External-effect boundary** means SQLite can protect durable local state, but it cannot atomically include a remote API, email provider, or other system.

### Piece by piece

- **DROP TABLE IF EXISTS** (SQL schema-reset clause)
  - What it is: IF EXISTS makes dropping an absent table harmless.
  - What it does here: It makes the setup repeatable by removing the prior ledger and account from this learner-owned database before recreating them.
  - What it gives us: Every run starts with one account at balance 100 and an empty operation ledger.
- **PRIMARY KEY** (table constraint)
  - What it is: A primary key requires each operation_id to be unique and identifies one ledger row.
  - What it does here: The operation identity op-42 can be inserted once; the replay encounters the same key.
  - What it gives us: The ledger row is SQLite's durable deduplication evidence, while NOT NULL on applied_at rejects an incomplete claim.
- **BEGIN IMMEDIATE** (transaction-start statement)
  - What it is: It starts a transaction and obtains SQLite's writer admission before the statements that follow.
  - What it does here: Each attempt groups its ledger insert and account update inside one local transaction.
  - What it gives us: The commit boundary is explicit, and another writer cannot interleave a partial attempt into this file.
- **INSERT OR IGNORE** (conflict-handling clause)
  - What it is: OR IGNORE suppresses a constraint conflict and leaves the conflicting row unchanged instead of raising an error.
  - What it does here: The first op-42 insert adds a ledger row; the replay's identical operation_id is ignored.
  - What it gives us: The following changes() call reports 1 for a new claim and 0 for a replay, making the decision observable.
- **changes()** (SQLite scalar function)
  - What it is: It returns the number of rows changed by the most recent INSERT, UPDATE, or DELETE on this connection.
  - What it does here: SELECT prints the result of each ledger insert, and the value is then used to gate the account UPDATE.
  - What it gives us: claim 1 = 1 proves ownership of the new identity; claim 2 = 0 proves the replay did not insert a second ledger row.
- **UPDATE ... AND changes()=1** (conditional update predicate)
  - What it is: The extra predicate makes the account mutation conditional on the immediately preceding ledger insert changing one row.
  - What it does here: The first attempt adds 10 to account 1, while the replay matches no account row because its claim changed zero rows.
  - What it gives us: The balance moves from 100 to 110 once, which is the domain-effect evidence.
- **SELECT count(*) FROM applied_operations** (scalar subquery)
  - What it is: The parenthesized SELECT computes one value from the ledger table for the outer result row.
  - What it does here: It counts committed operation identities alongside the final account balance.
  - What it gives us: A count of 1 proves that the replay did not create a second ledger row.
- **COMMIT** (transaction-end statement)
  - What it is: It records the current transaction's successful writes as one committed unit in the database file.
  - What it does here: It publishes the ledger claim and account change together for each attempt.
  - What it gives us: The final query can inspect both the balance and the single durable ledger row after the two commit boundaries.
- **ROLLBACK** (transaction-end statement used in the challenge)
  - What it is: It abandons every uncommitted write in the current transaction.
  - What it does here: Replacing the first COMMIT with ROLLBACK removes both the first ledger claim and its account update.
  - What it gives us: The retry can claim the same operation identity, demonstrating that an uncommitted local effect was not permanently consumed.
`,
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
        code`SQLite's mechanism here is a local transaction over tables in one database file: a primary-key operation identity and its domain mutation cross the same commit boundary, so duplicate deliveries collapse to one durable local effect. That is not end-to-end idempotency; an email, payment request, message publish, or other external effect cannot be included in or undone by this SQLite transaction. Embedded applications, offline agents, and local job receipts use this boundary, then need an outbox or provider-side idempotency at the external system's own boundary.`,
      challenge:
        code`Change the first COMMIT to ROLLBACK after the account UPDATE, then run the second attempt. Predict claim 2 and the final balance: the local claim and account change should both disappear, allowing the retry to claim op-42 and apply the effect. Now imagine an email or payment call happened between the UPDATE and ROLLBACK. Which local rows disappear, and what effect can SQLite not undo?`,
      caution:
        code`Do not split the ledger insert and account update into separate transactions: a crash between them can create a permanently skipped effect.`,
      studyCheckpoint: {
        core: [
          {
            source: "[Isolation In SQLite](https://sqlite.org/isolation.html)",
            locator: `“Isolation Between Database Connections” and “Isolation And Concurrency”`,
          },
          {
            source:
              "[File Locking And Concurrency In SQLite Version 3](https://sqlite.org/lockingv3.html)",
            locator:
              `§§2–3, §4.1, and §5: the five locking states, obtaining locks, and rollback-mode lock transitions`,
          },
        ],
        rationale: code`
You just observed deferred and immediate admission, reader/writer blocking, bounded busy waits,
compare-and-swap conflicts, and idempotent retries across lessons 18–23. Read these short
rollback-mode documents to turn the observed errors into a state-machine model of serialized writes,
serializable isolation, rollback locking, and retry boundaries before moving on to WAL; ignore the locking document’s old
1024-byte example and trust the runtime page size instead.
        `,
      },
      revision: 2,
      minVersion: "3.53.4",
    },
  ],
};
