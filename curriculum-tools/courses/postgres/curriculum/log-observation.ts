import { code, type Draft } from "../../../src/types.ts";

function experiment(finish: "commit" | "rollback"): string {
  return code`
-- Session A
insert into obs_log_clients values ('holder',pg_backend_pid());
-- Session B
insert into obs_log_clients values ('writer',pg_backend_pid());
select current_setting('log_lock_waits') as saved_waits,
       current_setting('deadlock_timeout') as saved_deadlock,
       current_setting('log_min_duration_statement') as saved_duration,
       current_setting('statement_timeout') as saved_timeout \gset
set log_lock_waits = on;
set deadlock_timeout = '100ms';
set log_min_duration_statement = 0;
set statement_timeout = '60s';

-- Session A
show log_line_prefix;
-- Requires the course lab's stderr collector and PID-bearing prefix; never reconfigure globally.
do $fn$
begin
  if pg_current_logfile('stderr') is null then raise exception 'Enable the lab stderr collector before this lesson'; end if;
  if position('%p' in current_setting('log_line_prefix')) = 0 then raise exception 'This lesson requires a PID-bearing log prefix'; end if;
end
$fn$;
create temp table obs_log_window as
select pg_current_logfile('stderr') as file,
       (pg_stat_file(pg_current_logfile('stderr'))).size as start_offset;
create function pg_temp.obs_log_read() returns text language plpgsql as $fn$
declare w record; added bigint;
begin
  select * into strict w from obs_log_window;
  if pg_current_logfile('stderr') is distinct from w.file then raise exception 'Log rotated; rerun from a fresh offset'; end if;
  added := (pg_stat_file(w.file)).size - w.start_offset;
  if added < 0 or added > 262144 then raise exception 'Log truncated or interval exceeded 256KiB; rerun'; end if;
  return pg_read_file(w.file, w.start_offset, added);
end
$fn$;
create function pg_temp.obs_log_expect(needle text) returns void language plpgsql as $fn$
declare deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    if position(needle in pg_temp.obs_log_read()) > 0 then return; end if;
    if clock_timestamp() >= deadline then raise exception 'Log evidence not published: %', needle; end if;
    perform pg_sleep(0.05);
  end loop;
end
$fn$;
begin;
update obs_log_result set note='holder committed' where id=1;

-- Session B
begin;
-- Session B (blocks until A commits, with a 60-second statement budget)
update obs_log_result set note='writer attempted' where id=1 /* obs_log_update */;

-- Session A
select pg_temp.obs_log_expect('process ' || pid || ' still waiting')
from obs_log_clients where who='writer';
select c.who, a.pid, a.state, a.wait_event_type, a.wait_event,
       pg_blocking_pids(a.pid) as blocked_by
from pg_stat_activity a join obs_log_clients c using(pid) order by c.who;
commit;

-- Session B
select note as visible_inside_writer_transaction from obs_log_result where id=1;
` + finish + code`;
select 'obs_log_end' as writer_finished;
select set_config('log_lock_waits', :'saved_waits', false),
       set_config('deadlock_timeout', :'saved_deadlock', false),
       set_config('log_min_duration_statement', :'saved_duration', false),
       set_config('statement_timeout', :'saved_timeout', false);

-- Session A
select pg_temp.obs_log_expect('process ' || pid || ' acquired')
from obs_log_clients where who='writer';
select pg_temp.obs_log_expect('statement: select ''obs_log_end''');
-- Read only this bounded appended interval. Keep continuation lines, not just LOG headers.
select n, line from regexp_split_to_table(pg_temp.obs_log_read(), chr(10))
with ordinality as lines(line,n) order by n;
select note, note = '` + (finish === "commit" ? "writer attempted" : "holder committed") +
    code`' as final_outcome_ok
from obs_log_result where id=1;
drop function pg_temp.obs_log_expect(text);
drop function pg_temp.obs_log_read();
drop table obs_log_window;
drop table obs_log_clients;
drop table obs_log_result;`;
}

export const LOG_OBSERVATION: Draft = {
  slug: "read-the-server-log",
  title: "Correlate a lock-wait log with the transaction's actual outcome",
  tags: ["logging", "observability", "postmortem", "incident"],
  reading:
    code`PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (section "WAL Setup"); Chapter 15 "Locks on Memory Structures" (section "Monitoring Waits")`,
  readingNotes:
    code`The book connects checkpoint and wait logging to their underlying mechanisms. This exercise adds bounded file access, client identity and an independently read transaction outcome. Read afterward; logging configuration cannot reconstruct events that were never recorded.`,
  difficulty: "intermediate",
  safetyLevel: "privileged",
  runIn: "tool",
  sessions: 2,
  estimatedMinutes: 25,
  revision: 4,
  prerequisites: ["wait-events-tell-you-where-time-goes", "idle-in-transaction-kills-you"],
  overview:
    code`A logged successful statement does not establish that its transaction committed. Capture a bounded log interval, connect a wait and acquisition to the same backend, and independently query the stored result. Repeat with a rollback to separate statement completion from the business outcome.`,
  caution:
    code`Use the course lab's superuser, stderr logging collector and PID-bearing log_line_prefix. Settings change only in B and are restored afterward. Paste A's observation block promptly while B waits; B's statement timeout is 60 seconds. If it expires, roll back both transactions and rerun. Log rotation, truncation, more than 256KiB of appended data, or five seconds without the expected event produces an explicit error; start a fresh interval rather than interpreting missing evidence.`,
  setup: code`drop table if exists obs_log_clients;
drop table if exists obs_log_result;
create table obs_log_clients(who text primary key, pid int unique);
create table obs_log_result(id int primary key, note text);
insert into obs_log_result values(1,'original');`,
  code: experiment("commit"),
  expectedResult:
    code`B waits on A's transaction. A's bounded poll finds a line naming B's PID as still waiting; live activity links B's Lock/transactionid wait to A through blocked_by. After A commits, another log line records B acquiring the lock, followed by the UPDATE duration and its obs_log_update comment. Keep DETAIL/CONTEXT/STATEMENT continuation lines when reconstructing the event.

B sees writer attempted before deciding its transaction. In the core it commits, and A independently reads note=writer attempted with final_outcome_ok=true. In the variation B sees the same attempted value and the log still records the completed UPDATE, but B rolls back: A reads holder committed and final_outcome_ok=true. Both schedules preserve the holder's committed write.

The log's PID and transaction number correlate events; durations and interleaving vary. Only appended bytes from the saved file/offset are read. No SQL errors are expected in a correctly timed run. Logs describe configured server events, not receipt of an acknowledgement by an application or commitment of an independent external effect.`,
  systemsLens:
    code`Reconstruct a failure across boundaries: a request entered, waited, executed, and then its enclosing transaction decided. Those are different events. Preserve identity, ordering and outcome evidence when designing telemetry. A completed-statement line is useful history, but deciding whether to retry a business operation requires its durable identity and committed result.`,
  challenge:
    code`Repeat the exact workload with B's final COMMIT changed to ROLLBACK. Predict which wait and UPDATE log lines remain, and which stored value A reads afterward. Do not infer the business outcome from the UPDATE duration alone.`,
  syntaxBreakdown: code`
### In plain terms

One client holds a row while another waits to update it. Capture just the log data appended during that interaction, then compare what the writer saw inside its transaction with what another connection reads after it finishes.

### What you are learning

- A server log preserves configured events that a later activity snapshot cannot show.
- Backend identity joins wait, acquisition, statement and transaction evidence.
- A completed UPDATE can still be rolled back by its enclosing transaction.

### Piece by piece

- **pg_backend_pid and obs_log_clients** (identity): Register the two owned clients before opening the held transaction. Match the logged writer PID to live activity instead of selecting unrelated client sessions.
- **current_setting, \gset and set_config** (setting preservation): Save B's current settings in psql variables, use temporary thresholds, then restore those exact values. No ALTER SYSTEM or role-wide changes occur.
- **log_lock_waits and deadlock_timeout** (wait history): Log a lock wait that crosses the 100ms deadlock-check threshold, plus its later acquisition. This threshold does not cancel the statement.
- **log_min_duration_statement and statement_timeout** (logging and deadline): Value 0 records all completed B statements for this short exercise. The 60-second timeout limits B's blocked statement. Logging a completion does not commit its transaction.
- **pg_current_logfile('stderr'), pg_stat_file and log_line_prefix** (file and identity): Find the collector's actual file and its current byte size. %p includes the backend PID in the prefix. The guards reject missing collector output or a prefix without a PID.
- **CREATE TEMP TABLE, pg_temp and LANGUAGE plpgsql** (owned reader helpers): A stores the file/offset and defines helpers local to its connection. INTO STRICT requires one saved window; RAISE EXCEPTION rejects an invalid interval.
- **pg_read_file(file, offset, length)** (bounded read): Read only bytes appended after the saved offset. Reject rotation, truncation or an interval above 262144 bytes before reading; do not load an entire historical log to take its tail.
- **clock_timestamp, position and pg_sleep(0.05)** (collector readiness): Search the new text for a specific event for at most five seconds. Collector delivery can lag the SQL event; a polling deadline is an explicit failure, not proof that nothing happened.
- **pg_stat_activity and pg_blocking_pids** (live correlation): Show the registered writer's wait and exact holder PID before releasing the lock. The log remains available after that live dependency disappears.
- **BEGIN, COMMIT and ROLLBACK** (outcome boundaries): A commits its held update; B either commits or rolls back its own update. A's final independent SELECT verifies the resulting value.
- **regexp_split_to_table, chr(10) and WITH ORDINALITY** (ordered log lines): Split the appended text at newlines and retain line numbers and continuation lines. Other lab events may interleave; use the registered PIDs rather than assuming every line belongs to B.
- **DROP FUNCTION and DROP TABLE** (cleanup): Remove the reader helpers, interval metadata and owned fixture after collecting evidence.
`,
};
export const LOG_VARIATION = LOG_OBSERVATION.setup + "\n" + experiment("rollback");
