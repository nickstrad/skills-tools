# Storage rewrite validation

Validated on 2026-09-04 against PostgreSQL 16.15 using the private cluster socket
`/tmp/postgres-pivot-20260904/socket`, port 5540, and database `pivot_storage`. The built private
copy contained 95 lessons. Harness logs are private: `/tmp/pg-pivot-storage-hot.log`,
`/tmp/pg-pivot-storage-toast.log`, and `/tmp/pg-pivot-storage-cache.log`.

## Scope and preservation

- `free-space-map-and-reuse` is absent from the built lesson list. Its study checkpoint's two core
  resources were transferred unchanged to `buffer-cache-and-io`; its rationale now describes the
  completed physical-storage experiments without ordinal references.
- The retired FSM object was removed from the storage source; its prior implementation remains in
  git history and the vacuum module owns the replacement experiment.
- Comparing built JSON objects `[0:7]` from the private build with the root's current
  `courses/postgres/lessons.json` returned equality. The original first seven lesson objects,
  including the first three objects in this module, were preserved.
- The guides file has exactly the three surviving storage slugs.

## Independent lesson runs

### HOT updates and fillfactor

`deno run -A tools/validate.ts postgres hot-updates-and-fillfactor` completed without errors.

- The one-transaction tables began at 4 pages (fillfactor 100) and 5 pages (70). After 2,000 tag
  updates each, `st_hot_tx_100` reported `n_tup_hot_upd=0`, 64 pages; `st_hot_tx_70` reported 619,
  65 pages. These are run evidence, not lesson promises.
- The fresh, separately committed pair reported 2,000 total updates each: 931 HOT / 38 pages at 100
  and 1,906 HOT / 9 pages at 70. This contrasts with the first case and confirms that fresh tables
  and statement transaction boundaries materially change the physical history.
- The indexed-id phase changed `st_hot_commit_70` from total/HOT `2000/1906` to `2100/1906`, proving
  total updates advanced while HOT did not. The sampled first page had redirect (`lp_flags=2`), dead
  (`3`), and normal (`1`) entries, with normal entries showing `t_ctid` targets.
- The corrected variation reset a fresh, index-matched pair and ran ten separately committed,
  same-shape tag-update rounds (1,000 updates per table). The updater then issued
  `pg_stat_force_next_flush()` as a standalone statement and read a cleared statistics snapshot. It
  reported fillfactor 100: 1,000 total / 247 HOT / 27 pages; fillfactor 80: 1,000 total / 848 HOT /
  11 pages. These are evidence from this row layout and history, rather than fixed learner
  expectations.

### TOAST and large values

`deno run -A tools/validate.ts postgres toast-and-large-values` completed without errors.

- The compressible and varied 100,000-character values had `pg_column_size` 1,156 and 100,000.
  `st_toast` was one heap page; the external value had 51 chunks numbered 0 through 50, maximum
  chunk length 1,996.
- Narrow `select label` used `Buffers: shared hit=2`; `select length(body)` used shared hit=16. This
  is the required controlled projection contrast.
- Before and after the label-only update, the TOAST state was one value, 51 chunks, and 106,496
  allocated bytes. Replacing body kept 51 live chunks but allocated 212,992 bytes; the heap page
  then showed the old and new row-version pointers. This establishes preservation versus replacement
  without treating file allocation alone as proof.
- The guide/challenge `SET STORAGE EXTERNAL` variation ran successfully. Updating row 1 produced a
  100,000-byte datum and 102 total chunks (the original external datum plus the added value); its
  runnable hint resolves `toast_name` with `\gset` before inspecting chunks.

### Buffer cache and I/O

`deno run -A tools/validate.ts postgres buffer-cache-and-io` completed without errors.

- `st_cold` was 3,264 pages against `shared_buffers=128MB`. Its first scan recorded shared
  `hit=2048 read=1216 dirtied=1216`; the repeat scan recorded `hit=3264`. The relation's block count
  matches hit plus read in this run.
- `st_events` had six resident, clean buffers after the first checkpoint. After the update all six
  listed `isdirty=t`; after the second checkpoint it still had six resident buffers and dirty zero.
- The controlled `st_working_set` variation created 10,000 rows / 384 cached buffers. Its initial
  scan was already `hit=384`, because CREATE TABLE AS had produced those pages in shared buffers;
  `pg_prewarm(..., 'buffer')` returned 384 and the repeat scan remained `hit=384`. This is why the
  challenge asks for an evidence-based limitation instead of treating one cache sample as a sizing
  verdict.

## Checks

`deno fmt`,
`deno check courses/postgres/curriculum/02-storage.ts
courses/postgres/guides/02-storage.ts`, and
`deno task build postgres` all succeeded in the private copy. The logs contain no unexpected
`ERROR`, timeout, or negative evidence.
