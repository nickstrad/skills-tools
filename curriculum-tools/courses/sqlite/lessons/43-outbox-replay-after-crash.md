# Kill the sender after the receiver commits

slug: outbox-replay-after-crash
category: local-systems
difficulty: advanced
tags: outbox, crash-recovery, idempotency, deduplication
prerequisites: local-oplog
safety: dangerous
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 30
revision: 3

## Overview
Commit an effect in a receiver's database, then actually terminate the sender before its acknowledgement can commit. On restart the sender must repeat an operation whose outcome it cannot infer from its own file. The receiver's transaction couples the debit and receipt, so repeated transport does not repeat the local debit.

## Syntax breakdown
### In plain terms

The interesting failure occurs after success somewhere else. The receiver has accepted the debit,
but the sender still sees pending work. We use two files and separate CLI processes so there is no
accidental transaction joining those facts. A ready marker selects the failure point; SIGKILL ends
only the owned sender process. This is a same-host model of independent commit boundaries, not a
demonstration of a network partition or host-loss tolerance.

### What you are learning

- Receiver effect and receipt commit together. Recording a receipt before an unprotected effect
  would allow a crash to turn deduplication into lost work.
- An acknowledgement gap creates uncertainty at the sender even when the receiver is correct.
- Retries carry an immutable identity and payload; receiver-side validation is what makes replay safe.

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

- **mkfifo**, **exec 3<>**, **>&3**, and **$!** (process coordination): The FIFO feeds a live sender
  CLI. Descriptor 3 holds it open and $! captures that exact child's PID. The sender prints a marker
  after delivery; the parent waits for that evidence before killing it. A counter bounds readiness.
- **.shell sh ...**, **.print**, **kill -KILL**, **wait**, and **trap** (failure injection): The
  sender invokes the lab receiver script and reports completion, but receives no acknowledgement SQL
  before termination. wait collects its status. The trap reaps only the captured child if a check fails.
- **COALESCE(sum(...),0)** and **NOT EXISTS** (effect gate): Subtract amounts only for identities
  absent from receipts. A duplicate contributes zero. Inserting receipts and updating the balance
  share one transaction; the guard rejects a changed amount under an existing ID.
- **test** (shell assertion): Compare actual status, pending state, balance and receipt count.
  A printed success marker is reached only after every invariant passes.

## Caution
The script kills only its captured child and retains all files in a fresh evidence directory. Do not substitute a PID from another process. SIGKILL tests process recovery, not a power failure.

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
CREATE TABLE account(id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);
INSERT INTO account VALUES(1,100);
CREATE TABLE receipts(op_id TEXT PRIMARY KEY NOT NULL, amount INTEGER NOT NULL);
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

sender=$lab/sender.db
receiver=$lab/receiver.db
init_receiver "$receiver"
sqlite3 -bail "$sender" "CREATE TABLE outbox(op_id TEXT PRIMARY KEY,amount INTEGER,sent INTEGER); INSERT INTO outbox VALUES('a/g1:1',10,0);"
sqlite3 "$sender" "SELECT 'INSERT INTO incoming VALUES(' || quote(op_id) || ',' || amount || ');' FROM outbox WHERE sent=0;" >"$lab/batch.sql"
# Materialize exactly the delivery SQL the worker must run before acknowledging.
{
  echo 'CREATE TEMP TABLE incoming(op_id TEXT PRIMARY KEY,amount INTEGER);'
  cat "$lab/batch.sql"
  echo 'BEGIN IMMEDIATE;'
  echo 'UPDATE account SET balance=balance-(SELECT amount FROM incoming) WHERE NOT EXISTS(SELECT 1 FROM receipts r JOIN incoming i USING(op_id));'
  echo 'INSERT INTO receipts SELECT * FROM incoming;'
  echo 'COMMIT;'
} >"$lab/first-delivery.sql"
printf 'sqlite3 -bail "%s" < "%s"\n' "$receiver" "$lab/first-delivery.sql" >"$lab/receive.sh"
mkfifo "$lab/sender.commands"
exec 3<>"$lab/sender.commands"
sqlite3 -bail "$sender" <"$lab/sender.commands" >"$lab/sender.log" 2>&1 &
worker=$!
trap 'kill -KILL "$worker" 2>/dev/null || true; wait "$worker" 2>/dev/null || true' EXIT HUP INT TERM
printf '.shell sh "%s"\n.print RECEIVER_COMMITTED\n' "$lab/receive.sh" >&3
attempt=0
until grep -q RECEIVER_COMMITTED "$lab/sender.log"; do
  attempt=$((attempt+1)); test "$attempt" -lt 200; sleep 0.02
done
test "$(sqlite3 "$receiver" 'SELECT balance FROM account;')" = 90
kill -KILL "$worker"
set +e
wait "$worker"
killed_status=$?
set -e
trap - EXIT HUP INT TERM
exec 3>&-
test "$killed_status" -eq 137
test "$(sqlite3 "$sender" 'SELECT sent FROM outbox;')" = 0
echo "sender_killed=$killed_status receiver_balance=90 sender_pending=1"
deliver "$receiver" "$lab/batch.sql"
sqlite3 -bail "$sender" "UPDATE outbox SET sent=1 WHERE op_id='a/g1:1';"
test "$(sqlite3 "$receiver" 'SELECT balance FROM account;')" = 90
test "$(sqlite3 "$receiver" 'SELECT count(*) FROM receipts;')" = 1
test "$(sqlite3 "$sender" 'SELECT sent FROM outbox;')" = 1
echo 'replay_balance=90 receipts=1 sender_acknowledged=1'
```

## Expected result
The sender exits with SIGKILL status 137 after receiver_balance=90 while sender_pending=1. The retry prints new_receipts=0 (the CLI prints the value 0), and the checked final line is replay_balance=90 receipts=1 sender_acknowledged=1. Inspect sender.log and the two files in the printed evidence directory. A shell 'Killed' diagnostic is expected; other errors are not.

## Systems lens
A local transaction resolves facts inside one participant. A protocol resolves uncertainty between participants. Stable request identity lets the receiver answer the same request again without repeating a committed local effect; it does not make an email or external API call atomic with this database.

## Optional variation
Move the receipt insert into a later transaction and place the kill between the debit and receipt. Predict the balance after replay. Identify the corresponding failure window if the protected effect were an HTTP request instead of the account row.
