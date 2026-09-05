import { code, type Module } from "../../../src/types.ts";
import { BACKUP_WORKLOAD } from "./backup-workload.ts";
import { WAL_PRESSURE } from "./wal-pressure.ts";
import { RECOVERY_COST } from "./recovery-cost.ts";
import { CHECKPOINT_ANATOMY } from "./checkpoint-workload.ts";
import { ARCHIVE_PRUNING_REMINDER } from "./archive-reminder.ts";

export const CHECKPOINTS: Module = {
  category: "checkpointing",
  title: "Checkpoints, backups, and point-in-time recovery",
  lessons: [
    CHECKPOINT_ANATOMY,

    RECOVERY_COST,

    WAL_PRESSURE,

    BACKUP_WORKLOAD,

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
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
      syntaxBreakdown: code`
### In plain terms

This experiment recovers a dropped table by replaying an archived WAL stream only up to a safe time.
You create a base backup, record a timestamp before the accident, restore into a second directory,
and promote the recovered server on port 5441. The original server stays unchanged, making the
difference between history reconstruction and ordinary rollback concrete.

### What you are learning

- **Point-in-time recovery:** A backup plus archived WAL can reconstruct an earlier committed state.
- **Recovery targets:** PostgreSQL stops replay at transaction boundaries, not halfway through SQL.
- **Timelines:** Promotion creates a new history branch so future writes cannot be confused with the old one.

### Piece by piece

- **clock_timestamp()**, **pg_current_wal_lsn()**, and **timestamptz::text** (SQL functions and cast). What they are: wall-clock, WAL-position, and timestamp-format tools.
  - What it does here: It records the safe mark and turns one second after it into configuration text.
  - What it gives us: A target timestamp between the safe mark and DROP's commit.
- **pg_switch_wal()** (SQL function). What it is: a request to finish the current WAL segment early.
  - What it does here: It seals the segment containing DROP so archive recovery can fetch it.
  - What it gives us: A segment that appears in the archive and can be replayed by the second server.
- **rm -rf**, **cp -a**, **cat >>**, and **touch** (shell file operations). What they are: remove, copy, append, and create-file commands.
  - What it does here: It clone backup1 into pitr, append recovery settings, and create recovery.signal.
  - What it gives us: A disposable restored data directory configured independently of port 5440.
- **pg_ctl -D ... start -w** and **stop -m fast -w** (server-control commands). What they are: start/stop operations with directory, wait, and shutdown-mode flags.
  - What it does here: It starts the restored server and later stops it cleanly; **-w** waits for completion and **-m fast** asks sessions to finish.
  - What it gives us: A live port-5441 instance and a clean teardown.
- **port = 5441** and **cluster_name** (configuration settings). What they are: listener and identity settings.
  - What it does here: It let the restored server run beside the primary.
  - What it gives us: **ss -ltn** can show both ports during the comparison.
- **restore_command** with **%f** and **%p** (recovery setting and placeholders). What they are: a shell fetch command where PostgreSQL substitutes requested filename and destination path.
  - What it does here: It copies each needed segment from the archive and returns nonzero at archive end.
  - What it gives us: Log lines naming restored segments and successful replay through the target.
- **recovery.signal**, **recovery_target_time**, and **recovery_target_action = promote** (recovery controls). What they are: signal file, stopping target, and post-target action.
  - What it does here: It enables archive replay, stops before the DROP commit, and promotes the recovered server.
  - What it gives us: Five rescued rows, no dropped table on the primary, and a new timeline.
- **recovery_target_action = pause**, **recovery_target = immediate**, and **pg_wal_replay_resume()** (challenge controls). What they are: alternative stop behaviors and resume function.
  - What it does here: It let you inspect a consistent or paused recovery before accepting it.
  - What it gives us: **pg_is_in_recovery() = true** while paused and a controlled choice before promotion.
- **psql -h /tmp -p 5441 -d lab -c** (client command and flags). What it is: a one-shot SQL client invocation.
  - What it does here: **-h**, **-p**, **-d**, and **-c** select socket, port, database, and query on the restored server.
  - What it gives us: Rescued row count, notebook contents, recovery state, timeline, and current segment.
- **pg_is_in_recovery()**, **timeline_id**, **to_regclass**, and **pg_walfile_name()** (SQL inspection functions).
  - What they are: recovery-state, history-ID, relation-existence, and segment-name readers.
  - What it does here: It compares the promoted copy with the untouched primary.
  - What it gives us: false/2 on the promoted copy and NULL for the dropped table on the primary.`,
      caution: code`${ARCHIVE_PRUNING_REMINDER}

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
      caution: ARCHIVE_PRUNING_REMINDER,
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
      syntaxBreakdown: code`
### In plain terms

The previous recovery created a second history, or timeline, when it promoted. This read-only lesson
examines the small history file that records where the branch began and compares segment filenames
from both histories. The timeline prefix is a safety label that prevents replaying the wrong future.

### What you are learning

- **Timeline IDs:** A monotonically increasing prefix distinguishes divergent WAL histories.
- **History files:** They record the parent timeline and exact branch LSN.
- **Archive ancestry:** A standby can choose the right files by following those records.

### Piece by piece

- **\! ls -l**, **cat**, **grep -E**, **cut -c1-8**, **sort**, **uniq -c**, and **du -sh** (psql shell escapes and filters). What they are: filesystem listing, text display, pattern filtering, prefix extraction, sorting, counting, and sizing tools.
  - What it does here: It inspects history files, counts segment prefixes, and measures the archive.
  - What it gives us: The 00000001/00000002 split and the branch history file's exact contents.
- **pg_walfile_name(lsn)** (SQL function). What it is: an LSN-to-segment filename converter.
  - What it does here: It maps the parsed branch LSN to the last segment shared by both timelines.
  - What it gives us: A concrete filename such as the shared ...A4 segment.
- **pg_control_checkpoint()** (SQL function). What it is: a reader of local checkpoint and history metadata.
  - What it does here: It reports **timeline_id** and **redo_lsn** for the living primary.
  - What it gives us: Timeline 1 evidence showing the primary was not promoted.
- **pg_read_file()**, **regexp_split_to_table()**, **split_part()**, **chr(9)**, and **::pg_lsn** (SQL text tools and cast). What they are: file reading, line splitting, tab-field extraction, tab construction, and LSN conversion.
  - What it does here: It parses the history file's parent timeline, branch position, and reason.
  - What it gives us: A typed row with **parent_timeline**, **branch_lsn**, **last_shared_segment**, and **reason**.
- **pg_stat_archiver** (statistics view). What it is: a view of archive attempts and most recent success.
  - What it does here: It reports archive progress after the previous recovery lessons.
  - What it gives us: **archived_count**, **last_archived_wal**, **last_archived_time**, and **failed_count**; compare counters with files because counters can reset.
- **recovery_target_timeline = 'latest'** (challenge setting). What it is: a rule for following the newest timeline during restore.
  - What it does here: It makes a new standby follow timeline 2 after the branch point.
  - What it gives us: The precise rule: below the branch LSN read timeline-1 files; at or above it read timeline-2 files.`,
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
