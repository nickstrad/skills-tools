# Legacy courses in the simple tutor CLI

Updated: 2026-09-12. Status: paused at the user's requested context-clear checkpoint.
This file is the primary-owned plan and continuing handoff.

## Resume here — current authoritative checkpoint

The overall objective remains **implement this entire plan**; it is not complete. The user asked
to stop at a resumable checkpoint, not to narrow scope or cancel implementation.

- P1 public names and P2/P3 aliases/history/skip behavior are committed in `d0c5511` and `8ee20a9`.
  Primary-focused suites pass. No live learner catalog refresh has occurred.
- Primary accepted15 lesson edits: Linux01–12, PostgreSQL09, SQLite52/54. Exact allowed differences
  and pending rows are in `docs/legacy-course-migration/lesson-audit.tsv` (250 rows total).
  `docs/legacy-course-migration/validation.md` records command parity, rendering and real SQLite
  results. SQLite52/54 main SQL/database behavior is preserved; their revisions remain3.
- P7 active guidance changes are reviewed, including primary corrections to completion wording,
  the `undone N` example and the SQLite54 outline. No installer command has been run yet.
- Sol's P5 first-six PostgreSQL edits (38/46/54/55/56/57) are **pending primary acceptance**.
  Preserve these worktree changes; do not treat their ledger rows as accepted. The full92-row
  preliminary audit is `curriculum-tools/.cache/legacy-migration/postgres-audit.tsv`.
- Critical new P5 finding: PostgreSQL89 and90 also omit their controller inspection/recovery/
  cleanup calls. Include them with primary-owned88/91 in the core-continuation repair and real-tool
  validation schedule. PG92's core is complete but its existing optional branch needs local wording.
- Next: finish primary acceptance of the six P5 prose edits; then continue Linux13–71 in bounded
  Terra chunks, PostgreSQL prose/continuations, SQLite01–51/53 and Essentials/gRPC audits. Primary
  still owns Linux72, PG88/89/90/91/92 and final serial hazardous validation. No next chunk has been
  dispatched after this stop request. Use the plan's current model/ownership assignments if resumed.
- Final work still required: every authored lesson's recorded review, targeted continuation/capstone
  runtime evidence, final tests/vet/full race/build, copied-history audit, installation check,
  quiescent verified rollback snapshot, sequential live catalog refresh and logical history/backup/
  roadmap preservation checks, final learner readiness and cleanup. Do not run learner done/skip.
- Retained scratch: `curriculum-tools/.cache/legacy-migration/` (~14MB), including raw/refreshed
  baseline SQLite backups, all250 parsed source lessons/plain/ANSI baselines, small comparison Go
  helpers, reviewed outputs and logs. These are required until final migration acceptance; remove
  redundant copies then. Their original source is commit `2776655274115a95ebabf7dd1b62fd9e9d0ff818`.
  Do not regenerate `lesson-audit.tsv` over its manual acceptance notes.
- Runtime checkpoint: SQLite validation root and review databases removed; no PostgreSQL author
  lab allocated. Learner hash remains `2dc0facf7d98431d09ecaba690cf44a717b5bef6f8af9c5b2ff18267653538a3`;
  legacy backup hashes match the retained manifest. Learner query returns
  `lab|/labs/pglab/primary|f|1`. About14GB disk and6.8GiB memory available.

Sections below preserve the full requirements and dated implementation checkpoints; this resume
summary supersedes their earlier “pending/start P0” scheduling statements.

## 1. Outcome and authority

The user wants all existing courses accessible through `tutor <course> <n> lesson|done`,
with the old PostgreSQL, SQLite and Linux courses clearly marked as legacy and individually
skippable. Their clarification is decisive: remove the old roughly seven-stage coaching UX.
A lesson contains the teaching write-up, useful terminal art/examples, then the ordered experiment,
expected evidence, interpretation and cleanup. No required prediction, answer, written submission,
hint request, reveal, review, homework or separate coaching checkpoint.

This is a migration of access and presentation for existing material. It does not authorize new
future-course lessons, shortened/reordered replacement curricula, copying completions to another
course, or a new learner-work framework. Existing useful experiments remain the basis. Technical
operations called `inspect`, checkpoints, or recovery phases remain when the experiment needs them;
they must be supplied directly in the lesson rather than unlocked by the tutoring interface.

The user has now requested implementation of this plan, including its bounded rollout.
The user requested a fresh file; none existed at the initial check. Keep this file up to date through
implementation and context clearing. Retain it as the requested deliverable; do not delete it under
a generic temporary-handoff convention. Primary alone edits it. The current implementation request
authorizes execution of this concrete plan; copy-based acceptance precedes the live refresh.

## 2. Findings and measured baseline

The Go migration already put all 250 authored lessons in the shared CLI. There is no second engine
to port and no generated catalog to rebuild. Course Markdown is parsed directly, but learner
`lesson` output reads the catalog stored in the shared progress database.

| Public command after migration | Stable directory / stored course ID | Authored / route | Current stored active lessons |
| --- | --- | ---: | ---: |
| `postgres-legacy` | `postgres` | 92 / 92 | 95 |
| `sqlite-legacy` | `sqlite` | 54 / 54 | 48 |
| `linux-legacy` | `linux` | 72 / 72 | 72 |
| `postgres-essentials` | `postgres-essentials` | 26 / 40 | 26 |
| `grpc` | `grpc` | 6 / 6 | 6 |
| `sqlite-essentials` | future plan only | 0 / 32 | none |
| `linux-v2` | future plan only | 0 / 44 | none |

The three legacy courses contain 218 authored lessons. Audit every one, but do not rewrite an
already suitable lesson just to produce a uniform diff. Audit the other 32 authored lessons for the
same obsolete interaction instructions; leave planned entries planned.

Measured using the current CLI on 2026-09-12:

- All five implemented `<course> check` commands passed.
- Current status: PostgreSQL reference 7 current done, 1 stale; Essentials 22 done; gRPC 6 done;
  SQLite and Linux 0 done. Every course currently reports 0 skipped.
- `postgres`, `sqlite`, and `linux` each passed `progress verify`. Each command refreshed only its
  disposable copy and reported identity, progress and attempt preservation across 251 stored lesson
  rows, 36 progress rows and 37 attempts. Source bytes were unchanged. This is baseline evidence for
  the existing refresh implementation, not acceptance of changes that have not been written.
- Shared database SHA256 before and after research:
  `2dc0facf7d98431d09ecaba690cf44a717b5bef6f8af9c5b2ff18267653538a3`.
- Learner readiness query returned `lab|/labs/pglab/primary|f|1` through `/tmp`, port 5440.
- About 15 GB disk and 6.9 GiB memory available; inodes 8% used. No lab was allocated. Verification
  commands removed their temporary database copies. Sandbox process visibility is restricted, so
  empty sandbox `pgrep` output is not proof the host has no writers or servers.
- Initial working tree was clean. Research changed only this file; normal cached launcher build
  activity is not a new lab. No source, learner history, roadmap or backup was changed.

### Content defects found

| Area | Verified scope / examples | Required treatment |
| --- | --- | --- |
| Linux | All 72 lessons have staged optional material: Inspect, Hint, Vary, Apply; 71 also have Predict. Lesson 72 adds incident/hint/worked-intervention/submission scaffolding. | Flatten useful experiment comparisons into direct instructions and evidence; remove prompt scaffolding and required incident records. |
| PostgreSQL | 35 lessons mention `pgcoach` or `hint2`: 09, 54–62, 66, 69–92. Adding `coaching hint` finds 38 lessons, including 38, 46 and 63. | Audit all 92, not just the 17 `pgcoach` files mentioned in older documentation. Remove obsolete navigation; make needed information local. |
| PostgreSQL 09 | TOAST explanation and SQL comments refer to `start`, `inspect`, and `pgcoach 9 inspect`. | Primary exemplar: one readable write-up, a storage diagram, existing SQL experiment and local interpretation. |
| PostgreSQL 88 | Run creates/prepares the incident controller; Expected result sends the learner to the coaching inspect stage for recovery. | Supply inspection and alternative recovery commands in this lesson, with evidence for selecting exactly one remedy and owned cleanup. |
| PostgreSQL 91 | Run surveys the fixture; prose promises symptom-only reveal and worked actions on request. | Include the actual inspection/application/cleanup sequence and expected transaction outcomes directly. |
| SQLite 52 | A `.print PAUSE:` line demands a written diagnosis before recovery. | Replace coaching output with a neutral observation boundary; preserve SQL/session ordering and the recovery experiment. |
| SQLite 54 | Required pre-written budgets, generated TODO architecture record, `complete_your_decision` output and submission-based completion prose. | Remove the artifact-completion requirement. Explain the architecture tradeoffs and measured evidence directly; keep contention and restore experiments. |
| Essentials | 13 lessons contain pre-run/reveal prediction prompts: 04, 06, 07, 09, 10, 12–15, 18, 19, 25, 26. Lessons 10, 11, 25, 26 also say “coaching terminal.” | Small wording-only cleanup: direct observations instead of forced predictions; retain genuinely necessary separation between experiment terminals. |
| gRPC | Six lessons already use direct walkthroughs. Local experiment tools were pruned. | Confirm rendered flow, preserve content; no reinstall merely for a naming/presentation audit. |

Counts are scoped search findings, not proof of complete coverage. The implementation inventory
must classify every authored lesson and use broader stage-language searches plus rendered review.
A blanket search for `inspect`, `checkpoint`, `hint`, or `predict` would also match legitimate
technical concepts; do not globally delete those words.

## 3. Naming and identity decision — primary-owned

Use `-legacy`, not `-v1`: the reference catalogs do not share a uniform version lineage.
`tutor courses` advertises the five implemented public names above plus the two planned routes.
Keep `postgres`, `sqlite`, and `linux` as compatibility spellings for the same legacy course.

Add an optional metadata `commandName` field with a shared helper defaulting to `id`. Configure
only the three reference courses with their suffixed public name and a visible “(Legacy)” title.
Derive the old stored ID as a compatibility alias when the command name differs; no general alias
configuration language is needed for this scope. The alias is not a second catalog entry.

Keep `course.json.id`, physical course paths, database `lessons.course_id`, legacy backup paths,
lesson slugs, ordinals and revision values stable for navigation-only edits. There is no database
course-ID migration. All progress still belongs to `(original course_id, slug)` and existing global
lesson IDs. New course implementations cannot silently reuse a reserved ID or alias.

Implementation boundaries:

- `internal/course/course.go`: parse/validate `commandName`, supply the public-name fallback.
  Metadata parsing currently rejects unknown fields. Keep directory-name == stored-ID validation.
- `internal/route/route.go` and `types.go`: carry public command and internal course identity
  separately. Source/plan lookup and progress joins use internal identity. Discovery returns one
  public entry per course, sorted by public name. Planned route IDs remain unchanged.
- `internal/cli/course.go`: replace the overloaded `cc.id()` with clearly distinct helpers for
  public command and stored course ID. Public help, errors, JSON course labels and completion
  suggestions use public names; every file/progress operation uses the stored ID.
- Audit all call sites, including `internal/cli/validate.go`, `progress_verify.go`, and
  `execute.go`'s degraded-discovery/error path. Aliases must work for maintenance as well as lessons.
- `internal/render/lesson.go`: its footer currently uses `c.ID`; change to the public helper.
  Route/status/course-list JSON should consistently advertise the invocable public name; keep
  internal storage identity private rather than replacing stored keys to match presentation.
- Register compatibility aliases on the same Cobra course command. Reject public-name/alias
  collisions with other stored IDs, public names, planned IDs and top-level CLI commands before
  registering commands or opening a writable database. Do not silently pick one collision winner.
- Current roadmap data links only `postgres-essentials` and future plan paths, so no roadmap import,
  relinking or database migration is needed. Preserve counters and support public-name resolution
  wherever a course reference is accepted; do not attach old completions to future routes.
- Preserve current REPL configuration, course-local scripts and their physical paths. A directory
  rename would enlarge the task and require a separate transactional history migration; rejected
  here because public naming supplies the requested behavior without that risk.

## 4. Single-lesson content contract

One invocation prints everything needed for the existing experiment:

1. A focused explanation of the mechanism, terms and purpose, before commands.
2. A terminal-readable diagram/example where it clarifies state, layout or ordering.
3. Exact environment/setup and numbered experiment instructions, including session labels.
4. Expected observations and their interpretation, including limits and intentional errors.
5. Owned cleanup and the ordinary explicit `done` / `skip` choices.

These are parts of one document, not stages to complete or commands to unlock. Existing Markdown
Overview/Syntax/Setup/Run/Expected result/Systems lens fields can already express this. The generic
renderer prints them together and supports `--plain` and `--ansi`; do not build course-specific
renderers, restore the coaching engine, or require a new lesson/database schema just for headings.
Use subsection text for cleanup where appropriate within the supported grammar.

For example, PostgreSQL 09 can introduce its already supplied experiment with a fenced text map:

```text
100,000-character body
          |
   compression / external storage
          |
   +------+-------------------+
   |                          |
heap tuple                 TOAST table
[id | label | pointer] --> [chunk 0][chunk 1] ...
   |                          |
read label              read external body
```

Connect the map to logical length, tuple/chunk sizes and buffer observations. Do not claim all
large values follow the external-storage branch. Store plain text artwork, not raw escape codes;
ANSI styling is optional and the diagram must remain intelligible without color. Native text
figures need no image-generation tool or terminal-graphics dependency.

Flattening rules:

- Move useful explanation, observation guidance and answers into the write-up/expected evidence.
  Replace “predict before running” with what to observe and why; do not merely relabel a mandatory
  prompt as a new learner-work exercise.
- Keep valuable existing runnable comparisons as short direct optional experiments when they fit.
  Remove coaching-only questions, rubric/submit/ADR requirements and invitations to invoke missing
  hints. Optional material must never be required to advance.
- Do not recreate every missing optional `hint2` program. If an old prompt has no supplied runnable
  experiment and serves only the retired coaching flow, retire that prompt and record it in the
  content inventory. Preserve core explanations and behavior. Recover omitted material only when
  it is necessary to execute/interpret the existing core experiment or preserve a useful already
  supplied comparison; make the result self-contained.
- Git recovery sources, only if needed: `0106961^` for retired coach sources at original paths;
  `9fc73b2:archive/deno-engine/<original path>` for archived TypeScript/catalog material.
  Read exact files with `git show`; do not restore the archived engine or historical labs.
- Preserve executable commands, ordering, session coordination, fixtures, assertions, expected
  outcomes, safety levels and stable identities by default. Do not port existing native Python
  experiments or broaden the course's scope during this work. New tooling is Go.
- Allow narrowly reviewed changes to non-executing navigation comments (PG09). No generic comment
  stripping: shell directives, heredoc text and embedded languages can be executable or meaningful.
- SQLite52's printed pause, SQLite54's generated assignment artifact, and newly supplied PG88/91
  continuation commands are explicit exceptions to byte parity because the user requested removal
  of this UX. Primary must specify exact before/after behavior, inspect real-tool evidence, and
  decide revisions: unchanged for editorial work; increment when the available experiment changes
  materially. Never silently mark a prior completion current at a new revision.
- Some legacy lessons are long, including embedded controllers. This migration removes interaction
  overhead; it does not promise every old experiment becomes a ten-minute lesson or extract all
  controllers into new tooling. Keep accurate duration metadata unless actually revalidated.

## 5. Completion and skipping

Retain the existing explicit `done`, `skip`, `undone`, and note operations. No lesson display,
validation, discovery or planned route should initialize/refresh progress or mark anything done.
Prerequisites describe setup order; they do not restrict access by lesson number.

Add number-first `tutor <course> N skip`, keeping existing `skip N`. Extend `NormalizeArgs`, error
text and tests without changing option-value handling or accepting invalid number/verb forms.
Add a `Skipped` route state and `[skipped]` marker in plain, ANSI and JSON views. Skipping does not
increase done counts, and next-lesson selection continues to exclude skipped lessons. Explicit
`N lesson` still opens a skipped or completed lesson; `undone N` makes it eligible again.

## 6. Work packages, models and file ownership

Research used Sol for identity/progress, Terra for lesson inventory, and Luna for docs/integration.
Primary inspected the risky code paths and lesson examples directly and owns these conclusions.
The conditional finding that a physical ID rename needs migration is correct; the selected public
command design deliberately avoids a physical rename. Early claims that no content work or real
experiment validation would be needed were superseded by the user's clarification and PG88/91.

Use at most three workers alongside the primary. Do not delegate a vague whole-course migration.
At dispatch, record exact file paths, baseline commit and acceptance conditions here. Shared files
belong to the primary unless a bounded package below explicitly transfers ownership. No two active
agents edit one file. Agents return the changed-file list, behavior decisions, exact checks/results,
resource disposition and unresolved issues; the primary reads every diff and accepts the work.

| Package | Owner / model | Owned files and bounded task | Dependencies / primary acceptance |
| --- | --- | --- | --- |
| P0 Baseline and exemplars | Primary | This file; temporary content/history inventory; PostgreSQL09, SQLite52/54, Linux72, PostgreSQL88/91/92. Define exemplar flattening and exact semantic exceptions. | Capture raw versus source-refreshed baselines before any edits. Review every complex continuation/cleanup. |
| P1 Public naming | Primary | Three reference `course.json` files; `internal/course`, `internal/route` identity/discovery, `internal/cli` identity call sites, lesson public-name footer and focused core tests. | Central identity design, collision policy and copy-history preservation are high-leverage work. Commit interface before downstream test integration. |
| P2 Independent regression | Sol (`gpt-5.6-sol`, high) | A new `internal/cli/legacy_flow_test.go` plus explicitly assigned fixture files. Test public/old names against the same temporary shared history; inspect P1 diff independently. No production-code edits without reassignment. | Starts after P1 interfaces stabilize. Primary independently runs tests and checks they prove persistence invariants, not just string replacement. |
| P3 Skip visibility | Terra (`gpt-5.6-terra`, high) | After P1 releases them: `internal/cli/args.go` and its tests; skipped-state additions in route types/loading/rendering and focused tests. No identity redesign. | Sequential with P1 shared-file work. Primary verifies next/skip/undone, counts, plain/ANSI/JSON and both argument orders. |
| P4 Linux flattening | Terra (`gpt-5.6-terra`, high) | `courses/linux/lessons/01-*` through `71-*`, in reviewable 6–12-lesson chunks; primary retains 72. Preserve runnable comparisons, eliminate recurring five-part coaching scaffold, add only useful mechanism maps. | Can start instead of P3 while P1 runs; never both concurrently on the same worker. Primary approves first 3 examples before continuing. Audit all executable differences. |
| P5 PostgreSQL ordinary prose | Sol (`gpt-5.6-sol`, high) | Inventory all 92; edit needed prose outside primary-owned 09/88/91/92, in 4–8-lesson chunks. Known affected groups 38/46/54–63/66/69–87/89–90. Recover core omissions only after primary classification. | Can follow P2. Sol fits reasoning-heavy technical prose; primary accepts every interpretation and any private-lab change. Primary owns all hazardous experiment validation scheduling. |
| P6 SQLite / current-course wording | Terra (`gpt-5.6-terra`, high) | Audit SQLite01–51 and53; primary owns52/54. Then the specifically listed Essentials prompt/terminal wording and six gRPC views. Exact file set recorded before dispatch. | After first exemplar approval; no controller/SQL changes for wording-only files. Retain real session requirements. |
| P7 Docs and skills | Luna (`gpt-5.6-luna`, medium) | Exact active docs/skill list below; update command examples, remove obsolete stage/compatibility claims, describe retained internal paths. No lesson semantics, code, learner state, goldens or live installation. | Starts after naming/content contract freezes. Primary reviews links and policy language; no blind global replacement. |
| P8 Final integration / rollout | Primary | All outstanding shared changes, goldens, full checks, copied-history audit, targeted real-tool validation, installation and eventual live refresh, this file. | Accept every package; apply live changes only as the final implementation rollout after reviewable evidence. |

Suggested scheduling: primary P0/P1 while Terra P4 and Luna P7 work; Sol can independently review
P0/P1 evidence, then write P2 once interfaces stabilize. After P1, Terra does P3 in an exclusive
shared-file window. Sol proceeds to P5; Terra proceeds to P6. Primary handles difficult lessons,
acceptance and serial private PostgreSQL trials throughout. Reassign only after recording ownership.

Luna's bounded doc list: root `README.md`, `docs/README.md`, `AGENTS.md`'s active naming references,
`curriculum-tools/skills/tutor/SKILL.md`, relevant course README/current PLAN command examples,
`curriculum-tools/docs/AUTHORING.md` and `VALIDATION.md`, and current guidance in
`docs/knowledge/{concise-course-cli,progressive-course-design,learner-work,postgres-essentials,
lesson-identity-refresh,command-inventory-extraction,sqlite-lesson-gotchas}.md` where applicable.
Update the knowledge index with any changed durable guidance. Remove unsupported claims that
`start`, `review`, or `full` are currently implemented compatibility commands; do not add them.
Preserve `CLAUDE.md` as a symlink to `AGENTS.md`.

Keep old path/command names in dated validation reports, migration records, accepted hashes and
`archive/**`. Reference-design records are provenance, not today's learner interface. Preserve
retired-name lists in `internal/links` and gRPC cache guards in `bin/tutor`. Installed skills derive
from repository skill files; primary handles any synchronization through `tutor install`.
The external `/root/Raw/knowledge/pgcoach-course-authoring.md` is stale relative to the Go migration;
use repository current guidance. A correction outside this workspace is separate from this plan.

Primary also corrects active code comments that cite the former root migration `plan.md` to the
archived migration record when touching those files, so this new plan does not become false provenance.

## 7. Validation and acceptance

### Capture once, compare deliberately

Before implementation, capture a small reproducible inventory keyed by `(stored course ID, slug)`:
ordinal/revision, Setup/Run content, prerequisites/safety/sessions/expected evidence, and rendered
plain/ANSI/JSON outputs as needed. Maintain a 250-row review ledger with classification:
unchanged; prose/diagram only; navigation comment/output cleanup; coaching-only prompt retired;
core commands restored; material experiment change. Record exact allowed differences and reviewer.
A Go comparison helper is appropriate if it saves manual error; it must parse lesson structure,
not treat every matching word as a coaching instruction.

Keep separate raw-history and source-refreshed database baselines. PostgreSQL's active count changes
95→92 and SQLite's 48→54 on refresh: those are existing catalog differences, not a side effect of
renaming. Review the exact slug/ordinal/active-state map before applying refresh; preserve retired
history rather than dropping it or transferring completion to replacement lessons.

### Required checks

- All five public `<course> check` commands pass; authored counts stay 92/54/72/26/6 and planned
  routes stay 40/32/44 as appropriate. No stable slug or ordering change without an explicit defect.
- Run `go test ./...`, `go vet ./...`, `go test -race ./...`, and build from `curriculum-tools`.
  Run targeted tests per chunk; the full final suite once after integration, repeating only for a
  new change/failure. Update goldens only for reviewed intended public names, skipped state or text.
- Temporary consolidated database: public and compatibility names serve identical lessons and
  share done/skipped/notes/attempt history. Public operations create no `*-legacy` storage rows.
  Preserve unrelated courses and retired rows. Check repeated init, stale revisions, explicit
  completed/skipped access, next/skip/undone and note quoting with paths containing spaces/quotes.
- Test every alias/public name with number-first lesson/done/skip, old verb-first forms,
  help/error paths, `init`, `check`, `validate` argument resolution and `progress verify`.
  Validation routing can use a harmless owned test fixture; do not execute actual labs just to test
  the name resolver. Include public-name collisions, defaults, alternate `--root`, malformed
  metadata and planned-course rejection. No output/read command may create or mutate a database.
- `courses` lists exactly seven canonical entries, no alias duplicates. Planned `route` works
  without a database; planned `lesson/done/skip` remains unavailable and creates no progress.
  Roadmap contents and current course counts remain correct without importing a new snapshot.
- Render every authored lesson from a refreshed temporary catalog. Audit all changed documents;
  inspect representative unchanged output. Verify plain/ANSI diagram alignment, exact executable
  content, correct session order, complete required commands and the new completion footer.
  No coaching gate may survive in a code comment, printed string, generated artifact or prose.
- Search broadly for retired coach names, `hint1/2`, coaching/inspect/reveal stage language,
  forced pause/submit/ADR prompts and bold Predict/Inspect/Hint/Vary/Apply headings. Review results
  contextually; database checkpoints, physical hint bits and controller `inspect` operations are
  legitimate. Negative grep alone is not content acceptance.

### Real-tool evidence, bounded to meaningful changes

Editorial-only files need structural/rendered review plus exact behavior-preservation comparison,
not hundreds of repeated expensive experiments. Reuse existing accepted evidence when experiment
commands and semantics are unchanged. The newly included command sequences in PostgreSQL88/91,
SQLite52/54 and any changed Linux72 behavior need independent real execution and inspected results.
Read course-local validation guidance before running them; a harness exit alone does not prove
expected database/session/recovery state. Validate affected branches and sequential state where
changes can leak, not merely the first successful branch.

Use owned Go validation tooling/fixtures and the native commands already present in lessons.
`validate --isolated` isolates evidence files, not an arbitrary PostgreSQL server. For PostgreSQL,
use a private course configuration/root with an owned socket/port because `repl.env` overrides
process environment. Never run author experiments against `/labs/pglab` or port5440. Supply
SQLite's configured binary and isolated disposable database. Linux capabilities and socket/process
visibility must be verified; request actual permissions when needed rather than claiming a skipped
trial passed. Reinstall gRPC only if an experiment change makes a real run necessary.

### Final installation and live refresh — primary only, after implementation authorization

1. Finish all copy-based acceptance. Re-run the current three `progress verify` commands against
   the actual learner source; verify any additionally changed Essentials catalog too.
2. Establish host-visible writer quiescence. Make a consistent, verified rollback backup and
   logical history snapshot; a bare file copy is unsafe with pending WAL/journal content. Existing
   verify refuses nonempty WAL/journal files: respect that refusal and resolve the writer/snapshot
   situation, never delete sidecars or infer quiescence from sandbox process listings.
3. Review the exact per-slug refresh delta and approved revision changes. Sequentially run public
   `postgres-legacy init`, `sqlite-legacy init`, `linux-legacy init` through the CLI. If Essentials
   prose was changed, refresh it under its own stored ID after its own verification. Do not seed
   new future-course rows, hand-edit SQLite, or run learner `done/skip` during rollout.
4. Confirm logical progress/notes/timestamps/completed revisions/attempts and old slug-to-ID mappings
   survive. Selected catalog content may change as approved; untouched course rows, roadmap and
   `.cache/legacy-progress/<old-id>/progress.sqlite*` backup hashes must not. Active legacy catalogs
   must be 92/54/72 with no suffixed storage IDs. Report legitimate stale status from material changes.
5. Open first/last lessons and representative complex lessons through canonical names using real
   read-only commands; SQLite54 must now render. Check old aliases, route/skip-state presentation,
   and unnumbered next selection without recording any learner completion.
6. Test installer behavior in temporary destinations, then synchronize installed launcher/skills
   as required and run `tutor install --check`. Existing links need no unnecessary replacement.
7. If rollout fails, stop and diagnose. Rollback only against the quiescent verified baseline;
   never overwrite learner work created since the snapshot. Refresh transactions are per course,
   so record which courses succeeded rather than assuming cross-course atomicity.

## 8. Resources, checkpoints and completion

Before each trial, recheck disk/memory and actual server identity; reserve at least 2 GB free and
more than twice the next fixture's peak bytes, including backup/replica/WAL/evidence copies. Run
private PostgreSQL trials serially. Default research/test scratch should stay under 100 MB excluding
normal Go caches; calculate any lab budget separately. Give each fixture an owned path, cleanup
handler and final removal point. Do not accumulate stopped clusters.

Keep only concise acceptance reports plus the per-lesson/identity delta inventory. If bulky data is
needed for an outstanding check, retain it with verified manifest/location/removal trigger and
remove it after that check. Final rollback-copy retention is bounded by post-refresh acceptance;
keep a short manifest/report after retiring redundant copies. Preserve learner legacy backups,
learner lab, unrelated work and active agent sessions.

At every checkpoint update this file with: completed package/chunk, owner and exact files,
commit, tests/outcomes, allowed differences, blockers, retained evidence path/size/expiry and next
independent task. Commit coherent implementation chunks with the matching plan update, staging only
owned work. No agent claims a package accepted on its own; primary records acceptance after review.
This fresh planning deliverable itself is currently uncommitted.

Completion means all named courses work through the public commands, every authored lesson has a
recorded content audit, required experiments are fully available in one lesson, coaching gates are
gone, explicit skip/done behavior is correct, installed guidance matches, progress is preserved and
all validation/resource checks are complete. Final checks include learner lab identity/readiness,
unchanged backup hashes, expected logical learner history, no owned processes/labs left over, and
restored disk headroom. Do not mark implementation finished merely because a rename or test suite
passes.

## 9. Estimate and resume state

This is moderate shared-CLI work plus a substantial editorial audit, with a small set of difficult
experiment-flow repairs. Naming alone is a compact code change; flattening 72 Linux lessons and at
least 38 PostgreSQL hint-bearing lessons is the bulk of review. Avoid a wall-clock promise before
primary exemplars establish how many core commands are actually missing. Expect several coherent
code/content/documentation commits and bounded review chunks, not a fresh 250-lesson rewrite.

Research complete:

- [x] Read repository indexes, resource guidance, authoring/tutor/knowledge skills and learner context.
- [x] Sol identity/progress research reviewed against code by primary.
- [x] Terra content inventory reviewed, including primary inspection of PG09/88/91 and SQLite52/54.
- [x] Luna active-doc/install inventory reviewed; broader counts treated as search scope, not a census.
- [x] All five course checks and three disposable-copy progress verification commands passed.
- [x] Public naming, content scope, skip behavior, ownership, validation and rollout specified.
- [x] Learner readiness checked; no research labs or retained evidence copies.
- [x] Implementation request received.
- [ ] P0–P8 implemented and independently accepted.

Final planning checkpoint: only `plan.md` is changed/untracked; whitespace checks pass and the
learner database hash still matches the baseline. About 15 GB disk and 6.8 GiB memory remain
available. The final readiness query succeeded with the same learner identity after the sandbox
denied socket access and the query was rerun under the approved `psql` permission. No owned lab,
validation process or research evidence copy remains.

To resume: read this file and `git status --short`, preserve unrelated edits, check current user
instructions for authorization/changes, remeasure resources and history baseline, then start P0/P1
and assign only the bounded parallel packages above. Do not repeat completed research unless the
code or scope changed. No research agents own repository files or have outstanding work.

### Implementation checkpoint 1 — P0 baseline and dispatch

Baseline commit: `2776655274115a95ebabf7dd1b62fd9e9d0ff818`. Only this plan was untracked.
Primary captured all 250 parsed lessons and plain/ANSI views in
`curriculum-tools/.cache/legacy-migration/before/` using the small adjacent `capture.go` helper.
`raw.sqlite` is a consistent SQLite backup (integrity check `ok`); `refreshed.sqlite` was seeded
through all five original CLI names. Raw/refreshed active counts are respectively PG95/92,
SQLite48/54, Linux72/72, Essentials26/26 and gRPC6/6; retired rows remain. Source database SHA256
still matches the research baseline. Legacy backup hashes are in `legacy-backups.sha256`.
Retain this small baseline directory until final copy-based and live-refresh acceptance; then
remove redundant databases/rendered snapshots, retaining the audit report. No private lab allocated.
Learner query returned `lab|/labs/pglab/primary|f|1`; disk15GB and memory6.8GiB available.

Dispatch P4 exemplar chunk to Terra (`gpt-5.6-terra`, high): exclusive ownership of
`curriculum-tools/courses/linux/lessons/{01-build-disposable-linux-lab,02-identify-kernel-and-userspace,
03-inventory-required-commands}.md` only.
Acceptance: remove coaching scaffolding, keep every useful runnable comparison and exact Setup/Run
bytes, metadata and ordering. Return three diffs for primary review before proceeding. No commits,
learner state changes or labs. Primary owns P1 code and this plan; no other file is delegated yet.

P1 interface is ready for P2 regression: `Course.PublicName()`, discovery `ID` (public) and
`StorageID()` (physical/history); aliases share one Cobra command. Dispatch Sol (`gpt-5.6-sol`,
high), exclusive ownership of new `curriculum-tools/internal/cli/legacy_flow_test.go`, fixture
creation inside that test only. Baseline same commit; inspect current primary diff independently.
Cover the plan's identity/alias/collision/read-only/maintenance invariants. Number-first skip and
route skipped state are pending P3; test the current verb-first skip persistence now. No production
edits, goldens, commits, live learner writes or real labs. Primary owns all other tests and code.

P1 primary acceptance: focused `go test` for course/route/cli/scaffold/render passes. All five public
course checks pass with counts92/54/72/26/6; `courses` shows seven canonical entries and no alias
duplicates. All three canonical `progress verify` commands preserve 251 existing lesson identities,
36 progress rows and37 attempts on disposable copies; live source hash unchanged. Scaffold keeps
its existing duplicate-plan/directory diagnostics, and now rejects reserved public names/aliases.
Primary unit tests cover metadata fallback/invalid names and namespace collisions. Independent P2
remains pending, as do full final suites, skip visibility and live rollout. This checkpoint commits
the P1 interface only; lesson edits remain in the worktree for separate acceptance.

P1 interface commit: `d0c5511`. Primary also owns P3 (skip visibility) now, keeping all shared
identity/route/CLI production files with the primary while Sol's P2 test file remains exclusive.

The complete 250-row ledger is `docs/legacy-course-migration/lesson-audit.tsv`, initially pending.
The baseline comparison helper `.cache/legacy-migration/audit.go` reports exact changed parsed fields
and rejects count/identity movement. Do not regenerate over manual acceptance notes without saving
them. PG09 now has its mechanism diagram and navigation-comment cleanup; primary still must record
the exact parity review. Linux01–03 are primary-accepted: only optional-comparison prose and
lesson01's two terminology references changed; all metadata, Setup and Run bytes match baseline.
No real experiment changed; Terra rendered all three using a removed temporary database.

Dispatch next P4 chunk to Terra: exclusive ownership of Linux lesson files
`04-normalize-shell-observations.md`, `05-coordinate-two-shell-sessions.md`,
`06-cleanup-with-traps.md`, `07-pid-and-parentage.md`, `08-process-tree.md`,
`09-proc-process-identity.md`, `10-command-line-and-environment.md`, `11-process-states.md`,
`12-threads-under-task.md` under `curriculum-tools/courses/linux/lessons/`.
Acceptance matches first three: exact main command/metadata parity, preserve useful comparisons,
direct locally interpreted optional instructions, no coaching scaffolding. No other ownership,
commits, labs or learner writes. Return all nine for primary review before any later chunk.

Dispatch P7 to Luna (`gpt-5.6-luna`, medium), exclusive active docs/skill files:
root `README.md`, `AGENTS.md`; `docs/README.md`, `docs/knowledge/README.md`,
`docs/knowledge/{concise-course-cli,progressive-course-design,learner-work,postgres-essentials,
lesson-identity-refresh,command-inventory-extraction,sqlite-lesson-gotchas}.md`;
`curriculum-tools/docs/{AUTHORING,VALIDATION}.md`; `curriculum-tools/skills/{tutor,curriculum-author}/SKILL.md`;
`curriculum-tools/courses/{postgres,sqlite,linux,postgres-essentials,grpc}/{README,PLAN}.md`.
Update current public commands/skip/single-lesson guidance contextually; preserve stored paths,
stable route tables, historical notes and future-course scope. No lessons, source code, goldens,
live installation, this plan, audit ledger or files outside this list. No commits. Primary reviews
all diffs and checks before acceptance.

### Implementation checkpoint 2 — P2/P3 acceptance

Primary read Sol's complete `internal/cli/legacy_flow_test.go` and the P1 call-site diffs.
Its three public-name/alias fixtures share history (including quoted notes, attempts, stale and
retired rows) and preserve an unrelated course; maintenance commands use harmless Bash fixtures.
All three aliases/public names exercise both done/skip orders. Malformed metadata and public/alias/
planned collisions reject before writes; degraded catalog discovery retains maintenance diagnosis.
Sol reports full tests/vet and focused race passed; primary independently runs focused suites.
P3 is primary-owned: `args.go`, `cli_test.go`, new `skip_flow_test.go`, course/root help,
route types/loading/rendering and lesson footer. Number-first skip, explicit skipped/completed
access, next/undone, separate done counts and read-only plain/ANSI/JSON display are tested.
Only reviewed golden footer/route-legend differences changed. Full final race/build and all
post-content checks remain pending; do not treat this checkpoint as rollout acceptance.

P2/P3 commit: `8ee20a9`; primary focused suites passed after reviewing the final test file.
Sol is released from test ownership and assigned P5: read-only audit all92 PostgreSQL lessons,
record findings in `curriculum-tools/.cache/legacy-migration/postgres-audit.tsv` (one row per lesson),
then exclusively edit the first six ordinary prose files:
`38-explain-analyze-buffers.md`, `46-create-index-concurrently-and-invalid-indexes.md`,
`54-commit-means-fsync.md`, `55-wal-files-and-recycling.md`, `56-crash-and-redo.md`,
`57-wal-size-of-operations.md` under `curriculum-tools/courses/postgres/lessons/`.
Preserve exact Setup/Run, identities/metadata/revisions; retire unavailable coaching-only hint
prompts and retain supplied runnable comparisons. Flag core omissions to primary rather than
changing controllers. Primary retains09/88/91/92 and all validation scheduling. No other edits,
commits, live history or labs; return the six and full inventory before further assignments.

Primary SQLite52/54 exception specification (uncommitted, real validation pending): SQLite52
changes only the printed pause in Run to a neutral observation label, preserving all SQL and
session ordering. Its prose gives the reader-release evidence directly and removes the diagnostic
table requirement. SQLite54 removes only the final generated TODO ADR/complete_your_decision
artifact from Run; contention, backup, restore and assertions remain byte-identical. Its copied
offline-receipt syntax explanations are replaced with this actual experiment's explanation,
architecture tradeoffs and a same-shell owned-directory cleanup command. Revisions remain3:
these remove presentation/submission obligations while preserving the database experiments.
Use real SQLite52/54 validation and inspect restored/domain state before accepting the exceptions.

Source anchors: `docs/README.md`; `docs/knowledge/{concise-course-cli,go-tutor-migration,
lesson-identity-refresh,vm-resource-cleanup}.md`; `curriculum-tools/docs/AUTHORING.md`;
`docs/lesson-batch-workflow.md`; `curriculum-tools/internal/{course,cli,route,render,progress}`;
`archive/deno-engine/README.md`; `archive/plans/go-tutor-migration.md`.
