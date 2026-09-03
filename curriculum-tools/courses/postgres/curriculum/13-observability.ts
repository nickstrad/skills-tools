import { code, type Module } from "../../../src/types.ts";

export const OBSERVABILITY: Module = {
  category: "observability",
  title: "Wait events, I/O stats, and capacity",
  lessons: [
    {
      slug: "wait-events-tell-you-where-time-goes",
      tags: ["wait-events", "observability", "process-model", "row-locks"],
      title: "Wait events: where a backend's time actually goes",
      reading:
        code`PostgreSQL 14 Internals, Chapter 15 "Locks on Memory Structures" (sections "Monitoring Waits", "Sampling")`,
      readingNotes: code`
Chapter 15 explains wait-event monitoring and sampling as a way to find time spent blocked on locks or internal memory structures. This lesson adds client waits, PgSleep, blocking-pid lookup, and background workers. Read before or after; the experiment supplies concrete examples for the chapter vocabulary.`,
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: ["process-model", "row-locks-are-in-the-tuple"],
      overview: code`
"The database is slow" is not a diagnosis. Every PostgreSQL process, at every instant, is either
running on a CPU or waiting for exactly one named thing, and pg_stat_activity publishes that name
in wait_event_type / wait_event. Sampling that column is the cheapest profiler you will ever
have: it turns "slow" into "37% of samples were Lock:transactionid", which points at a specific
transaction rather than at the disk.

In this lesson you manufacture three different waits in a second session and watch the name
change under you: a backend blocked behind a row lock (Lock:transactionid), a backend idle inside
an open transaction waiting for its client to say something (Client:ClientRead), and a backend
that is "active" but doing nothing at all (Timeout:PgSleep). Then you look at the background
processes and discover they are described by the same vocabulary.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks what a PostgreSQL process is doing when a query looks slow. You create a row lock, watch another session wait for it, and compare that with a session waiting for its client or sleeping on purpose. The result shows why active alone is not a diagnosis: wait details point to a lock, network client, or timer.

### What you are learning

- **Session state versus wait event:** state describes the client conversation, while wait_event_type and wait_event describe what the server process is waiting for.
- **Blocking relationships:** A waiter can name the backend that owns the lock, so an operator can investigate the cause.
- **Sampling:** Repeated wait names provide a low-cost profile of where latency is spent.
- **Background processes:** Checkpointers and WAL writers use the same vocabulary without a connected client.

### Piece by piece

- **pg_stat_activity** (system view)
  - What it is: It has one row for each backend or background process.
  - What it does here: The queries list client sessions and server-owned workers.
  - What it gives us: Read **state**, **wait_event_type**, **wait_event**, **query**, and **backend_type** together; active with a wait event means the query is waiting.
- **pg_backend_pid()** (identity function)
  - What it is: It returns the operating-system PID of the current backend.
  - What it does here: Session A prints the lock holder's identity.
  - What it gives us: Compare it with the PID in **pg_blocking_pids(pid)** and activity output.
- **pg_sleep(seconds)** (delay function)
  - What it is: It pauses the current backend for the requested time.
  - What it does here: Short sleeps allow observation; pg_sleep(10) creates Timeout:PgSleep.
  - What it gives us: It returns no rows; inspect the other session while it runs.
- **state_change**, **now()**, and **extract(epoch)** (time measurement)
  - What they are: state_change records the last transition; now() gives current time; extract(epoch) converts an interval to seconds.
  - What they do here: The query calculates and rounds **secs_in_state**.
  - What they give us: An approximate duration; scheduling makes decimals vary.
- **pg_blocking_pids(pid)** (blocking lookup)
  - What it is: It returns PIDs whose locks prevent the supplied PID from proceeding.
  - What it does here: It is called while B waits for A's update.
  - What it gives us: **{137609}** identifies a blocker; **{}** means none was found.
- **backend_type** (activity classification)
  - What it is: It distinguishes clients from named background workers.
  - What it does here: One query selects clients and another excludes them.
  - What it gives us: Activity:CheckpointerMain is a worker main loop; IO or LWLock indicates other work or contention.
- **\watch i=0.1 c=50** (psql repetition command)
  - What it is: It repeats the previous query every 0.1 seconds for 50 samples.
  - What it does here: It counts wait-event pairs during a concurrent workload.
  - What it gives us: The dominant pair is the first latency cause to investigate.
- **CHECKPOINT** (challenge command)
  - What it is: It asks PostgreSQL to flush dirty pages and record a recovery point.
  - What it does here: It lets you compare wait samples with and without checkpoint work.
  - What it gives us: The mix may shift toward IO or checkpoint-related waits.`,
      setup: code`
drop table if exists obs_accounts;
create table obs_accounts(id int primary key, balance int);
insert into obs_accounts select g, 1000 from generate_series(1, 5) g;`,
      code: code`
-- Session A
select pg_backend_pid() as a_pid;
begin;
update obs_accounts set balance = balance - 10 where id = 1;

-- Session B
-- A is in a transaction but has stopped talking. What is it waiting for?
select pg_sleep(0.5);
select pid, state, wait_event_type, wait_event,
       round(extract(epoch from now() - state_change)::numeric, 1) as secs_in_state,
       left(query, 30) as query
from pg_stat_activity
where backend_type = 'client backend' and datname = current_database()
order by pid;

-- Session B (blocks until A commits)
update obs_accounts set balance = balance + 10 where id = 1;

-- Session A
select pg_sleep(1);
select pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) as blocked_by,
       left(query, 30) as query
from pg_stat_activity
where backend_type = 'client backend' and datname = current_database()
order by pid;

-- Session A
commit;

-- Session B
select id, balance from obs_accounts where id = 1;

-- Session B (blocks for 10 s: an "active" backend that is doing nothing at all)
select pg_sleep(10);

-- Session A
select pg_sleep(1);
select pid, state, wait_event_type, wait_event, left(query, 30) as query
from pg_stat_activity
where backend_type = 'client backend' and datname = current_database()
order by pid;

-- The same vocabulary describes the processes nobody connected to.
select backend_type, wait_event_type, wait_event
from pg_stat_activity
where backend_type <> 'client backend'
order by backend_type;

-- Session B
select 'awake' as b_finished;`,
      expectedResult: code`
Three observations, three different names for "waiting".

1. While A sits inside its transaction, A is idle and the wait is a network wait, not a lock:

    pid   |        state        | wait_event_type | wait_event | secs_in_state |    query
  --------+---------------------+-----------------+------------+---------------+--------------
   137609 | idle in transaction | Client          | ClientRead |           0.6 | update obs_ac
   137611 | active              |                 |            |           0.0 | select pid, s

  Client:ClientRead on an "idle in transaction" row is the most expensive idle state in
  PostgreSQL: the server is waiting on a socket while holding a row lock and an xid. Session B,
  the one running the query, has state = active and NULL wait columns - it is on CPU.

2. Once B tries to update the same row, B stops being on CPU and starts waiting for a
   transaction, and pg_blocking_pids names the culprit:

    pid   | state  | wait_event_type |  wait_event   | blocked_by |    query
  --------+--------+-----------------+---------------+------------+--------------
   137609 | active |                 |               | {}         | select pid, s
   137611 | active | Lock            | transactionid | {137609}   | update obs_ac

  Note B's state is "active", not "waiting": state says what the client asked for, wait_event
  says why nothing is happening. A dashboard that only counts "active" sessions cannot tell
  these two rows apart; the wait event can. After A commits, B's UPDATE completes at once and
  the row reads balance = 1000 (-10 then +10).

3. pg_sleep(10) puts B in the most misleading state of all. The query still returns both client
   backends - A's own row (running this very SELECT, so it is "active" with NULL wait columns)
   alongside B's:

    pid   | state  | wait_event_type | wait_event |             query
  --------+--------+-----------------+------------+--------------------------------
   137609 | active |                 |            | select pid, state, wait_event_
   137611 | active | Timeout         | PgSleep    | select pg_sleep(10);

  B is "active", burning no CPU, blocking nobody. Timeout:PgSleep is the honest label.

Finally the background processes, which never have a client and therefore are never "idle":

           backend_type         | wait_event_type |      wait_event
  ------------------------------+-----------------+----------------------
   archiver                     | Activity        | ArchiverMain
   autovacuum launcher          | Activity        | AutoVacuumMain
   background writer            | Activity        | BgWriterHibernate
   checkpointer                 | Activity        | CheckpointerMain
   logical replication launcher | Activity        | LogicalLauncherMain
   walwriter                    | Activity        | WalWriterMain

  Activity means "idle in my own main loop". Under load these same processes show IO
  (DataFileWrite, WALSync) and LWLock events instead, which is how you tell a checkpoint I/O
  storm from a lock storm without guessing.

(PIDs and secs_in_state differ on your run - secs_in_state depends on scheduling jitter around the
pg_sleep(0.5), typically 0.5-0.7 - and the background writer shows BgWriterMain rather than
BgWriterHibernate if it did work recently. The checkpointer often shows Timeout:CheckpointWriteDelay
instead of Activity:CheckpointerMain: it is mid-checkpoint, pacing its writes across
checkpoint_completion_target rather than sitting idle - exactly the "under load" case the paragraph
below describes, caught in the act.)`,
      systemsLens: code`
This is wait-time performance analysis implemented inside the server: instead of exposing only
resource counters (CPU, IOPS) and asking you to infer causality, the system labels each blocked
thread with the resource it is blocked on. Sampling those labels is statistically the same idea
as a sampling CPU profiler, except it profiles off-CPU time, which is where database latency
actually lives.

The distributed-systems lesson is the distinction between state and wait. "Active" is a
protocol-level fact about what the client requested; the wait event is a scheduling fact about
what the process is doing. Every RPC system that reports only "requests in flight" makes the same
mistake as a dashboard that only counts active sessions: an in-flight request may be running,
queued behind a lock, or asleep, and those three need entirely different fixes. If you build a
service, publish the equivalent of a wait event - the name of the thing each in-flight request is
currently blocked on - and you can diagnose a latency spike from a single sample instead of a
trace.`,
      challenge: code`
Build a poor man's continuous profiler. Run
  select wait_event_type, wait_event, count(*) from pg_stat_activity
  where backend_type = 'client backend' group by 1, 2 \watch i=0.1 c=50
in one session while another runs a workload (a bulk INSERT, or the deadlock lesson from module
06). The distribution over 50 samples is your latency breakdown. Which events dominate an
INSERT-heavy workload, and does that change if you run CHECKPOINT first?`,
    },

    {
      slug: "pg-stat-io-by-backend-type",
      tags: ["pg-stat-io", "buffer-cache", "observability", "checkpoints"],
      title: "pg_stat_io: who reads, who writes, who extends",
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 9 "Buffer Cache".`,
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 25,
      prerequisites: ["buffer-cache-and-io", "checkpoint-anatomy"],
      overview: code`
Before PostgreSQL 16 the I/O picture was a handful of scalars in pg_stat_bgwriter: you could see
that 26522 buffers were written, but not by whom, or why, or through which strategy. pg_stat_io
is a matrix instead: (backend_type x object x context) x (reads, writes, extends, hits,
evictions, reuses, fsyncs). That shape is what lets you answer the question that actually matters
during an I/O incident - is this the checkpointer doing scheduled work, an autovacuum worker, or
ordinary backends being forced to write dirty pages themselves because the cache is full?

You will snapshot the matrix, run one deliberately cache-hostile workload (a table larger than
shared_buffers, written and then read back), and diff the snapshot. Every number in the diff has
a cause you can point at in the workload.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks who is doing disk work, not merely how many pages were written. You save a baseline of PostgreSQL 16's I/O matrix, insert a table larger than the cache, force a checkpoint, and scan it back. The before-and-after rows attribute reads, writes, growth, hits, and evictions to a process and buffer strategy.

### What you are learning

- **Dimensioned statistics:** Counters become useful when labelled by process, relation type, and buffer strategy.
- **Buffer strategies:** Normal, bulkread, bulkwrite, and vacuum contexts choose different cache behaviour.
- **Cache hits and misses:** A hit reuses shared memory; a read fetches a page from the operating system.
- **Snapshot-and-diff monitoring:** A private baseline avoids erasing statistics needed by other observers.

### Piece by piece

- **pg_stat_io** (PostgreSQL 16 system view)
  - What it is: It has one row per backend type, object kind, and buffer context.
  - What it does here: The lesson stores counters, then subtracts that snapshot from current values.
  - What it gives us: **reads**, **writes**, **extends**, **hits**, **evictions**, **reuses**, and **fsyncs** identify who touched storage.
- **shared_buffers** and **track_io_timing** (server settings)
  - What they are: shared_buffers is the shared page cache size; track_io_timing enables I/O timing.
  - What they do here: SHOW confirms a 128 MB cache and enabled timing.
  - What they give us: The table-size comparison explains the bulkread choice.
- **CREATE TABLE ... AS** (snapshot query)
  - What it is: It materializes a SELECT result as a table.
  - What it does here: It records **obs_io_before** without resetting global counters.
  - What it gives us: A known starting value for every subtraction.
- **generate_series(...)** and **repeat(...)** (data generators)
  - What they are: The first generates 1 through 200000; the second makes 700-character padding.
  - What they do here: They create a roughly 140 MB relation.
  - What they give us: A repeatable workload larger than the cache.
- **pg_relation_size(...)** and **pg_size_pretty(...)** (size functions)
  - What they are: The first returns bytes; the second formats bytes for people.
  - What they do here: They report table size and convert page counts using 8192 bytes per page.
  - What they give us: Around 142 MB confirms the table does not fit.
- **CHECKPOINT** (flush command)
  - What it is: It asks the checkpointer to write dirty pages.
  - What it does here: It separates scheduled writes from client writes.
  - What it gives us: Checkpointer rows with writes and fsyncs show scheduled work.
- **max_parallel_workers_per_gather = 0** (session setting)
  - What it is: It disables parallel query workers for this session.
  - What it does here: It keeps the scan in one client process.
  - What it gives us: Bulkread counters are not split across workers.
- **coalesce(...)**, **LEFT JOIN**, and **8192** (diff and units)
  - What they are: coalesce changes missing values to zero; LEFT JOIN keeps current rows; 8192 is one 8 KiB page.
  - What they do here: The query computes current minus baseline and converts pages to bytes.
  - What they give us: Positive differences are post-snapshot work; NULL means not applicable.
- **pg_sleep(1)** (statistics delay)
  - What it is: It pauses one second.
  - What it does here: It allows statistics to reach shared memory.
  - What it gives us: A more complete diff, though background activity can vary.`,
      setup: code`
drop table if exists obs_io_load;
drop table if exists obs_io_before;
create table obs_io_load(id int, pad text);`,
      code: code`
show shared_buffers;
show track_io_timing;

-- Snapshot the whole matrix. Diffing a snapshot always beats resetting.
create table obs_io_before as
  select backend_type, object, context, reads, writes, extends, hits, evictions, reuses, fsyncs
  from pg_stat_io;

-- A workload chosen to touch every column: ~140 MB of table in a 128 MB cache.
insert into obs_io_load select g, repeat('x', 700) from generate_series(1, 200000) g;
select pg_size_pretty(pg_relation_size('obs_io_load')) as table_size;

-- Force the dirty pages out through the checkpointer rather than letting them dribble.
checkpoint;

-- Read it all back. The table is bigger than shared_buffers/4, so the scan uses the bulkread
-- ring instead of the normal buffer allocator. Force it onto one process: on a multi-core box
-- this table is big enough for a parallel seq scan, which would split the bulkread I/O across a
-- "background worker" row too and muddy the who-did-what story this lesson is telling.
set max_parallel_workers_per_gather = 0;
select count(*), sum(length(pad)) as bytes from obs_io_load;

-- Statistics are flushed to shared memory at transaction end, at most once a second.
select pg_sleep(1);

select a.backend_type, a.object, a.context,
       a.reads     - coalesce(b.reads, 0)     as reads,
       a.writes    - coalesce(b.writes, 0)    as writes,
       a.extends   - coalesce(b.extends, 0)   as extends,
       a.hits      - coalesce(b.hits, 0)      as hits,
       a.evictions - coalesce(b.evictions, 0) as evictions,
       a.reuses    - coalesce(b.reuses, 0)    as reuses,
       a.fsyncs    - coalesce(b.fsyncs, 0)    as fsyncs
from pg_stat_io a
left join obs_io_before b
  on b.backend_type = a.backend_type and b.object = a.object and b.context = a.context
where coalesce(a.reads - coalesce(b.reads, 0), 0)
    + coalesce(a.writes - coalesce(b.writes, 0), 0)
    + coalesce(a.extends - coalesce(b.extends, 0), 0)
    + coalesce(a.hits - coalesce(b.hits, 0), 0) > 0
order by a.backend_type, a.context;

-- The same story in bytes, for the two actors that matter.
select backend_type, context,
       pg_size_pretty(extends * 8192) as extended,
       pg_size_pretty(writes * 8192) as written,
       pg_size_pretty(reads * 8192) as read_from_os
from (
  select a.backend_type, a.context,
         coalesce(a.reads - coalesce(b.reads, 0), 0)::bigint as reads,
         coalesce(a.writes - coalesce(b.writes, 0), 0)::bigint as writes,
         coalesce(a.extends - coalesce(b.extends, 0), 0)::bigint as extends
  from pg_stat_io a
  left join obs_io_before b
    on b.backend_type = a.backend_type and b.object = a.object and b.context = a.context
) d
where backend_type in ('client backend', 'checkpointer')
  and reads + writes + extends > 0
order by 1, 2;

drop table obs_io_load;
drop table obs_io_before;`,
      expectedResult: code`
shared_buffers is 128MB (16384 buffers) and track_io_timing is on. The INSERT builds a 142 MB
table, which does not fit.

This lab has 4 CPUs, so without max_parallel_workers_per_gather = 0 the read-back count(*) plans
a Parallel Seq Scan (Workers Planned: 2, confirmed with EXPLAIN) and the bulkread I/O splits
across a "client backend" row (the leader) and a "background worker" row (the two parallel
workers, summed) - a real and reproducible finding, but one that muddies this lesson's who-did-
what story, so the lesson pins the scan to one process.

The diff has one row per (who, how) pair, and each row is a sentence about the workload:

    backend_type    |  object  | context   | reads | writes | extends |  hits  | evictions | reuses | fsyncs
  -------------------+----------+-----------+-------+--------+---------+--------+-----------+--------+--------
   background writer | relation | normal    |       |   1100 |         |        |           |        |      0
   checkpointer      | relation | normal    |       |  16165 |         |        |           |        |     34
   client backend    | relation | bulkread  |  3860 |   1439 |         |  14322 |      3846 |     14  |
   client backend    | relation | bulkwrite |     0 |      0 |       1 |      0 |         0 |      0  |
   client backend    | relation | normal    |    64 |   1860 |   18190 | 237146 |      2191 |        |      0

Read it left to right:

- extends = 18190 by the client backend in the normal context: the INSERT appended 18190 pages
  (142 MB) to the relation file. Only the process doing the INSERT can extend a file, which is
  why every other row's extends column is 0 or NULL.
- writes = 1860 by the client backend in the normal context: the cache filled up during the
  INSERT, so the backend itself had to write dirty pages out before it could get a clean buffer -
  with evictions = 2191 to match. This is the number to watch in production; a backend that is
  writing is a backend that is not answering your query. (pg_stat_bgwriter calls the same thing
  buffers_backend.)
- writes = 16165 by the checkpointer with 34 fsyncs: the CHECKPOINT, doing the work in bulk.
  Compare the shapes: over 16000 scheduled writes by a process nobody is waiting on, versus 1860
  unscheduled writes inline in a user statement.
- The bulkread row is the read-back SELECT: reads = 3860 and hits = 14322 - 79% of the table's
  18190 pages were still resident from the INSERT (this table is only ~14 MB bigger than
  shared_buffers, not many times bigger), so most of the "scan" is free. reads = evictions +
  reuses always (3860 = 3846 + 14 here): every miss either evicts a stranger buffer to grow the
  ring or reuses a buffer the ring already owns. In this lab evictions dominate reuses, the
  opposite of the textbook "one giant ring, few evictions" story - because the misses are sparse
  and scattered among hits rather than one dense run, the ring rarely gets to revisit a slot
  before it is done with it. You see reuses clearly outrun evictions only when the table is many
  times bigger than the whole buffer pool, not just bigger than shared_buffers/4 - the challenge
  below has you find that point.
- hits = 237146 in the normal context is mostly the INSERT re-finding the page it is appending
  to, over and over, without ever touching the disk to get it.

The size view makes the asymmetry obvious:

    backend_type   | context   | extended | written | read_from_os
  ------------------+-----------+----------+---------+--------------
   checkpointer     | normal    | 0 bytes  | 126 MB  | 0 bytes
   client backend   | bulkread  | 0 bytes  | 11 MB   | 30 MB
   client backend   | normal    | 142 MB   | 15 MB   | 512 kB

Exact numbers move with what else the lab has been doing (autovacuum can add a "vacuum" context
row if it fires on obs_io_load, and the background writer's and checkpointer's contribution
wanders run to run - three runs here saw checkpointer writes from 16165 to 16267 and bulkread
reads from 2622 to 3874), but the shape is stable: extends only from the writer, most writes from
the checkpointer, and the reads/hits split for bulkread tells you how much of the table survived
in cache since the INSERT.`,
      systemsLens: code`
Two ideas, both general.

First, dimensioned counters beat scalar counters. "26522 buffers written" is unactionable;
"14139 written by the checkpointer, 3400 written inline by a client backend" tells you whether to
tune the checkpointer or add memory. The design rule is that every counter should carry the
dimensions along which the system's behaviour actually differs - here, which process and under
which allocation strategy. Prometheus labels, OpenTelemetry attributes and pg_stat_io are the
same idea; the hard part is choosing dimensions that map onto distinct mechanisms rather than
onto whatever was convenient to record.

Second, the bulkread ring is a scan-resistant cache policy, and pg_stat_io lets you verify it is
working. Naive LRU has a catastrophic failure mode: one large sequential scan touches every page
once and evicts a carefully warmed working set to cache data nobody will read again. Every
serious cache defends against it - PostgreSQL with per-strategy ring buffers, Linux with active
and inactive LRU lists, ARC with its ghost lists, CDNs with admission control. "reuses is large
and evictions is small" is the observable signature of that defence, and its absence in your own
cache is why one analytics query can wreck your service's latency.`,
      challenge: code`
Shrink the table to 20 MB (well under shared_buffers/4) and rerun. The context flips from
bulkread to normal, reuses disappears and hits go up - PostgreSQL only pays the ring-buffer
insurance when the scan is big enough to be dangerous. Then find the exact crossover by bisecting
the row count and check it against the rule of thumb (a quarter of shared_buffers).`,
    },

    {
      slug: "connection-saturation",
      tags: ["connections", "capacity", "process-model", "observability"],
      title: "Run out of connections and watch the door close",
      reading:
        code`PostgreSQL 14 Internals, Chapter 1 "Introduction" (section "Clients and the Client-Server Protocol")`,
      readingNotes: code`
Chapter 1 explains the client-server protocol and one-backend-per-connection process model behind connection pooling. This lesson extends that background to max_connections exhaustion, reserved-superuser slots, and immediate FATAL rejection. Read before or after; the chapter explains the resource model and this experiment shows the failure boundary.`,
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "mixed",
      estimatedMinutes: 25,
      prerequisites: ["process-model", "wait-events-tell-you-where-time-goes"],
      overview: code`
max_connections is not a tuning knob, it is a hard capacity limit backed by an array of shared
memory slots sized at postmaster startup. When it is reached the server does not queue you, does
not slow down and does not degrade gracefully: it closes the socket with a FATAL before you have
even authenticated. That is the failure mode you need to have seen once, because the first thing
you try during the incident - opening a psql to look at pg_stat_activity - is exactly the thing
that fails.

You will lower max_connections to 15, restart, open connections in a loop until the server
refuses, and read the two different refusals PostgreSQL has: one for ordinary roles, when the
last superuser_reserved_connections slots are gone, and one for everybody, when nothing is left
at all. Then you put the setting back.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks what PostgreSQL does when every connection slot is occupied. You lower the limit, restart the throwaway cluster, open connections until new clients receive FATAL errors, and restore the setting. The key observation is immediate rejection rather than queueing, with reserved slots keeping an administrator able to investigate.

### What you are learning

- **Hard admission control:** max_connections is startup-sized capacity, not a queue.
- **Reserved operator capacity:** superuser_reserved_connections protects slots from ordinary roles.
- **Restart-required settings:** A postmaster setting changes shared memory, so reload cannot apply it.
- **Connection storms:** Immediate reconnects can amplify saturation.

### Piece by piece

- **max_connections** (postmaster setting)
  - What it is: The maximum number of client backends.
  - What it does here: The lesson changes it to 15 and checks its context.
  - What it gives us: Refusal counts show the hard boundary.
- **superuser_reserved_connections** (capacity setting)
  - What it is: Slots reserved for superusers.
  - What it does here: With 15 total and 3 reserved, an ordinary role gets 12.
  - What it gives us: The ordinary role receives the reserved-slots FATAL while a superuser can connect.
- **pg_stat_activity** and **FILTER (WHERE ...)** (view and aggregate)
  - What they are: The view lists processes; FILTER makes count include only matching rows.
  - What they do here: The query counts clients separately from all processes.
  - What they give us: client_backends, processes_total, and reserved show live usage.
- **pg_settings** (configuration view)
  - What it is: It exposes values, sources, and change contexts.
  - What it does here: It proves max_connections is postmaster-scoped.
  - What it gives us: context = postmaster means restart is required.
- **\! ps -o pid,rss,cmd --ppid ... | head -12** (psql shell escape)
  - What it is: \! runs an OS command; ps lists processes, -o selects columns, --ppid filters children, and head limits lines.
  - What it does here: It lists processes under the postmaster PID read by head -1.
  - What it gives us: One process per client is visible; RSS includes shared pages.
- **ALTER SYSTEM** and **pg_ctl restart -m fast -w** (configuration and lifecycle)
  - What they are: ALTER SYSTEM writes a persistent override; pg_ctl controls the cluster; fast requests clean shutdown; -w waits for startup.
  - What they do here: They set 15 and apply it by restart, then restore the default.
  - What they give us: SHOW confirms the running value.
- **seq**, **&**, redirection, **sleep**, and **wait** (shell controls)
  - What they are: seq generates loop numbers; & backgrounds psql; redirection saves errors; sleep spaces attempts; wait joins children.
  - What they do here: They create more clients than slots and keep them open with pg_sleep.
  - What they give us: Error files and refusal counts prove the limit.
- **psql -h /tmp -p 5440 -U obs_app -d lab -Atc ...** (client invocation)
  - What it is: -h selects socket directory, -p port, -U role, -d database, -A unaligned, -t tuples only, and -c a command.
  - What it does here: It tests ordinary and superuser admission.
  - What it gives us: The two FATAL messages distinguish reserved slots from total exhaustion.
- **grep -E ...** and **tail -6** (log inspection)
  - What they are: grep -E searches a regular expression; tail keeps final lines.
  - What they do here: They find saturation messages in the server log.
  - What they give us: The prefix identifies role and database.
- **pg_read_file('postgresql.auto.conf')** (server-file function)
  - What it is: It reads a data-directory-relative file.
  - What it does here: The final check proves ALTER SYSTEM RESET removed the override.
  - What it gives us: Only the standard header comments remain.`,
      caution: code`
This lesson restarts the lab cluster twice, which drops every open connection to it, and it
changes a cluster-wide postmaster setting with ALTER SYSTEM. Run the restore step even if you
stop halfway: ALTER SYSTEM RESET max_connections and restart, then confirm SHOW max_connections
is 100 and postgresql.auto.conf is back to its two comment lines. Never point any of this at a
cluster you care about.`,
      code: code`
-- PART 1, in psql: what the budget is, and how much of it is in use.
show max_connections;
show superuser_reserved_connections;

select count(*) filter (where backend_type = 'client backend') as client_backends,
       count(*) as processes_total,
       current_setting('max_connections')::int as max_connections,
       current_setting('superuser_reserved_connections')::int as reserved
from pg_stat_activity;

select name, context from pg_settings where name = 'max_connections';

-- Every one of those client backends is an OS process with its own address space.
\! ps -o pid,rss,cmd --ppid $(head -1 $PGLAB/primary/postmaster.pid) | head -12

-- ==========================================================================
-- PART 2, SHELL, as the postgres OS user, in another terminal. Run these by
-- hand: no lesson runner can follow the server across a restart, and the point
-- of the experiment is that psql itself stops being able to connect.
--
--   export PATH=/usr/lib/postgresql/16/bin:$PATH
--   PGLAB=$HOME/pglab
--
--   # Shrink the pool. max_connections is a postmaster setting: restart, not reload.
--   psql -h /tmp -p 5440 -d lab -c "alter system set max_connections = 15"
--   pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" restart -m fast -w
--   psql -h /tmp -p 5440 -d lab -Atc "show max_connections"
--
--   # (a) Twenty superuser connections into fifteen slots.
--   rm -f /tmp/obs_conn.err
--   for i in $(seq 1 20); do
--     psql -h /tmp -p 5440 -d lab -Atc "select pg_sleep(25)" >/dev/null 2>>/tmp/obs_conn.err &
--     sleep 0.4
--   done
--   sleep 2
--   psql -h /tmp -p 5440 -d lab -Atc "select count(*) from pg_stat_activity"  # this fails too
--   cat /tmp/obs_conn.err
--   wait
--
--   # (b) The reserve: sixteen ordinary connections, then one superuser.
--   psql -h /tmp -p 5440 -d lab -c "create role obs_app login"
--   rm -f /tmp/obs_app.err
--   for i in $(seq 1 16); do
--     psql -h /tmp -p 5440 -U obs_app -d lab -Atc "select pg_sleep(20)" \
--          >/dev/null 2>>/tmp/obs_app.err &
--     sleep 0.3
--   done
--   sleep 2
--   psql -h /tmp -p 5440 -U postgres -d lab -Atc \
--        "select count(*) from pg_stat_activity where backend_type = 'client backend'"
--   sort /tmp/obs_app.err | uniq -c
--   wait
--
--   # What the server logged while all that was happening.
--   grep -E "too many clients|remaining connection slots" \
--        "$PGLAB/primary/log/postgresql.log" | tail -6
--
--   # RESTORE. Do not skip this.
--   psql -h /tmp -p 5440 -d lab -c "drop role obs_app"
--   psql -h /tmp -p 5440 -d lab -c "alter system reset max_connections"
--   pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" restart -m fast -w
-- ==========================================================================

-- PART 3, back in psql (reconnect: the restart dropped your session). Prove the lab is
-- exactly as you found it.
show max_connections;
select pg_read_file('postgresql.auto.conf') as auto_conf;
select count(*) filter (where backend_type = 'client backend') as client_backends
from pg_stat_activity;
select rolname from pg_roles where rolname = 'obs_app';`,
      expectedResult: code`
PART 1. The lab starts at 100 connections with 3 held in reserve, and almost none in use:

   client_backends | processes_total | max_connections | reserved
  -----------------+-----------------+-----------------+----------
                 1 |               7 |             100 |        3

(processes_total varies with which background workers this lab build starts - 6 background
processes plus your one client here; count logger, checkpointer, background writer, walwriter,
autovacuum launcher and archiver, plus logical replication launcher if wal_level allows it.)
pg_settings says context = postmaster, which is the whole reason this lesson needs a restart. The
ps output shows one process per client plus the fixed background set - but do not read RSS here as
"the cost of one process": these are all mapped into the same shared_buffers segment (128 MB), and
RSS counts resident shared pages too, so a process that has touched most of the buffer pool over
the server's lifetime (the checkpointer, the background writer) shows RSS in the tens or hundreds
of MB, not the few MB you would expect from its own private memory:

     PID    RSS CMD
   44443 146388 postgres: lab-primary: checkpointer
   44444  68540 postgres: lab-primary: background writer
   44446  10692 postgres: lab-primary: walwriter
   44447   9984 postgres: lab-primary: autovacuum launcher

(On a freshly built lab these numbers are much smaller, single-digit MB - they grow as the
checkpointer and background writer touch more of shared_buffers over the life of the cluster. The
walwriter and autovacuum launcher, which only touch WAL buffers and catalog pages, stay small.)

PART 2 (a). Twenty background psql, fifteen slots. Fifteen connect; the last five die before they
can run anything:

  psql: error: connection to server on socket "/tmp/.s.PGSQL.5440" failed:
  FATAL:  sorry, too many clients already

repeated 5 times - and the observing psql, the one meant to run "select count(*) from
pg_stat_activity", gets the same FATAL. There is no queue and no back-pressure: the postmaster
accepts the socket, finds no free slot, writes the FATAL and hangs up.

PART 2 (b). The reserve is what makes that survivable. Sixteen connections as the ordinary role
obs_app into the same 15 slots: 12 succeed (15 - 3 reserved), and

      4 psql: error: connection to server on socket "/tmp/.s.PGSQL.5440" failed:
        FATAL:  remaining connection slots are reserved for roles with the SUPERUSER attribute

while the superuser connection still succeeds and reports 13 client backends (12 obs_app plus
itself). Two different messages, two different meanings: "reserved for ... SUPERUSER" means the
application is out of budget but you are not; "sorry, too many clients already" means nobody is
getting in, including you.

The server log records every one, with the role and database in the prefix:

  2026-09-03 11:06:42.261 UTC [139704] postgres@lab FATAL:  sorry, too many clients already
  2026-09-03 11:07:16.025 UTC [139779] obs_app@lab FATAL:  remaining connection slots are
    reserved for roles with the SUPERUSER attribute

PART 3. After the restore restart, exactly as found:

  max_connections = 100
  auto_conf =
    # Do not edit this file manually!
    # It will be overwritten by the ALTER SYSTEM command.
  client_backends = 1
  (0 rows)   -- obs_app is gone

(PIDs, timestamps and RSS numbers differ on your run; the pass/fail counts - 15 in/5 refused for
(a), 12 in/4 refused for (b) - are deterministic given max_connections=15 and
superuser_reserved_connections=3, and should not vary.)`,
      systemsLens: code`
A process-per-connection server has a capacity limit that is architectural, not accidental: every
connection costs an OS process, a stack, a private catalog and plan cache, and a fixed shared
memory slot allocated at startup. That is why max_connections cannot be raised online, why
raising it costs memory whether or not the connections arrive, and why the honest answer to "we
need 5000 connections" is a pooler (PgBouncer in transaction mode), not a bigger number.

The failure mode is the lesson. This is a hard admission-control boundary with no queue, and the
system does the right thing by rejecting fast rather than accepting work it cannot serve -
exactly the load-shedding you would design into an RPC server. But notice the two properties that
make it usable in an incident, both of which people forget when they build their own limiter: the
rejection is instant and unambiguous (a FATAL with a specific message, logged with the role), and
there is a reserved lane for the operator. A limiter without a reserved lane locks out the only
person who can fix it - the same reason schedulers keep a root reserve and network fabrics keep a
management VLAN.

The connection-storm dynamic is worth naming too. Application pools reconnect on failure, so
saturation causes a retry storm, which extends saturation: positive feedback, and the reason
connection limits belong at the pooler, where waiting is cheap, rather than at the database,
where the only options are accept and refuse.`,
      challenge: code`
Measure the real cost of an idle connection. With max_connections back at 100, open 50 idle psql
sessions and compare "ps -o rss" totals and free memory before and after; then compare that with
the memory one PgBouncer process would use for the same 50 clients. Separately, set
max_connections = 5000 and restart: how much shared memory does the server reserve at startup
(check the log and pg_shmem_allocations) before a single client connects?`,
    },

    {
      slug: "idle-in-transaction-kills-you",
      tags: ["timeouts", "connections", "observability", "gc-horizon"],
      title: "Timeouts: idle in transaction, and statements that never end",
      reading:
        code`PostgreSQL 14 Internals, Chapter 8 "Rebuilding Tables and Indexes" (section "Precautions"); Chapter 4 "Snapshots" (section "Transaction Horizon")`,
      readingNotes: code`
Chapter 4 explains how an old open transaction holds back the transaction horizon, and Chapter 8 warns that long-running or idle transactions interfere with maintenance. This lesson makes both effects visible through a row lock, dead tuples, and a timeout that terminates the idle client. Read before or after; the experiment adds the connection-liveness perspective.`,
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: [
        "wait-events-tell-you-where-time-goes",
        "lock-timeout-and-nowait",
      ],
      overview: code`
An open transaction that nobody is using is the most expensive idle object in a PostgreSQL
cluster. It pins the xmin horizon so VACUUM cannot clean anything newer, it holds every lock it
took, and it occupies a connection slot - all while the server waits on Client:ClientRead for a
client that may have gone to lunch or died behind a load balancer. PostgreSQL's answer is not
politeness: idle_in_transaction_session_timeout terminates the whole connection with a FATAL.

You will watch a session get killed mid-transaction, confirm from the other session that its
locks and its xmin horizon were released, then meet the gentler sibling, statement_timeout, which
cancels a single statement with an ERROR and leaves the session alive.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks what an unused open transaction costs. Session A updates a row and stops sending commands, so it holds a row lock, keeps a transaction horizon, and occupies a connection; a timeout terminates it. You then compare statement_timeout, which cancels one long statement but leaves its connection alive.

### What you are learning

- **Idle in transaction:** A session can be doing no current SQL while retaining locks and an old transaction.
- **Session versus statement deadlines:** One timeout destroys a connection; the other cancels one statement.
- **Vacuum horizon:** Old snapshots determine which dead row versions may be removed.
- **FATAL versus ERROR:** FATAL ends a connection; ERROR is recoverable after rollback.

### Piece by piece

- **idle_in_transaction_session_timeout** and **statement_timeout** (settings)
  - What they are: The first limits silence inside an open transaction; the second limits one statement's runtime.
  - What they do here: SET kills A after two seconds and cancels B's thirty-second sleep after one.
  - What they give us: A disconnects with FATAL; B receives SQLSTATE 57014 and survives.
- **pg_stat_activity** fields **state**, **xact_start**, and **backend_xmin** (activity evidence)
  - What they are: They show conversation state, transaction start, and the oldest snapshot horizon held.
  - What they do here: B observes A as idle in transaction and measures its age.
  - What they give us: The listed session and its lock prove the pin; backend_xmin may be blank between statements.
- **pg_backend_pid()** and **pg_current_xact_id()** (identity functions)
  - What they are: They return the backend PID and transaction ID.
  - What they do here: A prints both before becoming idle.
  - What they give us: Relate activity and log rows to the session and horizon.
- **pgrowlocks('obs_ledger')** (row-lock function)
  - What it is: It reports row-level locks for a table.
  - What it does here: It counts locks before and after A is killed.
  - What it gives us: locked_rows = 1 then 0 proves timeout cleanup.
- **pg_stat_file(...)**, **\gset**, and **pg_read_file(...)** (bounded log read)
  - What they are: pg_stat_file returns size; \gset saves log_size_before; pg_read_file reads a data-directory-relative byte range.
  - What they do here: The code reads only log bytes appended during this lesson.
  - What they give us: The filtered FATAL line belongs to this experiment.
- **regexp_split_to_table(..., chr(10)) WITH ORDINALITY** (line parser)
  - What it is: It splits log text at newline 10 and numbers each line.
  - What it does here: It filters lines containing idle-in-transaction.
  - What it gives us: n is file order and l is the log text.
- **pg_sleep(4)** and **pg_sleep(30)** (timed demonstrations)
  - What they are: Delays in the current backend.
  - What they do here: Four seconds lets A's timeout fire; thirty exceeds B's statement timeout.
  - What they give us: One connection disappears; the other reports a recoverable error.
- **FILTER (...)** and **ROLLBACK** (cleanup)
  - What they are: FILTER counts matching rows; ROLLBACK ends an aborted transaction and discards its writes.
  - What they do here: The code counts surviving sessions and clears B's failed transaction.
  - What they give us: Row 99 is absent and the original row is unchanged.`,
      setup: code`
drop table if exists obs_ledger;
create table obs_ledger(id int primary key, note text);
insert into obs_ledger select g, 'row ' || g from generate_series(1, 5) g;`,
      code: code`
-- Session A
select pg_backend_pid() as a_pid;
set idle_in_transaction_session_timeout = '2s';
show idle_in_transaction_session_timeout;
begin;
update obs_ledger set note = 'held by A' where id = 1;
select pg_current_xact_id() as a_xid;

-- Session B
-- A is idle in transaction: holding a row lock and pinning the horizon.
select (pg_stat_file('log/postgresql.log')).size as log_size_before \gset
select pid, state, wait_event_type, wait_event, backend_xmin,
       round(extract(epoch from now() - xact_start)::numeric, 1) as xact_age_s
from pg_stat_activity
where backend_type = 'client backend' and datname = current_database()
order by pid;
select count(*) as locked_rows from pgrowlocks('obs_ledger');

-- Give the timeout time to fire. A is not executing anything, so its clock is running.
select pg_sleep(4);

select count(*) filter (where state = 'idle in transaction') as still_idle_in_xact,
       count(*) filter (where backend_type = 'client backend') as client_backends
from pg_stat_activity where datname = current_database();
select count(*) as locked_rows_after from pgrowlocks('obs_ledger');
select id, note from obs_ledger where id = 1;

select l from regexp_split_to_table(
         pg_read_file('log/postgresql.log', :log_size_before, 200000), chr(10))
         with ordinality as t(l, n)
where l like '%idle-in-transaction%'
order by n;

-- Session B
-- statement_timeout is the gentler one: it kills a statement, not the session.
set statement_timeout = '1s';
begin;
insert into obs_ledger values (99, 'inserted before the timeout');
select pg_sleep(30);

-- Session B
select 'still connected' as b_alive;
rollback;
select count(*) as rows_now from obs_ledger;
set statement_timeout = 0;

-- Session A (blocks: this backend was terminated seconds ago and does not know it yet)
select 'anybody home?' as probe;`,
      expectedResult: code`
Session A opens a transaction, updates a row and stops talking. Session B sees what that costs:

    pid   |        state        | wait_event_type | wait_event | backend_xmin | xact_age_s
  --------+---------------------+-----------------+------------+--------------+------------
   138777 | idle in transaction | Client          | ClientRead |              |        0.1
   138779 | active              |                 |            |        88595 |        0.0

  locked_rows = 1

A's own row shows a blank backend_xmin (it is between statements, holding no live snapshot right
now), but B's row - the one running THIS query - shows 88595, which is A's own transaction id
printed by a_xid above. That is the horizon A is pinning: B cannot take a snapshot older than A's
still-open transaction, so every dead tuple newer than it is unvacuumable for as long as A sits
there. Four seconds later A is simply gone:

   still_idle_in_xact | client_backends
  --------------------+-----------------
                    0 |               1

  locked_rows_after = 0
  id | note   -->   1 | row 1      (A's UPDATE died with the connection, so it rolled back)

and the log says why, in a single filtered line - a FATAL that A's own client will not see until it
next speaks:

  2026-09-03 10:58:23.478 UTC [138777] postgres@lab FATAL:  terminating connection due to
    idle-in-transaction timeout

statement_timeout is a different weapon. With it set to 1s, pg_sleep(30) dies after a second:

  ERROR:  canceling statement due to statement timeout

The transaction is now left in the aborted state, so the very next statement - the one meant to
prove Session B is still alive - is refused too, in the same step:

  ERROR:  current transaction is aborted, commands ignored until end of transaction block

That refusal is itself the proof of life: it is an ordinary SQL-level ERROR answered by a live
backend, not "server closed the connection unexpectedly". A died at the connection level (FATAL);
B only errors at the transaction level, and ROLLBACK clears it - rows_now = 5, so the INSERT of
row 99 was discarded along with the rest of B's aborted transaction.

Finally, when A does send something, its psql discovers the corpse:

  FATAL:  terminating connection due to idle-in-transaction timeout
  server closed the connection unexpectedly
          This probably means the server terminated abnormally
          before or while processing the request.
  connection to server was lost

psql exits at that point, which is why this is the last thing Session A does. A connection pool
would reconnect here, and that is the design intent: kill the session, let the client come back
with a fresh one. One timeout kills the connection, the other kills a statement; you want both,
set on the role or the database, with different values for OLTP and reporting roles.`,
      systemsLens: code`
This is lease expiry. A transaction is a lease on shared state - locks, an xid, a snapshot that
pins garbage collection - and a lease held by a party that has stopped communicating must be
reclaimable unilaterally by the server, because the alternative is that one dead TCP connection
degrades the whole cluster indefinitely. Note the crucial detail: PostgreSQL revokes the lease by
killing the connection, not by silently ending the transaction. Silently committing or aborting
under a live client's feet would violate the client's model of the world; destroying the channel
makes the failure unambiguous and forces the client to re-establish state. That is the same rule
as a ZooKeeper session expiry or a Kubernetes lease: when in doubt, fence the holder, do not fudge
the state.

The two timeouts also illustrate the general principle that every operation crossing a trust
boundary needs a deadline, and that deadlines belong at the granularity where the caller's
intention lives. statement_timeout is a request deadline; idle_in_transaction_session_timeout is a
session liveness check. A system with only the first still hangs forever on a client that stops
mid-conversation - which is precisely how a load balancer silently dropping idle TCP connections
turns into an unvacuumable table three days later.`,
      challenge: code`
Prove the horizon claim. In one session open a REPEATABLE READ transaction and read a row; in
another, UPDATE and DELETE a few thousand rows and run VACUUM VERBOSE, watching it report "dead
row versions cannot be removed yet, oldest xmin: N". Then let
idle_in_transaction_session_timeout kill the first session and rerun VACUUM: the same tuples are
now removable. That is the difference between a leaked lease and an expired one, measured in
reclaimed pages.`,
    },

    {
      slug: "table-and-index-usage-counters",
      tags: ["statistics", "observability", "index-scans", "buffer-cache"],
      title: "Per-table counters: seq scans, index scans, and the unused index",
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 6 "Vacuum and Autovacuum".`,
      difficulty: "beginner",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: [
        "index-scan-vs-seq-scan-crossover",
        "pg-stat-io-by-backend-type",
      ],
      overview: code`
pg_stat_io told you what the cluster did. pg_stat_user_tables tells you what each table did, and
it answers the two questions you ask first about a schema you did not write: which tables are
being sequentially scanned in a loop, and which indexes has nobody used since the server started.

Here you reset the counters for one table, run a workload you can count from memory - four seq
scans, a thousand index lookups, some inserts, updates and deletes - and check that every counter
equals what you did. Then you read the cache-hit side of the same story in pg_statio_user_tables,
and confirm that the index nobody queries has idx_scan = 0, which is how you find dead indexes
that cost you write amplification for nothing.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks whether a table is read efficiently and whether its indexes earn their keep. You reset one table's counters, run a countable workload, then compare table, index, and cache statistics. The unused amount index is the warning: it adds write and storage cost even when no query uses it.

### What you are learning

- **Cumulative counters:** Differences between readings are more meaningful than one absolute value.
- **Scan evidence:** seq_scan and seq_tup_read reveal repeated full-table work; idx_scan identifies index use.
- **Approximate estimates:** n_live_tup and n_dead_tup may be misleading briefly after a reset.
- **Index cost:** idx_scan = 0 does not mean an index costs nothing on writes.

### Piece by piece

- **pg_stat_reset_single_table_counters('obs_orders'::regclass)** (targeted reset)
  - What it is: It clears statistics for one table; regclass resolves the name to its catalog identity.
  - What it does here: It creates a zero baseline without erasing other history.
  - What it gives us: Initial counters are zero; n_live_tup stays low until ANALYZE refreshes it.
- **pg_stat_user_tables** (table statistics view)
  - What it is: It reports scans, row changes, live/dead estimates, and vacuum times.
  - What it does here: It measures four sequential scans, index access, inserts, updates, and deletes.
  - What it gives us: Compare seq_scan, seq_tup_read, idx_scan, n_tup_*, and n_dead_tup with the script.
- **pg_stat_user_indexes** and **pg_statio_user_tables** (index and cache views)
  - What they are: The first reports each index's use; the second reports blocks read versus hit.
  - What they do here: They identify the unused amount index and cache behaviour.
  - What they give us: indexrelname with idx_scan finds dead weight; blks_read and blks_hit show cache effectiveness.
- **VACUUM ANALYZE** (maintenance command)
  - What it is: VACUUM makes dead space reusable; ANALYZE refreshes planner statistics.
  - What it does here: It establishes a baseline and visibility map for index-only scans.
  - What it gives us: Better plans and a way to resync row estimates.
- **generate_series(...)**, **LATERAL**, and **nullif(...)** (workload and safe math)
  - What they are: generate_series makes values; LATERAL lets each subquery use one value; nullif avoids division by zero.
  - What they do here: They make 1000 primary-key lookups and a safe summary ratio.
  - What they give us: Counts comparable with the commands issued.
- **pg_sleep(1)** (stats delay)
  - What it is: A one-second pause.
  - What it does here: It lets per-backend statistics reach shared memory.
  - What it gives us: More stable counts, though background work can vary.
- **pg_relation_size(indexrelid)** and **pg_size_pretty(...)** (size report)
  - What they are: They return index bytes and format them.
  - What they do here: They compare used and unused index footprints.
  - What they give us: Disk cost beside the zero-use count.
- **CASE**, **FILTER**, and **round(...)** (report expressions)
  - What they are: CASE chooses a safe result, FILTER limits an aggregate, and round formats numbers.
  - What they do here: The summary computes pct_seq and rows_per_seq_scan.
  - What they give us: High rows_per_seq_scan with repeated seq_scan points to an expensive loop.
- **ALTER TABLE ... SET autovacuum_...** (challenge setting)
  - What it is: A per-table override for vacuum trigger thresholds.
  - What it does here: Threshold 100 and scale factor 0 make 200 deletes trigger quickly.
  - What it gives us: n_dead_tup rises then falls; last_autovacuum records cleanup.`,
      setup: code`
drop table if exists obs_orders;
create table obs_orders(id int primary key, customer int, amount numeric, note text);
insert into obs_orders
  select g, (g % 1000) + 1, (g % 97) * 1.5, 'order ' || g from generate_series(1, 100000) g;
create index obs_orders_customer_idx on obs_orders(customer);
create index obs_orders_amount_idx on obs_orders(amount);
vacuum analyze obs_orders;`,
      code: code`
-- Zero this one table's counters. Never pg_stat_reset() on a machine anybody else is using.
select pg_stat_reset_single_table_counters('obs_orders'::regclass);
select pg_sleep(1);
select seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
from pg_stat_user_tables where relname = 'obs_orders';

-- A workload we can count from memory.
-- 4 sequential scans...
select count(*) from obs_orders;
select count(*) from obs_orders;
select count(*) from obs_orders;
select max(length(note)) from obs_orders;

-- ...1000 primary-key lookups, one index scan each...
select count(*) as pk_lookups from generate_series(1, 1000) g,
  lateral (select id from obs_orders where id = g) s;

-- ...3 index scans on customer, and some writes.
select count(*) from obs_orders where customer = 7;
select count(*) from obs_orders where customer = 8;
select count(*) from obs_orders where customer = 9;

insert into obs_orders select g, 1, 1.0, 'new' from generate_series(100001, 100010) g;
update obs_orders set note = 'touched' where id between 1 and 50;
delete from obs_orders where id between 90001 and 90020;

-- Counters are flushed at transaction end, at most once a second.
select pg_sleep(1);

select seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
       n_tup_ins, n_tup_upd, n_tup_hot_upd, n_tup_del, n_live_tup, n_dead_tup
from pg_stat_user_tables where relname = 'obs_orders';

-- Which index earned its keep?
select indexrelname, idx_scan, idx_tup_read, idx_tup_fetch,
       pg_size_pretty(pg_relation_size(indexrelid)) as size
from pg_stat_user_indexes where relname = 'obs_orders' order by indexrelname;

-- The cache side of the same workload.
select heap_blks_read, heap_blks_hit,
       round(100.0 * heap_blks_hit / nullif(heap_blks_hit + heap_blks_read, 0), 2) as heap_hit_pct,
       idx_blks_read, idx_blks_hit,
       round(100.0 * idx_blks_hit / nullif(idx_blks_hit + idx_blks_read, 0), 2) as idx_hit_pct
from pg_statio_user_tables where relname = 'obs_orders';

-- The classic "find the tables somebody is scanning in a loop" query.
select relname, seq_scan, idx_scan,
       case when seq_scan + idx_scan = 0 then null
            else round(100.0 * seq_scan / (seq_scan + idx_scan), 1) end as pct_seq,
       seq_tup_read / nullif(seq_scan, 0) as rows_per_seq_scan
from pg_stat_user_tables
where relname like 'obs_%'
order by seq_scan desc;`,
      expectedResult: code`
Right after the reset every counter reads 0 - including n_live_tup and n_dead_tup:

   seq_scan | idx_scan | n_tup_ins | n_tup_upd | n_tup_del | n_live_tup | n_dead_tup
  ----------+----------+-----------+-----------+-----------+------------+------------
          0 |        0 |         0 |         0 |         0 |          0 |          0

That is a sharp edge worth knowing before you run this in production:
pg_stat_reset_single_table_counters() zeroes n_live_tup/n_dead_tup along with every other counter
for the table, even though the table still has 100000 real rows. Those two are estimates
maintained incrementally from insert/update/delete/vacuum events, not read live from the heap, so
after a reset they read low (0, then a small net change) until the next ANALYZE or autovacuum
resyncs them with reality - a monitoring query that reads n_live_tup right after someone resets
counters will report a table looking empty when it is not.

After the workload the counters mostly match the script line for line, with two real surprises:

   seq_scan | seq_tup_read | idx_scan | idx_tup_fetch | n_tup_ins | n_tup_upd | n_tup_hot_upd
  ----------+--------------+----------+---------------+-----------+-----------+---------------
          4 |       400000 |     1007 |            70 |        10 |        50 |             0

   n_tup_del | n_live_tup | n_dead_tup
  -----------+------------+------------
          20 |          0 |         70

- seq_scan = 4 and seq_tup_read = 400000: four scans of 100000 rows. rows_per_seq_scan = 100000
  is the number that matters - a seq scan of 3 rows is free, a seq scan of 100000 rows in a loop
  is your outage.
- idx_scan = 1007 (roughly 1000 primary-key lookups + 3 customer lookups + 1 for the UPDATE's
  WHERE + 1 for the DELETE's WHERE, with a couple more from background activity in the window -
  the count moves a little run to run).
- idx_tup_fetch = 70, not ~1070. EXPLAIN shows why: "select id from obs_orders where id = g" and
  "select count(*) ... where customer = 7" both plan as Index Only Scan - they need nothing from
  the heap, and the table was just VACUUM ANALYZEd so the visibility map is fully set, so those
  1003 lookups touch the index only and never increment idx_tup_fetch. The UPDATE and DELETE are
  plain Index Scans (they have to touch the heap to write), and idx_tup_fetch = 70 is exactly
  their row counts: 50 + 20.
- n_tup_upd = 50 with n_tup_hot_upd = 0, the opposite of "note is unindexed so it's free": this
  table was just bulk-loaded at the default fillfactor (100), so every page is packed solid with
  no slack for an in-place rewrite. Every one of the 50 updates had to move its new tuple version
  to a different page, which is not a HOT update even though no indexed column changed - HOT needs
  free space on the same page, not just an unindexed column. (A table that has been running for a
  while, with fillfactor headroom from earlier vacuums, would show these as HOT.)
- n_live_tup = 0 and n_dead_tup = 70: n_live_tup stays wrong (it is 0 + net-inserted since the
  reset floors at 0, so 10 ins - 20 del never goes negative here) until the next ANALYZE or
  autovacuum; n_dead_tup, which only counts up from updates and deletes, is unaffected by that and
  reads correctly (50 old versions from the UPDATE plus 20 from the DELETE). Never trust
  n_live_tup right after a manual reset.

Per index, the dead one is still unmistakable - idx_scan is the only column immune to the
index-only-scan effect above, because it counts every plan that touches the index at all:

        indexrelname        | idx_scan | idx_tup_read | idx_tup_fetch |  size
  ---------------------------+----------+--------------+---------------+---------
   obs_orders_amount_idx     |        0 |            0 |             0 | 2224 kB
   obs_orders_customer_idx   |        3 |          300 |             0 | 688 kB
   obs_orders_pkey           |     1004 |         1072 |            70 | 2208 kB

obs_orders_amount_idx has never been used, yet every INSERT, UPDATE and DELETE above had to
maintain it. That is the query to run first on a schema you inherited. (amount is numeric, which
packs wider per index entry than customer's int4, so the never-used index is also the biggest one
here - dead weight and disk both.)

The cache is fully warm, because the table is 13 MB in a 128 MB buffer pool - idx_blks_read is not
exactly 0 here (1000+ index-only point lookups do occasionally miss the cache) but the hit rate is
still effectively total:

   heap_blks_read | heap_blks_hit | heap_hit_pct | idx_blks_read | idx_blks_hit | idx_hit_pct
  ----------------+---------------+--------------+---------------+--------------+-------------
                0 |          5370 |       100.00 |            62 |       202247 |       99.97

And the summary query names the offender - plus every other obs_ table this module has built so
far in this database, because a learner going through the module in order still has them:

     relname    | seq_scan | idx_scan | pct_seq | rows_per_seq_scan
  ---------------+----------+----------+---------+-------------------
   obs_orders    |        4 |     1007 |     0.4 |            100000
   obs_ledger    |        4 |        2 |    66.7 |                 3
   obs_accounts  |        1 |        3 |    25.0 |                 0

obs_orders is still the one worth paging someone about: a 100000-row seq scan in a loop next to
lookups that are almost all under 5 rows.

(Exact counts drift with what else has run in the window - autovacuum firing mid-script can nudge
idx_scan and reset n_dead_tup toward 0 - but the shape holds: idx_tup_fetch undercounts index-only
scans, n_live_tup is unreliable right after a manual reset, and fillfactor, not indexedness, is
what decides HOT.)`,
      systemsLens: code`
These counters are the cheapest observability there is - integers incremented on a path that was
already executing - and their design shows the two compromises that buys. They are approximate
(accumulated per backend, flushed at transaction end and at most once a second, lost on a crash)
and they are cumulative-since-reset, so the only meaningful operation is a difference between two
readings. That is exactly the contract of a Prometheus counter, and it is why monitoring systems
store rates rather than values, and why "counter reset" is a first-class concept rather than a
bug.

The operational habit worth stealing is ratio-of-rates over absolute numbers. seq_scan alone is
meaningless; seq_tup_read per seq_scan tells you whether a scan is a lookup on a tiny table or a
full pass over a hundred thousand rows, and its rate of change tells you whether it is in a loop.
The same reframing turns "cache hit ratio 99%" - a number that reads 99% on every healthy and
every unhealthy PostgreSQL - into "heap_blks_read per second", which actually moves when
something breaks.

Finally, idx_scan = 0 is a rare thing in systems work: direct evidence of a cost with no benefit.
Every unused index is write amplification, extra WAL, extra bloat, extra lock scope on DDL and
extra planning time, paid on every write, forever. Systems accumulate these - unused caches,
unused replicas, unused metrics - and only usage counters find them.`,
      challenge: code`
Watch autovacuum decide. n_dead_tup and n_live_tup are its inputs: a table is eligible when
n_dead_tup > autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor * n_live_tup (50 +
0.2 * n_live_tup by default). Set the scale factor to 0 and the threshold to 100 on obs_orders
with ALTER TABLE ... SET, delete 200 rows, and watch n_dead_tup climb and then snap back to 0
with last_autovacuum updated. How long does the launcher take to notice, and which setting
controls that?`,
    },

    {
      slug: "read-the-server-log",
      tags: ["logging", "observability", "postmortem", "incident"],
      title: "The server log is the ground truth for a postmortem",
      reading:
        code`PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (section "WAL Setup"); Chapter 15 "Locks on Memory Structures" (section "Monitoring Waits")`,
      readingNotes: code`
Chapter 10 shows the logging settings used to observe checkpoints, while Chapter 15 connects wait monitoring with lock contention. This lesson adds duration logging, line prefixes, and a complete wait timeline for a postmortem. Read before or after; the book supplies the mechanisms and the experiment supplies the workflow.`,
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: [
        "max-wal-size-forces-checkpoints",
        "idle-in-transaction-kills-you",
      ],
      overview: code`
Statistics views tell you what is true now. The log tells you what was true at 03:14 last
Tuesday, which is the only question a postmortem ever asks. PostgreSQL will write a line for
every lock wait longer than deadlock_timeout, every statement slower than a threshold you choose,
every checkpoint, every connection failure and every slow autovacuum - but most of that is off by
default, so the log you find during an incident is the log you configured before it.

In this lesson you set those thresholds for your session, cause each phenomenon deliberately, and
then read your own log lines back from inside psql. By the end you can look at four lines of text
and reconstruct which backend waited for which transaction, for how long, and on which row.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks how to reconstruct an incident after sessions are gone. You set temporary logging thresholds, make one session wait on a row update while another sleeps, force a checkpoint, and read new lines from SQL and the shell. Timestamps, PIDs, transaction IDs, wait duration, and statement text form a durable story that a live view cannot provide later.

### What you are learning

- **Logs versus metrics:** Counters summarize now; log lines preserve identity and order for later investigation.
- **Thresholds:** log_lock_waits and log_min_duration_statement decide which events become historical evidence.
- **Line structure:** log_line_prefix makes entries joinable to activity rows and application logs.
- **Entry and exit events:** A still-waiting line plus an acquired line gives cause and final duration.

### Piece by piece

- **pg_settings** (configuration view)
  - What it is: It reports current values and change contexts.
  - What it does here: The first query records logging settings.
  - What it gives us: setting and context tell you what is enabled and whether SET is allowed.
- **log_line_prefix** (log-format setting)
  - What it is: It controls fields at the start of each line.
  - What it does here: %m is time, %p PID, and %u@%d user/database; background processes have blank client fields.
  - What it gives us: Join lines to pg_stat_activity and distinguish a client from a checkpointer.
- **log_lock_waits** and **deadlock_timeout** (lock settings)
  - What they are: The first logs a long wait and acquisition; the second is the deadlock check delay and logging threshold.
  - What they do here: B waits beyond 500 ms, so both events are logged.
  - What they give us: Transaction ID and elapsed milliseconds identify holder and duration.
- **log_min_duration_statement** (statement setting)
  - What it is: It logs completed statements at or above a millisecond threshold.
  - What it does here: 200 ms captures the sleeps and blocked UPDATE.
  - What it gives us: Duration lines include statement text.
- **pg_stat_file(...)**, **\gset**, and **pg_read_file(...)** (bounded file read)
  - What they are: pg_stat_file returns size; \gset saves log_size_before; pg_read_file reads a data-directory-relative byte range.
  - What they do here: The query reads only newly appended log data.
  - What they give us: The SQL filter avoids older incidents.
- **regexp_split_to_table(..., chr(10)) WITH ORDINALITY** (line parser)
  - What it is: It turns newline-separated text into numbered rows.
  - What it does here: A regular expression selects waiting, acquired, duration, and checkpoint lines.
  - What it gives us: n preserves file order and l contains evidence.
- **CHECKPOINT** (checkpoint command)
  - What it is: It asks the checkpointer to flush dirty pages.
  - What it does here: It adds a background-process start/complete pair.
  - What it gives us: Buffer, WAL, sync, total-time, and LSN fields describe work.
- **\! tail -n 12 ...** (psql shell escape)
  - What it is: \! runs tail; -n 12 keeps twelve lines.
  - What it does here: It includes continuation lines omitted by the SQL filter.
  - What it gives us: Lock-holder PID, tuple location, and statement context.
- **ALTER ROLE ... SET** (challenge scope)
  - What it is: It stores a setting for one role.
  - What it does here: A value of 0 creates a complete trace for that caller.
  - What it gives us: Compare targeted log volume with pg_stat_statements aggregation.`,
      setup: code`
drop table if exists obs_log_demo;
create table obs_log_demo(id int primary key, note text);
insert into obs_log_demo select g, 'row ' || g from generate_series(1, 5) g;`,
      code: code`
-- Session A
-- What is on now, and where does the log currently end?
select name, setting, context from pg_settings
where name in ('log_line_prefix','log_lock_waits','log_min_duration_statement',
               'deadlock_timeout','log_checkpoints','log_connections')
order by name;
select (pg_stat_file('log/postgresql.log')).size as log_size_before \gset

-- Per-session settings, not ALTER SYSTEM: a threshold that suits a report ruins an OLTP path.
set log_min_duration_statement = '200ms';
set deadlock_timeout = '500ms';

begin;
update obs_log_demo set note = 'held by A' where id = 1;
select pg_backend_pid() as a_pid;

-- Session B
-- B will wait longer than deadlock_timeout, so the server narrates the wait.
set log_lock_waits = on;
set deadlock_timeout = '500ms';

-- Session B (blocks until A commits)
update obs_log_demo set note = 'wanted by B' where id = 1;

-- Session A
select pg_sleep(2);
-- A slow statement of our own, well over the 200 ms threshold.
select pg_sleep(0.4);
checkpoint;
commit;

-- Session B
select id, note from obs_log_demo where id = 1;

-- Session A
select pg_sleep(1);
-- Everything the server wrote since we started, as rows.
select n, l from regexp_split_to_table(
         pg_read_file('log/postgresql.log', :log_size_before, 200000), chr(10))
         with ordinality as t(l, n)
where l ~ 'still waiting|acquired|duration:|checkpoint (starting|complete)'
order by n;

-- The same file from the shell, the way you would read it at 3 a.m.
\! tail -n 12 $PGLAB/primary/log/postgresql.log

-- Put the session thresholds back.
reset log_min_duration_statement;
reset deadlock_timeout;`,
      expectedResult: code`
The lab already ships with the useful settings on, and the contexts tell you who may change them
and how:

            name             |    setting     |      context
  ---------------------------+----------------+--------------------
   deadlock_timeout          | 1000           | superuser
   log_checkpoints           | on             | sighup
   log_connections           | off            | superuser-backend
   log_line_prefix           | %m [%p] %u@%d  | sighup
   log_lock_waits            | on             | superuser
   log_min_duration_statement| 500            | superuser

Then the experiment writes its own history. The SQL query filters on
'still waiting|acquired|duration:|checkpoint (starting|complete)', so it does NOT match DETAIL,
CONTEXT or STATEMENT continuation lines - those show up separately, below. The filtered rows read,
in order:

   n |                                                       l
  ---+---------------------------------------------------------------------------------------------------------
   1 | 2026-09-03 11:04:58.971 UTC [139402] postgres@lab LOG:  process 139402 still waiting
     |   for ShareLock on transaction 88640 after 500.202 ms
   5 | 2026-09-03 11:05:00.481 UTC [139400] postgres@lab LOG:  duration: 2010.398 ms
     |   statement: select pg_sleep(2);
   6 | 2026-09-03 11:05:00.884 UTC [139400] postgres@lab LOG:  duration: 402.516 ms
     |   statement: select pg_sleep(0.4);
   7 | 2026-09-03 11:05:00.885 UTC [44443] @ LOG:  checkpoint starting: immediate force wait
   8 | 2026-09-03 11:05:00.917 UTC [44443] @ LOG:  checkpoint complete: wrote 33 buffers
     |   (0.2%); 0 WAL file(s) added, 0 removed, 0 recycled; write=0.011 s, sync=0.008 s,
     |   total=0.032 s; sync files=28, longest=0.002 s, average=0.001 s; distance=175 kB,
     |   estimate=238510 kB; lsn=1/6F09C660, redo lsn=1/6F09C620
   9 | 2026-09-03 11:05:00.920 UTC [139402] postgres@lab LOG:  process 139402 acquired
     |   ShareLock on transaction 88640 after 2449.943 ms
  12 | 2026-09-03 11:05:00.922 UTC [139402] postgres@lab LOG:  duration: 2452.594 ms
     |   statement: update obs_log_demo set note = 'wanted by B' where id = 1;
  13 | 2026-09-03 11:05:01.933 UTC [139400] postgres@lab LOG:  duration: 1005.443 ms
     |   statement: select pg_sleep(1);

Notice line 7-8: the checkpointer's own log lines show "[44443] @ LOG" - user and database are
both empty, because log_line_prefix's %u/%d expand to nothing for a process with no client
connection. That blank "@" is how you tell a background-process line from a client-backend line
(which always reads "postgres@lab") at a glance.

The n values are not consecutive because rows 2-4 (DETAIL/CONTEXT/STATEMENT for the "still
waiting" line above) and 10-11 (CONTEXT/STATEMENT for the "acquired" line) exist in the log but do
not match the filter - the \! tail below shows them. Session A's own two pg_sleep() calls
(n=5,6: 2 s then 0.4 s) also cross log_min_duration_statement and get logged, which is why they
appear interleaved with B's lock wait: they ran concurrently while B waited.

Six of those lines are an entire incident report. From them alone you know: PID 139402, connected
as postgres to lab, waited for a ShareLock on transaction 88640; the checkpointer ran a manual
checkpoint (44443, blank user/db) in the middle of the wait; and the wait lasted 2449.943 ms, which
the "acquired" line reports so you never have to guess whether the waiter eventually got in or
gave up. None of that is in any statistics view a minute later.

Note what the "still waiting" line implies about cost: log_lock_waits piggybacks on the timer
that already exists for deadlock detection, so it logs nothing for waits shorter than
deadlock_timeout (500 ms here, 1 s by default). It is close to free, and there is no good reason
to run production with it off.

"checkpoint starting: immediate force wait" is the reason code for a manual CHECKPOINT - compare
"wal" and "time" in the checkpoints module. The buffer/byte counts here (33 buffers, 175 kB) are
tiny only because this lab's shared_buffers is mostly clean between lessons; on a busier database
the same line reports thousands of buffers and tens of megabytes, and "total=" is the number to
alert on.

The \! tail prints the same window unfiltered - DETAIL, CONTEXT and STATEMENT included, in the
order they were written - which is what you actually get at 3 a.m.; the SQL version is what you
want once you know which needle you are looking for. In this run it captured the tail end of the
"still waiting" line's own continuation (its DETAIL line, since the LOG line itself had already
scrolled out of the last 12) through the final duration line:

  ... DETAIL:  Process holding the lock: 139400. Wait queue: 139402.
  ... CONTEXT:  while updating tuple (0,1) in relation "obs_log_demo"
  ... STATEMENT:  update obs_log_demo set note = 'wanted by B' where id = 1;
  ... LOG:  duration: 2010.398 ms  statement: select pg_sleep(2);
  ... LOG:  duration: 402.516 ms  statement: select pg_sleep(0.4);
  ... [44443] @ LOG:  checkpoint starting: immediate force wait
  ... [44443] @ LOG:  checkpoint complete: wrote 33 buffers (0.2%); ...
  ... LOG:  process 139402 acquired ShareLock on transaction 88640 after 2449.943 ms
  ... CONTEXT:  while updating tuple (0,1) in relation "obs_log_demo"
  ... STATEMENT:  update obs_log_demo set note = 'wanted by B' where id = 1;
  ... LOG:  duration: 2452.594 ms  statement: update obs_log_demo set note = 'wanted by B' ...
  ... LOG:  duration: 1005.443 ms  statement: select pg_sleep(1);

(PIDs, timestamps and transaction ids differ on your run, and so does the checkpoint's buffer
count. If the "still waiting" line is missing, your UPDATE was unblocked in under
deadlock_timeout - lengthen Session A's pg_sleep. Occasionally a second, unrelated
"checkpoint complete" line from a background scheduled checkpoint appears right before your own
manual one - the lab's autovacuum/checkpoint clock does not stop for the lesson.)`,
      systemsLens: code`
Metrics are lossy by construction: they aggregate over time and throw away identity. The lock
wait above becomes, in a metrics system, "1 lock wait, p99 2.5 s" - which tells you nothing about
which transaction, which row or which statement. Logs keep identity and causality at the price of
volume, which is exactly the trade every observability stack negotiates: metrics for detection,
logs and traces for diagnosis. A postmortem is a diagnosis, so it lives in the logs.

The design detail worth copying is the pairing of "still waiting after N ms" with "acquired after
N ms". Emitting only the entry event gives you an alert with no resolution and no duration;
emitting only the exit event means an event that never finishes is invisible - the failure mode
where the most important incident produces the least telemetry. Instrument both edges of every
wait, and make the threshold for logging the entry the same knob as the threshold for reacting to
it, as PostgreSQL does with deadlock_timeout.

Finally, log_line_prefix is a schema. The reason %p, %u and %d are worth their bytes is that they
make lines joinable to pg_stat_activity and to your application's own logs; adding %a
(application_name, which your connection string can set per service) turns the database log into
something you can group by caller. Structured, joinable fields chosen before the incident are the
difference between grep and archaeology.`,
      challenge: code`
Set log_min_duration_statement = 0 for one role only (ALTER ROLE ... SET) and run a small
workload as that role: you now have a complete statement trace for one caller and nothing extra
for anyone else. Then compare its cost - log volume in bytes per second, and statement latency
with and without - against pg_stat_statements from module 11, which aggregates instead of
recording. When is each the right tool?`,
    },
  ],
};
