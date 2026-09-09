# Cursor: Git at any scale — project roadmap

Status: **approved** on 2026-09-09. Nick accepted the agenda by requesting the first three lessons.
Batch 1 (lessons 1–3) is available after real validation.

## Question and scope

**When does a Git update become authoritative, and when is a replica safe to read?**

Use the learner-selected [Cursor article](https://cursor.com/blog/git-at-any-scale#continuity)
to connect object storage and database-style reasoning to a working Git data path. The
[source digest](docs/sources.md) separates the article's claims, documented APIs, and our proposed lab.

Two core mechanisms: conditional publication of durable payloads, and replay with a freshness
check before serving. This gives an end-to-end explanation of why local repositories can become
disposable caches. It also exposes the cost of cold reconstruction. Prior DDIA and PostgreSQL
experience supports short conceptual reminders; Git object/ref internals receive explicit teaching.

Proposed invariant:

- The per-repository index defines an ordered history. Every published entry references payloads
  uploaded successfully before publication; an upload alone is not an accepted update.
- Each operation ID appears at most once in that history. Publication checks both the index version
  and the operation's expected old branch tip. A CAS retry cannot silently overwrite a branch conflict.
- A replica's applied position never exceeds the Git state it has installed. A guarded read captures
  an authoritative index version, applies that prefix completely, and serves that version under a
  local read/apply guard. Later concurrent writes may follow the read's index observation.
- If the index cannot be checked or a required payload cannot be fetched, the guarded read fails
  within a timeout. It does not claim freshness from a notification or a cached timestamp.

The lab retains all published history. Its process-failure experiments assume the local object
store survives; they do not demonstrate independent-host availability or cloud durability.

## Topology and ownership

```text
supplied tiny commits and packs
            |
     writer A / writer B  <---- read latest index; validate expected old ref
            |
            +-- PUT immutable pack + operation record
            +-- PUT repository index with If-Match  <-- publication point
            |                         |
            |                   local SeaweedFS S3
            |                   payloads + index = authority
            +-- best-effort wake-up    |
                                      +-- ordered replay --> bare Git replica A
                                      +-- ordered replay --> bare Git replica B

guarded read --> check index --> catch up to captured version --> Git read
```

One repository is the publication/ordering unit. Use one branch initially and unique operation IDs;
the concurrency fixture may add a second branch to contrast independent updates with a same-branch
conflict. No service accepts ordinary network `git push`: a supplied adapter exposes the relevant
pack/ref operation directly so the lesson stays focused.

SeaweedFS 4.46 is the selected local object store, matching the broader roadmap. Its official
[conditional-operations documentation](https://github.com/seaweedfs/seaweedfs/wiki/S3-Conditional-Operations)
describes atomic conditional writes and conditional reads. The first authoring batch checks those capabilities
on the exact lab configuration; see [validation](validation/batch-1.md). Do not substitute a local
`flock` for object-store CAS. If backend validation fails, revise the backend choice explicitly;
PostgreSQL publication would change the authority and requires a stated design revision.

Proposed inspectable format: immutable JSON operation records with repository ID, operation ID,
pack key/checksum and expected-old/new ref values; a small index with monotonically increasing
generation and ordered record keys. Generation changes prevent identical index bodies from being
reused as an old logical state. The index is deliberately bounded and rewritten in full for this
tiny workload. ETags are opaque conditional tokens, not payload integrity checksums.

Supply fixture generation, Git pack/ref commands, object-store launch/configuration, request signing,
barriers, crash hooks, notification suppression, inspection and teardown. Start with `git`, `curl`,
`jq` and checksum commands. Introduce a small supplied Go helper for retry/replay coordination when
manual steps become distracting. Learner choices concern publication order, retry classification,
`Apply(entry)` and read admission; code edits are optional with hints and worked solutions.

Go is the default for essential code. JSON makes the application log directly inspectable. Real
gRPC and protobuf add no necessary failure boundary here, so they remain optional comparisons.
Local locking may protect each replica's replay/read operation; it is not the shared authority.

## Agenda and time

The canonical ordered route is [project.json](project.json):

```sh
systemscoach cursor-git route
```

Eight lessons, **175 minutes total** (2 hours 55 minutes), each 20–25 minutes including explanation,
setup, prediction, execution, review and cleanup. Allow roughly four evenings of two lessons, or
eight short sessions. One-time dependency installation adds an estimated 10–20 minutes, depending
on download speed; it is not a lesson. These are design estimates pending real validation and feedback.

The sequence first separates Git payloads from refs, then payload upload from shared publication.
Publication races teach ordering; lost replies teach uncertainty about an already ordered operation.
Replay establishes derived state; interrupted replay adds the separate local-progress boundary.
Read admission then uses that state safely, and eviction/rebuild closes the architecture's recovery
claim. None is an installation-only or boilerplate-writing slot.

Proposed batches: **1–3**, then **4–6**, then **7–8**, only as requested. The first batch ends with
the real publication race. Later steps stay planned. Each lesson gets a deterministic starting
fixture so prior lesson data or shell variables are not prerequisites. After a batch, briefly check
clarity, actual time and learning value before the next requested batch.

## Intentional omissions and optional extensions

Core omits production Git hosting, smart-protocol plumbing, authentication, Kubernetes, custom
consensus, multi-region deployment, object-store internals, throughput claims and routine Git usage.
The title is motivation, not a promise to reproduce Cursor's production scale in a tiny VM.

Optional follow-ons, outside the eight-step route:

- **Compaction and retention:** publish a compacted baseline, rebuild from baseline plus tail,
  and identify which recovery targets deletion would invalidate. This needs its own bounded scope;
  core rebuilds never delete history.
- **Rendezvous placement:** change a tiny node set and measure remapping/cache misses without
  changing publication authority. Placement is an efficiency decision, not a correctness prerequisite.
- **PostgreSQL authority comparison:** move conditional publication into a private database and
  compare the cross-store failure boundary. Cursor's described design does not use this database.
- **Protobuf or gRPC:** add only if inspecting schema evolution or an actual RPC failure is the
  selected question; supply all encoding/transport scaffolding.

## Lab budget and lifecycle

Planning preflight on 2026-09-09: about 16 GB filesystem space and 6.8 GiB memory available; inodes
8% used. Git 2.43.0, Go 1.26.8, curl and jq are installed. `weed` is not on PATH. No dependencies
were installed and no project service was started to create this roadmap.

Batch 1 lab: SeaweedFS 4.46 in one process using `weed server -filer -s3`, plus tiny bare Git
fixtures and independent curl clients. All eight TCP listeners are bound to loopback: HTTP
18333/19333/18888/18080 and gRPC 28333/29333/28888/28080. The launcher refuses occupied ports.
The documented `mini` mode was trialed but its admin listener behavior did not fit this lab;
[shared findings](../../docs/knowledge/object-store-git-labs.md) record the measured reason.
Native CLIs suffice for these three lessons; supplied shell scripts handle fixtures and lifecycle.
Go remains the default when later replay/coordination logic needs code.

Limit the fixture to at most 20 small commits, 30 publication attempts and 10 MiB source payloads.
Budget **2 GB peak disk and 1.5 GiB memory** for installation/download copies, store metadata and
volume allocation, retained WAL/packs, both replicas, a temporary rebuild and logs. This is a
planning ceiling: the launcher sets 16 MiB volumes, at most eight, with preallocation disabled.
Keep at least 2 GB free and more than twice the expected fixture footprint; current headroom permits
this proposal. Avoid retaining both an image and redundant extracted installations.

Each run owns `/tmp/systems-cursor-git-<unique-id>/`, with recorded PIDs, ports and a manifest.
Each lesson supplies cleanup even at its 25-minute cap. Stop owned processes and remove disposable
state at validation checkpoints; recreate from fixtures next time. No persistent stopped cluster is
needed. Keep concise validation logs only, not packs or database images after acceptance.

Preserve `/labs/pglab`, all learner progress and unrelated sessions. Final batch checks must confirm
the learner lab responds, progress is unchanged, no owned process remains and disk headroom returns.

## Final evidence and stopping rule

The final small scenario contains a winning publication, a rejected conflict, an uploaded orphan,
an uncertain client reply and a dropped notification. Inspect the published operation history,
index generation/ETag, each replica's applied position, refs and reachable content. Rebuild both
local copies from the retained authority and compare them at the same captured index version using
`git show-ref`, object inspection and `git fsck`.

A negative control withholds one required published object in a disposable fixture: reconstruction
must stop, making the surviving-authority assumption visible. Capture object requests/bytes and
elapsed time for cold versus warm reads without inferring production scaling from tiny timings.

Stop when the learner can explain the publication point, recover the interrupted operations,
distinguish notification from freshness, and explain the cold-start/authority-availability tradeoff.
A brief mental or spoken reflection is enough; no report, quiz or completion gate.

## Agreement and batch history

- 2026-09-09: Nick requested a systems curriculum roadmap for Cursor's “Git at any scale.” This
  selects the topic and authorizes this draft; it does not approve a previously unseen sequence.
- 2026-09-09: Nick said “start making first 3 batch,” approving the proposed agenda and authorizing
  lessons 1–3. He also requested top-level course discovery and Bash command availability.
  Lessons 4–8 remain planned.
- Roadmap checks and final resource state: [planning validation](docs/planning-validation.md).

- Batch 1 completed 2026-09-09: lessons 1–3 published after rendered-command and independent
  backend checks. [Evidence and cleanup](validation/batch-1.md). Feedback on clarity, time and
  learning value is invited when Nick tries the batch; lessons 4–8 remain planned.
