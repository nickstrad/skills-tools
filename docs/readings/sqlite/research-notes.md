# SQLite readings research notes

Research pass completed 2026-09-04 for the 48-lesson SQLite Systems course. The course is
experiment-led, so a source is recommended only when it adds a durable mechanism, boundary, or
operational decision that the lab cannot efficiently derive by itself. The URLs below are the
canonical SQLite documentation or a primary peer-reviewed paper; no third-party tutorial is needed
to fill a demonstrated gap.

## Recommended core inventory

The companion [study checkpoint plan](study-checkpoint-plan.md) places six bounded stops after
lessons 11, 17, 23, 29, 34, and 38. The estimates below are for the named sections, not the whole
web page.

### Database File Format — after lesson 11 (20–30 minutes)

Source: [SQLite Database File Format](https://www.sqlite.org/fileformat.html)

Read only §§1.2 (Pages), 1.3.2 (Page Size), 1.5 (Freelist), 1.6 (B-tree Pages), 1.7 (Cell
Payload Overflow Pages), 2.3 (Representation of SQL Tables), 2.4 (Representation of WITHOUT ROWID
Tables), and 2.5 (Representation of SQL Indices).

This is the best durable companion to the page, B-tree, rowid, overflow, freelist, and
`WITHOUT ROWID` experiments. It explains how the observations fit together as a physical layout,
not as isolated CLI facts. The specification states that it describes the format used by SQLite 3
releases since 3.0.0, making the broad model unusually stable. Do not require memorization of every
header offset or every file-format table; the lab's runtime observations are more useful for those.

### Rollback atomic commit — after lesson 17 (15–20 minutes)

Source: [Atomic Commit In SQLite](https://www.sqlite.org/atomiccommit.html)

Read §§3.4 (Obtaining a Reserved Lock), 3.5 (Creating a Rollback Journal File), 3.7 (Flushing the
Rollback Journal File to Mass Storage), 3.8 (Obtaining an Exclusive Lock), 3.9 (Writing Changes to
the Database File), 3.10 (Flushing Changes to Mass Storage), 3.11 (Deleting the Rollback Journal),
4.2 (Hot Rollback Journals), and 4.6 (Continue As If the Uncompleted Writes Had Never Happened).

The source supplies the protocol behind the journal lifecycle and crash-recovery labs: before-image
ordering, lock escalation, sync barriers, and journal invalidation. It is a mechanism reading, not
a promise that a process kill simulates power loss. The page explicitly applies to rollback mode;
WAL uses a different atomic-commit mechanism and must be read separately.

### Isolation and rollback lock states — after lesson 23 (15–20 minutes)

Sources: [Isolation In SQLite](https://sqlite.org/isolation.html) and [File Locking And
Concurrency In SQLite Version 3](https://www.sqlite.org/lockingv3.html).

Read all of the short Isolation page. From the locking page read §§2.0 (Overview), 3.0 (Locking),
4.1 (Dealing with Hot Journals), and 5.0 (Writing to a Database File).

These sections connect the deferred/immediate, busy-timeout, reader/writer, and retry experiments to
the pager boundary and the `SHARED` → `RESERVED` → `PENDING` → `EXCLUSIVE` state machine. The
locking page is still the authoritative rollback-mode reference, but it was written in 2004 and
does not describe WAL. Ignore its example that pages are “usually 1024 bytes”; page size is a
runtime/database property and the course correctly observes it.

### WAL lifecycle and checkpoints — after lesson 29 (15–20 minutes)

Source: [Write-Ahead Logging](https://www.sqlite.org/wal.html)

Read §§1 (Overview), 2 (How WAL Works), 2.1 (Checkpointing), 2.2 (Concurrency), 2.3 (Performance
Considerations), 3 (Activating And Configuring WAL Mode), 3.1 (Automatic Checkpoint), 3.2
(Application-Initiated Checkpoints), 3.3 (Persistence of WAL mode), and 9 (Sometimes Queries
Return SQLITE_BUSY In WAL Mode). Skip the page's struck-through historical warning in the overview
about large transactions; SQLite 3.11.0 changed that behavior.

This reading adds the append/commit-record/end-mark/checkpoint/reuse lifecycle behind the sidecar,
snapshot, checkpoint-mode, and starvation observations. Retain the architectural boundaries:
readers can overlap a writer, there is still one writer, the WAL index uses same-host shared
memory, and old readers can hold back reclamation. Those are transferable systems concepts rather
than trivia about a particular benchmark.

Currentness warning: the same official page now documents a rare WAL-reset corruption bug affecting
SQLite versions 3.7.0 through 3.51.2 and fixed in 3.51.3 (with some backports). The course now
requires 3.53.4, which contains the fix. The bug section (§11) is intentionally not a conceptual
checkpoint—it is version-specific incident material—but the risk remains relevant when evaluating
older deployed SQLite libraries.

### Consistent online backup and file pairing — after lesson 34 (15–20 minutes)

Source: [SQLite Backup API](https://sqlite.org/backup.html)

Read §1 (Using the SQLite Online Backup API), §1.1 (Other Backup Techniques), and §3.1 (File and
Database Connection Locking). Also read [How To Corrupt An SQLite Database File](https://sqlite.org/howtocorrupt.html)
§§1.2 (Backup or restore while a transaction is active), 1.3 (Deleting a hot journal), and 1.4
(Mispairing database files and hot journals). Together these distinguish an engine-coordinated
snapshot from an external copy, explain why online backup need not hold a writer-blocking lock for
the entire operation, and make the database-plus-sidecar pairing invariant explicit. This directly
complements the unsafe-copy, `.backup`, and `VACUUM INTO` lessons.

The page now mentions `sqlite3_rsync`, introduced in SQLite 3.47.0 and therefore available at the
course's 3.53.4 floor. Do not add it merely because it is newer; the durable material here is the
snapshot/locking model and the backup API/VACUUM INTO distinction.

### Query planning and index locality — after lesson 38 (15–20 minutes)

Source: [Query Planning](https://sqlite.org/queryplanner.html)

Read §§1.1–1.3 (table scan, rowid lookup, index lookup), 1.6–1.7 (multi-column and covering
indexes), §2 (Sorting), §3 (Searching and Sorting at the Same Time), and §4 (WITHOUT ROWID
tables).

The course already generates query plans and measures index costs. These sections provide the
reusable model of search work, rowid indirection, covering/locality tradeoffs, and sorting. Keep it
bounded: the full planner article is not needed for this systems path.

## Optional depth, not mandatory stops

- [Architecture of SQLite](https://www.sqlite.org/arch.html): read “Overview,” “Bytecode Engine,”
  “B-Tree,” and “Page Cache” (about 10 minutes) if the learner wants the compiler → VDBE → B-tree →
  pager → VFS map. It is useful context but not required because the course does not inspect C
  implementation details.
- [How To Corrupt An SQLite Database File](https://sqlite.org/howtocorrupt.html): its §§1.2–1.4
  are core with the backup checkpoint above. Read §§2.1, 2.5, 3.2, and 7 optionally (about 10
  minutes) for locking/filesystem assumptions, sync, and dangerous configuration. Skip §8's
  historical bug catalogue.
- [SQLite As An Application File Format](https://sqlite.org/appfileformat.html): read the
  Executive Summary and §3 (about 5–10 minutes) for application-file and portability tradeoffs;
  the course already teaches the core `application_id` idea.
- [How SQLite Is Tested](https://sqlite.org/testing.html): read §§1.1, 3, 4.2, and 5 (about
  10–15 minutes) for fault injection, crash simulation, malformed-file, fuzz, and regression-test
  mental models. Ignore changing test-count statistics and proprietary harness details.
- [SQLite: Past, Present, and Future](https://www.vldb.org/pvldb/vol15/p3535-gaffney.pdf): read
  §§1–2 (about 15–20 minutes) for a primary-paper overview of embedded architecture and workload
  tradeoffs. Its 2022 benchmark numbers and proposed optimizations are historical context, not
  course facts.

## Explicit rejects

The following do not justify enforced reading in this course:

- the complete SQLite documentation set or complete file-format reference;
- the full [Next-Generation Query Planner](https://sqlite.org/queryplanner-ng.html) article, whose
  heuristics and planner details are more version-sensitive than the needed index model;
- full FTS5 or virtual-table API references, which matter only for extension/VFS implementation;
- historical SQLite bug catalogues, changing test-count statistics, benchmark tables, or C source
  implementation details;
- generic third-party tutorials or blogs when the official documentation and primary VLDB paper
  already cover the relevant durable mechanism.

## Systems articles considered but not enforced

Two original-author articles map closely to module 08, but neither earns another stop:

- Chris Richardson's [Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html),
  from “Context” through “Result context,” concisely names the dual-write failure, local atomic
  write, relay, duplicate-delivery, and idempotent-consumer trade-off. Lessons 39–40 already cause
  those failures and recoveries directly, so requiring the article would mostly repeat the lab.
- Martin Kleppmann's [How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html),
  especially “Protecting a resource with a lock” and “Making the lock safe with fencing,” is a
  strong general explanation of lease expiry and stale-owner fencing. Lesson 42 already runs that
  exact failure and rejection, while the rest of the article is a Redis/Redlock debate that would
  pull this SQLite course off path.

These remain good follow-up reading for someone deliberately branching into messaging or
distributed coordination. Omitting them from the checkpoint flow also avoids suggesting that an
SQLite transaction itself coordinates external services or distributed lock ownership.

## Selection and version policy

The six core stops total approximately 95–130 minutes—roughly 1.5–2.25 hours depending on pace and
note-taking. A stop is justified only when its named
sections explain a mechanism or operational boundary immediately after a lab exposes it. Ordinary
references and optional depth remain non-blocking. Version-specific claims (planner heuristics,
benchmark numbers, test-suite counts, historical WAL warnings, and the WAL-reset bug) are excluded
from the durable core, but safety-relevant current-version warnings must not be erased merely because
they are inconvenient. The 3.53.4 compatibility floor intentionally includes the WAL-reset fix.
