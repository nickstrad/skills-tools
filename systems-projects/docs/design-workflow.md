# From an engineering write-up to a bounded project

Start with the [systems knowledge store](knowledge/README.md) and reuse relevant prior findings.
After completing planning or course work, update the store when new reusable evidence or decisions
emerge; source-specific research stays beside the project and is linked from shared notes.

This builder is a separate project track. Tool courses develop internals knowledge; systemscoach
composes tools into a small architecture and investigates its guarantees. It borrows the current
[PostgreSQL Essentials flow](../../curriculum-tools/courses/postgres-essentials/PLAN.md), with the
learner's new 15–25 minute budget. Forty lessons is not a target. The old long PostgreSQL route is
not the planning baseline.

## Interview once, then propose

Known preferences: experienced engineer, familiar with Go, Docker and production Kubernetes;
DDIA/OSTEP background; local Linux VM, CLI-first, evenings outside work; no scaffolding homework.
See the [learner profile](../../docs/learner-profile.md). Do not re-interview those facts.

If no topic is named, offer two or three mechanism choices from the saved ideas, with one sentence
on what each makes observable. If a URL/topic is given, focus on it. Ask only missing questions that
change the agenda: which architectural question is interesting, roughly how many evenings, and
any service/resource or coding constraints. One brief exchange is usually enough. A specific request
can already answer the interview. Explain assumptions rather than asking a long questionnaire.

Read the relevant source, using saved research as the starting point. Record a short source digest:
source of truth, derived state, serialization point, partition key, failure boundaries and recovery.
Cite the primary source with bounded locators. Distinguish what it claims from the local mechanism
we propose to test. Validate exact tool/API behavior during authoring. Saved candidate scopes and
survey counts are the learner's supplied planning material, not research independently performed here.

Propose one minimum core path and a small optional extension list. For each candidate lesson answer:

- What systems question does it answer, and why would a working engineer care?
- What meaningful command, configuration, core edit or diagnostic investigation does the learner
  own? What is supplied, what evidence distinguishes outcomes, and what decision becomes possible?
  Prediction, installation or launching a finished helper alone cannot earn a lesson slot.
- What new insight does it add beyond earlier lessons? Combine redundant steps; split overlong ones.

Often a narrow mechanism fits 4–8 lessons; a more involved project may need 8–12. These are planning
heuristics, not quotas or hard caps. Choose fewer whenever the causal story is complete. If the core
is larger, explain why and offer a narrower cut before expanding. Do not convert every item in a
company article into a lesson. Tool-internals gaps get a bounded just-in-time pointer to a separate
tutor, not a new prerequisite course buried in this project.

## Lock in the complete agenda before authoring

Persist `projects/<topic>/PLAN.md` using the plan template and `project.json` with `status: draft`.
The route contains every proposed lesson, stable slug, estimated minutes and observable outcome;
all entries initially have `available: false`. Show it through `systemscoach <topic> route`.

The proposal explains the topology, one or two central mechanisms, explicit invariant, main failure
and recovery, supplied pieces versus learner-owned logic, resource/installation estimates, and final
stopping rule. Count all activity within 15–25 minutes per lesson. Separate one-time dependency
installation estimates so first-run downloads are not hidden in a five-minute setup allowance.

Obtain the learner's agreement to this concrete agenda, as requested in their workflow. Record the
agreement in PLAN.md and set `status: approved`. Only then author the requested first batch, usually
2–3 lessons. Do not automatically take a saved example as approval. Later scope changes need an
updated proposal; straightforward implementation choices within the agreed agenda do not.

## Manual protocol before essential code

Use a recurring tiny dataset. First act out a meaningful operation with native CLIs, inspecting its
state transitions. Introduce the important failure, then use code only where it exposes or tests the
mechanism better. This is a teaching progression, not six mandatory stage-lessons.

Provide connection handling, transport, generated stubs, configuration, fixtures, bounded workloads
and cleanup. Mark the learner's edit boundary: e.g. `Apply(event)`, `ChooseOwner(key, members)`,
`NextState(observation)`, or a WAL record struct plus replay ordering. Define behavior and provide
observable acceptance commands. Every lesson needs a meaningful learner action under the
[learner work contract](knowledge/learner-work.md). Native commands that the learner constructs or
adapts, or diagnostic commands they choose to resolve an uncertainty, count without writing Go;
explaining an ordering alone does not. Go is preferred for code; Deno is second when justified.

Plan time for an attempt, evidence inspection and a small correction. First shorten supplied
demonstrations and remove redundant cases. Add intermediate lessons only when useful work still
exceeds 25 minutes or combines distinct concepts that need separate practice; each added lesson
must have its own learner action and observable result. Do not inflate course length by default.

For a Cursor-inspired project, evaluate a local S3-compatible object store, Git plumbing, an explicit
publication index, optional PostgreSQL metadata, and inspectable protobuf records. Include real gRPC
only if an RPC boundary/failure teaches something in the agreed agenda; supply service/client
scaffolding and use grpcurl/protoc where helpful. Encoding protobuf bytes and transmitting them via
gRPC are separate mechanisms. Do not teach both merely because both appear in an architecture.

The existing roadmap names SeaweedFS as an object-store default; the learner's MinIO-type example
means local object storage is desired, not that a specific implementation is mandatory. Select and
verify the needed semantics at project design time. A local `flock` is not proof of distributed CAS;
if PostgreSQL supplies conditional publication, name it as the authority and a local design choice.
S3 compatibility is not evidence of conditional-write semantics. Uploaded bytes, committed metadata,
notifications and a fresh serving replica must remain separate states in the explanation.

## Batches and stopping

For each requested batch: design, supply scaffolding, author lesson/review, run real experiments,
inspect evidence, clean owned fixtures, publish availability and report the boundary. Follow the
[authoring contract](authoring.md). Keep a temporary project HANDOFF.md if work spans turns; remove
it after the completed batch, retaining its actual validation findings. Read the repository batch
workflow for its commit conventions when authoring; use only owned files in commits.

A project is complete when the learner can explain the invariant, force the important failure,
recover, and state the production tradeoff. A short conversation or mental explanation suffices;
notes and a one-page postmortem are optional. No production readiness, portfolio polish, dashboards,
HTTP API, deployment automation or full-company clone is required. Optional branches never silently
become core prerequisites. A batch review asks whether the lesson was clear, fit the time budget,
and was worth thinking about; adapt the next requested batch accordingly.
