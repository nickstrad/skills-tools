# Cursor Git: learner work across ten short lessons

2026-09-09: Nick requires meaningful learner work in every systemscoach lesson. This supersedes the
earlier restriction of learner implementation to lessons 6 and 7. Nick then explicitly requested
splitting original lessons 5 and 8 because he prefers short sessions over lessons that run long.
The approved target is now **ten lessons**. These are planned tasks, not yet authored or validated
exercises; `project.json` still has eight entries until the implementation migration. No additional
approval is needed for these splits. Existing draft references use original numbering.

| Lesson | Learner-owned task | Supplied boundary | Evidence to inspect | Total / attempt budget |
| --- | --- | --- | --- | --- |
| 1. Objects before refs | Construct the guarded `git update-ref` transition using the observed old OID; attempt a stale transition. | Tiny repository, object creation and syntax example for a related ref. | Actual ref changes once; stale expected-old fails without moving it. | 20 / 7 min |
| 2. Publish the index | Assemble the conditional publication request using the captured ETag and prepared candidate body. | Store setup, fixture payloads, HTTP syntax and candidate JSON. | Uploaded objects alone do not advance authority; conditional publication does. | 20 / 7 min |
| 3. Race the publishers | Investigate the losing candidate after the supplied race; construct the revalidation/retry for a still-valid branch and reject a stale branch intent. | Barrier, race drivers and bounded candidate helpers. | One first winner; loser refreshes authority and checks branch old OID before any retry. | 25 / 9 min |
| 4. Reconcile unknown outcomes | Construct a query that finds the stable operation ID in accepted history and checks its intent; use that evidence to choose retry or already-published handling. | Lost-reply injection, immutable uploads, query syntax and publisher transport. | Identical retry adds no entry; an uploaded unpublished operation is distinguishable. | 20 / 7 min |
| 5. Apply one published entry (original 5a) | Assemble the native Git import and guarded ref update, placing the supplied marker operation after installed effects. | Fetch/hash verification and base setup. | Git content, refs and applied marker agree for one accepted entry. | 20 / 8 min |
| 6. Recover a blocked replay (original 5b) | Choose diagnostic commands to locate the missing payload; restore the exact object and resume. | Cold fixture with a missing pack, restore transport and multi-entry replay driver. | The marker stops before the missing entry and advances only after its effects are installed. | 20 / 8 min |
| 7. Resume interrupted replay (original 6) | Implement the Go decision for expected-old, pending intended-new and divergent refs. | Isolated starter, Git/HTTP plumbing, installed-object verification and crash injection. | Restart completes once after ref-before-marker crash; divergence is rejected. | 20 / 8 min |
| 8. Verify before serving (original 7) | Implement the Go admission decision: catch up, serve or fail after observing authority. | Isolated starter, conditional GET, cache validity checks and local locking. | Missed hint catches up; valid unchanged index can serve; unknown authority cannot. | 20 / 8 min |
| 9. Evict and reconstruct (original 8a) | Capture expected refs/content with native commands, then check a reconstruction after eviction against those expectations. | Scoped eviction of all local Git copies and authority-only rebuild plumbing. | Reconstruction recovers the expected refs/content with no local source repository. | 20 / 8 min |
| 10. Audit a rebuilt replica (original 8b) | Construct reachable-object and integrity comparisons for two replicas; choose commands to diagnose a failed rebuild and compare cold/warm request/byte counts. | Cold-start authority fixture, rebuild drivers and bounded metrics. | Independent integrity checks agree, warm/cold costs are visible, and missing published input blocks a fresh rebuild. | 20 / 8 min |

Hints progress from the invariant to the needed API/ordering, then a worked solution in the lesson
after the learner task.
The lesson page gives a clear task and external acceptance checks before revealing the answer.
Validation must exercise the actual learner path, including a wrong choice and correction; running
the old completed helper is not sufficient. Setup may use a supplied worked binary so unfinished
learner decision functions do not block fixture creation.

The splits are required, not conditional on a timing overrun. Aim for 15–20 minutes per split lesson,
including the learner's attempt and cleanup. Each must start independently with supplied fixtures
and end with an observable result and safe stopping point. Keep optional variations outside the core.
Preserve existing slugs for continuing topics, add distinct slugs for the two new steps, and migrate
route order, prerequisites, references and timing together without altering learner receipts.

Lessons 1–3 currently retain their original available pages. Revise them under the normal identity,
progress-preservation and real-validation rules. Keep their batch-1 evidence historical. New lessons
4–10 remain unavailable until their new learner tasks, full protocol and cleanup pass acceptance.
