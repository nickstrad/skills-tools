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
| Shell validator | Luna/high `shell_validator` | active | validator, tests, docs |
| Scaffold and fixed-slug plan | primary | active | `courses/linux/*` |
| Modules 1-12 | unassigned | pending | one file per module |

## Validation evidence

- Scaffold: `deno` was absent from PATH; `/root/.deno/bin/deno task new-course linux ...` succeeded.
- Bootstrap: `bash -n scripts/lab-setup.sh scripts/docker/{verify,test}.sh`, `shellcheck` on all
  three scripts, and scoped `git diff --check` passed on 2026-09-03.
- Docker initial/final state: `scripts/docker/test.sh` reported `stopped/unavailable` initially and
  finally. `docker info` failed and neither the systemd bus nor a usable daemon exists here, so the
  Ubuntu 24.04 image build/runtime test could not run in this workspace. No test builder, container,
  or image was created. Run the command below on the dedicated VM before declaring runtime acceptance.
- Builds, checks, tests, lesson validation, leak checks, and CLI smoke tests: pending.

## Active lab resources

- None created by the primary agent.

## Failures and corrections

- Plain `deno task new-course ...` failed with `deno: command not found`; use
  `/root/.deno/bin/deno` in this environment.
- Docker runtime validation is environment-blocked here, not a test failure: daemon unavailable and
  cannot be started. The test restored the same stopped/unavailable state.

## Commits and pushes

- None yet for Linux course work.

## Next resume command

```sh
cd /root/Software/skills-tools && scripts/docker/test.sh
```
