# Author a systems project lesson

Before authoring, consult the [systems knowledge store](../knowledge/README.md). At batch completion,
record reusable findings there with measured evidence, limits and cleanup implications, and update
its index. Link project validation records; do not retain bulky lab state as documentation.

Read the repository [authoring contract](../../../curriculum-tools/docs/AUTHORING.md) and
[resource lifecycle](../../../docs/knowledge/vm-resource-cleanup.md). Use its pedagogy, not its
TypeScript data model: systemscoach has its own [small file format](format.md).

## One causal experiment, one complete lesson

`curriculum/<slug>/lesson.md` introduces the question, unfamiliar terms, invariant and terminal
state/sequence diagram **before commands**. Lean toward using a labelled diagram for ownership,
state transitions, timelines, queues, layouts, contention, or log flow; connect it to the evidence
and keep it readable without colour. Supply setup, session labels, a meaningful learner task,
inspection, interpretation, worked reference, and cleanup. Explain unfamiliar flags and where
output/PIDs/version tokens come from. State precisely what blocks and which terminal unblocks it.

New lessons target 10–15 minutes including the learner's attempt and a small debugging allowance.
Keep valid 15–25-minute metadata on existing lessons; it records their original honest estimate.
Give a bounded safe-stop/resume path at the stated limit.

Interpretation and the worked reference belong directly below the learner task in `lesson.md`.
The `review` spelling remains a compatibility alias for the complete lesson output and reads that
single file; there is no separate review source or CLI stage.

Use the [lesson](../templates/lesson.md) template as a prompt, not mandatory padding. No pure
installation lesson, command tour, line-count target, or coding-only milestone. Apply the
[learner work contract](../../../docs/knowledge/learner-work.md) to every lesson. Name a specific command to
construct/adapt, causal configuration change, core edit, or diagnostic question whose investigation
the learner controls. Prediction and running a completed helper alone are not sufficient. Supply
plumbing and unfamiliar syntax; leave the meaningful action for the learner.

The page explains the mechanism, gives the starting state and task boundary, then provides
observable acceptance checks. A short worked example may precede a related learner task. Put
optional hints and the exact task solution after the task under a clear “attempt first” label, so the
single output is complete without silently doing the learner's work during coaching.
Code tasks use an isolated editable workspace and must control the real experiment. Command tasks
must require a relevant choice or adaptation, not transcription of the entire answer. Include time
for learner attempts and debugging in the total budget; split only when shortening cannot make it fit.

## Real validation before availability

For every published lesson, record in `validation/batch-N.md`:

- Source paths/revisions and exact versions of tools/images tested; commands actually executed.
- The exact learner-owned action, supplied boundary and observed effect. Validate the starter and
  worked completion, including a relevant wrong choice or failure. Confirm the exercise affects the
  mechanism or resolves the stated uncertainty; a heading or helper PASS is insufficient.
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

Only set `available: true` after the complete lesson, scaffolding and real evidence are reviewed. Run
`systemscoach check <topic>` and smoke lesson/done plus the review compatibility alias in isolated SYSTEMSCOACH_STATE, never
learner progress. Structural validation cannot establish protocol correctness.
