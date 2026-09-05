# Finishing a course refactor without retaining a second VM's worth of labs

## What happened

The September 2026 PostgreSQL systems engineering refactor finished with 92 active lessons, seven
reading stops and unchanged original completed lessons 1–7. The complete acceptance is in
[the final integration report](../../curriculum-tools/courses/postgres/validation/09-final-integration.md).
The lesson map translates historical ordinals to stable identities. A separate user-requested
resource cleanup became the first operational item when disposable databases and WAL almost filled
the 24 GB VM.

The approach was to verify ownership and current resource use, preserve only evidence still needed
for named unfinished checks, finish those checks, then retire the bulky inputs. The final audit
compared current source and generated objects with accepted commits, reread selected complete
outcomes, validated copied progress, and checked actual rendered commands. It did not restart all
archived databases or repeat the book extraction. The final 1.81 GB of mapped archives was temporary
acceptance evidence, not a permanent recovery service. The final cleanup report records removal and
learner readiness.

## Why it matters

A stopped database still owns files. Repeated source snapshots, base backups, standbys, restore
copies, WAL archives and nested cold images multiply storage costs; copying them all before every
check is unnecessary and can make validation itself fail. Resource ownership, peak usage and a
cleanup trigger belong in an experiment's acceptance contract. Cleanup must occur after the last
audit dependency is discharged and before a goal is declared complete.

Evidence and current code can also drift independently. A later helper correction invalidates an old
command hash without invalidating every other lesson. Reordering changes numeric prerequisites
without necessarily changing behavior. Another workstream may have a source explanation edit that is
already in the shared generated artifact. A green build or an old PASS line cannot resolve these
distinctions alone.

## How to apply

1. Start with docs/README, the resource policy, the current course plan and accepted validation
   records. Measure current disk, memory, inodes and live processes. Identify the learner lab by its
   actual data directory and socket, not a historical directory name or remembered PID.
2. Track the accepted commit and stable slug for each changed lesson. Normalize only order-dependent
   fields when comparing reordered objects; compare completed objects exactly. Keep an explicit list
   of source overlays and unrelated edits. Do not stage another workstream's file to make an
   integration claim look cleaner. State whether a build check used HEAD or the shared working tree.
3. Compare freshly rendered hints with executed commands. Read logs for expected errors and inspect
   full outcomes. Generic harness completion detects timeouts, not SQL correctness. Test missing
   evidence narrowly: the final audit found 18 early variations whose execution was insufficiently
   documented, ran them in one small private cluster and removed it in a finally block.
4. Preserve archive hashes and complete member inventories while an audit still needs them. Read
   only named JSON/log/SQLite members, using grouped streaming reads when several belong to the same
   archive. Nested archive bytes can be checked through their original hashes in a verified outer
   manifest. This proves preserved evidence, not successful database recovery. Avoid reopening old
   clusters with stale absolute sockets, recovery inputs or paths merely to find a small result.
5. Test catalog refresh through SQLite's backup API and the supported tutor init command on that
   copy. Compare every old slug ID, progress row and attempt, all retirements, completed revisions
   and the real database hash. Rendering a lesson does not authorize marking it done. Dispose of
   copied progress after the audit; leave the real learner state intact.
6. Finish the current PLAN, identity map, reading citations, reading stops, wrapper guidance,
   acceptance report and knowledge index. Label older counts and source research as historical
   rather than erasing useful provenance. Keep research canonical and preserve its symlink.
7. Remove the audited bulky images and obsolete copies; retain compact inventories and genuinely
   useful diagnostics with a stated purpose. Recheck learner connectivity, progress, processes and
   disk headroom. Final cleanup is part of completion, not a promise of work after completion.

## Specific findings worth reusing

- Physical replay cannot necessarily reach an idle insertion pointer. The final probe observed
  insertion `0/A00028` while replay stayed at `0/A00000`; an actual restore-point record ended at
  `0/A00090` and was replayed. Readiness gates now use replayable record ends. Do not turn this
  correction into a blanket replacement of insertion positions used to measure WAL byte intervals.
  [Replication findings](postgres-replication-evidence.md) explain the tested boundary.
- A bare BEGIN with no read did not publish backend_xmin and did not retain the matched churn's dead
  tuples. Repeated RR snapshot queries stayed equal; two shared row locks coexisted in a multixact;
  shared readers behind an exclusive holder both proceeded once it released. Check the actual
  snapshot/lock state instead of explaining outcomes from transaction labels alone.
- A psql marker needs its preceding SQL statement terminated; otherwise the marker can appear before
  the SQL buffer executes. JSON aggregates can span lines, and SQL NULL is not automatically JSON
  null. CPU ticks, independent receiver contents, complete request histories and actual post-signal
  session/transaction state are stronger evidence than printed success or a signal's
  acknowledgement. [Incident findings](postgres-incident-evidence.md) preserve the concrete cases.
- Match controlled variables and specify limits. Shared-host latency and admission subsets vary;
  extra workers can add receiver writer-lock wait without raising throughput. Process loss, local
  independent commits and a controlled authority switch do not establish independent-host fault
  tolerance, consensus or production latency guarantees.

The learner's lab is `/labs/pglab/primary`, port 5440/socket `/tmp`, database lab. Lesson 9 creates
its own st_toast fixture and needs none of the retired author state. See
[the lab note](postgres-lab.md) and [resource policy](vm-resource-cleanup.md) before future work.
