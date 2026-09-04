import { code, type Module } from "../../../src/types.ts";

export const CONCURRENCY: Module = {
  category: "concurrency",
  title: "Concurrency, isolation, and safe retries",
  lessons: [
    {
      slug: "transaction-errors-have-scope",
      title: "Observe the scope of transaction errors",
      difficulty: "intermediate",
      tags: ["error-scope", "transactions", "savepoints", "constraints"],
      prerequisites: ["batching-changes-the-cost"],
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 15,
      overview:
        "Put a UNIQUE violation between successful statements and observe which surrounding writes survive. Then change the rollback boundary with explicit ROLLBACK, OR ROLLBACK and SAVEPOINT. This is a critical PostgreSQL contrast: the same instinct to 'catch an error and continue' has different transaction consequences in SQLite.",
      syntaxBreakdown: code`### In plain terms

Not every SQL error destroys the whole transaction. SQLite's default ABORT policy cancels the failing statement and leaves earlier work available; an explicit ROLLBACK or the OR ROLLBACK conflict policy abandons the surrounding transaction; a SAVEPOINT creates a smaller rollback boundary. This lesson runs each case against one ledger and counts the rows after each commit.

### What you are learning

- **Statement-scope ABORT** leaves a transaction usable after a constraint error.
- **Transaction-scope rollback** removes all pending writes, whether requested explicitly or by OR ROLLBACK.
- **Savepoints** provide nested application recovery without discarding the outer transaction.
- **PostgreSQL contrast**: a PostgreSQL error marks the whole transaction failed until ROLLBACK, whereas SQLite's default constraint error does not.

### Piece by piece

- **PRAGMA journal_mode=DELETE** (persistent setting): keeps this one-file error experiment in rollback mode.
- **UNIQUE(id)** (table constraint): creates the deterministic duplicate-key error.
- **BEGIN / COMMIT** (transaction statements): delimit the work whose surviving rows are counted.
- **INSERT** (default ABORT statement): the duplicate fails, but the transaction can execute the next insert and commit.
- **ROLLBACK** (explicit transaction end): discards all pending rows after the intentional error.
- **INSERT OR ROLLBACK** (conflict policy): changes the duplicate's scope so SQLite automatically rolls back the entire transaction.
- **SAVEPOINT unit** (nested transaction marker): names a partial rollback boundary.
- **ROLLBACK TO unit** (savepoint recovery): discards writes after the marker while retaining the outer transaction.
- **RELEASE unit** (savepoint end): removes the marker; the outer COMMIT remains responsible for durability.
- **count(*) and group_concat** (aggregates): expose committed row counts and identities after each case.
- **.bail off** (CLI dot command): lets expected duplicate errors flow to the following evidence queries.
`,
      setup: code`.bail off
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS ledger;
CREATE TABLE ledger(id INTEGER PRIMARY KEY, note TEXT NOT NULL);`,
      code: code`-- Default ABORT: only the duplicate statement is cancelled
BEGIN;
INSERT INTO ledger VALUES (1, 'abort first');
INSERT INTO ledger VALUES (1, 'abort duplicate');
INSERT INTO ledger VALUES (2, 'abort continues');
COMMIT;
SELECT 'after ABORT' AS case_name, count(*) AS committed_rows, group_concat(id) AS ids FROM ledger;

-- Explicit ROLLBACK: the caller abandons the whole transaction
BEGIN;
INSERT INTO ledger VALUES (3, 'explicit pending');
INSERT INTO ledger VALUES (1, 'explicit duplicate');
ROLLBACK;
SELECT 'after explicit ROLLBACK' AS case_name, count(*) AS committed_rows, group_concat(id) AS ids FROM ledger;

-- OR ROLLBACK: the duplicate automatically aborts its transaction
BEGIN;
INSERT INTO ledger VALUES (3, 'automatic pending');
INSERT OR ROLLBACK INTO ledger VALUES (1, 'automatic duplicate');
SELECT 'after OR ROLLBACK' AS case_name, count(*) AS committed_rows, group_concat(id) AS ids FROM ledger;

-- SAVEPOINT: recover only the failed subunit, then commit the outer work
BEGIN;
INSERT INTO ledger VALUES (3, 'savepoint before');
SAVEPOINT unit;
INSERT INTO ledger VALUES (5, 'savepoint pending work');
INSERT INTO ledger VALUES (1, 'savepoint duplicate');
ROLLBACK TO unit;
INSERT INTO ledger VALUES (4, 'savepoint after');
RELEASE unit;
COMMIT;
SELECT 'after SAVEPOINT' AS case_name, count(*) AS committed_rows, group_concat(id) AS ids FROM ledger;`,
      expectedResult:
        code`The duplicate under default ABORT prints a UNIQUE constraint error but the following insert commits: after ABORT has committed_rows = 2 and ids 1,2. Explicit ROLLBACK leaves the same 2 rows. OR ROLLBACK also leaves 2 rows and the following SELECT runs in autocommit. The SAVEPOINT case commits ids 1,2,3,4 with committed_rows = 4; its duplicate is rolled back only to unit.`,
      systemsLens:
        "A transaction API is also an error-state machine. PostgreSQL generally leaves an explicit transaction failed after an error until recovery; SQLite's default constraint ABORT undoes the statement but leaves the transaction usable. Other errors can have wider scope, so an application must inspect its driver's transaction state and classify the failure before deciding what to repeat.",
      challenge:
        code`Replace the default duplicate with INSERT OR FAIL and predict whether the next insert and COMMIT survive. Then repeat the SAVEPOINT case with RELEASE omitted: what outer state remains and why?`,
      caution:
        code`Each duplicate error is expected and intentionally followed by a scope-specific recovery. Do not generalize from the error text alone; the post-case committed row count is the authoritative evidence.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "deferred-write-race",
      title: "Deferred transactions discover contention at the write",
      difficulty: "intermediate",
      tags: ["transactions", "locking", "busy", "isolation"],
      prerequisites: ["transaction-errors-have-scope"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        "Let both sessions read before either reserves the writer, then make them compete to upgrade. B is refused promptly despite a two-second timeout because its retained read lock can block A's eventual commit. Distinguish this lock-cycle refusal from an ordinary wait-budget expiry.",
      syntaxBreakdown: code`### In plain terms

Two DEFERRED transactions may both read before either reserves SQLite's single writer slot. The second connection then tries to upgrade its existing read transaction and receives SQLITE_BUSY immediately: waiting would deadlock the writer ahead of it. The experiment measures that boundary and shows that releasing the conflicting writer lets the still-open reader retry; an application may instead restart to obtain a fresh snapshot.

### What you are learning

- **DEFERRED admission** delays writer reservation until the first write.
- **Busy-handler bypass** is different from a timeout expiring; an impossible lock upgrade fails immediately.
- **Retry choice** depends on semantics: this controlled run retries the still-open snapshot after the holder rolls back, while applications that need fresh data should end and restart the transaction.

### Piece by piece

- **BEGIN DEFERRED** (transaction start): opens a transaction without taking RESERVED; both sessions can read first.
- **.timeout 2000** (CLI setting): installs a 2000 ms busy wait for lock conflicts; it cannot help an impossible upgrade.
- **.timer on/off** (CLI display setting): prints elapsed time around B's UPDATE; near-zero time is the key evidence.
- **UPDATE value=value+1** (data change): asks each reader to become the writer; A succeeds, B conflicts.
- **changes()** (SQLite scalar function): reports rows changed by A's successful UPDATE.
- **ROLLBACK** (transaction end): releases A's writer state, allowing B's still-open read transaction to retry its upgrade.
- **SELECT from counter** (read): B's value remains its original snapshot while its failed transaction is still open.
`,
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
        "Both readers initially see 0 and A changes one row. B's UPDATE reports database is locked promptly, far short of its two-second budget; a validated run took under 0.001 s. B still reads 0. A then rolls back, allowing B's still-open transaction to retry the update and commit value 1. Exact timing is not an invariant.",
      systemsLens:
        "There are two valid lessons here, not one universal retry recipe. In this controlled schedule A abandons its write, so B's retained read transaction can upgrade afterward. In a general read/decide/write retry, ending the losing transaction and rereading is often the appropriate policy; endlessly retrying while retaining the read lock can prevent the other writer from making progress.",
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
        "Move writer admission to the start of the transaction, before any application decision or mutation. B times out at BEGIN IMMEDIATE even though it could intend to change a different table. Writer admission belongs to the database file, not the set of row keys the application plans to touch.",
      syntaxBreakdown: code`### In plain terms

BEGIN IMMEDIATE makes writer admission the first operation instead of discovering it after reads and application work. Hold that reservation in A, then let B time out at its BEGIN. Once A commits, B retries the same admission step and succeeds.

### What you are learning

- **Explicit admission** makes contention observable at a clean boundary.
- **Database-wide writer reservation** applies even when later writes would target different rows or tables.
- **Timeout budget** bounds how long a caller waits before deciding to retry or fail.

### Piece by piece

- **PRAGMA journal_mode=DELETE** (persistent setting): selects rollback locking for this experiment.
- **BEGIN IMMEDIATE** (transaction start): obtains RESERVED before A's insert and makes B's first BEGIN contend.
- **.timeout 250** (CLI busy-handler setting): gives B a 250 ms wait budget.
- **.timer on/off** (CLI measurement): records how long B waited at admission.
- **INSERT** (data change): runs only after the connection owns the writer reservation.
- **COMMIT** (transaction end): releases A's reservation and publishes its row; B's new BEGIN can then proceed.
- **count(*)** (aggregate): B's committed_rows query confirms the failed admission left it in autocommit with only baseline visible.
`,
      setup: code`.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS other_events;
CREATE TABLE events(id INTEGER PRIMARY KEY, note TEXT);
CREATE TABLE other_events(id INTEGER PRIMARY KEY, note TEXT);
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
INSERT INTO other_events(note) VALUES ('a different table still required admission');
COMMIT;
SELECT id, note FROM events ORDER BY id;`,
      expectedResult:
        code`B's timed first BEGIN IMMEDIATE returns database is locked after roughly the configured 250 ms (the timer reports the measured wait), while A remains the only writer; B is left in autocommit and reads committed_rows = 1. After A commits, B can begin and commit; final rows are baseline, A owns writer, and B after admission.`,
      systemsLens:
        "This is the main contrast with PostgreSQL row-level writer concurrency: independent logical records in one SQLite file still share a writer-admission point. BEGIN IMMEDIATE makes that boundary explicit, which is useful for short read/decide/write transactions but costly if remote calls or lengthy work happen while it is held.",
      challenge:
        code`Set B's timeout to 0 and then to 1000. What latency budget and user-visible failure does each policy create?`,
      caution:
        code`B's first BEGIN is intentionally a bounded 250 ms failure, not a release-dependent blocking step. A commits only after that failure; do not run both transactions in one sqlite3 process.`,
      revision: 3,
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
        "Allow B to prepare a write while A holds a rollback-mode read, then deliberately let B's COMMIT exhaust a short wait budget. Query B's pending state before releasing A and retrying COMMIT itself. A busy commit is not evidence that the write transaction was rolled back.",
      syntaxBreakdown: code`### In plain terms

Writer admission is not the last lock transition in rollback mode. B can reserve the writer and prepare its row while A reads, but publishing the change requires stronger access. We intentionally keep A open long enough to make COMMIT fail, then show exactly what remains retryable.

### What you are learning

- **Admission versus publication:** Reserved writer access is weaker than the exclusive access needed for this commit.
- **Busy COMMIT scope:** The transaction remains active; its prepared data is still visible to B.
- **Correct retry boundary:** Retry COMMIT after the reader releases, not the INSERT that already succeeded.

### Piece by piece

- **PRAGMA journal_mode=DELETE** selects the rollback protocol. Confirm delete before continuing.
- **A's BEGIN and SELECT** obtain and retain a SHARED read lock and see the single baseline row.
- **B's BEGIN IMMEDIATE** obtains the writer reservation. Its INSERT adds a pending second row without publishing it.
- **.timeout 150 and .timer on/off** make B's first COMMIT a deliberate approximately 150 ms busy failure, not a step that needs an immediate terminal switch.
- **SELECT 'B pending after busy COMMIT'** must report 2 in B's still-open transaction. That query proves why repeating INSERT would be wrong.
- **A's COMMIT** releases its read lock. B then repeats **COMMIT**, which publishes the already-prepared row.
- **The final count** is 2. In the WAL variation, the reader no longer blocks this writer commit in the same way, though another writer still competes for admission.`,
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
.timeout 150
BEGIN IMMEDIATE;
INSERT INTO messages(body) VALUES ('after');
.timer on
COMMIT;
.timer off
SELECT 'B pending after busy COMMIT', count(*) FROM messages;

-- Session A
COMMIT;

-- Session B
COMMIT;
SELECT 'B committed', count(*) FROM messages;`,
      expectedResult:
        "A initially sees 1. B inserts a pending row, then its first COMMIT reports database is locked after roughly 150 ms. B's following query still sees 2 inside the active write transaction. After A commits its read transaction, B retries COMMIT successfully and B committed reports 2.",
      systemsLens:
        "Timeout describes an operation's outcome, not necessarily the surrounding transaction's outcome. Distinguish 'not admitted', 'prepared but not yet committed', and 'committed but acknowledgment lost'. Those states lead to different retry rules in SQLite and in distributed request protocols.",
      challenge:
        code`Switch both sessions to WAL and repeat. Which step stops blocking, and which single-writer constraint remains?`,
      caution:
        "The first B COMMIT is supposed to fail after its short budget; do not release A until that evidence is collected. The successful INSERT is still pending, so retry only COMMIT after A releases or explicitly roll back the transaction.",
      revision: 3,
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
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        "Use two explicit connections to compare a lock released within B's wait budget with a lock deliberately retained beyond it. This makes ownership and timing order visible instead of guessing that a background process started. B's failed autocommit UPDATE is retried only after A has committed.",
      syntaxBreakdown: code`### In plain terms

A timeout limits willingness to wait, not how much write capacity exists. In the first round A is known to own the writer before B starts, then releases it while B waits. In the second round A keeps ownership until B's shorter budget has expired.

### What you are learning

- **Bounded admission:** Waiting can succeed or fail depending on release order.
- **Deterministic coordination:** Session boundaries establish the lock owner; a sleep only supplies a visible delay.
- **Attempt accounting:** A busy autocommit statement changes no committed row and can be a new attempt after release.

### Piece by piece

- **journal_mode=DELETE** fixes the lock mechanism. A's **BEGIN IMMEDIATE and UPDATE** reserve the writer and prepare value 1 before B starts.
- **B's .timeout 2000** permits up to two seconds of waiting. The labeled **blocks** step must be run while A remains open; switch to A promptly.
- **A's .shell sleep 0.1** delays release by 100 ms, then **COMMIT** makes B's waiting UPDATE eligible to write value 2. The delay is not the readiness signal; A's earlier completed transaction start established readiness.
- **.timer on/off** reports B's actual elapsed statement time. **changes()** immediately after its successful UPDATE must be 1.
- In round two A prepares value 3, while B's **.timeout 150** makes its attempt to write 4 fail after roughly 150 ms. The following read sees the previously committed value 2.
- A then commits; B repeats the single autocommit **UPDATE** and observes changed=1, done=4. No external side effect or multi-statement decision is being retried here.`,
      setup: code`.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS work;
CREATE TABLE work(id INTEGER PRIMARY KEY, done INTEGER NOT NULL);
INSERT INTO work VALUES (1, 0);`,
      code: code`-- Session A
BEGIN IMMEDIATE;
UPDATE work SET done=1 WHERE id=1;

-- Session B (blocks until A commits; switch to A within 2 seconds)
.timeout 2000
.timer on
UPDATE work SET done=2 WHERE id=1;

-- Session A
.shell sleep 0.1
COMMIT;

-- Session B
.timer off
SELECT 'within budget', changes() AS changed, done FROM work;

-- Session A
BEGIN IMMEDIATE;
UPDATE work SET done=3 WHERE id=1;

-- Session B
.timeout 150
.timer on
UPDATE work SET done=4 WHERE id=1;
.timer off
SELECT 'over budget, still committed value', done FROM work;

-- Session A
COMMIT;

-- Session B
UPDATE work SET done=4 WHERE id=1;
SELECT 'retry after release', changes() AS changed, done FROM work;`,
      expectedResult:
        "Round one waits for A's explicit release, then prints within budget with changed=1 and done=2; the automated run typically waits around 0.1–0.2 s, while human terminal switching adds delay. Round two reports database is locked after approximately 150 ms and still reads committed value 2. After A commits, B's retry prints changed=1 and done=4.",
      systemsLens:
        "A busy budget turns a serialization point into bounded backpressure, but longer waits do not increase SQLite's writer capacity. An application also needs an end-to-end deadline, bounded retry count and a clear failure response. Measure waits and rejected attempts separately from successful execution.",
      challenge:
        "Raise the second-round budget to 500 ms but still release A only after B returns. Predict the outcome and elapsed time. Then repeat round one with a larger budget and a longer bounded A delay; identify the caller's total latency cost.",
      caution:
        "For round one, B is intentionally waiting: switch to A and commit before two seconds elapse. If human delay exhausts that budget, record the busy outcome, release A, and explicitly retry B. Round two is intentionally not released until its timeout is observed.",
      revision: 3,
      minVersion: "3.53.4",
    },
    {
      slug: "idempotent-retry-ledger",
      title: "Deduplicate retries within SQLite's one-file commit boundary",
      difficulty: "intermediate",
      tags: ["idempotency", "retries", "atomicity", "deduplication", "transactions"],
      prerequisites: ["busy-timeout-bounds-wait"],
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 15,
      overview:
        "Apply an operation and its durable receipt in one local transaction, then replay it without changing the balance again. Also reuse the same identity with a different amount and require rejection. The extra SQLite-specific skills are targeted conflict handling, changes() adjacency and explicit transaction error scope.",
      syntaxBreakdown: code`### In plain terms

A deduplication key must mean one immutable operation, not 'ignore anything with this label'. The first op-42 adds 10 and records that amount; the replay is a no-op; op-42 with amount 99 is an identity conflict. All three decisions happen within one file's writer transaction.

### What you are learning

- **Atomic effect and receipt:** Neither may commit without the other.
- **Payload identity:** A repeated key is only a valid replay if its meaning agrees.
- **Targeted conflict handling:** Suppress only the intended duplicate-key case, not every constraint error.
- **Connection-local observation:** changes() belongs to the last data-changing statement on this connection.

### Piece by piece

- **operation_id TEXT PRIMARY KEY NOT NULL** supplies a non-null durable identity. **delta INTEGER NOT NULL** records the meaning associated with it; a timestamp alone would not detect changed-amount reuse.
- **CREATE TEMP TABLE identity_guard(ok CHECK(ok=1))** provides a compact assertion mechanism for this SQL-only lab. TEMP belongs to this connection, not the durable receipt state.
- **BEGIN IMMEDIATE** admits one writer before reading the existing receipt and choosing an effect.
- **INSERT OR ROLLBACK ... SELECT 0** writes an invalid guard value only when an existing op-42 has a different delta. CHECK rejects it, and OR ROLLBACK abandons the transaction. In production a driver can branch explicitly and roll back instead of using this assertion table.
- **INSERT ... ON CONFLICT(operation_id) DO NOTHING** inserts a new receipt or suppresses only that identity conflict. Unlike broad OR IGNORE, unrelated NOT NULL or CHECK violations remain errors.
- **changes()** after the receipt insert reports 1 for the first claim and 0 for the replay. An intervening SELECT does not replace that value, but another INSERT/UPDATE/DELETE would.
- **UPDATE ... AND changes()=1** uses that adjacent claim result to gate the account change. The fixture has exactly one target account; a general implementation must also validate that the intended effect exists and succeeded.
- **COMMIT** publishes receipt and effect together. The first and replay checks both show balance 110, and the ledger has one row.
- The final attempt's **delta<>99 guard** deliberately raises CHECK constraint failed and rolls back. Its subsequent read must still show 110 and one receipt; no second effect statement is run after that rejection.`,
      setup: code`DROP TABLE IF EXISTS applied_operations;
DROP TABLE IF EXISTS account;
CREATE TABLE account(id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);
CREATE TABLE applied_operations(operation_id TEXT PRIMARY KEY NOT NULL, delta INTEGER NOT NULL);
DROP TABLE IF EXISTS temp.identity_guard;
CREATE TEMP TABLE identity_guard(ok INTEGER CHECK(ok=1));
INSERT INTO account VALUES (1, 100);`,
      code: code`-- Session A
BEGIN IMMEDIATE;
INSERT OR ROLLBACK INTO identity_guard
SELECT 0 FROM applied_operations WHERE operation_id='op-42' AND delta<>10;
INSERT INTO applied_operations VALUES ('op-42', 10) ON CONFLICT(operation_id) DO NOTHING;
SELECT 'claim 1', changes();
UPDATE account SET balance=balance+10 WHERE id=1 AND changes()=1;
COMMIT;
SELECT 'after first', balance FROM account;

BEGIN IMMEDIATE;
INSERT OR ROLLBACK INTO identity_guard
SELECT 0 FROM applied_operations WHERE operation_id='op-42' AND delta<>10;
INSERT INTO applied_operations VALUES ('op-42', 10) ON CONFLICT(operation_id) DO NOTHING;
SELECT 'claim 2', changes();
UPDATE account SET balance=balance+10 WHERE id=1 AND changes()=1;
COMMIT;
SELECT 'after replay', balance, (SELECT count(*) FROM applied_operations) FROM account;

BEGIN IMMEDIATE;
INSERT OR ROLLBACK INTO identity_guard
SELECT 0 FROM applied_operations WHERE operation_id='op-42' AND delta<>99;
SELECT 'different payload rejected', balance, (SELECT count(*) FROM applied_operations) FROM account;`,
      expectedResult:
        "The first claim reports 1 and balance 110. The replay reports claim 0 and balance 110 with one receipt. Reusing op-42 with amount 99 produces the expected CHECK constraint failed: ok=1; different payload rejected still reports balance 110 and one receipt.",
      systemsLens:
        "PostgreSQL can teach idempotency deeply once; SQLite adds the embedded one-file boundary and its particular conflict/error semantics. This ledger covers only local database effects. Lost acknowledgments across a second database, an email provider or another service need a protocol at that other system's commit boundary, developed in module 08.",
      challenge:
        code`Change the first COMMIT to ROLLBACK after the account UPDATE, then run the second attempt. Predict claim 2 and the final balance: the local claim and account change should both disappear, allowing the retry to claim op-42 and apply the effect. Now imagine an email or payment call happened between the UPDATE and ROLLBACK. Which local rows disappear, and what effect can SQLite not undo?`,
      caution:
        "Keep the payload guard, receipt and domain effect in the same transaction. Do not insert a new data-changing statement between the receipt INSERT and its changes()-gated UPDATE. A duplicate key with changed meaning is an error, not successful deduplication.",
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
transaction-error scopes, and idempotent retries across lessons 20–25. Read these short
rollback-mode documents to turn the observed errors into a state-machine model of serialized writes,
serializable isolation, rollback locking, and retry boundaries before moving on to WAL; ignore the locking document’s old
1024-byte example and trust the runtime page size instead.
        `,
      },
      revision: 3,
      minVersion: "3.53.4",
    },
  ],
};
