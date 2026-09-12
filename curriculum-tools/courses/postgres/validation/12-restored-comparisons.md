# Restored retention and rebuild comparisons

Primary acceptance, 2026-09-12. Lesson47 advances revision1→2 because its complete optional
retention program is now available in the lesson. Lesson49 remains revision4; its prose directly
names the existing range-comparison block and four bound substitutions. Both Setup/Run blocks,
stable identities, session counts and safety metadata remain unchanged.

Lesson47's new Optional variation fence matches RETENTION_VARIATION in
`9fc73b2:archive/deno-engine/curriculum-tools/courses/postgres/curriculum/migration-workload.ts`
exactly, allowing only final-newline trimming. It starts from Setup alone, never from the finished
migration schema. Lesson49 repeats its current Run section from SET enable_seqscan through RESET,
changing all four range predicates from1000–2000 to1000–20000; it introduces no new control flow.

## Real execution and outcomes

The Go driver creates one owned PostgreSQL16 cluster with a private socket/port6543 and TCP disabled.
For each trial it writes an isolated one-lesson course containing the exact Setup and selected SQL,
then calls the actual CLI `validate --isolated --timeout 30000`. The temporary ordinal1 and omitted
sequencing prerequisites are fixture metadata only; authored course identities are unchanged.
Connection configuration points exclusively at the private server and the driver checks its actual
data_directory. Conservative peak allowance was300MB, with14GB free before and after the work.

Five executions passed:

- 47 core: the expected55P03 DDL timeout,22P02 malformed write and23514 premature validation occurred.
  Final independent SQL verified1001 rows, priority sum2002 and every typed/text priority equal.
- 47 retention after the core's cleanup/reset: seven batches removed25 each, one removed24, then
  three empty batches still left eligible id1. After B committed, final_removed=1 and the result
  was800 rows, first_id201 and retained_expected_range=true.
- 47 repeated retention: fresh Setup produced the same result. In both variation trials the Go
  auditor compared every actual ID201–1000 and its original priority_text (`id % 5`). No other
  client remained after the harness finished; B committed and A reset its statement timeout.
- 49 core: the independent query checked all100,000 IDs' exact two-round key transformation and
  unchanged40-character payload. The source's range-count/sum comparison passed.
- 49 wider range on that current data: unchanged_range=true. A full ordered-data fingerprint remained
  identical, the index acquired a new relfilenode and indisvalid stayed true. Measured size/density/
  buffer results establish the local comparison, not a promise that another rebuild is useful.

The server log contains only the three deliberate47 core errors above. No unexpected error,
panic or forced client termination occurred. The driver stopped the server and removed the full
owned root `/tmp/pg-legacy-variations-3316332156`; every harness temporary directory is also removed.
No raw PostgreSQL, backup or WAL image is retained.

## Source, rendering and history checks

The comparison verifier permits only47's exact new archived fence and revision increment, and
49's reviewed prose. Both pass complete CLI plain/ANSI/JSON checks from a disposable catalog and the
92-lesson source check. A synthetic baseline-completion catalog verifies that repeated refresh
preserves all history and makes47 stale at revision2;88–91 remain stale at5 and92 remains done at4.
Separate live-baseline `progress verify` preserves251 lesson identities,36 progress rows and37
attempts on a copy. The live catalog has not been refreshed.

Concise logs/scripts remain in `curriculum-tools/.cache/legacy-migration/`: `pg47-core.log`,
`pg47-retention-{after-core,repeat}.log`, `pg49-{core,wider-range}.log`, `pg47-49-server.log`,
`pg47-49-validation.log`, `pg47-92-revisions.log`, `postgres-47-49-parity.log` and the exact
`postgres-47-49.json` manifest. `verify-retention-variation.go` owns runtime/source correspondence;
`verify-restored-variation.go` owns the allowed-difference/render audit. Retain these small artifacts
only until final migration acceptance; total scratch remains20MB including earlier baselines.
Learner SHA256 remains `2dc0facf7d98431d09ecaba690cf44a717b5bef6f8af9c5b2ff18267653538a3`.
