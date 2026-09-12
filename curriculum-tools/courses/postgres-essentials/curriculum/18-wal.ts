import { code, type Module } from "../../../src/types.ts";

export const WAL: Module = {
  category: "wal-and-recovery",
  title: "Commit acknowledgement and WAL cost",
  lessons: [
    {
      slug: "commit-and-wal",
      title: "Connect commit acknowledgement to durable log work",
      difficulty: "intermediate",
      prerequisites: ["join-memory"],
      tags: ["wal", "commit", "durability", "lsn"],
      estimatedMinutes: 25,
      revision: 1,
      sessions: 1,
      safetyLevel: "ddl",
      runIn: "tool",
      overview:
        "Place a logged row change in PostgreSQL's WAL stream, then compare insert, write and flush positions after commits with synchronous_commit on and off. The experiment connects a successful COMMIT to a precise local durability contract while keeping measured positions separate from claims about power loss.",
      caution:
        "Run this on a PostgreSQL instance where fsync is on, as the setup verifies. The lesson changes synchronous_commit only inside each transaction. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_commit_wal; RESET lock_timeout; RESET statement_timeout before rerunning setup.",
      syntaxBreakdown: code`
### In plain terms
PostgreSQL describes progress through its write-ahead log with log sequence numbers, or LSNs. A
logged change first advances the insert position, then WAL is written to the operating system, and
finally flushed to durable storage. With synchronous_commit on, a standalone primary waits for the
local commit record to be flushed before reporting success. With it off, PostgreSQL may report
success earlier, while preserving database consistency if it later recovers.

### Mechanism map

${"```text"}
A success response sits on a log boundary

row change -> WAL inserted -> WAL written -> WAL flushed to durable storage
                  |               |                    |
                  +-- rollback can discard the row     +-- synchronous_commit=on waits here
                                      synchronous_commit=off may acknowledge earlier

An LSN is a position in that stream. Comparing positions shows progress, not a power-loss test.
${"```"}

### Terminals and cleanup
Open one experiment terminal (Session A) and connect each psql session with:
${"```sh"}
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
${"```"}
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run every block in Session A in the order shown.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- WAL records describe changes before the corresponding data pages may be written, so recovery can
  replay committed work after a process failure.
- pg_current_wal_insert_lsn, pg_current_wal_lsn and pg_current_wal_flush_lsn represent inserted,
  written and durably flushed progress on a primary.
- A successful local synchronous commit establishes a documented flush boundary. An asynchronous
  commit relaxes when success may be returned, though an immediate sample can already show no gap.
- WAL generation alone does not make a transaction's row effects committed or visible.

### Piece by piece
- **current_setting('fsync')** reads whether PostgreSQL asks the operating system to make updates
  durable. **= 'on'** turns that text comparison into a Boolean. The
  experiment stops if it is off because flush positions would not support the intended contract.
- **SET lock_timeout / statement_timeout** bound fixture locks and each statement. RESET restores
  the session defaults after cleanup.
- **pg_current_wal_insert_lsn()** returns the end of WAL inserted so far by this primary. Capturing it
  after INSERT and before COMMIT proves a lower bound that the commit must pass; it is not the exact
  commit-record LSN because COMMIT itself adds WAL.
- **pg_current_wal_lsn()** returns the current WAL write position, and
  **pg_current_wal_flush_lsn()** returns the position known flushed to durable storage.
- **\gset on_** and **\gset off_** save a one-row query's columns as psql variables. A later
  **:'name'::pg_lsn** safely quotes and casts the saved text back to PostgreSQL's pg_lsn type.
- **SET LOCAL synchronous_commit = on/off** applies only until that transaction ends. On requires
  this standalone primary's local commit WAL to be flushed before success; off permits an earlier
  acknowledgement and does not disable WAL or fsync globally.
- **pg_wal_lsn_diff(a, b)** reports the byte distance between two LSNs as a numeric value. The
  asynchronous gap can be zero because WAL flushing continues in the background and observation
  itself occurs after COMMIT returns.
- **greatest(distance, 0)** clamps a negative distance to zero after the saved position has already
  been flushed. This measures only how much of the pre-commit saved position remains unflushed,
  not the full commit-record gap; separate position calls can sample slightly different moments.
- **\echo** prints the prerequisite failure message; the rollback variation's **repeat('r',1000)**
  supplies a fixed payload large enough for positive WAL generation to be easy to inspect.
- **count(*) FILTER (WHERE label = ...)** independently confirms both committed rows are visible.
- **\if / \else / \endif / \quit** branch on the saved Boolean and stop psql if the required
  setting is absent.
`,
      setup: code`
set lock_timeout = '3s';
set statement_timeout = '30s';
select current_setting('fsync') = 'on' as fsync_is_on \gset
\if :fsync_is_on
\else
  \echo 'This experiment requires fsync=on.'
  \quit
\endif
drop table if exists pe_commit_wal;
create table pe_commit_wal (id integer primary key, label text not null);`,
      code: code`
-- Session A: save WAL inserted by the row, then require a synchronous commit.
begin;
set local synchronous_commit = on;
insert into pe_commit_wal values (1, 'synchronous');
select pg_current_wal_insert_lsn() as write_lsn \gset on_
commit;
select :'on_write_lsn'::pg_lsn as saved_write_lsn,
       pg_current_wal_lsn() as current_write_lsn,
       pg_current_wal_flush_lsn() as current_flush_lsn,
       pg_current_wal_flush_lsn() >= :'on_write_lsn'::pg_lsn as flush_reached_saved_write;

-- Session A: permit early acknowledgement, then report the gap actually sampled.
begin;
set local synchronous_commit = off;
select pg_current_wal_flush_lsn() as before_flush_lsn \gset off_
insert into pe_commit_wal values (2, 'asynchronous');
select pg_current_wal_insert_lsn() as write_lsn \gset off_
commit;
select :'off_write_lsn'::pg_lsn as saved_write_lsn,
       :'off_before_flush_lsn'::pg_lsn as flush_before_insert,
       pg_current_wal_lsn() as sampled_write_lsn,
       pg_current_wal_flush_lsn() as sampled_flush_lsn,
       greatest(pg_wal_lsn_diff(:'off_write_lsn'::pg_lsn, pg_current_wal_flush_lsn()), 0)
         as sampled_unflushed_bytes;

select count(*) filter (where label = 'synchronous') as synchronous_rows,
       count(*) filter (where label = 'asynchronous') as asynchronous_rows
from pe_commit_wal;

drop table pe_commit_wal;
reset lock_timeout;
reset statement_timeout;`,
      expectedResult: code`
The setup reports no error only when fsync is on. Both INSERTs and both COMMITs succeed. After the
synchronous commit, flush_reached_saved_write is t: the sampled flush LSN is at or beyond the WAL
position saved after its INSERT. The current write and flush positions can be later because COMMIT
adds WAL and other cluster activity may advance them.

After the asynchronous commit, flush_before_insert is the flush position sampled before its INSERT,
and sampled_unflushed_bytes is a nonnegative measurement relative to the saved post-INSERT position.
It may be positive or zero; zero does not change the fact that synchronous_commit=off permitted the success
response before local flush, because the background flush can win this observation race. The final
query reports synchronous_rows=1 and asynchronous_rows=1. These positions do not simulate power
loss and therefore do not prove which async commit would survive one. Cleanup drops pe_commit_wal
and restores both session guards.
`,
      systemsLens:
        "An acknowledgement contract names the boundary crossed before success is returned. WAL ordering keeps the database recoverable, while synchronous_commit chooses whether this client waits for the local durability boundary. Similar choices appear in replicated logs and storage APIs: define whether success means accepted in memory, written by an operating system, durably stored, or replicated, then monitor the position that represents that promise.",
      challenge:
        "Optional rollback variation, independently runnable. Predict whether WAL can advance even though no row remains:\n\n```sql\nset lock_timeout = '3s';\nset statement_timeout = '30s';\ndrop table if exists pe_wal_rollback;\ncreate table pe_wal_rollback (id integer primary key, payload text not null);\nselect pg_current_wal_insert_lsn() as before_lsn \\gset\nbegin;\ninsert into pe_wal_rollback values (1, repeat('r', 1000));\nrollback;\nselect pg_wal_lsn_diff(pg_current_wal_insert_lsn(), :'before_lsn'::pg_lsn) as wal_bytes_generated,\n       (select count(*) from pe_wal_rollback) as visible_rows;\ndrop table pe_wal_rollback;\nreset lock_timeout;\nreset statement_timeout;\n```\n\nExpect wal_bytes_generated to be positive and visible_rows to be 0. WAL records participate in recovery and rollback semantics; bytes in the log are not proof that the attempted row became a committed effect.",
    },
    {
      slug: "wal-per-useful-write",
      title: "Measure WAL per useful operation",
      difficulty: "intermediate",
      prerequisites: ["commit-and-wal"],
      tags: ["wal", "transactions", "batching", "write-amplification"],
      estimatedMinutes: 25,
      revision: 1,
      sessions: 1,
      safetyLevel: "ddl",
      runIn: "tool",
      overview:
        "Execute 200 identical INSERT statements as 200 autocommit transactions and as one explicit transaction. Measure each WAL interval and verify equal final content, turning batching from a general recommendation into a bounded write-amplification observation.",
      caution:
        "LSNs and WAL generation are cluster-wide. Run the two phases together on a quiet instance, do not insert a checkpoint between them, and interpret the exact byte counts only as evidence from this fixture. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_wal_single, pe_wal_batch; RESET synchronous_commit; RESET lock_timeout; RESET statement_timeout before rerunning setup.",
      syntaxBreakdown: code`
### In plain terms
Every committed transaction has bookkeeping beyond its useful row changes. This comparison holds
the 200 INSERT statements, IDs and payloads constant while changing how many transaction boundaries
surround them. LSN subtraction measures all WAL generated in each interval, including commits.

### Mechanism map

${"```text"}
Equal useful rows, different transaction boundaries

200 INSERT statements                 200 INSERT statements
200 autocommit transactions           1 explicit transaction
          |                                      |
          +------------ measure WAL bytes --------+
                         compare rows + checksum

Batching shares transaction-level WAL overhead; the measured ratio belongs to this controlled run.
${"```"}

### Terminals and cleanup
Open one experiment terminal (Session A) and connect each psql session with:
${"```sh"}
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
${"```"}
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run every block in Session A in the order shown.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- Autocommit makes each standalone INSERT its own transaction; an explicit BEGIN and COMMIT lets 200
  statements share one transaction boundary.
- WAL bytes per useful row can fall when transaction-level records and flush opportunities are
  amortized, while batching also increases transaction lifetime and failure scope.
- Equal row counts and checksums establish equal final useful content before comparing WAL cost.
- WAL positions are cluster-wide and full-page images depend on checkpoint history, so exact ratios
  are measurements under controlled conditions rather than universal constants.

### Piece by piece
- **synchronous_commit = on** makes both phases use the same local commit policy. It also ensures the
  lesson is comparing transaction count rather than deliberately changing acknowledgement policy.
- **CREATE TABLE ... (LIKE ... INCLUDING ALL)** gives both phases the same columns and primary-key
  index shape. The separate fresh relations receive equal logical content.
- **generate_series(1, 200)** produces the same integer IDs for both tables. **g::text** converts an
  ID for md5, **repeat(..., 4)** makes the fixed payload, and **||** concatenates checksum fields.
- **format(..., %s, %L)** substitutes an already numeric ID with %s and quotes each generated
  payload as a SQL literal with %L. **\gexec** executes every
  returned line as a separate command. Outside BEGIN those are 200 autocommit transactions; inside
  BEGIN they remain 200 individual INSERT statements in one transaction.
- **pg_current_wal_insert_lsn()** brackets each complete phase. **pg_wal_lsn_diff** subtracts its
  starting LSN from its ending LSN, including WAL inserted by COMMIT because the ending sample is
  taken afterward.
- **\gset** saves measured byte counts and later **:variable** substitutions print them together.
  **::pg_lsn** and **::numeric** cast saved text for LSN subtraction and arithmetic.
- **round(bytes / 200, 2)** reports measured WAL bytes per useful row without implying that every
  row owns an independently identifiable slice of WAL.
- **count(*)** counts all final rows.
- **md5(string_agg(... ORDER BY id))** creates a deterministic content checksum. Equal counts and
  checksums prove the two tables reached equal final content despite different batching.
- There is no CHECKPOINT between the compared batches. Fresh, equally shaped relations reduce
  layout differences, but cluster activity and full-page-image history can still perturb an LSN
  interval; repeat on a quiet private cluster when exact attribution matters.
`,
      setup: code`
set lock_timeout = '3s';
set statement_timeout = '60s';
set synchronous_commit = on;
drop table if exists pe_wal_single, pe_wal_batch;
create table pe_wal_single (id integer primary key, payload text not null);
create table pe_wal_batch (like pe_wal_single including all);`,
      code: code`
-- Session A: 200 generated INSERT commands, each committed by autocommit.
select pg_current_wal_insert_lsn() as start_lsn \gset single_
select format('insert into pe_wal_single values (%s, %L);', g, repeat(md5(g::text), 4))
from generate_series(1, 200) as g
\gexec
select pg_wal_lsn_diff(pg_current_wal_insert_lsn(), :'single_start_lsn'::pg_lsn) as wal_bytes
\gset single_

-- Session A: the same 200 commands inside one transaction; no checkpoint separates the phases.
select pg_current_wal_insert_lsn() as start_lsn \gset batch_
begin;
select format('insert into pe_wal_batch values (%s, %L);', g, repeat(md5(g::text), 4))
from generate_series(1, 200) as g
\gexec
commit;
select pg_wal_lsn_diff(pg_current_wal_insert_lsn(), :'batch_start_lsn'::pg_lsn) as wal_bytes
\gset batch_

select :single_wal_bytes::numeric as autocommit_wal_bytes,
       round(:single_wal_bytes::numeric / 200, 2) as autocommit_bytes_per_row,
       :batch_wal_bytes::numeric as batched_wal_bytes,
       round(:batch_wal_bytes::numeric / 200, 2) as batched_bytes_per_row;
select (select count(*) from pe_wal_single) as autocommit_rows,
       (select count(*) from pe_wal_batch) as batched_rows,
       (select md5(string_agg(id::text || ':' || payload, ',' order by id)) from pe_wal_single)
         =
       (select md5(string_agg(id::text || ':' || payload, ',' order by id)) from pe_wal_batch)
         as checksums_equal;

drop table pe_wal_single, pe_wal_batch;
reset synchronous_commit;
reset lock_timeout;
reset statement_timeout;`,
      expectedResult: code`
Both phases execute exactly 200 INSERT commands. The final evidence reports autocommit_rows=200,
batched_rows=200 and checksums_equal=t, proving equal useful final content. Both WAL intervals and
both per-row values are positive. On the validated quiet PostgreSQL 16 cluster, the 200 autocommit
transactions generated more WAL in total and per row than the single explicit transaction; the
validated exact-source run measured 59,464 bytes (297.32 per row) for autocommit and 51,544 bytes
(257.72 per row) for the single transaction.

Exact LSNs, byte counts and their ratio can vary with PostgreSQL build, concurrent cluster activity,
page layout and full-page-image history. The stable lesson outcome is equal content plus a lower
measured interval for the one-transaction phase in this controlled run, not a universal per-row
cost or throughput claim. No checkpoint occurs between phases. Cleanup drops both tables and
restores synchronous_commit and both session guards.
`,
      systemsLens:
        "Batching amortizes fixed coordination and log metadata across more useful operations, a pattern shared by commit logs, network protocols and object storage requests. Larger batches also hold resources longer, enlarge retries and delay individual acknowledgements. Choose a batch boundary from measured write amplification together with latency, contention and failure-scope requirements.",
      challenge:
        "Optional intermediate-batch variation, independently runnable. This groups the same 200 individual INSERT statements into ten transactions of 20; predict whether its WAL interval falls between the two core phases:\n\n```sql\nset lock_timeout = '3s';\nset statement_timeout = '60s';\nset synchronous_commit = on;\ndrop table if exists pe_wal_twenty;\ncreate table pe_wal_twenty (id integer primary key, payload text not null);\nselect pg_current_wal_insert_lsn() as start_lsn \\gset twenty_\nselect command\nfrom generate_series(1, 200) as g\ncross join lateral (values\n  (1, case when g % 20 = 1 then 'begin;' end),\n  (2, format('insert into pe_wal_twenty values (%s, %L);', g, repeat(md5(g::text), 4))),\n  (3, case when g % 20 = 0 then 'commit;' end)\n) as commands(sequence, command)\nwhere command is not null\norder by g, sequence\n\\gexec\nselect pg_wal_lsn_diff(pg_current_wal_insert_lsn(), :'twenty_start_lsn'::pg_lsn) as ten_transaction_wal_bytes,\n       count(*) as useful_rows\nfrom pe_wal_twenty;\ndrop table pe_wal_twenty;\nreset synchronous_commit;\nreset lock_timeout;\nreset statement_timeout;\n```\n\nExpect useful_rows=200 and a positive interval. On a quiet instance it should usually land between the one-transaction and 200-transaction core measurements, but cluster-wide WAL and page-image effects can disturb that ordering; treat a contrary sample as a reason to repeat in an isolated fixture, not as a false guarantee.",
    },
  ],
};
