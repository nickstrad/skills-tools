# VM cleanup and learner readiness acceptance

Completed 2026-09-05 at the user's request, before continuing the PostgreSQL refactor. The report
`/root/disk-usage-report.md` was read and independently verified. The overall course refactor
remains unfinished; final cleanup after its acceptance audit is still mandatory.

## Measured result

| Item                                               | Verified disposition                                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root filesystem                                    | Approximately170MB available /100% used before;16GB available /34% used after                                                                      |
| `/var/lib/postgresql/pglab`                        | Obsolete6.1GB validation tree removed;10,568 regular files inventoried with complete SHA256s; both data roots stopped, no symlinks/live postmaster |
| `/tmp/postgres-pivot-20260904`                     | No client sessions; private server stopped normally, full2.6GB tree hash-verified in compressed evidence, then original removed                    |
| `/tmp/pg-owned-*`                                  | All151 roots individually preserved/verified and removed; no raw experiment root remains                                                           |
| Old build/private-source/copied-progress snapshots | 82 roots compacted/verified and removed; latest copied progress retained for active checks                                                         |
| Superseded/unaccepted trials                       | 59 full images discarded after keeping verified small forensic archives; none is a current acceptance-report/manifest input                        |
| npm/apt downloads                                  | Approximately966MB of download caches cleared; installed tools retained                                                                            |
| Remaining compressed evidence                      | 1,607,744,100 archive bytes plus small manifests, about1.6GB allocated overall; retained for the pending whole-course audit only                   |
| Learner lab                                        | `/labs/pglab/primary`, socket `/tmp`, port5440, database `lab`, original postmasterPID348739 still live                                            |
| Learner progress                                   | SHA256 unchanged; no progress action or learner lesson was executed                                                                                |

The initial report's ownership/path distinction was correct. Its blanket deletion suggestions were
not adopted: absence from pgrep alone does not establish disposability, and the current WAL filename
does not determine a safe archive retention window. The old learner-versus-author path confusion is
corrected in [the lab note](../../../../docs/knowledge/postgres-lab.md).

## Preservation method and proof

`/root/pg-cleanup-20260905/compact-evidence.py` processed the fixed preflight-owned root list;
`compact-snapshots.py` processed specifically identified obsolete snapshots. Together they
preserved234 roots totaling10,186,298,602 logical source bytes. They compared complete path, size
and SHA256 inventories with reopened archives, rechecked original hashes and stopped state, recorded
archive hashes/manifests, and only then removed originals. Snapshot symlink targets were recorded
without following them. Transient socket files were omitted; no live data directory was archived or
deleted. Both commands exited0, as did subsequent prototype retirement.

`retire-prototypes.py` reduced59 superseded/unaccepted roots to small diagnostic archives after
checking their full-archive hashes and absence from current acceptance reports/manifests. It
preserved useful controllers, logs, JSON and independent outcome stores, rechecked every retained
member, and removed bulky database/WAL images. Their original manifests remain inventories of what
was discarded, not claims that every byte remains available.

`final-verify.py` exited0 after rechecking all234 current archive hashes and mappings, removed
original paths, retired-full-image absence, unchanged learner progress and learner connectivity. It
also streamed all six current88 source-final/recovery/receiver members from the retained archives,
opened only temporary SQLite copies read-only, compared every receipt and derived balance against
source inventories, and deleted the temporary copies. The12,301/12,601-row and balance results agree
with [current88's runtime acceptance](07-disk-incident.md). It found only the learner PostgreSQL
server and its children; no private author server remains.

The learner's lesson9 start/run views rendered successfully using copied progress. Read-only queries
confirmed the learner data directory, port, database, course extensions and existing storage tables.
Lesson9's own setup creates st_toast, so no removed author-validation state is required. No learner
table was changed by this readiness check.

## Evidence locations and expiry

- `/root/pg-cleanup-20260905/`: original preflight, legacy inventory/control records, scripts,
  terminal logs, `compacted.jsonl`, `retired-prototypes.jsonl`, `final-summary.json`, final process
  list, learner readiness and free-space output.
- `/root/pg-validation-evidence/20260905/`: retained `.tar.gz` and `.files.json` inventories.
  `retired-prototypes.jsonl` overrides the original archive mapping for59 small-evidence archives.
- `/root/pg-validation-evidence/README.md`: selective access instructions. Original `/tmp` paths in
  historical acceptance records now identify archive member prefixes. Read needed members; do not
  recreate every old database to run the final audit.
- `/tmp/pg-observe-progress-ps3cmlto/progress.sqlite`: latest isolated progress copy. Its pointer
  remains `/tmp/pg-observe-progress-path`. Real learner progress hash remains
  `395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`.

Complete the remaining course acceptance audit, then remove bulky retained images and newly created
labs BEFORE marking the overall goal complete. Record concise final conclusions in the repository
first. General operational policy, discovered pitfalls and the PostgreSQL-specific application are
indexed in [VM resource cleanup](../../../../docs/knowledge/vm-resource-cleanup.md). No
cleanup/archival command remains running at this acceptance checkpoint.
