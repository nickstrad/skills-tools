import { code, type Module } from "../../../src/types.ts";
import { COMMIT_WORKLOAD } from "./commit-workload.ts";
import { WAL_RECORDS } from "./wal-records.ts";
import { WAL_PAGE_IMAGES } from "./wal-page-images.ts";
import { ARCHIVE_PRUNING_REMINDER } from "./archive-reminder.ts";

export const WAL: Module = {
  category: "wal",
  title: "The write-ahead log: records, durability, crash redo",
  lessons: [
    WAL_RECORDS,
    WAL_PAGE_IMAGES,

    COMMIT_WORKLOAD,

    {
      slug: "wal-files-and-recycling",
      tags: ["wal", "backup", "durability", "capacity"],
      title: "Segments, recycling, and the archive",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "mixed",
      estimatedMinutes: 15,
      prerequisites: ["every-change-is-a-wal-record"],
      overview: code`
The infinite log lives in finite 16 MB files. In this lesson you look at pg_wal as a directory:
which file the current LSN is in, how the file name is derived from the LSN, how many files exist
compared to max_wal_size, and why files with names in the FUTURE are already sitting there. Then
you force a segment switch and watch the archiver copy the finished segment off the data
directory, which is the moment WAL stops being a crash-recovery detail and becomes a backup.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "WAL Structure", "WAL Setup")`,
      readingNotes: code`
Chapter 10 describes finite WAL segments, their naming, and setup and monitoring choices. This lesson
walks the segment directory and observes archiving, extending local WAL into the backup boundary.`,
      caution: ARCHIVE_PRUNING_REMINDER,
      syntaxBreakdown: code`
### In plain terms

This experiment turns the infinite WAL stream into the finite files you can inspect on disk. You map
an LSN to a segment, observe preallocated and recycled files, then seal a segment and watch the
archiver copy it. Those files determine whether recovery and backups can obtain the history they need.

### What you are learning

- **WAL segments:** Fixed-size files hold consecutive portions of the log.
- **Recycling:** PostgreSQL renames old segments for future use instead of repeatedly allocating files.
- **Archiving:** A completed segment copied elsewhere is the durable input for backup and recovery.

### Piece by piece

- **pg_settings** (system view). What it is: a view of active PostgreSQL configuration values.
  - What it does here: It reports segment size, retention targets, archive mode, WAL level, and sync method.
  - What it gives us: The **setting** and **unit** columns explain later file counts and archive behavior.
- **wal_segment_size** (setting). What it is: the fixed byte size of each WAL segment.
  - What it does here: The query establishes the 16 MB file size used by the lab.
  - What it gives us: A known unit for interpreting **pg_wal** space and LSN offsets.
- **min_wal_size**, **max_wal_size**, and **wal_keep_size** (settings). What they are: lower preallocation, checkpoint target, and retention controls.
  - What it does here: The settings query supplies the context for recycled and retained files.
  - What it gives us: Values to compare with the actual directory size; max_wal_size is not a hard cap.
- **pg_walfile_name()** and **pg_walfile_name_offset()** (SQL functions). What they are: LSN-to-file mapping functions.
  - What it does here: It map the current LSN to a 24-character segment name and offset.
  - What it gives us: The **segment_and_offset** output shows timeline, segment number, and byte position.
- **pg_ls_waldir()**, **count**, **sum**, and **pg_size_pretty** (directory function and aggregates). What they are: SQL tools for listing and summarizing WAL files.
  - What it does here: It counts files, totals their sizes, and compares names before and after recycling.
  - What it gives us: **segments**, **bytes_in_pg_wal**, **future_recycled**, and **already_written** evidence.
- **\! ls**, **wc -l**, and **tail** (psql shell escapes). What they are: filesystem listing, counting, and tailing commands.
  - What it does here: It inspects actual pg_wal and archive files; **$PGLAB** supplies the lab path.
  - What it gives us: File names and archive count that corroborate SQL directory output.
- **pg_switch_wal()** (SQL function). What it is: a request to finish the current WAL segment early.
  - What it does here: It seals the segment containing the returned **switched_at** LSN.
  - What it gives us: The next segment name changes after the following INSERT, proving the boundary.
- **pg_stat_archiver** and **\watch i=2 c=2** (view and psql command). What they are: archive counters and a bounded repeated query.
  - What it does here: It sample archive progress twice, two seconds apart.
  - What it gives us: **last_archived_wal**, **archived_count**, and **failed_count** show success or lag; **i=2** is the interval and **c=2** the run count.`,
      setup: code`
drop table if exists wal_orders;
create table wal_orders(id int primary key, customer text, amount numeric)
  with (autovacuum_enabled = off);
insert into wal_orders select g, 'cust-' || g, g * 1.5 from generate_series(1,100) g;`,
      code: code`
select name, setting, unit from pg_settings
where name in ('wal_segment_size','min_wal_size','max_wal_size','wal_keep_size',
               'archive_mode','wal_level','wal_sync_method')
order by name;

-- The LSN is an offset; the file name is that offset, chopped up.
select pg_current_wal_lsn() as lsn,
       pg_walfile_name(pg_current_wal_lsn()) as segment,
       pg_walfile_name_offset(pg_current_wal_lsn()) as segment_and_offset;

-- pg_wal as a directory: how many files, how much space.
select count(*) as segments, pg_size_pretty(sum(size)) as bytes_in_pg_wal
from pg_ls_waldir();

-- Files whose names sort AFTER the current segment have not been written yet:
-- they are old segments renamed for future use.
select pg_walfile_name(pg_current_wal_lsn()) as current_segment,
       count(*) filter (where name > pg_walfile_name(pg_current_wal_lsn())) as future_recycled,
       count(*) filter (where name <= pg_walfile_name(pg_current_wal_lsn())) as already_written
from pg_ls_waldir();

\! ls -1 $PGLAB/primary/pg_wal | head -5
\! ls -1 $PGLAB/archive | wc -l

-- Force the current segment to end. Everything up to here is now archivable.
select pg_switch_wal() as switched_at;
select pg_walfile_name(pg_current_wal_lsn()) as name_of_lsn_after_switch;
-- (that is the segment we just finished: an LSN on a boundary names the previous file)

-- Write one row so the new segment is genuinely in use, then look again.
insert into wal_orders values (3001, 'after-switch', 1.00);
select pg_walfile_name(pg_current_wal_lsn()) as now_really_the_new_segment;

-- The archiver runs in the background; give it a moment and watch it catch up.
select last_archived_wal, last_archived_time, archived_count, failed_count
from pg_stat_archiver \watch i=2 c=2

\! ls -1 $PGLAB/archive | tail -3`,
      expectedResult: code`
wal_segment_size is 16777216 B, min_wal_size 80 MB, max_wal_size 1024 MB, wal_keep_size 0,
archive_mode on, wal_level logical, wal_sync_method fdatasync.

The LSN and the file name are the same number. With lsn = 0/88785E58 the segment is
000000010000000000000088 and the offset pair is (000000010000000000000088, 7888472): timeline 1,
high half 00000000, segment 0x88 = the 137th 16 MB chunk since the cluster was created, and
7888472 = 0x785E58 bytes into it.

pg_wal holds 19 segments = 304 MB, under max_wal_size. Of those, 18 sort AFTER the current
segment and only 1 (the current one) does not:

  current_segment          | future_recycled | already_written
  000000010000000000000088 |              18 |               1

PostgreSQL does not delete a finished segment, it renames it to the next name it will need and
keeps the 16 MB allocated. That is why "ls -l" on pg_wal shows files with old modification times
and future names, and why pg_wal does not shrink back to nothing when the system goes idle.

pg_switch_wal() returns something like 0/88787CE0. Right after the switch,
pg_walfile_name(pg_current_wal_lsn()) still prints 000000010000000000000088 -- the boundary rule
from the syntax notes -- and only after the INSERT does it move to 000000010000000000000089.

The two \watch iterations catch the archiver in the act. Two seconds apart:

  000000010000000000000087 | 2026-09-03 01:06:23 | archived_count 5 | failed_count 0
  000000010000000000000088 | 2026-09-03 01:23:33 | archived_count 6 | failed_count 0

last_archived_wal advances to the segment pg_switch_wal() just sealed, archived_count goes up by
one, failed_count stays 0, and the file appears in $PGLAB/archive (135 files at this point, since
nothing in this lab ever deletes them -- exactly the disk-space bomb module 15 lets you set off).
archived_count is small because pg_stat_archiver's counters reset when the cluster restarted in
the crash lesson; the file count in the directory is the cumulative number.`,
      systemsLens: code`
Two ideas worth carrying out of this directory listing. First, preallocation and recycling: the
cost of a WAL write should not include allocating a file or extending it, so the system keeps a
pool of correctly-sized files and renames them in a circle. Any latency-sensitive append-only
system ends up doing this (Kafka preallocates segments, etcd preallocates WAL files), because
filesystem metadata operations are the unpredictable part of a write.

Second, the archive is where the log stops being a crash-recovery mechanism and becomes a
durability boundary you can reason about. Local WAL survives a process crash; archived WAL
survives the machine. Everything downstream -- point-in-time recovery, rebuilding a replica,
restoring after a bad migration -- depends on segments being sealed and shipped, so archiver lag
is a real availability metric, and an archive_command that fails silently is one of the classic
ways to discover you have no backups at the worst possible moment.`,
      challenge: code`
Work out how much disk pg_wal can consume in the worst case: it is not max_wal_size. Look at
wal_keep_size, at any rows in pg_replication_slots (restart_lsn pins everything after it), and at
what happens if archive_command starts failing. Which of the three has no upper bound?`,
    },

    {
      slug: "crash-and-redo",
      tags: ["wal", "recovery", "durability", "transactions"],
      title: "Kill the server: redo, and what survives a crash",
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "mixed",
      sessions: 2,
      estimatedMinutes: 25,
      prerequisites: [
        "every-change-is-a-wal-record",
        "commit-visibility-and-clog",
      ],
      overview: code`
Now cash the promise. You commit rows, leave a second transaction uncommitted, and then kill the
server with SIGQUIT -- no shutdown checkpoint, dirty pages still in shared buffers, WAL flushed
only as far as the last commit. On restart the server notices it was not shut down cleanly, finds
the last checkpoint's redo point in pg_control, and replays every record from there. Committed
rows come back. The uncommitted row also comes back physically -- its INSERT record was in the WAL
and redo does not care about commit status -- but it is invisible forever, because no COMMIT
record for its xid was ever replayed. That distinction is the whole of ARIES-style recovery in one
experiment.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "Checkpoint", "Recovery")`,
      readingNotes: code`
Chapter 10 explains checkpoints and redo from the last safe starting point. This lesson deliberately
crashes the lab and matches pg_control, heap-page evidence, and recovery-log messages to that model.`,
      syntaxBreakdown: code`
### In plain terms

This experiment commits rows, leaves another transaction open, and forcibly stops the lab server.
After restart, PostgreSQL replays WAL: committed rows become visible, while an uncommitted tuple may
exist physically but remains invisible. It demonstrates why recovery needs the log and a checkpoint.

### What you are learning

- **Crash recovery:** Redo reapplies WAL from the checkpoint's redo location.
- **Commit visibility:** A row needs a replayed commit record to be visible to snapshots.
- **Physical versus logical state:** An aborted tuple can remain on a page for later cleanup.

### Piece by piece

- **pg_ctl -D DIR stop -m immediate** (server-control command). What it is: a command that stops a cluster.
  - What it does here: **-D** selects the lab and **-m immediate** kills processes without a shutdown checkpoint.
  - What it gives us: Lost psql connections and an unclean state, which starts crash recovery on restart.
- **pg_controldata -D DIR** (control-file reader). What it is: a tool that reads pg_control while stopped.
  - What it does here: It inspects the cluster after the simulated crash.
  - What it gives us: **cluster state** and **REDO location** prove the stop and identify replay's start.
- **pg_ctl ... start -w** (server-control command). What it is: the restart operation.
  - What it does here: **-w** waits for readiness and **-l** writes startup output to a log.
  - What it gives us: A running server and recovery messages for the replay range.
- **grep -E** and **tail** (shell filters). What they are: pattern selection and last-line filters.
  - What it does here: It isolate redo start and redo done messages.
  - What it gives us: Replay LSNs and elapsed time for estimating recovery work.
- **pg_control_checkpoint()** (SQL function). What it is: a function exposing checkpoint metadata.
  - What it does here: It reports checkpoint and redo LSNs before and after the crash.
  - What it gives us: Evidence that end-of-recovery creates a fresh checkpoint.
- **heap_page_items(get_raw_page(...))** (pageinspect functions). What they are: raw-page and tuple-header readers.
  - What it does here: It inspects the abandoned INSERT after redo restores its bytes.
  - What it gives us: **t_xmin** and **HEAP_XMIN_INVALID** distinguish a physical ghost from visible rows.
- **pg_relation_size()/8192**, **generate_series**, **LATERAL**, **ORDER BY**, and **LIMIT** (SQL expressions and clauses). What they are: tools for enumerating heap blocks and selecting line pointers.
  - What it does here: It generates block numbers, inspects each block, and returns four recent items.
  - What it gives us: Physical page evidence rather than a normal SELECT result.`,
      caution: code`
This lesson deliberately crashes the lab cluster. Only ever run it against $PGLAB, never against a
cluster you care about, and never against a packaged system cluster on port 5432. Both psql
sessions WILL lose their connections; that is part of the experiment.`,
      setup: code`
drop table if exists wal_crash;
create table wal_crash(id int primary key, note text);
insert into wal_crash select g, 'committed-' || g from generate_series(1,1000) g;`,
      code: code`
-- Session A: establish what is durable, then open a transaction and abandon it.
select count(*) as committed_rows from wal_crash;
select pg_current_wal_lsn() as lsn_after_commit;
select checkpoint_lsn, redo_lsn from pg_control_checkpoint();

begin;
insert into wal_crash values (99999, 'uncommitted, will vanish');
select count(*) as visible_inside_this_txn from wal_crash;
-- STOP HERE. Do not commit, do not quit psql. Leave this session sitting in its
-- open transaction and switch to Session B.

-- Session B: one committed row from a second session. Its commit fsyncs every
-- WAL byte written so far -- including Session A's uncommitted INSERT record,
-- which would otherwise still be sitting in a memory buffer when the server
-- dies, leaving redo nothing to restore.
insert into wal_crash values (99998, 'flusher-committed');
select pg_current_wal_flush_lsn() as everything_up_to_here_is_durable;

-- ==========================================================================
-- SHELL, in another terminal, as the postgres OS user. Run these by hand: no
-- lesson runner can follow the server across a restart.
--
--   export PATH=/usr/lib/postgresql/16/bin:$PATH PGLAB=$HOME/pglab
--
--   pg_ctl -D "$PGLAB/primary" stop -m immediate
--   pg_controldata -D "$PGLAB/primary" | head -8
--   pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start -w
--   grep -E 'interrupted|not properly|redo |invalid record' \
--        "$PGLAB/primary/log/postgresql.log" | tail -5
--
-- ==========================================================================

-- Session B: reconnect after the restart. Both old connections are gone.
select count(*) as rows_after_crash from wal_crash;
select count(*) as ghost_row_visible from wal_crash where id = 99999;

-- Recovery ended with a checkpoint, so the redo point is now "here".
select checkpoint_lsn, redo_lsn from pg_control_checkpoint();

-- The abandoned row IS on the page. Redo replayed its INSERT record; nothing
-- ever replayed a COMMIT for its xid, so no snapshot will accept it.
select blk, lp, t_xmin,
       heap_tuple_infomask_flags(t_infomask, t_infomask2) as flags
from generate_series(0, (pg_relation_size('wal_crash')/8192 - 1)::int) blk,
     lateral heap_page_items(get_raw_page('wal_crash', blk))
order by blk desc, lp desc limit 4;`,
      expectedResult: code`
Before the crash: 1000 committed rows, pg_current_wal_lsn() around 0/8A7C1530, and
pg_control_checkpoint() showing checkpoint_lsn 0/8A7C1530 with redo_lsn 0/8A7C1530 -- note that on
a busy cluster the redo point is usually far BEHIND the current LSN, and everything in between is
work that exists only in the log. Inside the open transaction, count(*) is 1001. Session B's
insert commits normally and pg_current_wal_flush_lsn() returns 0/8A8221F0.

The moment pg_ctl stop -m immediate runs, both psql sessions print:

  WARNING:  terminating connection due to immediate shutdown command
  server closed the connection unexpectedly
  psql: error: connection to server was lost

pg_controldata on the stopped cluster is the evidence that this was not a clean shutdown:

  Database cluster state:               in production
  Latest checkpoint location:           0/8A7C1530
  Latest checkpoint's REDO location:    0/8A7C1530

("in production" on a server that is not running means "nobody wrote a shutdown checkpoint".)

Restart takes a few seconds and the server log tells the whole story:

  LOG:  database system was interrupted; last known up at 2026-09-03 01:27:05 UTC
  LOG:  database system was not properly shut down; automatic recovery in progress
  LOG:  redo starts at 0/8A7C15A8
  LOG:  invalid record length at 0/8A8221F0: expected at least 24, got 0
  LOG:  redo done at 0/8A8221C0 system usage: CPU: user: 0.00 s, system: 0.00 s, elapsed: 0.00 s
  LOG:  checkpoint starting: end-of-recovery immediate wait
  LOG:  database system is ready to accept connections

redo starts at the REDO location pg_controldata printed and ends where the log ran out --
"invalid record length ... got 0" is not an error, it is how replay discovers the end of the
stream, and note that it stops at exactly the flush LSN Session B reported (0/8A8221F0). Anything
written after that point was still in memory and is simply gone. In an earlier run with more
pre-crash activity the same three lines read "redo starts at 0/8131CC88 ... redo done at
0/83055E30", 30 MB replayed in 0.31 s, with an end-of-recovery checkpoint writing 3053 buffers.

Session B, after reconnecting:

  rows_after_crash  = 1001     <- 1000 committed + Session B's flusher row
  ghost_row_visible = 0        <- the abandoned row is not among them
  checkpoint_lsn = 0/8A8221F0, redo_lsn = 0/8A8221F0   <- redo point caught up

and the last page of the heap still contains the abandoned tuple:

  blk | lp | t_xmin | flags
    6 | 59 |  84397 | {HEAP_HASVARWIDTH,HEAP_XMIN_COMMITTED,HEAP_XMAX_INVALID}
    6 | 58 |  84396 | {HEAP_HASVARWIDTH,HEAP_XMIN_INVALID,HEAP_XMAX_INVALID}
    6 | 57 |  84395 | {HEAP_HASVARWIDTH,HEAP_XMIN_COMMITTED,HEAP_XMAX_INVALID}
    6 | 56 |  84395 | {HEAP_HASVARWIDTH,HEAP_XMIN_COMMITTED,HEAP_XMAX_INVALID}

Line pointer 58, xid 84396, is the ghost: same page, same shape as its neighbours, sitting between
the last committed row (84395) and Session B's flusher (84397), but flagged XMIN_INVALID rather
than XMIN_COMMITTED. (It reads INVALID rather than blank because the count(*) above already
consulted the commit log, found the xid aborted, and cached that as a hint bit.) Redo restored the
bytes; visibility rejected them.`,
      systemsLens: code`
Commit means "the log is durable", not "the data files are durable". The heap pages for those
1000 rows were still dirty in shared buffers when the process died, and that was fine -- the WAL
already described them, so redo rebuilt them. This is the entire reason a log exists: it converts
many expensive random page writes into one cheap sequential append, and defers the random writes
to a checkpoint that can batch and reorder them.

Recovery here is redo-only, which is worth contrasting with textbook ARIES. There is no undo pass,
because PostgreSQL never overwrites a row in place: an uncommitted change is just a tuple version
whose xid is not marked committed, so "undo" costs nothing at recovery time and is paid later by
VACUUM instead. Systems that update in place (InnoDB, most non-MVCC engines) must run an undo pass
and keep undo logs; PostgreSQL trades that for bloat. Same invariant, different bill.

Finally, note what recovery time depends on: the distance from the last checkpoint's redo point to
the end of the log (here 30 MB, 0.31 s), not on database size. That is your RTO after a crash, and
it is exactly the dial the next module turns.`,
      challenge: code`
Repeat the experiment with synchronous_commit = off in Session A (set it, insert rows, commit,
then crash within a second). Do the "committed" rows survive? This is the failure mode you accept
when you take the throughput win from the previous lesson -- measure how much you actually lose.`,
    },

    {
      slug: "wal-replay-is-deterministic",
      tags: ["wal", "recovery", "replicated-log", "consistency"],
      title: "Read the log the server replayed",
      difficulty: "advanced",
      safetyLevel: "read-only",
      runIn: "mixed",
      estimatedMinutes: 20,
      prerequisites: ["crash-and-redo", "wal-files-and-recycling"],
      overview: code`
Redo is not magic and it is not opaque. The records the server replayed after the crash are
ordinary bytes in ordinary files, and pg_waldump prints them. In this lesson you take the "redo
starts at" and "redo done at" LSNs straight out of the server log and summarise exactly that range
with pg_waldump --stats. Then you cause a small, known transaction and dump it two ways -- through
pg_walinspect from SQL and through pg_waldump from the shell -- and confirm they print the same
records, in the same order, with the same lengths. The log is a replayable, inspectable stream,
and that is what makes a physical standby possible.`,
      reading: code`PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (section "Recovery")`,
      readingNotes: code`
Chapter 10 presents recovery as deterministic replay of WAL records. This lesson compares SQL
pg_walinspect output with pg_waldump output for the same LSN range, making the replay stream visible
from both interfaces.`,
      syntaxBreakdown: code`
### In plain terms

Redo is a repeatable process over ordinary WAL bytes, not an opaque server action. You find the
recovery range in the log, create a small known transaction, and inspect that range through SQL and
the shell. Matching records, lengths, and order explain how a physical standby can replay the stream.

### What you are learning

- **Deterministic replay:** The same ordered records applied to the same pages produce the same state.
- **LSN ranges:** Start and end positions select exactly the work to inspect or replay.
- **SQL versus shell inspection:** pg_walinspect and pg_waldump expose the same underlying records.

### Piece by piece

- **\! grep -E ... | tail -2** (psql shell escape and filters). What it is: a way to select recovery lines from the server log.
  - What it does here: It extracts the REDO_START and REDO_DONE LSNs for the shell comparison.
  - What it gives us: Exact bounds for the range the server replayed.
- **\gset** and **\echo** (psql commands). What they are: variable capture and display commands.
  - What it does here: It save transaction endpoints as **s** and **e**, then print them for substitution.
  - What it gives us: A visible, reproducible SQL/shell LSN range.
- **pg_get_wal_records_info(s, e)** (pg_walinspect function). What it is: a SQL decoder for flushed records.
  - What it does here: It lists the known transaction's records between the captured endpoints.
  - What it gives us: Start/end LSN, resource manager, record type, and length for comparison with pg_waldump.
- **pg_switch_wal()** (SQL function). What it is: a request to finish the current segment early.
  - What it does here: It seals the range's segment so the archiver can copy it.
  - What it gives us: An archived file that pg_waldump can read.
- **pg_sleep(3)** (SQL function). What it is: a three-second pause.
  - What it does here: It gives the background archiver time to copy the sealed segment.
  - What it gives us: Archive listing evidence rather than a race with the archiver.
- **\! ls ... | tail -2** (psql shell escape). What it is: a filesystem listing limited to its last two lines.
  - What it does here: It checks that recent archive files exist.
  - What it gives us: The segment filename needed by the next shell step.
- **pg_waldump -p DIR --start START --end END --stats** (shell utility and flags). What it is: a WAL decoder reading files directly.
  - What it does here: **-p** selects the archive, **--start/--end** bound the captured range, and **--stats** aggregates the recovery range.
  - What it gives us: Record counts, lengths, FPI bytes, and the same five records SQL decoded.
- **rmgr, len (rec/tot), tx, lsn, prev, desc, blkref** (pg_waldump output fields). What they are: manager, lengths, transaction, position, previous link, description, and target-page references.
  - What it does here: It describe each replayable record in physical terms.
  - What it gives us: The xid, backward chain, and relation/block targets hidden by the SQL view.`,
      setup: code`
drop table if exists wal_replay;
create table wal_replay(id int primary key, note text);
insert into wal_replay values (1,'one');`,
      code: code`
-- 1. What did recovery actually replay? Take the LSNs from the server's own log.
\! grep -E 'redo (starts|done)' $PGLAB/primary/log/postgresql.log | tail -2

-- 2. Cause a small, known transaction and bracket it.
select pg_current_wal_lsn() as s \gset
begin;
insert into wal_replay values (2,'two');
update wal_replay set note = 'ONE' where id = 1;
delete from wal_replay where id = 2;
commit;
select pg_current_wal_lsn() as e \gset
\echo range is :s to :e

-- 3. Read it from SQL.
select start_lsn, end_lsn, resource_manager, record_type, record_length
from pg_get_wal_records_info(:'s', :'e')
order by start_lsn;

-- 4. Seal the segment so the archiver ships it.
select pg_switch_wal();
select pg_sleep(3);
\! ls -1 $PGLAB/archive | tail -2

-- 5. Now read the SAME bytes from the archive with pg_waldump. Run these in a
--    shell as the postgres OS user, substituting the LSNs printed above for
--    START/END and the two LSNs from step 1 for REDO_START/REDO_DONE:
--
--      export PATH=/usr/lib/postgresql/16/bin:$PATH PGLAB=$HOME/pglab
--      pg_waldump -p "$PGLAB/archive" --start START --end END
--      pg_waldump -p "$PGLAB/archive" --start REDO_START --end REDO_DONE --stats`,
      expectedResult: code`
Step 1 prints the two lines the crash lesson produced:

  LOG:  redo starts at 0/8A822268
  LOG:  redo done at 0/8A881EE8 system usage: CPU: user: 0.00 s, ... elapsed: 0.00 s

Step 3, the four-statement transaction, decodes from SQL as five records:

  start_lsn  |  end_lsn   | resource_manager | record_type | record_length
  0/8A8C2768 | 0/8A8C27A8 | Heap             | INSERT      |            63
  0/8A8C27A8 | 0/8A8C27E8 | Btree            | INSERT_LEAF |            64
  0/8A8C27E8 | 0/8A8C2838 | Heap             | HOT_UPDATE  |            74
  0/8A8C2838 | 0/8A8C2878 | Heap             | DELETE      |            64
  0/8A8C2878 | 0/8A8C28A8 | Transaction      | COMMIT      |            46

and pg_waldump over the same range from the archive prints the same five, at the same LSNs, with
the same lengths, plus the detail SQL hides -- the xid, the backward prev pointer, and the exact
page each record touches:

  rmgr: Heap  len (rec/tot): 63/63, tx: 84406, lsn: 0/8A8C2768, prev 0/8A8C2738,
        desc: INSERT off: 2, flags: 0x08, blkref #0: rel 1663/19476/50820 blk 0
  rmgr: Btree len (rec/tot): 64/64, tx: 84406, lsn: 0/8A8C27A8, prev 0/8A8C2768,
        desc: INSERT_LEAF off: 2, blkref #0: rel 1663/19476/50825 blk 1
  rmgr: Heap  len (rec/tot): 74/74, tx: 84406, lsn: 0/8A8C27E8, prev 0/8A8C27A8,
        desc: HOT_UPDATE old_xmax: 84406, old_off: 1, ..., new_off: 3,
        blkref #0: rel 1663/19476/50820 blk 0
  rmgr: Heap  len (rec/tot): 64/64, tx: 84406, lsn: 0/8A8C2838, prev 0/8A8C27E8,
        desc: DELETE xmax: 84406, off: 2, infobits: [KEYS_UPDATED],
        blkref #0: rel 1663/19476/50820 blk 0
  rmgr: Transaction len (rec/tot): 46/46, tx: 84406, lsn: 0/8A8C2878, prev 0/8A8C2838,
        desc: COMMIT 2026-09-03 01:29:22.893138 UTC

Every record names one xid and one or more (tablespace/database/relfilenode, block) triples --
50820 is wal_replay's heap, 50825 its primary key index -- and each prev points back at the
previous record's lsn. That is all a replay loop needs: read the next record, find its page, apply
it if the page's LSN is older than the record's, repeat.

The --stats run over the recovery range summarises what the crash actually cost (rows that are all
zero omitted):

  WAL statistics between 0/8A822268 and 0/8A881EE8:
  Type            N       (%)      Record size    (%)      FPI size     (%)   Combined size
  XLOG           25 (  1.09)              1206 ( 0.73)       141192 (64.21)          142398
  Transaction    17 (  0.74)              5424 ( 3.30)            0 ( 0.00)            5424
  Storage         4 (  0.18)               168 ( 0.10)            0 ( 0.00)             168
  Standby        10 (  0.44)               440 ( 0.27)            0 ( 0.00)             440
  Heap2          90 (  3.94)              8098 ( 4.93)            0 ( 0.00)            8098
  Heap         1053 ( 46.08)             77711 (47.34)            0 ( 0.00)           77711
  Btree        1086 ( 47.53)             71124 (43.32)        78712 (35.79)          149836
  Total        2285                     164171 [42.74%]      219904 [57.26%]         384075

2285 records, 384 KB, replayed in well under a second. Note the FPI column: 57% of the replayed
bytes were full-page images (lesson 2), produced by only 25 XLOG records plus some btree ones. A
larger crash earlier in the lab replayed 97057 records and 25 MB with the same shape (Heap and
Heap2 dominating the record count, XLOG dominating the FPI bytes). Your counts depend entirely on
how much work happened between the last checkpoint and the crash; the shape does not.`,
      systemsLens: code`
The log is a public, self-describing format, and that is a design choice with consequences.
Because each record identifies its target page and carries a backward link, replay is a pure
function of (record stream, starting page state): the same records applied to the same pages
always yield the same result, on this machine or another one. That determinism is the whole basis
of physical streaming replication -- a standby is just a server stuck permanently in the redo loop
you watched run at startup, reading records over a socket instead of from a file. It is also the
basis of PITR: stop the replay at an arbitrary LSN or timestamp and you have the database as of
that instant.

The general pattern is state-machine replication: rather than shipping state, ship a totally
ordered stream of deterministic operations and let each replica derive the state. The hard part is
always determinism -- which is why WAL records reference a physical page and offset rather than
re-executing SQL, and why shipping statements instead ("statement-based replication") breaks the
first time a query calls now() or random(). Module 10 shows the other end of the spectrum:
decoding this same stream back into logical row changes, deliberately giving up the physical
layout in exchange for portability across versions and engines.`,
      challenge: code`
Run pg_waldump --stats=record over a range where you did a CREATE INDEX and a range where you
inserted the same number of rows. Which resource managers appear, and what fraction of the bytes
is FPI in each? Then predict what a standby's network link looks like during a big index build.`,
    },

    {
      slug: "wal-size-of-operations",
      tags: ["wal", "write-amplification", "hot-updates", "capacity"],
      title: "What things cost: measuring WAL per operation",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 25,
      prerequisites: [
        "every-change-is-a-wal-record",
        "hot-updates-and-fillfactor",
      ],
      overview: code`
WAL volume is a first-class capacity number: it sets your archive bill, your replication
bandwidth, and how long recovery takes. It is also almost never proportional to the logical size
of the data. In this lesson you price four choices with pg_wal_lsn_diff -- batching rows into one
transaction, using COPY instead of INSERT, updating an indexed versus a non-indexed column, and
building an index -- and turn each into bytes per row so they can be compared directly.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 11 "WAL Modes" (sections "Fault Tolerance", "WAL Levels"); Chapter 5 "Page Pruning and HOT Updates" (section "HOT Updates")`,
      readingNotes: code`
Chapter 11 provides WAL and WAL-level context, while Chapter 5 explains why HOT updates avoid index
work when a row stays on its page. This lesson prices batching, COPY, indexed updates, and index
builds, extending those mechanisms into practical write-amplification measurements.`,
      syntaxBreakdown: code`
### In plain terms

This experiment measures how many WAL bytes different ways of doing equivalent work produce. You
compare transaction batching, COPY, HOT versus indexed updates, and a new index build, then divide by
rows or updates so the costs are comparable. The measurements turn storage, archive, and replication
capacity into numbers rather than guesses.

### What you are learning

- **Batching:** A commit record and flush cost are overhead that can be amortized across many rows.
- **HOT updates:** Changing a non-indexed column may avoid new index entries when space permits.
- **Write amplification:** Logical row changes can produce very different WAL volumes.

### Piece by piece

- **pg_wal_lsn_diff()** (SQL function). What it is: subtraction of two LSN positions in bytes.
  - What it does here: It prices each insertion, update loop, and index build between saved endpoints.
  - What it gives us: **wal_bytes** and **bytes_per_row/bytes_per_update** for direct comparisons.
- **\gset** (psql command). What it is: query-result capture into psql variables.
  - What it does here: It stores **a1** through **i2**, the endpoints around each operation.
  - What it gives us: Exact reusable boundaries instead of hand-copied LSNs.
- **\gexec** (psql command). What it is: a command that executes each result row as SQL.
  - What it does here: It turns 2,000 generated INSERT strings into 2,000 autocommit transactions.
  - What it gives us: The separate-commit row in the cost table.
- **COPY ... TO/FROM ... CSV** (SQL data-transfer command). What it is: bulk export and import through a CSV file.
  - What it does here: It generates and then loads the same 2,000 rows using multi-row WAL records.
  - What it gives us: A much smaller **bytes_per_row** value than individual INSERT paths.
- **DO $$ ... FOR ... LOOP** (server-side PL/pgSQL block). What it is: a loop that runs many SQL statements in one transaction.
  - What it does here: It repeats 2,000 inserts or 1,000 updates while avoiding client round trips.
  - What it gives us: A controlled denominator and a batched transaction cost.
- **fillfactor = 70**, primary key, and **CREATE INDEX** (storage option and DDL). What they are: spare-page space, an indexed identifier, and a secondary index.
  - What it does here: It creates HOT-eligible plain updates and non-HOT indexed updates, then builds a new index.
  - What it gives us: Different record types and index size for explaining write amplification.
- **pg_get_wal_records_info()** (pg_walinspect function). What it is: a decoder of records in each update range.
  - What it does here: It groups HOT_UPDATE, INSERT_LEAF, SPLIT_L, and PRUNE records.
  - What it gives us: Counts and summed lengths showing why indexed updates cost more.
- **pg_stat_force_next_flush()** (SQL function). What it is: a request to publish buffered statistics now.
  - What it does here: It makes the following table-statistics query reflect the update loops.
  - What it gives us: Fresh counters rather than stale values.
- **pg_stat_user_tables.n_tup_upd** and **n_tup_hot_upd** (statistics columns). What they are: total and HOT-update counters.
  - What it does here: It reports how many updates used each path.
  - What it gives us: A behavioral cross-check for the WAL record breakdown.
- **pg_relation_size('wal_amp_id_idx')** (SQL size function). What it is: the physical byte size of the built index.
  - What it does here: It measures the output relation after CREATE INDEX.
  - What it gives us: **index_bytes** to compare with WAL bytes and quantify build amplification.`,
      setup: code`
drop table if exists wal_amp;
create table wal_amp(id int, v text) with (autovacuum_enabled = off);
drop table if exists wal_cols;
create table wal_cols(id int primary key, indexed int, plain int)
  with (autovacuum_enabled = off, fillfactor = 70);
insert into wal_cols select g, g, g from generate_series(1,200) g;
create index wal_cols_indexed_idx on wal_cols(indexed);
vacuum wal_cols;`,
      code: code`
-- A. The same 2000 rows, four ways.
select pg_current_wal_lsn() as a1 \gset
insert into wal_amp select g, 'v' from generate_series(1,2000) g;
select pg_current_wal_lsn() as a2 \gset

begin;
do $$ begin for i in 2001..4000 loop insert into wal_amp values (i,'v'); end loop; end $$;
commit;
select pg_current_wal_lsn() as a3 \gset

-- Session A
-- 2000 separate autocommit transactions. This takes several seconds: each one
-- is a commit, and each commit is an fsync.
select 'insert into wal_amp values (' || g || ', ''v'');'
from generate_series(4001,6000) g \gexec
select pg_current_wal_lsn() as a4 \gset

-- Session A
copy (select g, 'v' from generate_series(6001,8000) g) to '/tmp/wal_amp.csv' csv;
select pg_current_wal_lsn() as a5 \gset
copy wal_amp from '/tmp/wal_amp.csv' csv;
select pg_current_wal_lsn() as a6 \gset

select 'one multi-row INSERT, 1 txn' as how, pg_wal_lsn_diff(:'a2',:'a1') as wal_bytes,
       round(pg_wal_lsn_diff(:'a2',:'a1')/2000.0,1) as bytes_per_row
union all select '2000 INSERTs, 1 txn',     pg_wal_lsn_diff(:'a3',:'a2'),
                 round(pg_wal_lsn_diff(:'a3',:'a2')/2000.0,1)
union all select '2000 INSERTs, 2000 txns', pg_wal_lsn_diff(:'a4',:'a3'),
                 round(pg_wal_lsn_diff(:'a4',:'a3')/2000.0,1)
union all select 'COPY, 1 txn',             pg_wal_lsn_diff(:'a6',:'a5'),
                 round(pg_wal_lsn_diff(:'a6',:'a5')/2000.0,1);

-- Session A
-- B. The same 1000 updates to the same row, on a plain and an indexed column.
checkpoint;
update wal_cols set plain = plain + 1 where id = 1;   -- warm-up: this page pays its FPI here
select pg_current_wal_lsn() as u1 \gset
do $$ begin for i in 1..1000 loop update wal_cols set plain = plain+1 where id=1; end loop; end $$;
select pg_current_wal_lsn() as u2 \gset
do $$ begin for i in 1..1000 loop update wal_cols set indexed = indexed+1 where id=1; end loop; end $$;
select pg_current_wal_lsn() as u3 \gset

select '1000 updates of a NON-indexed column' as how, pg_wal_lsn_diff(:'u2',:'u1') as wal_bytes,
       round(pg_wal_lsn_diff(:'u2',:'u1')/1000.0,1) as bytes_per_update
union all select '1000 updates of an INDEXED column', pg_wal_lsn_diff(:'u3',:'u2'),
                 round(pg_wal_lsn_diff(:'u3',:'u2')/1000.0,1);

select 'non-indexed' as which, record_type, count(*), sum(record_length) as len
from pg_get_wal_records_info(:'u1',:'u2') group by 1,2 order by 4 desc limit 4;
select 'indexed' as which, record_type, count(*), sum(record_length) as len
from pg_get_wal_records_info(:'u2',:'u3') group by 1,2 order by 4 desc limit 4;

select pg_stat_force_next_flush();
select relname, n_tup_upd, n_tup_hot_upd from pg_stat_user_tables where relname = 'wal_cols';

-- Session A
-- C. Building an index: how does the WAL compare to the index itself?
select pg_current_wal_lsn() as i1 \gset
create index wal_amp_id_idx on wal_amp(id);
select pg_current_wal_lsn() as i2 \gset
select 'CREATE INDEX' as how, pg_wal_lsn_diff(:'i2',:'i1') as wal_bytes,
       pg_relation_size('wal_amp_id_idx') as index_bytes;`,
      expectedResult: code`
A. Inserting the same 2000 rows costs very different amounts depending on how you frame it:

  how                     | wal_bytes | bytes_per_row
  one multi-row INSERT    |    129968 |          65.0
  2000 INSERTs, 1 txn     |    128432 |          64.2
  2000 INSERTs, 2000 txns |    224712 |         112.4
  COPY, 1 txn             |     28944 |          14.5

Three separate findings. (1) Writing one INSERT statement for 2000 rows saves nothing over 2000
INSERT statements in the same transaction -- 64-65 bytes/row either way -- because INSERT logs one
Heap/INSERT record per tuple regardless of statement shape. (2) Committing 2000 times instead of
once adds 48 bytes/row of pure overhead (a 46-byte COMMIT record plus alignment), a 75% increase,
on top of 2000 fsyncs. (3) COPY is 4.4x cheaper per row than INSERT: it uses heap_multi_insert and
packs many tuples into a single record. Batching helps enormously, but only through the code path
that actually batches.

B. Updating the same row 1000 times:

  how                                  | wal_bytes | bytes_per_update
  1000 updates of a NON-indexed column |    117680 |            117.7
  1000 updates of an INDEXED column    |    219816 |            219.8

Nearly 2x, and the record breakdown says why:

  non-indexed | HOT_UPDATE   |  994 | 77532        indexed | INSERT_LEAF  | 1995 | 127680
  non-indexed | FPI_FOR_HINT |    3 | 24723        indexed | UPDATE       |  995 |  77610
  non-indexed | INSERT_LEAF  |   12 |  8866        indexed | SPLIT_L      |    2 |   3400
  non-indexed | UPDATE       |    1 |  3283        indexed | PRUNE        |    7 |   2389

The plain column produced 994 HOT_UPDATEs and only 12 index records; the indexed column produced
995 non-HOT UPDATEs and 1995 INSERT_LEAFs -- two index records per update -- plus page splits and
deduplication work. pg_stat_user_tables confirms it: n_tup_upd = 2001 with n_tup_hot_upd = 995,
so essentially all of the first loop was HOT and none of the second was. (A handful of records in
the non-indexed run are not HOT: once the free space that fillfactor 70 reserved is used up, the
row has to move to another page until pruning reclaims space, and that move triggers an index
insert and a fresh page image.)

C. CREATE INDEX on the 8000-row wal_amp cost 529464 bytes of WAL to produce a 196608-byte index --
about 2.7x the size of the thing it built, because the WAL carries the new index pages plus the
full-page images of everything the build dirtied. An index build is not a metadata change; it is a
full write of a new relation, logged.`,
      systemsLens: code`
Write amplification is the number that decides your storage and network bill, and this lesson
gives you the tool to measure it instead of guessing: bracket anything with two LSNs and divide.
The four results generalise cleanly. Per-operation overhead (the commit record, the fsync) is
amortised by batching, which is why every high-throughput ingestion path -- COPY here, batching
producers in Kafka, memtable writes in an LSM tree -- exists. Secondary indexes are not free
storage, they are a multiplier on every write that touches them, which is the real cost of "just
add an index". And bulk structural operations (index builds, table rewrites, mass updates)
generate WAL bursts that a replica must receive, an archive must store, and a recovery must
replay -- so the migration that is instant on your laptop is the one that saturates the
replication link at 3am.

The habit worth taking away: when you design a write path, ask what it costs in log bytes per
logical change, not just in rows. A queue table updated in place through an indexed status column
is cheap logically and expensive in WAL; the same queue as an append-only outbox with a
HOT-updatable flag is the same feature at a fraction of the write amplification. Module 14 builds
exactly that.`,
      challenge: code`
Price an UPDATE that changes nothing: "update wal_amp set v = v". PostgreSQL still writes a new
tuple version for every row. Now price the same statement with a "where v is distinct from 'v'"
guard. How many bytes of WAL, and how much replication bandwidth, does one WHERE clause save on a
million-row table?`,
    },
  ],
};
