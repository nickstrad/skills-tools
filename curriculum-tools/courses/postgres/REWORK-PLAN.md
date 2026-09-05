# PostgreSQL systems engineering pivot

Status: implementation authorized 2026-09-04. Scope is unfinished work after original lesson 7. The
user changed the execution approach on 2026-09-04: the primary agent now designs and implements each
section sequentially, reviews its wording and code, validates it, and commits/pushes each completed
chunk. Agents may perform narrowly scoped verification of supplied commands or finished changes;
parallel lesson authoring has stopped. This supersedes the earlier Terra implementation assignments
in historical designs. See [handoff.md](handoff.md) for the current checkpoint and
[designs/](designs/) for exact contracts.

Progress checkpoint, 2026-09-05: chunks1–4 are accepted. Durability/recovery acceptance is recorded
in the individual validation/04-*.md reports, concluding with
[actual PITR and timeline consolidation](validation/04-pitr.md). Chunk5 is accepted through physical
replication, logical decoding/delivery and
[bootstrap consolidation](validation/05-logical-bootstrap.md). Logical conflict reconciliation and
retention/resnapshot, chunks6–7 and the final course audit remain unfinished. The current course
has92 active lessons and seven stops.

## Teaching contract

Read → predict → run supplied code → inspect evidence → explain → vary → apply. Early lessons supply
all runnable commands; later synthesis removes scaffolding gradually. Syntax memorization is not the
assessment. The assistant offers hints and exact commands when requested and never records
completion without the learner's explicit instruction.

Provide a course-local staged CLI alongside the existing full `tutor postgres pretty` view. It uses
the tutor CLI to select lessons and read progress, then joins authored coaching prompts by stable
slug. This avoids changes to the shared engine while SQLite work is active. Stage selection is
explicit and stateless. Expected results are withheld until `reveal`; supplied experiment code and
its syntax explanation become available at `run`, after prediction. Full lesson text remains
available on request. Preserve study checkpoints and cautions.

## Design reasoning

Keep PostgreSQL's physical and transactional depth. Consolidate repeated demonstrations and spend
the time on measurable decisions, durable work and delivery, and diagnosis under load. A recurring
task-runner workload connects mechanisms without requiring a web service. Tiny isolated tables
remain useful for causal experiments; integrated stages use request/job/result/outbox/receipt
invariants. Local independent transactions are not described as independent host failure domains.

Correct known problems before strengthening conclusions: TOAST update advice, aggregate row locks,
retry-abort versus unknown outcome, metadata-only DDL locks, zero-scan indexes, outbox delivery
simulation, concurrent insert-or-read, token enforcement and unconditional replica reads.

## Delivery chunks

0. **Plan and restart checkpoint.** Commit this plan, the prior detailed review, initial handoff and
   implementation contracts. Record a baseline of the completed seven lessons and learner progress.
1. **Guided foundation.** Add staged course CLI, tutor-skill routing and content-specific prompts.
   Improve original 8–23; consolidate FSM/reuse and pinned-reader/bloat demonstrations. Preserve
   original 1–7 byte-for-byte at the built lesson-object level. Real storage/MVCC/vacuum validation.
2. **Correct concurrent clients.** Original 24–38 plus version-column pattern: explicit invariants,
   real fresh-transaction retry loop, known abort versus unknown outcome, durable short job claims,
   DDL lock corrections, and deadlines. Primary owns retry/claim protocol design and hard code.
3. **Workload performance.** Original 66–84 reorganized into plan/index/measurement progression;
   consolidate index-only duplication and add composite-key pagination, skewed prepared plans,
   bounded online migration/retention and a measured capacity experiment. Primary audits benchmark
   methodology and interpretation. Introduce wait/log literacy with the mechanisms it diagnoses.
4. **Durability and recovery.** Original 39–51: measured WAL costs, inspect crash evidence in the
   same exercise, restore with domain assertions, missing-history failure, bounded checkpoints.
   Shell/restart operations validate serially in a private cluster. Primary owns hard recovery work.
5. **Replication and change processing.** Original 52–65 plus 90: physical read-your-writes with a
   bounded readiness gate, controlled failover and fencing, meaningful snapshot/tail handoff and
   logical conflict/reconciliation. Cascading becomes optional; cleanup remains required. Primary
   owns authority/readiness semantics and failure validation.
6. **Durable protocols.** Original 85–91 integrated with earlier claims: identity plus business
   effect atomically committed, receiver commits independently of sender acknowledgement, replay
   after lost acknowledgement, enforced fencing interface, durable 2PC decision recovery, missed
   notification reconciliation. Primary implements the protocol boundaries and supporting lessons
   and coaching together, so their assumptions stay consistent.
7. **Independent diagnosis and final integration.** Original 92–96 become symptom-first incidents
   and an operation-history/capacity capstone; detailed salvage and repeated freezing are optional
   depth. Refresh final PLAN, ordinal map, reading references/checkpoints, docs and wrapper.
   Validate the complete resulting course and copied progress migration, review every change,
   commit/push.

Each chunk must leave a buildable, useful course. It may contain several reviewed commits if lab
evidence warrants smaller checkpoints. Do not substitute a partially validated chunk for completion.

## Identity and ownership

- `curriculum/*.ts` is authoritative; build `lessons.json`, never hand-edit it.
- Freeze the first seven built objects and revisions. Keep course revision 2; explicitly use
  revision 4 for materially changed existing lessons and revision 1 for new lessons.
- Preserve surviving slugs. Retire only after coverage and prerequisite replacements are explicit;
  record old/new ordinal and slug mapping. No transferring a retired completion to a different task.
- Keep the seven reading stops attached to appropriate surviving experiments and refresh ordinal
  references at integration. Reuse canonical book research; do not re-extract the PDF.
- Primary owns all remaining lesson implementation and integration. Finish a coherent section before
  starting the next. Preserve returned private drafts as inputs for primary review.
- Verification agents receive a fixed change or supplied experiment and explicit questions. They
  report evidence and gaps rather than authoring lessons or expanding scope. They do not commit,
  edit progress, shared engine, other courses, generated root artifacts or another agent's files.
- Verification runs use assigned scratch databases. Global settings, restart, promotion, crash and
  corruption run serially under primary ownership.
- Commit only PostgreSQL-related paths/hunks. Active SQLite/bootstrap/shared-engine changes belong
  to the other workstream. Never stash or reset them. Fetch before pushing; never force-push.

## Acceptance per lesson and chunk

Every new or changed experiment causes and observes a phenomenon, supplies runnable commands,
explains every unfamiliar component, identifies variable versus invariant output, and poses a
specific prediction, evidence question, explanation, variation and workload decision. Do not add
generic coaching boilerplate to every lesson. Stateful prerequisites must be explicit or setup
self-contained. Bounds, process ownership, cleanup, expected errors and transaction outcomes must be
checked rather than inferred from sleep or printed success text.

Build/typecheck/lint/format the changed course; run engine tests for integration. Inspect real-tool
output against expected results: the harness completion count detects timeouts, not correctness.
Validate changed lessons individually, then their sequence. Primary independently reruns important
concurrency/failure cases and benchmarks without competing benchmark agents. Store concise durable
evidence in `validation/` and raw logs in scratch paths recorded in the handoff. Run final whole
repo checks and distinguish unrelated concurrent failures without editing other workstreams.

Keep `handoff.md` current at assignment, implementation, review, validation and commit boundaries.
Record exact next actions, owners, scratch paths, commands, failures, evidence and pending concerns.
