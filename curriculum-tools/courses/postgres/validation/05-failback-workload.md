# Controlled failback and optional cascade acceptance

Primary acceptance, 2026-09-05. Current77 cascading-and-failback is revision4. A fresh owned
topology executes original → replacement → original writer transfers. Required failback and cleanup
run in both scripts; the variation adds a real third hop before the return.

## Live evidence

Final source core: /tmp/pg-failback-workload-core.log, root /tmp/pg-owned-te_w81me. Final source
variation: /tmp/pg-failback-workload-variation.log, root /tmp/pg-owned-ffbmemhv. Driver:
/tmp/pg-failback-workload-validate.ts; scripts /tmp/pg-failback-workload-{core,variation}.sh.
Initial prototypes also passed at /tmp/pg-owned-7a_3mv0o and /tmp/pg-owned-jit_b4m7; final runs use
the shared ready predicate for both stale refusal and transfer readiness.

Outbound: original writer acknowledges ID0, then admission closes. A routed probe is rejected
without a DB attempt. NOLOGIN plus zero existing app sessions excludes source app access; direct
login actually fails. Candidate identity/history and replay through 0/A00970 plus complete ID0
inventory establish readiness. Detach receiver and drop owned_standby before stopping the source.
Its PID file is absent and direct endpoint access fails before promotion to timeline2. Epoch1 is
rejected without a DB attempt, and replacement receipt1 acknowledges using epoch2.

The stopped original directory is retained as retired-original-primary. A complete new backup from
the replacement, manifest-verified before configuration edits, rebuilds its original data path as
owned_failback on timeline2. A direct application INSERT fails25006/read-only. After actual replay
pause, receipt2 acknowledges on the replacement. Candidate remains in recovery with IDs0,1, below
0/C00250; the shared ready predicate refuses it while source IDs are0,1,2. Resume and the same
predicate establish complete catch-up.

Return: admission closes again and NOLOGIN/zero app sessions/direct login failure exclude old
application writers. The new closed-writer marker is0/C00C80; exact IDs0,1,2 agree in the expected
source and candidate history. Receiver detach and slot release precede replacement shutdown, and a
direct failed endpoint probe precedes original-node promotion. Epoch2 is rejected; timeline3 history
contains parents1 and2, and all acknowledged receipts remain. Clearing all owned auto.conf overrides
leaves comments only and zero slots. Stop/restart proves original socket, recovery=false, timeline3,
empty receiver/synchronous-standby settings and no standby.signal. Receipt3 acknowledges after
restart; final IDs0,1,2,3 and every note exactly equal all four acknowledgements. Probe99 is absent.

Optional variation: a real manifest-verified basebackup from the recovering middle node creates the
leaf through owned_cascade on that middle node. The later receipt2/0/C00250 boundary reaches all
three nodes. Middle recovery=true plus its receiver from the replacement and sender to owned_cascade
prove forwarding without promotion. Leaf receiver identifies the middle socket and timeline2; the
replacement has only its owned_failback sender. All inventories are exactly0,1,2. Stop leaf and drop
its inactive slot on the middle before executing the same return contract.

## Integration and limits

Exact current77 copied-catalog hint2: /tmp/pg-failback-workload-rendered-cascading-and-failback.md.
Output: /tmp/pg-failback-workload-exact-cascading-and-failback.log; root /tmp/pg-owned-in2478ql. It
repeats the optional cascade, stale refusal, both writer-exclusion gates, timeline3 restart,
complete acknowledged receipts and cleanup. Final source and exact roots have no server PID files or
remaining replication slots, including in the preserved original directory and optional leaf.

Thirty tests/full check pass in /tmp/pg-failback-workload-{tests,check}.log. Isolated builder
/tmp/pg-failback-workload-scoped-build.py changes only current77 among 93 lessons. First seven,
capacity and seven reading stops remain intact. Copied catalog
/tmp/pg-observe-progress-9sptk_w9/progress.sqlite preserves IDs, progress and attempts; learner hash
remains395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

The source is reachable, every application client is driver-owned and no supervisor restarts an
excluded node. In-memory epochs demonstrate admission, with actual local role/process exclusion;
they are not durable authority or an external election service. Readiness precedes detachment after
app admission closes, so no later shutdown-WAL transport guarantee is needed. The original node is
explicitly rebuilt from a full backup; rewind was executed separately in current76. Cascading is
asynchronous, and the optional leaf is stopped before promotion; no synchronous leaf acknowledgement
or automatic leaf continuation across failback is claimed. Evidence directories are retained rather
than deleted; the learner cluster is never reset.

Next: current78 decode-the-log, then the remaining logical delivery/bootstrap/conflict/retention
work in design05, durable protocols, incidents and the final whole-course audit.
