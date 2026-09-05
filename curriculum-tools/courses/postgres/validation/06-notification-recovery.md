# Durable reconciliation after missed notifications acceptance

Primary acceptance, 2026-09-05. Current87 listen-notify-as-a-bus is revision4. A complete standalone
private PostgreSQL16 fixture connects actual listening/publishing psql processes, commits source
work with trigger-generated wake-ups, kills a listener during local processing, and reconciles all
pending work after reconnect. It replaces the previous ending that merely counted rows after a
missed notification.

## Registration, source commit and coalescing

/tmp/pg-notification-recovery-validate.ts executes source core and variation; retained
commands/logs: /tmp/pg-notification-recovery-{core,variation}.{sh,log}. Core root
/tmp/pg-owned-5gboz79r; source variation /tmp/pg-owned-z76_ul88. PostgreSQL16.15,
fsync/synchronous_commit/full_page_writes on, private Unix socket and system identifier are
recorded. No learner server or port5440 is used.

The first listener begins LISTEN but holds that transaction open. Core commits job1/Ada/5 before
registration commits; the variation changes only that publication to just after LISTEN commit. The
listener queries pg_listening_channels after commit and sees work_ready, then executes its initial
durable scan in a fresh transaction. Both paths apply job1 and commit credit5 plus its full
receipt/completion. The core has no job1 wake-up; the variation has one. Committed registration
before the fresh scan covers work on either side of the registration boundary.

An AFTER INSERT row trigger calls pg_notify with the constant work_ready/wake-up pair. A held
publisher inserts job99/999 and queues that signal; independent state remains only done job1, one
receipt and credit5. ROLLBACK discards both job99 and its notification. The next publisher holds
jobs2/3 for amounts7/11; neither rows nor wake-up are visible before its COMMIT. Afterward the
listener receives exactly one new wake-up for two pending jobs because identical channel/payload
calls in one transaction coalesce.

The driver commits unique barrier notifications after each tested sequence, then services the actual
listening psql connection through bounded SELECT round trips until the corresponding barrier
appears. Raw asynchronous notification lines record payload and sender PID. Barriers close the
observed ordered interval and are excluded from work-wake counts; absence is not inferred from a
fixed sleep or a fabricated event marker. A notification becomes eligible at publisher commit;
client delivery and a reader's particular snapshot remain separate boundaries.

## Actual listener loss and complete recovery

The listening client executes process_pending inside BEGIN. It locks jobs2/3, updates credit,
inserts matching receipts and marks the jobs done, returning tentative totals12/23. Its backend is
idle in transaction with an XID (740 in both source runs), while independent reads still show
credit5, only job1's receipt and jobs2/3 pending. SIGKILL kills that actual listening psql process
with exit-9. Backend disappearance and unchanged full inventory prove rollback of credit, receipts
and job completion together. Receiving the earlier notification did not complete the work.

With no other client backend present, jobs4/5 for amounts13/17 commit while no listener exists.
Their trigger wake-up has no subscriber. The replacement commits LISTEN and services a fresh
barrier: zero historical wake-ups are replayed, while jobs2–5 remain pending at credit5. Job6/19
then commits after registration but before the replacement's initial durable scan.

The actual replacement listener scans all pending jobs2–6 and commits five receipts/effects/
completion markers, returning cumulative credits12/23/36/53/72. Only job6's one new work wake-up is
received; missed earlier notifications are unnecessary for recovery. A subsequent redundant wake-up
and a further bounded poll each return an empty processing array, leaving all data unchanged. The
finite driver coordinates these worker scan points; it does not claim to implement an always-running
service or measure polling latency.

Final jobs1–6 are done, with matching customers Ada/Grace/Linus/Barbara/Edsger/Leslie and amounts
5/7/11/13/17/19. Six complete receipts match identity/customer/amount and cumulative credits
5/12/23/36/53/72. Job99 is absent; job and receipt sums both equal credit72. The ten-row batch limit
exceeds this bounded fixture's pending batch; no pending job or waiting lock remains. Receipt,
effect and completion share the same local database transaction. An external service's independent
commit would require the outbox/receiver protocol from current83 instead.

Normal listener exit and server stop/start preserve all data and the cluster identity. A newly
registered listener finds no work and no old wake-ups. All five clients are reaped: first
listener-9, two publishers/replacement/restarted listener0. The private server stops.

## Exact learner commands and independent audit

/tmp/pg-notification-recovery-exact.ts renders copied-catalog pgcoach87 hint2 from
/tmp/pg-observe-progress-y3cym5jg/progress.sqlite into
/tmp/pg-notification-recovery-rendered-listen-notify-as-a-bus.md and executes its exact shell fence.
Log /tmp/pg-notification-recovery-exact-listen-notify-as-a-bus.log; root /tmp/pg-owned-2ej038fw. It
reproduces the full publication-after-LISTEN variation, actual listener loss, five-job recovery,
complete72 reconciliation and restart/empty-scan outcomes.

/tmp/pg-notification-recovery-audit.py independently verifies all three runs' startup timing,
registration output, actual notification counts in raw psql logs, publisher rollback/coalescing,
held processing transaction and killed backend, absent-listener work, zero replay, full recovered
jobs/receipts/credit and unchanged empty scans/restart. All server logs are free of
ERROR/FATAL/PANIC; all three owned servers independently report pg_ctl status3/no PID. Built core
matches executed source modulo the builder's final-newline trim, and the exact rendered hint matches
the executed source variation. Full JSON and raw listener/publisher logs remain beside stopped data
directories.

Scoped /tmp/pg-notification-recovery-scoped-build.py builds92 lessons in
/tmp/pg-notification-recovery-build-3_l8itgz and changes only current87's generated object. The
already-incorporated unrelated storage source is overlaid solely to preserve existing generated
content and is not staged. Stable slug/course revision2, all other91 objects, original first
seven/current completions, capacity semantics and seven reading stops remain intact. Copied
migration preserves all IDs/history/progress; real learner SHA256 remains
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6. Thirty tests and full
format/lint/typecheck pass; logs /tmp/pg-notification-recovery-{tests,check}.log. Specific guide
prompts and complete variation are registered in guides/14-patterns.ts.

## Scope and preserved storage

These controlled publishers use the trigger and the worker uses process_pending. Arbitrary direct
writers could break the relationship among jobs, receipts and credit. The effect is local; no
network partition, packet loss, remote receiver atomicity, queue-exhaustion stress or host power
failure is claimed. The old unbounded queue-pressure challenge is replaced by the bounded
registration-timing variation. Notifications are hints with no disconnected-client replay offset;
the durable table remains the work inventory.

Before these runs, /tmp/pg-notify-archive-evidence.py preserved accepted85 roots
aky4t1rw/41p4bhj6/b8q_7tgt, directories data/participant-b. Stopped/status3, PostgreSQL16 and clean
control state were checked; reopened tar.gz regular-file path/SHA256 inventories matched originals;
stopped state/original hashes were rechecked before removing original data directories. Compressed
images, cold hash/control manifests, cold-archives.json, SQLite coordinator files and all raw
logs/JSON remain. This is verified cold-file preservation, not a tested restore. Current86/87
single-cluster data directories remain intact; about130MB remains after the exact87 run.
