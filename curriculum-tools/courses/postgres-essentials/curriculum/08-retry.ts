import { code, type Module } from "../../../src/types.ts";

export const RETRY_VISUAL = `One request from Bob, two complete transaction attempts

Attempt 1: BEGIN -> read 2 -> decide leave -> UPDATE -> COMMIT fails: 40001
                       A also leaves and commits           |
                                                    discard attempt
                                                          |
Attempt 2: BEGIN -> read 1 -> decide stay  -> no UPDATE -> COMMIT succeeds

The request was reconsidered. Bob did not leave on the second attempt.`;

export const RETRY: Module = {
  category: "concurrency-control",
  title: "Retry a decision on fresh state",
  lessons: [{
    slug: "whole-transaction-retry",
    title: "Retry a known-aborted transaction from the beginning",
    difficulty: "intermediate",
    prerequisites: ["serializable-protects-invariant"],
    tags: ["isolation", "serializable", "retries", "transactions"],
    estimatedMinutes: 25,
    revision: 1,
    sessions: 1,
    safetyLevel: "ddl",
    runIn: "shell",
    overview:
      "Run a supplied client that handles the serialization failure from the last lesson. Its first attempt lets Bob leave an on-call rota, but COMMIT fails after Alice leaves. Watch a fresh attempt repeat the read and change the decision: Bob must stay so someone remains on call.",
    reading: 'PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Serializable")',
    readingNotes:
      "Optional after running: Chapter 2 explains serialization failures and the need to retry. The bounded Python client, attempt evidence and controlled scheduling are supplied course code; the book does not provide this client implementation.",
    caution:
      "Run the commands in a shell, not inside psql. The client uses the learner lab by default, creates a unique pe_retry_* schema and removes that exact schema before returning. It needs only Python 3 and psql, already installed here. Ctrl-C closes its connections and runs cleanup. Any STOP message or missing cleanup record needs investigation; a timeout or disconnected client is never automatically replayed.",
    syntaxBreakdown: code`
### In plain terms
A retry is a new attempt at the whole database transaction, including the logic that chose the
writes. SQLSTATE is PostgreSQL's five-character error identifier; 40001 reports a serialization
failure, which means this attempt did not commit. Before running, predict whether a successful
retry must still carry out Bob's original plan to leave.

The client applies the same rule as lessons 8–9: someone may leave only when more than one doctor
is on call. It supplies two database connections and the terminal switching for you. Read the
attempt records, rather than learning the Python process-control plumbing.

### What you are learning
- The retry boundary includes BEGIN, reading current state, deciding, writing if allowed, and
  COMMIT. Successful UPDATE output is provisional until COMMIT succeeds.
- A fresh snapshot can change the answer. Finishing Bob's request can mean a committed decision
  to stay, rather than a successful leave operation.
- Error classification and a finite attempt budget belong to the client. This demonstration
  retries only 40001, at most three attempts, with a short delay between attempts.
- Attempt records print outside the database transaction. They remain visible after its writes
  are rolled back, but a printed decision alone does not prove a committed change.

### Piece by piece
- **cd /root/Software/skills-tools/curriculum-tools** enters the installed course engine so the
  relative client path resolves. Keep using this same shell for the experiment.
- **python3 courses/postgres-essentials/lab/retry.py** runs the supplied application. It starts
  persistent psql connections with startup files disabled and bounded statement waits. The
  connection defaults are /tmp, port 5440, role postgres and database lab. Existing PGHOST,
  PGPORT, PGUSER and PGDATABASE environment values override those defaults for private validation.
- **BEGIN ISOLATION LEVEL SERIALIZABLE** starts each attempt. The client runs SELECT count(*)
  FROM on_call WHERE on_call, decides leave only for a count above one, and conditionally runs
  UPDATE on_call SET on_call=false WHERE doctor='Bob'. COMMIT is inside the error-handling
  boundary. This complete sequence is repeated, with no saved decision carried between attempts.
- **actor / attempt / read / decision** label the printed records. Actor A is Alice's competing
  transaction. Actor B is the request being retried. Both initially read two; after A commits,
  B's first COMMIT fails. The next read and decision belong to a new transaction.
- **phase / sqlstate / committed** describe the actual database response, captured immediately
  after the statement by psql. A 40001 triggers ROLLBACK and, if budget remains, another attempt.
  Other errors stop. The controlled schedule uses no race-prone sleep to decide when A commits;
  both reads and writes complete before A's COMMIT, then B tries COMMIT.
- **final_rows / on_call / completed** come from a separate connection after the attempts. This
  checks committed table state rather than trusting an earlier UPDATE message. The generated
  schema keeps this fixture separate from earlier lessons and concurrent runs.
- **cleanup: schema removed** confirms that the owned clients closed and the generated schema
  was dropped and checked absent. No scratch files or learner progress are created by the client.
- **--mode no-conflict**, in the optional variation, removes Alice's competing transaction.
  **--max-attempts 1** stops after the first known abort; status 2 means budget exhausted.
  The default limit is three, with 0.1 then 0.2 seconds between eligible attempts. A production
  policy also fits the caller's deadline and contention, often using randomized backoff.
`,
    setup: code`cd /root/Software/skills-tools/curriculum-tools`,
    code: code`python3 courses/postgres-essentials/lab/retry.py`,
    expectedResult: code`
Actor A reads 2 and decides leave. Actor B's attempt 1 also reports read = 2 and decision = leave.
A commits. B then reports phase = commit, sqlstate = 40001 and committed = false. Its tentative
change to Bob did not survive.

B's attempt 2 reports read = 1 and decision = stay, then sqlstate = 00000 and committed = true.
The independent final query reports final_rows = ["Alice|f", "Bob|t"], on_call = 1 and completed =
true. Thus the retry finished the request by preserving Bob on call. The script exits successfully
and prints cleanup = "schema removed". Generated schema names vary.

The supplied schedule puts the failure at B's COMMIT. Other schedules may fail at a write and may
choose a different victim. Both places belong inside the retry boundary.
`,
    systemsLens:
      "Retry repeats a decision against a new database state. Retrying only the failed UPDATE, or carrying the old 'leave' decision into a new transaction, omits the read that justified it. Serializable protects committed results when every relevant transaction follows the rule and uses the isolation protocol; it does not promise that every requested action becomes valid. The client may stop after a known abort and report failure without breaking the invariant. This fixture has only transactional database writes. An email or remote API call inside an attempt would not roll back with PostgreSQL. A lost response to COMMIT also leaves a different question: the caller may not know whether it committed. Lessons 11–12 handle that boundary; this loop does not replay unknown outcomes.",
    challenge:
      "Optional, after the core time budget: predict the attempt count and Bob's decision with no competing Alice transaction. In the same shell run:\n\n```sh\n" +
      "python3 courses/postgres-essentials/lab/retry.py --mode no-conflict\n```\n\n" +
      "Attempt 1 reads 2, decides leave and commits. Final rows are Alice|t and Bob|f, with one doctor on call. Each invocation creates and cleans its own fixture.\n\n" +
      "To inspect the limit separately, run:\n\n```sh\n" +
      "python3 courses/postgres-essentials/lab/retry.py --max-attempts 1\n```\n\n" +
      "It reports one 40001, budget exhausted, completed = false and exits with status 2. Bob remains on call and cleanup still runs. A finite budget can preserve safety while declining to finish a request.",
  }],
};
