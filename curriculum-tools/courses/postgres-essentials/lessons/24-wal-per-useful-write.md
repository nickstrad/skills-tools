# Measure WAL per useful operation

slug: wal-per-useful-write
category: wal-and-recovery
difficulty: intermediate
tags: wal, transactions, batching, write-amplification
prerequisites: commit-and-wal
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Execute 200 identical INSERT statements as 200 autocommit transactions and as one explicit transaction. Measure each WAL interval and verify equal final content, turning batching from a general recommendation into a bounded write-amplification observation.

## Syntax breakdown
### In plain terms
Every committed transaction has bookkeeping beyond its useful row changes. This comparison holds
the 200 INSERT statements, IDs and payloads constant while changing how many transaction boundaries
surround them. LSN subtraction measures all WAL generated in each interval, including commits.

### Mechanism map

```text
Equal useful rows, different transaction boundaries

200 INSERT statements                 200 INSERT statements
200 autocommit transactions           1 explicit transaction
          |                                      |
          +------------ measure WAL bytes --------+
                         compare rows + checksum

Batching shares transaction-level WAL overhead; the measured ratio belongs to this controlled run.
```

### Terminals and cleanup
Open one experiment terminal (Session A) and connect each psql session with:
```sh
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
```
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

## Caution
LSNs and WAL generation are cluster-wide. Run the two phases together on a quiet instance, do not insert a checkpoint between them, and interpret the exact byte counts only as evidence from this fixture. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_wal_single, pe_wal_batch; RESET synchronous_commit; RESET lock_timeout; RESET statement_timeout before rerunning setup.

## Setup
```sql
set lock_timeout = '3s';
set statement_timeout = '60s';
set synchronous_commit = on;
drop table if exists pe_wal_single, pe_wal_batch;
create table pe_wal_single (id integer primary key, payload text not null);
create table pe_wal_batch (like pe_wal_single including all);
```

## Run
```sql
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
reset statement_timeout;
```

## Expected result
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

## Systems lens
Batching amortizes fixed coordination and log metadata across more useful operations, a pattern shared by commit logs, network protocols and object storage requests. Larger batches also hold resources longer, enlarge retries and delay individual acknowledgements. Choose a batch boundary from measured write amplification together with latency, contention and failure-scope requirements.

## Optional variation
Optional intermediate-batch variation, independently runnable. This groups the same 200 individual INSERT statements into ten transactions of 20; predict whether its WAL interval falls between the two core phases:

```sql
set lock_timeout = '3s';
set statement_timeout = '60s';
set synchronous_commit = on;
drop table if exists pe_wal_twenty;
create table pe_wal_twenty (id integer primary key, payload text not null);
select pg_current_wal_insert_lsn() as start_lsn \gset twenty_
select command
from generate_series(1, 200) as g
cross join lateral (values
  (1, case when g % 20 = 1 then 'begin;' end),
  (2, format('insert into pe_wal_twenty values (%s, %L);', g, repeat(md5(g::text), 4))),
  (3, case when g % 20 = 0 then 'commit;' end)
) as commands(sequence, command)
where command is not null
order by g, sequence
\gexec
select pg_wal_lsn_diff(pg_current_wal_insert_lsn(), :'twenty_start_lsn'::pg_lsn) as ten_transaction_wal_bytes,
       count(*) as useful_rows
from pe_wal_twenty;
drop table pe_wal_twenty;
reset synchronous_commit;
reset lock_timeout;
reset statement_timeout;
```

Expect useful_rows=200 and a positive interval. On a quiet instance it should usually land between the one-transaction and 200-transaction core measurements, but cluster-wide WAL and page-image effects can disturb that ordering; treat a contrary sample as a reason to repeat in an isolated fixture, not as a false guarantee.
