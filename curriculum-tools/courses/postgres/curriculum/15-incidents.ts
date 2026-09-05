import { CANCEL_INCIDENT } from "./cancel-incident.ts";
import { code, type Module } from "../../../src/types.ts";
import { CORRUPTION_INCIDENT } from "./corruption-incident.ts";
import { FREEZE_INCIDENT } from "./freeze-incident.ts";
import { DISK_INCIDENT } from "./disk-incident.ts";

export const INCIDENTS: Module = {
  category: "reliability",
  title: "Capstone incidents: read the symptom, find the cause, get the cluster back",
  lessons: [
    DISK_INCIDENT,
    CORRUPTION_INCIDENT,
    FREEZE_INCIDENT,
    CANCEL_INCIDENT,
    {
      slug: "postmortem-from-the-log",
      tags: ["postmortem", "logging", "recovery", "timelines", "failover"],
      title: "Postmortem: reconstruct the crash and the failover from the log alone",
      difficulty: "advanced",
      safetyLevel: "read-only",
      runIn: "tool",
      estimatedMinutes: 30,
      prerequisites: [
        "crash-and-redo",
        "point-in-time-recovery",
        "read-the-server-log",
        "cascading-and-failback",
      ],
      overview: code`
The incident is over. Somebody has to write down what happened, and all you have is what the
servers wrote down themselves: $PGLAB/primary/log/postgresql.log and the .history files in
$PGLAB/archive. No metrics, no traces, nobody's memory.

This lesson turns those two sources into a timeline of timestamp, event, LSN and timeline id --
for the crash you caused in module 07 and the promote / rewind / failback you ran in module 09.
Nothing here writes anything. The skill being taught is which twenty lines out of ten thousand are
the ones that carry state transitions, and how to read an LSN and a timeline id as the two
coordinates that place every event in the cluster's history.

It also teaches the most uncomfortable lesson in postmortem work: some of your evidence is
destroyed by the recovery itself, and you have to notice that rather than conclude nothing
happened.`,
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
      syntaxBreakdown: code`
### In plain terms

This postmortem starts after the incident, with only server logs and timeline-history files left as
evidence. You will turn those files into a chronological table of state transitions, log sequence
numbers, and timeline IDs, then inspect the durable branch records left by failover. The skill is
knowing which lines prove a crash, recovery, promotion, or readiness instead of treating every log
line as equally important.

### What you are learning

- **Evidence reconstruction:** Logs provide ordered events; filtering them turns noise into an incident timeline.
- **LSNs and timelines:** An LSN locates a WAL position, while a timeline ID identifies the branch of cluster history.
- **History files:** A timeline .history file preserves parent and fork-point information after log rotation.
- **Evidence loss:** Recovery can overwrite or rotate evidence, so a missing line is not proof that an event never happened.

### Piece by piece

- **pg_read_file('log/postgresql.log')** (server file-reading function)
  - What it is: It reads a file relative to the data directory for a superuser.
  - What it does here: It loads the primary server log into the reconstruction query.
  - What it gives us: Raw log lines; on a busy system, reading the whole file may be expensive.
- **pg_stat_file and pg_stat_file(...).size** (file metadata function)
  - What it is: It reports metadata such as byte length for a server-side file.
  - What it does here: It measures log_size before parsing and shows how much evidence exists.
  - What it gives us: A size to compare with future rotations or bounded reads.
- **pg_is_in_recovery() and pg_control_checkpoint()** (recovery and control-state functions)
  - What they are: The first says whether this server is a standby; the second exposes checkpoint timeline and LSN.
  - What they do here: Setup records whether the current node is still recovering and where its control state is.
  - What they give us: still_a_standby, current_timeline, and checkpoint_lsn for the ending state.
- **regexp_split_to_table and chr(10)** (SQL text functions)
  - What they are: regexp_split_to_table emits one row per text fragment; chr(10) creates a newline delimiter.
  - What they do here: They turn the log into numbered rows for filtering.
  - What they give us: One line and ordinal n per record, preserving chronological order.
- **WITH ORDINALITY** (SQL row-numbering clause)
  - What it is: It adds a generated position to rows emitted by a set-returning function.
  - What it does here: It lets the query order matched log events in file order.
  - What it gives us: n, the source-line position used to reconstruct sequence.
- **substring(... from 'pattern')** (SQL regular-expression function)
  - What it is: It extracts the first text matching a regular expression.
  - What it does here: It pulls timestamp, LSN, and timeline text from selected log messages.
  - What it gives us: at, lsn, and tli columns; blank values mean that event type did not contain that field.
- **~, !~, and regular-expression filters** (PostgreSQL pattern operators)
  - What they are: ~ requires a regex match; !~ rejects a match.
  - What they do here: They keep only state-transition phrases, real timestamped lines, and non-query text.
  - What they give us: A concise event list without continuation lines or logged SQL containing the same words.
- **coalesce, left, and ORDER BY n** (SQL formatting and ordering expressions)
  - What they are: coalesce substitutes an empty value for null; left truncates text; ORDER BY sorts results.
  - What they do here: They make missing timeline IDs explicit, keep event text readable, and preserve log order.
  - What they give us: Stable columns for a postmortem table.
- **timeline_id and checkpoint_lsn from pg_control_checkpoint** (control-state fields)
  - What they are: They identify the current WAL branch and the checkpoint's WAL position.
  - What they do here: They provide a final-state coordinate to compare with reconstructed history.
  - What they give us: A numeric timeline and an LSN such as 1/ABC123.
- **pg_ls_dir and .history files** (directory function and timeline artifacts)
  - What they are: pg_ls_dir lists server-directory entries; each timeline history file records its parent timeline and fork LSN.
  - What they do here: They locate failover history files in the archive and read their contents.
  - What they give us: Durable branch evidence that can survive log rotation.
- **pg_read_file(path, offset, length)** (bounded file read)
  - What it is: It reads only a byte window from a server-side file.
  - What it does here: It can inspect a marked log range or archive file without loading everything.
  - What it gives us: Bounded evidence; offsets must come from a known file size or marker, not a guessed path.
`,
      setup: code`
select current_setting('data_directory') as datadir,
       pg_size_pretty((pg_stat_file('log/postgresql.log')).size) as log_size;
select timeline_id as current_timeline, checkpoint_lsn from pg_control_checkpoint();
select pg_is_in_recovery() as still_a_standby;`,
      code: code`
-- 1. THE RECONSTRUCTION. One query, and it is the deliverable: every state transition the
--    server logged, with its LSN and the timeline it names.
with lines as (
  select n, l from regexp_split_to_table(pg_read_file('log/postgresql.log'), chr(10))
       with ordinality as t(l, n)
), events as (
  select n,
         substring(l from '^[0-9-]+ ([0-9:]+)') as at,
         substring(l from '[A-Z]+:  .*') as msg
  from lines
  where l ~ ('was interrupted|not properly shut down|entering standby mode|redo starts at'
          || '|redo done at|consistent recovery state reached|started streaming WAL'
          || '|received promote request|selected new timeline|archive recovery complete'
          || '|ready to accept|replication terminated|invalid record length'
          || '|invalid resource manager')
    and l ~ '^[0-9]{4}-'          -- a real log line, not a continuation line
    and l !~ 'statement:'         -- not the text of a logged query (this one, for instance)
)
select n, at,
       substring(msg from '[0-9A-F]+/[0-9A-F]+') as lsn,
       coalesce(substring(msg from 'timeline(?: ID)?:? ([0-9]+)'), '') as tli,
       left(msg, 74) as event
from events order by n;

-- 2. THE OTHER SOURCE. A .history file is written once, at the moment of a failover, and
--    it outlives every log rotation. Column 1 is the parent timeline, column 2 is the exact
--    LSN where the child branched off it.
select f as history_file
from pg_ls_dir(current_setting('data_directory') || '/../archive') f
where f like '%.history' order by f;
select pg_read_file(current_setting('data_directory') || '/../archive/00000003.history')
       as tli3_history;
select f as in_pg_wal from pg_ls_dir('pg_wal') f where f like '%.history' order by f;
select pg_read_file('pg_wal/00000002.history') as tli2_local,
       pg_read_file(current_setting('data_directory') || '/../archive/00000002.history')
       as tli2_archived;

-- 3. CROSS-CHECK the story against the control file and the WAL file names on disk.
select timeline_id, checkpoint_lsn, redo_lsn from pg_control_checkpoint();
select name from pg_ls_waldir() where name ~ '^[0-9A-F]{24}$' order by name limit 4;

-- 4. WHAT IS NOT THERE. Count how far back the log actually goes, and compare that with
--    when this cluster was created.
select min(substring(l from '^[0-9-]+ [0-9:]+')) as oldest_line_in_log
from regexp_split_to_table(pg_read_file('log/postgresql.log'), chr(10)) as t(l)
where l ~ '^[0-9]{4}-';
select pg_postmaster_start_time() as this_postmaster_started,
       (pg_control_init()).max_data_alignment is not null as control_file_readable;
select (pg_stat_file('pg_wal/00000002.history')).modification as timeline2_created,
       (pg_stat_file('pg_wal/00000003.history')).modification as timeline3_created;`,
      expectedResult: code`
Step 1 on this lab prints the failover, in order, with nothing else in the way:

    n | at       | lsn        | tli | event
    5 | 11:52:23 |            |     | LOG:  database system was interrupted while in recovery at log time
    7 | 11:52:23 |            |     | LOG:  entering standby mode
    9 | 11:52:23 | 1/AD000028 |     | LOG:  redo starts at 1/AD000028
   11 | 11:52:23 | 1/AE035F88 |     | LOG:  consistent recovery state reached at 1/AE035F88
   12 | 11:52:23 | 1/AE035F88 |     | LOG:  invalid record length at 1/AE035F88: expected at least 24, got 0
   13 | 11:52:23 |            |     | LOG:  database system is ready to accept read-only connections
   14 | 11:52:23 | 1/AE000000 | 2   | LOG:  started streaming WAL from primary at 1/AE000000 on timeline 2
   19 | 11:53:19 |            |     | LOG:  replication terminated by primary server
   25 | 11:53:19 | 1/AE036288 |     | LOG:  invalid resource manager ID 32 at 1/AE036288
   30 | 11:53:21 |            |     | LOG:  received promote request
   31 | 11:53:21 | 1/AE036210 |     | LOG:  redo done at 1/AE036210 system usage: CPU: user: 0.00 s,
   33 | 11:53:21 |            | 3   | LOG:  selected new timeline ID: 3
   34 | 11:53:21 |            |     | LOG:  archive recovery complete
   36 | 11:53:21 |            |     | LOG:  database system is ready to accept connections
  299 | 12:07:13 |            |     | LOG:  database system is ready to accept connections
  349 | 12:08:09 |            |     | LOG:  database system is ready to accept connections

Read as a narrative: at 11:52:23 this data directory came up as a STANDBY (line 7) even though it
is the node on port 5440 that started the course as the primary -- that is the pg_rewind from
module 09, which turned the old primary into a follower of the promoted node. It replayed from
1/AD000028, reached consistency at 1/AE035F88, opened read-only, and started streaming from the new
primary on TIMELINE 2. Fifty-six seconds later the upstream went away (line 19), replay hit the end
of the stream (line 25 -- "invalid resource manager ID" is a garbage-bytes-past-the-end message,
not corruption), and two seconds after that somebody promoted this node: timeline 3 is selected at
11:53:21 and it opens for writes. Total write outage: two seconds. Total time as a standby: 58
seconds. That is the module-09 failback, reconstructed from nothing but the log.

Your own log will show your run's timestamps and LSNs. What must be the same is the SHAPE: standby
mode -> consistent recovery state -> streaming on timeline N -> promote request -> selected new
timeline N+1 -> ready to accept connections.

Step 2, the durable record:

  history_file
  00000002.history
  00000003.history

  tli3_history
  1   1/AE02ECB8   no recovery target specified
  2   1/AE036288   no recovery target specified

Timeline 3's file names both of its ancestors: timeline 2 branched from timeline 1 at 1/AE02ECB8,
and timeline 3 branched from timeline 2 at 1/AE036288 -- which is exactly the LSN on line 25 above,
where replay stopped. Two independent sources, same number.

The last four "ready to accept connections" rows, hours later with no recovery lines before them,
are clean restarts -- on this lab, the stop/start pairs from corrupt-a-page-and-detect-it. A
restart with no "was interrupted" line above it is a graceful shutdown; that absence is a finding
in its own right.

Then the trap. The archive's 00000002.history says something different from the copy in pg_wal:

  tli2_local                              | tli2_archived
  1  1/AE02ECB8  no recovery target ...   | 1  0/A4030270  before 2026-09-03 01:39:24.451439+00

These are two DIFFERENT timeline 2s. The archived one was created by the point-in-time recovery in
module 08 (note "before <timestamp>" -- a recovery target, not a promotion). The local one was
created by the standby promotion in module 09, on a server with archive_mode = off, so it never
reached the archive. One archive directory, two histories that both claim the name 00000002, and
only the local copy agrees with the timeline 3 that actually exists. This is the exact hazard
module 09 warned about, visible as an artifact three lessons later, and it is why a real archive
belongs to exactly one lineage.

Step 3 corroborates: pg_control_checkpoint() reports timeline_id 3, and every WAL segment on disk
is named 0000000300000001000000D4, ...D5, ...D6 -- the 8-hex-digit prefix of a segment name IS the
timeline, so the file names alone tell you which branch of history you are on.

Step 4 is the uncomfortable part:

  oldest_line_in_log
  2026-09-03 11:52:23

The log begins at the moment of the rewind. Module 07's crash -- "database system was not properly
shut down; automatic recovery in progress", "redo starts at", "redo done at" -- happened hours
earlier on this same data directory and is NOT in this file. It was not rotated away: pg_rewind
does not exclude the log directory, so when it made this data directory a copy of the promoted
node, it overwrote log/postgresql.log with the other server's log. The recovery action destroyed
the evidence of the thing it was recovering from.

You can still prove that the earlier history existed, which is the point of step 4's last two
queries: the modification times of 00000002.history and 00000003.history are the timestamps of two
promotions, and the control file, the archive and the .history files all survived. When the log
cannot answer, the file system usually can.

So the postmortem you can actually defend has two sections: a minute-by-minute reconstruction of
the failover, and an explicit statement that the crash window is unrecoverable from this host
because the rewind overwrote it -- with the action item that log_directory must live outside the
data directory, or be shipped off the box, before you need it.`,
      systemsLens: code`
A postmortem is an exercise in reading a log you did not design for the question you now have, and
PostgreSQL is unusually generous here: its recovery log is a state machine transcript. Every line
above is a transition -- follower to consistent, consistent to streaming, streaming to leader --
and each carries the two coordinates that make the transitions comparable across machines: an LSN
(position in the log) and a timeline (which branch of history). That pair is the same (index, term)
that Raft writes into every entry for the same reason: without it you cannot tell a node that is
behind from a node that is on a different branch.

The .history file is the durable, cross-node version of that fact. Logs rotate, disks get
reimaged, containers vanish; the history file is small, written once, and shipped to the archive,
which makes it the artifact you actually want during an incident. The generalisable habit: when a
system changes epochs, write one immutable record that names the old epoch, the new epoch, and the
exact position of the switch -- and put it somewhere other than the thing that just failed.

The overwritten log is the real lesson though. Recovery tools are destructive by construction --
pg_rewind, restore-from-snapshot, reimage-and-rejoin all replace local state with remote state, and
local state includes your evidence. Ship logs off the host, keep them outside the directory the
recovery tool owns, and treat "the logs start exactly when the incident ended" as a finding rather
than an absence of findings.`,
      challenge: code`
Turn step 1 into something you would actually run under pressure: add pg_stat_file(...).size and
read only the last megabyte, so it works on a 4 GB log. Then extend the event list to cover the
incidents from the rest of this module -- "invalidating obsolete replication slot",
"terminating process", "to prevent wraparound", "page verification failed" -- and you have a single
query that reconstructs any of them from a log you have never seen before.`,
    },
  ],
};
