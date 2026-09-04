# SQLite study checkpoint plan

This plan adds a small number of deliberate reading stops to the 48-lesson SQLite Systems course.
The course remains experiment-led: a reading becomes core only when it supplies a durable mechanism
or boundary that the preceding experiments expose but cannot efficiently derive on their own.

## Decision

Add six checkpoints, after lessons 11, 17, 23, 29, 34, and 38. The complete core path is about
95–130 minutes across the course. Do not add checkpoints to modules 01, 08, or 09: their application
format, local-systems pattern, and capstone work already teaches the intended decisions directly.

Every checkpoint is metadata on an existing lesson. It must not change lesson order, commands,
expected results, safety, sessions, prerequisites, revision, or progress state. SQLite-specific
sources stay in the SQLite curriculum; the tutor engine retains only its generic checkpoint model.

## Course-order placements

| After lesson | Core reading | Budget | What the reading adds |
| --- | --- | ---: | --- |
| 11, `freelist-vacuum-and-reuse` | SQLite *Database File Format*: §§1.2, 1.3.2, 1.5–1.7, and 2.3–2.5 | 20–30 min | Unifies the observed page growth, B-tree shapes, overflow, freelist reuse, rowid storage, and `WITHOUT ROWID` layout into one physical model. |
| 17, `batching-changes-the-cost` | SQLite *Atomic Commit*: §§3.4–3.5, 3.7–3.11, 4.2, and 4.6 | 15–20 min | Explains how lock order, before-images, database writes, sync barriers, and journal invalidation create rollback-mode atomicity. |
| 23, `idempotent-retry-ledger` | SQLite *Isolation*: the complete short page; *File Locking and Concurrency in SQLite Version 3*: §§2–3, 4.1, and 5 | 15–20 min | Connects transaction admission and busy errors to serialized writes and the rollback-mode lock-state machine. |
| 29, `checkpoint-starvation` | SQLite *Write-Ahead Logging*: §§1–3 and §9, omitting obsolete struck-through guidance | 15–20 min | Supplies the append, commit-record, end-mark, checkpoint, and reuse lifecycle behind the sidecars and pinned-reader evidence. |
| 34, `recover-damaged-copy` | SQLite *Backup API*: §§1, 1.1, and 3.1; *How To Corrupt An SQLite Database File*: §§1.2–1.4 | 15–20 min | Distinguishes an engine-coordinated snapshot from a filesystem copy and explains why live sidecars must not be deleted or mismatched. |
| 38, `measure-the-writer-envelope` | SQLite *Query Planning*: §§1.1–1.3, 1.6–1.7, 2, 3, and 4 | 15–20 min | Converts observed plans and index costs into a reusable search, locality, and sorting model without teaching planner internals. |

## Optional depth

Optional items may appear inside these six checkpoints, but they must remain clearly nonessential:

- After lesson 11: *Architecture of SQLite*, “Overview,” “B-Tree,” and “Page Cache.”
- After lesson 17: *How To Corrupt An SQLite Database File*, §§3.2 and 4.1.
- After lesson 29: *Database File Format*, §4, especially §§4.3–4.6.
- After lesson 34: *How To Corrupt An SQLite Database File*, §§2.1, 2.5, and 3.2.
- After lesson 38: *SQLite: Past, Present, and Future*, §2 only. Its 2022 benchmarks and proposed
  optimizations are not course facts.

Do not attach optional material merely to make the bibliography more comprehensive. A checkpoint
may omit optional depth entirely.

## Version and scope exclusions

- *Atomic Commit* and *File Locking and Concurrency* describe rollback mode, not WAL. State that
  boundary in the checkpoint wording.
- The locking document dates from 2004. Its rollback lock protocol remains useful, but ignore its
  example saying pages are usually 1024 bytes; learners should trust runtime page size.
- In the WAL document, ignore the struck-through pre-3.11 warning that large transactions perform
  poorly. Do not make §11's WAL-reset bug mechanics foundational study, but preserve its current
  operational warning. The course's 3.53.4 minimum includes the fix; production users on the
  affected 3.7.0–3.51.2 range should run 3.51.3+ or an official patched backport.
- `sqlite3_rsync` is available at the course's 3.53.4 floor, but do not introduce it merely because
  it is new; the backup lessons teach the more general snapshot and file-pairing invariants.
- Do not require the Next-Generation Query Planner article. Its algorithm and heuristics are more
  version-sensitive than the durable planning model this course needs.
- Skip historical bug catalogs, changing test-count statistics, benchmark numbers, full file-format
  tables, and C implementation details unless a learner chooses them independently.

## Editorial acceptance criteria

- Each core locator names exact sections or headings and fits a 15–35 minute stop.
- Each rationale starts from evidence the learner just produced and says what the source adds.
- The wording distinguishes “core before continuing” from optional enrichment without claiming the
  tutor tracks reading completion.
- The six stops occur only at the listed lesson boundaries and remain in course order.
- Generated `lessons.json` contains the metadata, and the SQLite tutor wrapper explains how to obey
  checkpoints while treating ordinary references and optional depth as non-blocking.

## Validation

Build SQLite, run the full repository check and test suite, render all six checkpoint lessons from a
temporary progress database, and verify that each checkpoint follows the Challenge. Compare the
pre/post SQLite lesson objects with `studyCheckpoint` removed; they must be identical. Confirm the
learner's real SQLite progress summary is unchanged.
