# SQLite course validation — 2026-09-04

All 54 lesson experiments reproduced their stated invariants in both a fresh sequential course run
and an isolated-per-lesson run. This is an authoring validation result, not learner completion or
production certification. The final architecture decision deliberately remains a learner-authored
artifact rather than a script-generated verdict.

## Environment and reproducibility

Validated on Linux 6.8.0-138-generic, SQLite 3.53.4 and Deno 2.9.5. The same official SQLite release
archive was rebuilt with explicit FTS5 support while retaining dbstat, sqlite_dbpage and bytecode.
The archive hash was checked against the repository bootstrap; real feature probes succeeded. The
bootstrap and Docker verification scripts were updated and shell-syntax checked, but the full Docker
bootstrap was not rerun during this pass.

From `curriculum-tools/`:

```sh
/root/.deno/bin/deno task build sqlite
/root/.deno/bin/deno run -A courses/sqlite/tools/validate-course.ts
/root/.deno/bin/deno run -A courses/sqlite/tools/validate-course.ts --isolated
/root/.deno/bin/deno run -A courses/sqlite/tools/verify-progress.ts
/root/.deno/bin/deno task test
```

Tracing lessons require working strace/ptrace permission. Both final runs actually collected sync
traces; they did not accept a sandbox denial as a completed trace. The runner creates named scratch
directories and retains databases, traces and complete output. Shell experiments run serially;
native concurrency experiments use separate persistent SQLite sessions through the session-aware
validator. Isolated hot-journal recovery first runs its explicitly declared crash prerequisite.

Final local evidence directories (temporary host artifacts, not repository fixtures):

- Sequential: `/tmp/sqlite-course-evidence-bc8e863e6d868e90`.
- Isolated: `/tmp/sqlite-course-evidence-b28de6a306ae3774`.
- Standalone writer-envelope rerun: `/tmp/sqlite-course-evidence-b2b6f9e879963710` (same checked
  row/error invariants; no concurrent SQLite agent validations, still a shared host).
- Copied-progress/render verification: `/tmp/sqlite-progress-verification-8a4851d1cb0bc34d`.

Each lesson log includes its expected result. `results.json` reports execution completion only:
native REPL completion detects timeouts, not SQL correctness. Primary review classified errors and
compared actual output with the expected invariants; bounded Luna/high audits independently checked
the isolated evidence. All delegated implementation and review tasks are closed.

## Per-lesson evidence

All entries below passed semantic review in both final runs. Values are observations of these
fixtures; page counts, timings and frame counts are not universal constants.

| Lesson | Evidence checked                                                                                                                                                                      |
| -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|      1 | Named lab file, events table and exactly one baseline row.                                                                                                                            |
|      2 | SQLite version plus actual dbstat, raw-page, bytecode and FTS5 MATCH probes; FTS matches=1.                                                                                           |
|      3 | A sees its two rows while B sees one; rollback leaves B at one.                                                                                                                       |
|      4 | WAL persists, but B does not inherit A's synchronous/FK/timeout settings; FK-off insert succeeds, enabled enforcement rejects invalid rows.                                           |
|      5 | Header signature and page size; file bytes equal page size times page count.                                                                                                          |
|      6 | Version-2 migration commits; failed version-3 migration rolls back its column and version; fresh reader accepts version 2.                                                            |
|      7 | Flexible text accepted, STRICT rejects nonnumeric text, lossless 42.0 stores as integer, CHECK rejects -1; final counts all one.                                                      |
|      8 | Page-aligned size and concrete leaf/internal dbstat pages for 2000 rows.                                                                                                              |
|      9 | Page counts increase at larger row counts and the tree gains internal structure.                                                                                                      |
|     10 | Three equivalent 1000-row tables; integer-primary-key alias avoids the separate named index object.                                                                                   |
|     11 | Both layouts contain 2000 rows; secondary index locators differ: rowid versus composite a/b key.                                                                                      |
|     12 | Twenty large values require overflow pages; sequential 1 KiB run reports 180 overflow pages.                                                                                          |
|     13 | Delete increases freelist without shrinking the file; reinsertion reuses pages; compacted copy has zero freelist and fewer bytes.                                                     |
|     14 | Nonempty journal while uncommitted; B sees no dirty update; rollback removes effect, commit exposes 150 changed rows.                                                                 |
|     15 | DELETE removes, TRUNCATE zeroes, PERSIST retains journal allocation; two committed rows per policy.                                                                                   |
|     16 | Forced spill exposes dirty pages and valid journal magic before actual owned-process SIGKILL; matching hot main/journal retained.                                                     |
|     17 | Working copy recovers 500 committed rows and zero dirty rows; hashes prove the original evidence pair unchanged.                                                                      |
|     18 | Rollback-mode FULL/NORMAL/OFF traces request 8/6/0 sync calls for the fixed fixture.                                                                                                  |
|     19 | Equal 200-row outcomes; 804 autocommit sync calls versus 8 for a batch.                                                                                                               |
|     20 | ABORT retains the transaction, explicit/OR ROLLBACK removes its effects, SAVEPOINT removes its suffix; final IDs 1,2,3,4.                                                             |
|     21 | Deferred read-to-write upgrade fails promptly; after A rolls back, B's still-open transaction retries and commits value 1.                                                            |
|     22 | B is refused writer admission near its 250 ms budget, then succeeds after A releases the file-wide writer.                                                                            |
|     23 | Busy COMMIT leaves B's two-row transaction pending; retrying COMMIT after reader release succeeds.                                                                                    |
|     24 | Waiting succeeds after explicit release; separate 150 ms timeout leaves committed value 2; later retry reaches 4.                                                                     |
|     25 | Same operation applies once, balance stays 110 with one receipt; changed payload under the same ID is rejected.                                                                       |
|     26 | Both sessions see two committed rows and live nonempty WAL/shared-memory sidecars.                                                                                                    |
|     27 | B commits while A holds an old one-row snapshot; A sees two only after ending its transaction.                                                                                        |
|     28 | Stale WAL snapshot cannot upgrade; A retains v1 until rollback, then reads v2.                                                                                                        |
|     29 | Pinned reader permits incomplete PASSIVE progress, blocks stronger modes; release enables complete checkpoint and zero-byte TRUNCATE.                                                 |
|     30 | All four FULL/NORMAL × automatic-threshold-1/0 cases commit 12 rows; live WAL and path-attributed sync traces distinguish work placement.                                             |
|     31 | WAL backlog grows while a reader pins old state; release enables truncation and seven current rows.                                                                                   |
|     32 | Deliberate main-only copy has one row while the undamaged live WAL source has two.                                                                                                    |
|     33 | Backup contains the one-row committed snapshot, never B's uncommitted writes; source later commits six.                                                                               |
|     34 | VACUUM INTO preserves 20 rows in a smaller, structurally valid independent file.                                                                                                      |
|     35 | Structural checks say ok while FK/domain checks identify one orphan.                                                                                                                  |
|     36 | Twelve-page quota causes expected full error, zero partial rows and valid structure; raising quota to 240 admits 100 rows.                                                            |
|     37 | Copied leaf damage is detected; range salvage yields 2900 rows at 1 KiB or 2700 at 4 KiB; intact source retains all 3000.                                                             |
|     38 | Count remains 200; covering-index lookup replaces scan, Fullscan Steps 19999→0 and VM Steps 60211→611.                                                                                |
|     39 | Equivalent lookup sums agree; three index objects add storage; indexed update uses 92013 VM steps versus 52012.                                                                       |
|     40 | Fifty matches; ANALYZE records kind/region statistics 10000 5000 / 10000 100 and changes chosen index to region.                                                                      |
|     41 | Equal row counts, explicit attempt/success/error denominators, live WAL samples, and exactly ten busy plus ten successful contender attempts.                                         |
|     42 | Domain edit, operation identity, sequence and logical clock commit atomically; aborted edit leaves no intent or sequence gap.                                                         |
|     43 | Sender actually dies with status 137 after receiver commit but before acknowledgement; replay leaves balance 90 and one receipt.                                                      |
|     44 | Short durable claims release the writer during work; takeover advances token; stale completion changes zero rows, current completion one.                                             |
|     45 | Two deliveries apply once each; lost acknowledgement causes safe replay; identity/payload conflict is rejected; final balance 85 and two acknowledgements.                            |
|     46 | Sequence gap is buffered, equal-clock tie resolves consistently, opposite delivery orders converge; premature tombstone deletion demonstrates resurrection.                           |
|     47 | Structurally valid old restore cannot reuse a changed identity; retained history plus a new generation rejoins at clock 3 with three unique operations.                               |
|     48 | File B commits while A's writer remains held; another A writer times out; both files contain one row and pass integrity.                                                              |
|     49 | Two nonempty rollback journals precede commit; separate WAL sidecars appear in WAL mode; no untested cross-file crash guarantee inferred.                                             |
|     50 | Persistent A observes data_version 2→3 after B commits, refreshes before→after; read-only backup has the new value and rejects writes.                                                |
|     51 | External-content FTS misses old content before rebuild, finds it afterward, tracks trigger mutations and rolls back derived changes; both structural and FTS consistency checks pass. |
|     52 | A stays at zero while B commits 600; incomplete checkpoint and live WAL identify retained reader state; ending A allows zero-byte WAL and 600 verified rows.                          |
|     53 | Actual writer death, recovery without dirty rows, duplicate delivery, fenced completion, damaged-backup rejection and five restored invariants all checked.                           |
|     54 | Indexed query finds 50 rows, bounded writer wait is observed, restored 5001 rows pass checks; requirements and final ADR remain learner work.                                         |

## Measurement boundaries

The four automatic-checkpoint cases retained traces with marker writes and file-descriptor paths.
Counts below include initialization and the final explicit checkpoint, before connection close; they
are not per-COMMIT counts.

| Policy / threshold | WAL syncs | Main DB syncs | Journal syncs | Directory syncs | Total |
| ------------------ | --------: | ------------: | ------------: | --------------: | ----: |
| FULL / 1           |        39 |            14 |             2 |               2 |    57 |
| FULL / 0           |        15 |             2 |             2 |               2 |    21 |
| NORMAL / 1         |        26 |            14 |             2 |               2 |    44 |
| NORMAL / 0         |         2 |             2 |             2 |               2 |     8 |

Threshold 1 reused an 8272-byte WAL; threshold 0 grew from 12392 to 57712 bytes over twelve commits.
The comparison changes one policy dimension at a time. Inspect trace timestamps and markers to
separate ordinary commit work from checkpoint/reuse work.

The sequential writer-envelope sample inserted the same 4000 pre-generated rows in 4000 versus 400
transactions. Its unpaced samples were 129160820 ns / 30969.14 rows/s / 16541832 live WAL bytes and
47082372 ns / 84957.49 rows/s / 1726312 bytes respectively. Timing excludes workload generation and
setup, but includes SQL transport/parsing and the final observation. Per-transaction observer
p50/p95 samples are a different, instrumented workload; contention percentiles mix busy and
successful attempts and are labelled accordingly. These serial course runs were on a shared host,
not an exclusive-host benchmark. No throughput ratio or latency value is a portable acceptance
threshold.

## Intentional failures and limits

- Constraint errors establish FK/type/domain, migration rollback, transaction-scope and immutable
  operation-identity behavior. Every case also checks the surviving state.
- Lock errors establish admission, upgrade, COMMIT and snapshot boundaries. The CLI's generic locked
  message does not itself expose the extended SQLITE_BUSY_SNAPSHOT code.
- Quota, damaged-copy and read-only-write failures are expected only in their named disposable
  targets. Missing capabilities, unexpected SQL failures or unavailable tracing are not passes.
- SIGKILL proves process-crash behavior, not sudden power-loss durability. Sync requests do not
  establish that a storage device honors them. The ATTACH experiment is not a cross-file power-loss
  test. `.recover` output length is not proof of complete domain recovery.
- Offline protocols use separate SQLite files and actual failure windows, but do not implement
  consensus, authentication, arbitrary transports or a production multi-master service. Logical
  expiry is controlled in the lab; production lease clocks and external fencing need their own
  contracts. Local backup restore timing excludes off-host retrieval and backup publication age.

## Build, rendering and progress protection

- Final SQLite build: 54 lessons, ten modules, backward prerequisites and explicit revisions;
  generated artifact matches source. [LESSON-MAP.md](LESSON-MAP.md) records retained/new/retired
  IDs.
- Full engine test suite: 30 passed, zero failed, including populated synthetic history through
  reordering, retirement and reintroduction. A checkpoint-preservation test now selects checkpoint
  metadata instead of assuming an unrelated PostgreSQL display ordinal.
- SQLite/src/tests scoped formatting, lint and typechecks passed. Repository-wide `deno task check`
  was also attempted; concurrent PostgreSQL formatting changes prevented its formatting stage from
  passing. Those unrelated sources were not edited to manufacture a global pass.
- Two refreshes on a byte copy preserved all 48 prior slug IDs; final active/retired counts are
  54/4. Real copied history had zero progress/attempt rows, so populated-history coverage comes from
  the regression test rather than that copy. All 54 rendered lessons retained their code and three
  teaching headings; six reading checkpoints appeared after the experiment/challenge at positions
  13, 19, 25, 31, 37 and 41.
- Real SQLite and PostgreSQL progress files were not opened for writing or refreshed. Their SHA256
  values remained `c714b24935a8f888c991474fdc11f536c6470d1703c290b31b428206a4e86ffc` and
  `c7866ba1b78cb7b2aa6c1a2951149cd14c278130f92333c1e5b8dffd063f128f`, respectively.
- The installed SQLite wrapper skill points at the updated repository skill. It preserves
  user-directed progress recording and explains refresh after a known course update. No lesson was
  marked done on the learner's behalf.

Reusable design and validation findings are indexed in
[the repository knowledge bank](../../../../docs/knowledge/README.md), particularly SQLite
curriculum design, lesson identity refresh, SQLite gotchas, validation harness and subagent
workflow.
