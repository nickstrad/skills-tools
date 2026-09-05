# Logical apply conflict and reconciliation acceptance

Primary acceptance, 2026-09-05. Current81 conflicts-stop-the-apply-worker is revision4. Source,
variation and exact learner hint execute independent PostgreSQL16 source/subscriber processes with
actual uniqueness/schema errors and complete recovery. Course remains92 lessons/seven reading stops.

## Executed failures and recovery

Driver /tmp/pg-logical-conflicts-validate.ts, raw /tmp/pg-logical-conflicts-{core,variation}.log and
scripts /tmp/pg-logical-conflicts-{core,variation}.sh. Final core root /tmp/pg-owned-_z7_bt4a;
source variation /tmp/pg-owned-w80452ub. Initial copied IDs1,2 plus a new10 receipt agree before the
failure. Different system identifiers, private sockets and explicit target schema prove independent
server state. Subscription uses copy_data=true, streaming=off, disable_on_error=true and local
synchronous_commit=on. This deliberately observes stable disabled state rather than a retry loop.

Subscriber-local600/value999 collides with source600/value77. The source transaction first updates1,
deletes2 and inserts610. Actual23505 rolls back all its apply effects: target1 stays0,2 remains, 610
is absent and600 keeps its local value. Worker disappears, subenabled is false, source slot is
inactive and apply_error_count becomes1. Source601/602 commit while origin0/88AF00 and source
confirmation0/88AF80 stay fixed. Target lacks both later rows; full discrepancies and WAL byte
interval are saved in uniqueness_backlog.json. No source COMMIT waits for this asynchronous apply.

The first prototype /tmp/pg-owned-vl7_sfvp failed a mistaken boundary assertion: log finished-at
0/88B158 matches the source XID737 COMMIT start, not end0/88B188. It cleaned up and preserved that
failure. Accepted code checks this actual relationship and uses the logged start for SKIP; applied
receipts are gated by their physical COMMIT end. Schema XID742 likewise logs start0/8900B0 rather
than end0/8900E0. No direct origin-advance alternative is executed or recommended as an equivalent.

Both recovery policies first save local600 in local_conflict_evidence. Core deletes the collision
from the replicated table and enables apply; the whole source transaction and backlog replay. The
variation first executes SKIP at the verified logged finish and enables. Origin reaches0/88B318 and
601/602 exist, but exactly1,2,600,610 differ: old update, extra deleted row, wrong collision payload
and missing non-conflicting insert. Counter remains1. With apply disabled and driver-owned source
writes paused, one target transaction deletes2 and upserts the inventoried authoritative1,600,610.
Full equality is required before enabling again. Both paths require a fresh700 receipt after repair.

Source-only ADD COLUMN priority leaves the subscriber without it, verified in information_schema.
The next transaction updates1 and inserts800 using that column. Actual55000 reports the missing
replicated column and disables apply. Source801 commits behind it while origin0/88B3E8 and
confirmation0/88FF98 stay fixed;800/801 are absent and target1 retains its old note. Matching
subscriber ADD COLUMN then ENABLE recover both retained transactions. A newly committed900 passes
its COMMIT-end/origin gate and full comparison. Final IDs1,10,600,601,602,610,700,800,801,900 and
all payloads agree. Source1 has value7/priority7;800 priority8 and801 priority9. Local600/value999
survives only in its evidence table. Cumulative apply errors2/sync errors0 are the expected final
result.

## Exact commands and integration

/tmp/pg-logical-conflicts-exact.ts renders copied-catalog pgcoach81 hint2 into
/tmp/pg-logical-conflicts-rendered-conflicts-stop-the-apply-worker.md and executes that exact bash
fence. Log /tmp/pg-logical-conflicts-exact-conflicts-stop-the-apply-worker.log, final root
/tmp/pg-owned-r5f69hzt. It repeats all four skip discrepancies, explicit reconciliation, schema
failure/repair and full final ten-row agreement. Each final pair is verified stopped with pg_ctl
status3 and no replication slots. Subscriber logs have exactly the expected23505/55000 errors;
source logs have no unexpected errors. Scripts drop subscription/publication/slots before shutdown.

Scoped builder /tmp/pg-logical-conflicts-scoped-build.py changes only current81 among92 built
objects, preserving current80 and every unrelated lesson. Source/guide registration and PLAN match
the final experiment. Copied migration via /tmp/pg-bootstrap-progress.py preserves IDs, progress,
attempts, seven completed first lessons and seven reading stops. Copy:
/tmp/pg-observe-progress-5eo2uxqo/progress.sqlite. Learner SHA256 is unchanged:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6. Thirty tests/full
formatting/lint/typecheck pass in /tmp/pg-logical-conflicts-{tests,check}.log.

The variation changes only uniqueness recovery policy; the workload and later schema recovery stay
the same. These are single-host processes with driver-owned writes and declared source authority.
Reconciliation covers a known transaction inventory while writes/apply are paused, not arbitrary
concurrent multi-writer repair. WAL byte distance is not exact retained disk usage. Error counters
remain cumulative, and advancing origin does not by itself establish consistency. Durable findings:
docs/knowledge/postgres-logical-evidence.md. Next: current82 logical retention, slot-state loss and
actual resnapshot/reconciliation, then chunks6–7 and final audit.

## Space maintenance

/tmp/pg-conflicts-archive-prototypes.py archives only superseded corrected bootstrap prototype pairs
/tmp/pg-owned-f6dv1lv1 and /tmp/pg-owned-aq8062et. Every original data/subscriber directory was
PostgreSQL16, stopped with pg_ctl status3/no PID and clean control state. Exact regular-file
path/SHA256 maps matched reopened cold.tar.gz archives and rechecked originals before original
folders were removed. Per-root cold-archives.json, per-directory hash/control manifests and all raw
logs/JSON remain. This is verified cold-file preservation, not a tested database restore. Final
bootstrap acceptance roots were preserved. About157MB remains after the conflict runs; provision
space through verified owned-fixture archival before another multi-pair retention test.
