# Final audit: idle replay and aborted-WAL boundaries

Primary acceptance, 2026-09-05. This closes the two explicitly retained boundary questions from the
handoff. It supersedes the command-correspondence entries for current69–72 in the historical chunk5
manifest; all four stable slugs/revision4 and their core mechanisms remain. The final integration
report still needs to cover the rest of the course and resource cleanup.

## Idle insertion is not always an existing record end

An isolated real primary/standby probe reproduced insertion0/A00028 while seven successive samples
remained at replay0/A00000. Existing table contents already matched. This40-byte next-page header
gap left the requested insertion location unreached during the bounded idle observation. The
explicit restore-point marker returned0/A00090; replay reached exactly0/A00090 and both tables still
held the one original row. The probe's total0.67s includes marker/catch-up/data checks; it is not
all idle waiting. Root was `/tmp/pg-owned-yf6qs2l7`, output `/tmp/pg-idle-replay-probe.log`.

Current69 standby,70 replay lag,71 receipt readiness and72 synchronous acknowledgement now use named
pg_create_restore_point record ends for bootstrap and later receive/replay gates. A marker is
written after the relevant commit, within the pinned history. It gives replay a concrete record to
reach; it is not the transaction's exact WAL charge or an election/read-authority mechanism. WAL
insertion samples used for record-interval measurement remain separate from these gates.

Twelve fresh runs executed the changed cores, source variations and exact rendered hints. Every
actual server marker name/location matches its saved bound. Full outcomes are preserved:2/3 standby
receipts and25006 rejection;2,001/4,001 exact replay rows; paused500ms receipt timeout with no data,
wrong-history rejection before comparisons and fresh ready/fallback values; actual SyncRep with
flushed COMMIT evidence, local/remote-flush versus apply, and five final receipts after cancelled
wait or reconnection. Warning/FATAL lines were classified at intentional cancellation, receiver
replacement and teardown boundaries; no unexpected SQL/driver failures occurred.

`/tmp/pg-replay-boundary-audit.py` checks all twelve sources/rendered commands, complete saved
outcomes, marker correspondence, error classes and independent stopped/status3 state. The retained
[boundary outcomes](08-boundary-outcomes.json) record every root/log/hash. Drivers and scripts use
`/tmp/pg-replay-boundary-{validate,exact,build,audit}` and per-lesson core/variation prefixes; old
individual acceptance logs were not overwritten.

## Aborted physical WAL availability was already fixed

Current78's exact retained core, source variation and rendered hint have physical Heap/INSERT and
Transaction/ABORT for the aborted XID, no COMMIT, no logical events and no visible ID700. The final
audit read the three JSON inventories directly from their verified archives without restoring any
database. It also requires current built core equality with its executed shell, and confirms the
checkpoint plus flush>=end-marker assertion occurs before physical inspection.

These checks close the earlier failure caused by inspecting an unflushed abort-only interval.
Flushing that interval does not commit its row. No new source change or redundant rerun is needed
for78; the accepted physical/logical/domain evidence and current-source correspondence remain valid.
`/tmp/pg-abort-boundary-audit.json` records paths, hashes, XIDs and record types; its results are
also included in08-boundary-outcomes.json.

## Preservation and resources

Scoped build changes only69–72 among92. First7, copied history/IDs/progress, unchanged capacity and
seven reading stops remain intact. Thirty tests and full checks pass. Current copied catalog path is
in `/tmp/pg-observe-progress-path`, with `/tmp/pg-replay-boundary-progress.log` recording it and the
unchanged real learner SHA256.

All twelve new validation pairs and the idle probe are stopped, fully
archived/reopened/hash-checked, then rechecked before raw removal.
`/tmp/pg-replay-boundary-compacted.jsonl` maps the additional archives under
`/root/pg-validation-evidence/20260905/`. No author process/raw fixture remains. The archives remain
only for final course acceptance and must be reclaimed before overall completion. The earlier abort
evidence was read selectively, conserving both disk and unnecessary server work.
