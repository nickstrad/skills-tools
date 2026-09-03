# Linux Systems course handoff

## Current state

- Branch: `main`
- Baseline: inspect with `git rev-parse HEAD` before the next commit.
- PostgreSQL handoff: `curriculum-tools/HANDOFF.md` is pre-existing user work; never stage it.
- Release target: 12 modules, 72 lessons, all `runIn: "shell"`.
- Lab root: `${LINUX_LAB:-$HOME/linux-systems-lab}` on a dedicated Ubuntu 22.04/24.04 VM.

## Decisions and safety

- Bash 5.1+, Linux 5.15+, `/proc`, and cgroup v2 are the baseline.
- Locale is pinned to `C`; timing, PID, address, page-count, and CPU-mask assertions use labeled
  relationships instead of host-specific constants.
- All mutable course artifacts stay beneath `$LINUX_LAB`; privileged experiments use unique names,
  bounded resources, and cleanup traps. No broad process kills, mount changes, cgroup deletion, or
  Docker pruning.
- Advanced Docker, systemd, nftables, strace, fio, perf, bpftrace, and advanced networking are
  explicitly out of scope.

## Workstream status

| Workstream                   | Owner                                        | Status                                   | Files                  |
| ---------------------------- | -------------------------------------------- | ---------------------------------------- | ---------------------- |
| Bootstrap and Docker safety  | Luna/high `linux_bootstrap` + primary review | verified static; runtime blocked by host | `scripts/*`            |
| Shell validator              | Luna/high `shell_validator` + primary review | verified                                 | validator, tests, docs |
| Scaffold and fixed-slug plan | primary                                      | verified                                 | `courses/linux/*`      |
| Modules 1-3                  | Luna/high `modules_01_03` + primary review   | verified                                 | module files 01-03     |
| Modules 4-6                  | Luna/high `modules_04_06` + primary review   | verified                                 | module files 04-06     |
| Modules 7-9                  | Luna/high `modules_07_09` + primary review   | verified                                 | module files 07-09     |
| Modules 10-12                | Luna/high `modules_10_12` + primary review   | verified                                 | module files 10-12     |

## Validation evidence

- Scaffold: `deno` was absent from PATH; `/root/.deno/bin/deno task new-course linux ...` succeeded.
- Bootstrap: `bash -n scripts/lab-setup.sh scripts/docker/{verify,test}.sh`, `shellcheck` on all
  three scripts, and scoped `git diff --check` passed on 2026-09-03.
- Docker initial/final state: `scripts/docker/test.sh` reported `stopped/unavailable` initially and
  finally. `docker info` failed and neither the systemd bus nor a usable daemon exists here, so the
  Ubuntu 24.04 image build/runtime test could not run in this workspace. No test builder, container,
  or image was created. Run the command below on the dedicated VM before declaring runtime
  acceptance.
- Disk-safety follow-up: the test now owns a unique labeled image/container and unique Buildx
  builder, prunes only that private builder, removes the exact BuildKit container/state-volume
  prefix, conditionally removes the helper image only when the run introduced it, verifies all
  run-owned resources are absent, and fails cleanup if absence cannot be proved. Static Bash,
  ShellCheck, diff, and no-broad-prune checks passed; the no-daemon path created no resources.
- Course build: `/root/.deno/bin/deno task build linux` wrote exactly 72 lessons. Full formatting,
  lint, and type checks passed after module integration. Full tests and CLI smoke tests remain for
  the final verification batch.
- Shell validator: focused suite passed `6 passed | 0 failed`; targeted `deno fmt --check`,
  `deno lint`, and `deno check` passed. A real legacy smoke selection of PostgreSQL
  `build-lab-cluster` printed the manual-shell skip and exited 0.
- Blocking-step correction: primary review found deferred steps were not required to finish. The
  validator now fails an unresolved blocking marker; regression suite is `7 passed | 0 failed`.
- Modules 1-3: build wrote 18 lessons; all 18 passed the shell harness with a unique `/tmp` lab and
  labeled evidence matching expectations. Primary fixed FIFO header/readiness ordering. Final checks
  showed an empty lab directory and no lesson-owned processes/FIFOs.
- Modules 4-6: all 15 unprivileged lessons (19-33), including the two-session FIFO, passed the
  primary shell harness in 11 seconds after corrections. Evidence included an 8 MiB completed pipe,
  FD/inode/link/rename invariants, `(deleted)` descriptors, df/du divergence, and sparse 0-vs-65536
  block allocation. The scratch directory was empty and removed.
- Privileged lessons 34-36 passed serially: tmpfs reported 32 MiB total/8 MiB used; bounded ext4
  returned ENOSPC with zero free bytes; deleted-open space rose from 12,283,904 to 24,866,816 bytes
  only after close. Post-run checks found no lab mount, loop device, process, or file.
- Modules 7-9: all 15 unprivileged lessons passed primary validation. Evidence included 4096 then 0
  minor faults, 146152-vs-18236 KiB VSZ/RSS, four bounded runnable workers, niceness 0-vs-10 on CPU
  0, exact affinity, idle I/O class, RLIMIT_FSIZE at 1 MiB, CPU-limit status 137, and cgroup2fs.
- Privileged lessons 41, 42, and 54 passed serially after correction: `memory.high` events rose
  0→699 below a 96 MiB max, the 64 MiB cgroup recorded one local OOM kill with child status 137, and
  the 8-PID group recorded four `pids.max` events. Every exact cgroup was removed.
- Modules 10-12: all 18 lessons passed primary real-command validation. Socket evidence included an
  observed listener/owner/descriptor, an ESTAB connection, a pathname UNIX exchange, and backlog
  pressure admitting 3 of 8 clients while 5 timed out. Namespace evidence included PID 1 inside,
  private tmpfs visibility, UID mapping, loopback-only networking, and successful `nsenter` through
  the exact inner PID. Capstone evidence included two 100% CPU workers, 64 MiB anonymous growth, 48
  held files, a 16 MiB deleted-open file, EADDRINUSE followed by successful rebind, and clean
  graceful service recovery. Final checks found zero lab entries and zero lab mounts.

## Active lab resources

- None created by the primary agent.

## Failures and corrections

- Plain `deno task new-course ...` failed with `deno: command not found`; use `/root/.deno/bin/deno`
  in this environment.
- Docker runtime validation is environment-blocked here, not a test failure: daemon unavailable and
  cannot be started. The test restored the same stopped/unavailable state.
- Disk-safety review found that the BuildKit helper image removal preceded builder teardown. Cleanup
  now prunes the unique builder, removes its exact container and state volume, and only then removes
  a helper image introduced by the run, ensuring it is no longer held by the builder.
- The first modules 1-3 run exposed a FIFO startup race and a validator false positive for an
  unresolved blocking step. Both were corrected, the stale FIFO was removed, and all 18 lessons then
  passed on rerun.
- Primary review of modules 4-6 corrected FIFO open-vs-buffer semantics, added bounded FIFO
  readiness, changed atomic rename reads from 3000 child processes to Bash `read`, and made writes
  inside root-owned lab mounts use exact `sudo -n` operations. Lessons 34-36 then passed serially
  and cleanup checks confirmed no `tmpfs-$UID`, `full-mount-$UID`, or `recover-mount-$UID` remained.
- Primary review of modules 7-9 made cgroup paths derive from the discovered cgroup2 mount, added a
  48 MiB `memory.high` threshold and event assertion below the 96 MiB maximum, disabled swap for the
  bounded OOM domain, and made the CPU-limit assertion reject watchdog-only termination. Before
  privileged validation, confirm no `linux-tutor-$UID-*` cgroup exists.
- The first reclaim run observed 563 high events but timed out because the throttled helper was
  awaited. Its exact cgroup was still populated; primary used only that cgroup's `cgroup.kill`,
  removed its two marker files and group, then changed all cgroup lessons to kill/reap bounded
  helpers and remove their exact group before reporting cleanup. The corrected run finished in 3.7s.
- Primary review of modules 10-12 corrected a two-session socket rendezvous race, backlog result
  summation, network-namespace interface parsing, `nsenter` targeting of the inner task rather than
  the timeout wrapper, nested cgroup memory accounting, deleted-file matching, and graceful capstone
  file removal. All corrected experiments then matched their labeled expectations.

## Commits and pushes

- `4521813` — bootstrap/Docker safety; pushed to `origin/main`.
- `e6ab578` — persistent shell validator and six initial regression tests; pushed to `origin/main`.
- `4d1cb62` — disk-safe Docker cleanup follow-up; pushed to `origin/main`.
- `a3ad816` — fixed 72-lesson plan, course metadata, wrapper skill, and module stubs; pushed to
  `origin/main`.
- `eae3759` — Linux modules 1-3; pushed to `origin/main`.
- `8efba78` — Linux modules 4-6; pushed to `origin/main`.
- `3c2e92c` — Linux modules 7-9; pushed to `origin/main`.
- External PostgreSQL work advanced `main` through `84d8dad`; Linux commits remain ancestors and no
  PostgreSQL files were staged by this workflow.

## Next resume command

```sh
cd /root/Software/skills-tools && scripts/docker/test.sh
```
