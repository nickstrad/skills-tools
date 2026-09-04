import { code, type Module } from "../../../src/types.ts";

export const WAL: Module = {
  category: "wal",
  title: "WAL, snapshots, and checkpoints",
  lessons: [
    {
      slug: "wal-sidecar-files",
      title: "WAL turns one database into a live file set",
      difficulty: "intermediate",
      tags: ["wal", "file-format", "pager", "observability"],
      prerequisites: ["idempotent-retry-ledger"],
      safetyLevel: "writes-data",
      runIn: "mixed",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        "Commit a change in WAL mode and inspect the file set while two connections remain open. The deployment question is deceptively practical: what does 'one SQLite file' mean while an application is running? You will distinguish the durable change log from the host-local index that helps connections find those changes.",
      syntaxBreakdown: code`### In plain terms

The main file is not necessarily the latest committed database. In WAL mode, recently committed page versions can still live in the -wal file. We keep connections open because last-connection cleanup can checkpoint and remove sidecars before a shell inspection sees them.

### What you are learning

- **Logical versus physical state:** One database can currently require more than one file.
- **WAL frames:** The log contains changed page images and commit boundaries, not a stream of SQL commands to send to peers.
- **Shared-memory index:** The -shm file supports same-host coordination and lookup; it is not an independent durable history.

### Piece by piece

- **PRAGMA journal_mode=WAL** requests and returns the persistent mode. Check for wal rather than assuming conversion succeeded.
- **PRAGMA wal_autocheckpoint=0** disables automatic threshold checkpoints on this connection. It does not change other connections' policies or stop last-close cleanup.
- **The two labeled sessions** use separate connections to the same absolute TUTOR_SQLITE_DB. A commits its second row; B verifies count 2 without sharing A's memory.
- **.shell stat -c '%n %s bytes'** inspects the main file, -wal and -shm without opening another database connection. %n names each file and %s gives its byte length; shell expansion supplies the lab path.
- **PRAGMA wal_checkpoint(TRUNCATE)** in the challenge asks SQLite to apply safe frames and reclaim the WAL file's length. Perform it through the engine, never by deleting a sidecar yourself.`,
      setup: code`PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS notes;
CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT);
INSERT INTO notes VALUES (1, 'baseline');`,
      code: code`-- Session A
PRAGMA journal_mode;
PRAGMA wal_autocheckpoint=0;
INSERT INTO notes VALUES (2, 'frame-in-wal');
SELECT count(*) FROM notes;
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-wal" "$TUTOR_SQLITE_DB-shm"

-- Session B
PRAGMA journal_mode;
SELECT 'B sees committed WAL state', count(*) FROM notes;
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-wal" "$TUTOR_SQLITE_DB-shm";`,
      expectedResult:
        code`Both connections report journal_mode wal and count 2. While the connections are live, the main file, -wal, and -shm files exist; the WAL size is nonzero after the commit. Exact byte sizes depend on page size and SQLite build.`,
      systemsLens:
        "Compare responsibilities, not names: SQLite WAL is a local page-history and recovery mechanism, not PostgreSQL streaming replication, an application event log, or consensus. A backup tool must obtain a consistent database snapshot; a file picker that happens to see the main file cannot infer which committed frames it is missing.",
      challenge:
        code`Run PRAGMA wal_checkpoint(TRUNCATE) after closing the reader. Which sidecar changes, and why is that a separate operation from committing?`,
      caution:
        code`Never copy just the main file while WAL contains committed frames; use an engine-coordinated backup.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "reader-and-writer-overlap",
      title: "WAL readers and the writer overlap safely",
      difficulty: "intermediate",
      tags: ["wal", "snapshots", "isolation", "transactions"],
      prerequisites: ["wal-sidecar-files"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        "Keep A's read transaction open while B commits a second row. A sees a stable old answer until it ends the transaction; the next read sees B's change. Focus on how SQLite supplies that snapshot from the main file plus WAL versions, rather than relearning transaction isolation from scratch.",
      syntaxBreakdown: code`### In plain terms

A snapshot is the database state a transaction is allowed to observe. A's first read fixes its WAL end mark, the last commit it can see, while B is free to append a later commit. A does not have to read B's new state simply because that state is durable or visible to other connections.

### What you are learning

- **Snapshot establishment:** BEGIN alone is deferred; the first read establishes this reader's view.
- **Overlap:** A reader and a writer can proceed concurrently in WAL mode.
- **Remaining serialization:** Reader/writer overlap does not create multiple concurrent writers.

### Piece by piece

- **PRAGMA journal_mode=WAL** establishes the required mechanism. **wal_autocheckpoint=0** keeps the setup connection's automatic maintenance out of the observation.
- **BEGIN followed by SELECT** makes A hold a read transaction, rather than run two unrelated autocommit reads.
- **count(*) and group_concat(value)** expose both how many rows A sees and whether new content entered its snapshot. With the initial single row the concatenated value must be old.
- **B's INSERT without BEGIN** is an autocommit write. Its count 2 proves publication while A remains open.
- **A's second SELECT before COMMIT** must still report 1 and old. **COMMIT** ends the read transaction; the following autocommit count gets a fresh view and reports 2.
- **A second concurrent writer** in the challenge competes for file-wide admission even if it targets an unrelated row; short writer transactions still matter.`,
      setup: code`PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS items;
CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT);
INSERT INTO items VALUES (1, 'old');`,
      code: code`-- Session A
BEGIN;
SELECT 'A before', count(*), group_concat(value) FROM items;

-- Session B
INSERT INTO items VALUES (2, 'new');
SELECT 'B committed', count(*) FROM items;

-- Session A
SELECT 'A snapshot after B commit', count(*), group_concat(value) FROM items;
COMMIT;
SELECT 'A current', count(*) FROM items;`,
      expectedResult:
        code`B commits and reports count 2 while A remains in its transaction. A's second query still reports count 1 and only old; after COMMIT, A's new query reports count 2.`,
      systemsLens:
        "The PostgreSQL analogy is snapshot isolation, but SQLite does not keep PostgreSQL-style heap tuple-version chains for this observation. It reconstructs page versions relative to the reader's WAL end mark. That makes reader lifetime an input to checkpoint and log-space policy, which the next experiments expose.",
      challenge:
        code`Add a second concurrent writer. Predict which operation waits or returns busy and why WAL is not distributed replication.`,
      caution:
        code`Readers must actually keep a transaction open; two autocommit SELECT statements can observe different snapshots.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "busy-snapshot-upgrade",
      title: "A stale WAL snapshot cannot silently become a writer",
      difficulty: "advanced",
      tags: ["wal", "snapshots", "busy", "optimistic-concurrency"],
      prerequisites: ["reader-and-writer-overlap"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        "Read v1 in A, commit v2 in B, then try to write through A's old snapshot. The error is immediate even with a wait budget because time cannot make that snapshot current. Learn to restart the decision based on stale reads, not blindly retry the last SQL statement.",
      syntaxBreakdown: code`### In plain terms

A lock can eventually be released, but an old snapshot cannot become the latest history by waiting. SQLite rejects A's attempted read-to-write upgrade after B has committed. That distinction determines whether a retry should wait, repeat a statement, or rerun the entire read/decide/write transaction.

### What you are learning

- **Permanent conflict for this snapshot:** Releasing B is insufficient; B has already committed.
- **Error scope:** The failed UPDATE does not itself end A's read transaction.
- **Observed versus inferred codes:** This CLI prints a primary locked error; the extended SQLITE_BUSY_SNAPSHOT classification comes from the documented scenario.

### Piece by piece

- **PRAGMA journal_mode=WAL** makes the snapshot mechanism explicit.
- **.timeout 100** installs a 100 ms busy budget on A only. It is not a promise that all conflicts wait that long.
- **BEGIN and SELECT** fix A's v1 snapshot. B's autocommit **UPDATE** publishes v2 before A attempts its write.
- **.timer on/off** scopes elapsed reporting to the rejected UPDATE. Expect an immediate result relative to the budget, not a required literal zero on every machine.
- **SELECT after the error** still sees v1, proving A remains in the same read transaction.
- **ROLLBACK** discards that transaction; the next query sees v2. Production retry logic must recompute any decision derived from v1.
- **BEGIN IMMEDIATE** in the challenge reserves writer admission before reading a new decision snapshot. Use it after rollback; it cannot repair the old transaction in place.`,
      setup: code`PRAGMA journal_mode=WAL;
DROP TABLE IF EXISTS docs;
CREATE TABLE docs(id INTEGER PRIMARY KEY, body TEXT);
INSERT INTO docs VALUES (1, 'v1');`,
      code: code`-- Session A
.timeout 100
BEGIN;
SELECT 'A read', body FROM docs WHERE id=1;

-- Session B
UPDATE docs SET body='v2' WHERE id=1;
SELECT 'B committed', body FROM docs WHERE id=1;

-- Session A
.timer on
UPDATE docs SET body='A stale write' WHERE id=1;
.timer off
SELECT 'A still snapshot', body FROM docs WHERE id=1;
ROLLBACK;
SELECT 'A retry view', body FROM docs WHERE id=1;`,
      expectedResult:
        "A reads v1 and B commits v2. A's UPDATE prints database is locked promptly rather than waiting out the 100 ms budget; the exact timer value varies. The known ordering matches SQLite's documented SQLITE_BUSY_SNAPSHOT condition, but the default CLI does not display that extended code here. A still sees v1 after the error and sees v2 only after ROLLBACK and a fresh read.",
      systemsLens:
        "Carry forward PostgreSQL's rule that a retry must repeat the decision whose assumptions failed. Add SQLite's distinction between writer-admission contention and stale-snapshot refusal. A larger timeout addresses some admission waits; it cannot repair a stale decision or provide more writer capacity.",
      challenge:
        code`Retry A with BEGIN IMMEDIATE after rolling back. Why does admission plus a fresh read avoid the stale upgrade?`,
      caution:
        code`The default CLI exposes the primary error text; bindings can inspect the extended SQLITE_BUSY_SNAPSHOT result code.`,
      revision: 2,
      minVersion: "3.53.4",
    },
    {
      slug: "checkpoint-modes",
      title: "Checkpoint modes trade progress for coordination",
      difficulty: "advanced",
      tags: ["wal", "checkpoints", "backpressure", "observability"],
      prerequisites: ["busy-snapshot-upgrade"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      overview:
        "Hold a reader behind a later commit and compare four checkpoint modes. The experiment separates copying eligible log frames, waiting for readers, making the log reusable, and shrinking its file. Those are different maintenance outcomes even when application queries return the same rows.",
      syntaxBreakdown: code`### In plain terms

A checkpoint copies safe WAL page versions into the main database. It cannot overwrite a page version that an active reader still needs. The three result columns and the physical file length let you distinguish partial progress from complete reclamation.

### What you are learning

- **Apply versus reclaim:** Checkpointed frames do not imply a zero-length WAL.
- **Coordination cost:** Stronger checkpoint modes can wait for readers or writers.
- **Result interpretation:** A successful request can still leave a backlog; PASSIVE's first column is not a completeness flag.

### Piece by piece

- **wal_autocheckpoint=0** on A keeps the foreground inserts from automatically doing the maintenance we want to request explicitly.
- **B's BEGIN and count** pin the one-row snapshot. A then commits eight new rows, creating frames that cannot all be applied while B needs the older state.
- **.timeout 100** bounds the stronger modes' busy-handler wait on A.
- **wal_checkpoint(PASSIVE)** applies what it can without waiting for readers or writers. Read its three columns as **busy | log frames | checkpointed frames**; 0 with log greater than checkpointed is partial progress.
- **FULL** waits within its budget to checkpoint all frames. **RESTART** additionally waits for readers to leave the WAL so a future writer can restart it. **TRUNCATE** additionally reduces the WAL file to zero bytes on success.
- **.shell stat -c '%n %s bytes'** inspects the live WAL length. A large file can contain reusable space, so size alone is not the backlog.
- **B's COMMIT** ends the pin. Repeating FULL, RESTART and TRUNCATE should permit complete progress; successful TRUNCATE returns 0|0|0 and zero bytes.`,
      setup: code`PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS frames;
CREATE TABLE frames(id INTEGER PRIMARY KEY, note TEXT);
INSERT INTO frames(note) VALUES ('base');`,
      code: code`-- Session A
PRAGMA wal_autocheckpoint=0;

-- Session B
BEGIN;
SELECT 'reader pins snapshot', count(*) FROM frames;

-- Session A
INSERT INTO frames(note) VALUES ('frame-1'), ('frame-2'), ('frame-3'), ('frame-4'), ('frame-5'), ('frame-6'), ('frame-7'), ('frame-8');
.timeout 100
PRAGMA wal_checkpoint(PASSIVE);
PRAGMA wal_checkpoint(FULL);
PRAGMA wal_checkpoint(RESTART);
PRAGMA wal_checkpoint(TRUNCATE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal"

-- Session B
COMMIT;

-- Session A
PRAGMA wal_checkpoint(FULL);
PRAGMA wal_checkpoint(RESTART);
PRAGMA wal_checkpoint(TRUNCATE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal";`,
      expectedResult:
        "With B open, PASSIVE reports first column 0 but log > checkpointed; FULL, RESTART and TRUNCATE report busy=1 with incomplete progress. One isolated 4 KiB run gave 0|4|3 then 1|4|3. After B commits, FULL/RESTART report equal log and checkpointed counts, then TRUNCATE reports 0|0|0 and zero WAL bytes. Earlier course state can change frame counts; these relationships, not 4 and 3, are the invariant.",
      systemsLens:
        "PostgreSQL checkpoint and vacuum experience gives useful questions about writeback and retention, but SQLite's APIs expose different boundaries. Here the oldest local reader constrains safe page replacement and log reuse. Monitor reader age, checkpoint progress and WAL size together before choosing a remedy.",
      challenge:
        code`Repeat with no reader. Which modes converge to the same result, and why is PASSIVE still useful for low-latency maintenance?`,
      caution:
        code`Checkpoint results and exact sidecar sizes vary with page size and scheduling; compare the busy/log/checkpointed relationship rather than relying on one literal triple.`,
      revision: 2,
      minVersion: "3.53.4",
    },
    {
      slug: "automatic-checkpoint-cost",
      title: "See who pays for automatic checkpoints",
      difficulty: "advanced",
      tags: ["wal", "checkpoints", "synchronous", "capacity"],
      prerequisites: ["checkpoint-modes"],
      safetyLevel: "locking",
      runIn: "shell",
      sessions: 1,
      estimatedMinutes: 25,
      overview:
        "Run the same twelve commits in four fresh databases: FULL and NORMAL, each with threshold 1 and threshold 0. Comparing thresholds within one durability policy isolates checkpoint placement; comparing policies at one threshold isolates synchronization differences. Keep the writer alive so close-time cleanup cannot hide where the work occurred.",
      syntaxBreakdown: code`### In plain terms

The commit that reaches an automatic-checkpoint threshold can perform maintenance itself. That can put database-file writes and synchronization on an application's foreground path. We control checkpoint threshold and durability mode independently, because changing both at once would not tell us which caused a difference.

### What you are learning

- **Work placement:** The committing connection can also be the checkpointer.
- **Controlled comparison:** Four combinations separate threshold effects from FULL/NORMAL policy.
- **Durability boundary:** A sync system call is an engine request, not a power-cut experiment.
- **Measurement limits:** Shell-observed elapsed samples include polling overhead; WAL bytes and attributed trace ordering are the causal evidence.

### Piece by piece

- **set -eu, case, dirname, test, and mktemp -d** validate the owned lab parent and create a unique evidence directory. Nothing clears the main lab file.
- **command -v strace** and a small probe detect tracer availability. A denied ptrace policy is printed explicitly: file/row observations can continue, but the synchronization part remains unverified until run where tracing is allowed.
- **strace --kill-on-exit -qq -f -tt -yy -e trace=fsync,fdatasync,write -o FILE** traces the persistent process. --kill-on-exit terminates tracees if the tracer is killed; -qq reduces tracer chatter; -f follows children; -tt timestamps events; -yy annotates file descriptors with paths; -e selects calls; -o preserves the trace. Look for -wal versus main-database syncs between writes of READY, COMMIT-n and CHECKPOINT_DONE markers.
- **mkfifo and exec 3** keep one sqlite3 connection alive. **-bail** makes unexpected SQL errors stop it. **PRAGMA journal_mode=WAL, synchronous, and wal_autocheckpoint** are set in that very connection, not a discarded setup process.
- **printf and bounded grep polling** feed one INSERT at a time and wait for its full COMMIT-n marker. **grep -F/-x/-q** means literal, whole-line, quiet matching; **seq and sleep** bound the observer loop.
- **date +%s%N** provides nanosecond timestamps; the difference includes command delivery and polling. **stat -c %s** gives live WAL byte length after each acknowledged commit.
- **PRAGMA wal_checkpoint(FULL)** is an explicit maintenance phase after all twelve commits. The printed triple is busy | log frames | checkpointed frames; **grep -B1** selects it immediately before the marker.
- **grep -Ec** counts sync calls up to the observed checkpoint, including setup. Inspect phase markers in the trace before attributing a total to commits alone. The final count assertion requires ROWS=12.
- **trap, kill -0, kill -KILL, wait, and descriptor closure** clean up owned work on exit. The FIFO is removed while databases, logs and available traces are retained.`,
      code: code`(
set -eu
db=${"$"}{TUTOR_SQLITE_DB:-}
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
parent=$(dirname -- "$db")
[ "$parent" != / ] && [ -d "$parent" ] && [ -w "$parent" ] || { echo 'database parent must be writable' >&2; exit 2; }
trace_enabled=0
if command -v strace >/dev/null && strace -qq -o /dev/null true 2>/dev/null; then trace_enabled=1; else echo 'strace_unavailable=ptrace policy; commit/WAL evidence will still run' >&2; fi
scratch=$(mktemp -d "$parent/sqlite-auto-checkpoint.XXXXXX")
pid=0
cleanup() { if [ "$pid" -gt 0 ] && kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; printf 'evidence_retained=%s\n' "$scratch"; }
trap cleanup EXIT
run_writer() {
  mode=$1; threshold=$2; label="$mode-$threshold"; fifo="$scratch/$label.fifo"; logfile="$scratch/$label.log"; database="$scratch/$label.db"
  mkfifo "$fifo"
  if [ "$trace_enabled" -eq 1 ]; then strace -qq -f -tt -yy -e trace=fsync,fdatasync,write -o "$scratch/$label.trace" sqlite3 -bail "$database" < "$fifo" > "$logfile" 2>&1 & else sqlite3 -bail "$database" < "$fifo" > "$logfile" 2>&1 & fi
  pid=$!
  exec 3>"$fifo"
  printf '%s\n' "PRAGMA journal_mode=WAL; PRAGMA synchronous=$mode; PRAGMA wal_autocheckpoint=$threshold; DROP TABLE IF EXISTS events; CREATE TABLE events(id INTEGER PRIMARY KEY, body TEXT); SELECT 'READY';" >&3
  ready=0; for n in $(seq 1 100); do if grep -q READY "$logfile"; then ready=1; break; fi; sleep 0.02; done
  [ "$ready" -eq 1 ] || { echo "$mode readiness deadline exceeded" >&2; return 3; }
  for n in $(seq 1 12); do
    start=$(date +%s%N)
    printf "INSERT INTO events(body) VALUES ('event-%s'); SELECT 'COMMIT-%s';\n" "$n" "$n" >&3
    done=0; for poll in $(seq 1 100); do if grep -Fxq "COMMIT-$n" "$logfile"; then done=1; break; fi; sleep 0.02; done
    [ "$done" -eq 1 ] || { echo "$mode commit $n deadline exceeded" >&2; return 3; }
    end=$(date +%s%N)
    bytes=$(stat -c '%s' "$database-wal" 2>/dev/null || echo 0)
    printf '%s commit=%02d observer_elapsed_ns=%s wal_bytes=%s\n' "$label" "$n" "$((end - start))" "$bytes"
  done
  printf "PRAGMA wal_checkpoint(FULL); SELECT 'CHECKPOINT_DONE';\n" >&3
  done=0; for poll in $(seq 1 100); do if grep -q CHECKPOINT_DONE "$logfile"; then done=1; break; fi; sleep 0.02; done
  [ "$done" -eq 1 ] || { echo "$mode checkpoint deadline exceeded" >&2; return 3; }
  printf '%s checkpoint_output=' "$label"; grep -B1 CHECKPOINT_DONE "$logfile" | head -n 1
  if [ "$trace_enabled" -eq 1 ]; then printf '%s sync_calls_before_close=%s\n' "$label" "$(grep -Ec 'fsync|fdatasync' "$scratch/$label.trace" || true)"; else printf '%s sync_calls=unavailable\n' "$label"; fi
  printf "SELECT 'ROWS=' || count(*) FROM events;\n" >&3
  exec 3>&-
  wait "$pid"; pid=0
  grep -Fxq 'ROWS=12' "$logfile" || { echo 'row assertion failed' >&2; return 4; }
  printf '%s rows=12 trace=%s\n' "$label" "$scratch/$label.trace"
  rm -f "$fifo"
}
run_writer FULL 1
run_writer FULL 0
run_writer NORMAL 1
run_writer NORMAL 0
)`,
      expectedResult:
        "All four cases assert rows=12. With threshold 1 the WAL repeatedly reuses a small allocated length; with threshold 0 it grows across the twelve commits until the explicit checkpoint, under both policies. Trace-capable runs show FULL syncing the WAL for commits; NORMAL shifts ordinary WAL synchronization to checkpoint/reuse boundaries. Threshold 1 can therefore put checkpoint syncs into NORMAL's foreground path too. Exact totals include setup and depend on reuse; inspect timestamps, file paths and markers. Unavailable tracing is an explicit partial experiment, never evidence of zero sync calls.",
      systemsLens:
        "Maintenance policy changes who pays and when, not just how much work exists. SQLite can charge checkpoint work to the application thread issuing COMMIT, unlike assuming a server background worker owns it. Separate your latency budget, durability contract, reader retention and checkpoint scheduling decisions; a faster observed acknowledgment can mean a different failure promise.",
      challenge:
        "Compare threshold 1 against threshold 0 within FULL first, then within NORMAL. Use trace marker intervals to identify the explicit checkpoint phase. Predict what a long reader would prevent before combining this experiment with checkpoint-starvation.",
      caution:
        "Use a disposable local path and retain evidence. Nanosecond units do not imply nanosecond measurement precision. A process kill cannot prove power-loss durability, and a trace blocked by host policy must be rerun with tracing permitted before claiming synchronization evidence.",
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "checkpoint-starvation",
      title: "A slow reader can grow the WAL indefinitely",
      difficulty: "advanced",
      tags: ["wal", "checkpoints", "backpressure", "capacity", "snapshots"],
      prerequisites: ["automatic-checkpoint-cost"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      overview:
        "Pin a reader, append six small commits and observe partial checkpoint progress alongside growing WAL bytes. Then release only the reader and reclaim the log without deleting any committed rows. The point is to identify the resource owner that makes maintenance ineffective.",
      syntaxBreakdown: code`### In plain terms

A system can continue accepting writes while accumulating a maintenance debt it cannot pay yet. Here an old read transaction is that constraint: it needs page versions that checkpointing cannot overwrite. We use six bounded commits to demonstrate a mechanism that could otherwise keep growing.

### What you are learning

- **Retention horizon:** The oldest needed version limits safe reclamation.
- **Hidden backpressure:** Reader lifetime can consume storage even when writer latency looks healthy.
- **Diagnostic intervention:** Releasing the pin, not deleting log files, restores progress.

### Piece by piece

- **PRAGMA journal_mode=WAL and wal_autocheckpoint=0** establish explicit maintenance control. A repeats the threshold setting in the connection performing writes.
- **B's BEGIN and SELECT** pin the initial one-row snapshot. Merely opening a connection without an active read transaction would not create the same pin.
- **Six separate INSERT statements** are six autocommit transactions. PASSIVE checkpoint calls after the first and second group expose a growing log with frames still blocked by B.
- **wal_checkpoint(PASSIVE)** does not wait for B. Compare log frames with checkpointed frames rather than treating first-column 0 as complete success.
- **.shell stat -c '%n %s bytes'** records file growth while connections remain open.
- **B's COMMIT** releases the old snapshot. A's **wal_checkpoint(TRUNCATE)** can now finish and reduce the WAL to zero bytes; the current count must still be 7.
- **The challenge's alert policy** should specify an operational threshold and what action is allowed. Cancelling a long reader may be appropriate, but a WAL-size alert alone does not identify which connection owns the pin.`,
      setup: code`PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS queue;
CREATE TABLE queue(id INTEGER PRIMARY KEY, payload TEXT);
INSERT INTO queue(payload) VALUES ('anchor');`,
      code: code`-- Session B
BEGIN;
SELECT 'old reader', count(*) FROM queue;

-- Session A
PRAGMA wal_autocheckpoint=0;
INSERT INTO queue(payload) VALUES ('batch-1');
INSERT INTO queue(payload) VALUES ('batch-2');
INSERT INTO queue(payload) VALUES ('batch-3');
PRAGMA wal_checkpoint(PASSIVE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal"
INSERT INTO queue(payload) VALUES ('batch-4');
INSERT INTO queue(payload) VALUES ('batch-5');
INSERT INTO queue(payload) VALUES ('batch-6');
PRAGMA wal_checkpoint(PASSIVE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal"

-- Session B
COMMIT;

-- Session A
PRAGMA wal_checkpoint(TRUNCATE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal";
SELECT 'current rows', count(*) FROM queue;`,
      expectedResult:
        code`While B's snapshot is open, passive checkpoints report a WAL backlog and the sidecar grows after each batch. After B commits, TRUNCATE can reclaim the WAL; current rows then total 7.`,
      systemsLens:
        "The general lesson transfers to replication lag, retained queue offsets and version garbage collection: a slow observer can control reclamation. SQLite makes the ownership local and concrete. Your application's transaction lifetimes are part of its storage-capacity contract, even if its queries are read-only.",
      challenge:
        code`Set a WAL size alert and choose a policy for readers that exceed it: cancellation, restart, or allowing growth.`,
      studyCheckpoint: {
        core: [
          {
            source: "[SQLite Write-Ahead Logging](https://sqlite.org/wal.html)",
            locator:
              "§1 “Overview”; §§2–2.3 “How WAL Works”; §§3–3.3 “Activating And Configuring WAL Mode”; §9 “Sometimes Queries Return SQLITE_BUSY In WAL Mode”; omit the struck-through pre-3.11 warning and §11 bug mechanics",
          },
        ],
        optionalDepth: [
          {
            source: "[SQLite Database File Format](https://sqlite.org/fileformat.html)",
            locator:
              "Section 4, especially 4.3–4.6 (checkpointing, reset and reuse, the reader algorithm, and the WAL-index)",
          },
        ],
        rationale:
          "You just saw a live reader hold back checkpoint progress while committed writes enlarged the WAL sidecar. Read these bounded sections before continuing to connect that evidence to WAL append and commit records, reader end-marks, checkpointing, reuse, and the fact that WAL still has busy cases and one writer. The 3.53.4 course minimum includes the WAL-reset fix; older SQLite 3.7.0–3.51.2 installations should use 3.51.3+ or an official fixed backport for production.",
      },
      caution:
        code`WAL is same-host coordination, not replication or consensus; do not place the files on NFS, SMB, or a synchronized cloud directory.`,
      revision: 1,
      minVersion: "3.53.4",
    },
  ],
};
