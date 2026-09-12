# Merge independent origins, then break deletion by forgetting history

slug: ordering-conflicts-and-tombstones
category: local-systems
difficulty: advanced
tags: ordering, conflict-resolution, tombstones, retention
prerequisites: duplicate-and-lost-ack
safety: writes-data
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 40
revision: 3

## Overview
Two replicas receive the same operations in different orders. Each origin has its own sequence; gaps delay only that origin, while a deterministic version rule resolves cross-origin edits. After convergence, deliberately discard a tombstone and deliver an old device's previously unseen edit to expose the history-retention assumption.

## Syntax breakdown
### In plain terms

Disconnected devices cannot allocate a shared global sequence without another protocol. We give
each origin its own consecutive numbers and use a separate logical version to choose a document's
winning value. Both replicas run the same apply_batch function; we vary delivery order, not the
application logic. The final failure demonstrates why a deletion is retained as data.

### What you are learning

- Per-origin ordering and cross-origin conflict resolution answer different questions. A cursor
  cannot resolve a concurrent edit, and a winning value cannot certify a complete receive prefix.
- Equal logical clocks require a deterministic tie-breaker. This policy gives convergence but may
  discard a user's edit; convergence is not a claim that the policy meets every application's needs.
- Tombstone collection requires a known retention horizon or a full-resync rule for stale peers.
  Receipt retention alone cannot reject an old operation that this replica has never received.

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

- **printf / batch SQL files** (delivery schedule): Each file contains fixed incoming rows. Sequence
  2 is delivered before 1 on one replica, and origins arrive in opposite orders on the other.
- **diff -u** (convergence check): Compare explicitly sorted document rows. Empty diff means the
  entire displayed state matches; equal row counts alone would not establish convergence.
- **DELETE FROM notes WHERE deleted=1** (deliberately unsafe collection): Remove deletion metadata
  before every possible old origin has been retired. The later c/g1 edit is new to the receipt ledger
  but older than the removed tombstone. The unsafe copy resurrects it; the retained copy rejects it.

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

a=$lab/a.db
b=$lab/b.db
init_replica "$a"
init_replica "$b"
echo "INSERT INTO incoming VALUES('a/g1',1,1,'note','A first',0);" >"$lab/a1.sql"
echo "INSERT INTO incoming VALUES('a/g1',2,3,'note',NULL,1);" >"$lab/a2.sql"
echo "INSERT INTO incoming VALUES('b/g1',1,1,'note','B tie winner',0);" >"$lab/b1.sql"
apply_batch "$a" "$lab/a2.sql"
test "$(sqlite3 "$a" 'SELECT last_seq FROM cursors;')" = 0
test "$(sqlite3 "$a" 'SELECT count(*) FROM notes;')" = 0
echo 'gap_held cursor_a=0 notes=0'
apply_batch "$a" "$lab/b1.sql"
apply_batch "$b" "$lab/a1.sql"
apply_batch "$b" "$lab/b1.sql"
test "$(sqlite3 "$b" 'SELECT body FROM notes;')" = 'B tie winner'
echo 'equal_clock_winner=b/g1'
apply_batch "$a" "$lab/a1.sql"
apply_batch "$b" "$lab/a2.sql"
apply_batch "$a" "$lab/a2.sql"
sqlite3 "$a" 'SELECT * FROM notes ORDER BY doc;' >"$lab/a-state.txt"
sqlite3 "$b" 'SELECT * FROM notes ORDER BY doc;' >"$lab/b-state.txt"
diff -u "$lab/a-state.txt" "$lab/b-state.txt"
test "$(sqlite3 "$a" 'SELECT deleted FROM notes;')" = 1
test "$(sqlite3 "$a" "SELECT last_seq FROM cursors WHERE origin='a/g1';")" = 2
echo 'converged=1 deleted=1 a_cursor=2'
sqlite3 "$a" ".backup '$lab/unsafe.db'"
sqlite3 -bail "$lab/unsafe.db" 'DELETE FROM notes WHERE deleted=1;'
echo "INSERT INTO incoming VALUES('c/g1',1,1,'note','old unseen edit',0);" >"$lab/stale.sql"
apply_batch "$a" "$lab/stale.sql"
apply_batch "$lab/unsafe.db" "$lab/stale.sql"
test "$(sqlite3 "$a" 'SELECT deleted FROM notes;')" = 1
test "$(sqlite3 "$lab/unsafe.db" 'SELECT deleted FROM notes;')" = 0
echo 'retained_tombstone_deleted=1 premature_gc_resurrected=1'
```

## Expected result
A's seq-2-first delivery prints gap_held cursor_a=0 notes=0. The same-clock comparison selects b/g1. Missing a/g1:1 then releases A's buffered deletion; both sorted states match with deleted=1 and a_cursor=2, including after duplicate delivery. The final checked contrast is retained_tombstone_deleted=1 premature_gc_resurrected=1.

## Systems lens
Convergence requires a deterministic state transition plus assumptions about the history still available. SQLite protects each replica's inbox, materialized state and receive cursor atomically; origin membership, logical clocks, garbage-collection horizons and conflict policy belong to the synchronization design.

## Optional variation
Compare the supplied single-winner policy with retaining both conflicting values. Retention preserves both edits but leaves an application or user decision to resolve them; it does not by itself produce one current value. Tombstone collection likewise needs an explicit membership horizon: all still-admitted origins must have passed the deletion, and expired origins must be refused ordinary replay. An expired device rejoins from an authoritative snapshot with reconciled history and a fresh generation before submitting new edits. The fixture's unseen c/g1 operation demonstrates the failure when that admission rule is absent.
