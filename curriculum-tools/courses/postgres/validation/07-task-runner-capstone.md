# Task-runner capstone acceptance

Primary acceptance, 2026-09-05. Current92 preserves `postmortem-from-the-log` at revision4,
replacing log extraction as the sole deliverable with correctness/recovery/capacity integration.
Logs and system/timeline/LSN coordinates remain supporting evidence. The whole-course audit, final
outline, reading/identity/docs integration and final resource cleanup remain required.

## Actual core, variation and exact hint

| Trial                                   | Original root            | Worker loss boundary   | Total accepted / rejected load | Receiver credit |
| --------------------------------------- | ------------------------ | ---------------------- | ------------------------------ | --------------- |
| Current source core and all inspections | `/tmp/pg-owned-dm47etpt` | after receiver commit  | 65 / 35                        | 525441          |
| Current source variation                | `/tmp/pg-owned-zas0ux9a` | before receiver commit | 65 / 35                        | 525455          |
| Exact rendered hint2                    | `/tmp/pg-owned-b2z_objr` | before receiver commit | 66 / 34                        | 533232          |

Accepted totals include the four recovery requests plus admitted load requests. Each trial offers96
load identities; admission scheduling determines the exact accepted subset and therefore the amount.
Core/variation differences in load timing are not attributed to the earlier worker-loss boundary.
The complete measured comparison is retained in
[07-capstone-outcomes.json](07-capstone-outcomes.json).

An admission child actually commits ID2 and closes its PostgreSQL client, then is killed before its
application reply. A matching retry returns replayed; a changed payload is rejected. A worker child
commits ID1's generation1 claim and is killed either after or before receiver commit. Both child
exits are-9, recorded at the observed marker. The markers are investigator evidence, not application
replies or simulated publication.

Immediate stop/restart of the owned PostgreSQL process produces interrupted/redo log evidence and
preserves every pre-crash source/receiver row. System identifier/timeline remain the same; no
promotion/history branch is claimed. Recovery waits for the actual700ms lease deadline, claims ID1
in generation2 as worker_b, rejects worker_a's old completion and independently rejects direct
worker DML with42501. Core receiver retry adds zero new effects; the before variation adds one. All
recovery IDs1–4 end with exact amount7*id, payload task/id, one receipt/result, done jobs and
credit70.

The original LISTEN client's actual backend disappears before requests commit. The reconnected
listener commits LISTEN and receives only the later barrier notification. Its fresh durable scan
finds all four unfinished jobs and drains them. ID2's fresh receiver receipt gate returns bounded
not-ready before delivery, then its exact stored receipt after delivery. This is the chosen receiver
freshness contract, not a physical standby or unconditional read guarantee.

## Capacity and defensible decision

The identical16-request workload runs twice at4/s/one-worker,80/s/one-worker and80/s/two-workers.
Admission cap6 and receiver service60ms stay fixed. Each arrival retains its scheduled, actual-send
and response times; worker completion does not reschedule offered demand. Both offering and drain
are bounded, and producer lateness is reported. The receiver's serial writer interval is deliberate.

All six4/s trials admit16 with no queue-full rejections and completed throughput about4.15–4.17/s.
Every80/s trial rejects8–9, admits7–8 and keeps maximum backlog at6. One-worker overload throughput
is about9.73–12.00/s; two-worker throughput9.48–11.98/s. Extra workers do not consistently improve
useful throughput and increase receiver acquisition waits from about1ms to0.13–0.63s. End-to-end
p95s include scheduling and queueing; the small low-rate exact-hint sample has a0.58s tail.

The full per-trial measurements retain exact identities, acknowledgment latency, schedule-to-result
latency, max producer lateness, offering/drain time, backlog samples, PostgreSQL
state/waits/blockers, backend CPU/residency, WAL per completed operation and receiver lock/service
times. These costs include Python, psql, diagnostic fsyncs, monitoring and the shared filesystem. Do
not substitute these measurements for a production capacity number or attribute receiver contention
to a PostgreSQL lock snapshot.

A supported local decision is to retain bounded admission and one worker while the serial receiver
service remains unchanged. Moving to higher offered demand requires reducing that service constraint
or deliberately accepting the measured rejection/queueing costs. The learner must defend that choice
from both repetitions, reconcile all accepted obligations and state what further workload evidence
would justify a different policy.

## Independent verification

`/tmp/pg-capstone-audit.py` read the actual SQLite database with integrity_check and reconstructed
complete identities/payloads/amounts and cumulative stored results. It joined every history
admission, claim, receiver commit and completion to source requests/jobs/results; every accepted
identity has exactly one effect and every queue-full identity is absent. The only rejected
completion is ID1's old generation. It distinguishes the changed-payload rejection on existing ID2
from absent load IDs.

The audit then started each identified stopped PostgreSQL cluster, made fresh read-only comparisons
of all three actual tables against the saved final inventory, checked worker table/schema privileges
and API function restrictions, and stopped normally. Every registered client/child was absent. The
only ERROR/FATAL/PANIC line in each experiment server log is the intended jobs permission denial;
all other SQL/driver operations succeeded. Final normal restart inventories were equal before this
independent read. Source/core/variation/exact rendering correspondence also passed.

Drivers/scripts/logs use `/tmp/pg-capstone-{validate,exact,render-audit,audit,build}` prefixes.
Executed scripts are `pg-capstone-{core,variation}.sh`; exact hint/log are
`pg-capstone-rendered-postmortem-from-the-log.md` and
`pg-capstone-exact-postmortem-from-the-log.log`. Build changed only92 among92 and removed its scoped
snapshot. Thirty tests/full checks pass in `pg-capstone-{tests,check}.log`. Copied progress is
`/tmp/pg-observe-progress-7vuwt4yl/progress.sqlite`; first7, IDs/history/progress, capacity
semantics and seven reading stops are unchanged. Real learner SHA256 remains
`395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`.

## Lifecycle and limits

All three accepted roots are fully archived, reopened and compared against complete file hashes,
then original hashes/stopped state are rechecked before executing the supplied cleanup command. The
three archives total14,923,052 bytes and replace about98MB of raw accepted state. The additional map
is `/tmp/pg-capstone-compacted.jsonl`, under the existing final-audit retention policy in
`/root/pg-validation-evidence/20260905/`. Failed/superseded prototypesa6jwlhbz/siafy6om/
_69ibu9z/95bwjd3v retain only small verified forensic records; their databases are removed. No
author process remains and free disk stays about16GB. Retire the remaining bulky images after
whole-course audit, before overall completion.

The capstone tests specified process-loss and local crash/retry boundaries with trusted workers. It
does not test power failure, networking, consensus, multi-host availability, physical replica
freshness, adversarial external acknowledgement or general fairness. Guarded source completion and
receiver deduplication are distinct protocols; the local generation is not an external-resource
fence. SQLite FULL is a configured setting, not proof of untested storage behavior. Exact production
SLOs, future offered workloads and universal worker counts remain outside the measured contract.
