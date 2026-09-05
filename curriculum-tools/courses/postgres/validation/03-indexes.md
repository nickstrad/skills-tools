# Index subset validation

Validated on 2026-09-04 with PostgreSQL 16.15 in private `pivot_visibility` on the supplied port
5540 socket. The private course built successfully with 94 lessons; no root generated artifact,
learner progress, cluster setting, or restart was used.

## Keyset pagination core

`keyset-pagination-and-concurrent-writes` completed through the harness with two sessions. The
100,000-row composite `(created_at, id)` B-tree returned equal deep-page arrays:
`{50006,50007,50008,50009,50010}`. `OFFSET 50005` visited 50,010 index entries and 195 buffers,
while the keyset predicate had an index condition after the saved `(2026-01-01 01:23:20+00,50005)`
pair, visited five entries, and used four buffers. After B inserted id 100001 before A's first page,
fresh READ COMMITTED OFFSET 5 returned id 5 and the saved keyset predicate returned id 6. The core
cleanup removed id 100001.

The repeatable-read variation is bounded: rerun setup, acquire A's cursor inside RR, let B insert
the same earlier row, repeat both page reads before A commits, then remove it. It demonstrates fixed
snapshot behavior; it does not claim stable ordering across a separately acquired cursor.

## Contract coverage and integration notes

## Surviving-index core evidence

The complete private index sequence, ordinals 71–76, completed 6/6 without timeout. The key-width
comparison used equal 100,000-row indexes: integer primary key 276 pages versus 40-byte text key 831
pages, with metapage levels 1 and 2 respectively. These are observed shapes, not fixed fanout.

The concurrent build waited on an old snapshot with `Lock/virtualxid`, then became
`indisready = t, indisvalid = t`. The duplicate unique build failed, left its invalid artifact with
both flags false, and the lesson's owned cleanup left only the usable email index. The partial and
covering run showed pending index-only access with zero heap fetches; a missing payload projection
used a bitmap heap scan, while the tenant covering index reduced the same tenant result to an
index-only scan at the cost of 2,224 kB versus 728 kB for the narrow tenant index.

Bounded churn expanded the tested index from 2,260,992 to 4,513,792 bytes while its sampled range
work and table rows stayed unchanged; concurrent rebuild changed relfilenode and returned it to
2,260,992 bytes. The partial unique index rejected the concurrent second active owner after a
transactionid wait, while released history rows remained permitted. This is an active-owner row
invariant, not a timed lease or an external fencing guarantee.

Every supplied guide variation/hint is bounded and uses its setup/reset: the key-width temporary
index is dropped, failed concurrent unique build is dropped after retry, covering-update counters
are inspected after setup, bloat compares the same range query, historical inactive rows are added,
and the keyset RR insert is explicitly cleaned up. No benchmark timing claim is made from these
correctness checks.

## Rendered hint execution

Rendered hint2 commands were executed from the private guide. The temporary wide-payload index
reported level 2 and was dropped. The same `k between 1000 and 2000` rebuild comparison returned an
index-only scan with 1,001 rows, six buffers, and zero heap fetches. An additional released
`shard-1` history row inserted successfully beside the one active owner. The covering-update hint
initially named nonexistent `ix_jobs`; it was corrected to `ix_orders`, then updated 100 `note`
values successfully. Immediate `pg_stat_user_tables` counters were both zero, so the report records
statistics lag rather than claiming a HOT result without a forced stats refresh.

- `index-only-scan-needs-visibility-map` is retired. Its visibility cycle remains in the earlier
  vacuum lesson; its missing-column projection contrast belongs to the surviving
  `partial-and-covering-indexes` lesson.
- Existing index lessons retain their identities and receive revision 4 material updates in the
  private module. The new keyset lesson is revision 1 and follows conditional uniqueness.
- The only external references to the retired slug found in the root worktree are `PLAN.md` and
  `docs/books/postgresql-14-internals/reading-map.md`; the primary must update them during ordinal
  integration. No private curriculum prerequisite still refers to the retired slug.

## Primary acceptance, 2026-09-05

Primary reviewed and corrected every source field and wrote six specific guides. This acceptance
supersedes the draft claims above. Both B-tree indexes now use matched bulk-build history and unique
logical keys; text type/collation remains an explicit comparison dimension. The root is read from
metadata and leaf searches exclude internal downlinks and high keys. The first index lesson's
missing material revision was corrected to4.

Concurrent-build observation now polls the actual phase with a bound and a statement deadline,
scopes catalog cleanup to the owned table, repairs the duplicate and demonstrates successful retry.
The first primary run exposed a cached statistics snapshot inside the polling DO block: it failed to
notice a phase transition visible immediately after the block. Adding pg_stat_clear_snapshot() to
each iteration corrected the observation; the full sequence was then rerun.

The final six-core sequence completed with exactly two deliberate uniqueness errors and no other SQL
errors or timeouts: `/tmp/pg-index-primary-20260905.log`. The isolated corrected concurrent-build
run is `/tmp/pg-index-cic-final-20260905.log`.

- Equal100,000-row bulk builds measured276 integer-index pages versus831 text-index pages, root
  levels1/2. Physical page shape was inspected without claiming device reads per lookup.
- Concurrent build: observed waiting-for-old-snapshots with the blocker PID, ready=true/valid=false;
  after commit both true. Duplicate failure left an invalid artifact; cleanup/repair/retry finished
  with both indexes valid and5,000 rows/5,000 distinct emails.
- Covering: tenant sum49,957,000 unchanged; missing note projection required heap data. Matched
  2,000-row fillfactor70 tables updated100 spaced amount values in one transaction.
  Transaction-local counters were100updates/100HOT for key-only and100updates/0HOT for
  INCLUDE(amount); contents match.
- Churn/rebuild: compared post-churn range count/sum before and after replacing the index;
  unchanged_range=true. Two rounds of reuse are no longer described as universal steady state.
- Partial uniqueness: bounded competing-insert wait, intended duplicate error, released history and
  final one active owner=node-b. Nonnull resource and checked state define the invariant's domain;
  this is not presented as an expiring lease or external fencing.
- Keyset: same_deep_page=true for50006–50010. After the earlier insert, fresh OFFSET starts at5 and
  keyset at6. Duplicate index-only lesson retired into existing visibility and covering lessons.

All six exact hints were extracted from the final guide and run with their own setup by
`/tmp/pg-index-hints.ts`; raw evidence `/tmp/pg-index-hints-20260905.log`. Exactly two deliberate
uniqueness errors and no other errors/timeouts occurred. Wide-payload index was measured/dropped;
CIC failure cleaned/retried/dropped; note update produced100HOT on both matched tables; wider-range
rebuild kept its answer; inactive history coexisted with exactly one active row. The previously
unexecuted two-session RR pagination hint now reports rr_offset=6, rr_keyset=6, stable_page=true,
then fresh_offset=5 after commit and deletes the inserted fixture row.

Planner and index modules now follow concurrency, before WAL and replication; all backward
prerequisites pass build validation. Course remains94 lessons with seven reading stops. The current
identity map records four retirements and both added experiments. First seven built objects remain
identical to baseline; copied progress refresh preserves original IDs, attempts and progress and
selects lesson8. The real progress checksum remains unchanged. Source/guide formatting, lint and
whole PostgreSQL source/guide type checks pass; existing30 integration tests pass.

Capacity, bounded migration and observability remain unfinished parts of chunk3. Final whole-course
validation and later durability/protocol work are still required.
