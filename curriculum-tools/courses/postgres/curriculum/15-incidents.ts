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
    {
      slug: "runaway-query-and-cancel",
      tags: [
        "timeouts",
        "connections",
        "incident",
        "observability",
        "transactions",
      ],
      title: "Incident: a runaway query, and the difference between cancel and terminate",
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "tool",
      sessions: 3,
      estimatedMinutes: 25,
      prerequisites: [
        "lock-queue-and-blocking-pids",
        "idle-in-transaction-kills-you",
      ],
      overview: code`
One query is pinning a CPU, the queue behind it is growing, and somebody in the incident channel
says "just kill it". There are two ways to do that and they are not interchangeable:
pg_cancel_backend stops the statement and leaves the session, pg_terminate_backend destroys the
whole connection. This lesson runs both against the same workload so you can see exactly what the
client gets, what pg_stat_activity says afterwards, and what happens to the uncommitted rows the
transaction had already written.

Then it installs the guardrail that means nobody has to make this decision at 3 a.m.:
statement_timeout, which is the same cancel, applied automatically, by the server, before anyone is
paged.`,
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 15 "Locks on Memory Structures".`,
      syntaxBreakdown: code`
### In plain terms

When one query consumes a CPU and blocks useful work, an operator must choose between stopping only
that statement and destroying the whole connection. This experiment first cancels a runaway query,
then terminates a second connection, so you can compare the client errors and the fate of uncommitted
rows. Finally, statement_timeout applies the safer cancel automatically.

### What you are learning

- **Cancel versus terminate:** Cancel aborts one statement but keeps the session; terminate rolls back and disconnects it.
- **Transaction aftermath:** A cancelled statement leaves an explicit transaction aborted until rollback.
- **Signal confirmation:** A true return means the signal was sent, not that the target has finished reacting.
- **Timeout guardrails:** statement_timeout automates cancellation, while lock and idle-transaction timeouts protect different waits.

### Piece by piece

- **pg_cancel_backend(pid)** (administrative function)
  - What it is: It sends an interrupt request to a backend identified by PID.
  - What it does here: Session B stops Session A's long statement while preserving A's connection.
  - What it gives us: true means the signal was sent; A receives canceling statement due to user request and remains connected.
- **pg_terminate_backend(pid)** (administrative function)
  - What it is: It requests that a backend end its connection and roll back its open transaction.
  - What it does here: Session B destroys Session C after the second runaway query starts.
  - What it gives us: true means the request was sent; C receives a FATAL termination message and disappears from pg_stat_activity.
- **pg_backend_pid()** (session identity function)
  - What it is: It returns the server PID serving the current connection.
  - What it does here: Sessions A and C print their own PIDs for the operator query to target.
  - What it gives us: session_a_pid and session_c_pid, which must match the activity rows before signaling.
- **generate_series(1,2000000000)** (row-producing function)
  - What it is: It emits integers through a very large inclusive range.
  - What it does here: The modulo filter creates a deliberately long-running count without requiring a large table.
  - What it gives us: A reproducible runaway query; cancel it rather than waiting for the range to finish.
- **pg_stat_activity** (activity view)
  - What it is: It shows connected backends, their current query, state, and wait information.
  - What it does here: Session B finds active client backends and later confirms cancellation or termination.
  - What it gives us: pid, state, xact_age, query_age, and shortened query text; active means executing, idle means connected but not running a query.
- **xact_start, query_start, date_trunc, and left** (activity timing and formatting expressions)
  - What they are: The start timestamps identify transaction and statement age; date_trunc rounds them; left shortens text.
  - What they do here: They make the on-call view readable and expose a long-lived transaction separately from its current query.
  - What they give us: xact_age, query_age, and a query label to target safely.
- **BEGIN, ROLLBACK, and transaction-aborted state** (transaction commands and state)
  - What they are: BEGIN opens a transaction; ROLLBACK abandons it; a statement error marks the transaction unusable until rollback.
  - What they do here: A's 1000 inserted rows remain uncommitted after cancel and disappear on rollback; C's rows roll back when termination closes it.
  - What they give us: rows_after_cancel = 0 and a concrete difference between statement and connection cancellation.
- **statement_timeout** (session timeout setting)
  - What it is: It cancels any statement running longer than the configured duration.
  - What it does here: The final query demonstrates automatic cancellation without an operator PID.
  - What it gives us: canceling statement due to statement timeout, the same class of error as manual cancel.
- **lock_timeout and idle_in_transaction_session_timeout** (related timeout settings)
  - What they are: lock_timeout limits waiting for a lock; idle_in_transaction_session_timeout ends an inactive open transaction.
  - What they do here: They are compared with statement_timeout as separate guardrails.
  - What they give us: A vocabulary for choosing the timeout that matches the failure mode.
- **ALTER ROLE ... SET** (role configuration command in the challenge)
  - What it is: It sets a default for sessions of one database role.
  - What it does here: The challenge considers a permanent 30-second statement timeout and exceptions for long jobs.
  - What it gives us: A policy choice; do not apply it to a production role without checking legitimate long statements.
- **pg_sleep(1)** (SQL delay function)
  - What it is: It pauses the current backend for one second.
  - What it does here: It gives the cancellation or termination request time to take effect before the follow-up query.
  - What it gives us: Stable post-signal activity and row-count observations.
`,
      setup: code`
drop table if exists inc_runaway;
create table inc_runaway(id int primary key, note text);`,
      code: code`
-- Session A. 1. A transaction that has already done real work, then a query that will not end.
begin;
insert into inc_runaway select g, 'a-' || g from generate_series(1,1000) g;
select count(*) as rows_written_but_not_committed from inc_runaway;
select pg_backend_pid() as session_a_pid;

-- Session A (blocks until Session B cancels it):
select count(*) /* inc-runaway-1 */ from generate_series(1, 2000000000) g where g % 7 = 0;

-- Session B. 2. The on-call view. query_age is how long this statement has run; xact_age is
-- how long the transaction has been open, which is the number that matters for bloat.
select pid, state, wait_event_type, wait_event,
       date_trunc('second', now() - xact_start) as xact_age,
       date_trunc('second', now() - query_start) as query_age,
       left(query, 44) as query
from pg_stat_activity
where backend_type = 'client backend' and pid <> pg_backend_pid() and state = 'active';

-- Session B. 3. Cancel it: stop the statement, keep the session.
select pid, pg_cancel_backend(pid) as signal_sent
from pg_stat_activity
where query like '%inc-runaway-1%' and pid <> pg_backend_pid();
select pg_sleep(1);
select pid, state, left(query, 44) as last_query
from pg_stat_activity
where query like '%inc-runaway-1%' and pid <> pg_backend_pid();

-- Session A. 4. What the client saw, and what is left of the transaction.
select 'is my transaction still usable?' as question;
rollback;
select count(*) as rows_after_cancel from inc_runaway;

-- Session C. 5. Round two, in a THIRD terminal, because this one is not coming back.
-- Same shape: a transaction with uncommitted work, then a runaway.
begin;
insert into inc_runaway select g, 'c-' || g from generate_series(2001,3000) g;
select pg_backend_pid() as session_c_pid;

-- Session C (blocks until Session B terminates it):
select count(*) /* inc-runaway-2 */ from generate_series(1, 2000000000) g where g % 11 = 0;

-- Session B. 6. Terminate it: destroy the connection, not just the statement.
select pid, pg_terminate_backend(pid) as signal_sent
from pg_stat_activity
where query like '%inc-runaway-2%' and pid <> pg_backend_pid();
select pg_sleep(1);
select count(*) as session_c_rows_in_pg_stat_activity
from pg_stat_activity
where query like '%inc-runaway-2%' and pid <> pg_backend_pid();

-- Session A. 7. The data outcome is identical to the cancel: nothing Session C wrote survived.
select count(*) as rows_after_terminate from inc_runaway;

-- Session A. 8. THE GUARDRAIL. Same runaway query, nobody paged.
set statement_timeout = '2s';
select count(*) /* inc-runaway-3 */ from generate_series(1, 2000000000) g where g % 13 = 0;
reset statement_timeout;
show lock_timeout;
show idle_in_transaction_session_timeout;
drop table inc_runaway;`,
      expectedResult: code`
Step 1: rows_written_but_not_committed = 1000 (visible only inside this transaction) and a pid.
The runaway then sits there; on this lab it runs for several minutes.

Step 2, from Session B:

  pid    | state  | wait_event_type | wait_event | xact_age | query_age | query
  156445 | active |                 |            | 00:00:00 | 00:00:00  | select count(*) /* inc-runaway-1 */ from gen

state = active with wait_event_type and wait_event both EMPTY is the signature of a CPU-bound
runaway: it is not blocked on anything, it is just doing pointless work. (Contrast with the lock
waits from module 06, where those two columns say Lock / transactionid.) The two ages are 00:00:00
here only because Session B ran a second after Session A; when you do this in two real terminals
they are minutes, and xact_age will be larger than query_age, because the transaction has been open
-- holding its snapshot and its 1000 uncommitted rows -- since before this statement started.

Step 3:

  pid    | signal_sent
  156445 | t

and one second later:

  pid    | state                         | last_query
  156445 | idle in transaction (aborted) | select count(*) /* inc-runaway-1 */ from gen

The backend is still there. The connection is still there. The transaction is still there -- and it
is poisoned: state is "idle in transaction (aborted)", which means it still holds its resources but
will reject every command until it ends. Note that signal_sent = t only means the signal was
delivered; it is not a promise that anything stopped.

Step 4, in Session A, the client's view:

  ERROR:  canceling statement due to user request
  ERROR:  current transaction is aborted, commands ignored until end of transaction block
   rows_after_cancel
                   0

Two errors, saying different things. The first is the cancel. The second is the price of cancelling
inside a transaction: the session survived but the transaction did not, and every subsequent
statement fails until you ROLLBACK. The 1000 inserted rows are gone -- a cancel aborts the whole
transaction, not just the statement, so partial work is never kept. (An application that catches the
cancel and retries the next statement without rolling back gets that second error forever; it is a
very common bug.)

Step 6:

  pid    | signal_sent
  156451 | t

  session_c_rows_in_pg_stat_activity
                                   0

The row is not in a different state -- it is gone. The process no longer exists. Session C sees:

  FATAL:  terminating connection due to administrator command
  server closed the connection unexpectedly
          This probably means the server terminated abnormally
          before or while processing the request.
  connection to server was lost

FATAL rather than ERROR, and the socket is closed. What happens next depends entirely on the
client: psql reading from a script or a pipe exits right there (which is why this round needs its
own terminal), while an interactive psql prints "The connection to the server was lost. Attempting
reset: Succeeded." and comes back with a NEW backend pid. A connection pool is the interesting case:
it hands the application a dead connection and the retry lands on a different session, with none of
the session state -- GUCs, temp tables, prepared statements, advisory locks -- that the old one had.

Step 7, from Session A: rows_after_terminate = 0. Identical data outcome to the cancel. Both of
Session C's 1000 rows and Session A's 1000 rows are gone, because in both cases the transaction
aborted.

Step 8, the guardrail:

  ERROR:  canceling statement due to statement timeout
   lock_timeout                        = 0
   idle_in_transaction_session_timeout = 0

Identical mechanism to step 3 -- the server cancelled its own statement -- with no human involved
and a bounded blast radius. The two zeros underneath are the two guardrails this lab does NOT set,
and they cover the failure modes statement_timeout misses: a statement waiting forever for a lock,
and a session holding a transaction open while running nothing at all.

If a cancel or terminate returns zero rows, the runaway had already finished, or your LIKE pattern
matched the killing session's own query text -- the pid <> pg_backend_pid() clause is what stops
you from terminating yourself, and the /* inc-runaway-N */ comment is what makes the query findable
at all.`,
      systemsLens: code`
Cancel versus terminate is the difference between aborting a request and closing a connection, and
every RPC system eventually grows both. The interesting part is who owns the decision. Doing it by
hand means a human, under time pressure, chooses between "stop the work" and "destroy the session",
usually without knowing what state that session was carrying. statement_timeout moves the same
decision to a policy set in advance, at the layer that can actually see how long things take.

The deeper point is that a timeout is a distributed-systems primitive, not a database setting. A
query with no timeout is an unbounded resource commitment made by whoever typed it, and unbounded
commitments are how one slow component takes down everything upstream: the query holds a
connection, the connection holds a pool slot, the pool holds a request thread, and the outage
propagates backwards through every service in the chain. That is the same failure that makes
circuit breakers and deadline propagation standard in RPC frameworks; PostgreSQL gives you
statement_timeout, lock_timeout and idle_in_transaction_session_timeout as the three deadlines it
can enforce for you, and the right place to set them is ALTER ROLE, not the incident channel.

Finally, note what did NOT differ: in both rounds the uncommitted rows vanished completely. That is
atomicity doing its job, and it is why "kill it" is a safe instruction for correctness and a
dangerous one for availability. The risk of terminate is never lost data; it is the client's
inability to cope with a connection that disappeared mid-transaction.`,
      challenge: code`
Set statement_timeout permanently for a role -- ALTER ROLE app SET statement_timeout = '30s' --
then work out which statements must be allowed to exceed it (a nightly report? CREATE INDEX
CONCURRENTLY? pg_dump?) and how they should ask for the exception. Then answer the question that
decides the value: if a query takes longer than the client's own HTTP timeout, who is still waiting
for the answer?`,
    },

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
