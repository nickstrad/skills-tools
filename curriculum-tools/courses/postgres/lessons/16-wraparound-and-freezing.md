# Freezing: how a 32-bit counter avoids a 2^31 cliff

slug: wraparound-and-freezing
category: mvcc
difficulty: advanced
tags: 
prerequisites: xmin-horizon-blocks-cleanup
safety: writes-data
run-in: tool
sessions: 1
min-version: 16
minutes: 18
revision: 2

## Overview
Transaction ids are 32 bits and visibility compares them modulo 2^32, so "older than me" only has a
meaning within a window of 2^31 transactions. A row whose creating xid falls out of that window
would suddenly look like it came from the future. Freezing is the escape hatch: mark a tuple as
unconditionally visible so its xid stops mattering. You will measure the age of the table, burn a
couple of thousand xids to move it, freeze, and watch the age snap back to zero.

## Syntax breakdown
### In plain terms

PostgreSQL transaction IDs are a finite 32-bit clock. If an old row's ID were compared after the
clock wrapped, it could look newer than a current transaction; freezing marks an old visible tuple as
safe forever so its original ID no longer matters. This experiment burns IDs, measures the growing
age, runs VACUUM FREEZE, and observes the age and tuple flags reset without rewriting the row.

### What you are learning

- **Xid wraparound:** Visibility comparisons are safe only within a half-range of the 32-bit counter.
- **Frozen horizon:** relfrozenxid/datfrozenxid record how far old tuple IDs have been made safe.
- **Freeze hint bits:** A pair of tuple flags represents “frozen” while t_xmin remains unchanged.

### Piece by piece

- **generate_series(1, 50)** (set-returning function)
  - What it is: It emits one integer per value in the inclusive range.
  - What it does here: It creates 50 predictable account rows with owner names built by **||**.
  - What it gives us: A small page whose tuples can all be inspected and frozen.
- **CREATE TABLE / TRUNCATE / INSERT ... SELECT** (lab setup)
  - What they are: CREATE defines the account and xid-burning tables, TRUNCATE resets them, and
    INSERT SELECT loads generated rows.
  - What they do here: They make repeated runs independent and ensure the account tuples are old
    enough to freeze.
  - What they give us: A known 50-tuple heap and an empty **mv_burn** target.
- **VACUUM** (maintenance command)
  - What it is: It marks dead space reusable and advances a relation's cleanup metadata.
  - What it does here: Setup establishes a clean frozen horizon before IDs are burned.
  - What it gives us: A starting relfrozenxid and no initially frozen tuples in the page dump.
- **age(relfrozenxid) and age(datfrozenxid)** (xid-age expressions)
  - What they are: They measure transactions since the relation or database's guaranteed-frozen xid.
  - What they do here: Queries against **pg_class** and **pg_database** report relation and database age.
  - What they give us: Small starting ages and an increase after the burn loop.
- **pg_class and pg_database** (system catalog tables)
  - What they are: They store relation definitions and database-wide metadata.
  - What they do here: **relfrozenxid** identifies the table's frozen boundary; **datfrozenxid** identifies
    the database boundary; **current_database()** restricts the latter to this lab database.
  - What they give us: The exact horizons that autovacuum's wraparound protection monitors.
- **current_setting(...)** (configuration inspection function)
  - What it is: It returns a setting's current text value.
  - What it does here: It reads **vacuum_freeze_min_age** and **autovacuum_freeze_max_age** before the burn.
  - What it gives us: The configured trigger values that put the tiny lab ages in context.
- **heap_page_items(get_raw_page(...))** (pageinspect functions)
  - What they are: They read and decode raw heap page 0, exposing tuple flags and xids.
  - What they do here: **count(*) FILTER (WHERE ...)** counts frozen tuples, while the final query prints
    the first three line pointers' **t_xmin** and **t_infomask**.
  - What they give us: Zero frozen tuples before, 50 after, unchanged t_xmin, and the frozen flag bits.
- **DO $$ ... $$** (anonymous PL/pgSQL block)
  - What it is: It executes procedural code without creating a permanent function.
  - What it does here: The **FOR i IN 1..2000** loop opens a nested block for each iteration; each INSERT
    consumes a transaction ID, and the exception handler keeps the loop going if one iteration fails.
  - What it gives us: An age increase of roughly 2000 xids.
- **EXCEPTION WHEN OTHERS THEN NULL** (PL/pgSQL error handler)
  - What it is: It catches any error in the nested insert block and does nothing for that iteration.
  - What it does here: It makes the xid-burning loop continue rather than aborting on one failure.
  - What it gives us: A best-effort burn; the measured age, not an assumed exact count, is authoritative.
- **VACUUM (FREEZE, VERBOSE)** (maintenance command with options)
  - What it is: FREEZE uses an effective minimum freeze age of zero for this run; VERBOSE prints work.
  - What it does here: It freezes every eligible visible tuple and reports the new relfrozenxid.
  - What it gives us: Age near zero, 50 frozen tuples, and “frozen” page counts in the INFO output.
- **(t_infomask & 768) = 768** (bit-mask predicate)
  - What it is: **&** keeps only selected bits; 768 is 0x0100 | 0x0200, the committed and invalid hint
    combination PostgreSQL uses to represent a frozen xmin.
  - What it does here: The FILTER counts tuples carrying both bits.
  - What it gives us: A numeric before/after test for freezing rather than relying only on log text.
- **ORDER BY lp LIMIT 3** (result-shaping clauses)
  - What they are: ORDER BY makes page slots stable; LIMIT restricts output to three examples.
  - What they do here: They keep the final tuple-header evidence short and comparable.
  - What they give us: Representative t_xmin and t_infomask values after freezing.
- **VACUUM with vacuum_freeze_min_age = 0** (optional variation)
  - What it is: A session-level setting of zero makes an ordinary vacuum consider tuples immediately.
  - What it does here: The variation compares plain VACUUM under that setting with explicit FREEZE.
  - What it gives us: A test of whether the setting produces the same amount of freezing.

## Caution
Never leave a transaction, replication slot, or prepared transaction open for weeks on a busy
cluster. Wraparound protection failing is one of the few PostgreSQL faults that stops writes
completely.

## Setup
```sql
create table if not exists mv_accounts (
  id int primary key,
  owner text not null,
  balance int not null
);
truncate mv_accounts;
insert into mv_accounts (id, owner, balance)
select g, 'owner' || g, 100 from generate_series(1, 50) g;
create table if not exists mv_burn (n int);
truncate mv_burn;
vacuum mv_accounts;
```

## Run
```sql
-- Session A
select relfrozenxid, age(relfrozenxid) as rel_age from pg_class where relname = 'mv_accounts';
select datfrozenxid, age(datfrozenxid) as db_age from pg_database where datname = current_database();
select current_setting('vacuum_freeze_min_age') as freeze_min_age,
       current_setting('autovacuum_freeze_max_age') as freeze_max_age;
select count(*) filter (where (t_infomask & 768) = 768) as frozen_tuples,
       count(*) as tuples_on_page
from heap_page_items(get_raw_page('mv_accounts', 0));

-- Session A
-- burn 2000 transaction ids without doing any useful work
do $$
begin
  for i in 1..2000 loop
    begin
      insert into mv_burn values (i);
    exception when others then null;
    end;
  end loop;
end $$;
select age(relfrozenxid) as rel_age_after_burning_2000 from pg_class where relname = 'mv_accounts';

-- Session A
vacuum (freeze, verbose) mv_accounts;
select relfrozenxid, age(relfrozenxid) as rel_age_after_freeze from pg_class where relname = 'mv_accounts';
select count(*) filter (where (t_infomask & 768) = 768) as frozen_tuples,
       count(*) as tuples_on_page
from heap_page_items(get_raw_page('mv_accounts', 0));
select lp, t_xmin, t_infomask from heap_page_items(get_raw_page('mv_accounts', 0)) order by lp limit 3;
```

## Expected result
Be honest about the scale here: this lab was created minutes ago, so the numbers are tiny. rel_age
starts at something like 2 and db_age at a few hundred, against a freeze_max_age of 200000000 and a
hard wall at 2^31. The mechanism is identical at any size; only the clock is short.
Before freezing, frozen_tuples = 0 out of tuples_on_page = 50.
The DO block moves the counter: rel_age_after_burning_2000 comes back around 2003 -- each of the
2000 subtransactions that wrote a row consumed an xid.
VACUUM (FREEZE) prints
  INFO:  aggressively vacuuming "lab.public.mv_accounts"
  frozen: 1 pages from table (100.00% of total) had 50 tuples frozen
  new relfrozenxid: 3018, which is 2002 XIDs ahead of previous value
and afterwards rel_age_after_freeze = 0 and frozen_tuples = 50 of 50.
Look at the last dump: t_xmin is unchanged (still the INSERT's xid, e.g. 1015) while t_infomask is
2818 = 0x0B02, which has both 0x0100 and 0x0200 set. The row was not rewritten; a two-bit flag now
says "visible to everyone, do not ask the counter".

## Systems lens
This is epoch-based reclamation with a fixed-width clock. Comparisons are modular, so correctness
depends on all live references staying inside half the space, and the system must continuously
retire old references (freeze) to keep that invariant -- exactly like sequence numbers in TCP, epoch
numbers in Raft, or hazard-pointer/epoch GC in lock-free data structures. The failure mode is what
makes it famous: if freezing cannot keep up, PostgreSQL first screams in the log, then refuses new
transactions to avoid ambiguity, and the only cure is a single-user vacuum. Anything that blocks
vacuum -- lesson15's horizon holders, an abandoned replication slot, a prepared transaction nobody
committed -- is therefore also a wraparound risk, and that is why age(datfrozenxid) belongs on your
dashboard next to disk space.

## Optional variation
Query "select datname, age(datfrozenxid) from pg_database order by 2 desc" and work out how many
transactions of headroom the lab has before autovacuum_freeze_max_age forces an aggressive vacuum.
Then set vacuum_freeze_min_age = 0 for a session, run a plain VACUUM, and check whether it freezes
as much as VACUUM (FREEZE) did.
