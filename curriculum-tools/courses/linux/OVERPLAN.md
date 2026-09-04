# Linux refactor: from demonstrations to defended decisions

2026-09-04. The authority is `docs/learning_path.md`, `docs/AUTHORING.md`, and the checked-in
curriculum-author skill. This is a deep Linux substrate course, not a command survey or a substitute
for the networking, Docker, systemd, or tracing projects.

## Outcome and scope

The learner must connect a service symptom to a process and kernel resource, choose evidence that
distinguishes competing causes, make a bounded intervention, and prove that useful service and
resource ownership recover. Preserve the 72 stable lesson identities and current order unless an
actual prerequisite defect requires adjustment. Depth is justified by distinct mechanisms, not a
fixed count. Keep small experiments for first encounters; use the service and its files,
descriptors, CPU and socket as the recurring integration model. No new shared engine or course-local
CLI is needed.

The audit found no authored challenges, compressed syntax explanations throughout, and a final
incident that disclosed every cause and treated process termination as recovery. Some apparent
duplicates supply valuable different evidence (open inode, filesystem accounting, bounded filesystem
recovery); retain those and name the new decision. Differentiate the repeated FIFO rendezvous
through endpoint lifetime. Do not broaden into advanced routing, tracing, service managers or
containers.

## Changes and acceptance

1. **Foundations and process composition**, design `designs/01-foundations.md`: modules 01–04, full
   command explanations, specific predictions and bounded variations; distinguish FIFO opening,
   buffer pressure and EOF ownership.
2. **Storage, memory and scheduling**, design `designs/02-resource-evidence.md`: modules 05–08,
   causal explanations, measured claims and synthesis decisions; directly observe page residency
   rather than infer a cold read from two timings.
3. **Budgets, sockets and isolation**, design `designs/03-boundaries.md`: modules 09–11, ownership
   and boundary decisions, exact command explanations, capability skips identified as untested
   mechanisms rather than successes.
4. **Incident investigation and delivery**, design `designs/04-incidents.md`: primary-owned
   capstones, symptoms before solutions, graduated runnable hints, useful request/response recovery
   and exact cleanup; wrapper uses the existing guided template. Update PLAN, progress evidence and
   durable findings.

Each delegated change is implemented by a Terra agent at high reasoning effort in a private copy,
with only its owned source files and validation report copied back. The primary owns difficult
semantic decisions, final review, wording, artifacts, integration validation, commits and pushes.
Agents never commit.

## Progression

- Modules 01–03: supplied commands; predict identity, status, signal and cleanup outcomes, then
  explain one evidence line.
- Module 04: choose descriptor/pipe evidence and defend an EOF or blocking diagnosis.
- Modules 05–06: distinguish names, live objects and block allocation; choose safe recovery
  evidence, separating atomic visibility from durability.
- Modules 07–09: distinguish reservation, residency, demand, placement and budgets; defend a
  measurement before selecting a limit or intervention.
- Modules 10–11: connect endpoint ownership and namespace views; state what a namespace isolates and
  which resource controls remain necessary.
- Module 12: diagnose symptoms using familiar interfaces; present hypotheses, measured evidence,
  intervention, recovery proof and a limitation of the experiment.

## Validation and shipping

Keep the course default revision at 1; increment explicit revisions only on changed lessons.
Preserve slugs and ordinal identity; verify reseeding on isolated progress, never the learner
database. Build Linux artifacts from source. Run changed lessons individually, inspect output
against expectations, and run the whole course serially after integration. Validate actual
privileged branches where the disposable host permits them and record policy skips honestly. New
variations need executed evidence. Run formatting, lint, type checks, tests and the repository
check; report unrelated failures without changing concurrent PostgreSQL/SQLite work.

Commit and push this plan and the restart handoff before implementation, then each reviewed unit
with generated artifacts and updated `handoff.md`. Never stage the whole repository. Keep per-change
results in `validation/` and reusable discoveries in `docs/knowledge/`.
