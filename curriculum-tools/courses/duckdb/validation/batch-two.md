# DuckDB lessons 6–10 acceptance

Accepted 2026-09-16 on pinned DuckDB 1.5.5 (`d8cdaa33fd`). The approved revision-8 route
remains 32 lessons plus five optional projects; this batch adds only ordinals 6–10.
Follow [the batch workflow](../../../../docs/lesson-batch-workflow.md).

## SQL formatting revision — 2026-09-17

All lesson SQL, lab starters/fixtures and helper SQL were reformatted with sql-formatter
(see [Formatting SQL](../../../docs/AUTHORING.md#formatting-sql)). The change is editorial:
revisions, tasks, answers and expected evidence are unchanged. The drivers' wrong-choice edits
now match the formatted text and fail if an edit no longer applies. Both drivers were rerun in
full on real fixtures: lessons 1–5 (30 trials and both shared sequences) and 6–10 (30 trials,
10 reruns, boundary probes and both shared sequences) passed, and their results and manifests
were regenerated. Validation drivers must run without an inherited DUCK_LAB; `session.sh`
refuses to start a second lab in the same environment.

## Evidence and commands

From the repository root:

```bash
bin/tutor duckdb check
bin/tutor duckdb progress verify
cd curriculum-tools
go run ./courses/duckdb/validation/batchtwo
go run ./courses/duckdb/validation
go test ./internal/course ./internal/route ./internal/render ./internal/cli
```

The [new driver](batchtwo/main.go) reads actual Markdown with the shared parser. Its
[results](batch-two-results.txt) contain 30 independent trials (five lessons × two setup choices
× starter/answer/wrong), ten same-fixture answer reruns, two extra boundary probes, a worked
shared sequence covering 6–10 and the exact starter shared sequence for 8–10. Every outcome
is checked against identities, types, order, values or a specific error, not shell exit alone.
[The source manifest](batch-two-manifest.json) identifies the tested inputs. Paths in output
are historical scratch identifiers; their fixtures were removed.

The first driver was bounded to ordinals 1–5 so adding interactive lessons cannot silently
expand its scope. Its 30 independent trials and both shared sequences passed again after
the shared helper changes. [results.txt](results.txt) and [source-manifest.json](source-manifest.json)
record that regression run; the first batch's older reports remain historical acceptance.

## Observed lesson outcomes

| Lesson | Completed evidence | Consequential wrong choice |
| --- | --- | --- |
| 6 | Base IDs 102/103/104; paid total 4000; correction makes view 4200, saved table 4000; reopened rows match both representations | All days produces 6100/6300; paid-only base loses pending ID 103 despite matching report totals |
| 7 | Effective NULLS_LAST initially/reset/fresh; SET makes NULLS_FIRST; explicit report gamma/alpha/beta under both defaults, also on rerun | Implicit placement or explicit NULLS FIRST puts beta first |
| 8 | VARCHAR IDs retain zeros; DECIMAL(10,2); two accepted/19.75, three rejected with raw values retained | Successful-cast-only accepts negative -1.00, making three/18.75; explicit BIGINT IDs lose zeros |
| 9 | Input run lengths 2/0/1; event tuples r1/e1/40, r1/e2/60, r3/e1/25; parent IDs retained | First-element selection loses r1/e2; three run rows and three event rows show why count alone is inadequate |
| 10 | Four events/200ms; two NULL regions; unknown display labels; filenames map e1/e2 to v1 and e3/e4 to v2 | Starter reads only two/100ms; invented west labels pass counts but violate meaning |

Two initial assumptions were corrected by additional probes before acceptance. CSV inference on
this version already retains the fixture's leading-zero IDs as VARCHAR; it does not automatically
strip them. Without union_by_name, the v1-first glob returns four rows but omits region; a SELECT
of region raises Binder Error. The lesson and automated evidence now describe those actual
outcomes. The failing draft assertions were authoring errors, not DuckDB failures.

## Interactive and rendered checks

Lessons 6–7 are live terminal transcripts, with Bash launches and DuckDB SQL/dot commands
explicitly labelled. The automated driver changes only those prompt boundaries into input-fed
CLI processes and substitutes the owned file path; the learner-facing Run is unchanged. Each
`.quit` really exits the process before the next process reopens the named file. This adapter
lives only in the author driver/private catalog. The generic Bash harness cannot directly run
an unadapted mixed-prompt transcript; use this driver for 6–7.

Both lessons also passed manually through an actual PTY: lesson 6's script setup, `.help`,
`.tables`, DESCRIBE, corrected subset, view/table update, exit/reopen and source fingerprint;
lesson 7's manual setup, metadata/settings inspection, changed/default-independent order,
reset, nondefault setting left active, exit/reopen and fresh NULLS_LAST. Both fixtures and the
owned interactive shell were cleaned up. The terminal emulator did not answer background-color
queries, causing a five-second presentation timeout. Validation-only `-dark-mode` avoided it
on later launches; it did not change SQL, wrapper defaults, or persisted data.

All five complete lessons were rendered and reviewed using
`/tmp/duckdb-batch-two-review/tutor.sqlite`. Both setup choices, task boundaries, diagrams,
prompt labels, worked answers and cleanup survived rendering. `done`, `skip`, `undone` and
route status were exercised only on this temporary catalog. No live catalog refresh or progress
operation was performed. Refresh locally with `tutor duckdb init` when adopting the batch.

`progress verify` refreshed a byte copy of the actual learner database: all 42 progress records,
44 attempts, existing lesson identities and unrelated course content were preserved. The actual
database SHA256 at that check remained
`985549c8401fd6510465a1212cdec197afeb0d80ca589e0b0a1eb0ea80ce7885`.

During final cleanup on 2026-09-17, the live database had gained a separate manual completion
of DuckDB lesson 4 at 01:04:48 UTC. That learner activity was preserved. Repeating the copy-based
verification against the latest database preserved all 43 progress records and 45 attempts,
with existing identities unchanged. Its new hash was
`5d1caaea8d942670afde1f05c251d34b766db5327d0474ebc7c0e799c45833ef`.
The batch made no progress writes to the live database and did not restore the earlier snapshot.

## Resources and limits

New-lesson independent trial allocations were 16–1308 KiB, well within the <100 MiB batch
budget for files/catalog/logs. Fixtures were run serially and removed after each trial, including
failed probes and PTY runs. Reused installed tools stay available; no new extension/server was
needed for 6–10. The first-batch PostgreSQL regression used and retired only its marked private
clusters. Persistent learner PostgreSQL data and its intentionally stopped state were preserved.

Final 2026-09-17 resource/readiness verification: 139 GiB disk free, 6.7 GiB memory available,
no PostgreSQL process on the host, and the preserved `/labs/pglab/primary` directory in place.
The pinned CLI loaded both postgres and sqlite connectors and returned version 1.5.5/ready=1.
All fixture paths recorded in either driver's logs, both PTY paths and both failed-probe paths
were absent. Temporary review/catalog and editor files (232 KiB) were removed; the combined
course validation directory retains about 172 KiB of text/source/manifests, with no database
images. Both source manifests were rehashed: 32 files each, zero mismatches.

The required knowledge reflection updated `data/duckdb-course-tools.md` through `kb edit`, then
verified it with `kb show`. It records interactive lifecycle/validation, terminal color probing,
settings lifetime, and the observed CSV inference/schema behavior. No separate knowledge-repository
commit was made. Validation output has trailing presentation whitespace removed for repository
hygiene; semantic outcomes and input hashes are unchanged.

Lesson estimates (10–12 minutes) are author estimates with 3–5 minutes of learner work, not timed
learner sessions. The checks cover supplied tiny fixtures and the pinned runtime, not arbitrary
input schemas, power-loss durability, production resource tuning or cross-platform terminals.
