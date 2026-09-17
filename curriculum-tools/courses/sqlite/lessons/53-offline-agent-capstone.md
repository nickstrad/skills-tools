# Recover an agent while preserving its local invariants

slug: offline-agent-capstone
category: capstone
difficulty: advanced
tags: architecture, outbox, fencing, backup, recovery
prerequisites: restore-and-rejoin-history, wal-growth-incident
safety: dangerous
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 45
revision: 3

## Overview
Compose the course's local boundaries into one agent: state and intent, receiver effect and receipt, ownership and fenced completion, backup and verified restore. Inject an uncommitted process death, lost acknowledgement, duplicate delivery, stale completion and damaged restore candidate. Each success line is guarded by an assertion against the actual database state.

## Syntax breakdown
### In plain terms

Each earlier experiment isolated one failure. Here several independent guarantees must hold at
once. The four invariants are: a committed debit has intent, a repeated delivery has one
receiver effect, an old worker cannot complete the new owner's job, and a restore contains both
valid pages and the expected domain state. The script tests each invariant separately.

### What you are learning

- Composition preserves guarantees only when the relevant facts share the correct transaction.
- A verified backup is a restore input; a damaged candidate must be rejected before it replaces state.
- These copies share one host. Their successful recovery does not establish resilience to losing
  that host, and an old restored participant still needs the rejoin policy from the previous module.

### Piece by piece

- **set -eu**, **printenv**, **case**, **dirname**, **test**, and **mktemp -d** (shell controls):
  Stop on unexpected failures/unset variables, require an absolute lab path, and allocate a unique
  evidence directory under its parent. The learner's main database is not reset. The printed path
  is where batch files and independent databases can be inspected after the run.
- **sqlite3 -bail**, **<<'SQL'**, **echo**, **cat**, and **|** (CLI and shell input):
  A quoted heredoc sends literal SQL. The brace group writes schema, batch, and transaction SQL into
  one connection through a pipe; -bail stops at an unexpected SQL error. Closing that connection
  rolls back an unfinished transaction. Each invocation owns its own connection and commit boundary.
- **Shell functions and $1/$2** (reusable commands):
  The first argument is the destination database and the second is a batch file. They make retries
  use exactly the same application procedure. The SQL batches contain fixed, trusted lab data;
  production transport needs validated data and bound parameters, not execution of received SQL.
- **BEGIN IMMEDIATE / COMMIT** (transaction boundaries):
  Reserve only the receiving file's writer, then commit its related facts together. Sender progress
  is a different commit. A shell command finishing is not an acknowledgement transaction.
- **TEMP tables and identity_guard CHECK(ok=1)** (connection-local staging and assertion):
  Load an incoming batch, compare immutable payloads, and reject identity reuse with a constraint
  error. The conflict is observable as a nonzero process status; do not acknowledge rejected data.
- **ON CONFLICT ... DO NOTHING**, **WHERE true**, and **changes()** (targeted replay handling):
  An existing identity skips insertion only after payload validation. WHERE true disambiguates
  INSERT SELECT's UPSERT syntax. changes() counts the immediately preceding modifying statement.

- **mkfifo / exec 3<> / $! / trap** (owned-process control): Keep one writer's input open, capture
  its PID and ensure it is reaped on error. A bounded DIRTY_READY poll chooses the uncommitted failure
  point; no delay is used as proof that a transaction started.
- **kill -KILL / wait / status 137** (process crash): End only that writer. Reopening must show
  neither its uncommitted row nor a damaged database. This is not a power-loss durability test.
- **user_version** (application format metadata): A restore must recover its schema generation as
  well as rows. This test expects generation 1, whose schema the reader understands.
- **token predicate / changes()** (fenced completion): An obsolete owner changes zero rows, while
  the current generation can complete the resource. This only protects the effect stored in SQLite.
- **.backup / cp / dd bs=1 seek=100 count=8 conv=notrunc** (snapshot and deliberate damage): Create
  an engine snapshot, copy it, then zero eight bytes at the first B-tree page header in only that
  candidate. conv=notrunc preserves the rest of the copy so the experiment tests corruption detection.
- **grep / test / integrity_check / domain queries** (acceptance gates): A nonzero damaged check
  must include a malformed-image error. The intact restore must pass structural, balance, intent,
  job-result and schema checks. The summary is printed only after all gates succeed.

## Caution
The script creates a unique directory, kills only its child and damages only a copy. Keep the intact backup and diagnostic files through inspection of the structural and domain checks.

## Run
```sh
set -eu
lab_db=$(printenv TUTOR_SQLITE_DB)
case "$lab_db" in /*.db) ;; *) echo 'Set TUTOR_SQLITE_DB to an absolute disposable .db path' >&2; exit 2;; esac
lab_parent=$(dirname -- "$lab_db")
test "$lab_parent" != /
test -d "$lab_parent"
case "$lab_parent" in *"'"*|*'"'*) echo 'Use a lab path without quote characters for this SQL/shell transport' >&2; exit 2;; esac
lab=$(mktemp -d "$lab_parent/offline.XXXXXX")
echo "evidence_directory=$lab"

# These functions invoke separate sqlite3 processes. No transaction spans both files.
init_receiver() {
  sqlite3 -bail "$1" <<'SQL'
CREATE TABLE account (id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);

INSERT INTO
  account
VALUES
  (1, 100);

CREATE TABLE receipts (op_id TEXT PRIMARY KEY NOT NULL, amount INTEGER NOT NULL);
SQL
}
deliver() {
  # $2 is a trusted SQL batch generated in this lab, not untrusted network input.
  { echo 'CREATE TEMP TABLE incoming(op_id TEXT PRIMARY KEY, amount INTEGER NOT NULL);';
    cat "$2";
    echo 'BEGIN IMMEDIATE;';
    echo 'CREATE TEMP TABLE identity_guard(ok INTEGER CHECK(ok=1));';
    echo 'INSERT INTO identity_guard SELECT NOT EXISTS(SELECT 1 FROM incoming i JOIN receipts r USING(op_id) WHERE i.amount<>r.amount);';
    echo 'UPDATE account SET balance=balance-COALESCE((SELECT sum(i.amount) FROM incoming i WHERE NOT EXISTS(SELECT 1 FROM receipts r WHERE r.op_id=i.op_id)),0) WHERE id=1;';
    echo 'INSERT INTO receipts SELECT * FROM incoming WHERE true ON CONFLICT(op_id) DO NOTHING;';
    echo 'SELECT changes() AS new_receipts;';
    echo 'COMMIT;';
  } | sqlite3 -bail "$1"
}

sender=$lab/agent.db
receiver=$lab/receiver.db
init_receiver "$receiver"
sqlite3 -bail "$sender" <<'SQL'
PRAGMA journal_mode = WAL;

PRAGMA synchronous = FULL;

PRAGMA user_version = 1;

CREATE TABLE account (id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);

CREATE TABLE outbox (
  op_id TEXT PRIMARY KEY NOT NULL,
  amount INTEGER NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE jobs (id INTEGER PRIMARY KEY, owner TEXT, token INTEGER, result TEXT);

INSERT INTO
  account
VALUES
  (1, 100);

INSERT INTO
  jobs
VALUES
  (1, 'a', 1, NULL);

BEGIN IMMEDIATE;

UPDATE account
SET
  balance = balance -10;

INSERT INTO
  outbox (op_id, amount)
VALUES
  ('a/g1:1', 10);

COMMIT;
SQL
mkfifo "$lab/writer.fifo"
exec 3<>"$lab/writer.fifo"
sqlite3 -bail "$sender" <"$lab/writer.fifo" >"$lab/writer.log" 2>&1 &
writer=$!
trap 'kill -KILL "$writer" 2>/dev/null || true; wait "$writer" 2>/dev/null || true' EXIT HUP INT TERM
printf '%s\n' 'BEGIN IMMEDIATE; INSERT INTO account VALUES(2,50);' '.print DIRTY_READY' >&3
n=0
until grep -q DIRTY_READY "$lab/writer.log"; do n=$((n+1)); test "$n" -lt 200; sleep 0.02; done
kill -KILL "$writer"
set +e
wait "$writer"
crash_status=$?
set -e
trap - EXIT HUP INT TERM
exec 3>&-
test "$crash_status" = 137
test "$(sqlite3 "$sender" 'SELECT count(*) FROM account;')" = 1
test "$(sqlite3 "$sender" 'PRAGMA integrity_check;')" = ok
echo 'crash_recovery=ok uncommitted_rows=0'
sqlite3 "$sender" "SELECT 'INSERT INTO incoming VALUES(' || quote(op_id) || ',' || amount || ');' FROM outbox WHERE sent=0;" >"$lab/batch.sql"
deliver "$receiver" "$lab/batch.sql"
test "$(sqlite3 "$sender" 'SELECT sent FROM outbox;')" = 0
deliver "$receiver" "$lab/batch.sql"
sqlite3 -bail "$sender" 'UPDATE outbox SET sent=1;'
test "$(sqlite3 "$receiver" 'SELECT balance FROM account;')" = 90
test "$(sqlite3 "$receiver" 'SELECT count(*) FROM receipts;')" = 1
echo 'duplicate_delivery=one_effect balance=90 receipts=1'
sqlite3 -bail "$sender" "UPDATE jobs SET owner='b',token=2 WHERE id=1;"
stale=$(sqlite3 -bail "$sender" "UPDATE jobs SET result='late-a' WHERE id=1 AND owner='a' AND token=1; SELECT changes();")
test "$stale" = 0
sqlite3 -bail "$sender" "UPDATE jobs SET result='current-b' WHERE id=1 AND owner='b' AND token=2;"
sqlite3 "$sender" ".backup '$lab/verified.db'"
test "$(sqlite3 "$lab/verified.db" 'PRAGMA integrity_check;')" = ok
cp "$lab/verified.db" "$lab/damaged.db"
dd if=/dev/zero of="$lab/damaged.db" bs=1 seek=100 count=8 conv=notrunc status=none
if sqlite3 -bail "$lab/damaged.db" 'PRAGMA integrity_check;' >"$lab/damaged.log" 2>&1; then
  echo 'unexpected: damaged candidate accepted' >&2; exit 1
else
  grep -q 'malformed' "$lab/damaged.log"
fi
sqlite3 "$lab/verified.db" ".backup '$lab/restored.db'"
test "$(sqlite3 "$lab/restored.db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$lab/restored.db" 'PRAGMA user_version;')" = 1
test "$(sqlite3 "$lab/restored.db" 'SELECT balance FROM account;')" = 90
test "$(sqlite3 "$lab/restored.db" 'SELECT count(*) FROM outbox WHERE sent=1;')" = 1
test "$(sqlite3 "$lab/restored.db" 'SELECT result FROM jobs;')" = current-b
echo 'stale_completion=0 damaged_candidate=rejected restore_integrity=ok restore_invariants=ok'
```

## Expected result
The owned writer exits 137; crash_recovery=ok and uncommitted_rows=0 are asserted. Deliveries report 1 then 0 new receipts, receiver balance is 90 and receipts=1. Stale completion changes zero rows. The damaged candidate is rejected with a malformed-image error, while the verified restore passes integrity, user_version=1, balance=90, one acknowledged intent and current-b job result. A 'Killed' shell diagnostic is expected.

## Systems lens
Reliable composition follows the boundaries of authority: each participant commits the facts it owns, replay crosses between participants, and recovery verifies both storage and meaning. A list of features is not a guarantee until failure experiments show their invariants survive together.

## Optional variation
On a fresh run, immediately after the first delivery and the sender sent=0 check, capture `sqlite3 "$sender" ".backup '$lab/preack.db'"`, then finish Run. Restore that earlier snapshot into a separate file with `sqlite3 "$lab/preack.db" ".backup '$lab/preack-restored.db'"`. Its outbox still has sent=0, while the current receiver already has the receipt. Replay the original batch with `deliver "$receiver" "$lab/batch.sql"`: new_receipts is 0, receiver balance stays 90 and receipts stay 1. Record the acknowledgement in this restored file with `sqlite3 -bail "$lab/preack-restored.db" 'UPDATE outbox SET sent=1;'` and verify its sent value.

This earlier snapshot also predates the job takeover, so it is not equivalent to the core's final restored job state. A backup from before sequence allocation additionally rewinds identity knowledge; use the generation/rejoin procedure to reconcile retained history before allowing new operations. Safe replay of an existing identity does not authorize reusing it for new intent.
