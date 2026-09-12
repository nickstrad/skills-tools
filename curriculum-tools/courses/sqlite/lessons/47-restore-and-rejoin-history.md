# Restore an old device file without reusing its history

slug: restore-and-rejoin-history
category: local-systems
difficulty: advanced
tags: backup, device-generation, oplog, retention, recovery
prerequisites: ordering-conflicts-and-tombstones
safety: writes-data
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 35
revision: 1

## Overview
Restore a device backup taken before its latest operations while a peer still remembers them. The restored sequence counter can now assign an old identity to new intent, which the peer must reject. Reconcile retained history and move future writes to a new generation before allowing the device to write again.

## Syntax breakdown
### In plain terms

A backup can be internally correct and still be older than the world around it. Restoring one
device rewinds its counters, acknowledgements and knowledge of remote work. The other replica does
not rewind. This experiment first causes identity reuse, then makes rejoin an explicit operation:
recover retained history, advance the logical version and assign a fresh generation.

### What you are learning

- Database integrity and safe protocol identity are separate recovery requirements.
- A new generation prevents sequence reuse but does not reconstruct missing state or decide an
  edit's logical version. Those require reconciliation too.
- This recovery succeeds because a peer retains the complete needed history. Without that history,
  the protocol must define a trusted snapshot/full-resync path and retire the old origin.

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

- **.backup** (engine snapshot command): Capture A at seq 1, then restore into a new file. The live
  peer remains untouched. A backup's integrity does not tell you whether its sequence is still unused.
- **device.next_seq / advance_local_sequence** (local allocation state and trigger): An accepted
  local-origin inbox insert advances the counter in the same transaction as application. The old
  backup still contains 2. The experiment tries that identity with different content and checks rejection.
- **if apply_batch ... / CHECK error** (conflict test): Verify the exact reused-identity failure
  and unchanged peer state. A transport failure would not establish the same result.
- **.mode insert incoming** (lab history export): Serialize the peer's retained operations as
  INSERT statements for the common apply procedure. All six protocol fields are exported in order.
- **max(clock)+1 / new origin generation** (rejoin policy): After receiving retained history,
  make future local versions newer than observed versions and allocate under a/g2. Generation creation
  is a deliberate policy decision here; a real system needs a collision-resistant way to assign it.

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
sqlite3 -bail "$a" <<'SQL'
CREATE TABLE device(origin TEXT PRIMARY KEY,next_seq INTEGER);
INSERT INTO device VALUES('a/g1',1);
CREATE TRIGGER advance_local_sequence AFTER INSERT ON inbox
 WHEN NEW.origin=(SELECT origin FROM device)
 BEGIN UPDATE device SET next_seq=max(next_seq,NEW.seq+1); END;
SQL
echo "INSERT INTO incoming VALUES('a/g1',1,1,'note','initial',0);" >"$lab/first.sql"
apply_batch "$a" "$lab/first.sql"
apply_batch "$b" "$lab/first.sql"
sqlite3 "$a" ".backup '$lab/old-backup.db'"
echo "INSERT INTO incoming VALUES('a/g1',2,2,'note','peer remembers',0);" >"$lab/later.sql"
apply_batch "$a" "$lab/later.sql"
apply_batch "$b" "$lab/later.sql"
test "$(sqlite3 "$a" 'SELECT next_seq FROM device;')" = 3
sqlite3 "$lab/old-backup.db" ".backup '$lab/restored.db'"
restored=$lab/restored.db
test "$(sqlite3 "$restored" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$restored" 'SELECT next_seq FROM device;')" = 2
echo "INSERT INTO incoming VALUES('a/g1',2,2,'note','different new intent',0);" >"$lab/reused.sql"
if apply_batch "$b" "$lab/reused.sql" >"$lab/reused.log" 2>&1; then
  echo 'unexpected: old identity accepted with new payload' >&2; exit 1
else
  grep -q 'CHECK constraint failed' "$lab/reused.log"
  echo 'restored_integrity=ok reused_identity_rejected=1'
fi
sqlite3 "$b" <<'SQL' >"$lab/history.sql"
.mode insert incoming
SELECT origin,seq,clock,doc,body,deleted FROM inbox ORDER BY origin,seq;
SQL
apply_batch "$restored" "$lab/history.sql"
sqlite3 -bail "$restored" "UPDATE device SET origin='a/g2',next_seq=1;"
sqlite3 "$restored" "SELECT 'INSERT INTO incoming VALUES(' || quote(origin) || ',' || next_seq || ',' || (SELECT max(clock)+1 FROM inbox) || ',''note'',''after rejoin'',0);' FROM device;" >"$lab/rejoined.sql"
apply_batch "$restored" "$lab/rejoined.sql"
test "$(sqlite3 "$restored" 'SELECT next_seq FROM device;')" = 2
apply_batch "$b" "$lab/rejoined.sql"
apply_batch "$b" "$lab/rejoined.sql"
sqlite3 "$restored" 'SELECT * FROM notes ORDER BY doc;' >"$lab/restored-state.txt"
sqlite3 "$b" 'SELECT * FROM notes ORDER BY doc;' >"$lab/peer-state.txt"
diff -u "$lab/restored-state.txt" "$lab/peer-state.txt"
test "$(sqlite3 "$b" 'SELECT count(*) FROM inbox;')" = 3
test "$(sqlite3 "$b" 'SELECT body FROM notes;')" = 'after rejoin'
echo 'rejoined_origin=a/g2 clock=3 unique_ops=3 converged=1'
```

## Expected result
The restored file passes integrity_check but still proposes sequence 2. The peer rejects changed content under that old identity with CHECK constraint failed. After replaying retained history and adopting a/g2, both document states match at clock 3 with body after rejoin; repeating the new operation leaves unique_ops=3 and converged=1.

## Systems lens
Restoring a participant is a protocol event because the rest of the system retains observations the participant has forgotten. A generation fences the old identity space; reconciliation repairs its missing knowledge. Neither is supplied automatically by copying a valid SQLite file.

## Optional variation
On a fresh disposable run, after the changed-identity rejection and before the history export, delete only a/g1:2 from the peer's inbox with `sqlite3 -bail "$b" "DELETE FROM inbox WHERE origin='a/g1' AND seq=2;"`. The peer's cursor and materialized note still remember later progress, but its export cannot supply the missing operation. Inspect the exported history and restored inbox: they cannot prove the complete prefix needed by this rejoin procedure, and the unchanged final three-operation assertion rejects the altered run.

When complete history is unavailable, pause new writes until a protocol-defined authoritative snapshot supplies state and receive positions. Retire the old origin and admit a fresh generation under a rule that refuses ancient replay. A structurally valid local file and a cursor value alone do not supply that missing evidence.
