import { code, type Draft } from "../../../src/types.ts";

function experiment(timerHolder: boolean): string {
  return code`
-- Session A
select current_setting('statement_timeout') as saved_timeout,
       current_setting('application_name') as saved_app \gset
set statement_timeout = '60s';
set application_name = 'obs_holder';
insert into obs_wait_clients values ('holder', pg_backend_pid());
begin;
update obs_wait_account set balance = balance - 10 where id = 1;

-- Session B
select current_setting('statement_timeout') as saved_timeout,
       current_setting('application_name') as saved_app \gset
set statement_timeout = '60s';
set application_name = 'obs_waiter';
insert into obs_wait_clients values ('waiter', pg_backend_pid());
-- Session B (blocks until A commits; bounded by statement_timeout)
update obs_wait_account set balance = balance + 10 where id = 1;
` + (timerHolder
    ? code`
-- Session A (blocks for 15 seconds while STILL holding the row lock)
select pg_sleep(15);
`
    : "") +
    code`
-- Session C
-- Paste this entire observer block promptly after starting B. It waits at most 5s for readiness.
create temp table obs_wait_samples(
  phase text, sampled_at timestamptz, who text, pid int, state text,
  wait_type text, event text, blocked_by int[], xact_age interval);
create function pg_temp.obs_capture(phase_name text, wanted_event text) returns void
language plpgsql as $fn$
declare deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists (
      select 1 from pg_stat_activity a join obs_wait_clients c using(pid)
      where c.who = 'waiter' and a.wait_event = wanted_event);
    if clock_timestamp() >= deadline then raise exception 'Expected waiter event % not observed', wanted_event; end if;
    perform pg_sleep(0.05);
  end loop;
  for sample in 1..10 loop
    perform pg_stat_clear_snapshot();
    insert into obs_wait_samples
      select phase_name, clock_timestamp(), c.who, a.pid, a.state,
             a.wait_event_type, a.wait_event, pg_blocking_pids(a.pid),
             clock_timestamp() - a.xact_start
      from pg_stat_activity a join obs_wait_clients c using(pid);
    perform pg_sleep(0.1);
  end loop;
end
$fn$;
select pg_temp.obs_capture('contended', 'transactionid');
select phase, who, state, wait_type, event, blocked_by, count(*) as samples,
       round(extract(epoch from max(xact_age))::numeric, 2) as max_xact_age_s
from obs_wait_samples group by 1,2,3,4,5,6 order by 1,2;
select count(*) = 10 as ten_blocker_edges
from obs_wait_samples s join obs_wait_clients c on c.who = 'holder'
where s.who = 'waiter' and c.pid = any(s.blocked_by);

-- Session A
-- If A is running the variation's timer, wait for its prompt, then commit.
commit;

-- Session B
select balance, balance = 1000 as committed_balance_ok from obs_wait_account;
-- Session B (blocks for 15 seconds; paste C's next block while it runs)
select pg_sleep(15);

-- Session C
select pg_temp.obs_capture('timer_only', 'PgSleep');
select phase, who, state, wait_type, event, blocked_by, count(*) as samples
from obs_wait_samples where phase = 'timer_only' group by 1,2,3,4,5,6 order by 2;
select count(*) = 10 as ten_unblocked_timer_samples from obs_wait_samples
where phase = 'timer_only' and who = 'waiter'
  and state = 'active' and event = 'PgSleep' and cardinality(blocked_by) = 0;
drop function pg_temp.obs_capture(text,text);
drop table obs_wait_samples;

-- Session B
select set_config('statement_timeout', :'saved_timeout', false),
       set_config('application_name', :'saved_app', false);
-- Session A
select set_config('statement_timeout', :'saved_timeout', false),
       set_config('application_name', :'saved_app', false);
drop table obs_wait_clients;
drop table obs_wait_account;`;
}

export const WAIT_OBSERVATION: Draft = {
  slug: "wait-events-tell-you-where-time-goes",
  title: "Diagnose a stalled writer from state, waits and blocker samples",
  tags: ["wait-events", "observability", "process-model", "row-locks"],
  reading:
    code`PostgreSQL 14 Internals, Chapter 15 "Locks on Memory Structures" (sections "Monitoring Waits", "Sampling")`,
  readingNotes:
    code`Chapter 15 explains wait monitoring and sampling. Use its vocabulary after the experiment to distinguish a sampled wait from a complete request history; this exercise also combines client state and an explicit blocking relationship.`,
  difficulty: "intermediate",
  safetyLevel: "locking",
  runIn: "tool",
  sessions: 3,
  estimatedMinutes: 25,
  revision: 4,
  prerequisites: ["process-model", "row-locks-are-in-the-tuple"],
  overview:
    code`An active session can be waiting for a lock or a timer. An idle session can be the cause of another client's delay. Combine repeated observations with a known workload and verify which dependency disappears when the holder commits.`,
  caution:
    code`Use three psql tabs in the same disposable lab database. Run labelled blocks in order; prepare the observer block before starting a timed block. The writer has a 60-second statement budget. If that expires or the five-second observation window is missed, roll back A and B, then rerun setup in fresh sessions. Sampling functions fail explicitly rather than treating a missed event as evidence.`,
  setup: code`drop table if exists obs_wait_clients;
drop table if exists obs_wait_account;
create table obs_wait_clients(who text primary key, pid int unique);
create table obs_wait_account(id int primary key, balance int);
insert into obs_wait_account values (1,1000);`,
  code: experiment(false),
  expectedResult:
    code`The contended phase has ten waiter samples with state=active, Lock/transactionid and the holder's PID in blocked_by; ten_blocker_edges=true. The holder is normally idle in transaction with Client/ClientRead. Its transaction age increases even though it executes no current statement.

After the holder commits, the waiter's autocommit update finishes and committed_balance_ok=true (1000). In the timer-only phase the waiter is active with Timeout/PgSleep, an empty blocker array, and ten_unblocked_timer_samples=true. Sample timestamps and ages vary. A missed phase produces an explicit readiness error; rerun it rather than inventing the absent evidence.

A NULL event means no instrumented wait was reported at that instant. It does not prove that the process was scheduled on a CPU. These deliberately sampled states describe occupancy in two chosen windows, not the percentage breakdown of application request latency.`,
  systemsLens:
    code`Diagnose a dependency before choosing an intervention. Session state describes protocol progress, the wait event describes an instrumented wait, and blocker edges identify a lock dependency. A timer can be harmless outside a transaction and disruptive while retaining locks; the holder's own wait label is insufficient. Request traces and operating-system scheduling evidence answer questions these samples cannot.`,
  challenge:
    code`Repeat with the holder executing pg_sleep(15) while retaining its row lock. Predict both clients' wait labels and decide which transaction must end to release the writer. Exact code is available in the second coaching hint.`,
  syntaxBreakdown: code`
### In plain terms

Two clients change the same account while a third collects evidence. The observer records who is active, what each client is waiting for, and which backend prevents the writer from proceeding. The final balance checks that the two committed changes cancel.

### What you are learning

- An idle transaction can block an active request.
- A sampled wait label and a transaction dependency answer different questions.
- Repeated samples have a defined window; they are not an end-to-end latency trace.

### Piece by piece

- **current_setting, \gset and set_config** (session configuration): Save the current statement_timeout and application_name as psql variables, set temporary lab values, then restore the saved values. A backslash command ends at its newline.
- **statement_timeout** (request budget): Limits the blocked UPDATE to 60 seconds. It includes lock waiting; it does not automatically close an idle transaction in another session.
- **application_name and pg_backend_pid()** (identity): Label clients and register their exact server PIDs in obs_wait_clients before opening the held transaction. The observer joins those PIDs instead of inspecting unrelated sessions.
- **BEGIN and COMMIT** (transaction boundaries): A retains its update lock between these commands. B uses autocommit, so its successful UPDATE commits once the lock becomes available.
- **CREATE TEMP TABLE and pg_temp** (session-local objects): C owns its samples and helper function. They disappear on disconnect and are explicitly dropped at the end.
- **LANGUAGE plpgsql, LOOP, FOR, EXIT WHEN and RAISE EXCEPTION** (bounded observation): The helper polls for one named event for at most five seconds, then takes ten samples. A missing event aborts the observation instead of silently passing it.
- **pg_stat_clear_snapshot()** (observation refresh): Clears C's cached activity snapshot inside the loop. Without it, repeated queries in the same transaction can repeat stale information.
- **pg_stat_activity and pg_blocking_pids(pid)** (current activity): state and wait_event_type/wait_event describe the sampled clients; blocked_by contains the PIDs currently blocking the supplied backend on locks. These fields can change while being read.
- **clock_timestamp(), xact_start, extract(epoch) and round** (time evidence): Use the advancing wall clock to calculate the age of each transaction and format seconds. Age is not CPU time.
- **pg_sleep** (timer): The 0.05-second pause bounds polling overhead; 0.1 seconds spaces samples. Fifteen seconds in B creates an observable timer. The variation uses the same timer in A while A still owns its lock.
- **ANY(array), cardinality and GROUP BY** (evidence checks): Match the exact holder PID, check that the timer has no lock blockers, and count observed state combinations. Ten expected samples make a missed phase visible.
`,
};
export const WAIT_VARIATION = WAIT_OBSERVATION.setup + "\n" + experiment(true);
