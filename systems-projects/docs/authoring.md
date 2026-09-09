# Author a systems project lesson

Before authoring, consult the [systems knowledge store](knowledge/README.md). At batch completion,
record reusable findings there with measured evidence, limits and cleanup implications, and update
its index. Link project validation records; do not retain bulky lab state as documentation.

Read the repository [authoring contract](../../curriculum-tools/docs/AUTHORING.md) and
[resource lifecycle](../../docs/knowledge/vm-resource-cleanup.md). Use its pedagogy, not its
TypeScript data model: systemscoach has its own [small file format](format.md).

## One causal experiment, two useful views

`curriculum/<slug>/lesson.md` introduces the question, unfamiliar terms, invariant and terminal
state/sequence diagram **before commands**. Supply setup, session labels, prediction, manipulation,
inspection and cleanup. Explain unfamiliar flags and where output/PIDs/version tokens come from.
State precisely what blocks and which other terminal unblocks it. Observations should let the
learner assess success; reserve the fuller causal interpretation for review. Both views together,
including reflection and cleanup, fit 15–25 minutes. The page must be usable cold in a terminal.

`review.md` explains the measured result and competing outcome, why the failure happens, how
recovery restores the invariant, one decision/tradeoff and the single-host approximation's limits.
Add a short optional variation or deeper source locator only if useful. Avoid repeating the entire
setup or making review a quiz. Commands required for a safe exit must remain in the lesson view.
If the learner stops at 25 minutes, give a bounded safe-stop/resume path.

Use the [lesson](../templates/lesson.md) and [review](../templates/review.md) templates as prompts,
not mandatory padding. No pure installation lesson, command tour, line-count target, or coding-only
milestone. Learner ownership should increase through predicting, inspecting, diagnosing and choosing;
provide runnable hints and a worked core-logic solution when code is assigned. Keep plumbing supplied.

## Real validation before availability

For every published lesson, record in `validation/batch-N.md`:

- Source paths/revisions and exact versions of tools/images tested; commands actually executed.
- Resource preflight and peak estimate including images, volumes, backups, replica/restore copies,
  retained log history and logs. Keep repository headroom; use a unique owned lab root and ports.
- Measured observation that proves the claim: IDs, counters, operation history, rows, byte hashes,
  error codes or state transitions. Expected errors are identified; process exit zero alone is not proof.
- The intended failure and recovery actually exercised, including important timing/coordination
  alternatives; distinguish an unrun optional variation. Run learner-edit solutions through the same
  external evidence check as the manual flow. Do not accept a helper's printed PASS as sole evidence.
- Rerun behavior: setup is idempotent or has explicit prerequisite state and a bounded reset/resume path.
  Declare cross-lesson state; do not require an undocumented earlier shell variable.
- Measured runtime plus honest teaching estimate; installation/download cost separate and visible.
- Teardown outcome, removed owned resources, any minimal retained evidence and its expiry, unchanged
  learner progress, and a read-only learner-lab readiness check.

Use process handles and explicit ownership. Never use global kill patterns, host-wide firewall
flushes, or delete arbitrary similarly named volumes. Failure injection targets only this project's
lab; scoped network namespaces/containers are useful when testing partitions. Multiple processes on
one VM demonstrate protocol/process failures, not independent-host availability or cloud durability.
Stop owned processes even on failure. Remove reproducible bulky fixtures after acceptance. Preserve
learner live labs, state, progress, and unrelated changes. Do not install every candidate service.

Only set `available: true` after both views, scaffolding and real evidence are reviewed. Run
`systemscoach check <topic>` and smoke lesson/review/done in isolated SYSTEMSCOACH_STATE, never
learner progress. Structural validation cannot establish protocol correctness.
