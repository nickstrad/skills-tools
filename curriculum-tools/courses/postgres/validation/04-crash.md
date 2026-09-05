# Crash and replay acceptance

Primary acceptance2026-09-05. Replaced crash-and-redo (current56) at revision4 and consolidated the
read-only wal-replay-is-deterministic into it. No completion transfer. Includes full owned-cluster
helper, actual immediate shutdown, xid-filtered SQL WAL inspection, offline pg_waldump, fresh
recovery log, physical heap headers and independent application results. The exact coaching
variation commits the second transaction before the same crash.

## Live evidence

Core: /tmp/pg-crash-core.log, owned directory /tmp/pg-owned-iy7p1oa1. Transactions734/735 both have
Heap INSERT records;734 has COMMIT,735 has none in the flushed interval0/8D7EB8–0/8E4990.
Transaction736's later flush-marker commit establishes durability of the earlier unfinished work.
The second client stays open until after immediate shutdown; its ordinary EOF is not the cause of
rollback. Stopped pg_controldata says in production. New log bytes report immediate shutdown,
interrupted database, redo0/8D1F48 through0/8E8A50 and end-of-recovery checkpoint before readiness.
The log also reports an invalid zero magic number at0/8EA000, followed by successful redo/readiness;
this observed end-of-valid-WAL message did not prevent recovery. Primary inspected the actual
retained recovery.log and crash-range.waldump, not only the driver's PASS line.

Raw page0 retains both inserting xids; SELECT returns ids[1], amount10. Flush-marker row survives;
pg_is_in_recovery=false and timeline1 remains1. Service check253.10ms, domain check340.62ms are tiny
local samples, not recovery-time promises. This does not establish which individual page writes redo
skipped because a sufficiently recent page LSN was already on disk.

Source commit-second variation: /tmp/pg-crash-variation.log, /tmp/pg-owned-qtezrhxa. A second COMMIT
record is present, independent visibility is[1,2], post-recovery raw page still has both xids, and
application result is ids[1,2]/amount30. Service249.82ms, domain329.78ms. The final exact CLI hint
ran after a refreshed copied catalog: /tmp/pg-crash-exact-crash-and-redo.log,
/tmp/pg-crash-rendered-crash-and-redo.md, /tmp/pg-owned-m2pjno40; same correct records/outcomes,
service260.32ms/domain351.59ms. Earlier exact run /tmp/pg-owned-4ivg73be also passed, but final
acceptance uses the refreshed-catalog run. All owned servers stopped; evidence remains on disk.

This is process-crash recovery with intact storage. It does not establish power-loss, device-cache,
disk-loss or independent-host restore behavior. The offline dump covers the chosen workload
interval, a subset of the full recovery interval; it is not an arbitrary-suffix full-database
backup.

## Review and integration

Primary authored and reviewed the implementation and every runtime result. A bounded Terra/high
read-only review of transaction evidence, client-close ordering, cleanup and prose found no concrete
defects. No helper edits or runtime work were delegated.

Thirty tests pass (/tmp/pg-crash-tests.log). Full repository check passes (/tmp/pg-crash-check.log),
after formatting the regenerated map. Initial unformatted-map check and sandbox-only chown/read
denials were resolved; they are not successful verification runs. Actual isolated build produces94
lessons and seven reading stops; only crash-and-redo's content changes, wal-replay-is-deterministic
retires, later ordinals/prerequisite numbers renumber. Normalized prerequisite slugs remain the same
for all other lessons. First7 are byte-identical as objects; capacity content and prerequisite
identities are unchanged. A fresh copied catalog preserves every prior ID, progress and attempt row
and marks only the retired identity inactive. Real learner DB SHA256 during the check:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Drivers: /tmp/pg-crash-{core,variation}.sh, /tmp/pg-crash-exact.ts/.sh,
/tmp/pg-crash-scoped-build.py, /tmp/pg-crash-progress.py. Scope guard normalizes prerequisite
numbers to slugs: comparing raw numeric references after retirement would falsely report unrelated
content changes. Generated JSON is from the actual builder, never hand-edited. Source/artifact
coordination for the other workstream's published TOASTrev5 remains as documented in handoff. Plan,
identity map and canonical book mapping now record the accepted consolidation.
