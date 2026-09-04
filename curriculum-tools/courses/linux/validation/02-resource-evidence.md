# Resource evidence: final primary validation

2026-09-04. Primary reviewed the Terra/high delivery, finished the semantic corrections, and ran
lessons 25–48 in the final serial 72-lesson host run. All 24 actual authored variations ran in a
separate serial host run. Both runs exercised the mount and cgroup success branches. Earlier agent
sandbox skips and miniature proxy variations are not the acceptance evidence.

Primary log: `/tmp/linux-primary-final-20260904.log`. Variation log:
`/tmp/linux-final-variations-real.log`. Each run used its own LINUX_LAB. Variation drafts were
constructed from built lessons with the exact published substitutions and compiled through the
normal builder; generated course artifacts were never hand-edited.

| Lessons | Primary evidence                                                                                             | Published variation evidence                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 25–26   | Rename preserved device/inode/size; hard-link counts 1→2→1.                                                  | Two names retained the same identity and link count 2 after rename; extra hard link reported count 2.                                         |
| 27      | Symlink lookup observed; follow distinguished target existence.                                              | readlink -f printed a canonical path while stat -L reported target_exists=no after target rename.                                             |
| 28      | Private/shared modes 600/644; explicit chmod added execution.                                                | umask 027 created mode 640 in a subshell.                                                                                                     |
| 29      | Every sampled publication was alpha or omega; invalid_observation=none.                                      | Direct publication exposed left before the second write and leftright after it.                                                               |
| 30      | Unlinked descriptor remained readable.                                                                       | Descriptor read old while replacement pathname read replacement.                                                                              |
| 31–32   | Mount resolved; named usage fell 16,781,312→4,096 bytes while deleted FD remained open; holder later absent. | Second path resolved to the same mount; closing FD 9 before unlink left neither the descriptor nor the named file.                            |
| 33      | Equal logical sizes, unequal block allocation.                                                               | One byte at the end of a 4 MiB sparse file yielded size 4,194,304 and 8 allocated 512-byte blocks.                                            |
| 34      | tmpfs mounted with 8,388,608 bytes used; unmounted.                                                          | Four-MiB file yielded 4,194,304 bytes used; unmounted.                                                                                        |
| 35      | Bounded image filled: nonzero write, ENOSPC, free bytes 0; image/mount removed.                              | A 48 MiB attempt still exceeded the 32 MiB image and reproduced ENOSPC.                                                                       |
| 36      | Unlink alone did not release the held allocation; final close did.                                           | Eight-MiB held file: free bytes 16,478,208 before/after unlink, 24,866,816 after close.                                                       |
| 37–39   | File/anonymous mappings observed; VSZ exceeded RSS; minor-fault deltas 4,096 then 0.                         | Two-MiB mapping remained visible; 16 MiB touched buffer gave RSS 26,704 KiB; changing second-phase bytes retained fault deltas 4,096 then 0.  |
| 40      | Eight-MiB file: advisory discard requested, residency snapshots 0 then 2,048 pages; both counts valid.       | One-MiB file: 0 then 256 pages, measured-snapshots label, exact cleanup.                                                                      |
| 41      | memory.high events 0→563, within 96 MiB memory.max; cgroup removed.                                          | Lowering high to 40 MiB gave events 0→546 and no OOM event.                                                                                   |
| 42      | oom_kill 0→1, child status 137, parent alive; cgroup removed.                                                | A 96 MiB attempt still exceeded 64 MiB max: the same OOM event/status/parent relationship.                                                    |
| 43–45   | CPU loop used more CPU than sleep; bounded runnable work and per-process context-switch counters observed.   | 0.2-second sleep gave user 0.00/wall 0.20; one worker was counted; replacing the busy worker with sleep yielded two voluntary-switch samples. |
| 46–48   | Relative nice difference 10, affinity constrained, I/O idle class queried.                                   | Parent/child nice 0/1; taskset reported the selected CPU; the idle-I/O worker still had CPU nice 0.                                           |

## Primary corrections and claim boundaries

- Atomic rename rejects an empty read; there is no permitted missing-destination gap in this
  same-filesystem replacement experiment. Visibility does not establish power-loss durability.
- A successful readlink -f need not mean the final path exists. The follow-up uses stat -L.
- Global df changes are sampled context. Exact deleted-descriptor ownership and the private bounded
  filesystem establish the relevant lifetimes without demanding a monotonic host free-space delta.
- The page-cache probe syncs dirty data before advisory DONTNEED and measures file residency with
  mincore. Residency can change immediately after either snapshot; no monotonicity, cold-device-read
  or timing-speedup guarantee is asserted. ACCESS_COPY supplies a private writable mapping address
  for ctypes without writing file pages.
- All variations retain setup and cleanup or provide a complete bounded standalone block. Matching
  numeric assertions change with allocation sizes and limits.

Primary sources: [mincore(2)](https://man7.org/linux/man-pages/man2/mincore.2.html),
[posix_fadvise(2)](https://man7.org/linux/man-pages/man2/posix_fadvise.2.html),
[rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html),
[cgroup v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html), and
[nice(1p)](https://man7.org/linux/man-pages/man1/nice.1p.html).
