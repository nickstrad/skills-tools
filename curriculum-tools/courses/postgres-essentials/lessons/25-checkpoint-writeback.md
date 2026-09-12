# A checkpoint writes pages without ending transactions

slug: checkpoint-writeback
category: durability-and-recovery
difficulty: intermediate
tags: write-ahead-log, checkpoints, buffer-cache, transactions
prerequisites: wal-per-useful-write
safety: privileged
run-in: shell
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Run a supplied controller that updates a bounded table inside an open transaction, then checkpoints from another connection. Relation-specific dirty buffers fall while the writer stays open and its uncommitted value remains private. This distinguishes writing shared pages from deciding a transaction's visible outcome.

## Syntax breakdown
### In plain terms
A dirty buffer is a shared-memory page whose current contents have not yet been written to its
relation file. The experiment keeps an UPDATE transaction open, so its own connection sees
“pending” while another connection sees the committed value “original.” A CHECKPOINT writes the
dirty relation pages and lowers their dirty count, but it neither commits the writer nor exposes
its tentative version.

Use all three observations—dirty-buffer count, backend state, and external value—to distinguish
page writeback from transaction completion while the writer remains open.

### Mechanism map

```text
A checkpoint changes page persistence, not transaction visibility

Writer transaction       Shared buffers / storage       Other connection
  UPDATE pending ------> dirty relation pages
  sees pending                                          sees original
                           |
Other connection: CHECKPOINT
                           v
                       pages written; dirty count falls
  transaction stays open                               still sees original
  ROLLBACK -------------------------------------------> sees original

Writing a page does not commit the transaction that changed it. WAL and MVCC preserve the boundary.
```

### Terminals and cleanup
Run this lesson in one shell, outside psql. The supplied controller creates a private cluster and
opens its own bounded database connections. On normal exit, check its printed owned cluster removal record; on Ctrl-C, wait for cleanup
to finish before rerunning. If you reach the fifteen-minute core limit or get stuck, press Ctrl-C
and check that the owned resource is removed before trying again.
### What you are learning
- A checkpoint advances PostgreSQL's recovery boundary by writing dirty buffers after the required
  WAL. It is a storage event, not a transaction-outcome command.
- MVCC visibility follows transaction status. Another connection continues to see the earlier
  committed row version even after a page containing the tentative version has been written.
- Dirty-buffer counts are transient measurements. Scoping pg_buffercache to one relation in a quiet
  private cluster makes the direction useful without turning one count into a universal constant.
- Page write-back and logical commit are independent decisions joined by WAL ordering and recovery.

### Piece by piece
- **cd /root/Software/skills-tools/curriculum-tools** enters the course engine so the relative
  controller path resolves.
- **python3 courses/postgres-essentials/lab/checkpoint.py** starts the supplied bounded controller.
  It finds PostgreSQL 16 programs through pg_config, allocates its own directory and free port,
  initializes local trust authentication on a unique Unix socket, verifies data_directory, and
  prints the actual fixture path. It refuses to start unless /tmp has 2 GiB free.
- **pg_config --bindir** locates the matching server programs. **initdb -D /tmp/pe-checkpoint-…/data
  -U postgres --auth-local=trust --auth-host=reject --no-locale** initializes only the printed
  directory, creates the postgres database role, permits local-socket access, rejects TCP access,
  and uses locale-independent output. Root uses **runuser -u postgres --** because initdb refuses
  root; a normal user runs the same programs directly.
- **pg_ctl -D … -l … -w -t 15 start/stop** controls the exact data directory, sends server output
  to its private log, waits for completion, and limits that wait to 15 seconds. Cleanup closes every
  psql process, confirms the postmaster PID file is gone, and only then removes the printed path.
- **psql -X -Atq -v ON_ERROR_STOP=1** ignores user startup files, emits unaligned tuples only,
  suppresses routine chatter, and stops on SQL errors. Inherited PG* variables are discarded;
  three- and five-second connection, statement, and lock limits fence failures.
- **shared_buffers=16MB** bounds the fixture's shared page cache. **max_connections=10** bounds
  backend memory and is enough for the held writer plus observer connections.
- **bgwriter_lru_maxpages=0** prevents the background writer from cleaning the evidence before it
  is counted. **checkpoint_timeout=1h** prevents an automatic checkpoint during the short trial.
  These are fixture controls, not production recommendations.
- **CREATE EXTENSION pg_buffercache** exposes one row per shared buffer. The controller joins it to
  pg_class by relation file number and filters the main fork of checkpoint_demo, so
  relation dirty buffers counts only dirty heap pages for this experiment's table.
- **BEGIN / UPDATE checkpoint_demo / ROLLBACK** keeps the changed row versions tentative, then
  explicitly abandons them after the observation. The writer's own SELECT reports pending; fresh
  connections report original before and after CHECKPOINT.
- **pg_backend_pid() / pg_stat_activity.state = idle in transaction** identifies the exact writer
  backend and proves that same PID remains connected with an open transaction. Filtered counts
  prove all 12,000 rows are pending to the writer and all are original to the observer.
- **CHECKPOINT** requests an immediate checkpoint from a separate connection. Compare the named
  relation's dirty-buffer count before and after; the second must be lower, while visibility and
  writer state stay unchanged.
- **fixture footprint bytes / budget bytes** measures regular files before teardown. The controller
  fails if its private fixture reaches 200,000,000 bytes.
- **--finish commit** changes only the final decision in the optional variation. It commits the
  already checkpointed tentative update, so a fresh connection then reads pending.

## Caution
Run this from a shell on a host with PostgreSQL 16 server binaries. The controller never accepts a data-directory or endpoint argument: it creates a unique /tmp/pe-checkpoint-* cluster, disables background-writer page cleaning only there, and removes it in cleanup. As root it runs PostgreSQL as the postgres OS user; as a normal user it runs under that user. A missing cleanup line means you should check for that exact printed fixture prefix before rerunning.

## Setup
```sh
cd /root/Software/skills-tools/curriculum-tools
```

## Run
```sh
python3 courses/postgres-essentials/lab/checkpoint.py
```

## Expected result
The fixture identifies itself as a private PostgreSQL 16 cluster. Before CHECKPOINT, the writer
reads pending, another connection reads original, the relation-specific dirty-buffer count is
greater than zero, and the writer state is idle in transaction.

After CHECKPOINT, the relation-specific dirty-buffer count is lower (normally zero in this quiet
fixture). The writer still reports idle in transaction and the other connection still reads
original. ROLLBACK leaves final committed value = original. The measured fixture footprint remains
below 200000000 bytes, then cleanup reports "cluster stopped and removed". The unique directory,
port and exact dirty-buffer count vary between runs.

## Systems lens
Physical write-back and logical transaction outcome are separate state transitions. PostgreSQL may write a page containing tuples from an uncommitted transaction because WAL protects the physical change and MVCC consults transaction status before exposing it. Checkpoints bound crash recovery work; they do not force active transactions to commit or make private data public. Similar systems separate flushing cached blocks from publishing a transaction or manifest.

## Optional variation
Optional, outside the core time budget: compare the final externally visible value when the writer commits after the checkpoint. Run:

```sh
cd /root/Software/skills-tools/curriculum-tools
python3 courses/postgres-essentials/lab/checkpoint.py --finish commit
```

The same pre-commit observations hold: dirty buffers decrease, the transaction remains open, and the observer sees 12,000 original rows. Only the final decision changes; after COMMIT it sees 12,000 pending rows. Cleanup and the 200 MB budget check still apply.
