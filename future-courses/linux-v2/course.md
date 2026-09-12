# Linux Systems v2

Status: proposed. Updated: 2026-09-12.
Course ID: `linux-v2`. Implementation: none.
Outline revision: 2. Final-outline sign-off: pending.

## Goal and scope

Build Linux systems knowledge that makes Nick better at understanding databases and distributed
systems, while retaining a useful general Linux foundation. Follow ownership, lifetime, accounting,
queues, and isolation from an application symptom to kernel evidence and a checked intervention.
Examples connect to database clients, backup/export pipelines, data files, caches, local endpoints,
and container budgets. The core uses small supplied workers; it does not require another database
course, a new application, or failure injection into the learner's live database.

Assume routine shell, Docker, and Kubernetes use plus prior OSTEP and How Linux Works reading.
Explain unfamiliar mechanisms and flags before commands. Continue PostgreSQL and use individual
Linux observations when helpful; this route is not a prerequisite detour. Database courses retain
their own pages, transactions, WAL, recovery, and query-engine depth.

## Size and pacing

**44 lessons: retain all 32 first-draft mechanisms and add 12.** At the target ten minutes each,
the core is **7 hours 20 minutes**, two hours longer than revision 1. The fifteen-minute per-lesson
ceiling corresponds to eleven hours for the whole route; it is a ceiling, not a second target.
Include explanation, setup, experiment, interpretation, and cleanup in these estimates.
Timing and experiments remain unvalidated until authored in approved batches.

Allow an estimated 15–30 minutes separately for one-time tool and capability setup on a suitable
Linux VM. Fresh-machine installation time is not measured. Introduce dependencies by batch.
Alternatives in the route are optional design choices and add no required lessons or study time.

## Research and breakdown rationale

Nick clarified the database/distributed-systems focus on 2026-09-12 and asked to add worthwhile
omissions to the original 32. The count follows that scope rather than a requirement to fit equal
four-lesson groups. Reordering places additions beside their prerequisites. All original v2 slugs
are retained; only planned numbering changes. No catalog or learner progress is migrated.

The [learner profile](../../docs/learner-profile.md),
learning roadmap (`tutor roadmap`), and
[Linux/database integration note](../../docs/knowledge/linux-database-integration.md) support
teaching kernel mechanisms once and using database-specific contrasts where they add evidence.
The [existing 72-lesson course](../../curriculum-tools/courses/linux/PLAN.md) supplies tested
research and candidate fixtures. Its [evidence findings](../../docs/knowledge/linux-evidence-and-variations.md)
set the bar for scoped attribution and useful recovery. Reusing a topic is not validation of v2.

| Lessons | Group | Why it earns this space and position |
| --- | --- | --- |
| 1–6 | Processes, threads, and lifetime | Identify the owner before tracing or stopping it. Threads and orphans deserve separate experiments; neither follows automatically from PID or zombie vocabulary. |
| 7–12 | Pipelines, descriptors, and limits | Carry process ownership into pipeline errors, shared references, EOF, pressure, and exhaustion. Soft/hard authority is separate from measuring an FD leak. |
| 13–20 | Files, publication, and storage | Restore access policy, path resolution, and allocation before connecting write/sync activity to storage evidence. Sync interfaces support database reasoning without repeating WAL/recovery. |
| 21–24 | Memory maps and accounting | Reservation, sharing, private copying, and file-cache residency establish the meaning of later budgets. |
| 25–29 | Execution, scheduling, and pressure | Separate CPU time, blocking/preemption evidence, placement contention, quota, and PSI. Context/load observations inform diagnosis; they are not automatic tuning advice. |
| 30–33 | Memory and task budgets | Keep reclaim, OOM, task admission, and tmpfs charges as four bounded questions. |
| 34–38 | Endpoints and queues | Restore Unix sockets alongside TCP ownership, useful requests, accept queues, and established-stream backpressure. |
| 39–42 | Namespace views and authority | Revisit process, file, endpoint, and credential evidence through one isolated namespace type at a time. |
| 43–44 | Short diagnostic lessons | Practise choosing evidence from symptoms after learning the mechanisms. No report, homework, or separate review stage. |

The [Cursor article notes](../../docs/articles/cursor-git-at-any-scale.md) motivate publication
and object lifetime; Nick explicitly liked their connection to familiar database principles.
The [ZGateway notes](../../docs/articles/zgateway-zippydb-proxy.md) motivate resource cost and
backpressure; that connection is our teaching proposal, not a claimed learner preference or
local reproduction of Meta's architecture.

## The 12 additions

The numbers below are positions in revision 2. Eleven additions restore or expand original-course
coverage; the process/device I/O lesson substantially expands the original mount-mapping question.

| New position | Addition | Database/distributed-systems value | Original reference |
| --- | --- | --- | --- |
| Lesson 2 | Find the busy thread | Attribute CPU inside threaded database clients and service runtimes. | 12 |
| Lesson 6 | A parent exits but its worker survives | Understand leftover workers and connection holders during restarts. | 18 (orphan half) |
| Lesson 7 | A successful last stage can hide failure | Protect backup, export, compression, and ingestion jobs from hidden failures. | 15; folds in 19–20 |
| Lesson 11 | An inherited limit has two ceilings | Understand connection/file exhaustion and the boundary for raising limits. | 49 |
| Lesson 13 | Creation permissions follow the writer | Diagnose database/export file access without granting broad permissions. | 28 |
| Lesson 14 | A symlink stores a path, not its target | Understand release pointers, mounted paths, and missing-file surprises. | 27 |
| Lesson 18 | Logical file size differs from allocated space | Estimate real disk consumption and copying/backup implications. | 33 |
| Lesson 20 | Follow writes from process to filesystem | Connect database write symptoms to the right storage/accounting boundary. | 31 expanded; new I/O-counter experiment |
| Lesson 26 | Blocking and preemption leave different counters | Distinguish blocked work from scheduler competition before blaming a query or service. | 45; 44 interpreted with less standalone practice |
| Lesson 35 | Use a Unix socket for local requests | Understand local PostgreSQL connections and service IPC. | 58 |
| Lesson 43 | Find the owner of growing memory | Restore symptom-first attribution practice for caches and database clients. | 68 |
| Lesson 44 | Diagnose and recover useful service | Restore cross-mechanism diagnosis without a separate capstone report. | 72 |

## Route

**The third column is the suggested starting CLI/tool approach**, followed by second and third options
where they add a useful alternative. These are teaching approaches, not finished commands.
Tools within one cell work together; they are not all competing alternatives. Every row has a
primary approach and at least one meaningful alternate, sometimes with less evidence as labelled.
A dash means no worthwhile third approach for this short lesson.

Use shell and existing Linux tools first; supply Go helpers where they are needed to cause a
controlled phenomenon. 'Go helper' below is a proposed supplied fixture, not an already installed
CLI or an assignment to write a program. Keep its lifecycle and gates visible. Pin or account for
OS threads where required; a goroutine is not a Linux TID. Avoid unsafe raw-fork tricks in Go.

Prefer direct kernel evidence when testing a kernel limit. Docker alternatives must retain the
relevant cgroup or namespace observations; summary output alone is not equivalent. Container-based
alternatives require a suitable runtime and permissions, while procfs-based alternatives often
avoid extra tools. `perf`, `smem`, and `socat` are optional, not course-wide prerequisites.

All rows remain **planned**, and no tool choice is agreed yet. Before creating each lesson batch,
discuss its proposed approaches with Nick: the phenomenon each makes visible, required helpers and
setup, evidence quality, and how much time the approach adds. Record the chosen approach for each
lesson below after that conversation, then author and validate the agreed path. A batch request
does not by itself settle an unresolved tool choice. Reuse recorded choices without repeating the
discussion unless evidence requires a material change. An alternate with weaker evidence must
state its limit; it cannot silently replace the required outcome. Do not require all options.

| # | Lesson / stable slug | Suggested CLI/tool approach | Option 2 | Option 3 | Cause and observe | Systems insight |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | The PID survives exec / `pid-survives-exec` | Bash `exec`, `ps`, `readlink /proc/PID/exe` | `strace` of exec plus PID evidence | Go launcher plus the same procfs observations | Replace an owned shell with a worker; compare PID, parent, and executable before and after. | A process identity and the program it executes have different lifetimes. |
| 2 | Find the busy thread / `attribute-work-to-threads` | Go worker with explicit OS-thread binding + `ps -L`, `pidstat -t` | `top -H` for observation + recorded TIDs and bounded counters | `/proc/PID/task/TID/stat` deltas | Gate one busy and one waiting OS thread in a small worker; join reported TIDs to task-level CPU deltas. | Database clients and service runtimes can hide different task behavior behind one process PID. |
| 3 | See what the worker is waiting for / `trace-a-blocked-worker` | `strace` of an owned blocked reader + supplied worker | `ps` state + `/proc/PID/wchan` and controlled release (less syscall detail) | — | Hold a worker on an empty pipe, trace its read, then release it with a byte. | Join a syscall, descriptor, and controlled cause; elapsed syscall time alone is not a complete diagnosis. |
| 4 | Graceful shutdown needs cooperation / `cooperative-shutdown` | Bash `trap`, `kill`, `wait` + cleanup marker | Go signal-aware worker with the same TERM/KILL comparison | `strace` signal/exit evidence plus marker | Run the same tiny worker with TERM and KILL; compare exit evidence and its cleanup marker. | Signal delivery, application cleanup, and forced termination are separate events. |
| 5 | Exited children still need reaping / `exit-before-reap` | Go child launcher delaying Wait + `ps`, procfs | `strace` of child exit and parent wait + `ps` | — | Hold a parent before wait, observe its exited child, then release the parent to reap it. | A zombie is retained exit bookkeeping; killing it does not replace the parent's wait. |
| 6 | A parent exits but its worker survives / `orphan-worker-reparenting` | Supplied Go subreaper/launcher + `pstree`, `ps`, procfs | Private `unshare --pid --fork --mount-proc` fixture with an explicit reaping parent | — | Exit an owned intermediate parent while its child stays alive; observe changed PPID and completion under a bounded subreaper. | Parent exit and descendant termination differ; identify the actual adopter rather than assuming host PID 1. |
| 7 | A successful last stage can hide failure / `pipeline-failure-propagation` | Bash `PIPESTATUS`, `set -o pipefail`, stdout/stderr redirection | Launch two stages around a FIFO and explicitly `wait` for each | — | Make the producer of a bounded export-like pipeline fail while its consumer succeeds; inspect stage statuses and enable pipefail. | Pipeline success is a policy choice. Keep data and diagnostics separate while assessing each stage. |
| 8 | Inherited descriptors share an offset / `inherited-file-offset` | Bash inherited FD + bounded reads, `/proc/PID/fdinfo` | Go parent/child with explicit inherited file | `strace` of read offsets and inherited FD | Pass an open regular-file descriptor to a child; alternate reads and inspect positions. | Distinct descriptor tables can reference one open file description. |
| 9 | Why the pipe never reaches EOF / `last-writer-controls-eof` | Bash `mkfifo`, `exec`, `read`, close writer FDs | Go helper holding two pipe writers | `strace` of read/close with the same fixture | Retain one otherwise-unused write descriptor, then close it and observe the reader finish. | End-of-stream depends on all writers releasing their references. |
| 10 | A slow reader stalls its producer / `pipe-backpressure` | `mkfifo`, bounded `dd`, controlled reader + `ps` | Go producer/consumer with byte counters | `strace` of blocked write and resumed progress | Pause a pipe reader, observe bounded producer progress stall, then resume draining. | A finite kernel buffer couples producer progress to consumer capacity. |
| 11 | An inherited limit has two ceilings / `soft-hard-limit-authority` | Bash `ulimit -Sn/-Hn`, `/proc/PID/limits` under `setpriv` | `prlimit` on an owned unprivileged launcher | Go getrlimit/setrlimit helper + procfs verification | In an unprivileged disposable child, vary the soft FD limit, lower the hard limit, and observe a failed attempt to raise it. | A worker's effective limits and authority explain why restarting or changing a shell setting may not fix exhaustion. |
| 12 | Follow an FD leak to its limit / `descriptor-growth-and-emfile` | Bash `ulimit`, Go opener + procfs FD counts | `prlimit` launcher + `lsof` on the same worker | `strace` of open/close and EMFILE | Under a low inherited descriptor limit, retain a small fixed number of files per batch and reach EMFILE; close them and retry. | Growth, ownership, and the effective process limit explain exhaustion. |
| 13 | Creation permissions follow the writer / `creation-mask-and-access` | Bash `umask`, `stat`, `chmod`, `setpriv` + read probe | Go file creator + the same unprivileged probe | Disposable container users + bind-mounted owned files (extra setup) | Create the same requested file mode under two umasks; test a second unprivileged reader and verify a deliberate mode correction. | Creation policy affects database files, exports, and credentials; root access is not a useful permissions test. |
| 14 | A symlink stores a path, not its target / `relative-symlink-resolution` | `ln -s`, `readlink`, `namei -l`, `stat` with/without dereference | `realpath`, `ls -l`, explicit component-by-component checks | Go Lstat/Readlink/Stat helper | Move a directory containing a relative symlink, break its target deliberately, and locate the failed lookup component. | Release pointers and storage paths depend on lookup context; this does not teach hard-link semantics. |
| 15 | Deleted does not mean reclaimed / `unlink-retains-open-file` | `lsof -a -p PID +L1`, `stat`, `du`, `df` + held file | `readlink`, `stat` through `/proc/PID/fd` | Go holder plus identical file/block evidence | Unlink an owned open file; join its deleted descriptor to allocated blocks, then close it. | Names and open references have different lifetimes; unrelated host free-space changes are noisy. |
| 16 | Replacing a path leaves old readers intact / `rename-publishes-new-inode` | Bash `mv`, `stat`, retained FD and fresh `cat` | Go `os.Rename` + old/new readers | `strace` of rename/open/read plus inode checks | Replace a file by same-filesystem rename while retaining an old reader; compare old and newly opened contents and inodes. | Atomic path replacement and existing-reader lifetime compose into a publication mechanism. |
| 17 | What a sync request actually covers / `trace-file-and-directory-sync` | `strace` + supplied Go file/directory-sync publisher | Go publisher with phase labels, supported by the same syscall trace | — | Trace a supplied file-write, sync, rename, directory-sync sequence and attribute calls to the file or directory. | File contents and directory entries have distinct synchronization needs; this trace does not simulate power loss. |
| 18 | Logical file size differs from allocated space / `sparse-file-space` | `truncate`, bounded `dd`, `stat`, `du --apparent-size` | Go seek/write helper + the same stat/block evidence | `cp --sparse=always` on an owned zero-filled file + stat (filesystem dependent) | Create small equal-logical-size sparse and written files; compare apparent bytes with allocated blocks on the same filesystem. | Database images, backups, and scratch files need allocation-aware capacity estimates. |
| 19 | Run out of space on one filesystem / `bounded-filesystem-full` | `mkfs.ext4`, private loop `mount`, bounded `dd`, `df` | Small private tmpfs + bounded write (memory-backed contrast) | — | Fill a tiny private filesystem to ENOSPC, identify its mount, remove owned data, and prove a new write succeeds. | The relevant capacity belongs to the target filesystem; successful recovery needs a write. |
| 20 | Follow writes from process to filesystem / `process-and-device-io-evidence` | Go writer + `pidstat -d`, `findmnt`, `iostat -xz` | `/proc/PID/io`, `/proc/diskstats`, `lsblk` + the same bounded writer | `strace` write/sync calls + mount mapping (syscall view only) | Run a small writer with a known sync point; map its file to the filesystem and compare process I/O deltas with device interval counters. | Application bytes, kernel I/O accounting, and shared-device traffic have different scopes; no physical-device latency or exclusive attribution claim. |
| 21 | Reserve memory, then touch it / `reservation-and-residency` | Go mmap/touch helper + `pmap`, `/proc/PID/smaps`, fault deltas | `pidstat -r` + procfs maps for the same helper | GNU `time -v` + mapping evidence (whole-run fault totals) | Reserve a bounded anonymous mapping, touch a subset, and compare mapping size, residency, and fault deltas. | Address-space reservation and resident memory answer different questions. |
| 22 | Shared pages appear in several processes / `shared-pages-rss-pss` | Two Go file mappers + matching `/proc/PID/smaps` entries | `smem` per-process summaries + mapping-level procfs checks | `pmap -XX` if its fields support the required mapping evidence | Map and read the same small file in two workers; inspect the matching mappings' RSS and PSS. | Summing RSS can count shared pages repeatedly; PSS apportions shared resident pages. |
| 23 | A private write creates a private page / `private-mapping-copy-on-write` | Go private mmap helper + smaps and unchanged backing file | `pmap -XX` with the same helper and file checks | — | Write one page through a private file mapping; compare its private-dirty accounting with a second reader and the unchanged file. | Copy-on-write separates private changes from the shared backing data. |
| 24 | Inspect the file cache directly / `file-cache-residency` | `fincore` snapshots + bounded reads of an owned file | Go `mincore` helper for region-level residency | — | Read an owned file in bounded regions and compare residency snapshots for those pages. | Cache residency is stronger evidence than a faster second read; it still does not prove physical-device traffic. |
| 25 | CPU time and elapsed time diverge / `execution-versus-waiting` | GNU `/usr/bin/time` + bounded compute/block workers | `pidstat -u` + application elapsed/progress counters | Per-PID procfs CPU deltas + monotonic timestamps | Compare a bounded compute interval with a controlled blocking interval using CPU and wall-time deltas. | Long elapsed time needs attribution before assuming CPU demand. |
| 26 | Blocking and preemption leave different counters / `blocking-and-preemption-evidence` | `pidstat -w`, `ps`, `taskset`, `/proc/loadavg` | Per-thread `/proc/PID/task/TID/status` deltas + work counters | `perf stat` context-switch totals (less classification detail) | Compare bounded blocking and competing CPU workers through per-task switch deltas; relate task state to the host runnable/load snapshot. | Scheduler counters support a cause only with workload context; load is not CPU percentage or process attribution. |
| 27 | Contention depends on allowed CPUs / `affinity-and-runqueue-contention` | `taskset`, `pidstat -u`, bounded work counts | `ps` placement + procfs scheduler/CPU deltas | `perf stat` for the owned workers if available (extra permissions) | Pin two bounded workers to one allowed CPU; measure their progress and scheduling delay before and after removing one competitor. | Local runnable contention can exist without saturating the whole host. |
| 28 | A CPU budget can throttle runnable work / `cpu-quota-throttling` | Shell writes to private cgroup `cpu.max`; read `cpu.stat` + progress | Docker CPU quota + the same underlying cgroup counters | — | Locate an owned group's ancestry, lower its CPU quota, and compare completed work with throttling deltas. | Placement and bandwidth are different constraints. |
| 29 | Pressure measures lost progress / `cpu-pressure-and-progress` | `taskset`, private `cpu.pressure` interval totals + work counts | Supplied sampler of the same cgroup PSI files | — | Add a bounded runnable competitor on the same CPU in an owned group; compare CPU PSI total deltas and useful work with the baseline. | Stall accounting complements utilization; it is not an individual request-latency measurement. |
| 30 | Memory reclaim can slow a live worker / `memory-high-reclaim` | Private `memory.high`, event/stat counters + bounded Go worker | Disposable container with delegated controller access + same counters | — | Cross a small group's memory.high under a bounded workload; inspect high events, reclaim evidence, and progress. | A reclaim threshold can impair progress without being an OOM trigger. |
| 31 | Attribute a cgroup OOM / `memory-max-oom-evidence` | Private `memory.max`, `memory.events`, worker exit evidence | Docker memory limit + inspect OOM state and kernel counters | — | Exhaust a small owned memory budget with bounded anonymous allocation; correlate termination with oom and oom_kill event deltas. | Exit status alone does not identify the cause of termination. |
| 32 | Bound task creation across workers / `pids-budget-enforcement` | Private `pids.max`, `pids.events` + bounded child launcher | Docker task limit + underlying controller events | — | Hit a small group's task limit with a strictly bounded helper; observe rejected creation and the matching event. | A group budget covers descendants and counts kernel tasks, including threads. |
| 33 | tmpfs spends the memory budget / `tmpfs-memory-accounting` | Private tmpfs `mount`, `dd`, `memory.current`, `memory.stat` | Docker tmpfs + same kernel accounting (not Docker summary alone) | — | Write a small private tmpfs file from an owned group; compare memory.current and shmem accounting before and after removal. | Filesystem-backed work can consume the same memory budget as application allocations. |
| 34 | Attribute a port collision / `socket-owner-and-rebind` | Go loopback helper + `ss -ltnp`, explicit retry bind | `lsof` + procfs FD join with same bind probe | `strace` of failed and successful bind + owner evidence | Cause a loopback bind collision, identify the exact socket owner, release it, and actually rebind. | An endpoint conflict needs ownership evidence before an intervention. |
| 35 | Use a Unix socket for local requests / `unix-socket-rendezvous` | Go Unix-socket HTTP fixture + `curl --unix-socket`, `ss -xlpn` | `socat` Unix listener/client + `lsof` (extra dependency) | Go raw Unix client/server + procfs socket evidence | Exchange one bounded request over a pathname Unix socket, inspect its owning process and directory entry, then remove the owned endpoint. | Local database/service IPC can use filesystem rendezvous without TCP routing; filesystem visibility and socket ownership must both be checked. |
| 36 | LISTEN does not prove useful service / `listener-versus-request-progress` | `curl` to Go HTTP fixture, `kill -STOP/-CONT`, `ps`, `ss` | Go request client with deadline + identical state checks | `strace` of client/server around the controlled pause | Pause an owned listener's process, show a failed bounded request, then resume it and complete a correct response. | Endpoint existence and application progress need separate checks. |
| 37 | Delayed accept fills an admission queue / `bounded-accept-queue` | Go delayed-accept fixture + `ss`, bounded clients | `strace` accept/connect events + app outcome counters | — | Delay accept with a small backlog and bounded clients; correlate listener queue snapshots with connection and accept outcomes. | Admission capacity is finite; nominal backlog is not an exact portable client-count promise. |
| 38 | A slow TCP reader backs up its sender / `tcp-slow-reader-backpressure` | Go slow-reader fixture + `ss -tinm`, byte counters | `strace` read/write progress + receiver byte count | — | Pause an established peer's reads; observe queued bytes and bounded sender progress, then drain and verify received data. | Connection establishment and local send acceptance do not prove peer consumption. |
| 39 | One process has two PID views / `pid-namespace-views` | `unshare --pid --fork --mount-proc`, `ps`, procfs IDs | Disposable Docker process + host/inner procfs comparison | — | Run a child in a private PID namespace with matching procfs; correlate its inner and outer identities. | The observer's PID namespace changes identifiers and process visibility. |
| 40 | The same path resolves through different mounts / `mount-namespace-path-views` | `unshare`, private mount, `findmnt`, `nsenter` | Docker bind mount + host/inner file comparison | `/proc/PID/mountinfo` as the observer with the same fixture | Add a private mount, inspect the same path from both views, and enter the owned mount namespace to reproduce its contents. | Path diagnosis must use the target process's mount view. |
| 41 | Loopback and ports belong to a network view / `network-namespace-loopback` | `unshare --net`, `ip`, `ss` + supplied local clients | Private `ip netns` + `ip netns exec` | Docker isolated networking + inside-view clients (extra setup) | Bind the same numeric loopback port in two isolated network namespaces; compare socket listings and local requests. | Endpoint identity includes the network namespace. |
| 42 | Root inside has mapped authority outside / `user-namespace-authority` | `setpriv`, `unshare --user`, `id`, UID maps, owned access probe | Disposable rootless container + explicit host UID-map and access checks | — | As a disposable unprivileged identity, map namespace UID 0 and attempt an operation on an owned file outside that identity's permission. | UID mappings and scoped capabilities explain authority; inner UID 0 does not confer host-root access. |
| 43 | Find the owner of growing memory / `diagnose-memory-growth` | `pidstat -r`, `/proc/PID/smaps`, `memory.stat` + supplied fixture | `pmap -x`, procfs group counters, worker progress markers | `smem` + matching mapping/group evidence | Start from rising group memory across two gated work batches; choose process and mapping evidence, identify the retained allocation, and stop the exact owner. | Combine RSS/PSS, anonymous/file accounting, and group context before changing a service budget; no written report. |
| 44 | Diagnose and recover useful service / `diagnose-service-progress` | `curl`, `ps`, `ss`, `lsof`, exact-PID `kill` + supplied fixture | Focused `strace` and procfs evidence + request probe | — | Investigate a timed-out request with a listener and harmless file/FD clues; choose evidence, identify a stopped worker, resume it, and verify the response. | Choose among plausible causes, apply one justified remedy, then prove useful recovery and cleanup within one lesson. |

## Agreed approaches for implementation

None yet. The CLI columns are a planning menu for the pre-authoring conversation, not locked
implementation decisions. As batches are discussed, record lesson number/slug, selected approach,
brief rationale, and the date/user direction that settled it. Keep unused options available as
reference. This section records design decisions and never changes learner completion.

## Remaining gap with the original 72

44 versus 72 means 28 fewer lesson slots, not 28 missing mechanisms. The original remains runnable
reference material with prior validation; v2 is still a proposed route. The following identifies
actual omissions separately from material folded into another experiment.

| Original lessons/topic | Revision 2 disposition | Remaining gap and judgement |
| --- | --- | --- |
| 1–6: lab setup, kernel/userspace, inventory, locale, coordination, traps | Essential preflight, stable locale, gates and cleanup embedded in supplied lessons | Less standalone shell/lab-building practice and no separate kernel-versus-userspace experiment. Appropriate to compress for the stated experience; explain supplied cleanup. |
| 7–11, 13–14: identity, trees, argv/environment, states, shell control, exit status | Most used in 1–7 and 36 | No dedicated NUL-delimited argv/environment inspection; less process-tree and job-control repetition. A useful optional reference for deployment configuration issues. |
| 12, 16–18: threads, signals, zombie/orphan lifetime | Covered by 2, 4–6 | Major first-draft omissions restored. A complete host-init/supervisor course is not implied. |
| 15, 19–24: pipelines, streams, FD duplication/inheritance, pressure, EOF, exhaustion | Covered or folded into 7–12 | No separate survey of redirection ordering or standard-stream conventions; explain the exact wiring used in lesson 7. |
| 25–30: filesystem names, links, creation permissions, rename/unlink | Covered by 13–17 except hard links | Original 26's hard-link count/shared-inode experiment remains omitted. Useful for link-based backup/snapshot tools, but lower priority than paths, permissions, and open-reference lifetime here. |
| 31–36: mount/device mapping, df/du, sparse files, tmpfs, ENOSPC/recovery | Covered or combined in 15, 18–20, 33 | Less standalone block-device inventory; logical/allocated bytes and hidden-space evidence remain explicit. I/O observation expands the original scope. |
| 37–42: address maps, residency, faults, cache, reclaim, OOM | Covered or folded into 21–24, 30–31 | Less standalone minor/major-fault and mapping exploration. Explain both fault classes in 21 without promising disk reads from a minor-fault count. PSS/private-copy work adds depth. |
| 43–45, 47: CPU/wall, load, switches, affinity | Covered or folded into 25–27 | Load gets interpretation alongside controlled task evidence, not a separate load-average time-series experiment. |
| 46 and 48: nice and ionice | Omitted as core experiments | Relative CPU priority and I/O-priority policy still lack hands-on comparison. Useful next for maintenance-versus-foreground interference; defer until that question warrants it. Quota is not a substitute for priority. |
| 49–54: soft/hard limits, UID task counts, file-size/CPU-time limits, cgroups | 49 restored in 11; FD/group budgets in 12, 28, 30–33 | Original 50–52 remain omitted: UID-scoped RLIMIT_NPROC, RLIMIT_FSIZE/SIGXFSZ, and RLIMIT_CPU. Explain their existence and different scope when contrasting group budgets, without claiming equivalent experiments. |
| 55–60: listeners, ownership, TCP lifecycle, Unix sockets, FD joins, backlog | Covered or folded into 34–38 | Unix socket gap restored. Separate TCP-state/procfs-table drills are condensed; endpoint-to-FD evidence belongs in 34. TCP teardown/retransmission analysis is not added. |
| 61–66: namespace membership, PID/mount/user/network views, nsenter | Covered or folded into 39–42 | All four namespace types retained; membership/entry practice is combined. This is not a complete container-security treatment. |
| 67–72: six diagnostic incidents | CPU/FD/space/port recovery in 12, 15, 27, 34; dedicated memory/service diagnosis in 43–44 | Less separate repetition for four incidents, but memory attribution and cross-mechanism evidence selection are restored. The old written incident deliverable is removed by the new learning format. |

For this goal, the most consequential remaining optional gap is **priority under competing
foreground/background work** (nice/ionice). Hard links are the next filesystem-specific gap.
The narrower RLIMIT policies are useful failure references, but FD and cgroup limits get the
larger share of core teaching time. This is an explicit scope choice, not a claim they are obsolete.

DNS, TLS, packet routing, nftables, advanced Docker/Kubernetes, fio/perf/bpftrace workshops, NUMA,
and host administration were not part of the original 72-lesson core either. They are future
specializations rather than losses caused by this revision. File-lock APIs and asynchronous I/O
are also outside this route; database concurrency and advanced I/O study remain separate.

## Visual teaching plan

Put labelled terminal diagrams before commands, connect their labels to measured output, and keep
them readable without color. Use ordinary shared lesson Markdown, not a new renderer.

- Process tree and timeline: PID across exec, tasks inside a process, exit/reaping and reparenting.
- Pipeline/FD graph: per-stage status, stderr wiring, open-file descriptions, buffers and final-writer EOF.
- File path map: permissions, relative symlinks, pathname-to-inode replacement and retained readers.
- Storage path: application bytes → page cache/sync → filesystem → observed block-device counters;
  distinguish scopes and avoid claiming one-to-one attribution.
- Memory page map: reservation, residency, shared/PSS accounting and private copies.
- Scheduler timeline and budget tree: runnable, running, blocked, quota intervals, PSI and local limits.
- Socket queue path: Unix rendezvous or TCP endpoint → accept → application → peer consumption.
- Namespace view pairs: observer/target PID, mounts, loopback and UID mappings.

Diagnostic lessons still supply all needed concepts and command explanations, but initially offer
a small familiar tool menu rather than naming the cause. The worked interpretation and exact
cleanup are in the same lesson; no answer submission is needed.

## Delivery and implementation boundary

`tutor linux-v2 route` displays this plan without creating progress.
`tutor linux-v2 <n> lesson|done` serves or completes a lesson only after it is authored;
the unnumbered `lesson` selects the next unfinished authored entry. All 44 are currently planned.
Only explicit `done` changes completion. Preserve the original `linux` catalog, wrapper and progress.

Each lesson contains explanation, diagram, complete setup/actions, evidence, interpretation and
cleanup. The two diagnostic additions are normal short lessons, not extra review or homework stages.
A candidate first batch after final approval and a batch request is 1–3 or 1–4; batch size follows
fixture complexity. Discuss and settle its lesson-tool approaches before creating lesson content.
Approval of an outline alone does not request implementation or settle the menu's tool choices.

Planning must not allocate labs, install tools, build helpers, scaffold courses, generate catalogs,
or create validation infrastructure. During approved implementation, measure the actual dependencies,
runtime and outcomes. Probe sysstat fields, procfs visibility, cgroup controllers, namespace access
and tracing permissions on the chosen host. Optional tools are installed only if their path is chosen.

Use owned scratch files and exact process identities. OOM, filesystem-full, task-limit and mount
experiments need finite private boundaries and an independent controller/watchdog outside them.
Initial per-lesson design budgets remain at most 256 MiB combined fixture memory, 128 MiB filesystem
payload and 16 deliberately launched child processes, with separately measured runtime thread count
and temporary-copy overhead. The pids-limit experiment must account for all kernel tasks in its group.
Keep heavy I/O trials bounded by bytes and time; they are observation exercises, not device benchmarks.
Never exhaust the host, evict global caches, alter shared sysctls, or use `/labs/pglab` as a failure fixture.
Remove owned processes, groups, mounts and files after each trial; preserve progress and unrelated work.

## Sources and open questions

Existing local research above supplies course scope and prior outcomes. Primary documentation was
checked for the added CLI choices on 2026-09-12; exact v2 commands and alternatives are unvalidated.

- [Bash manual](https://man7.org/linux/man-pages/man1/bash.1.html): pipeline status, redirection and
  shell limits underpin 7 and 11. GNU's web manual was unavailable during this pass; this is the
  upstream manual mirrored by man7.
- [pidstat](https://man7.org/linux/man-pages/man1/pidstat.1.html): task/thread, memory, I/O and switch
  observations inform 2, 20, 26 and 43; interval deltas are preferred to lifetime averages.
- [iostat](https://man7.org/linux/man-pages/man1/iostat.1.html) and
  [proc_pid_io](https://man7.org/linux/man-pages/man5/proc_pid_io.5.html): distinguish device reports
  and per-process accounting in 20. VM storage layers and unrelated writes limit attribution.
- [prlimit](https://man7.org/linux/man-pages/man1/prlimit.1.html) and
  [setpriv](https://man7.org/linux/man-pages/man1/setpriv.1.html): support owned unprivileged limit
  and access fixtures. Do not test privilege boundaries as unrestricted root.
- [Subreaper API](https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html): supports
  bounded adoption/reaping in 6. Observe the actual adopter rather than assuming PID 1.
- [namei](https://man7.org/linux/man-pages/man1/namei.1.html) and
  [du](https://man7.org/linux/man-pages/man1/du.1.html): path resolution and allocation evidence
  support 14 and 18.
- [Unix sockets](https://man7.org/linux/man-pages/man7/unix.7.html): local pathname endpoint
  semantics for 35. Do not infer application authentication from filesystem access alone.
- [fincore](https://man7.org/linux/man-pages/man1/fincore.1.html): a CLI observer of file residency
  for 24; region-level mincore remains an alternative and timing alone is insufficient.

Revision 1 also checked [pipe](https://man7.org/linux/man-pages/man7/pipe.7.html),
[rename](https://man7.org/linux/man-pages/man2/rename.2.html),
[fsync](https://man7.org/linux/man-pages/man2/fsync.2.html),
[smaps](https://man7.org/linux/man-pages/man5/proc_pid_smaps.5.html),
[cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html),
[PSI](https://docs.kernel.org/accounting/psi.html), and
[namespaces](https://man7.org/linux/man-pages/man7/namespaces.7.html). Those remain the behavior
references for the retained experiments. Recheck needed details and capabilities during authoring;
a sync trace does not validate power-loss durability and OOM status alone does not prove its cause.

Open questions for the outline and later batches:

1. Does 44 lessons balance database/distributed-systems relevance and general Linux breadth as Nick
   intends? The next optional candidates are relative priority and hard-link semantics.
2. Is the preferred direct-CLI approach right for each lesson, or should selected rows use a
   container alternative? Do not require multiple implementations of the same lesson.
3. Validate one short I/O observation path on the actual filesystem. If the path is overlay/tmpfs
   or hides its block device, explicitly bound the observation to the visible layer; do not claim
   a physical mapping. No fixed latency, throughput, or device-counter ratio is promised.
4. Confirm independent reaping/watchdogs, thread-aware helper budgets and non-root permission tests.
   File-cache, reclaim, PSI and scheduler trials must establish their measured relationships within
   bounded trials; flag real host-policy limits instead of calling a skipped experiment successful.

## Learner feedback and final sign-off

- Revision 1, 2026-09-12: proposed 32 lessons under the concise-course approach.
- Nick asked what was lost relative to 72; the comparison identified real omissions, reduced
  diagnostic practice, and the fact that cache/reclaim/OOM already existed in the original.
- Nick then requested worthwhile additions, a revised count/gap analysis, and CLI options, with
  database/distributed-systems knowledge as the main goal and general Linux foundations retained.
- Nick clarified that the CLI/tool columns should support a conversation about the approach before
  creating lessons. Treat them as open options; discuss and record batch choices before authoring.
- Revision 2 proposes 44 lessons: all original 32 plus the 12 additions listed above. The prior
  32-row numbering and comparison are superseded by this canonical route; no implemented identity
  or progress has changed.
- Awaiting Nick's suggestions on additions, omissions, order and tool approaches.
- Final-outline approval: pending. Record the approved revision, date and explicit direction.
- Implementation request: none. This revision request authorizes planning, not lesson authoring.

Revise the outline as feedback arrives, then obtain final sign-off before implementing a requested
batch. Material later scope/order changes need renewed sign-off; unchanged approved batches do not.
