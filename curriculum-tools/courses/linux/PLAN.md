# Linux Systems curriculum plan

## Contract and vocabulary

This deep course retains 72 stable lesson identities for a dedicated Ubuntu 22.04/24.04 VM. The
scope comes from Linux’s distinct process, file, memory, scheduling, resource and isolation
mechanisms, not a lesson quota. Most lessons create a bounded condition and inspect kernel evidence;
the opening inventory and environment lessons prepare that lab. Each later decision must be
supported by an observed state transition, an explicit boundary and a stated measurement limit. All
lessons use `runIn: "shell"`, Bash 5.1+, Linux 5.15+, `/proc`, cgroup v2, and `LC_ALL=C`. Mutable
state must remain under `${LINUX_LAB:-$HOME/linux-systems-lab}` unless a privileged kernel interface
inherently lives elsewhere; those lessons must use a unique `linux-tutor-$UID-*` name and a cleanup
trap.

Canonical tags (2-5 per lesson): `lab`, `shell`, `processes`, `procfs`, `signals`, `scheduling`,
`file-descriptors`, `pipes`, `filesystem`, `inodes`, `mounts`, `storage`, `virtual-memory`,
`page-cache`, `resource-limits`, `cgroups`, `sockets`, `tcp`, `namespaces`, `isolation`, and
`troubleshooting`. PIDs, elapsed time, addresses, fault counts, page counts, and CPU IDs vary;
expected results assert labeled relationships. Advanced Docker, nftables, `strace`, `fio`, `perf`,
`bpftrace`, and advanced networking belong in future courses.

Safety labels below map directly to lesson `safetyLevel`. `cleanup: trap` means the code installs
the trap before creating a process, FIFO, socket, mount, namespace holder, loop device, or cgroup.
No lesson may use broad `pkill`, `killall`, or host-wide cleanup.

## Final evidence and growing ownership

Assume a working shell, but explain kernel mechanisms and unfamiliar flags at first use. PostgreSQL
and SQLite provide optional workload context; neither is a prerequisite. Linux teaches resource and
process lifetime from first principles. Use the learner’s shell, Docker and Kubernetes experience to
shorten familiar usage recaps; retain complete explanations for unfamiliar kernel mechanisms. No
assignment requires rebuilding the learner’s orchestration or sandbox projects. Later networking,
container internals and tracing work should add their distinctive implementation and operational
boundaries.

The roadmap’s early Linux pass can accompany ongoing database work: select the relevant process,
file/descriptor, signal, introductory memory or socket lesson through topics and review its listed
prerequisites. Return later for deeper pressure, scheduling, cgroup and namespace work. The
standalone route follows the stored sequence with complete introductions; prior database experience
can shorten discussion of familiar evidence but never implies Linux completion. Future
database-integration proposals do not migrate lessons or transfer progress in this refactor.

The final deliverable is an incident record for a bounded loopback service: competing hypotheses,
PID-specific and endpoint evidence, the least disruptive justified intervention, a correct response
after recovery, exact resource cleanup and one limit of the experiment. A listening socket, a large
counter or a printed cleanup label alone does not meet that bar. The final outage is a reversible
process stop; it does not establish crash durability or sustained-load capacity.

| Point         | Learner responsibility                                                                    | Supplied help                                                                      |
| ------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Modules 01–03 | Predict identity, execution order and cleanup; explain one observed relationship.         | Full commands, definitions and bounded rerun substitutions.                        |
| Module 04     | Distinguish writer-open blocking, finite buffer pressure and final-writer EOF.            | Two-session command order and endpoint-lifetime hints.                             |
| Modules 05–06 | Choose evidence for publication and space recovery across names, live objects and blocks. | Exact inode, descriptor and filesystem measurements; bounded filesystem controls.  |
| Modules 07–09 | Separate process demand from host totals; defend a placement or budget decision.          | Per-file residency, controlled samples, scoped counters and labeled policy limits. |
| Modules 10–11 | Join endpoint and process ownership; distinguish visibility from authority and budgets.   | Complete commands for each new namespace mechanism and bounded variations.         |
| Module 12     | Choose familiar measurements, reject competing causes and prove useful recovery.          | Symptom-first prompts, runnable hints, full worked experiments and exact cleanup.  |

Each lesson's challenge contains a specific prediction, evidence interpretation, bounded variation,
hint and workload decision. Use those stages flexibly through the existing CLI and wrapper;
full-lesson requests still receive the complete lesson. Completion is recorded only on explicit
learner request. Validation reports document actual variations and host-policy limits.

The recurring integration setting is a small service with processes, open files and a loopback
endpoint. Isolated examples introduce mechanisms; synthesis asks which of those observations justify
an intervention. Retain repeated vocabulary when it adds different evidence: an unlinked inode, host
block accounting and recovery on a bounded filesystem are three useful views.

## 1. Lab and shell discipline

1. `build-disposable-linux-lab` — Recreate only `$LINUX_LAB`, print Bash/kernel/OS and writable lab
   evidence. Commands: parameter expansion, `mkdir`, `readlink`, `bash --version`, `uname`,
   `/etc/os-release`. Prerequisite: none. Safety: writes-data; cleanup: learner-owned lab only.
   Lens: reproducible experiments require an explicit failure domain. Decision: When filing a
   service incident, record the kernel release, image identity, and writable scratch path you would
   preserve.

2. `identify-kernel-and-userspace` — Compare kernel release with userspace distribution, then prove
   `/proc/version` comes from the running kernel. Commands: `uname`, `/proc/version`,
   `/etc/os-release`, `readlink /proc/self/exe`. Prerequisite: 1. Safety: read-only. Lens: syscall
   provider and userspace release are independently versioned. Decision: Choose which identity you
   would use to decide whether a production symptom belongs to a kernel rollout or an
   application-image rollout.

3. `inventory-required-commands` — Probe every external program the 72 lessons invoke with
   `command -v`, probe `/usr/bin/time` and `/usr/sbin/mkfs.ext4` by absolute path, confirm the
   relied-on Bash builtins are not shadowed, count missing tools, and assert zero. Commands: `for`,
   `command -v`, `test -x`, `type -t`, arithmetic. Prerequisite: 1. Safety: read-only. Lens:
   capability discovery precedes diagnosis. Decision: Before diagnosing a failed service command,
   list the binary, permission, and kernel-feature checks you would make first.

4. `normalize-shell-observations` — Show locale-sensitive sort/date output, switch to `LC_ALL=C`,
   and print stable labels. Commands: `locale`, `sort`, `date`, `printf`. Prerequisite: 1. Safety:
   writes-data; cleanup: lab file. Lens: observations need a controlled environment. Decision:
   Choose one locale-sensitive field in a production diagnostic and state the fixed representation
   you would log.

5. `coordinate-two-shell-sessions` — Session A blocks reading a FIFO; B writes a token; both print
   the same run ID. Commands: `mkfifo`, `read`, `printf`, `rm`. Prerequisite: 1. Safety:
   writes-data; cleanup: trap. Lens: concurrency is an ordering between independent processes.
   Decision: Name the readiness signal and the timeout you would add if these shells were a service
   producer and consumer.

6. `cleanup-with-traps` — Start a uniquely recorded child, exit a subshell, and prove its EXIT trap
   removed child and file. Commands: `trap`, `sleep`, `kill`, `wait`, `test`. Prerequisite: 5.
   Safety: writes-data; cleanup: trap. Lens: cleanup is part of experiment correctness. Decision:
   For a worker that owns a temporary file and a child process, state the acquisition order and the
   matching cleanup actions you would register.

## 2. Processes and identity

7. `pid-and-parentage` — Spawn a child and print labeled shell PID, child PID, PPID from `/proc`.
   Commands: `bash -c`, `$BASHPID`, `/proc/PID/status`, `ps`. Prerequisite: 6. Safety: read-only;
   cleanup: wait. Lens: process identity is a kernel task relationship. Decision: State which PID
   and parent relation you would capture before terminating an unexpected service worker.

8. `process-tree` — Create parent/child/grandchild sleeps and observe the hierarchy with `pstree`
   and `ps --forest`. Prerequisite: 7. Safety: writes-data; cleanup: trap. Lens: fork ancestry
   propagates execution context. Decision: Choose whether an orphaned-looking worker needs its
   parent tree, command line, or descriptor evidence next.

9. `proc-process-identity` — Start a uniquely named process and correlate `ps` PID with `/proc/PID`
   status, executable, and start-time fields. Commands: `pgrep`, `readlink`, `awk`. Prerequisite: 7.
   Safety: read-only; cleanup: trap. Lens: procfs is a live projection of kernel task state.
   Decision: Describe the identity tuple you would record before escalating a process incident.

10. `command-line-and-environment` — Launch a child with a lab-only environment token and
    distinguish NUL-delimited `cmdline` from `environ`. Commands: `tr '\0' '\n'`,
    `/proc/PID/{cmdline,environ}`. Prerequisite: 9. Safety: writes-data; cleanup: trap. Lens: argv
    and environment are inherited byte vectors, not process identity. Decision: Decide which safe
    process attributes belong in an incident ticket and which should be redacted.

11. `process-states` — Observe a child sleeping (`S`) and stopped (`T`) before continuing it.
    Commands: `ps stat`, `kill -STOP/-CONT`. Prerequisite: 9. Safety: writes-data; cleanup: trap.
    Lens: task state records why a schedulable entity is not running. Decision: State what
    additional evidence would distinguish an I/O-blocked task from a deliberately stopped one.

12. `threads-under-task` — Create a multi-threaded helper with Python, compare process PID/TGID and
    `/proc/PID/task` thread IDs. Commands: `python3`, `ps -L`, `find`. Prerequisite: 9. Safety:
    writes-data; cleanup: trap. Lens: Linux schedules tasks while users observe thread groups.
    Decision: When a service reports one PID but high CPU, state how you would find the responsible
    task IDs.

## 3. Lifecycle and signals

13. `foreground-and-background` — Run equivalent sleeps in foreground and background and measure
    when the shell regains control. Commands: `&`, `$!`, `jobs`, `wait`, `date +%s%N`.
    Prerequisite: 7. Safety: writes-data; cleanup: wait. Lens: the shell is a process supervisor.
    Decision: Choose whether a service launcher should wait for readiness, completion, or neither,
    and name the evidence.

14. `wait-and-exit-status` — Have children exit 0 and 7, capture `wait` statuses without `set -e`,
    and print both. Commands: `exit`, `wait`, `$?`. Prerequisite: 13. Safety: read-only. Lens: exit
    status is the parent's compact completion channel. Decision: Map status 0, a known application
    failure, and signal termination to three supervisor actions.

15. `pipelines-are-processes` — Record both pipeline member PIDs/statuses and show `PIPESTATUS` when
    the left side fails. Commands: pipeline, `$BASHPID`, `PIPESTATUS`, `pipefail`. Prerequisite: 14.
    Safety: writes-data; cleanup: lab files. Lens: a pipeline is a graph of concurrent processes.
    Decision: State which per-stage status a multi-step ingestion service should retain for
    diagnosis.

16. `signal-disposition` — Child traps TERM, prints receipt, remains alive briefly, then exits;
    parent observes each phase. Commands: `trap`, `kill -TERM`, `kill -0`. Prerequisite: 14. Safety:
    writes-data; cleanup: trap. Lens: signal disposition converts asynchronous delivery into policy.
    Decision: Define the readiness, drain, and exit evidence required for a graceful worker
    shutdown.

17. `graceful-and-forced-stop` — Compare TERM handled by one child with KILL of another, including
    wait statuses. Commands: `kill -TERM/-KILL`, `wait`. Prerequisite: 16. Safety: writes-data;
    cleanup: exact PIDs. Lens: graceful shutdown is cooperative; SIGKILL is kernel-enforced.
    Decision: Specify the escalation deadline and evidence you would require before replacing TERM
    with KILL in production.

18. `zombies-and-orphans` — Python forks: first child exits while parent delays wait (`Z`), second
    is orphaned and reports changed PPID; all bounded. Commands: `python3`, `ps`, `/proc`.
    Prerequisite: 14. Safety: writes-data; cleanup: trap/time bounds. Lens: termination and reaping
    are distinct. Decision: Describe how a supervisor should distinguish unreaped children from
    workers merely reparented during a restart.

## 4. File descriptors and pipes

19. `standard-stream-fds` — Redirect a subshell and resolve `/proc/PID/fd/{0,1,2}` while it waits.
    Commands: redirections, `readlink`. Prerequisite: 10. Safety: writes-data; cleanup: trap. Lens:
    stdin/stdout/stderr are conventional descriptor numbers. Decision: Choose where a service should
    send diagnostics if its normal output is consumed by another process.

20. `redirect-and-duplicate-fds` — Send stdout/stderr separately, then duplicate stderr onto stdout
    and compare files. Commands: `>`, `2>`, `2>&1`, `cmp`. Prerequisite: 19. Safety: writes-data;
    cleanup: lab files. Lens: redirection rewires descriptor table entries. Decision: State how you
    would preserve diagnostics separately while collecting normal service output.

21. `inherited-open-files` — Parent opens FD 9, child writes through it, and both show the same
    inode via `/proc/*/fd/9`. Commands: `exec 9>>`, `stat`, `readlink`. Prerequisite: 20. Safety:
    writes-data; cleanup: close FD/trap. Lens: fork inherits references to open-file descriptions.
    Decision: Describe how inherited logging descriptors can accidentally keep a rotated file or
    socket alive.

22. `pipe-buffer-backpressure` — A producer writes fixed blocks to an unread pipe, blocks, then a
    consumer drains it; observe state and completed byte count. Commands: `dd`, FIFO, `ps`, `wc`.
    Prerequisite: 19. Safety: writes-data; cleanup: trap; bounded bytes. Lens: finite buffers turn
    throughput mismatch into backpressure. Decision: For a streaming service, name the queue-size
    and consumer-progress evidence needed before blaming a blocked producer.

23. `fifo-process-coordination` — Open two writer descriptors in Session B and a reader in A;
    deliver a line, close one writer, then prove EOF follows the final writer close. Commands:
    `mkfifo`, `exec`, `read -r`, coordination markers. Prerequisite: 5. Safety: writes-data;
    cleanup: exact descriptors and paths. Lens: reference lifetime determines stream completion.
    Decision: For a queue consumer, state which endpoint-ownership evidence you need before
    interpreting a blocked read as no more producers.

24. `exhaust-file-descriptors` — In a subshell lower `ulimit -n`, open descriptors until Bash
    rejects one, print count and error, then prove parent limit unchanged. Commands: `ulimit`,
    dynamic `exec`. Prerequisite: 21. Safety: writes-data; cleanup: subshell exit. Lens: descriptor
    limits bound per-process kernel references. Decision: Choose the metric and safe restart
    boundary you would use for a service suspected of leaking descriptors.

## 5. Filesystem objects

25. `paths-and-inodes` — Create a file, resolve path metadata, rename it, and prove device/inode and
    contents persist. Commands: `stat`, `mv`, `test`. Prerequisite: 1. Safety: writes-data; cleanup:
    lab directory. Lens: directory entries map names to inodes. Decision: For a service publishing a
    completed configuration file, state which evidence proves visibility and which evidence would
    still be needed for crash durability.

26. `hard-link-counts` — Add/remove a hard link and observe stable inode with link count 1→2→1.
    Commands: `ln`, `stat`, `rm`. Prerequisite: 25. Safety: writes-data. Lens: an inode lives while
    names or open references remain. Decision: Choose whether a service should use a hard link or
    rename for publishing a replacement file, and defend the reader-visible behavior.

27. `symlink-resolution` — Create relative and broken symlinks, compare `lstat`/`stat` behavior and
    `readlink -f`. Prerequisite: 25. Safety: writes-data. Lens: symlinks store paths that the VFS
    resolves at lookup time. Decision: For a symlink naming the current release, explain how you
    would publish a replacement pointer atomically and verify that its target exists.

28. `permissions-and-umask` — Create files under two umasks and show requested mode minus mask;
    change execute permission and test it. Commands: `umask`, `install`, `stat`, `chmod`.
    Prerequisite: 25. Safety: writes-data. Lens: creation policy and inode mode jointly gate access.
    Decision: Choose a creation mask for a service writing secrets and explain when explicit chmod
    remains appropriate.

29. `atomic-rename` — Reader loops over one pathname while writer repeatedly renames complete files;
    assert no partial value appears. Commands: `mv`, loops, `sort -u`. Prerequisite: 25. Safety:
    writes-data; cleanup: trap. Lens: same-filesystem rename atomically swaps namespace references.
    Decision: State the extra fsync and directory-durability evidence a deployment tool would need
    before claiming a published file survives power loss.

30. `deleted-open-file` — Child holds an open file, parent unlinks it, `/proc/PID/fd` shows
    `(deleted)` and bytes remain readable through the FD. Prerequisite: 21, 26. Safety: writes-data;
    cleanup: trap. Lens: unlink removes a name, not an active open-file reference. Decision: Name
    the process and filesystem evidence you would use before restarting a service to reclaim a
    deleted log’s blocks.

## 6. Mounts and storage paths

31. `map-mounts-and-devices` — Create a lab file and map its target mount/source with `findmnt`,
    then correlate `df` and `lsblk`. Prerequisite: 25. Safety: read-only. Lens: pathname lookup
    crosses a mount graph before reaching storage. Decision: When df names an overlay source, state
    what additional service deployment information you need before attributing a full filesystem to
    a physical disk.

32. `compare-df-and-du` — Allocate then unlink an open file; show `du` loses the name while
    filesystem free blocks do not recover until close. Commands: `dd`, `df -B1`, `du -B1`,
    `/proc/PID/fd`. Prerequisite: 30, 31. Safety: writes-data; cleanup: trap; bounded 16 MiB. Lens:
    inode reachability and allocated-block accounting answer different questions. Decision: Give the
    two commands and one process identifier you would collect before deciding to restart a
    log-writing service.

33. `sparse-file-allocation` — Create equal logical-size sparse and allocated files; compare `stat`
    size/blocks and `du --apparent-size`. Commands: `truncate`, `dd`, `stat`, `du`.
    Prerequisite: 31. Safety: writes-data; cleanup: lab files. Lens: logical offsets need not have
    physical blocks. Decision: State why a deployment’s apparent-size report cannot alone predict
    its actual disk consumption.

34. `tmpfs-uses-memory` — Mount a uniquely named bounded tmpfs under the lab, write 8 MiB, compare
    `df` and `free`, then unmount. Commands: `sudo mount -t tmpfs -o size=32m`, `findmnt`, `umount`.
    Prerequisite: 31. Safety: privileged; cleanup: trap. Lens: filesystem pages can be
    memory-backed. Decision: Decide whether tmpfs is suitable for a service’s scratch output and
    name the memory budget evidence you would require.

35. `bounded-filesystem-full` — Build a 32 MiB image, format ext4, loop-mount under lab, fill it
    until ENOSPC, and prove host filesystem still has space. Commands: `truncate`, `mkfs.ext4`,
    `mount -o
    loop`, `dd`, `df`. Prerequisite: 31. Safety: privileged; cleanup: trap including
    loop device. Lens: capacity failure belongs to a filesystem boundary. Decision: Explain how you
    would distinguish an application ENOSPC from an exhausted host volume.

36. `recover-filesystem-space` — On a fresh bounded image, hold then delete a large file; show space
    recovers only after holder exits, then cleanly unmount. Prerequisite: 32, 35. Safety:
    privileged; cleanup: trap. Lens: recovery requires releasing the last reference, not only
    deleting a name. Decision: State the evidence threshold for declaring hidden-space recovery
    complete after a service restart.

## 7. Virtual memory

37. `map-process-address-space` — Start a helper that mmaps a lab file and anonymous region; locate
    both in `pmap` and `/proc/PID/maps`. Commands: Python `mmap`, `pmap`, `awk`. Prerequisite: 12.
    Safety: writes-data; cleanup: trap. Lens: an address space is a map of virtual regions.
    Decision: Choose whether pmap or /proc/PID/maps better answers a report of unexpected
    file-backed mappings, and explain why.

38. `compare-rss-and-vsz` — Reserve a large anonymous mapping, touch a bounded subset, and show VSZ
    grows more than RSS. Commands: Python `mmap`, `ps`, `/proc/PID/status`. Prerequisite: 37.
    Safety: writes-data; cleanup: trap; 128 MiB virtual/8 MiB resident. Lens: reservation and
    residency differ. Decision: Explain why a large VSZ alone is insufficient evidence for choosing
    a memory limit.

39. `observe-page-faults` — Read untouched versus warmed pages and compare minor/major fault deltas
    from `/proc/PID/stat` or `time -v`. Prerequisite: 37. Safety: writes-data; cleanup: bounded
    file. Lens: faults lazily connect virtual addresses to resident pages. Decision: State what
    additional evidence would be needed before blaming a service latency spike on major faults.

40. `warm-the-page-cache` — Prepare an eight-MiB file, request advisory eviction after syncing it,
    and compare per-file mincore residency before and after two reads. Commands: Python `mmap`,
    `ctypes`, `fsync`, `posix_fadvise`, `dd`, GNU time. Prerequisite: 39. Safety: writes-data;
    cleanup: exact files. Lens: observe cache state at the correct scope; a hint or timing does not
    prove a cold device read. Decision: Decide what evidence, beyond per-file residency, is needed
    to attribute a slow service read to storage.

41. `reclaim-under-pressure` — In a private cgroup with bounded `memory.max`, grow anonymous memory
    below the limit and observe `memory.current`, `memory.events`, and `vmstat` deltas.
    Prerequisite: 38. Safety: privileged; cleanup: trap; max 96 MiB. Lens: reclaim is feedback under
    a memory budget. Decision: Choose a high threshold and hard max for a service, naming the scoped
    event and useful service signal you would review.

42. `bounded-oom-kill` — In a unique cgroup capped at 64 MiB, allocate beyond the limit and prove
    `oom_kill` increments while the VM survives. Prerequisite: 41. Safety: dangerous; cleanup: trap;
    exact cgroup only. Lens: cgroup OOM localizes failure to a resource domain. Decision: State why
    a supervisor needs both cgroup OOM evidence and a request-level recovery check before declaring
    containment successful.

## 8. CPU and scheduling

43. `cpu-time-vs-wall-time` — Compare a bounded CPU loop and sleep under GNU `/usr/bin/time`;
    observe user CPU versus elapsed time without requiring exact timings. Prerequisite: 13. Safety:
    writes-data; cleanup: exact files and bounded processes. Lens: latency includes waiting while
    CPU time accounts execution. Decision: Name both measurements to collect before scaling a
    latency-bound service.

44. `load-average-runnable-work` — Sample `/proc/loadavg`, start bounded CPU workers, then show
    runnable count rises without asserting the smoothed averages immediately. Commands: `nproc`,
    Python loops, `uptime`. Prerequisite: 43. Safety: writes-data; cleanup: trap; at most
    min(CPUs,4). Lens: load counts runnable/uninterruptible work, not CPU percentage. Decision:
    Explain why load alone cannot identify a CPU-incident process.

45. `observe-context-switches` — Compare voluntary switches for a sleeper with involuntary switches
    for a CPU loop using `/proc/PID/status`. Prerequisite: 43. Safety: writes-data; cleanup: trap.
    Lens: scheduler handoffs expose blocking and preemption. Decision: State what workload and
    CPU-placement evidence is needed before acting on a switch counter.

46. `change-scheduling-priority` — Run equal bounded workers with nice increments 0 and 10 on one
    allowed CPU; verify the relative priority difference and inspect work counts without promising a
    fixed ratio. Commands: `nice`, `taskset`, `ps`. Prerequisite: 44. Safety: writes-data; cleanup:
    exact PIDs. Lens: relative scheduler weights do not reserve capacity. Decision: Decide whether
    nice alone protects an interactive service from batch work.

47. `pin-cpu-affinity` — Choose the first allowed CPU, pin a helper with `taskset`, and verify
    `/proc/PID/status` allowed list plus observed `psr`. Prerequisite: 44. Safety: writes-data;
    cleanup: trap. Lens: affinity constrains scheduler placement. Decision: State what latency and
    queueing evidence to check before pinning production work.

48. `set-io-priority` — Run a bounded reader with idle I/O priority and query its class with
    `ionice -p`; compare to current shell. Prerequisite: 43. Safety: writes-data; cleanup: wait.
    Lens: I/O scheduling policy is separate from CPU scheduling. Decision: Name one CPU and one I/O
    measurement for a slow background compaction job.

## 9. Resource boundaries

49. `limit-open-files` — Lower a subshell soft limit, observe child inheritance, restore it within
    the hard ceiling, then lower the hard ceiling and attempt to raise it again. Commands: `ulimit`,
    `/proc/self/limits`. Prerequisite: 24. Safety: writes-data; cleanup: subshell exit. Lens:
    inherited process guardrails and authority are different boundaries. Decision: A service
    repeatedly reaches EMFILE after its supervisor starts it. Which evidence would you collect
    first: the service's /proc/PID/limits row, the supervisor's limit, or a filesystem free-space
    value? Defend the choice from the ownership boundary.

50. `limit-process-count` — As a non-root user, lower RLIMIT_NPROC in a subshell and attempt bounded
    child creation; report whether the configured VM/user enforces it. Commands: `ulimit -u`, `ps`.
    Prerequisite: 49. Safety: writes-data; cleanup: exact children; max 16. Lens: identity-scoped
    limits can differ from shell-local expectations. Decision: A multi-worker service fails to fork
    only after another service account deployment. What UID-scoped evidence and cgroup evidence
    would you collect before changing either limit?

51. `limit-file-size` — Set a 1 MiB RLIMIT_FSIZE, attempt a 2 MiB write, capture signal/status and
    final size. Commands: `ulimit -f`, `dd`, `stat`. Prerequisite: 49. Safety: writes-data; cleanup:
    lab file. Lens: kernel limits can terminate a write path at a precise resource boundary.
    Decision: A log writer stops with SIGXFSZ while df shows free blocks. Which owner and limit
    would you inspect before attempting filesystem cleanup?

52. `limit-cpu-time` — Give a CPU loop a 1-second soft limit and capture signal/wait status within a
    bounded wall timeout. Commands: `ulimit -t`, `timeout`, `wait`. Prerequisite: 49. Safety:
    writes-data; cleanup: exact PID. Lens: accounted CPU consumption can trigger asynchronous
    policy. Decision: A service has low CPU usage but long request latency. Would RLIMIT_CPU alone
    explain it? Name the scheduler or I/O evidence you would obtain.

53. `inspect-cgroup-v2` — Locate the current cgroup from `/proc/self/cgroup`, resolve its cgroup2
    mount, and print controller/current values. Commands: `findmnt`, `stat -fc`, `cat`.
    Prerequisite: 31, 49. Safety: read-only. Lens: cgroups organize processes into hierarchical
    accounting domains. Decision: A service has a generous per-process RLIMIT_NOFILE but still
    cannot fork. Which cgroup pids values and UID-scoped values would you compare?

54. `enforce-cgroup-budget` — Create a unique child cgroup, set bounded `pids.max` and `memory.max`,
    move a helper into it, cause a rejected fork or bounded allocation, and read events.
    Prerequisite: 53. Safety: privileged; cleanup: trap. Lens: controllers enforce budgets on
    groups, not paths. Decision: Choose a limit for a service that must contain a fan-out bug shared
    by several workers. Explain why cgroup pids.max, RLIMIT_NPROC, or RLIMIT_NOFILE matches the
    ownership you need.

## 10. Sockets and basic networking

55. `create-listening-socket` — Start a Python TCP server on loopback port 0, record assigned port,
    and observe LISTEN with `ss`. Prerequisite: 6. Safety: writes-data; cleanup: trap. Lens:
    bind/listen gives a process a kernel endpoint and queue. Decision: A health check sees LISTEN
    but requests fail. What request/response evidence would you collect before declaring the service
    recovered?

56. `map-port-to-process` — Correlate server port to PID/FD with `ss -ltnp`, `lsof`, and
    `/proc/PID/fd`. Prerequisite: 55. Safety: read-only; cleanup: trap. Lens: socket ownership joins
    network and process namespaces. Decision: A loopback bind reports EADDRINUSE. State the
    endpoint, process, and descriptor evidence you would collect before stopping any process.

57. `tcp-connection-lifecycle` — Start a bounded loopback listener in Session A and connect from B;
    correlate a timing-sensitive ESTAB sample with accepted-connection and exchanged-payload
    evidence. Commands: Python sockets, ss, readiness files. Prerequisite: 55. Safety: writes-data;
    cleanup: exact process and lab paths. Lens: a socket state snapshot and completed work answer
    different questions. Decision: A service port is open but a client handshake times out. Which
    endpoint-state and request-completion evidence distinguishes admission from useful service?

58. `unix-domain-socket` — Exchange bytes over a pathname UNIX socket below the lab and compare
    `ss -xl` plus filesystem entry. Prerequisite: 55. Safety: writes-data; cleanup: trap. Lens:
    local IPC can retain socket semantics without IP routing. Decision: Choose a UNIX or loopback
    TCP endpoint for a local supervisor and service. Defend the choice using rendezvous visibility
    and endpoint scope.

59. `socket-is-a-file-descriptor` — Have a server print its socket FD; correlate `/proc/PID/fd/N`
    `socket:[inode]` with `/proc/net/tcp`. Prerequisite: 56. Safety: read-only; cleanup: trap. Lens:
    sockets participate in the same descriptor lifecycle as files and pipes. Decision: An incident
    report has only a TCP-table inode. Describe the additional process and request evidence needed
    before deciding to restart an owner.

60. `saturate-listen-backlog` — Listen with backlog 1, delay accept, make a bounded set of clients,
    and observe queued/timeout outcomes without changing sysctls. Prerequisite: 57. Safety:
    writes-data; cleanup: trap; loopback only/max 8 clients. Lens: admission queues turn bursts into
    backpressure and refusal. Decision: A service sees connection timeouts under a burst. Which
    listener, queue, accepted-request, and worker evidence would you gather before choosing a
    backlog change?

## 11. Namespaces and isolation

61. `inspect-namespace-membership` — Compare `/proc/self/ns/*` links with a child and show shared
    namespace inode identities. Commands: `lsns`, `readlink`, `stat`. Prerequisite: 9. Safety:
    read-only. Lens: namespace membership selects the views used by syscalls. Decision: Before
    debugging a service from the host shell, which namespace handles would you compare to decide
    whether your process, mount, and socket observations refer to its view?

62. `isolate-pid-namespace` — `unshare --pid --fork --mount-proc` a bounded shell and prove inner
    PID 1 differs from outer PID. Prerequisite: 61. Safety: privileged; cleanup: trap. Lens: PID
    namespaces virtualize identity and ancestry. Decision: A diagnostic shows PID 1 in a service
    shell. Which namespace-handle and outer-PID evidence would you request before treating it as the
    host init process?

63. `isolate-mount-namespace` — Unshare a mount namespace, mount tmpfs only inside it, compare
    `findmnt` inside/outside, and exit. Prerequisite: 61. Safety: privileged; cleanup: namespace
    exit and trap. Lens: mount namespaces isolate a process's VFS topology. Decision: A service sees
    a different configuration file than the host shell. Which mount-namespace and path-resolution
    evidence would you gather before changing the host file?

64. `map-user-namespace` — Use `unshare --user --map-root-user` and compare inner UID/maps to outer
    UID, with a clear skip if disabled by host policy. Prerequisite: 61. Safety: privileged. Lens:
    user namespaces remap credentials rather than granting host root. Decision: A process reports
    UID 0 inside a sandbox. What mapping and capability-context evidence would you need before
    authorizing a host-level action?

65. `isolate-network-namespace` — Start a unique network namespace, show only loopback, bring it up,
    and prove host interfaces differ; no veth or external traffic. Commands: `unshare --net`, `ip`.
    Prerequisite: 61. Safety: privileged; cleanup: namespace exit. Lens: network namespaces isolate
    interfaces, routes, sockets, and ports. Decision: A service's port is absent from host ss
    output. Which network-namespace handle and in-namespace socket evidence would you collect before
    deciding it is not listening?

66. `enter-existing-namespace` — Hold a uniquely recorded mount namespace, use `nsenter` by exact
    PID to observe its private tmpfs, then prove host cannot see the mount. Prerequisite: 63.
    Safety: privileged; cleanup: trap. Lens: namespace handles let diagnostic tools join another
    view. Decision: An operator needs to inspect a service's private mount. Describe the target-PID,
    namespace-type, in-view, host-view, and cleanup evidence required for a safe diagnosis.

## 12. Troubleshooting capstones

67. `triage-cpu-saturation` — Pin two bounded workers to one allowed CPU, measure per-PID CPU tick
    deltas and placement, then stop and verify both owners are absent. Commands: `taskset`,
    `/proc/PID/stat`, `ps`, `vmstat`. Prerequisite: 46, 47. Safety: writes-data; cleanup: exact
    PIDs. Lens: local contention is not proof of host-wide saturation. Decision: A service is pinned
    to one busy CPU while other allowed CPUs are idle. Defend either relaxing affinity or adding
    capacity, naming a request-latency measurement you would collect before and after.

68. `triage-memory-growth` — Gate a helper between 16 and 64 MiB of touched buffers, compare process
    RSS, inspect mapping/host/group context, and verify the owner exits. Commands: Python, `awk`,
    `pmap`, `free`, `findmnt`. Prerequisite: 38, 53. Safety: writes-data; cleanup: exact PID and
    gates. Lens: controlled intervals and accounting boundaries establish attribution. Decision: A
    worker shares a cgroup with a cache process. Choose measurements needed before lowering the
    worker's budget, and state how you would distinguish retained application memory from a bounded
    cache.

69. `triage-fd-leak` — Hold twelve lab files, gate another thirty-six opens, and join the descriptor
    delta to the exact retained paths before stopping the owner. Commands: `find /proc/PID/fd`,
    `lsof`, readiness files. Prerequisite: 21, 49. Safety: writes-data; cleanup: exact PID and at
    most 48 files. Lens: measure retained resources per work batch before changing a budget.
    Decision: A long-running worker grows by 36 descriptors per batch. Estimate how many further
    batches its measured soft limit permits, and explain why raising the limit delays failure
    without correcting ownership.

70. `triage-deleted-file-space` — Unlink a sixteen-MiB file while its helper holds it; join exact
    PID, deleted descriptor and allocated blocks, then verify the holder exits. Commands:
    `lsof -a -p PID +L1`, `stat -L`, `du`, `df`. Prerequisite: 32, 30. Safety: writes-data; cleanup:
    exact files/PID. Lens: names, references and block allocation have different lifetimes; host
    free-space deltas remain noisy. Decision: A service retains yesterday's rotated log. Choose a
    graceful close/reopen or restart procedure and a postcondition that proves the old reference
    ended without claiming all host free-space changes came from this file.

71. `triage-port-collision` — Cause EADDRINUSE on one loopback port, attribute its owner, stop that
    owner and actually rebind. Commands: Python sockets, `ss`, `lsof`. Prerequisite: 56. Safety:
    writes-data; cleanup: exact PID and metadata. Lens: endpoint availability and useful request
    handling require different proof. Decision: A deployment reports address already in use. State
    the evidence needed to distinguish an old instance from an unrelated service before selecting
    shutdown, a different port or a configuration correction.

72. `capstone-service-outage` — Begin with a timed-out health request despite a listener; choose
    process/socket/file evidence, resume the exact stopped service, receive a correct response, then
    separately verify graceful teardown. Commands: `ps`, `ss`, `lsof`, Python request/reply, `kill`,
    `wait`. Prerequisite: 11, 16, 67, 68, 69, 70, 71. Safety: writes-data; cleanup: exact process,
    independent watchdog, twelve tiny files, one-MiB deleted log. Lens: diagnose causally and prove
    availability end to end. Decision: Submit a short incident record: two hypotheses, three
    measured observations, the least disruptive justified intervention, a successful response, exact
    cleanup evidence and one limit of the experiment. Explain what load and crash-recovery tests
    would still be needed before making a production capacity or durability claim.
