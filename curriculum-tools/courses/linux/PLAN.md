# Linux Systems curriculum plan

## Contract and vocabulary

This release is exactly 72 shell experiments for a dedicated Ubuntu 22.04/24.04 VM. Every lesson
sets up a bounded condition, causes behavior, prints labeled evidence, and connects that evidence to
a kernel abstraction. All lessons use `runIn: "shell"`, Bash 5.1+, Linux 5.15+, `/proc`, cgroup v2,
and `LC_ALL=C`. Mutable state must remain under `${LINUX_LAB:-$HOME/linux-systems-lab}` unless a
privileged kernel interface inherently lives elsewhere; those lessons must use a unique
`linux-tutor-$UID-*` name and a cleanup trap.

Canonical tags (2-5 per lesson): `lab`, `shell`, `processes`, `procfs`, `signals`, `scheduling`,
`file-descriptors`, `pipes`, `filesystem`, `inodes`, `mounts`, `storage`, `virtual-memory`,
`page-cache`, `resource-limits`, `cgroups`, `sockets`, `tcp`, `namespaces`, `isolation`, and
`troubleshooting`. PIDs, elapsed time, addresses, fault counts, page counts, and CPU IDs vary;
expected results assert labeled relationships. Advanced Docker, systemd, nftables, `strace`, `fio`,
`perf`, `bpftrace`, and advanced networking belong in future courses.

Safety labels below map directly to lesson `safetyLevel`. `cleanup: trap` means the code installs
the trap before creating a process, FIFO, socket, mount, namespace holder, loop device, or cgroup.
No lesson may use broad `pkill`, `killall`, or host-wide cleanup.

## 1. Lab and shell discipline

1. `build-disposable-linux-lab` — Recreate only `$LINUX_LAB`, print Bash/kernel/OS and writable lab
   evidence. Commands: parameter expansion, `mkdir`, `readlink`, `bash --version`, `uname`,
   `/etc/os-release`. Prerequisite: none. Safety: writes-data; cleanup: learner-owned lab only.
   Lens: reproducible experiments require an explicit failure domain.
2. `identify-kernel-and-userspace` — Compare kernel release with userspace distribution, then prove
   `/proc/version` comes from the running kernel. Commands: `uname`, `/proc/version`,
   `/etc/os-release`, `readlink /proc/self/exe`. Prerequisite: 1. Safety: read-only. Lens: syscall
   provider and userspace release are independently versioned.
3. `inventory-required-commands` — Probe every external program the 72 lessons invoke with
   `command -v`, probe `/usr/bin/time` and `/usr/sbin/mkfs.ext4` by absolute path, confirm the
   relied-on Bash builtins are not shadowed, count missing tools, and assert zero. Commands: `for`,
   `command -v`, `test -x`, `type -t`, arithmetic. Prerequisite: 1. Safety: read-only. Lens:
   capability discovery precedes diagnosis.
4. `normalize-shell-observations` — Show locale-sensitive sort/date output, switch to `LC_ALL=C`,
   and print stable labels. Commands: `locale`, `sort`, `date`, `printf`. Prerequisite: 1. Safety:
   writes-data; cleanup: lab file. Lens: observations need a controlled environment.
5. `coordinate-two-shell-sessions` — Session A blocks reading a FIFO; B writes a token; both print
   the same run ID. Commands: `mkfifo`, `read`, `printf`, `rm`. Prerequisite: 1. Safety:
   writes-data; cleanup: trap. Lens: concurrency is an ordering between independent processes.
6. `cleanup-with-traps` — Start a uniquely recorded child, exit a subshell, and prove its EXIT trap
   removed child and file. Commands: `trap`, `sleep`, `kill`, `wait`, `test`. Prerequisite: 5.
   Safety: writes-data; cleanup: trap. Lens: cleanup is part of experiment correctness.

## 2. Processes and identity

7. `pid-and-parentage` — Spawn a child and print labeled shell PID, child PID, PPID from `/proc`.
   Commands: `bash -c`, `$BASHPID`, `/proc/PID/status`, `ps`. Prerequisite: 6. Safety: read-only;
   cleanup: wait. Lens: process identity is a kernel task relationship.
8. `process-tree` — Create parent/child/grandchild sleeps and observe the hierarchy with `pstree`
   and `ps --forest`. Prerequisite: 7. Safety: writes-data; cleanup: trap. Lens: fork ancestry
   propagates execution context.
9. `proc-process-identity` — Start a uniquely named process and correlate `ps` PID with `/proc/PID`
   status, executable, and start-time fields. Commands: `pgrep`, `readlink`, `awk`. Prerequisite: 7.
   Safety: read-only; cleanup: trap. Lens: procfs is a live projection of kernel task state.
10. `command-line-and-environment` — Launch a child with a lab-only environment token and
    distinguish NUL-delimited `cmdline` from `environ`. Commands: `tr '\0' '\n'`,
    `/proc/PID/{cmdline,environ}`. Prerequisite: 9. Safety: writes-data; cleanup: trap. Lens: argv
    and environment are inherited byte vectors, not process identity.
11. `process-states` — Observe a child sleeping (`S`) and stopped (`T`) before continuing it.
    Commands: `ps stat`, `kill -STOP/-CONT`. Prerequisite: 9. Safety: writes-data; cleanup: trap.
    Lens: task state records why a schedulable entity is not running.
12. `threads-under-task` — Create a multi-threaded helper with Python, compare process PID/TGID and
    `/proc/PID/task` thread IDs. Commands: `python3`, `ps -L`, `find`. Prerequisite: 9. Safety:
    writes-data; cleanup: trap. Lens: Linux schedules tasks while users observe thread groups.

## 3. Lifecycle and signals

13. `foreground-and-background` — Run equivalent sleeps in foreground and background and measure
    when the shell regains control. Commands: `&`, `$!`, `jobs`, `wait`, `date +%s%N`.
    Prerequisite: 7. Safety: writes-data; cleanup: wait. Lens: the shell is a process supervisor.
14. `wait-and-exit-status` — Have children exit 0 and 7, capture `wait` statuses without `set -e`,
    and print both. Commands: `exit`, `wait`, `$?`. Prerequisite: 13. Safety: read-only. Lens: exit
    status is the parent's compact completion channel.
15. `pipelines-are-processes` — Record both pipeline member PIDs/statuses and show `PIPESTATUS` when
    the left side fails. Commands: pipeline, `$BASHPID`, `PIPESTATUS`, `pipefail`. Prerequisite: 14.
    Safety: writes-data; cleanup: lab files. Lens: a pipeline is a graph of concurrent processes.
16. `signal-disposition` — Child traps TERM, prints receipt, remains alive briefly, then exits;
    parent observes each phase. Commands: `trap`, `kill -TERM`, `kill -0`. Prerequisite: 14. Safety:
    writes-data; cleanup: trap. Lens: signal disposition converts asynchronous delivery into policy.
17. `graceful-and-forced-stop` — Compare TERM handled by one child with KILL of another, including
    wait statuses. Commands: `kill -TERM/-KILL`, `wait`. Prerequisite: 16. Safety: writes-data;
    cleanup: exact PIDs. Lens: graceful shutdown is cooperative; SIGKILL is kernel-enforced.
18. `zombies-and-orphans` — Python forks: first child exits while parent delays wait (`Z`), second
    is orphaned and reports changed PPID; all bounded. Commands: `python3`, `ps`, `/proc`.
    Prerequisite: 14. Safety: writes-data; cleanup: trap/time bounds. Lens: termination and reaping
    are distinct.

## 4. File descriptors and pipes

19. `standard-stream-fds` — Redirect a subshell and resolve `/proc/PID/fd/{0,1,2}` while it waits.
    Commands: redirections, `readlink`. Prerequisite: 10. Safety: writes-data; cleanup: trap. Lens:
    stdin/stdout/stderr are conventional descriptor numbers.
20. `redirect-and-duplicate-fds` — Send stdout/stderr separately, then duplicate stderr onto stdout
    and compare files. Commands: `>`, `2>`, `2>&1`, `cmp`. Prerequisite: 19. Safety: writes-data;
    cleanup: lab files. Lens: redirection rewires descriptor table entries.
21. `inherited-open-files` — Parent opens FD 9, child writes through it, and both show the same
    inode via `/proc/*/fd/9`. Commands: `exec 9>>`, `stat`, `readlink`. Prerequisite: 20. Safety:
    writes-data; cleanup: close FD/trap. Lens: fork inherits references to open-file descriptions.
22. `pipe-buffer-backpressure` — A producer writes fixed blocks to an unread pipe, blocks, then a
    consumer drains it; observe state and completed byte count. Commands: `dd`, FIFO, `ps`, `wc`.
    Prerequisite: 19. Safety: writes-data; cleanup: trap; bounded bytes. Lens: finite buffers turn
    throughput mismatch into backpressure.
23. `fifo-process-coordination` — Show FIFO open/read blocking between two sessions and exchange a
    labeled message. Commands: `mkfifo`, `read`, `printf`, `stat`. Prerequisite: 5. Safety:
    writes-data; cleanup: trap. Lens: named pipes add filesystem rendezvous to byte streams.
24. `exhaust-file-descriptors` — In a subshell lower `ulimit -n`, open descriptors until Bash
    rejects one, print count and error, then prove parent limit unchanged. Commands: `ulimit`,
    dynamic `exec`. Prerequisite: 21. Safety: writes-data; cleanup: subshell exit. Lens: descriptor
    limits bound per-process kernel references.

## 5. Filesystem objects

25. `paths-and-inodes` — Create a file, resolve path metadata, rename it, and prove device/inode and
    contents persist. Commands: `stat`, `mv`, `test`. Prerequisite: 1. Safety: writes-data; cleanup:
    lab directory. Lens: directory entries map names to inodes.
26. `hard-link-counts` — Add/remove a hard link and observe stable inode with link count 1→2→1.
    Commands: `ln`, `stat`, `rm`. Prerequisite: 25. Safety: writes-data. Lens: an inode lives while
    names or open references remain.
27. `symlink-resolution` — Create relative and broken symlinks, compare `lstat`/`stat` behavior and
    `readlink -f`. Prerequisite: 25. Safety: writes-data. Lens: symlinks store paths that the VFS
    resolves at lookup time.
28. `permissions-and-umask` — Create files under two umasks and show requested mode minus mask;
    change execute permission and test it. Commands: `umask`, `install`, `stat`, `chmod`.
    Prerequisite: 25. Safety: writes-data. Lens: creation policy and inode mode jointly gate access.
29. `atomic-rename` — Reader loops over one pathname while writer repeatedly renames complete files;
    assert no partial value appears. Commands: `mv`, loops, `sort -u`. Prerequisite: 25. Safety:
    writes-data; cleanup: trap. Lens: same-filesystem rename atomically swaps namespace references.
30. `deleted-open-file` — Child holds an open file, parent unlinks it, `/proc/PID/fd` shows
    `(deleted)` and bytes remain readable through the FD. Prerequisite: 21, 26. Safety: writes-data;
    cleanup: trap. Lens: unlink removes a name, not an active open-file reference.

## 6. Mounts and storage paths

31. `map-mounts-and-devices` — Create a lab file and map its target mount/source with `findmnt`,
    then correlate `df` and `lsblk`. Prerequisite: 25. Safety: read-only. Lens: pathname lookup
    crosses a mount graph before reaching storage.
32. `compare-df-and-du` — Allocate then unlink an open file; show `du` loses the name while
    filesystem free blocks do not recover until close. Commands: `dd`, `df -B1`, `du -B1`,
    `/proc/PID/fd`. Prerequisite: 30, 31. Safety: writes-data; cleanup: trap; bounded 16 MiB. Lens:
    inode reachability and allocated-block accounting answer different questions.
33. `sparse-file-allocation` — Create equal logical-size sparse and allocated files; compare `stat`
    size/blocks and `du --apparent-size`. Commands: `truncate`, `dd`, `stat`, `du`.
    Prerequisite: 31. Safety: writes-data; cleanup: lab files. Lens: logical offsets need not have
    physical blocks.
34. `tmpfs-uses-memory` — Mount a uniquely named bounded tmpfs under the lab, write 8 MiB, compare
    `df` and `free`, then unmount. Commands: `sudo mount -t tmpfs -o size=32m`, `findmnt`, `umount`.
    Prerequisite: 31. Safety: privileged; cleanup: trap. Lens: filesystem pages can be
    memory-backed.
35. `bounded-filesystem-full` — Build a 32 MiB image, format ext4, loop-mount under lab, fill it
    until ENOSPC, and prove host filesystem still has space. Commands: `truncate`, `mkfs.ext4`,
    `mount -o
    loop`, `dd`, `df`. Prerequisite: 31. Safety: privileged; cleanup: trap including
    loop device. Lens: capacity failure belongs to a filesystem boundary.
36. `recover-filesystem-space` — On a fresh bounded image, hold then delete a large file; show space
    recovers only after holder exits, then cleanly unmount. Prerequisite: 32, 35. Safety:
    privileged; cleanup: trap. Lens: recovery requires releasing the last reference, not only
    deleting a name.

## 7. Virtual memory

37. `map-process-address-space` — Start a helper that mmaps a lab file and anonymous region; locate
    both in `pmap` and `/proc/PID/maps`. Commands: Python `mmap`, `pmap`, `awk`. Prerequisite: 12.
    Safety: writes-data; cleanup: trap. Lens: an address space is a map of virtual regions.
38. `compare-rss-and-vsz` — Reserve a large anonymous mapping, touch a bounded subset, and show VSZ
    grows more than RSS. Commands: Python `mmap`, `ps`, `/proc/PID/status`. Prerequisite: 37.
    Safety: writes-data; cleanup: trap; 128 MiB virtual/8 MiB resident. Lens: reservation and
    residency differ.
39. `observe-page-faults` — Read untouched versus warmed pages and compare minor/major fault deltas
    from `/proc/PID/stat` or `time -v`. Prerequisite: 37. Safety: writes-data; cleanup: bounded
    file. Lens: faults lazily connect virtual addresses to resident pages.
40. `warm-the-page-cache` — Read a bounded file twice and compare elapsed time plus `/proc/meminfo`
    cached counters without asserting exact timing. Commands: `dd`, `time`, `vmstat`, `sync` (no
    drop_caches). Prerequisite: 39. Safety: writes-data. Lens: cache turns storage reads into memory
    hits while timing remains noisy.
41. `reclaim-under-pressure` — In a private cgroup with bounded `memory.max`, grow anonymous memory
    below the limit and observe `memory.current`, `memory.events`, and `vmstat` deltas.
    Prerequisite: 38. Safety: privileged; cleanup: trap; max 96 MiB. Lens: reclaim is feedback under
    a memory budget.
42. `bounded-oom-kill` — In a unique cgroup capped at 64 MiB, allocate beyond the limit and prove
    `oom_kill` increments while the VM survives. Prerequisite: 41. Safety: dangerous; cleanup: trap;
    exact cgroup only. Lens: cgroup OOM localizes failure to a resource domain.

## 8. CPU and scheduling

43. `cpu-time-vs-wall-time` — Compare a CPU loop with sleep using Bash `time`; assert similar wall
    duration but much higher user CPU for the loop. Prerequisite: 13. Safety: writes-data; cleanup:
    bounded 1-2 seconds. Lens: elapsed time includes waiting; CPU time measures execution.
44. `load-average-runnable-work` — Sample `/proc/loadavg`, start bounded CPU workers, then show
    runnable count rises without asserting the smoothed averages immediately. Commands: `nproc`,
    Python loops, `uptime`. Prerequisite: 43. Safety: writes-data; cleanup: trap; at most
    min(CPUs,4). Lens: load counts runnable/uninterruptible work, not CPU percentage.
45. `observe-context-switches` — Compare voluntary switches for a sleeper with involuntary switches
    for a CPU loop using `/proc/PID/status`. Prerequisite: 43. Safety: writes-data; cleanup: trap.
    Lens: scheduler handoffs expose blocking and preemption.
46. `change-scheduling-priority` — Run equal bounded workers at nice 0 and 10 on one allowed CPU,
    verify priority, and compare work counts without requiring a fixed ratio. Commands: `nice`,
    `ps`. Prerequisite: 44. Safety: writes-data; cleanup: trap. Lens: nice weights fair-share
    scheduling.
47. `pin-cpu-affinity` — Choose the first allowed CPU, pin a helper with `taskset`, and verify
    `/proc/PID/status` allowed list plus observed `psr`. Prerequisite: 44. Safety: writes-data;
    cleanup: trap. Lens: affinity constrains scheduler placement.
48. `set-io-priority` — Run a bounded reader with idle I/O priority and query its class with
    `ionice -p`; compare to current shell. Prerequisite: 43. Safety: writes-data; cleanup: wait.
    Lens: I/O scheduling policy is separate from CPU scheduling.

## 9. Resource boundaries

49. `limit-open-files` — Lower RLIMIT_NOFILE in a subshell, show `/proc/self/limits`, hit the bound,
    and prove the parent is unchanged. Prerequisite: 24. Safety: writes-data; cleanup: subshell.
    Lens: rlimits are inherited per-process guardrails.
50. `limit-process-count` — As a non-root user, lower RLIMIT_NPROC in a subshell and attempt bounded
    child creation; report whether the configured VM/user enforces it. Commands: `ulimit -u`, `ps`.
    Prerequisite: 49. Safety: writes-data; cleanup: exact children; max 16. Lens: identity-scoped
    limits can differ from shell-local expectations.
51. `limit-file-size` — Set a 1 MiB RLIMIT_FSIZE, attempt a 2 MiB write, capture signal/status and
    final size. Commands: `ulimit -f`, `dd`, `stat`. Prerequisite: 49. Safety: writes-data; cleanup:
    lab file. Lens: kernel limits can terminate a write path at a precise resource boundary.
52. `limit-cpu-time` — Give a CPU loop a 1-second soft limit and capture signal/wait status within a
    bounded wall timeout. Commands: `ulimit -t`, `timeout`, `wait`. Prerequisite: 49. Safety:
    writes-data; cleanup: exact PID. Lens: accounted CPU consumption can trigger asynchronous
    policy.
53. `inspect-cgroup-v2` — Locate the current cgroup from `/proc/self/cgroup`, resolve its cgroup2
    mount, and print controller/current values. Commands: `findmnt`, `stat -fc`, `cat`.
    Prerequisite: 31, 49. Safety: read-only. Lens: cgroups organize processes into hierarchical
    accounting domains.
54. `enforce-cgroup-budget` — Create a unique child cgroup, set bounded `pids.max` and `memory.max`,
    move a helper into it, cause a rejected fork or bounded allocation, and read events.
    Prerequisite: 53. Safety: privileged; cleanup: trap. Lens: controllers enforce budgets on
    groups, not paths.

## 10. Sockets and basic networking

55. `create-listening-socket` — Start a Python TCP server on loopback port 0, record assigned port,
    and observe LISTEN with `ss`. Prerequisite: 6. Safety: writes-data; cleanup: trap. Lens:
    bind/listen gives a process a kernel endpoint and queue.
56. `map-port-to-process` — Correlate server port to PID/FD with `ss -ltnp`, `lsof`, and
    `/proc/PID/fd`. Prerequisite: 55. Safety: read-only; cleanup: trap. Lens: socket ownership joins
    network and process namespaces.
57. `tcp-connection-lifecycle` — Two sessions connect over loopback, sample ESTABLISHED then closing
    state, and print both endpoint tuples. Commands: Python sockets, `ss -tn`. Prerequisite: 55.
    Safety: writes-data; cleanup: trap. Lens: TCP state belongs to a connection, not a process
    alone.
58. `unix-domain-socket` — Exchange bytes over a pathname UNIX socket below the lab and compare
    `ss -xl` plus filesystem entry. Prerequisite: 55. Safety: writes-data; cleanup: trap. Lens:
    local IPC can retain socket semantics without IP routing.
59. `socket-is-a-file-descriptor` — Have a server print its socket FD; correlate `/proc/PID/fd/N`
    `socket:[inode]` with `/proc/net/tcp`. Prerequisite: 56. Safety: read-only; cleanup: trap. Lens:
    sockets participate in the same descriptor lifecycle as files and pipes.
60. `saturate-listen-backlog` — Listen with backlog 1, delay accept, make a bounded set of clients,
    and observe queued/timeout outcomes without changing sysctls. Prerequisite: 57. Safety:
    writes-data; cleanup: trap; loopback only/max 8 clients. Lens: admission queues turn bursts into
    backpressure and refusal.

## 11. Namespaces and isolation

61. `inspect-namespace-membership` — Compare `/proc/self/ns/*` links with a child and show shared
    namespace inode identities. Commands: `lsns`, `readlink`, `stat`. Prerequisite: 9. Safety:
    read-only. Lens: namespace membership selects the views used by syscalls.
62. `isolate-pid-namespace` — `unshare --pid --fork --mount-proc` a bounded shell and prove inner
    PID 1 differs from outer PID. Prerequisite: 61. Safety: privileged; cleanup: trap. Lens: PID
    namespaces virtualize identity and ancestry.
63. `isolate-mount-namespace` — Unshare a mount namespace, mount tmpfs only inside it, compare
    `findmnt` inside/outside, and exit. Prerequisite: 61. Safety: privileged; cleanup: namespace
    exit and trap. Lens: mount namespaces isolate a process's VFS topology.
64. `map-user-namespace` — Use `unshare --user --map-root-user` and compare inner UID/maps to outer
    UID, with a clear skip if disabled by host policy. Prerequisite: 61. Safety: privileged. Lens:
    user namespaces remap credentials rather than granting host root.
65. `isolate-network-namespace` — Start a unique network namespace, show only loopback, bring it up,
    and prove host interfaces differ; no veth or external traffic. Commands: `unshare --net`, `ip`.
    Prerequisite: 61. Safety: privileged; cleanup: namespace exit. Lens: network namespaces isolate
    interfaces, routes, sockets, and ports.
66. `enter-existing-namespace` — Hold a uniquely recorded mount namespace, use `nsenter` by exact
    PID to observe its private tmpfs, then prove host cannot see the mount. Prerequisite: 63.
    Safety: privileged; cleanup: trap. Lens: namespace handles let diagnostic tools join another
    view.

## 12. Troubleshooting capstones

67. `triage-cpu-saturation` — Launch bounded CPU workers, diagnose with `ps`, load/runnable counts,
    per-process CPU time, then stop exact PIDs and show recovery. Prerequisite: 44, 45. Safety:
    writes-data; cleanup: trap. Lens: correlate demand, queueing, and the responsible tasks.
68. `triage-memory-growth` — Grow one helper's anonymous RSS in steps, correlate `free`, `pmap`,
    `/proc/PID/status`, and cgroup/current view, then release it. Prerequisite: 38, 53. Safety:
    writes-data; cleanup: trap; max 96 MiB. Lens: localize memory pressure before choosing
    remediation.
69. `triage-fd-leak` — Helper opens lab files gradually; observe `/proc/PID/fd` count and `lsof`,
    identify the leak pattern, then terminate exact PID. Prerequisite: 21, 49. Safety: writes-data;
    cleanup: trap; max 64 FDs. Lens: exhaustion is explained by ownership plus growth rate.
70. `triage-deleted-file-space` — Create a bounded hidden-space incident, reconcile `df` vs `du`,
    locate `(deleted)` with `lsof +L1`, stop the holder, and show reclaimed bytes. Prerequisite:
    32, 36. Safety: writes-data; cleanup: trap; 16 MiB. Lens: cross-layer accounting finds invisible
    use.
71. `triage-port-collision` — Occupy a loopback ephemeral port, capture a second bind's EADDRINUSE,
    map port to exact owner, stop it, and prove rebind succeeds. Prerequisite: 56. Safety:
    writes-data; cleanup: trap. Lens: errors become actionable when resource identity maps to
    ownership.
72. `capstone-service-outage` — Start a lab service with bounded CPU load, growing FDs, a deleted
    log, and a listening socket; use a staged checklist to identify all causes, gracefully stop
    exact PID, and prove processes/FDs/socket/files are clean. Prerequisite: 67-71. Safety:
    writes-data; cleanup: trap. Lens: incident response is hypothesis-driven correlation across
    kernel abstractions.
