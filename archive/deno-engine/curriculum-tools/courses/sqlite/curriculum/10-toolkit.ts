import { code, type Module } from "../../../src/types.ts";

export const TOOLKIT: Module = {
  category: "toolkit",
  title: "Application toolkit",
  lessons: [
    {
      slug: "independent-database-writers",
      title: "Use independent files as writer domains",
      difficulty: "advanced",
      tags: ["sharding", "locking", "writer-admission", "failure-domain"],
      prerequisites: ["restore-and-rejoin-history"],
      overview:
        "Hold tenant A's writer while tenant B commits to a different file, then make a second A connection fail admission. This shows exactly what file-per-tenant buys: independent local writer queues. It does not create a separate machine, isolate shared disk pressure or atomically coordinate the two independent connections.",
      syntaxBreakdown: code`### In plain terms

One SQLite file has one writer position, but the restriction is not a host-wide mutex. Two files can accept writes independently while two connections to the same file still contend. We hold A until all observations finish, so the result does not depend on beating a one-second background sleep.

### What you are learning

- **Partitioned admission:** Separate files create independent writer domains.
- **Shared failure domain:** Host, filesystem and capacity failures can still affect both.
- **Coordination boundary:** Independent transactions do not become one transaction merely because the files are nearby.

### Piece by piece

- **set -eu, printenv, case, dirname, test and mktemp -d** require an owned writable lab parent and create unique tenant files and logs.
- **sqlite3 -bail** stops unexpected SQL failures. Both files explicitly use **journal_mode=DELETE** and the same small table.
- **mkfifo, exec 3, background &, and $!** retain one live A writer and its exact process ID.
- **BEGIN IMMEDIATE, INSERT and HOLDER_READY** acquire A's writer and report readiness only after the pending mutation. **grep -Fxq, seq and sleep** wait for that full marker within a bounded loop.
- B's separate **BEGIN/INSERT/COMMIT** must succeed while A is still held. Its success is checked before the A contender begins.
- **busy_timeout=200** bounds the second A connection's admission attempt. Its nonzero exit plus database is locked evidence is required; **date +%s%N** measures the wait including process launch.
- Only after the contender finishes does the parent send A **COMMIT** and **.quit**, close the FIFO descriptor and **wait** for the child.
- **count(*) and integrity_check** are asserted on both files: each has exactly its one intended row and sound structure.
- **trap, kill -0 and kill -KILL** clean up only the owned process on failure. **cat** exposes the retained contender log for review.`,
      code: code`(
set -eu
db=$(printenv TUTOR_SQLITE_DB)
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
dir=$(dirname -- "$db")
[ "$dir" != / ] && [ -d "$dir" ] && [ -w "$dir" ] || exit 2
case "$dir" in *"'"*|*'"'*) echo 'use a lab path without quote characters' >&2; exit 2;; esac
[ "$dir" != / ] && [ -d "$dir" ] && [ -w "$dir" ] || exit 2
scratch=$(mktemp -d "$dir/toolkit-writers.XXXXXX")
echo "evidence_dir=$scratch"
a="$scratch/tenant-a.sqlite"; b="$scratch/tenant-b.sqlite"; pid=0
cleanup() { if [ "$pid" -gt 0 ] && kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; }
trap cleanup EXIT
sqlite3 -bail "$a" 'PRAGMA journal_mode=DELETE; CREATE TABLE writes(note TEXT);'
sqlite3 -bail "$b" 'PRAGMA journal_mode=DELETE; CREATE TABLE writes(note TEXT);'
mkfifo "$scratch/holder.in"
sqlite3 -bail "$a" <"$scratch/holder.in" >"$scratch/holder.log" 2>&1 & pid=$!
exec 3>"$scratch/holder.in"
printf "%s\n" "BEGIN IMMEDIATE; INSERT INTO writes VALUES ('holder'); SELECT 'HOLDER_READY';" >&3
ready=0
for poll in $(seq 1 100); do
  if grep -Fxq HOLDER_READY "$scratch/holder.log"; then ready=1; break; fi
  sleep 0.02
done
[ "$ready" -eq 1 ] || { echo 'holder readiness deadline exceeded' >&2; exit 3; }
sqlite3 -bail "$b" "BEGIN IMMEDIATE; INSERT INTO writes VALUES ('independent'); COMMIT;"
echo 'tenant_b_commit=ok while tenant_a_writer_is_held=yes'
start=$(date +%s%N)
status=0
sqlite3 -bail "$a" 'PRAGMA busy_timeout=200; BEGIN IMMEDIATE;' >"$scratch/contender.log" 2>&1 || status=$?
end=$(date +%s%N)
[ "$status" -ne 0 ] && grep -qi 'database is locked' "$scratch/contender.log" || { echo 'missing contention evidence' >&2; exit 4; }
printf 'COMMIT;\n.quit\n' >&3
exec 3>&-
wait "$pid"; pid=0
[ "$(sqlite3 "$a" 'SELECT count(*) FROM writes;')" -eq 1 ]
[ "$(sqlite3 "$b" 'SELECT count(*) FROM writes;')" -eq 1 ]
[ "$(sqlite3 "$a" 'PRAGMA integrity_check;')" = ok ]
[ "$(sqlite3 "$b" 'PRAGMA integrity_check;')" = ok ]
printf 'tenant_a_contender_exit=%s wait_ms=%s tenant_a_rows=1 tenant_b_rows=1 integrity=ok\n' "$status" "$(( (end-start)/1000000 ))"
cat "$scratch/contender.log"
)`,
      expectedResult:
        "tenant_b_commit=ok is printed with tenant_a_writer_is_held=yes. The second A connection exits nonzero after approximately its 200 ms wait budget and prints database is locked. Both file counts are asserted as 1 and both integrity checks are ok; no fixed cross-machine throughput claim follows.",
      systemsLens:
        "File-per-tenant partitioning exchanges a shared writer queue for routing, migrations, backup coordination and cross-partition invariants. SQLite is useful when those responsibilities fit the application. When one invariant spans independent writers, explicitly choose a coordinating transaction or a protocol; do not assume physical proximity supplies atomicity.",
      challenge:
        "Choose a transfer invariant spanning the two tenant files. Contrast a coordinated ATTACH transaction with two independent commits that require recovery logic. Identify which approach your deployment's journal mode and ownership allow.",
      caution:
        "Only scratch files named by the script are removed. Keep TUTOR_SQLITE_DB disposable; unrelated errors in the contender log are not lock evidence.",
      safetyLevel: "locking",
      runIn: "shell",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 1,
      estimatedMinutes: 25,
    },
    {
      slug: "attached-database-boundaries",
      title: "Observe ATTACH transaction boundaries",
      difficulty: "advanced",
      tags: ["attach", "transactions", "rollback-journal", "wal"],
      prerequisites: ["independent-database-writers"],
      overview:
        "Attach two owned files to one connection and observe their rollback journals while a joint transaction is pending. Then run a clean WAL-mode transaction and inspect the two separate WAL files. The live experiment demonstrates coordination and artifacts; the cross-file crash guarantee comes from the documented mode conditions, not from a simulated power cut.",
      syntaxBreakdown: code`### In plain terms

ATTACH adds another database namespace to one connection, allowing SQL to address both files. SQLite can coordinate rollback-mode transactions across attached on-disk databases under its documented conditions. WAL retains atomicity for each file but does not supply an all-files crash-atomic commit.

### What you are learning

- **One coordinator:** Both attached writes belong to this connection's transaction, unlike two independent CLI commits.
- **Journal evidence:** Each participating file has its own rollback journal before publication.
- **Guarantee boundary:** Clean success cannot establish behavior under a host crash or power loss.

### Piece by piece

- **Path checks and mktemp -d** create two fresh local files; paths containing quote characters are rejected because they enter trusted lab SQL heredocs.
- **sqlite3 -bail** stops unexpected errors. An unquoted **heredoc** substitutes only these generated file paths into SQL.
- **ATTACH 'path' AS aux** exposes the second file under aux; **main.items and aux.items** select the physical destination explicitly.
- **journal_mode=DELETE and BEGIN IMMEDIATE** establish rollback-mode participation before the two INSERTs. Both main and aux are fresh on-disk databases, not an in-memory main database.
- **.shell stat -c** inspects each nonempty -journal while the transaction remains open. %s means bytes; this is evidence of before-images, not an observation of every commit-protocol phase.
- **COMMIT, count(*) and qualified integrity_check** show one committed row and sound structure in each file. Shell **test -e** distinguishes post-commit removal from retained length.
- **PRAGMA main/aux.journal_mode=WAL** selects WAL separately for both. **wal_autocheckpoint=0** keeps this connection's commit frames observable.
- The second clean transaction appends one row per file; live **stat** observes each WAL before connection shutdown can clean it up.
- SQLite's documented attached rollback commit protocol has additional synchronization conditions. Consult those conditions before adopting it; this script does not trace the super-journal or inject a cross-file power failure.`,
      code: code`
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
dir=$(dirname -- "$db")
[ "$dir" != / ] && [ -d "$dir" ] && [ -w "$dir" ] || exit 2
case "$dir" in *"'"*|*'"'*) echo 'use a lab path without quote characters' >&2; exit 2;; esac
scratch=$(mktemp -d "$dir/toolkit-attach.XXXXXX")
echo "evidence_dir=$scratch"
main=$scratch/attach-main.sqlite; aux=$scratch/attach-aux.sqlite
rm -f "$main" "$main-journal" "$main-wal" "$main-shm" "$aux" "$aux-journal" "$aux-wal" "$aux-shm"
sqlite3 -bail "$main" <<SQL
PRAGMA journal_mode=DELETE;
ATTACH '$aux' AS aux;
CREATE TABLE main.items(id INTEGER PRIMARY KEY, value TEXT);
CREATE TABLE aux.items(id INTEGER PRIMARY KEY, value TEXT);
BEGIN IMMEDIATE;
INSERT INTO main.items VALUES (1, 'main-commit');
INSERT INTO aux.items VALUES (1, 'aux-commit');
.shell stat -c 'main_journal_bytes=%s' '$main-journal'
.shell stat -c 'aux_journal_bytes=%s' '$aux-journal'
COMMIT;
SELECT 'main_rows', count(*) FROM main.items;
SELECT 'aux_rows', count(*) FROM aux.items;
PRAGMA main.integrity_check;
PRAGMA aux.integrity_check;
SQL
echo "after_commit_main_journal=$(test -e "$main-journal" && stat -c '%s' "$main-journal" || echo 0) after_commit_aux_journal=$(test -e "$aux-journal" && stat -c '%s' "$aux-journal" || echo 0)"
sqlite3 -bail "$main" <<SQL
PRAGMA journal_mode=WAL;
ATTACH '$aux' AS aux;
PRAGMA aux.journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
BEGIN;
INSERT INTO main.items VALUES (2, 'main-wal');
INSERT INTO aux.items VALUES (2, 'aux-wal');
COMMIT;
.shell stat -c 'main_wal_bytes=%s' '$main-wal'
.shell stat -c 'aux_wal_bytes=%s' '$aux-wal'
SQL
echo 'wal_note=each attached file owns its own WAL sidecar; process termination is not a power-loss test'
echo "journal_evidence=$scratch"
      `,
      expectedResult:
        "Before rollback-mode COMMIT, main_journal_bytes and aux_journal_bytes are positive. The transaction then reports one row and integrity ok in each file, with completed rollback journals removed. The WAL phase reports two nonempty per-file WAL sidecars while the connection is open. These observations do not test cross-file crash atomicity.",
      systemsLens:
        "Do not collapse 'one file', 'one connection', 'one transaction' and 'one failure domain' into the same boundary. ATTACH can coordinate local rollback-mode files when its conditions hold; WAL and independent connections have different guarantees. This is a useful local tool, not distributed consensus.",
      challenge:
        "Use two independent sqlite3 processes and explain why ATTACH cannot coordinate them. Then leave one attached transaction open and inspect which journals appear.",
      caution:
        "The experiment creates only fresh files under its unique toolkit-attach directory. Do not attach valuable databases. The WAL phase's clean success must never be presented as evidence of all-files atomicity after a crash.",
      safetyLevel: "ddl",
      runIn: "shell",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 1,
      estimatedMinutes: 25,
    },
    {
      slug: "cache-invalidation-and-snapshots",
      title: "Refresh a cache and capture an engine snapshot",
      difficulty: "intermediate",
      tags: ["cache-invalidation", "read-only", "backup", "snapshots"],
      prerequisites: ["attached-database-boundaries"],
      overview:
        "Cache a value next to a persistent connection, let a different connection change it, then use data_version to notice that the cached value needs refreshing. Capture a separate engine backup and verify a read-only open. This combines two practical toolkit uses without pretending the counter is a replication cursor.",
      syntaxBreakdown: code`### In plain terms

A value cached in application memory can become stale even when the database is correct. SQLite exposes a connection-local data_version that changes when another connection commits. We compare it on the same still-open connection, reread the authoritative row, then preserve a verified snapshot for independent read-only consumption.

### What you are learning

- **Hint versus history:** data_version says something changed, not which rows changed or which remote operations were received.
- **Connection identity:** Numbers from different or reopened connections are not comparable global versions.
- **Snapshot artifact:** Read-only access constrains a connection's writes; consistent capture requires the backup protocol.

### Piece by piece

- **Path checks, mktemp -d and journal_mode=WAL** create a fresh owned source and a separate snapshot destination.
- **mkfifo, background sqlite3 and exec 3/4** keep A and B alive with separate inputs and logs. **trap, kill -0, kill -KILL and wait** clean up only these owned workers.
- A reads **PRAGMA data_version** and the source value, then prints **A_READY** after both observations. **grep** waits for this completion marker; printing readiness before the queries would race the shell reader.
- **awk** extracts A's numeric counter and cached value from the complete log. They must identify the original before value.
- B's **BEGIN IMMEDIATE/UPDATE/COMMIT** publishes after and only then prints **B_COMMITTED**.
- A repeats its version query and value read on the same connection, then prints **A_AFTER**. Assertions require a changed version, before as the cached value and after as the refreshed value.
- **.quit, descriptor closure and wait** finish both sessions before creating the snapshot.
- **.backup** invokes SQLite's engine-coordinated capture. **sqlite3 -readonly** opens the result without write permission through that connection; integrity and the after value are explicitly asserted.
- A deliberate snapshot INSERT must fail with a read-only error and nonzero exit. Read-only is not the stronger promise made by immutable=1; never label a changing source immutable.`,
      code: code`
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
dir=$(dirname -- "$db")
[ "$dir" != / ] && [ -d "$dir" ] && [ -w "$dir" ] || exit 2
case "$dir" in *"'"*|*'"'*) echo 'use a lab path without quote characters' >&2; exit 2;; esac
scratch=$(mktemp -d "$dir/toolkit-cache.XXXXXX")
echo "evidence_dir=$scratch"
source=$scratch/cache-source.sqlite; snapshot=$scratch/cache-snapshot.sqlite
rm -f "$source" "$source-wal" "$source-shm" "$source-journal" "$snapshot" "$snapshot-wal" "$snapshot-shm" "$snapshot-journal"
sqlite3 "$source" "PRAGMA journal_mode=WAL; CREATE TABLE cache_rows(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO cache_rows VALUES (1, 'before');"
mkfifo "$scratch/a.in" "$scratch/b.in"
sqlite3 "$source" <"$scratch/a.in" >"$scratch/a.out" 2>&1 & apid=$!
sqlite3 "$source" <"$scratch/b.in" >"$scratch/b.out" 2>&1 & bpid=$!
exec 3>"$scratch/a.in"; exec 4>"$scratch/b.in"
cleanup() { for process in "$apid" "$bpid"; do if [ "$process" -gt 0 ] && kill -0 "$process" 2>/dev/null; then kill -KILL "$process" 2>/dev/null || true; wait "$process" 2>/dev/null || true; fi; done; }
trap cleanup EXIT
printf '%s\n' 'PRAGMA data_version;' "SELECT 'A_CACHE=' || value FROM cache_rows WHERE id=1;" '.print A_READY' >&3
deadline=$(( $(date +%s) + 5 )); while ! grep -q 'A_READY' "$scratch/a.out" && [ "$(date +%s)" -lt "$deadline" ]; do sleep 0.05; done
grep -q 'A_READY' "$scratch/a.out" || { echo 'session_a_ready=no' >&2; exit 1; }
before=$(awk '/^[0-9]+$/{print; exit}' "$scratch/a.out"); cached=$(awk -F= '/A_CACHE=/{print $2; exit}' "$scratch/a.out")
echo "cache_value_before=$cached data_version_before=$before"
printf '%s\n' 'BEGIN IMMEDIATE;' "UPDATE cache_rows SET value='after' WHERE id=1;" 'COMMIT;' '.print B_COMMITTED' >&4
deadline=$(( $(date +%s) + 5 )); while ! grep -q 'B_COMMITTED' "$scratch/b.out" && [ "$(date +%s)" -lt "$deadline" ]; do sleep 0.05; done
grep -q 'B_COMMITTED' "$scratch/b.out" || { echo 'session_b_commit=no' >&2; exit 1; }
printf '%s\n' 'PRAGMA data_version;' "SELECT 'A_REFRESH=' || value FROM cache_rows WHERE id=1;" '.print A_AFTER' >&3
deadline=$(( $(date +%s) + 5 )); while ! grep -q 'A_AFTER' "$scratch/a.out" && [ "$(date +%s)" -lt "$deadline" ]; do sleep 0.05; done
after=$(awk '/A_AFTER/{print v; exit} /^[0-9]+$/{v=$0}' "$scratch/a.out"); refreshed=$(awk -F= '/A_REFRESH=/{print $2; exit}' "$scratch/a.out")
[ -n "$before" ] && [ -n "$after" ] && [ "$cached" = before ] && [ "$refreshed" = after ] || { echo 'cache evidence assertion failed' >&2; exit 1; }
echo "data_version_after=$after cache_refresh_value=$refreshed"
if [ "$before" = "$after" ]; then echo 'version_changed=0'; exit 1; else echo 'version_changed=1'; fi
printf '%s\n' '.quit' >&3; printf '%s\n' '.quit' >&4; exec 3>&-; exec 4>&-; wait "$apid"; wait "$bpid"; apid=0; bpid=0
sqlite3 "$source" ".backup '$snapshot'"
sqlite3 -readonly "$snapshot" "PRAGMA integrity_check; SELECT 'snapshot_value', value FROM cache_rows WHERE id=1;"
[ "$(sqlite3 -readonly "$snapshot" 'PRAGMA integrity_check;')" = ok ]
[ "$(sqlite3 -readonly "$snapshot" 'SELECT value FROM cache_rows WHERE id=1;')" = after ]
set +e
sqlite3 -readonly "$snapshot" "INSERT INTO cache_rows VALUES (2, 'blocked');" >"$scratch/readonly.out" 2>&1
readonly_status=$?
set -e
echo "readonly_insert_exit=$readonly_status"; [ "$readonly_status" -ne 0 ]; grep -qi 'readonly\|read-only' "$scratch/readonly.out"
echo "session_logs=$scratch/a.out,$scratch/b.out readonly_log=$scratch/readonly.out"
      `,
      expectedResult:
        "The output names an evidence directory, then prints cache_value_before=before and a numeric version from persistent Session A. After persistent Session B commits, A's data_version differs, version_changed=1, and A's refresh prints after. The backup opens read-only with integrity_check ok and snapshot_value=after; an insert exits nonzero with a read-only error. data_version is not a global replication cursor.",
      systemsLens:
        "A local invalidation hint and a portable snapshot solve different problems. The counter helps an application decide to reread; the backup supplies reproducible state for a reader or recovery tool. File replacement, external caches and distributed history still require explicit generation and coordination rules.",
      challenge:
        "Open a second read-only snapshot after a later commit and compare both values. Define a cache-generation and reopen protocol for replacing a source file.",
      caution:
        "The source and snapshot are disposable. A changed data_version does not identify changed rows or certify a remote replica is current.",
      safetyLevel: "writes-data",
      runIn: "shell",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 1,
      estimatedMinutes: 20,
    },
    {
      slug: "fts-derived-state",
      title: "Repair and maintain an FTS5 derived index",
      difficulty: "advanced",
      tags: ["fts5", "derived-state", "triggers", "rollback"],
      prerequisites: ["cache-invalidation-and-snapshots"],
      overview:
        "Create an external-content search index after its source rows already exist and observe a missed match. Rebuild it, install transactional maintenance triggers and prove a rolled-back document leaves no searchable ghost. SQLite becomes a practical local search tool while exposing the same derived-state repair obligations found in larger systems.",
      syntaxBreakdown: code`### In plain terms

The docs table is authoritative; FTS5 maintains a separate searchable representation of it. Creating an external-content FTS table does not backfill existing documents. We first cause that divergence, then repair it and test maintenance through every mutation path.

### What you are learning

- **Derived-state ownership:** A source row and a searchable term are different stored facts.
- **Repair versus prevention:** Rebuild repairs old divergence; triggers keep subsequent changes aligned.
- **Atomic maintenance:** Trigger effects share the source transaction's commit or rollback.
- **Semantic checks:** Sound pages alone do not certify that a search index matches its source.

### Piece by piece

- **Path checks and mktemp -d** isolate the artifact. **pragma_module_list** gates FTS5 availability and a missing module exits nonzero; the course bootstrap enables it explicitly.
- **sqlite3 -bail** stops unexpected SQL errors and retains the output in fts.log.
- **CREATE VIRTUAL TABLE ... USING fts5(title, body, content='docs', content_rowid='id')** maps search content to the source table's integer identity.
- **MATCH 'pager'** consults indexed terms and initially finds zero despite the existing document. An ordinary non-MATCH query can read external content without proving it is indexed.
- **INSERT INTO docs_fts(docs_fts) VALUES ('rebuild')** is an FTS maintenance command: scan the authoritative docs table and reconstruct the index. The match count becomes 1.
- **AFTER INSERT/DELETE/UPDATE triggers** maintain the derived representation. **new** supplies inserted values; **old** supplies the exact values to remove. FTS5's special **'delete' command** removes the old indexed terms; UPDATE combines delete-old and insert-new.
- The controlled source insert, update and delete leave one pager match. A temporary document inside **BEGIN** is searchable, then **ROLLBACK** removes both its source row and indexed terms.
- **INSERT ... ('integrity-check', 1)** uses the FTS hidden command and rank columns to compare internal index consistency with external content. **PRAGMA integrity_check** supplies a separate page-structure check.
- **grep -Fxq** requires every expected marker and count in the retained log; a later command's success cannot conceal an earlier wrong observation.`,
      code: code`
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
dir=$(dirname -- "$db")
[ "$dir" != / ] && [ -d "$dir" ] && [ -w "$dir" ] || exit 2
case "$dir" in *"'"*|*'"'*) echo 'use a lab path without quote characters' >&2; exit 2;; esac
scratch=$(mktemp -d "$dir/toolkit-fts.XXXXXX")
echo "evidence_dir=$scratch"
fts_db=$scratch/fts-derived.sqlite
rm -f "$fts_db" "$fts_db-wal" "$fts_db-shm" "$fts_db-journal"
capability=$(sqlite3 "$fts_db" "SELECT CASE WHEN EXISTS (SELECT 1 FROM pragma_module_list WHERE name='fts5') THEN 'yes' ELSE 'no' END;" 2>/dev/null || true)
if [ "$capability" != yes ]; then echo "fts5_capability=missing runtime=$(sqlite3 --version | cut -d' ' -f1)" >&2; exit 3; fi
echo 'fts5_capability=yes'
sqlite3 -bail "$fts_db" >"$scratch/fts.log" <<'SQL'
PRAGMA journal_mode=WAL;
CREATE TABLE docs(id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL);
INSERT INTO docs VALUES (1, 'one', 'pager recovery'), (2, 'two', 'writer checkpoint');
CREATE VIRTUAL TABLE docs_fts USING fts5(title, body, content='docs', content_rowid='id');
SELECT 'before_rebuild', count(*) FROM docs_fts WHERE docs_fts MATCH 'pager';
INSERT INTO docs_fts(docs_fts) VALUES ('rebuild');
SELECT 'after_rebuild', count(*) FROM docs_fts WHERE docs_fts MATCH 'pager';
CREATE TRIGGER docs_ai AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER docs_ad AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER docs_au AFTER UPDATE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
INSERT INTO docs VALUES (3, 'three', 'quota incident');
UPDATE docs SET body='pager repaired' WHERE id=2;
DELETE FROM docs WHERE id=1;
SELECT 'after_trigger_mutations', count(*) FROM docs_fts WHERE docs_fts MATCH 'pager';
BEGIN;
INSERT INTO docs VALUES (4, 'four', 'pager temporary');
SELECT 'inside_rollback_matches', count(*) FROM docs_fts WHERE docs_fts MATCH 'temporary';
ROLLBACK;
SELECT 'rolled_back_matches', count(*) FROM docs_fts WHERE docs_fts MATCH 'temporary';
INSERT INTO docs_fts(docs_fts, rank) VALUES ('integrity-check', 1);
PRAGMA integrity_check;
SQL
cat "$scratch/fts.log"
for expected in 'before_rebuild|0' 'after_rebuild|1' 'after_trigger_mutations|1' 'inside_rollback_matches|1' 'rolled_back_matches|0' ok; do
  grep -Fxq "$expected" "$scratch/fts.log" || { echo "missing FTS evidence: $expected" >&2; exit 4; }
done
echo "fts_log=$scratch/fts.log (retained for inspection)"
      `,
      expectedResult:
        "On an FTS5-enabled runtime the script prints fts5_capability=yes, before_rebuild|0, after_rebuild|1, after_trigger_mutations|1, inside_rollback_matches|1, rolled_back_matches|0, and integrity_check ok, while retaining the evidence directory. On a runtime without FTS5 it prints fts5_capability=missing and exits nonzero as an unmet prerequisite; it does not claim the experiment passed.",
      systemsLens:
        "Keep the PostgreSQL materialized-state intuition but learn SQLite's specific external-content contract. Local triggers can make source and search updates atomic in one database; they cannot repair old omissions or validate a remote indexing pipeline. A useful toolkit feature includes a repair path and a semantic consistency check.",
      challenge:
        "Remove the triggers and perform one source update, then compare MATCH with a direct docs query. Design a rebuild job that records the source generation it indexed.",
      caution:
        "FTS5 is a required runtime capability, not an optional successful skip. Do not substitute LIKE, which would remove the derived-index phenomenon. All mutations remain inside the newly created toolkit-fts directory.",
      safetyLevel: "ddl",
      runIn: "shell",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 1,
      estimatedMinutes: 25,
    },
  ],
};
