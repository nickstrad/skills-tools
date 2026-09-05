# Final systems engineering integration

2026-09-05, PostgreSQL 16.15. The authorized refactor is complete at 92 active lessons in 15
modules. Original completed lessons 1–7 remain exactly equal to the saved built objects. Course
revision is 2; surviving identities retain their history. Seven original slugs retire with explicit
coverage replacements and three new slugs are added. The current PLAN, identity map, canonical
reading map, checkpoint plan, course README and installed wrapper describe this result.

## Acceptance coverage

All changed cores were executed during their acceptance chunks. This final audit compares current
source, generated objects, commands and retained evidence; it does not claim a new uninterrupted
92-lesson run. Earlier report ordinals are historical: compare stable slugs through lesson-map.md.

| Current lessons | Accepted evidence and resulting decision                                                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8–20            | 01-storage, 01-visibility and 01-integration: matched HOT/TOAST work, cache scope, physical/logical visibility, cleanup horizons, freezing, reuse/rewrite and bounded autovacuum. Additional early variations below close the final execution-record gap.                                               |
| 21–37           | 02-isolation, 02-locking, 02-primary-protocols and 02-integration: explicit invariants and real races, fresh bounded retry, uncertain response recovery, optimistic merge, lock graphs, deadlines, short durable claims and uniqueness.                                                                 |
| 38–51           | 03-planner, 03-indexes and 03-migration: actual plan/skew/spill work, independent index update costs, online migration/retention and pagination semantics under concurrent writes. Every accepted core and exact hint ran.                                                                              |
| 52–62           | 04 reports: measured WAL records/images/commit costs/amplification, failed archiving and repair, actual crash/redo, checkpoints and service readiness, missing-history restore failure and repair, PITR branches and ancestry.                                                                          |
| 63–68           | 03-capacity and 03-observability: repeatable measured contention, scoped wait/I/O/log attribution, deadline state and index responsibilities. Rate-driven overload is added in 92; closed-loop capacity alone is not an overload proof.                                                                 |
| 69–82           | 05 reports and manifests, superseded for four helpers by 08-replay-boundaries: owned topology, receive/replay separation, bounded history-aware reads, acknowledgement policy, conflict/retention costs, unsafe and controlled role changes, rewind/failback, logical snapshot/tail and reconciliation. |
| 83–87           | 06 reports/manifests: independent receiver commits, request identity/payload/result races and retention, durable prepared decisions, restricted fencing writes, missed notification recovery.                                                                                                           |
| 88–92           | 07 incident reports: symptom-first disk, corruption, freezing and request-budget diagnosis; actual repair and complete domain assertions; integrated task-runner recovery, receipt readiness and bounded admission under scheduled overload.                                                            |

The prior Project 1 review's eight priority additions are covered by current 28–29/84 (client
outcomes), 36/83/86–87/92 (durable work and delivery), 65/92 (capacity), 46/51 (composite keys and
pagination), 39 (prepared-plan skew), 47 (online evolution and retention), and 75–77 (failover
correctness). Retention is the supplied variation within 47. Optional cascading, checksum salvage
and freezing depth remain bounded options rather than repeated mandatory tours.

Corrections include unchanged out-of-line TOAST reuse, actual row locking rather than aggregate
locking, known abort versus unknown outcome, metadata-only DDL still requiring an exclusive lock,
uniqueness as an index responsibility, real external receiver transactions, the concurrent CTE
insert-or-read hole, enforced resource fencing and guarded replica reads. The final marker audit
also reproduced the idle insertion/replay gap and fixed all four physical replication gates.

## Final checks and evidence correspondence

- Working curriculum TypeScript builds exactly the 92 objects in lessons.json without rewriting that
  artifact. All prerequisites point backward. All 85 unfinished lessons have authored guides; 765
  direct stage renders and 44 copied-catalog CLI views passed. Run stages preserve supplied
  code/explanation; reveal retains results and systems lens; earlier stages withhold the full
  result.
- All 85 unfinished lesson objects match their accepted commits after translating prerequisite
  ordinals to stable slugs. 09-final-evidence.json records those comparisons. The current lesson-9
  revision-5 explanation was already represented in the accepted generated artifact; its source and
  guide edits belong to a separate workstream and were preserved, not staged here. The exact build
  equality check therefore describes the shared working source, including that explicit overlay.
- All 92 reading rows match the generated citations. All breakdown headings and coverage/notes
  conditions pass. Seven stops follow 10, 14, 20, 28, 37, 39 and 60; their core and optional reading
  assignments equal the original seven after reordering. Research uses the existing canonical
  digest; the PDF was not re-extracted.
- SQLite backup plus supported `init --db` on a copy preserves every old slug ID, progress row and
  attempt. All seven retired identities are inactive; the first seven remain current/done. The real
  progress SHA256 stays `395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`. This
  audit does not implicitly refresh or mark completion in the learner catalog.
- Fourteen current physical/logical command sets match the original or superseding acceptance
  manifest; all 42 corresponding log hashes match. Five current durable-protocol scripts and
  fresh/cached hints match their executions. The 15 complete protocol outcome inventories were
  independently reread from archived JSON and their assertions rerun, without starting a server.
  Nested cold-image hashes match the complete outer manifests.
- All 261 current compacted archive hashes were rechecked before final retirement: 1,810,235,481
  archive bytes. These were temporary audit inputs, not an ongoing backup obligation. The final
  cleanup report records their disposition; historical scratch paths must not prompt recreation.
- `deno task check` passed (format, lint and typecheck); all 30 engine/coaching/validation tests
  passed. No shared-engine or unrelated course edits were needed.

Drivers and output are named `/tmp/pg-final-{structure,metadata,evidence-audit,protocol-audit}`,
`/tmp/pg-final-check.log` and `/tmp/pg-final-tests.log`. Durable conclusions and checksums are in
this report and 09-final-evidence.json; local diagnostics may be compacted after completion.

## Additional early variation execution

An audit found that several early reports described short variations as runnable without clearly
recording execution. One new isolated cluster, Unix socket under its unique temporary root, port
5541, 64 MB shared buffers and bounded WAL, executed these 18 selected variations. Each used the
current lesson setup and the supplied variation's SQL/session schedule, with prerequisite material
where the hint explicitly references the core. No lesson content changed. The harness was followed
by explicit state assertions and inspection of intermediate evidence, not just completion counts.

| Current | Actual evidence                                                                                                                                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11–13   | Lazy XID allocation starts unassigned; repeated RR snapshots are identical; the +1 version variation ends at 101.                                                                                                                                         |
| 15      | BEGIN without a read has no backend_xmin; matched churn leaves 10 live rows, zero dead tuples and two pages while B remains open.                                                                                                                         |
| 16–19   | Ordinary VACUUM with minimum freeze age zero freezes 50/50 tuples; a second no-write vacuum removes none; the three-second rewrite wait shows the incompatible lock; adjacent updates affect 200 rows and the final vacuum restores heap-fetch avoidance. |
| 20      | The same three update batches under table cost delay 20 ms are followed by an advancing autovacuum count and zero estimated backlog within the supplied minute watch. The cost option is reset.                                                           |
| 21–23   | Transfer of 25 rolls back to 100/100; Read Committed sees the new third row; NO KEY UPDATE serializes the decrement to final 80.                                                                                                                          |
| 25      | Rolling back B permits A's update and commit, ending at 90 without serialization failure.                                                                                                                                                                 |
| 30–32   | Two shared locks coexist in one multixact; both shared readers wait on A then proceed with no remaining edge; ordered updates finish B1/B2 without deadlock.                                                                                              |
| 36–37   | Rolled-back claim lets B take job 1 at generation 1; rolled-back conflicting unique insert lets B commit key 1.                                                                                                                                           |

All 18 passed with no unexpected ERROR/FATAL and no timeout. Logs are `/tmp/pg-final-hint-N.log`;
executed SQL and outcome queries have checksums in 09-final-evidence.json. The fixture
`/tmp/pg-final-hints-lab-2paki5f9` was stopped normally and its entire raw tree deleted in the
driver's finally block. Its server log remains small diagnostic material. Earlier separately
accepted exact hints and concurrency/failure variants were not rerun without a new reason.

## Practical limits and learner readiness

The course distinguishes observed state from documentation and hypotheses. Timings, plan choices,
maintenance sampling and admitted load subsets vary on a shared VM. Process loss and colocated
stores do not prove independent-host availability, consensus, a real network partition or a
production latency objective. The capstone explicitly checks its chosen receipt freshness contract;
physical replica readiness is exercised separately in 71. Privilege boundaries are those of the
restricted worker interfaces, not a malicious-superuser threat model.

The learner's original server at `/labs/pglab/primary`, port 5440/socket `/tmp`, remains live.
Read-only checks confirm the installed course extensions and storage tables. Lesson 9's
start/run/hint/full views render on copied progress; its setup creates st_toast and needs none of
the retired fixtures. Both installed PostgreSQL skill paths resolve to the course wrapper. Use
`bin/pgcoach 9 start` from the course directory when resuming that lesson. No learner lesson was
executed or marked done.
