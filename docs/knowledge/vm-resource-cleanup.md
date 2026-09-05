# VM resources are part of validation correctness

Check resource budgets before allocating fixtures, clean owned resources after acceptance, and
complete final cleanup before declaring the overall goal finished.

## What happened

On 2026-09-05, `/root/disk-usage-report.md` reported only about 173 MB free on this 24 GB VM.
Independent verification found about 6.8 GB in 151 `/tmp/pg-owned-*` experiment directories, 6.1 GB
in the obsolete `/var/lib/postgresql/pglab` validation tree, and 2.6 GB in the private
`/tmp/postgres-pivot-20260904` lab. Stopping a server had been treated as cleanup while its backups,
WAL archives, data copies and evidence remained indefinitely. The learner requested immediate
cleanup, a ready lesson-9 environment, and cleanup again at overall goal completion.

The active learner cluster is `/labs/pglab/primary`, PostgreSQL 16, port 5440, socket `/tmp`,
database `lab`. It is distinct from the obsolete `/var/lib/postgresql/pglab` tree described by older
validation notes. Resolve actual paths and query `data_directory`; do not infer ownership from a
cluster name. The private pivot server had no application clients and was stopped for cleanup.
Neither learner progress nor learner data was reset.

Cleanup evidence and current disposition are recorded in `/root/pg-cleanup-20260905/` and the
PostgreSQL handoff. Bulky evidence still needed for the unfinished whole-course audit is eligible
for compact preservation, with complete manifests checked before originals are removed. This
preserves evidence; it does not establish that an archived database has been successfully restored.

## Why it matters

A nearly full shared filesystem can break unrelated lessons, lose log output, and make failures look
like PostgreSQL behavior. Free memory, filesystem bytes, inodes, concurrent processes and peak
temporary copies are separate budgets. On this VM memory and inodes were healthy; disk allocation
was the actual problem. A passed lesson and a stopped postmaster do not release files.

A survey is evidence to verify, not authorization to delete every matching directory. No process in
`pgrep` does not mean data has no learner or recovery value. Conversely, a live but unused
agent-owned validation server need not be left running forever. Confirm ownership and users, stop it
normally, and account for its files. Never delete WAL from a running data directory.

Archive retention follows a retained backup/recovery target and consumer dependencies, not the
current WAL filename alone. `archive_cleanup_command` is a recovery-side hook, not a generic
primary-archive disk quota. If a disposable lab has no remaining recovery obligation, retire its
whole owned tree instead of inventing an untested archive retention rule.

## How to apply

1. Read the latest resource report when present, then measure `df -h`, `df -i`, `free -h`, scoped
   `du`, and live processes. Recheck long-lived jobs by their actual process/tool handles. Do not
   run a second fixture merely because an observation timeout expired.
2. Identify the learner lab, progress databases, active agents and unrelated work. Keep those
   protected. Use explicit private sockets/ports and inspect `data_directory` for any server you
   intend to stop. Check active clients before stopping a shared validation server.
3. Estimate the next trial's peak bytes, including primary, standby, backup, restore, archive and
   temporary compression copies. Keep at least 2 GB free on this VM and more than twice the next
   expected fixture footprint; if that budget is unavailable, clean up before allocating. This is a
   local operational budget, not a PostgreSQL sizing rule.
4. Give each validation run a unique owned path and a finite lifecycle. Stop clients and servers in
   failure cleanup. After outcomes are inspected, remove reproducible bulky state unless a named
   remaining acceptance requirement needs it. Keep concise reports, executed scripts, outcome
   inventories and error classifications in durable repository documentation.
5. When an unfinished audit needs database images, save a compressed archive and a complete
   relative-path/hash manifest. Reopen the archive and compare every regular file and symlink
   target; recheck stopped state and original hashes before removal. Record how old evidence paths
   map into the archive. Avoid simultaneously keeping raw data and equivalent archives. Do not
   blindly restore and start archived clusters whose configs name old sockets/paths.
6. At each checkpoint record bytes reclaimed, bytes retained, why they remain, and their removal
   trigger. Remove stale build snapshots and copied progress databases when no active driver or
   acceptance comparison needs them. Preserve current uncommitted work and useful tool caches;
   deleting active agent session history is not routine lab cleanup.
7. At overall goal completion, first finish the evidence audit, then remove its bulky scratch inputs
   and any newly created labs. Verify the learner lab still responds, progress is unchanged, no
   owned validation process remains, and free-space headroom is restored. Report the final resource
   state before marking the goal complete. Cleanup is part of completion itself.

## Specific findings from the PostgreSQL cleanup

- A search for every `PG_VERSION` file overcounts clusters: PostgreSQL also stores version files
  inside per-database directories. The initial broad preflight found728 such markers across151
  roots. Actual cluster ownership/stop checks should use a `global/pg_control` file and its data
  directory, plus postmaster PID/process checks, rather than treating every marker as a server.
- The old private pivot server was genuinely idle: `pg_stat_activity` had no other client backends.
  It could be stopped normally, freeing background activity and making a stable file inventory. Do
  not mistake a live PID alone for an ongoing validation job that needs to stay running.
- Existing cold archives were nested inside some evidence roots alongside data/standby copies.
  Preserve existing archive bytes when an acceptance manifest names their hashes. A new outer
  archive changes the lookup path, not the inner file bytes. Record the mapping so final audit
  scripts can read the old archive member without restoring the entire parent tree.
- Scoped build snapshots contain the course's canonical `docs` symlink. The first generic compaction
  preflight correctly refused this unhandled file type before deleting anything. The
  snapshot-specific version records/rechecks the link target and archives the link itself; it never
  traverses or deletes the canonical research folder. Do not solve this by copying the book or
  dereferencing every link.
- Keep forensic records from superseded/unaccepted trials separate from accepted audit inputs. Root
  identities referenced by current `validation/*.md` and evidence manifests identify the images
  retained for the remaining course audit. Superseded or unaccepted roots can discard bulky
  databases/WAL while retaining controllers, JSON, independent SQLite outcomes and logs. Absence
  from a search is only one input: establish that the path is an owned author fixture and preserve
  useful diagnostic records before discarding it.
- Clear download caches using the package manager when useful. `apt-get clean` reclaims cached
  package downloads; it does not remove installed PostgreSQL tools or imply `autoremove` is safe.
  Active Codex/Claude session state, unrelated SQLite/Linux work and useful Deno runtime caches are
  outside this PostgreSQL cleanup. Do not apply the original report's broad deletion snippets
  without these distinctions.

For this refactor, retain accepted compacted evidence only until the final whole-course audit is
complete. Then remove the bulky images before declaring the overall goal complete. Historical
validation reports remain valid records of measured runs; their old scratch paths are translated
through the cleanup manifest and should not trigger redundant reruns just because the directories
have been reclaimed.

## Completed cleanup and remaining obligation (2026-09-05)

Verification finished with about16GB available (34% used), up from about170MB. The obsolete6.1GB
validation tree and all151 raw owned experiment roots are gone. The unused private pivot server was
stopped and its tree reclaimed. Eighty-two old source/build/progress snapshots were also compacted
and removed. Fifty-nine superseded/unaccepted full images were discarded after retaining small
forensic records. npm/apt download caches were cleared; installed tools remain.

All234 current archive mappings/hashes were rechecked after compaction/retirement. Six current88
archived SQLite receivers still match every source row and derived balance. The learner's original
postmaster remains running, lesson9 start/run render, and the real progress SHA256 is unchanged. No
author PostgreSQL server or cleanup job remains live. The retained archives total1,607,744,100 bytes
(about1.6GB allocated with manifests) and exist only for the pending whole-course audit.

The detailed acceptance record is
[`07-resource-cleanup.md`](../../curriculum-tools/courses/postgres/validation/07-resource-cleanup.md).
`/root/pg-cleanup-20260905/final-summary.json` has the measured inventory and archived outcome
checks. `/root/pg-validation-evidence/README.md` explains selective access. The original resource
report now has a verified cleanup addendum. After the remaining course audit, remove the retained
bulky evidence and any new scratch resources, recheck learner readiness and free space, and only
then mark the overall goal finished. Do not allow a new set of151 retained raw fixtures to form.
