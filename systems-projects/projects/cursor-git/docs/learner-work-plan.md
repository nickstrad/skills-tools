# Cursor Git: learner work across all eight lessons

2026-09-09: Nick requires meaningful learner work in every systemscoach lesson. This supersedes the
earlier restriction of learner implementation to lessons 6 and 7. Keep the approved eight-lesson
route for now; shorten demonstrations to reserve time for an attempt and correction. The tasks below
are the concrete redesign plan, not yet authored or validated exercises.

| Lesson | Learner-owned task | Supplied boundary | Evidence to inspect | Total / attempt budget |
| --- | --- | --- | --- | --- |
| 1. Objects before refs | Construct the guarded `git update-ref` transition using the observed old OID; attempt a stale transition. | Tiny repository, object creation and syntax example for a related ref. | Actual ref changes once; stale expected-old fails without moving it. | 20 / 7 min |
| 2. Publish the index | Assemble the conditional publication request using the captured ETag and prepared candidate body. | Store setup, fixture payloads, HTTP syntax and candidate JSON. | Uploaded objects alone do not advance authority; conditional publication does. | 20 / 7 min |
| 3. Race the publishers | Investigate the losing candidate after the supplied race; construct the revalidation/retry for a still-valid branch and reject a stale branch intent. | Barrier, race drivers and bounded candidate helpers. | One first winner; loser refreshes authority and checks branch old OID before any retry. | 25 / 9 min |
| 4. Reconcile unknown outcomes | Construct a query that finds the stable operation ID in accepted history and checks its intent; use that evidence to choose retry or already-published handling. | Lost-reply injection, immutable uploads, query syntax and publisher transport. | Identical retry adds no entry; an uploaded unpublished operation is distinguishable. | 20 / 7 min |
| 5. Replay published history | Assemble the native Git import and guarded ref update for one accepted entry, placing the supplied marker operation after installed effects. | Fetch/hash verification, base setup and the multi-entry replay driver. | Git content and refs agree; missing pack prevents the entry's marker advancing. | 25 / 9 min |
| 6. Resume interrupted replay | Implement the Go decision for expected-old, pending intended-new and divergent refs. | Isolated starter, Git/HTTP plumbing, installed-object verification and crash injection. | Restart completes once after ref-before-marker crash; divergence is rejected. | 20 / 8 min |
| 7. Verify before serving | Implement the Go admission decision: catch up, serve or fail after observing authority. | Isolated starter, conditional GET, cache validity checks and local locking. | Missed hint catches up; valid unchanged index can serve; unknown authority cannot. | 20 / 8 min |
| 8. Evict and rebuild | Construct independent Git checks comparing rebuilt refs, reachable objects and content against saved expectations; diagnose a missing published pack with chosen commands. | Scoped eviction, rebuild plumbing, expected IDs and bounded metrics. | Two authority-only rebuilds agree and pass integrity checks; missing input blocks completion. | 25 / 9 min |

Hints progress from the invariant to the needed API/ordering, then a worked solution in review.
The lesson page gives a clear task and external acceptance checks before revealing the answer.
Validation must exercise the actual learner path, including a wrong choice and correction; running
the old completed helper is not sufficient. Setup may use a supplied worked binary so unfinished
learner decision functions do not block fixture creation.

Lesson 5 and lesson 8 have the tightest budgets. First reduce duplicate examples and keep optional
variations outside the core. If review shows the complete task still exceeds 25 minutes, propose a
specific split with an independently useful result; do not silently expand the approved route.

Lessons 1–3 currently retain their original available pages. Revise them under the normal identity,
progress-preservation and real-validation rules. Keep their batch-1 evidence historical. Lessons
4–8 remain unavailable until their new learner tasks, full protocol and cleanup pass acceptance.
