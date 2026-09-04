# Folding Linux observations into database projects

2026-09-04. Future refactor proposal: teach selected Linux mechanisms where PostgreSQL and SQLite
make them useful, then use the Linux course for generalization and deeper resource/isolation work.

## What happened

The learner asked for a standalone note describing how some Linux material could be folded into
PostgreSQL and/or SQLite and how that would adjust the existing Linux course. They requested a
document for possible future refactoring, not changes to current lessons.

The [roadmap](../learning_path.md) now recommends an early pass through Linux foundations alongside
database work. The existing [Linux plan](../../curriculum-tools/courses/linux/PLAN.md) describes
72 stable lessons in 12 modules and explicitly allows learners without database prerequisites.
Any future integration should preserve that entry path.

Nick subsequently clarified his KCNA, roughly seven years shipping on Kubernetes, Docker
familiarity, and ownership of the repositories in the [experience review](prior-project-experience.md).
Use the [learner profile](../learner-profile.md) to avoid unnecessary foundation recaps. The
standalone route remains useful for other learners; his route can concentrate on unfamiliar
mechanisms without deleting evidence-based Linux depth or requiring a repeated platform build.

## Why it matters

A database gives a concrete reason to identify a process, inspect an open file, distinguish CPU
time from waiting, and ask what a successful commit means. Learning just enough Linux at that
point can make both the database and operating-system mechanisms easier to understand.

The risk is turning each database into another Linux course, then repeating the same work in the
standalone course. The useful split is: introduce the mechanism with one clear workload, contrast
it in the second database only when the implementation differs, and generalize or deepen it later
with a different Linux workload. Shared vocabulary alone does not establish equivalent evidence.

## How to apply

### Nick's optional early Linux route

Updated 2026-09-04 after Nick reported reading OSTEP and How Linux Works recently and DDIA several
times, and requested a website/résumé review. See the [background sources](learner-background-sources.md).
Recommendation: continue PostgreSQL; use selected Linux observations alongside it. There is no
evidence here that an extended Linux prerequisite is needed. The earlier roadmap did not prescribe
a fixed subset or require completing Linux modules 01–06 before PostgreSQL.

If a separate short pass would be helpful, the following **eight existing lessons** provide a
candidate route, not a newly authored course or required checklist. Lesson identities and estimates
were checked through `tutor linux modules`, `list`, and `show NUMBER --json` on 2026-09-04.

| Observation | Linux lesson (ordinal / stable slug) | Database use |
| --- | --- | --- |
| Correlate process identity | 9 / `proc-process-identity` | Connect a SQL backend PID to OS evidence. Recap if PostgreSQL process-model work already suffices. |
| Inherited open-file reference | 21 / `inherited-open-files` | Identify who owns an open resource and how its lifetime extends. |
| Unlinked file retained by a descriptor | 30 / `deleted-open-file` | Understand pathname removal versus resource reclamation using a disposable helper file. |
| Path to mount/storage source | 31 / `map-mounts-and-devices` | Locate the filesystem that receives database writes. |
| Virtual reservation versus resident memory | 38 / `compare-rss-and-vsz` | Interpret process memory without equating virtual size with RAM consumption. |
| Bounded page-cache observation | 40 / `warm-the-page-cache` | Discuss the OS cache separately from PostgreSQL buffers; faster reads/global counters alone do not prove physical disk behavior. |
| CPU versus elapsed time | 43 / `cpu-time-vs-wall-time` | Separate execution from waiting before explaining query latency. |
| Port to process and descriptor | 56 / `map-port-to-process` | Identify the actual listener when investigating connections. |

These are **8 of 72 lessons (about 11%)**, spanning parts of seven modules. Their authored estimates
sum to **92 minutes**, which excludes coaching, unfamiliar setup, and variations. Allow roughly
**2–3 hours** for this optional pass with a brief setup recap and a proposed 20–30-minute focused
`strace` orientation; allow **3–4 hours** if several topics need explanation or variations. These
are planning estimates, not measured completion times.

Before using the standalone exercises, establish the owned lab directory and required tools and
review exact-PID cleanup/traps as needed (lessons 1, 3, 6; 28 authored minutes if taken in full).
Lesson 3 inventories the entire course; only tools needed for the selected route need to be
available now. Recap PID/PPID, descriptor/inode vocabulary, background children and `wait` where
unfamiliar. This selection does not establish a validated packaged mini-course with new setup.

Conditional additions: 17 / `graceful-and-forced-stop` before lifecycle/recovery work;
25 / `paths-and-inodes` before file-lifetime work; 58 / `unix-domain-socket` if local PostgreSQL
connection evidence requires it. These add 32 authored minutes if all three are useful. Use
database-specific shutdown instructions when returning to PostgreSQL.

The roadmap's `strace` work is a separate focused workshop, not one of these 72 Linux lessons.
Its purpose would be to relate calls, descriptors, paths, results, and timing to an owned process,
then interpret the database course's existing synchronization observations. No new tracing lab is
implemented or validated by this note. Reuse database evidence when it already answers the question.

An even smaller route is to handle process identity and file lifetime only when needed now, memory
and cache evidence around PostgreSQL buffer-cache work, and tracing when WAL/durability makes it
useful. This avoids a separate study interruption. Preserve the later Linux work on reclaim/OOM,
scheduling/pressure, resource limits/cgroups, socket lifecycle/backlog, namespaces, and service
incidents; those topics are not all prerequisites for learning PostgreSQL internals.

Keep this as a reading/experiment route through existing lessons for now. Nick asked whether a
small course would help, not to split or delete the Linux course. No lesson or progress changes
follow automatically from this recommendation.

### Start with observation bridges, not a course merger

Prefer a short addition to a relevant database experiment: introduce the kernel concept, predict
what a tool should reveal, observe the owned process or file, and reconcile that evidence with
the SQL result. Aim initially at a handful of bridges, not a mandatory new Linux module in both
database courses. Supply every unfamiliar command and use the existing lab's owned resources.

Existing database sources already provide hooks. PostgreSQL has `process-model`,
`commit-means-fsync`, and `wait-events-tell-you-where-time-goes`. SQLite already uses strace in
`synchronous-contracts`, `batching-changes-the-cost`, and `automatic-checkpoint-cost`, and has
`bounded-storage-failure`. Review those experiments before proposing new ones. Extend a missing
explanation or observation instead of cloning a working demonstration. These slugs were inspected
in the source on 2026-09-04; verify them again during an actual refactor because course work is active.

### Candidate placements and what Linux would do afterward

The table is a design proposal, not a claim that these integrations are implemented.

| Mechanism | First useful database placement | Contrast or evidence to require | Adjustment to the Linux course |
| --- | --- | --- | --- |
| Process identity and ownership | PostgreSQL lab/process model: connect a SQL session to its backend PID, parent, executable, and endpoint. | SQLite: identify the application/CLI process using the database file. Explain which process owns the work and lifetime in each design. | Module 02 can use a brief evidence check for database-path learners, then emphasize threads, inherited context, and generic process trees. Retain full introductions for standalone learners. |
| Files, descriptors, and storage paths | SQLite lab and journals: keep a connection open and inspect its main file and sidecars. | Correlate pathname, inode, live descriptor, and SQL state; use a separate disposable helper file for unlink behavior. | Modules 04–06 can shorten repeated identification drills on the integrated route. Retain descriptor duplication/inheritance, pipes, mount mapping, and distinct allocation/reclamation experiments. |
| Writes, synchronization, and recovery | PostgreSQL WAL establishes the durability question; SQLite's existing sync traces make a second implementation visible. | Connect trace events to the relevant file and transaction phase. Distinguish accepted writes, requested synchronization, client acknowledgment, and demonstrated recovery. | Keep tracing as a reusable focused workshop. Do not add a redundant full fsync course to Linux; retain filesystem mechanisms and operational failure evidence. |
| CPU time, waiting, and cache layers | Database performance/observability: compare two controlled workloads using SQL evidence and an owned process's CPU/wall measurements. | Distinguish lock wait, execution, engine cache, and OS cache. A database cache miss or faster second run is not proof of physical disk I/O. | Modules 07–08 retain address-space mapping, faults, reservation/residency, scheduling, affinity, and pressure. Shorten only repeated introductory measurements when equivalent evidence exists. |
| Client/server endpoints | PostgreSQL connection setup: identify a Unix socket or TCP connection and its owning process. | SQLite supplies an embedded contrast. Later Linux work must still cause and observe TCP/Unix-socket behavior rather than only name the difference. | Module 10 can recap endpoint ownership quickly on the integrated route; retain connection lifecycle, socket descriptors, and backlog experiments. |
| Shutdown, exit status, and errors | Database recovery/client protocols: distinguish a client exiting, a server stopping, and the durable outcome of an operation. | Keep exact PID and exit-status evidence; reconcile an unknown commit with a stable operation ID. Database-specific shutdown commands require their own explanations. | Module 03 retains signal disposition, cooperative shutdown, reaping, zombies/orphans, and pipeline status. A database crash exercise is not equivalent to this complete lifecycle coverage. |

Start with process identity, files/descriptors, and the existing synchronization observations.
These provide high-value context with limited setup. Add performance or endpoint bridges only
when the database lesson has a concrete question requiring them. Do not force all six placements
into the first revision.

### Keep a substantial standalone Linux course

Offer two documented routes through the same material before considering any engine changes:

- **Standalone route:** keep complete first-principles introductions and generic helpers. Neither
  PostgreSQL nor SQLite becomes a prerequisite for learning Linux.
- **After-databases route:** use a short prediction and evidence task for familiar mechanisms,
  followed by the variation that adds new Linux behavior. Make the full explanation and commands
  available whenever the learner needs them. This changes coaching emphasis, not completion state.

Modules 01–03 still own shell discipline, environment/capability checks, cleanup, process lifecycle,
and signal semantics. Modules 04–06 still own pipes/backpressure, descriptor inheritance,
links/permissions, atomic rename, mount boundaries, sparse allocation, tmpfs, and bounded ENOSPC
recovery. A database's quota or page-count failure does not replace a filesystem-capacity lab.

Modules 07–09 remain deep: virtual memory, page residency, faults, reclaim, scheduling, resource
limits, cgroups, and bounded OOM are broader than query tuning. Module 11's namespace experiments
remain intact as the foundation for containers and sandboxes. Advanced networking, nftables,
Docker, fio, perf, and bpftrace retain the focused placements described by the roadmap;
they do not all get folded into PostgreSQL or SQLite.

Keep module 12's service incidents as transfer exercises. Learners should diagnose a non-database
service using principles learned elsewhere and prove useful recovery. Reusing the same database
outage would test recall more than transfer. A future database-flavored optional incident can be
added if it exposes a distinct boundary, but it should not displace generic service reasoning.

Do not set a new Linux lesson-count target now. First reduce repeated exposition in the integrated
route. Retire or consolidate an experiment only after showing that its observed behavior and
learner decision are already covered. Similar names are insufficient: `deleted-open-file`,
`compare-df-and-du`, and `recover-filesystem-space` examine different parts of one lifecycle.

### Evidence and migration requirements for an actual refactor

Build a mapping from each candidate Linux slug to the database experiment, shared outcome,
uncovered behavior, and proposed Linux follow-up. Use slugs rather than changing ordinals as
identities. Keep surviving identities and completed work; do not transfer progress between courses,
automatically mark a Linux lesson complete, or assume SQL experience proves OS understanding.
Consult [lesson identity guidance](lesson-identity-refresh.md) if any lessons move or retire.

Follow [AUTHORING.md](../../curriculum-tools/docs/AUTHORING.md) and the curriculum-author skill
before editing lessons. Validate both the standalone and integrated learning routes, including
setup assumptions and failure cases. The proposal does not require a new shared lesson engine or
cross-course completion mechanism.

Use exact owned processes and isolated data. Do not demonstrate open-file lifetime by removing a
live database file, or teach cache behavior by dropping the host's caches. A killed client is not
a crashed server; a killed server is not a power-loss test. Preserve tracing overhead and host
permission limits in the interpretation, and keep skipped capabilities explicitly untested.

The first concrete deliverable of a future refactor should be the mapping and a small reviewed
pilot, followed by a decision about whether learner understanding improved enough to extend it.
