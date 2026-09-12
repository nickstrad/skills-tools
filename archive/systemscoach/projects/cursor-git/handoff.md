# Resume Cursor Git: learner tasks and ten-lesson split

Status: **safe to clear conversation context; work is not complete**. All work needed to resume is
saved here and in the linked design. Agents are stopped; no lab/service/test job is active.

## User requests and agreed scope

1. Complete the originally requested final five lessons, now expanded by the explicitly requested
   splits below. The target is **ten lessons total**, within the same topic and mechanism scope.
2. **Latest correction: every lesson must reserve meaningful learner work.** Nick rejected simply
   running prepared code and explicitly made this a norm across systemscoach courses. This supersedes
   the earlier plan that only 6/7 needed edits and 4/5/8 could be fully supplied experiments.
   Meaningful native commands and diagnostic investigations count; Go is not required everywhere.
   Follow `docs/learner-work-plan.md` for concrete tasks and attempt budgets across the ten-lesson target route.
3. Maintain the systems knowledge store after completed work. The global norm is now saved in the
   installed systemscoach skill, authoring/design guidance, templates and `docs/knowledge/learner-work.md`
   under systems-projects. This checkpoint updates policy and the redesign plan, not lesson pages.
4. User requested a clear-context-ready checkpoint. Resume the pending course work from these files;
   existing final-batch authorization persists. Do not ask for the same agenda approval again.

**Latest explicit instruction (2026-09-09): split original lessons 5 and 8 now.** Nick prefers a
couple of short lessons over sessions that run long. This supersedes the earlier advice to keep
eight lessons and split only if timing proves necessary. No further approval for these two splits
is needed. Aim for 15–20 minutes for each resulting lesson, including attempts and cleanup.

| New number | Scope | Original lesson |
| --- | --- | --- |
| 1–4 | Objects, publication, race, unknown outcomes | 1–4 unchanged topics; learner-task retrofit required |
| 5 | Import one accepted entry and apply its guarded ref update | First half of 5 |
| 6 | Diagnose a missing replay payload; restore it and resume without advancing the marker early | Second half of 5 |
| 7 | Implement interrupted-replay recovery decisions | Former 6 |
| 8 | Implement read-admission decisions | Former 7 |
| 9 | Evict local copies and reconstruct from authority, checking expected refs/content | First half of 8 |
| 10 | Build independent integrity checks, compare cold/warm cost and diagnose incomplete rebuilds | Second half of 8 |

Each split lesson must have its own meaningful learner action, observable finish, bounded setup and
safe cleanup/resume. Do not leave setup as a standalone lesson or require a long uninterrupted pair.
`project.json` and existing draft filenames still describe the old eight-lesson route at this
checkpoint; migrate them during implementation. Use stable slugs to identify existing work, preserve
progress, add two new slugs, and update prerequisites, numbering and time estimates consistently.
The saved-work section below uses **original numbering** to identify current files.
Supply infrastructure and unfamiliar syntax, graduate hints, and keep worked answers in review or
separate references. Do not turn learner ownership into mandatory reports, quizzes or boilerplate.

## Read first

- Repository AGENTS/docs index and systems-projects/AGENTS.md.
- `systems-projects/docs/knowledge/README.md`, especially object-store-git-labs.md.
- `docs/learner-work-plan.md`: latest ten-lesson learner tasks and original-to-new mapping; takes precedence over earlier drafts.
- `docs/batch-2-design.md` in this project: full protocol, failure, coding and validation contract.
- `PLAN.md`, `project.json`, and `validation/batch-1.md` for the preserved first batch.
- Systemscoach + curriculum-author skills and repository `docs/lesson-batch-workflow.md`.

## Saved work and current quality

- Route approved, **only 1–3 available**, still in their original form. The ten-lesson learner-work
  retrofit remains pending. Keep all unfinished steps unavailable until real acceptance.
- Primary drafted complete lesson/review pages for 4 `reconcile-unknown-outcomes` and 5
  `replay-published-history`. No real execution of these new pages yet.
- Sol drafted pages for 7 `verify-before-serving` and 8 `evict-and-rebuild`. Primary fixed two
  concrete draft mistakes: build.sh does not return a bare executable path (now explicit CURSOR
  assignment), and fixture file is **story.txt**, not file.txt. Still unvalidated. Lesson 7 needs
  the newly requested Go coding exercise integrated; current draft is guided CLI only.
- Lesson 6 `resume-interrupted-replay` has **no pages yet**. Author it with the replay-decision edit.
- `lab/build.sh` builds supplied client to `$CURSOR_LAB/cursor` from systems-projects' Go module.
  Its stdout is a human status message; lessons must set CURSOR="$CURSOR_LAB/cursor" explicitly.
- Sol saved draft Go helper in `lab/cursor/{main,model,store,git,protocol}.go`. Primary ran gofmt
  and fixed an ensureRepo error-variable scope bug. `go test ./projects/cursor-git/lab/cursor`
  now **compiles with [no test files]**. This is NOT tested protocol acceptance. No new unit tests
  or real-service tests have run. Read every function critically before relying on it.
- Helper does not yet expose learner decision functions or an isolated exercise-copy/build flow.
  Draft replay metrics omit request/byte/time fields expected by lesson 8; fix that interface.
  Audit replay's shortcut for a pending ref already at its new value: it currently advances state
  without re-importing/checking the pending pack. Ensure the installed-effects invariant is sound
  on restart and missing/corrupt local objects, rather than trusting matching ref text alone.

## Exact helper/fixture contract

```
CURSOR publish LAB a|b [--lose-reply]           # real successful PUT, then process exit 86
CURSOR replay LAB NAME [--stop-after-ref=op-a] # after ref effects, before marker: exit 87
CURSOR read LAB NAME                         # guarded captured-index read
CURSOR wake LAB NAME [--drop]                 # explicit hint, drop omits replay invocation
```

LAB must be a canonical owned `/tmp/systems-cursor-git-*` root with matching ownership marker.
Repo is LAB/NAME.git, marker NAME.git/cursor-state.json; external lock LAB/NAME.lock. Marker JSON
fields: applied, entries, refs, index, etag. Base record counts as applied=1, A as 2, B as 3.
Read success should report `served generation=... main=... requests=... bytes=... index_status=...
elapsed_ms=...`; warm unchanged read ideally one GET, zero body bytes, status304. No `served` on
error. Replay should report counts useful for cold/warm comparison. Overall bounded command timeout
is 10s. Expose replay classification and read admission core decisions for learner edits.

Existing seed/candidate/upload scripts and lab lifecycle remain unchanged. Fixture commits:
base=e620faabc0b2fa21512bf0be43e53561a0dfe845, A=af073e00db03de2c46604ea4d9a60d271c7f5adf,
B=36a3830268c2f25ee88bc550182593a1a4111f61. Content is story.txt: base / change a / change b.
Source has base/A/B full packs; index authority has base record then accepted A/B only.

## Next actions, in order

1. Migrate the route to ten lessons using the approved mapping above, then implement the learner-work
   plan across all lesson pages and review answers; preserve the original
   first-batch evidence and learner progress when revising available lessons. Review/refine Go helper
   against design: identity-bound deduplication, immutable payload checks,
   bounded CAS retry, replay prefix/local divergence, crash-safe marker ordering, read/apply locking,
   valid 304 cache use, source-only rebuild and safe paths. Add meaningful unit tests (httptest plus
   temporary native Git). Go tests use private state; no learner progress writes.
2. Implement isolated learner-copy exercises for new7/8 (original6/7). Factor useful short policy functions;
   fail-closed starters, graduated hints and worked solution. Build exercise binary from edited
   copy under LAB. Verify those decisions are actually invoked by replay/read. Use supplied worked
   binary for fixture setup so a starter cannot block all setup. Keep each full lesson at 20min.
3. Author new7 and adapt new8 around those edits. Complete new4/5/6/9/10 with the learner-owned
   commands and investigations in the plan. Implement both approved splits, each with its own short
   task and stopping point; fully supplied CLI walkthroughs no longer satisfy acceptance.
4. Build helper and run real pinned SeaweedFS labs **serially** with one tracked parent process.
   Never edit a script while it is executing. Reuse existing lab.sh, retain process/tool handle,
   inspect real Git refs/content/fsck and HTTP/marker results. Add external negative controls:
   mismatched operation ID intent, missing/corrupt pack, replay after-ref crash, divergence,
   index prefix rewrite, stale/304 read, unavailable authority and no-source rebuild.
5. Extend rendered validation for new4–10 and the revised1–3 (new records; retain batch1 evidence). Validate
   each code block including starter failure + worked learner solution, retries and cleanup. Record
   actual source hashes, outputs, tool versions/time/resource limits in validation/batch-2.md.
6. Publish new4–10 and the revised1–3 only after their acceptance; update PLAN/README/knowledge and revisions
   according to format.md without resetting learner progress. Tests:
   Go race tests/vet, systemscoach check/route/all views, isolated completion showing all10 available.
   Existing historical batch1 hash manifest stays historical; add final-batch manifest.
7. Cleanup at every validation checkpoint and end; compare protected progress/readiness, preserve
   any concurrent learner updates, commit coherent owned chunks, remove this handoff in final commit.

## Agents, resources and protected work

Sol agents `/root/recovery_cli` and `/root/final_lessons` have stopped writing and reported their
saved state. No task file remains assigned to a running agent. Reuse them or delegate bounded work
per batch workflow if available; all essential contracts are persisted and do not depend on them.

Checkpoint resources: about16GB free,6.8GiB RAM available; **no Cursor Git lab root or weed process**.
Only previously installed pinned SeaweedFS4.46 binary is retained. No new dependency download or
backend lab was allocated this turn. Go build cache is useful, not disposable evidence.
Learner readiness: `lab|/labs/pglab/primary|f|1`, original postmaster348739, socket/tmp port5440.
`validation/batch-2-progress-baseline.json` preserves preflight SHA256s; all still match at checkpoint.
The temporary /tmp baseline has been removed after making this durable copy.

Pre-existing unrelated changes must remain: root README.md, docs/README.md, docs/knowledge/README.md,
docs/knowledge/postgres-coaching-pilot.md, docs/learner-profile.md, PostgreSQL pilot/design/guide/tool
files; untracked gRPC course and docs/knowledge/grpc-course.md. Stage only owned systems files.
Prior commits: d4b03b6 = final batch design; earlier first batch ends at4db0082.
