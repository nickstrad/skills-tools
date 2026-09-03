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

| Workstream | Owner | Status | Files |
| --- | --- | --- | --- |
| Bootstrap and Docker safety | Luna/high `linux_bootstrap` + primary review | verified static; runtime blocked by host | `scripts/*` |
| Shell validator | Luna/high `shell_validator` + primary review | verified | validator, tests, docs |
| Scaffold and fixed-slug plan | primary | verified | `courses/linux/*` |
| Modules 1-3 | Luna/high `modules_01_03` + primary review | verified | module files 01-03 |
| Modules 4-6 | Luna/high `modules_04_06` | active | module files 04-06 |
| Modules 7-9 | Luna/high `modules_07_09` | active | module files 07-09 |
| Modules 10-12 | Luna/high `modules_10_12` | active | module files 10-12 |

## Validation evidence

- Scaffold: `deno` was absent from PATH; `/root/.deno/bin/deno task new-course linux ...` succeeded.
- Bootstrap: `bash -n scripts/lab-setup.sh scripts/docker/{verify,test}.sh`, `shellcheck` on all
  three scripts, and scoped `git diff --check` passed on 2026-09-03.
- Docker initial/final state: `scripts/docker/test.sh` reported `stopped/unavailable` initially and
  finally. `docker info` failed and neither the systemd bus nor a usable daemon exists here, so the
  Ubuntu 24.04 image build/runtime test could not run in this workspace. No test builder, container,
  or image was created. Run the command below on the dedicated VM before declaring runtime acceptance.
- Disk-safety follow-up: the test now owns a unique labeled image/container and unique Buildx
  builder, prunes only that private builder, removes the exact BuildKit container/state-volume
  prefix, conditionally removes the helper image only when the run introduced it, verifies all
  run-owned resources are absent, and fails cleanup if absence cannot be proved. Static Bash,
  ShellCheck, diff, and no-broad-prune checks passed; the no-daemon path created no resources.
- Builds, checks, tests, lesson validation, leak checks, and CLI smoke tests: pending.
- Shell validator: focused suite passed `6 passed | 0 failed`; targeted `deno fmt --check`,
  `deno lint`, and `deno check` passed. A real legacy smoke selection of PostgreSQL
  `build-lab-cluster` printed the manual-shell skip and exited 0.
- Blocking-step correction: primary review found deferred steps were not required to finish. The
  validator now fails an unresolved blocking marker; regression suite is `7 passed | 0 failed`.
- Modules 1-3: build wrote 18 lessons; all 18 passed the shell harness with a unique `/tmp` lab and
  labeled evidence matching expectations. Primary fixed FIFO header/readiness ordering. Final
  checks showed an empty lab directory and no lesson-owned processes/FIFOs.

## Active lab resources

- None created by the primary agent.

## Failures and corrections

- Plain `deno task new-course ...` failed with `deno: command not found`; use
  `/root/.deno/bin/deno` in this environment.
- Docker runtime validation is environment-blocked here, not a test failure: daemon unavailable and
  cannot be started. The test restored the same stopped/unavailable state.
- The first modules 1-3 run exposed a FIFO startup race and a validator false positive for an
  unresolved blocking step. Both were corrected, the stale FIFO was removed, and all 18 lessons
  then passed on rerun.

## Commits and pushes

- `4521813` — bootstrap/Docker safety; pushed to `origin/main`.
- `e6ab578` — persistent shell validator and six initial regression tests; pushed to `origin/main`.
- `4d1cb62` — disk-safe Docker cleanup follow-up; pushed to `origin/main`.
- `a3ad816` — fixed 72-lesson plan, course metadata, wrapper skill, and module stubs; pushed to
  `origin/main`.
- External PostgreSQL work advanced `main` through `84d8dad`; Linux commits remain ancestors and no
  PostgreSQL files were staged by this workflow.

## Next resume command

```sh
cd /root/Software/skills-tools && scripts/docker/test.sh
```
