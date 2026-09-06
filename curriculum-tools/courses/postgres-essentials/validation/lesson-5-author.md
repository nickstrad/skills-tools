# Lesson 5 author handoff

Authored `lost-update-and-atomic-write` from PLAN row 5 and the 4–6 design contract. The source
exports `ATOMIC_WRITE` and `ATOMIC_WRITE_VISUAL`, depends on `reusable-space-versus-file-size`, uses
two Read Committed sessions, and owns only `pe_atomic_write`.

## Evidence contract

The exact registered lesson still needs the parent acceptance run. Its checks should establish:

- both clients print that they read 100 and computed supplied replacements 110 and 120;
- both stale replacement writes succeed, with `a_replacement_written = 110`,
  `b_replacement_written = 120` and `after_stale_replacement = 120`;
- Session B is observed in `pg_stat_activity` waiting on Session A after the header
  `-- Session B (blocks until A commits; switch to A while this waits)` and before A commits;
- after A commits, B's arithmetic write returns `b_atomic_written = 130`, and
  `after_atomic_arithmetic = 130`;
- no unexpected ERROR, FATAL or timeout appears, both transactions end, and `pe_atomic_write` no
  longer exists.

The external wait observation matters: final value 130 establishes correct arithmetic, but by itself
does not prove the two UPDATE statements overlapped.

## Author checks and limitation

`deno fmt --check courses/postgres-essentials/curriculum/03-atomic-write.ts` passed, as did
`deno check courses/postgres-essentials/curriculum/03-atomic-write.ts` and `git diff --check`. These
are structural checks rather than PostgreSQL outcome evidence.

I began allocating `/tmp/pg-essentials-validation-l5-s4v7`, but sandboxed ownership changes were not
permitted and the escalation request was aborted. `initdb` never ran, no postmaster or client was
started, and the three empty directories were removed with `rmdir`. The parent asked me to stop
duplicate setup because its exact-catalog validator and lock-wait observer were ready. No author
runtime result, retained database image, running process, tool handle or pending approval remains.

## Parent acceptance completed

The parent condensed the syntax explanations to the first-three style, clarified configured RESET
defaults and row rechecking, and placed DROP last. The final built lesson ran independently on
PostgreSQL 16.15. Both stale inputs were 100; replacement writes returned 110/120 and the final
value was 120. The observer caught B's arithmetic UPDATE waiting on A's transactionid lock before A
committed. B then returned 130 and the final value was 130. There were no unexpected errors.
`lessons-5-outcomes.json` contains the labelled values and actual wait query;
`lessons-5-source.json` binds them to the source. The owned cluster was removed and both progress
files remained unchanged.
