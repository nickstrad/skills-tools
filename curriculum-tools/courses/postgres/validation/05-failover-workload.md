# Promotion and controlled cutover acceptance

Primary acceptance, 2026-09-05. Current75 promote-the-standby is revision4. Every full script runs
an unsafe promotion and a separate controlled cutover on independent fresh owned pairs. The
variation changes only controlled-candidate freshness before the last acknowledged source write.

## Live evidence

Core: /tmp/pg-failover-workload-core.log; unsafe root /tmp/pg-owned-t2xtc3no, controlled root
/tmp/pg-owned-zgfepid6. Variation: /tmp/pg-failover-workload-variation.log; unsafe root
/tmp/pg-owned-b9qjbf23, controlled root /tmp/pg-owned-yhqkvigw. Driver:
/tmp/pg-failover-workload-validate.ts; scripts /tmp/pg-failover-workload-{core,variation}.sh. Roots
retain client acknowledgement/receipt inventories, promotion/history evidence, rejected writer
probes and actual basebackup/server logs. All servers stop and slots are removed.

Unsafe: baseline receipt0 is copied and applied, then actual sender/receiver disconnect after
primary_conninfo is cleared. Source receipt1 acknowledges before promotion without reaching the
candidate. Promotion creates timeline2/history parent1 at0/A00090 and leaves the old source writable
on timeline1. Old receipt2 and new receipt3 both acknowledge. Complete independent sets are old
IDs0,1,2 and new IDs0,3, with matching expected payloads. Both report recovery=false and share
system identity. Choosing either branch alone omits acknowledged work on the other; no
reconciliation or physical deletion of the retained evidence is implied.

Controlled: a new pair acknowledges source receipts0,1, closes driver admission and rejects a routed
probe. ALTER ROLE app_writer NOLOGIN plus zero existing app sessions closes the application's source
login path; an actual direct insert fails with role not permitted to log in. The candidate must
match system/history/recovery role, reach0/A00B50 and contain the exact source inventory. The
consumed slot is detached/dropped while source remains live. Source then stops, its PID file is
absent and a direct old-endpoint insert fails connecting before promotion begins.

Promotion creates timeline2/history parent1 at0/A00BC8. Driver authority advances to epoch2 and
candidate endpoint; app_writer LOGIN is enabled only there. The old token returns stale_authority
with zero database attempts. Current authority acknowledges receipt2; complete new inventory equals
all three acknowledgements and no probe ID90–93 appears. The old server remains stopped.

Variation pauses actual replay before source receipt1. Initial candidate has only receipt0 at
0/A00090, below0/A00B50, and the gate refuses it. Resume/replay/inventory readiness precede the same
writer-exclusion and cutover gates. This is an actual refusal followed by catch-up, not a
sleep-based assumption of freshness.

## Integration and limits

Exact current75 copied-catalog hint2: /tmp/pg-failover-workload-rendered-promote-the-standby.md.
Output: /tmp/pg-failover-workload-exact-promote-the-standby.log; unsafe root /tmp/pg-owned-g3ug_l0m,
controlled root /tmp/pg-owned-6986vsaj. It repeats both scenarios, all acknowledgement/inventory,
lagging-candidate refusal, role/endpoint/token rejection, promotion/history and cleanup assertions.

Thirty tests/full check pass in /tmp/pg-failover-workload-{tests,check}.log. Scoped builder
/tmp/pg-failover-workload-scoped-build.py changes only current75.93 lessons/seven stops, first seven
and capacity remain intact. Fresh copied catalog /tmp/pg-observe-progress-rsc6n738/progress.sqlite
preserves IDs/progress/attempts. Learner hash
remains395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

The driver owns every application client and no supervisor restarts the old server. NOLOGIN does not
kill existing sessions, so zero-session verification matters. The in-memory epoch illustrates
admission policy; actual local role exclusion/process stop supplies this fixture's fencing. No
distributed election, durable lease, production fencing across arbitrary restart, or zero-loss
failover from an unreachable asynchronous primary is claimed. Unsafe transport is disabled rather
than merely pausing apply, because promotion can replay already-received WAL.

Next: current76 rewind-the-old-primary. Preserve divergent acknowledged-receipt evidence, choose one
authoritative history, fence/stop the old writer, execute actual pg_rewind with supported
prerequisites, rejoin as standby and classify the discarded old-branch acknowledgements. Chunks5–7
and final audit remain active.
