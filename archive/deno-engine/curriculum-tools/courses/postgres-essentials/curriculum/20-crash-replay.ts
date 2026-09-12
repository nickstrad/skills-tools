import { code, type Module } from "../../../src/types.ts";

export const CRASH_REPLAY: Module = {
  category: "durability-recovery",
  title: "Recover transaction outcomes after process failure",
  lessons: [{
    slug: "crash-replay",
    title: "Reconcile committed and aborted work after a crash",
    difficulty: "intermediate",
    prerequisites: ["checkpoint-writeback"],
    tags: ["wal", "recovery", "transactions", "durability"],
    estimatedMinutes: 25,
    revision: 1,
    sessions: 1,
    safetyLevel: "dangerous",
    runIn: "shell",
    overview:
      "Run a supplied controller that creates a small private PostgreSQL server, performs committed, aborted and unfinished writes, then stops that server immediately. Inspect its restart log alongside fresh queries to connect WAL replay with transaction visibility. The controller creates and removes the entire fixture within this experiment.",
    caution:
      "Use one shell terminal. Python 3 and PostgreSQL 16 server tools must be installed; root runs the private server as the postgres operating-system user, while a normal user owns it directly. The controller deliberately crashes only its newly allocated /tmp/pe-crash-* cluster, ignores inherited PostgreSQL connection variables and accepts no existing target path. Allow roughly 100 MB of disposable disk space and keep 2 GiB free. Ctrl-C runs cleanup; check for the owned cluster removed record before rerunning. A STOP or missing cleanup record needs investigation. This process failure leaves the host and storage running.",
    syntaxBreakdown: code`
### In plain terms
WAL, the write-ahead log, records changes before changed data pages need to reach their final files.
Recovery replays logged work from an earlier checkpoint after an unclean server stop. Transaction
outcome is a separate part of the story: a replayed version is not automatically a committed version
that a new reader may see. Predict the recovered values of the three business rows before running.

### Mechanism map

${"```text"}
Owned private PostgreSQL server; the learner server keeps running

baseline CHECKPOINT --> logged changes --> immediate stop --> restart / WAL redo
                           |                                     |
row 1: COMMIT 110 ----------+----------------------------------> 110
row 2: UPDATE 900, ROLLBACK +----------------------------------> 100
row 3: UPDATE 700, left open+----------------------------------> 100
row 4: COMMIT flush marker 1+----------------------------------> 1

The marker flushes earlier WAL, including the unfinished update.
Replaying a change does not make its transaction committed or visible.
${"```"}

### Terminals and cleanup
Run this lesson in one shell. The supplied client opens its own bounded database connections; keep
the coaching terminal separate from that shell. It uses the learner lab unless the lesson says it
creates a private cluster. On normal exit, check the printed the controller's owned cluster removal record; on Ctrl-C, wait for cleanup
to finish before rerunning. If you reach the fifteen-minute core limit or get stuck, press Ctrl-C
and check that the owned resource is removed before trying again.
### What you are learning
- A checkpoint is a recovery starting point, not the most recent committed transaction. Writes
  committed after the baseline checkpoint can survive through their flushed WAL.
- The WAL stream can contain changes from aborted and still-open transactions. Recovery and MVCC
  visibility preserve transaction outcomes rather than publishing every change in the stream.
- A fresh connection's row inventory proves visible outcomes; the restart log independently proves
  that PostgreSQL entered crash recovery and performed redo, meaning replay of logged changes.
- A server-process crash on a running host tests a different failure boundary from losing power,
  losing a storage device or restoring a backup. The same-host result cannot prove those guarantees.

### Piece by piece
- **cd /root/Software/skills-tools/curriculum-tools** enters the engine directory so the supplied
  controller path resolves. Setup and experiment run in the same shell.
- **python3 courses/postgres-essentials/lab/crash.py** runs the complete supplied experiment without
  extra Python packages. It prints labelled JSON records; read each phase and its inventory rather
  than treating successful exit alone as evidence.
- **pg_config --bindir** locates matching server binaries. **initdb -D** creates the newly allocated
  data directory. **-U postgres** names the database superuser, **--auth-local=trust** permits local
  connections inside the private owner-only socket directory, **--auth-host=reject** rejects TCP
  authentication, **--no-locale** fixes output locale and **--wal-segsize=1** bounds WAL file size.
  **runuser -u postgres --** switches only root's server commands to a non-root operating-system
  account, because PostgreSQL refuses to run as root. A regular user needs no account switching.
- **listen_addresses=''** disables TCP listening. The unique socket path isolates this server;
  the fixed private port is a socket filename within that directory. **shared_buffers=16MB** and
  **max_connections=10** bound the small fixture. **checkpoint_timeout='1h'** and
  **max_wal_size='64MB'** avoid an automatic checkpoint during the tiny workload; the controller
  verifies that no checkpoint intervened. **min_wal_size='2MB'** limits retained idle WAL.
  **autovacuum=off** removes background maintenance only in this disposable server.
- **fsync=on, full_page_writes=on, synchronous_commit=on** keep normal durability protections.
  A successful local commit waits for its commit WAL to be flushed. This assumes the operating
  system and storage honor the flush request; this lesson does not test hardware behavior.
- **psql -X -Atq -v ON_ERROR_STOP=1** supplies persistent database connections. **-X** ignores startup
  files, **-A** uses unaligned output, **-t** removes table headings, **-q** suppresses command tags,
  and **-v ON_ERROR_STOP=1** stops on unexpected SQL errors. Five-second **statement_timeout** and
  three-second **lock_timeout** bound statements; client responses also have a ten-second limit.
- **CHECKPOINT** writes the baseline before the experiment's updates. **pg_control_checkpoint()**
  returns checkpoint metadata; equal **checkpoint_lsn** values before and after the writes establish
  that the recovery starting point did not move. An LSN is a byte position in the WAL stream.
- **BEGIN / UPDATE / COMMIT / ROLLBACK** create three distinct outcomes. Row 1 commits value 110;
  row 2 tries 900 and rolls back; a second connection changes row 3 to 700 and leaves its transaction
  open. That connection's own SELECT reads 700, while the observer still reads committed value 100.
- **Row 4, the flush marker**, is an additional synchronous committed update to value 1 after the
  unfinished update. Flushing through this later commit also flushes earlier WAL, including the
  unfinished change. Thus missing row-3 visibility after recovery cannot be explained simply as
  that change never having reached flushed WAL. The marker is instrumentation, not an application
  idempotency protocol.
- **pg_current_wal_insert_lsn() / pg_current_wal_flush_lsn()** report the current inserted and
  flushed stream positions. **json_agg(json_build_array(id,value) ORDER BY id)** prints a stable
  ordered inventory so the before/after comparison checks every row, not just a row count.
- **pg_ctl -D ... -m immediate -w -t 15 stop** aborts the owned server without a clean shutdown.
  **-D** is the exact allocated directory, **-m immediate** selects unclean stop, **-w** waits for
  completion and **-t 15** bounds that wait. The still-open client loses its server connection.
- **pg_ctl -D ... -l ... -w -t 15 start** restarts that same directory, appending logs to the
  **-l** file. **logging_collector=off** leaves output in that file; **log_checkpoints=on** includes
  checkpoint events. Only the newly appended restart portion is inspected, so old messages cannot
  masquerade as current recovery evidence.
- **database system was interrupted / redo starts at / redo done at** identify an unclean previous
  run and actual WAL replay. **phase=recovered** then records an independent query's visible state.
- **--mode clean**, the optional comparison, rolls back the open transaction and uses a fast clean
  stop. It produces the same inventory without crash redo. Normal cleanup also uses **-m fast**,
  checks that the server stopped and removes only this invocation's newly allocated directory.
`,
    setup: code`cd /root/Software/skills-tools/curriculum-tools`,
    code: code`python3 courses/postgres-essentials/lab/crash.py`,
    expectedResult: code`
The baseline inventory is [[1,100],[2,100],[3,100],[4,0]]. Before the immediate stop, the pending
connection reports pending_private_value=700; the independent committed_inventory is
[[1,110],[2,100],[3,100],[4,1]]. checkpoint_unchanged is true, and the later synchronous marker
commit has flushed preceding WAL.

Restart logs contain database system was interrupted, redo starts at and redo done at. Their
positions and timestamps vary. The fresh recovered inventory is exactly
[[1,110],[2,100],[3,100],[4,1]], with committed_survived=true, aborted_visible=false,
interrupted_visible=false, crash_recovery=true and redo=true. The aborted 900 and interrupted 700
never become visible. The controller exits successfully after cleanup="owned cluster removed"
and removed=true. The unique temporary path varies on each run.
`,
    systemsLens:
      "Recovery reconstructs database state from logged changes and transaction outcomes. It is not a list of application operations to blindly repeat, and an unfinished transaction's logged changes do not authorize publishing its result. The committed update survives beyond the checkpoint through durable WAL; MVCC and transaction status keep aborted or incomplete work invisible. Inspect both recovery-path evidence and application-visible invariants when verifying recovery. The clean-stop variation also shows why correct final rows alone cannot prove that crash recovery was exercised. This is one PostgreSQL process-failure experiment, with no claim about power loss, backup restoration, replication or external effects.",
    challenge:
      "Optional clean-shutdown comparison, independently runnable from any shell:\n\n```sh\ncd /root/Software/skills-tools/curriculum-tools\npython3 courses/postgres-essentials/lab/crash.py --mode clean\n```\n\nThe same writes occur, then the unfinished transaction is explicitly rolled back before a clean stop. Expect the same recovered inventory, a database system was shut down log line, crash_recovery=false and redo=false. Both runs remove their owned clusters. Equal rows do not imply equal recovery paths.",
  }],
};
