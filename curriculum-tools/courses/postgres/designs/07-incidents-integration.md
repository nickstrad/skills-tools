# Incident diagnosis and final integration contract

Primary sequential work, 2026-09-05. Chunks1–6 are accepted through current87 in a92-lesson catalog.
This is the implementation contract for current88–92 and the remaining whole-course audit, not a
validation claim. Preserve REWORK-PLAN's full scope, the original first-seven built objects, seven
reading stops, stable surviving slugs and learner progress. No delegation or port5440 operations.
Each lesson must be accepted before implementing the next.

## Teaching and execution boundary

These exercises assess investigation, not recall of unfamiliar commands. Default coaching starts
with symptoms, available evidence and a bounded operational objective. Fixture construction and
worked remedies stay accessible to the tutor and available on request. Titles, initial cautions and
initial packets must not disclose the selected cause. Historical slugs remain stable for progress
identity; their wording is not diagnostic evidence.

For88, use a standalone staged controller retained in its uniquely owned directory. Preparation
causes the incident, records actual before/after observations, and stops its private server.
Inspection and recovery each start only that server and stop it in finally. The learner can request
specific supplied diagnostic queries and choose an explicit recovery action. No server waits
indefinitely for an answer. The full source and worked commands remain available; concealment is a
teaching convention, not a security boundary. Validation must execute the stages a learner sees,
including the chosen remedy, rather than treating successful preparation as completed recovery.

Saved samples are labeled with their collection times and stage. A fresh read after restart is
distinct from the original incident window. Do not infer a historical production rate from a later
idle sample or describe restart-induced checkpoint cleanup as remediation during the earlier window.

## Current88 abandoned-slot-fills-the-disk

Replace the disclosed abandoned-slot/four-status walkthrough with a neutral disk-growth incident.
The same diagnostic interface must support three actual conditions: a disconnected WAL consumer,
failed archiving, and increased WAL production without either retention dependency. Capture more
than directory size: current insertion/flush positions, measured interval and committed workload,
segment inventory, slots and their positions/status, archiver success/failure deltas and backlog,
checkpoint information, complete application data and receiver position. Explain which additional
evidence distinguishes hypotheses and what remains unmeasured. Do not make a fake91% disk alert or
use forced segment allocation as if it measured useful WAL bytes per second.

Use a small immutable operation ledger with identity and payload plus an independent receiver whose
committed contents are observable. The core resumes a stopped real consumer from retained history;
verify every missing operation arrives once and later work still arrives. An explicit destructive
recovery variation releases the retention obligation first. Demonstrate the resulting unavailable
tail with an actual new decoding attempt and incomplete receiver contents, then reconstruct from a
consistent complete source snapshot under the fixture's stated writer boundary. Prove a later tail
still works. Releasing files alone is not successful consumer recovery.

The archive alternative must execute a failing archive command, accumulate completed pending files,
repair only the owned destination failure, and verify every selected archived file's bytes before
calling that path healthy. Local copy verification does not claim an off-host or tested restore. The
production alternative must measure actual WAL for fixed batches, change only supplied demand or
write amplification, and measure the changed interval. Compare directory size before/after
checkpoint separately from actual WAL generation. Neither a slot drop nor archive repair addresses
production pressure. No extrapolated capacity claim from this short fixture.

Record action selection before mutation. Reject irrelevant actions without applying their effects.
Diagnosis should be justified from evidence; an internal fixture label cannot substitute for the
learner's account. Validate all three causes, the core recovery, the source variation, exact
rendered hint commands, domain state and stopped processes. Keep the full setup, evidence and
solution paths in the lesson and report. Small1MB segments and bounded workloads prevent intentional
disk exhaustion.

## Current89 corrupt-a-page-and-detect-it

Begin with an observed read/checksum failure. Create a verified baseline backup with a known
complete operation inventory. Stop the owned server before a precisely bounded corruption, preserve
the damaged copy and original bytes, then prove detection using actual reads/checksum evidence.
Restore into a separate owned destination and validate all identities/payloads/aggregates and later
writable operation behavior. Compare the restored recovery point with accepted operations after that
point; state any loss explicitly. Successful startup or a readable index is insufficient.

Keep pg_surgery/zeroing/destructive salvage out of the core. Optional depth, if retained, operates
only on another copy and measures which known data disappears. Preserve the evidence needed to
distinguish structural readability from complete application history. The variation changes one
backup/recovery boundary and proves its effect on recovered operations.

The concrete bounded implementation uses a complete cold filesystem backup of a cleanly stopped
owned cluster, independently verified by full file hashes and an offline checksum scan. The core
backs up500 immutable operations before ten later commits; the variation moves that same backup
after the ten commits. With no later WAL supplied, restoration must explicitly report the core's
missing accepted IDs501–510. Both paths then commit new identity511 and verify every payload and the
derived amount. This revisits the recovery decision without repeating the earlier PITR protocol.

Preparation preserves the page header and changes exactly one known payload byte offline, saves both
page images and the full-file before/after hashes, and captures an actual heap-read/checksum
failure. inspect reads saved evidence; recover restore copies only the verified backup into a
separate destination. No salvage path is retained in this required exercise. Cleanup verifies all
owned clusters stopped and removes the fixture only after findings are recorded; estimated peak
storage is100MB. Author acceptance preserves only evidence needed for the remaining course audit.

## Current90 wraparound-drill

Retain the stable identity as independent diagnosis if a distinct causal experiment can be made;
otherwise explicitly move its repeated threshold tour to optional depth with coverage/prerequisite
and ordinal mappings before retirement. Do not silently remove it. Prefer a bounded vacuum/freeze
progress investigation that requires identifying a horizon dependency and verifying its release,
using the earlier freezing lesson's knowledge. Do not approach real transaction-ID exhaustion or
falsify control/catalog state to simulate a production deadline. Measured tuple/horizon progress and
the effect of the selected remedy must support the explanation.

The retained90 identity now uses a prepared-transaction horizon rather than repeated threshold
burning. One hundred baseline tuples are frozen before a participant prepares a small business
effect; one hundred later committed ledger rows then remain unfrozen through repeated completed
passes and restart. A separately committed SQLite coordinator decision supplies the legitimate ABORT
core or COMMIT variation outcome. Resolution must follow that exact decision, release the horizon,
freeze all200 tuples and preserve the complete ledger; the visible participant effect must match the
chosen decision after another restart. Add the accepted2PC lesson as a prerequisite. The default
packet gives only the observed plateau. No active client need remain between phases, and no real
exhaustion, threshold manipulation or forced anti-wraparound worker is claimed.

## Current91 runaway-query-and-cancel

Present a request deadline symptom and a real active query/wait inventory. Require correlation by
owned PID/application identity before intervention. Distinguish lock wait, running statement, idle
transaction, query cancellation and session termination through actual transaction/session/data
outcomes. Reuse earlier deadline mechanisms as prerequisites, not another introductory timeout tour.
The learner chooses the least disruptive action that meets the supplied request budget and proves
what rolled back, what remains committed, and whether a lock/session still exists. The variation
changes one transaction boundary. Never cancel arbitrary host backends.

The concrete91 fixture separates a short live survey from a fresh policy trial. Survey observes an
actually incomplete response after2s, captures exact PID/application identities, waits/blocking
PIDs, row locks, full committed data and Linux backend CPU deltas, then explicitly terminates its
owned actors and stops. Inspection is offline. Application creates new actors and validates the
chosen cancel-request or terminate-request policy within2s from dispatch to client response; it
never acts on the historical survey PIDs. Survey cleanup and later comparisons are explicitly
outside that policy's measured outcome. This avoids leaving an incident running while the learner
reads.

The request first inserts note2, then waits on an idle holder's tentative balance update. Core puts
both request statements in one explicit transaction; the source variation changes only that boundary
to autocommit. An independent computational client has tentative note3. Verify57014, core25P02 then
rollback/same PID, or autocommit00000 and preserved prior note2; termination must produce57P01 and
backend absence. The holder/computation must remain untouched by the request intervention. Later
bounded comparisons prove idle cancellation leaves the holder's row lock, computational cancellation
preserves its session after rollback, and holder termination rolls back999 and releases the lock.
Reconcile complete notes/payloads and balance100; record client exit codes, server stop and actual
cleanup. A null wait is not CPU proof; use /proc CPU tick deltas. Timeouts bound the fixture but are
not a repeated timeout demonstration or a claim of production capacity.

## Current92 postmortem-from-the-log

Finish with a supplied bounded task-runner workload integrating accepted identities, claims,
business effects and durable recovery. The deliverable is a complete operation history plus a causal
incident account and measured capacity decision. Record operation identity/payload, attempt, client
outcome (including unknown response), transaction/receiver outcome and recovery disposition. Inject
an actual process-loss boundary and recover pending/unknown work. Reconcile every accepted, rejected
and retried operation with final business state; no printed publication or row-count-only substitute
for an independent effect.

Measure a controlled baseline and a changed demand/concurrency condition with fixed workload,
bounded run, actual latency/throughput/backlog and resource/wait evidence. State saturation or lack
of saturation from the observed trial; do not invent a production SLO or universal capacity number.
Use logs/waits as supporting evidence joined to the operation timeline. Require the learner to
defend one capacity/remediation choice and its correctness/recovery costs, with runnable hints and a
worked reconciliation available. Distinguish client loss, database loss and shared-host limitations.

The concrete92 workload uses PostgreSQL for immutable accepted requests, short durable claims and
permission-guarded local completion. An independent SQLite receiver commits an immutable receipt and
a credit mutation atomically with FULL durability. Its single-host/process boundary is explicit;
this is not a claim of independent host availability or physical replica testing. Retry identity and
payload are retained for the whole fixture. Worker roles cannot directly mutate guarded tables.

Kill an actual admission process after its PostgreSQL commit and before its reply, recover that
unknown outcome by stable identity, and reject a different payload. Kill an actual worker after
receiver commit but before guarded source completion; vary only that loss boundary to before the
receiver effect. Crash/restart only the owned PostgreSQL process and reconcile every accepted
request. Wait for a real bounded lease deadline, reclaim in a new generation, reject the old
completion, replay the receiver idempotently and drain every accepted request. Disconnect an actual
LISTEN client before new committed work; reconnect/register, verify a notification barrier and scan
durable pending state. Receipt reads use an explicit fresh-receiver identity/payload gate: bounded
not-ready before delivery and a verified result after it, never unconditional freshness.

The same supplied worker loop then runs matched fixed-count arrival schedules: low offered rate,
high offered rate, and the same high rate with another worker. A small exact admission cap makes
queue-full rejection a measured bounded outcome. Record every scheduled/admitted/rejected identity,
producer lateness, acknowledgement/end-to-end latency, completed throughput, backlog, PostgreSQL
wait/CPU/WAL and receiver contention/service observations; include drain time and harness overhead.
Repeat the small comparison, preserve full operation histories and reconcile every accepted effect.
The receiver intentionally serializes a fixed service interval inside its commit transaction, so
additional source workers may increase waiting without increasing useful service capacity. The
learner must defend admission/concurrency from these measurements, not a universal sizing claim.
Logs and source system identifier/timeline/recovery positions support the causal account; no
promotion or history-file artifact is fabricated when this tested crash does not create a branch.

## Acceptance and final audit

Author curriculum/*.ts and specific guides/15-incidents.ts; register the guide. Build lessons.json
from source in a scoped checkout that preserves the unrelated storage edits. Keep course revision2,
changed surviving lessons revision4 and new identities revision1. Run core, source variation and
exact rendered hint commands against real PostgreSQL, inspect errors and full outcomes, verify all
owned clients/servers stopped, and record evidence/limits in validation and indexed knowledge.

Integrate88–92 only after individual acceptance. Then refresh PLAN, ordinal/retirement mappings,
canonical reading/checkpoint references, course docs and installed wrapper. Audit the entire
resulting course against REWORK-PLAN and the prior project review, including the inherited earlier
idle insertion/replay and abort-only WAL-flush boundary checks. Copied-progress migration must
preserve identities, notes, history, first-seven current completions and seven stops while the real
learner database hash remains unchanged. Run full format/lint/type checks and engine tests; examine
coverage before claiming completion. Fetch, commit only owned changes and push without force.

Preserve explicitly identified stopped evidence before allocating additional clusters when disk is
tight. Reopen cold archives and verify the complete regular-file path/hash inventory, then recheck
stopped state and original hashes before removing original data directories. Keep logs, manifests
and independent decision stores. Archiving is not a tested restore. Record progress and remaining
requirements in handoff.md at each implementation/validation/commit boundary; the full goal remains
active until the final audit proves completion.
