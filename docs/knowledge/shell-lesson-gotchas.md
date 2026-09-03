# Shell lesson gotchas (Linux course)

Pitfalls found while reviewing the 72 Bash lessons. Last updated 2026-09-03.

## What happened

- **`code` is `String.raw`.** A literal `${` or backtick inside a code field is JavaScript
  interpolation, not shell. `$(...)` and `$((...))` are fine. Write `\n` once inside `printf`
  strings; the raw tag keeps the backslash.
- **`set -e` leaks.** The harness and the learner both use one persistent shell per session.
  `set +e; cmd; set -e` leaves `errexit` on for every later command. The house idiom is
  `status=0; cmd || status=$?`. Findings 5 and the lesson 71 fix both came from this.
- **`nice -n N` is relative.** Claude Code shells run at nice 5, so `nice -n 0` yields 5 and a
  check for `== 0` fails. Record `ps -o ni= -p $$` and compare differences.
- **Two-session lessons must use fixed paths.** Session B cannot know Session A's `$$`. Use
  `$LAB/<name>-$UID` (as lessons 23 and 57 do) and `rm -f` it at the start of A; a glob like
  `tcp-port-$UID-*` lets a stale file win and B connects to a dead port.
- **Cleanup must be exact.** Every trap kills and waits only PIDs it recorded. A "child gone"
  check is vacuous unless the parent kept the child's real PID (finding 1).
- **Mounts, loop devices and cgroups live outside the lab.** Run those lessons in a `( ... )`
  subshell so a failure ends the experiment, not the learner's shell, name kernel objects
  `linux-tutor-$UID-...`, and install the trap before creating anything.
- **`as_root` helper.** `as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }`
  lets a lesson run as root or as a NOPASSWD sudo user. A global `sudo -n` -> `as_root` replace
  once rewrote the helper's own body into infinite recursion; check helpers after bulk edits.
  Writes to cgroup files go through `printf '%s' "$v" | as_root tee "$file"`.
- **Host policy skips are evidence.** This kernel refuses an unprivileged `uid_map` write, so
  lesson 64 prints `user_namespace_remapped=skipped-host-policy` for a non-root user. Label the
  policy branch instead of failing.
- **`command -v time` finds the Bash keyword**, not GNU time; probe `/usr/bin/time` with `-x`.
  `mkfs.ext4` lives in `/usr/sbin`, which may be off an unprivileged `PATH`.
- **Pipe reads can be short.** A consumer `dd` needs `iflag=fullblock` or it under-counts.
- **Handler children must not sleep in the foreground.** `sleep 30 & trap ... ; wait` lets a TERM
  handler run immediately; a bare `sleep 5` delays it until the sleep ends.
- **Python bodies are part of the contract.** During reformatting, `python3 -c '...'` text must
  stay byte for byte; re-indenting changes the program.

## Why it matters

Each of these produced a lesson that "completed" in the harness while printing wrong or vacuous
evidence, or that damaged the learner's shell state for later lessons.

## How to apply

Reuse the idioms above verbatim when writing new shell lessons, and validate new privileged
lessons both as root and as a NOPASSWD sudo user (see `repo-tooling.md` for the rig).
