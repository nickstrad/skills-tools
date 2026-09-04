import { code } from "../../../src/types.ts";

// Authoring reuse only: the renderer includes these commands in each lesson in full.
// Nothing is hidden behind an installed application or a network service.
export const offlineLab = code`set -eu
lab_db=$(printenv TUTOR_SQLITE_DB)
case "$lab_db" in /*.db) ;; *) echo 'Set TUTOR_SQLITE_DB to an absolute disposable .db path' >&2; exit 2;; esac
lab_parent=$(dirname -- "$lab_db")
test "$lab_parent" != /
test -d "$lab_parent"
case "$lab_parent" in *"'"*|*'"'*) echo 'Use a lab path without quote characters for this SQL/shell transport' >&2; exit 2;; esac
lab=$(mktemp -d "$lab_parent/offline.XXXXXX")
echo "evidence_directory=$lab"
`;

export const deliveryProtocol = code`
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
`;

export const mergeProtocol = code`
# Each origin is one device generation. (origin,seq) is an immutable operation identity.
init_replica() {
  sqlite3 -bail "$1" <<'SQL'
CREATE TABLE inbox(origin TEXT NOT NULL, seq INTEGER NOT NULL CHECK(seq>0),
 clock INTEGER NOT NULL, doc TEXT NOT NULL, body TEXT, deleted INTEGER NOT NULL CHECK(deleted IN(0,1)),
 applied INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(origin,seq)) WITHOUT ROWID;
CREATE TABLE cursors(origin TEXT PRIMARY KEY NOT NULL, last_seq INTEGER NOT NULL);
CREATE TABLE notes(doc TEXT PRIMARY KEY NOT NULL, body TEXT, deleted INTEGER NOT NULL,
 clock INTEGER NOT NULL, origin TEXT NOT NULL);
SQL
}
apply_batch() {
  { echo 'CREATE TEMP TABLE incoming(origin TEXT NOT NULL,seq INTEGER NOT NULL,clock INTEGER NOT NULL,doc TEXT NOT NULL,body TEXT,deleted INTEGER NOT NULL,PRIMARY KEY(origin,seq));';
    cat "$2";
    echo 'BEGIN IMMEDIATE;';
    echo 'CREATE TEMP TABLE identity_guard(ok INTEGER CHECK(ok=1));';
    echo 'INSERT INTO identity_guard SELECT NOT EXISTS(SELECT 1 FROM incoming i JOIN inbox b USING(origin,seq) WHERE i.clock<>b.clock OR i.doc<>b.doc OR i.body IS NOT b.body OR i.deleted<>b.deleted);';
    echo 'INSERT INTO inbox(origin,seq,clock,doc,body,deleted) SELECT * FROM incoming WHERE true ON CONFLICT(origin,seq) DO NOTHING;';
    echo 'INSERT INTO cursors SELECT DISTINCT origin,0 FROM inbox WHERE true ON CONFLICT(origin) DO NOTHING;';
    echo 'CREATE TEMP TABLE ready AS WITH RECURSIVE contiguous(origin,seq) AS (SELECT origin,last_seq FROM cursors UNION ALL SELECT c.origin,c.seq+1 FROM contiguous c JOIN inbox b ON b.origin=c.origin AND b.seq=c.seq+1) SELECT b.* FROM inbox b JOIN contiguous c USING(origin,seq) WHERE b.applied=0;';
    echo 'INSERT INTO notes SELECT doc,body,deleted,clock,origin FROM ready WHERE true ON CONFLICT(doc) DO UPDATE SET body=excluded.body,deleted=excluded.deleted,clock=excluded.clock,origin=excluded.origin WHERE (excluded.clock,excluded.origin)>(notes.clock,notes.origin);';
    echo 'UPDATE inbox SET applied=1 WHERE (origin,seq) IN(SELECT origin,seq FROM ready);';
    echo 'UPDATE cursors SET last_seq=COALESCE((SELECT max(seq) FROM ready WHERE ready.origin=cursors.origin),last_seq);';
    echo 'COMMIT;';
  } | sqlite3 -bail "$1"
}
`;

export const shellExplanation = code`
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
`;

export const mergeExplanation = code`
- **origin, seq, clock, doc, deleted** (protocol fields):
  origin includes a device generation; seq is contiguous only within that origin. clock is a
  logical version, not a wall-clock timestamp. The lexicographic pair (clock, origin) chooses a
  deterministic winner; a tombstone is a winning deleted value, not physical removal. Real writers
  must advance their logical clock beyond observed clocks and order their own mutations.
- **WITHOUT ROWID** and **PRIMARY KEY(origin,seq)** (physical identity):
  Store the composite identity directly. Repeated transport cannot create a second receipt for it.
- **WITH RECURSIVE contiguous**, **ready**, and **applied** (gap detection and application):
  Starting from each cursor, follow only existing consecutive sequence numbers. A missing number
  stops that origin, while other origins can advance. ready contains previously unapplied entries
  in that contiguous prefix. The effect, applied flags, and cursor commit together.
- **Row-value comparison and UPSERT** (merge policy):
  Update a document only if the incoming (clock, origin) pair is larger than the stored pair.
  Same-clock edits use origin as the tie-breaker. Thus processing order does not change the final
  winner for this last-writer-wins register; this is not a general merge policy for account debits.
- **COALESCE**, **max**, **NOT EXISTS**, and **IS NOT** (invariant queries):
  Keep a cursor unchanged if no entry becomes ready, reject reused identities with changed payloads
  including NULL bodies, and distinguish new receipts. A cursor is a transport prefix, not a global
  order or proof of real-time causality.
`;
