import { code, type Module } from "../../../src/types.ts";

export const CHECKPOINTS: Module = {
  category: "checkpointing",
  title: "Checkpoints, backups, and point-in-time recovery",
  lessons: [
    {
      slug: "checkpoint-anatomy",
      tags: ["checkpoints", "wal", "buffer-cache", "durability"],
      title: "What a checkpoint actually does",
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["buffer-cache-and-io", "every-change-is-a-wal-record"],
      overview: code`
The previous module ended on an uncomfortable fact: after a crash, the server replays every WAL
record written since the last checkpoint's redo point, and that distance is your recovery time. A
checkpoint is the operation that resets that distance to zero. It writes every dirty buffer in
shared memory out to the data files, fsyncs them, and then records in pg_control "everything
before this LSN is already on disk in the heap; replay may start here".

In this lesson you dirty a few thousand buffers, watch the gap between the redo point and the
current LSN open up, run CHECKPOINT by hand, and watch the gap slam shut. Then you read the
server's own accounting of the work: the pg_stat_bgwriter counters and the "checkpoint complete:
wrote N buffers" line in the log, which is the single most useful line in a PostgreSQL log file
when you are trying to explain an I/O spike.`,
      syntaxBreakdown: code`
CHECKPOINT is a SQL command (superuser or the pg_checkpoint role) that forces an immediate
checkpoint and does not return until it has finished. pg_control_checkpoint() reads the control
file: checkpoint_lsn is where the last checkpoint record sits, redo_lsn is the redo point where
replay would start, and checkpoint_time is when it happened. pg_wal_lsn_diff(a, b) turns two LSNs
into a byte count, so pg_wal_lsn_diff(pg_current_wal_lsn(), redo_lsn) is literally "how much WAL
would I have to replay if the machine lost power right now". pg_buffercache (from the extension)
has one row per shared buffer with isdirty, relfilenode and usagecount. pg_stat_bgwriter counts
checkpoints_timed (triggered by checkpoint_timeout), checkpoints_req (triggered by max_wal_size or
by a CHECKPOINT command), buffers_checkpoint (pages the checkpointer wrote), buffers_clean (pages
the background writer wrote) and buffers_backend (pages an ordinary backend had to write itself,
because it wanted a buffer and every candidate was dirty). In PostgreSQL 16 these all live in
pg_stat_bgwriter; PostgreSQL 17 splits the checkpoint columns out into a separate
pg_stat_checkpointer view. log_checkpoints is on in this lab, so every checkpoint prints a
starting and a complete line; the query below reads the tail of the log with pg_read_file(), whose
relative paths resolve inside the data directory, so you never have to leave psql.`,
      setup: code`
drop table if exists ckpt_anatomy;
create table ckpt_anatomy(id int primary key, pad text);`,
      code: code`
-- Start from a clean slate so the numbers below are only about this experiment.
checkpoint;

select checkpoint_lsn, redo_lsn, checkpoint_time,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), redo_lsn)) as wal_to_replay
from pg_control_checkpoint();

select checkpoints_timed, checkpoints_req, buffers_checkpoint, buffers_clean, buffers_backend,
       (checkpoint_write_time/1000.0)::numeric(10,2) as write_s,
       (checkpoint_sync_time/1000.0)::numeric(10,2) as sync_s
from pg_stat_bgwriter;

-- Dirty a few thousand buffers. Nothing here touches the table's data file: the
-- rows are in shared buffers, the changes are in WAL, and that is all.
insert into ckpt_anatomy select g, repeat('p', 200) from generate_series(1, 100000) g;

select count(*) filter (where isdirty) as dirty_buffers,
       count(*) filter (where isdirty
             and relfilenode = pg_relation_filenode('ckpt_anatomy')) as dirty_for_our_table,
       (select setting::int from pg_settings where name = 'shared_buffers') as total_buffers
from pg_buffercache where relfilenode is not null;

-- The redo point has not moved, so the recovery bill has been growing.
select redo_lsn, pg_current_wal_lsn() as now_lsn,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), redo_lsn)) as wal_to_replay
from pg_control_checkpoint();

-- Pay it.
checkpoint;

select checkpoint_lsn, redo_lsn, checkpoint_time,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), redo_lsn)) as wal_to_replay
from pg_control_checkpoint();

select count(*) filter (where isdirty) as dirty_buffers_after
from pg_buffercache where relfilenode is not null;

select checkpoints_timed, checkpoints_req, buffers_checkpoint, buffers_clean, buffers_backend,
       (checkpoint_write_time/1000.0)::numeric(10,2) as write_s,
       (checkpoint_sync_time/1000.0)::numeric(10,2) as sync_s
from pg_stat_bgwriter;

-- The server's own account of what it just did: the last 20 KB of the log file.
select l from regexp_split_to_table(
         pg_read_file('log/postgresql.log',
                      greatest((pg_stat_file('log/postgresql.log')).size - 20000, 0), 20000),
         chr(10)) with ordinality as t(l, n)
where l like '%LOG:  checkpoint%'
order by n desc limit 2;`,
      expectedResult: code`
After the first CHECKPOINT the redo point is right at the end of the log, so wal_to_replay is
176 bytes -- the size of the checkpoint record itself:

  checkpoint_lsn |  redo_lsn  |    checkpoint_time     | wal_to_replay
  0/A50390F8     | 0/A50390C0 | 2026-09-03 01:49:22+00 | 176 bytes

The counters start wherever your lab left them; only the deltas matter. In this run:

  checkpoints_timed | checkpoints_req | buffers_checkpoint | buffers_clean | buffers_backend
                  2 |               5 |               8670 |             0 |            8398

checkpoints_req dwarfs checkpoints_timed because almost nothing in this lab is ever idle for a
whole checkpoint_timeout (5 minutes); nearly every checkpoint so far was requested by a CHECKPOINT
command or forced by WAL volume. buffers_clean is 0: the background writer has had nothing to do,
because the checkpointer and the backends have been doing all the writing.

The INSERT of 100k rows leaves about 3200 buffers dirty, almost all of them ours:

  dirty_buffers | dirty_for_our_table | total_buffers
           3226 |                2943 |         16384

(total_buffers is shared_buffers in 8 kB units: 128 MB = 16384 buffers.) The redo point has not
budged, so the recovery bill is now:

  redo_lsn   |  now_lsn   | wal_to_replay
  0/A50390C0 | 0/A6FD7370 | 32 MB

That is the number that matters: if the machine lost power at this instant, startup would have to
replay 32 MB of WAL before accepting connections. The second CHECKPOINT resets it to 176 bytes,
drops dirty_buffers_after to 0, and moves checkpoints_req 5 -> 6 with buffers_checkpoint
8670 -> 11896, a delta of 3226 -- exactly the dirty buffers you counted a moment earlier.

The log lines say the same thing in the server's own words:

  LOG:  checkpoint starting: immediate force wait
  LOG:  checkpoint complete: wrote 3228 buffers (19.7%); 0 WAL file(s) added, 0 removed,
        1 recycled; write=0.071 s, sync=0.010 s, total=0.094 s; sync files=10, longest=0.004 s,
        average=0.001 s; distance=32376 kB, estimate=36098 kB; lsn=0/A6FD73A8, redo lsn=0/A6FD7370

Read that line field by field, because you will read it again during an incident. "3228 buffers
(19.7%)" is how much of shared_buffers was dirty (two more than pg_buffercache reported, because
the query itself ran a moment earlier). "distance=32376 kB" is the WAL written since the previous
checkpoint -- the same 32 MB the LSN arithmetic gave you. "estimate=36098 kB" is the
server's smoothed prediction of the next distance, which is what it uses to pace a non-immediate
checkpoint. "sync files=8, longest=0.020 s" is the fsync phase, the part that hurts on a busy
system. "immediate force wait" is the reason code: immediate = do not pace it, force = write one
even if nothing changed, wait = the caller is blocked until it finishes. A timed checkpoint says
"checkpoint starting: time" instead, and a WAL-pressure one says "checkpoint starting: wal", which
is the next lesson but one.

Your absolute numbers will differ. What must hold: wal_to_replay grows during the INSERT and
collapses after CHECKPOINT, dirty_buffers_after is 0, and the buffers_checkpoint delta equals the
dirty buffer count.`,
      systemsLens: code`
A checkpoint is a fuzzy, non-blocking snapshot of a cache, and every system with a log and a cache
needs one. The log alone is enough for correctness -- redo can rebuild any page -- but replay time
grows without bound, so you periodically flush the cache and write down "you may forget everything
before here". Redis calls it a BGSAVE plus an AOF rewrite, RocksDB calls it a memtable flush plus
a manifest update, Kafka calls it advancing the log start offset, Raft implementations call it a
snapshot plus log truncation. Same shape: the log bounds durability, the checkpoint bounds
recovery, and truncating the log is only safe up to the checkpoint.

The trade-off is a real one, and it is a latency-versus-recovery-time dial. Frequent checkpoints
keep recovery short but turn one logical page change into many physical writes (a page dirtied ten
times between checkpoints costs one write; dirtied once per checkpoint it costs ten) and, worse,
they re-arm full-page writes: the first change to a page after a checkpoint puts the whole 8 kB
into the WAL. Rare checkpoints amortise those writes but leave a long replay and a big pile of
dirty buffers that has to be flushed eventually anyway, usually in a burst. You are choosing where
to spend I/O, not whether to spend it.

Notice also what a checkpoint is not: it is not a consistent point-in-time snapshot of the
database. Ordinary transactions keep committing while the checkpointer walks the buffer pool, so
the data files after a checkpoint are a smear of states. It is the redo point plus the WAL after
it that makes them meaningful again. That is exactly why a base backup, three lessons from now,
has to ship both.`,
      challenge: code`
Run the INSERT again and watch pg_stat_bgwriter.buffers_backend before and after. If it moves, an
ordinary backend had to write out a dirty page itself because it could not find a clean buffer to
reuse -- checkpoint work landing on the latency path of a user query. Then try to make it move a
lot: insert 500k rows and see whether buffers_backend or buffers_checkpoint absorbs more of the
writes, and why 128 MB of shared_buffers is the reason.`,
    },

    {
      slug: "redo-point-bounds-recovery",
      tags: ["checkpoints", "recovery", "wal", "durability"],
      title: "Crash twice: the redo point is your RTO",
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "mixed",
      estimatedMinutes: 30,
      prerequisites: ["checkpoint-anatomy", "crash-and-redo"],
      overview: code`
The last lesson claimed that the distance from the redo point to the end of the log is your
recovery time. This lesson proves it by running the same crash twice with exactly one difference.

Round one: write 38 MB of WAL after a checkpoint, then kill the server with SIGQUIT. Round two:
write another 38 MB, run CHECKPOINT, then kill it the same way. Both crashes lose the same
processes, both leave the cluster marked "in production", and both recover every committed row.
The only thing that changes is how far "redo starts at" is from "redo done at", and how long the
server takes to get between them -- 38 MB and 0.31 s versus 56 bytes and 0.00 s.`,
      syntaxBreakdown: code`
pg_ctl -D DIR stop -m immediate sends SIGQUIT to every process: no shutdown checkpoint is written
and dirty buffers are simply abandoned. pg_controldata -D DIR prints the control file without a
running server; "Database cluster state: in production" on a stopped cluster is the marker of an
unclean shutdown, and "Latest checkpoint's REDO location" is where replay will begin. On restart
the log prints "database system was not properly shut down; automatic recovery in progress",
"redo starts at LSN", and "redo done at LSN system usage: ... elapsed: N s". The distance between
those two LSNs is pg_wal_lsn_diff of the two numbers, and the elapsed time is your RTO. Recovery
finishes with an end-of-recovery checkpoint, which is why the redo point is fresh again
afterwards, and pg_stat_bgwriter's counters are reset by a crash, because the statistics file is
not crash-safe.`,
      caution: code`
This lesson crashes the lab cluster twice. Only ever run it against $PGLAB, never against a
cluster you care about and never against the packaged system cluster on port 5432. Your psql
session loses its connection each time; reconnect and carry on. Leave the server running when you
are done.`,
      setup: code`
drop table if exists ckpt_redo;
create table ckpt_redo(id int primary key, pad text);`,
      code: code`
-- ROUND 1: crash with a stale redo point.
-- Fix the redo point, then write a lot of WAL and do NOT checkpoint.
checkpoint;
select redo_lsn as redo_point_before_writes from pg_control_checkpoint();

insert into ckpt_redo select g, repeat('r', 200) from generate_series(1, 120000) g;
select count(*) as committed_rows from ckpt_redo;

select redo_lsn, pg_current_wal_lsn() as now_lsn,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), redo_lsn)) as wal_to_replay
from pg_control_checkpoint();
select count(*) filter (where isdirty) as dirty_buffers
from pg_buffercache where relfilenode is not null;

-- ==========================================================================
-- SHELL, as the postgres OS user, in another terminal. Run these by hand: no
-- lesson runner can follow the server across a restart. The redo location
-- pg_controldata prints must equal redo_point_before_writes above.
--
--   export PATH=/usr/lib/postgresql/16/bin:$PATH
--   PGLAB=$HOME/pglab
--
--   pg_ctl -D "$PGLAB/primary" stop -m immediate
--   pg_controldata -D "$PGLAB/primary" | grep -E 'cluster state|REDO location'
--   time pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start -w
--   grep -E 'not properly|redo (starts|done)' "$PGLAB/primary/log/postgresql.log" | tail -3
--
-- ==========================================================================

-- ROUND 2: the same crash, but checkpoint first. Reconnect (the old connection
-- died with the server) and repeat, this time ending with CHECKPOINT so the
-- redo point sits at the end of the log.
select count(*) as rows_after_crash_1 from ckpt_redo;

insert into ckpt_redo select g, repeat('r', 200) from generate_series(120001, 240000) g;
checkpoint;

select redo_lsn, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), redo_lsn)) as wal_to_replay
from pg_control_checkpoint();

-- ==========================================================================
-- SHELL again, byte for byte the same commands:
--
--   pg_ctl -D "$PGLAB/primary" stop -m immediate
--   time pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start -w
--   grep -E 'not properly|redo (starts|done)' "$PGLAB/primary/log/postgresql.log" | tail -3
--
-- ==========================================================================

-- Reconnect once more. Both crashes were fully durable.
select count(*) as rows_after_crash_2 from ckpt_redo;
select timeline_id, redo_lsn from pg_control_checkpoint();`,
      expectedResult: code`
ROUND 1. After the CHECKPOINT the redo point is 0/95CE81D0. The INSERT of 120k rows moves the
current LSN to 0/982D0FF0 and leaves 3864 buffers dirty:

  redo_lsn   |  now_lsn   | wal_to_replay
  0/95CE81D0 | 0/982D0FF0 | 38 MB

pg_controldata on the stopped cluster confirms both the unclean shutdown and the redo point:

  Database cluster state:               in production
  Latest checkpoint's REDO location:    0/95CE81D0

and the restart takes about a second of wall clock, of which 0.31 s is replay:

  LOG:  database system was not properly shut down; automatic recovery in progress
  LOG:  redo starts at 0/95CE81D0
  LOG:  redo done at 0/982D0FC0 system usage: CPU: user: 0.26 s, system: 0.04 s, elapsed: 0.31 s

"redo starts at 0/95CE81D0" is the redo point, to the byte. "redo done at 0/982D0FC0" is the last
complete record in the log, 48 bytes short of the 0/982D0FF0 your session reported, because that
final record was still in a memory buffer when the process died. 38 MB replayed, 0.31 s.

ROUND 2. The same 120k-row INSERT, then CHECKPOINT, and the redo point has caught up:

  redo_lsn   | wal_to_replay
  0/9C41DB80 | 176 bytes

The identical crash now produces:

  LOG:  database system was not properly shut down; automatic recovery in progress
  LOG:  redo starts at 0/9C41DB80
  LOG:  redo done at 0/9C41DBB8 system usage: CPU: user: 0.00 s, system: 0.00 s, elapsed: 0.00 s

0/9C41DBB8 - 0/9C41DB80 = 0x38 = 56 bytes replayed, in 0.00 s. Two orders of magnitude of WAL and
a measurable startup delay, gone, because a checkpoint had already pushed those pages to disk.

Correctness is identical in both rounds: rows_after_crash_1 is 120000 and rows_after_crash_2 is
240000. Nothing committed was ever at risk -- the log guaranteed that. The checkpoint bought time,
not safety. Afterwards timeline_id is still 1: a crash recovery stays on the same timeline, unlike
the point-in-time recovery three lessons from now.`,
      systemsLens: code`
This is the cleanest possible separation of two properties people constantly conflate. Durability
comes from the log and from fsync at commit: both rounds lost zero committed rows. Availability
after a failure -- RTO -- comes from the checkpoint, and it is proportional to unflushed log, not
to database size. A 10 TB database that checkpointed a second ago recovers instantly; a 10 GB
database with a twenty-minute-old redo point and a heavy write rate does not.

That gives you a real operational dial and a rough formula. Worst-case replay is about
min(max_wal_size, WAL written in one checkpoint_timeout), and replay is single-threaded,
sequential, and roughly as expensive as the original writes were. If you need an RTO of 30
seconds, you are saying "no more than about 30 seconds of WAL may ever be outstanding", and you
set max_wal_size and checkpoint_timeout to enforce it -- paying in write amplification and in
checkpoint I/O spikes.

Every replicated-log system makes the same bargain, which is why snapshotting is not optional in
Raft or ZooKeeper: a follower that must replay the whole log from the beginning to rejoin is a
follower that never rejoins. The interesting corollary is that this is also why a hot standby
beats a fast restart. Replay on a standby happens continuously, in the background, so at failover
time there is nothing left to replay and the RTO is a promotion, not a recovery. That is module
09.`,
      challenge: code`
Make recovery slow on purpose. Set checkpoint_timeout high and max_wal_size to 4GB, run a few
minutes of pgbench, and crash. How long does startup take, and does "redo done at" imply the same
throughput as the original writes? Then measure the other direction: how much extra WAL does a
30-second checkpoint_timeout generate for the same workload, and where do the extra bytes come
from? (Hint: full_page_writes, and the previous module's full-page-writes lesson.)`,
    },

    {
      slug: "max-wal-size-forces-checkpoints",
      tags: ["checkpoints", "wal", "capacity", "configuration"],
      title: "Back-pressure: max_wal_size forces a checkpoint",
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["checkpoint-anatomy", "wal-files-and-recycling"],
      overview: code`
So far every checkpoint in this module happened because you asked for one. In production almost
none of them do. Checkpoints fire either on a timer (checkpoint_timeout, default 5 minutes) or
because the log has grown past max_wal_size since the last one -- and the second kind is a
back-pressure signal, not a schedule.

In this lesson you shrink max_wal_size to 64 MB, write about 80 MB of WAL in one statement, and
catch the server triggering its own checkpoints in the middle of it. The log says "checkpoint
starting: wal", and it also says "checkpoints are occurring too frequently", which is PostgreSQL
telling you in plain English that the write rate has outrun the flush rate. Then you put the
setting back and prove postgresql.auto.conf is clean again.`,
      syntaxBreakdown: code`
ALTER SYSTEM SET writes a setting into postgresql.auto.conf, which is read after postgresql.conf
and therefore wins; ALTER SYSTEM RESET removes it again. Neither takes effect until the server
rereads its configuration: pg_reload_conf() does that for settings whose context is "sighup"
(max_wal_size is one), while "postmaster" settings need a restart. SHOW reports what the server
actually believes. max_wal_size is a soft target for how much WAL may accumulate between
checkpoints, not a hard cap: pg_wal can and does exceed it, because a checkpoint takes time and
because checkpoint_completion_target (0.9) deliberately paces the writes across most of the
interval. The log distinguishes why a checkpoint started: "time" (checkpoint_timeout), "wal"
(max_wal_size), "immediate force wait" (a CHECKPOINT command), "end-of-recovery", "shutdown".
checkpoint_warning (30 s) is what produces the "occurring too frequently" hint. pg_ls_waldir()
lists pg_wal from SQL, and psql's \gset captures a query result into a variable you can splice
into a later statement with a colon.`,
      caution: code`
This lesson changes a cluster-wide setting with ALTER SYSTEM and reloads the configuration. It
resets the setting at the end of the same script; if you stop halfway, run
ALTER SYSTEM RESET max_wal_size; SELECT pg_reload_conf(); before moving on, and check that
postgresql.auto.conf is back to its two comment lines.`,
      setup: code`
drop table if exists ckpt_pressure;
create table ckpt_pressure(id int, pad text);`,
      code: code`
show max_wal_size;
select checkpoints_timed, checkpoints_req from pg_stat_bgwriter;
select count(*) as wal_segments, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();

-- Remember where the log ends, so we read back only the lines this experiment writes.
select (pg_stat_file('log/postgresql.log')).size as log_size_before \gset

-- Shrink the budget. max_wal_size is a sighup setting, so a reload is enough.
alter system set max_wal_size = '64MB';
select pg_reload_conf();
select pg_sleep(1);
show max_wal_size;

-- Write about 80 MB of WAL in one statement: more than the budget allows.
insert into ckpt_pressure select g, repeat('w', 300) from generate_series(1, 200000) g;

-- Give the checkpointer a moment to finish the last one it started.
select pg_sleep(5);

select checkpoints_timed, checkpoints_req from pg_stat_bgwriter;

select l from regexp_split_to_table(
         pg_read_file('log/postgresql.log', :log_size_before, 200000), chr(10))
         with ordinality as t(l, n)
where l like '%LOG:  checkpoint%'
order by n;

select count(*) as wal_segments, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();

-- Put it back, in this same session, and prove postgresql.auto.conf is clean.
alter system reset max_wal_size;
select pg_reload_conf();
select pg_sleep(1);
show max_wal_size;
select pg_read_file('postgresql.auto.conf') as auto_conf;

drop table ckpt_pressure;`,
      expectedResult: code`
max_wal_size starts at 1GB and pg_wal holds 7 segments = 96 MB. After the ALTER SYSTEM and
pg_reload_conf(), SHOW max_wal_size returns 64MB -- no restart, no dropped connections.

The INSERT then trips the checkpointer twice without anybody asking. checkpoints_req goes 6 -> 8
while checkpoints_timed does not move, and the log lines written during the statement are:

  LOG:  checkpoint starting: wal
  LOG:  checkpoint complete: wrote 5159 buffers (31.5%); 0 WAL file(s) added, 3 removed,
        0 recycled; write=0.583 s, sync=0.685 s, total=1.508 s; sync files=28, longest=0.272 s,
        average=0.025 s; distance=37907 kB, estimate=37907 kB; lsn=0/AC400058,
        redo lsn=0/A94DC030
  LOG:  checkpoints are occurring too frequently (1 second apart)
  LOG:  checkpoint starting: wal

"checkpoint starting: wal" is the whole point: reason code "wal", not "time" and not
"immediate force wait". Nobody ran CHECKPOINT; the log crossed the budget and the server flushed
to protect its own recovery time. The hint "checkpoints are occurring too frequently (1 second
apart)" appears when a WAL-triggered checkpoint starts less than checkpoint_warning (30 s) after
the previous one, and it is the server advising you to raise max_wal_size. Seeing that line during
a bulk load in production is the signal that your write burst is being throttled by flush I/O.

Note the completed checkpoint's "distance=37907 kB": the WAL written since the previous
checkpoint, well under max_wal_size, because the trigger fires at a fraction of the budget rather
than at the budget itself, leaving room for the checkpoint to finish while writes continue. Its
sync phase (sync=0.685 s, longest=0.272 s) is also an order of magnitude slower than the sync in
the first lesson: 28 files instead of 10, flushed while the INSERT was still writing.

(The last "checkpoint starting: wal" may or may not have a matching "complete" line inside the
window you read, depending on how fast your disk is; that is fine. An earlier run on the same lab
also printed a "checkpoints are occurring too frequently (16 seconds apart)" line before the first
"checkpoint starting: wal".)

pg_wal ends up at 64 MB in 5 segments, down from 96 MB, because the checkpoints let the server
remove segments it no longer needs -- and it hovers at, not below, the new target, which is the
concrete proof that max_wal_size is a target and not a cap.

The cleanup is silent and complete: SHOW max_wal_size returns 1GB again and
pg_read_file('postgresql.auto.conf') prints only

  # Do not edit this file manually!
  # It will be overwritten by the ALTER SYSTEM command.

If your run shows only one "checkpoint starting: wal", raise the row count a little; if it shows
five, your disk flushed slower than mine. Either way it is the same phenomenon.`,
      systemsLens: code`
This is back-pressure implemented as a feedback loop between a log and a cache, and the shape is
universal. The producer (transactions appending WAL) and the consumer (the checkpointer flushing
dirty pages) are decoupled by a buffer. When the buffer -- here the WAL between the redo point and
the head -- exceeds a threshold, the system does not block the producer outright; it accelerates
the consumer. Only if the consumer still cannot keep up do the costs start landing on the
producer, as backends stalling on buffer allocation and on WAL segment creation.

The failure mode is the interesting part. Set max_wal_size too small and you get exactly what the
log warned about: a checkpoint storm, where the same hot pages are written on every checkpoint and
every first-touch-after-checkpoint write emits a full page image into the WAL -- so shrinking the
WAL budget makes the system write more WAL. That is a positive feedback loop, and it is the same
one you get from an undersized memtable in an LSM tree (write stalls and compaction storms), from
too aggressive a flush interval in a log-structured broker, or from a JVM heap that is too small
for its allocation rate. Set it too large and you trade that for a long recovery and a bigger,
spikier flush.

The general lesson: when a system exposes a "how much unflushed work may accumulate" knob, it is
never really a memory knob. It is simultaneously a recovery-time knob, a write-amplification knob,
and a latency-jitter knob, and you cannot optimise all three at once.`,
      challenge: code`
Predict, then measure. With max_wal_size at 64MB, how much WAL does the same 200k-row INSERT
write, compared with the default 1GB? Bracket the statement with pg_current_wal_lsn() and take the
difference under both settings. The extra bytes are full-page images re-emitted because each
checkpoint re-arms full_page_writes on every page -- the write amplification this lesson's systems
lens claims, in bytes you measured yourself.`,
    },

    {
      slug: "base-backup",
      tags: ["backup", "checkpoints", "wal", "durability"],
      title: "Take a base backup and see why it needs WAL",
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 20,
      prerequisites: ["checkpoint-anatomy", "wal-files-and-recycling"],
      overview: code`
A checkpoint bounds recovery from a crash. It does nothing for a lost disk, a dropped table, or a
bad migration. For those you need a copy of the data files somewhere else, plus enough WAL to make
that copy mean something -- and "plus enough WAL" is the part people get wrong.

pg_basebackup copies the whole data directory of a running server over the replication protocol.
It cannot take an atomic snapshot: files are read one at a time while transactions keep
committing, so the copy is a smear of states, torn pages and all. What makes it usable is the pair
of LSNs it records in backup_label. Replay every WAL record between them and the smear resolves
into a consistent database. In this lesson you take that backup, read backup_label, verify it with
pg_verifybackup, and break it on purpose to watch verification catch it. The backup you make here
is the input to the next lesson.`,
      syntaxBreakdown: code`
pg_basebackup -D DIR takes a physical backup. -c fast forces an immediate checkpoint before
starting instead of waiting for a paced one (fast is right for a lab, spread is right for a busy
production server you do not want to hit with an I/O spike). -X stream opens a second connection
that streams WAL concurrently with the file copy, so every record the backup needs ends up inside
the backup's own pg_wal and it is self-contained; -X none would make it depend on the archive. -P
shows progress and -v is verbose. backup_label is written into the backup (never into the live
data directory in this mode) and records START WAL LOCATION, CHECKPOINT LOCATION, BACKUP FROM and
START TIMELINE; its presence is what tells a starting server "you are restoring a backup, begin
redo at this LSN, not at the one in pg_control". backup_manifest lists every file with a CRC32C
checksum, and pg_verifybackup DIR rechecks them. The lab cluster already allows local replication
connections under trust, which is why no extra role or pg_hba entry is needed.`,
      caution: code`
This lesson writes about 330 MB into $PGLAB/backup1; check free space first. Leave the backup in
place when you are finished: the next lesson restores from it, and module 09 may reuse it to seed
a standby.`,
      code: code`
# Run all of this as the postgres OS user, in a shell:  su - postgres
export PATH=/usr/lib/postgresql/16/bin:$PATH
PGLAB=$HOME/pglab

df -h /var/lib/postgresql
du -sh "$PGLAB/primary"

# Take the backup. Delete any previous attempt first: pg_basebackup refuses to
# write into a non-empty directory.
rm -rf "$PGLAB/backup1"
time pg_basebackup -h /tmp -p 5440 -D "$PGLAB/backup1" -c fast -X stream -P -v

du -sh "$PGLAB/backup1"

# The two LSNs that make the smeared file copy usable.
cat "$PGLAB/backup1/backup_label"

# It is a whole data directory, minus the things that must not be copied
# (postmaster.pid, temporary files, the contents of pg_replslot).
ls "$PGLAB/backup1"

# -X stream put the WAL the backup needs inside the backup itself.
ls "$PGLAB/backup1/pg_wal"

# Every file, with a checksum.
head -c 400 "$PGLAB/backup1/backup_manifest"; echo
pg_verifybackup "$PGLAB/backup1"

# Break one file on purpose and watch verification catch it, then undo it.
echo "corruption" >> "$PGLAB/backup1/PG_VERSION"
pg_verifybackup "$PGLAB/backup1"
printf '16\n' > "$PGLAB/backup1/PG_VERSION"
pg_verifybackup "$PGLAB/backup1"

df -h /var/lib/postgresql`,
      expectedResult: code`
pg_basebackup narrates its own algorithm:

  pg_basebackup: initiating base backup, waiting for checkpoint to complete
  pg_basebackup: checkpoint completed
  pg_basebackup: write-ahead log start point: 0/A30000D8 on timeline 1
  pg_basebackup: starting background WAL receiver
  pg_basebackup: created temporary replication slot "pg_basebackup_15121"
   34394/322750 kB (10%), 0/1 tablespace
  322760/322760 kB (100%), 1/1 tablespace
  pg_basebackup: write-ahead log end point: 0/A30001B0
  pg_basebackup: waiting for background process to finish streaming ...
  pg_basebackup: syncing data to disk ...
  pg_basebackup: base backup completed

Read the order: a checkpoint first (that is what -c fast forced), then a start LSN, then the copy,
then an end LSN. 330 MB in about five seconds on this lab:

  real  0m5.094s

backup_label is seven lines and is the entire contract:

  START WAL LOCATION: 0/A30000D8 (file 0000000100000000000000A3)
  CHECKPOINT LOCATION: 0/A3000110
  BACKUP METHOD: streamed
  BACKUP FROM: primary
  START TIME: 2026-09-03 01:38:30 UTC
  LABEL: pg_basebackup base backup
  START TIMELINE: 1

A server that finds this file at startup ignores the redo point in pg_control (which is stale --
it was copied mid-backup) and begins redo at START WAL LOCATION instead. It refuses to accept
connections until it has replayed past the backup end LSN, because before that point the files are
not yet mutually consistent. That is the "consistent recovery state reached" line you will see in
the next lesson.

The directory is a data directory: PG_VERSION, base, global, pg_wal, pg_xact, postgresql.conf,
postgresql.auto.conf, backup_label, backup_manifest. Note that postmaster.pid is absent --
pg_basebackup excludes it, so the copy can be started without pretending to be the original
server. Because of -X stream, pg_wal already contains the one segment spanning the start and end
LSNs:

  0000000100000000000000A3
  archive_status

The manifest is JSON, one entry per file:

  { "Path": "backup_label", "Size": 227, "Last-Modified": "2026-09-03 01:38:30 GMT",
    "Checksum-Algorithm": "CRC32C", "Checksum": "a28534be" },

and verification passes:

  backup successfully verified

After appending a line to PG_VERSION, pg_verifybackup fails loudly and names the file:

  pg_verifybackup: error: "PG_VERSION" has size 14 on disk but size 3 in the manifest

Restoring the file makes it print "backup successfully verified" again. Free space drops by about
330 MB (8.3 G used before, 8.7 G after, still 15 G available here).`,
      systemsLens: code`
The important idea is that a backup of a system with a log is not a copy of the state. It is a
copy of the state at some unknown, smeared instant, plus a range of the log that pins it to a
knowable one. The copy alone is worthless; the pair is exact. Once you see that, a lot of
distributed-systems machinery reads the same way: a Raft snapshot is meaningless without its
last-included-index, an LSM tree's SSTables are meaningless without the manifest that says which
of them form a version, a broker's segments are meaningless without its log-end offset. State plus
a position in a log, always.

This is also why a file-level copy of a running database taken with rsync or cp is not a backup,
while a filesystem or volume snapshot IS one: the snapshot is atomic across all files, so it is
exactly equivalent to a crash, and PostgreSQL already knows how to recover from a crash.
Non-atomic copies are equivalent to nothing at all, unless you tell the database you are taking
one -- which is what the replication protocol behind pg_basebackup, or the
pg_backup_start/pg_backup_stop pair, is for.

The last piece is verification. A backup you have never restored is a hypothesis, and
backup_manifest plus pg_verifybackup only upgrades it to a checksummed hypothesis: it proves the
bytes are the bytes that were copied, not that they make a working database. The only test that
counts is a restore, which is the next lesson.`,
      challenge: code`
Take a second backup with -X none instead of -X stream and compare the two pg_wal directories. The
second is empty, which means that backup is restorable only while $PGLAB/archive still holds every
segment from its START WAL LOCATION onwards. Then work out the retention rule this implies: how
far back must your archive reach for your oldest backup to still be restorable, and what happens
to that rule the day archive_command starts failing silently?`,
    },

    {
      slug: "point-in-time-recovery",
      tags: ["pitr", "recovery", "backup", "timelines"],
      title: "Undo a dropped table by restoring to a moment in time",
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "mixed",
      estimatedMinutes: 40,
      prerequisites: ["base-backup", "redo-point-bounds-recovery"],
      overview: code`
Now put the pieces together. You have a base backup (a smeared file copy plus two LSNs) and an
archive holding every WAL segment the cluster has ever sealed. Between them they let you
reconstruct the database as it was at any instant the archive covers -- including the instant one
second before somebody dropped a table.

You will drop a table on purpose, having first recorded the timestamp of a moment you know was
safe. Then you restore backup1 into a second data directory, tell it to replay the archive up to
that timestamp and stop there, and start it on port 5441 alongside the untouched original. The
restored server replays forward, announces "recovery stopping before commit of transaction NNN",
promotes itself onto a new timeline, and the table is there. The original on 5440 never notices.`,
      syntaxBreakdown: code`
Recovery is configured with ordinary GUCs plus a signal file. recovery.signal (an empty file in
the data directory) puts the server into archive recovery; without it the settings are ignored.
restore_command is a shell command with %f (the segment name wanted) and %p (where to put it),
used to pull segments from the archive; it must exit 0 on success and non-zero when the file does
not exist, which is how the server discovers the end of the archive. recovery_target_time is the
stopping point, and it means "stop before the first transaction that commits after this time" --
recovery is transaction-granular, not statement-granular. The alternatives are recovery_target_lsn,
recovery_target_xid, recovery_target_name (set beforehand with pg_create_restore_point) and
recovery_target = 'immediate', which stops as soon as the backup is consistent.
recovery_target_inclusive (default on) decides whether the target transaction itself is applied.
recovery_target_action decides what happens on arrival: promote (finish recovery, pick a new
timeline, accept writes), pause (stay read-only so you can look before committing to it) or
shutdown. Promotion always allocates a new timeline ID, so the branch you just created can never
be confused with the history you branched from. For the timestamp itself, a timestamptz cast to
text -- '2026-09-03 01:39:22.432813+00' -- carries its UTC offset and can be pasted straight into
the config file; clock_timestamp() gives the real wall clock at that instant, where now() would
give the transaction's start time.`,
      caution: code`
This lesson drops a table in the lab database on purpose and starts a SECOND PostgreSQL instance
on port 5441. Nothing here touches the 5440 server's data directory. The final block stops and
deletes $PGLAB/pitr so the lab is back to its module-01 layout -- do not skip it. $PGLAB/backup1
stays where it is: module 09 may reuse it. Note that the restored instance inherits
archive_mode = on from the copied postgresql.conf, so when it promotes it writes 00000002.history
into $PGLAB/archive. That is deliberate; the next lesson reads it.`,
      setup: code`
drop table if exists ckpt_pitr_marks;
create table ckpt_pitr_marks(mark text primary key, at timestamptz, lsn pg_lsn);`,
      code: code`
-- Session A, on port 5440. Create something valuable, mark a safe moment, then
-- have the accident. ckpt_pitr_marks is the notebook: it survives the accident
-- and holds the timestamp you will recover to.
drop table if exists ckpt_pitr;
create table ckpt_pitr(id int, note text);
insert into ckpt_pitr select g, 'important row ' || g from generate_series(1,5) g;
select count(*) as rows_before_accident from ckpt_pitr;

-- The mark. clock_timestamp() is the real wall clock at this instant, and
-- pg_current_wal_lsn() is the same moment expressed as a log position (which is
-- what recovery_target_lsn would take instead).
insert into ckpt_pitr_marks values ('safe', clock_timestamp(), pg_current_wal_lsn());

select pg_sleep(3);

-- The accident.
drop table ckpt_pitr;
insert into ckpt_pitr_marks values ('after_drop', clock_timestamp(), pg_current_wal_lsn());

-- Seal the segment holding the DROP so the archiver ships it. Without this you
-- would wait up to archive_timeout for a segment that is nowhere near full.
select pg_switch_wal();

select * from ckpt_pitr_marks order by at;

-- This is the string you paste into recovery_target_time: one second after the
-- safe mark, still two seconds before the DROP committed. Copy the output.
select (at + interval '1 second')::text as recovery_target_time
from ckpt_pitr_marks where mark = 'safe';

-- ==========================================================================
-- SHELL, as the postgres OS user. Run by hand; no lesson runner can start a
-- second server. Paste the timestamp you just copied as TARGET.
--
--   export PATH=/usr/lib/postgresql/16/bin:$PATH
--   PGLAB=$HOME/pglab
--   TARGET='2026-09-03 01:39:22.432813+00'
--
--   rm -rf "$PGLAB/pitr"
--   cp -a "$PGLAB/backup1" "$PGLAB/pitr"
--   rm -f "$PGLAB/pitr/log/postgresql.log"   # the copied log is the primary's
--
--   cat >> "$PGLAB/pitr/postgresql.conf" <<CONF
--
--   # --- point-in-time recovery (module 08) ---
--   port = 5441
--   cluster_name = 'lab-pitr'
--   restore_command = 'cp /var/lib/postgresql/pglab/archive/%f %p'
--   recovery_target_time = '$TARGET'
--   recovery_target_action = 'promote'
--   CONF
--
--   touch "$PGLAB/pitr/recovery.signal"
--   pg_ctl -D "$PGLAB/pitr" -l "$PGLAB/pitr.log" start -w
--
--   grep -E 'point-in-time|redo (starts|done)|consistent recovery|recovery stopping|last completed transaction|new timeline|ready to accept' "$PGLAB/pitr/log/postgresql.log"
--
-- ==========================================================================

-- Session A again, still on 5440: the original is untouched, still on timeline
-- 1, and the table is still gone here.
select timeline_id from pg_control_checkpoint();
select to_regclass('ckpt_pitr') as ckpt_pitr_on_the_primary;

-- ==========================================================================
-- SHELL: connect to the RESTORED server on 5441 and collect the evidence.
--
--   psql -h /tmp -p 5441 -d lab -c 'select count(*) as rescued_rows from ckpt_pitr'
--   psql -h /tmp -p 5441 -d lab -c 'select * from ckpt_pitr order by id limit 3'
--   psql -h /tmp -p 5441 -d lab -c 'select * from ckpt_pitr_marks order by at'
--   psql -h /tmp -p 5441 -d lab -c 'select pg_is_in_recovery(), timeline_id from pg_control_checkpoint()'
--   psql -h /tmp -p 5441 -d lab -c 'select pg_walfile_name(pg_current_wal_lsn())'
--
-- Then tear it down. backup1 stays; only the restored instance goes away.
--
--   pg_ctl -D "$PGLAB/pitr" stop -m fast -w
--   rm -rf "$PGLAB/pitr" "$PGLAB/pitr.log"
--   ls "$PGLAB"                     # archive, backup1, primary, primary.log
--   ss -ltn | grep -E '5440|5441'   # only 5440 remains
--
-- ==========================================================================

-- Session A, last check: the lab is exactly as it was, one dropped table poorer.
select timeline_id, redo_lsn from pg_control_checkpoint();`,
      expectedResult: code`
On 5440 the notebook reads:

  mark       |              at               |    lsn
  safe       | 2026-09-03 01:39:21.432813+00 | 0/A402CE48
  after_drop | 2026-09-03 01:39:24.453604+00 | 0/A4030698

so the target string is 2026-09-03 01:39:22.432813+00, comfortably between them.

The restored server starts in about six seconds and its log is the whole story, in order:

  LOG:  starting point-in-time recovery to 2026-09-03 01:39:22.432813+00
  LOG:  restored log file "0000000100000000000000A3" from archive
  LOG:  redo starts at 0/A30000D8
  LOG:  restored log file "0000000100000000000000A4" from archive
  LOG:  consistent recovery state reached at 0/A30001B0
  LOG:  database system is ready to accept read-only connections
  LOG:  recovery stopping before commit of transaction 88511, time 2026-09-03 01:39:24.451439+00
  LOG:  redo done at 0/A4030270 system usage: CPU: user: 0.00 s, system: 0.01 s, elapsed: 0.12 s
  LOG:  last completed transaction was at log time 2026-09-03 01:39:21.433128+00
  LOG:  restored log file "0000000100000000000000A4" from archive
  LOG:  selected new timeline ID: 2
  LOG:  database system is ready to accept connections

Every line is worth a sentence. "redo starts at 0/A30000D8" is backup_label's START WAL LOCATION,
not pg_control's stale redo point. "consistent recovery state reached at 0/A30001B0" is the backup
end LSN: only there do the smeared files become a database, and only there does it accept
read-only connections. "recovery stopping before commit of transaction 88511, time
2026-09-03 01:39:24.451439+00" is the DROP TABLE -- replay walked right up to it and refused to
apply it, which is what "transaction-granular" means and why your target only has to land in the
gap, not on a precise instant. "last completed transaction was at log time 01:39:21.433128" is the
INSERT of the 'safe' mark. Then promotion: "selected new timeline ID: 2".

Connecting to 5441 shows the rescued table:

  rescued_rows = 5

   id |      note
    1 | important row 1
    2 | important row 2
    3 | important row 3

and a notebook that stops exactly where recovery did -- 'safe' is present, 'after_drop' is not,
because its transaction committed after the target:

  mark | at                            | lsn
  safe | 2026-09-03 01:39:21.432813+00 | 0/A402CE48

  pg_is_in_recovery | timeline_id           ->  f | 2
  pg_walfile_name(pg_current_wal_lsn())     ->  0000000200000000000000A4

pg_is_in_recovery() is false because recovery_target_action = promote finished the job, the
control file says timeline 2, and the WAL file names now begin 00000002. Meanwhile on 5440,
timeline_id is still 1 and to_regclass('ckpt_pitr') is NULL: the primary was never involved.

Teardown prints "server stopped", and afterwards $PGLAB contains archive, backup1, primary and
primary.log, with only 5440 in the ss output. The one lasting trace is in the archive, put there
by the promoted instance before you deleted it -- 00000002.history and one timeline-2 segment.
That is the next lesson.`,
      systemsLens: code`
Point-in-time recovery is the payoff for treating the log as the system of record. Because every
change was written to an ordered, replayable stream before it touched a page, any prefix of that
stream is a valid database state, and a backup is just a cheap starting point so you do not have
to replay from the beginning of time. Event-sourced systems sell this as a feature; PostgreSQL has
it as a side effect of crash safety. The same property is why a stream processor can rebuild a
state store from an offset, and why an LSM tree can rebuild a memtable from a WAL prefix.

Two design details are worth stealing. First, the stopping point is a transaction boundary, not a
clock reading: replaying half a transaction would produce a state no observer ever saw, so the
system stops before a commit instead. Prefixes of a log are only safe if the log's units are
atomic. Second, promotion allocates a new timeline. The moment you recover to a point in the past
and start accepting writes, you have created a branch, and the future you branched away from still
exists in the archive. Giving that branch an identity -- baked into every WAL file name from then
on -- means a server can never accidentally replay records from the wrong history. That is exactly
the problem term numbers solve in Raft and epoch numbers solve in a fencing token: a monotonically
increasing identity that makes divergent histories detectably different instead of silently
interleaved.

And the operational moral: this restore took six seconds because the database is 330 MB and the
archive is on the same disk. Your RTO for a PITR is copy-the-backup plus replay-the-archive, and
both scale with size and with how old your newest backup is. That is a number you should measure
before you need it, not during.`,
      challenge: code`
Redo the restore twice more with different targets. First recovery_target = 'immediate', which
stops the moment the backup is consistent: does ckpt_pitr exist? Second, use
recovery_target_action = 'pause' instead of 'promote' and connect while the server is still in
recovery -- pg_is_in_recovery() is true, writes are rejected, and you can inspect the state before
committing to it, then continue with pg_wal_replay_resume(). Which of the two would you actually
use at 3 a.m. during a real incident, and why?`,
    },

    {
      slug: "timeline-history",
      tags: ["timelines", "recovery", "pitr", "replicated-log"],
      title: "Timelines: the archive remembers both histories",
      difficulty: "intermediate",
      safetyLevel: "read-only",
      runIn: "mixed",
      estimatedMinutes: 15,
      prerequisites: ["point-in-time-recovery", "wal-files-and-recycling"],
      overview: code`
The restored server is gone, but it left a fossil. When it promoted it allocated timeline 2 and
wrote a history file into the shared archive recording exactly where it branched off timeline 1.
That eight-hex-digit prefix on every WAL segment name -- the one you have been ignoring since
module 07 -- is what keeps two divergent histories of the same cluster from being mistaken for
each other.

This lesson is short and read-only: look at the history file, count the segments per timeline in
the archive, and reason out the consequence that sets up the whole replication module. A server
that has diverged onto its own timeline cannot follow a server on another one, because their logs
agree on a prefix and then disagree, and there is no way to apply one on top of the other.`,
      syntaxBreakdown: code`
A WAL segment file name is 24 hex characters: 8 for the timeline ID, 8 for the high half of the
LSN, 8 for the segment number. pg_walfile_name(lsn) builds that name for the current timeline.
When a server promotes it picks the lowest unused timeline ID and writes TTTTTTTT.history into
pg_wal and, with archive_mode on, into the archive; the file holds one tab-separated line per
ancestor -- parent timeline, the LSN where the branch happened, and the reason. A server
recovering from an archive reads the history files to learn which timelines to follow;
recovery_target_timeline defaults to 'latest', which is how a new standby finds its way onto the
current branch. pg_control_checkpoint() reports the local timeline_id: a crash recovery keeps it,
a promotion increments it. psql's \! runs a shell command, and $PGLAB is exported by the lab
environment from module 01.`,
      code: code`
-- The fossil left by the promoted PITR instance, straight out of the archive.
\! ls -l $PGLAB/archive/*.history
\! cat $PGLAB/archive/00000002.history

-- One tab-separated line: parent timeline, branch LSN, reason. Compare that LSN
-- with the "redo done at" line in the previous lesson's recovery log.

-- Both histories sit in the archive side by side, distinguishable only by the
-- first eight characters of the file name.
\! ls -1 $PGLAB/archive | grep -E '^[0-9A-F]{24}$' | cut -c1-8 | sort | uniq -c

-- The living cluster is still on timeline 1 and keeps writing 00000001... files.
select timeline_id, redo_lsn from pg_control_checkpoint();
select pg_current_wal_lsn() as lsn,
       pg_walfile_name(pg_current_wal_lsn()) as current_segment;

-- The same history file, parsed, so the branch point becomes a real LSN and the
-- last segment the two timelines share becomes a real file name. A superuser may
-- read an absolute path with pg_read_file().
select split_part(line, chr(9), 1)::int as parent_timeline,
       split_part(line, chr(9), 2)::pg_lsn as branch_lsn,
       pg_walfile_name(split_part(line, chr(9), 2)::pg_lsn) as last_shared_segment,
       split_part(line, chr(9), 3) as reason
from regexp_split_to_table(
       pg_read_file('/var/lib/postgresql/pglab/archive/00000002.history'), chr(10)) line
where line <> '';

-- Everything the archiver has shipped, and the fact that nothing ever prunes it.
select archived_count, last_archived_wal, last_archived_time, failed_count
from pg_stat_archiver;
\! du -sh $PGLAB/archive`,
      expectedResult: code`
The history file is 51 bytes and says everything:

  -rw------- 1 postgres postgres 51 Sep  3 01:40 /var/lib/postgresql/pglab/archive/00000002.history

  1	0/A4030270	before 2026-09-03 01:39:24.451439+00

Timeline 2's parent is timeline 1; the branch is at 0/A4030270, which is precisely the "redo done
at 0/A4030270" from the PITR log; and the reason is "before" the commit time of the DROP. Any
server that later reads this archive can reconstruct the family tree from these files alone.

Segment counts by timeline prefix:

    171 00000001
      1 00000002

171 segments of the original history and one segment of the branch -- the promoted server only
lived long enough to write 0000000200000000000000A4 before you shut it down. Note that the branch
and its parent both have a segment numbered ...A4: two files covering overlapping LSN ranges with
different contents, which is exactly the divergence the timeline prefix exists to keep apart.
(Your timeline-1 count will be larger than mine; nothing in this lab ever deletes an archived
segment.)

The living cluster is unchanged, and still writing timeline-1 files:

  timeline_id |  redo_lsn
            1 | 0/A94DC030

  lsn        | current_segment
  0/ACDCDEB8 | 0000000100000000000000AC

Parsing the history file turns the fossil into three usable facts:

  parent_timeline | branch_lsn |   last_shared_segment    |          reason
                1 | 0/A4030270 | 0000000100000000000000A4 | before 2026-09-03 01:39:24.451439+00

pg_stat_archiver shows a small archived_count (17) because its counters were reset by the crash in
lesson 2, failed_count 0, and last_archived_wal keeping pace with the current segment. The
directory itself has never been pruned and is around 2.7 GB.

The thing to take away: the primary on 5440 and the now-deleted PITR instance both wrote WAL
covering LSNs after 0/A4030270, and both sets of files sit in the same directory without
colliding, because their names differ in the first eight characters.`,
      systemsLens: code`
A timeline ID is a fencing token for history itself. Two servers that both accepted writes after
the same LSN have produced logs that are byte-identical up to a point and then irreconcilable, and
the only safe thing to do is make that fact loud. PostgreSQL makes it loud by putting the branch
identity in every file name, so a replay can never even open the wrong file by accident, and by
writing a history file so any newcomer can work out the ancestry without asking anyone.

This is the same problem Raft solves with terms, ZooKeeper with epochs, and a lease-based system
with fencing tokens: a monotonically increasing number attached to every decision, so a
participant that was out of the loop can detect that it was out of the loop. The alternative --
comparing contents, or trusting wall-clock timestamps -- fails exactly when you need it most,
during a partition or a botched failover.

The operational consequence is the reason module 09 exists. If you promote a standby to primary
and the old primary comes back, the old primary is on timeline 1, the new one is on timeline 2,
and they diverged at some LSN. The old primary cannot simply start streaming: it may hold WAL
after the divergence point that the new primary never saw, so applying the new primary's log on
top of its files would produce a database that never existed. Your choices are to rebuild it from
a fresh base backup, or to run pg_rewind, which reads the divergence LSN out of the history file
and copies back only the blocks that changed since then. "Split brain" is not mainly about two
servers accepting writes; it is about what you can prove afterwards, and a timeline is the proof.`,
      challenge: code`
Work out how a new standby would find its way here. If you restored backup1 again with
recovery_target_timeline = 'latest' and no recovery_target_time, which timeline would it end up
on, and which segments would it need from the archive? Then read 00000002.history once more and
state the rule precisely: below 0/A4030270 read timeline 1 files, at or above it read timeline 2.
That rule is all pg_rewind and every archive-based standby need to know.`,
    },
  ],
};
