# Physical read-your-writes acceptance

Primary acceptance, 2026-09-05. Stable read-your-writes-on-a-replica moves from14-patterns to
current71 in physical replication at revision4. The fresh owned fixture replaces the old logical
subscription simulation. It has a pinned writer/history contract and makes no failover authority
claim.

## Live evidence

Core: /tmp/pg-replica-readiness-core.log, /tmp/pg-owned-sj6nx3xs. Variation:
/tmp/pg-replica-readiness-variation.log, /tmp/pg-owned-67ks82gh. Driver:
/tmp/pg-replica-readiness-validate.ts; complete scripts
/tmp/pg-replica-readiness-{core,variation}.sh. Each root retains paused_timeout.json,
wrong_history_rejected.json, fresh_read_after_replay.json, verified backup evidence and
source/standby logs. Variation also retains explicit_primary_fallback.json.

Both runs pause replay at0/A00060 before atomically committing profile1/version2/after and receipt
request-42/profile1/version2/after. The token is sampled after COMMIT at0/A07AE0; receiver flush
reaches0/A08648. Standby diagnostics still show version1/before and no receipt. The500ms gate makes
seven LSN comparisons and zero domain queries, returning timeout with payload=null in500.23ms/core
or500.46ms/variation. This includes scheduling overhead; no exact real-time bound is asserted.

Tokens with changed system ID, timeline or topology epoch keep the correct numeric bound. Each
returns wrong_history with zero LSN comparisons and zero domain reads. After resume, one fresh
application statement returns ready with the exact profile and independently keyed receipt in
40.05ms/core or46.79ms/variation. Source agrees. The variation's explicit primary fallback returns
those values while the paused standby is independently verified still stale; its separate bounded
request does not claim to fit inside the expired replica budget.

## Integration

Exact current71 copied-catalog hint2:
/tmp/pg-replica-readiness-rendered-read-your-writes-on-a-replica.md. Output:
/tmp/pg-replica-readiness-exact-read-your-writes-on-a-replica.log; root /tmp/pg-owned-rw5s3j4x. It
passes the same assertions, timing out in502.81ms with seven comparisons and zero domain reads, then
returning the primary fallback and fresh replica result in46.79ms after resume. All three owned
source/standby pairs stop and their owned slots are removed.

Thirty tests and full repository check pass in /tmp/pg-replica-readiness-{tests,check}.log.
/tmp/pg-replica-readiness-scoped-build.py generates93 lessons and proves only this stable lesson
changes after normalizing ordinal/prerequisite references. Seven reading stops and the original
first seven are preserved. Fresh copied catalog /tmp/pg-observe-progress-bgt_8fqq/progress.sqlite
preserves existing lesson IDs, progress and attempts; accepted capacity is unchanged. Learner hash
before/after remains395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Next: current72 synchronous-replication-blocks-commit; actual remote flush/apply waits, observed
SyncRep and authoritative receipt reconciliation on cancellation/reconnection. Chunks5–7 remain
unfinished; design05 governs the remaining replication and logical-processing work.
