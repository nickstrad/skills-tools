# Reject identity reuse while retrying an independent receiver

slug: duplicate-and-lost-ack
category: local-systems
difficulty: advanced
tags: deduplication, idempotency, outbox, consistency
prerequisites: outbox-replay-after-crash
safety: writes-data
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 25
revision: 3

## Overview
Replay a batch whose acknowledgement was lost, then submit a different debit under its existing identity. The receiver must distinguish a duplicate from conflicting intent. Its receipt is the durable accepted set; the sender's acknowledgement is updated only after the receiving transaction succeeds.

## Syntax breakdown
### In plain terms

A unique key alone cannot tell whether a repeated request means the same thing. The receiver below
stores the original amount beside the identity and checks it before changing state. There is no
global transaction and no ATTACH: one connection accepts a batch, and another later records that
acknowledgement. With no ordering-dependent operations in this debit example, the receipt set is
sufficient receive progress; the next lesson introduces contiguous cursors where order matters.

### What you are learning

- Retryable delivery needs identity, immutable content and a receiver-side atomic boundary.
- A lost acknowledgement leaves pending work that is safe to resend; conflicting content is a
  protocol error that must remain visible to the sender.
- An expected rejection must have the expected error and unchanged state. Any nonzero exit is not
  automatically proof that your validation rule worked.

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

- **quote(op_id)** (SQLite function): Generate literal SQL for the small trusted fixture without
  breaking an identity containing a quote. This laboratory transport is not a production RPC format.
- **COALESCE(sum(...),0)** (new-effect calculation): Sum only identities missing from receipts.
  A fully duplicate batch has no new rows, so its amount is zero instead of NULL.
- **if deliver ...; then ...; else ...; fi**, **grep -q**, and **test** (rejection checks): Capture
  the exact CHECK error, verify nonzero status, then reopen and compare the balance and receipt count.
  The sender acknowledgement is deliberately absent on the rejection path.

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
sqlite3 -bail "$sender" "CREATE TABLE pending(op_id TEXT PRIMARY KEY,amount INTEGER,acked INTEGER); INSERT INTO pending VALUES('a/g1:1',10,0),('a/g1:2',5,0);"
sqlite3 "$sender" "SELECT 'INSERT INTO incoming VALUES(' || quote(op_id) || ',' || amount || ');' FROM pending ORDER BY op_id;" >"$lab/batch.sql"
deliver "$receiver" "$lab/batch.sql"
test "$(sqlite3 "$sender" 'SELECT sum(acked) FROM pending;')" = 0
echo 'ack_lost sender_acked=0'
deliver "$receiver" "$lab/batch.sql"
sqlite3 -bail "$sender" 'UPDATE pending SET acked=1;'
echo "INSERT INTO incoming VALUES('a/g1:1',99);" >"$lab/conflict.sql"
if deliver "$receiver" "$lab/conflict.sql" >"$lab/rejected.log" 2>&1; then
  echo 'unexpected: conflicting identity accepted' >&2; exit 1
else
  grep -q 'CHECK constraint failed' "$lab/rejected.log"
  echo 'identity_conflict_rejected=1'
fi
test "$(sqlite3 "$receiver" 'SELECT balance FROM account;')" = 85
test "$(sqlite3 "$receiver" 'SELECT count(*) FROM receipts;')" = 2
test "$(sqlite3 "$sender" 'SELECT sum(acked) FROM pending;')" = 2
echo 'receiver_balance=85 receipts=2 sender_acked=2'
```

## Expected result
The first delivery prints 2 new receipts, and the duplicate prints 0 while the sender initially has zero acknowledged rows. A changed amount under a/g1:1 produces the checked CHECK constraint rejection. Final asserted state is receiver_balance=85 receipts=2 sender_acked=2; the rejected amount 99 never affects the account.

## Systems lens
An idempotency ledger is a durable assertion about the meaning of a request, not just its existence. SQLite can enforce that assertion with the local effect. Cross-participant acknowledgement remains a separate state transition, so the protocol must survive repeating it.

## Optional variation
Remove payload comparison and use only ON CONFLICT DO NOTHING. Which request would the sender believe was accepted after the changed-amount retry? Extend the receipt to retain a response that can be returned consistently on replay.
