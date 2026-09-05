# Final resource retirement and lesson-9 readiness

2026-09-05. Cleanup ran after the whole-course evidence audit and before declaring the refactor
complete. It closes the explicit remaining obligation in 07-resource-cleanup.md and the original
`/root/disk-usage-report.md`.

| Resource                                     | Final disposition                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root filesystem                              | `df -h /`: 24 GB total, about 7.0 GB used, 17 GB available, 31% used; the initial report had about 170 MB available.                                                                                                                                                    |
| Audited compacted fixtures                   | All 261 mapped archives, 1,810,235,481 bytes, removed after their current SHA256 values matched the completed audit. No database/WAL image remains in the evidence directory.                                                                                           |
| Loose inventories and small forensic records | 32,703,680 bytes compacted to one 10,051,954-byte bundle; reopened and every regular member hash compared before originals were removed. Nine additional prototype archives were checked to contain no PostgreSQL data/WAL image and retained inside this small bundle. |
| Final copied progress                        | Seven obsolete private copies, about 11.9 MB, removed after copied-catalog checks finished. The obsolete pointer was removed too.                                                                                                                                       |
| Additional variation lab                     | `/tmp/pg-final-hints-lab-2paki5f9` stopped normally and removed in its driver's finally block after all 18 checks passed.                                                                                                                                               |
| Learner lab                                  | Original postmaster 348739 remains at `/labs/pglab/primary`, port 5440/socket `/tmp`, database lab; read-only connectivity, actual data directory, course extensions and existing storage tables verified.                                                              |
| Learner progress                             | SHA256 remains `395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`; no progress or lesson-completion action executed.                                                                                                                                    |
| Other resources                              | About 6.5 GiB memory available and 7% inode use at final verification. No owned validation server/driver remains. Installed tools, learner files, active agent state and unrelated work are preserved.                                                                  |

The final cleanup script and exact inventory are
`/root/pg-cleanup-20260905/retire-final-evidence.py` and `final-retirement.json`. The retained
bundle is `retired-evidence-inventories.tar.gz`, SHA256
`ca863f7985162c52873240f1a29d708bd41e254a7252da7fb400d43edba5a097`. It preserves inventories and
small prototype diagnostics, not a restorable PostgreSQL backup. The full mapped-archive audit is
saved there as `final-evidence-audit.json`; 09-final-evidence.json records its hash and accepted
lesson correspondence. The old `/root/pg-validation-evidence/20260905/` directory is removed.

Small standalone scripts, SQL, JSON and validation logs remain useful diagnostic evidence; no
permanent author cluster, duplicate progress catalog or bulky acceptance image is needed. Do not
rehydrate historical scratch paths merely because a report names them. The durable knowledge base
now explains the selective-read approach, ownership checks, accepted-command comparison, copied
progress checks and why cleanup belongs inside completion.

Lesson 9's start/run/hint/full views passed on copied progress, and its setup creates its own
st_toast table using extensions present in the learner lab. It has no dependency on any removed
fixture. Both installed PostgreSQL skill paths resolve to the updated course wrapper. The current
learner catalog was preserved; refresh it only through the supported CLI when authorized by the
learner. To resume the requested lesson, use `bin/pgcoach 9 start` from the course directory.
