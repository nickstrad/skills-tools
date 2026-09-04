# Foundation integration review

2026-09-04. PostgreSQL16.15, private port5540 database pivot_primary. The learner cluster was not
used. Chunk1 builds 93 lessons; lesson-map.md records the three retirements and seven reading stops.

## Evidence and corrections

Primary ran current lessons8–20 together with the actual setup/session order. Final command:

```sh
PGHOST=/tmp/postgres-pivot-20260904/socket PGPORT=5540 PGUSER=postgres \
PGDATABASE=pivot_primary PGLAB=/tmp/postgres-pivot-20260904 \
/root/.deno/bin/deno run -A tools/validate.ts postgres --from 8 --to 20 --timeout 90000
```

Final raw evidence: `/tmp/pg-foundation-final.log`, 13/13 completed, no SQL errors or timeouts.
Primary compared each lesson's result: HOT counter contrast and unchanged HOT count for indexed
updates; TOAST projection and replacement; buffer hits/dirty transitions; xid/snapshot/visibility;
retained versions at the pinned horizon; freezing; in-place reuse; exclusive rewrite; visibility-map
heap fetches0→2854→0; autovacuum backlog and advancing completion count with cleared backlog.

The first run stopped the one-minute watch at the harness's default30-second timeout. A longer run
then exposed an invalid `relname` reference in pg_stat_progress_vacuum, despite reporting 1/1
completed. The final query uses relid::regclass and filters database/relation. This final integrated
run supersedes preliminary agent completion-count claims.

Additional primary review corrected absolute claims about VACUUM never truncating files, a rewrite
being the automatic remedy for growing bloat, all storage engines requiring offline compaction,
initial autovacuum statistics necessarily being zero, and200 adjacent rows fitting on one page.
Observed fixture numbers remain distinct from guarantees. Hint2 now has a real newline after psql's
gset; a semicolon does not end that meta-command. The exact rendered TOAST hint executed
successfully: stored bytes100000,102 chunks, max chunk1996.

The hint-bit variation now puts a normal SELECT between raw page dumps. Primary observed
`t_infomask`2048→2304, adding the committed-creator bit256. Raw inspection alone does not perform
visibility checks. The commit-status lesson uses inherited PGLAB for its filesystem observation.

## Preservation and interface checks

- Original first seven built objects compare equal, including revisions.
- Real learner progress SHA256 remains
  `c7866ba1b78cb7b2aa6c1a2951149cd14c278130f92333c1e5b8dffd063f128f`.
- Refreshing a temporary copy preserves every progress row, attempt and slug-to-ID mapping; 93
  lessons are active, the first seven remain current/done, and pgcoach selects lesson8.
- Engine, validation and coaching tests:30 passed. Coaching covers withheld expected output,
  runnable material, full-view equality, explicit safety/environment guidance, shell quoting,
  topic/complete/error/fallback states and no progress mutation.
- Scoped format, lint, typecheck and diff checks passed.

Later chunks are not accepted by this report. Unguided lessons explicitly offer the full legacy
view.
