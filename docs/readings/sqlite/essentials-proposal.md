# Proposal: SQLite internals in 32 short lessons

Status: research and reuse analysis, 2026-09-12. The canonical proposed route is
[future-courses/sqlite/course.md](../../../future-courses/sqlite/course.md). No SQLite Essentials
lessons or learner progress have changed. New and substantially narrowed experiments below are design intentions, not validated
lessons. Existing validation is evidence for reuse, not validation of this proposed route.

## Recommendation and learner budget

Create a new, bounded SQLite Essentials route using the PostgreSQL Essentials presentation:
explanation and terminal diagrams before setup, one experiment, and interpretation in the same
lesson. The shared interface is `<course cli> <n> lesson|done`; there is no separate review stage.
Reuse the existing SQLite mechanisms and fixtures where sound; redesign the route and explanations
around learning SQLite after PostgreSQL. Preserve SQLite Systems as optional reference.

Nick reports about ten minutes per current PostgreSQL Essentials lesson and likes having everything
needed to understand the experiment at its top. His current request emphasizes a full-time job,
parenting, and avoiding courses that consume a month or two apiece. This feedback is more relevant
to the next course than the older nominal 20–30 minute estimates. It does not establish that every
future recovery or concurrency lesson will take ten minutes.

Propose **32 lessons, aiming at ten minutes each, with a fifteen-minute core ceiling** including
reading, setup, execution, interpretation, and cleanup. This is 5 hours 20 minutes at the target pace, or
8 hours at the ceiling, with no mandatory external reading. At two lessons per study day it is
16 study days: roughly three to four weeks at five study days per week. At one lesson per day it
still takes 32 study days; reducing per-lesson friction cannot eliminate that calendar arithmetic.
There is no requirement to do two together.

Why 32: two orientation lessons, five storage lessons, four rollback/durability lessons, four
transaction/locking lessons, seven WAL/resource-lifetime lessons, five execution/cache lessons,
three recovery/checking lessons, and two synthesis lessons. Forty is a useful upper bound from
PostgreSQL, not a quota. Twenty-four would force combinations of distinct retry and checkpoint
mechanisms, or remove physical storage/execution depth. Thirty-two preserves those distinctions
while dropping a second distributed application curriculum.

## Evidence from the three courses

| Course inspected | Current state | What it teaches us about this redesign |
| --- | --- | --- |
| PostgreSQL Systems | 92 active lessons, 15 categories; historical documents sometimes refer to 96 identities. Catalog estimates total 2,360 minutes before additional study. | Valuable deep reference: physical storage through MVCC, recovery, replication, protocols, and incidents. Its later 35–60 minute lessons explain why exhaustive coverage expands the commitment. |
| PostgreSQL Essentials | Fixed 40-lesson route; 26 authored, 27–40 planned. Builds on eight previously completed reference lessons. | Keep the fixed scope, small causal questions, supplied commands, explanation/diagrams first, and interpretation. The former separate review is now folded into lesson. Do not infer the future 14 lessons have been validated or timed by the learner. |
| SQLite Systems | 54 authored lessons in ten modules. Catalog estimates total 1,078 minutes, plus six formerly required reading stops totaling 95–130 minutes (now optional). | Strong reusable internals; latter scope expands into independent histories, delivery, fencing, tombstones, rejoin, FTS, and a substantial capstone/decision document. This exceeds the new time and scope preference. |

These are author estimates, not measured learning times. The SQLite estimates including required
reading amount to roughly 19.5–20 hours. Simply changing the advertised times would not narrow the
work.

Local evidence: [PostgreSQL reference catalog](../../../curriculum-tools/courses/postgres/lessons.json),
[Essentials route](../../../curriculum-tools/courses/postgres-essentials/PLAN.md),
[actual Essentials renderer](../../../curriculum-tools/courses/postgres-essentials/tools/coach.ts),
[SQLite plan](../../../curriculum-tools/courses/sqlite/PLAN.md),
[SQLite validation record](../../../curriculum-tools/courses/sqlite/VALIDATION.md), and
[SQLite reading checkpoints](study-checkpoint-plan.md). The audit reviewed the catalogs, source
examples, renderer, planning documents and prior validation; it did not rerun the existing courses.

## What the research changes

SQLite is particularly useful here because its execution, storage, coordination, and maintenance
live inside the application's process. The architecture provides a coherent teaching map:

```text
SQL → compiled bytecode → virtual machine → B-tree → pager/cache → VFS → OS files
                                                     |
                                            journal / WAL / locks
```

This is an explanatory map, not a claim that every internal call follows a single linear path.
The official [architecture guide](https://sqlite.org/arch.html) describes these boundaries. The old
reading plan makes this mostly optional; the new route should use it as the spine of the course.

Physical layout deserves retention. Rowid tables, secondary locators, composite primary keys,
overflow, and freelists show an alternative to PostgreSQL heap storage. A few visible page changes
teach more here than a tour of every header offset. Sources:
[file format](https://sqlite.org/fileformat.html) and
[WITHOUT ROWID](https://sqlite.org/withoutrowid.html).

Keep rollback and WAL as separate mechanisms. Rollback commit coordinates before-images and main
file writes; WAL introduces committed page history and checkpoint work. These are useful ways to
separate atomicity, durability, visibility, and reclamation. Sources:
[atomic commit](https://sqlite.org/atomiccommit.html) and [WAL](https://sqlite.org/wal.html).

Do not compress all locked errors into a retry tutorial. Writer admission, read-to-write upgrade,
a busy rollback-mode COMMIT, and a stale WAL snapshot demand different decisions. A uniqueness
error using default ABORT also differs from PostgreSQL's failed-transaction behavior. Sources:
[transactions](https://sqlite.org/lang_transaction.html),
[isolation](https://sqlite.org/isolation.html), and
[conflict algorithms](https://sqlite.org/lang_conflict.html).

Add explicit execution and ownership connections: a prepared statement is executable bytecode,
and an unfinished statement can keep an implicit read transaction alive. Finishing a query is a
resource-lifetime event, not just an API nicety. Teach this with a supplied program that pauses
after reading one row; do not accidentally demonstrate only an explicit BEGIN left open.
Sources: [prepared statement lifecycle](https://sqlite.org/c3ref/stmt.html) and
[implicit transactions](https://sqlite.org/lang_transaction.html#implicit_versus_explicit_transactions).

Also add a bounded pager-cache experiment. SQLite reports pager cache hits/misses; those counters
do not measure physical device reads. Private connection caches and the OS cache make a useful
application-memory comparison with PostgreSQL's shared buffer pool. Sources:
[connection status counters](https://sqlite.org/c3ref/c_dbstatus_options.html) and the architecture
guide above. Keep shared-cache mode out of the baseline.

## Reference reuse map

The [future-course plan](../../../future-courses/sqlite/course.md) owns the numbered route and
stable slugs. This map identifies source material in the existing 54-lesson reference, not extra
learner prerequisites. New entries still need implementation and validation.

| Proposed lesson | Existing reference source |
| --- | --- |
| 1 | Old 1–3, narrowed |
| 2 | Old 4 |
| 3 | Old 5, 8–9, narrowed |
| 4 | Old 10 |
| 5 | Old 11 |
| 6 | Old 12 |
| 7 | Old 13 |
| 8 | Old 14; old 15 cleanup taxonomy optional |
| 9 | Old 16–17, combined controller |
| 10 | Old 18, narrowed |
| 11 | Old 19 |
| 12 | Old 22, plus admission slice of 24 |
| 13 | Old 21 |
| 14 | Old 23; timeout mechanism from 24 |
| 15 | Old 20, savepoint taxonomy optional |
| 16 | Old 26 |
| 17 | Old 27 |
| 18 | Old 28 |
| 19 | Old 29, two-mode core |
| 20 | Old 30, one-variable comparison |
| 21 | Old 31 |
| 22 | New; builds on 21 |
| 23 | New focus; old 38 tools |
| 24 | Old 38, narrowed |
| 25 | Expanded old 39; new focused fixture |
| 26 | Old 39, write slice |
| 27 | New; old 38 instrumentation |
| 28 | Old 32 |
| 29 | Old 33; old 34 optional |
| 30 | Old 35 |
| 31 | Old 41, narrowed; short-claim insight from 44 |
| 32 | Old 52; bounded decision slice of 54 |

Execution research for 23–26: [EXPLAIN QUERY PLAN](https://sqlite.org/eqp.html) and
[query planning](https://sqlite.org/queryplanner.html). Backup research for 28–29:
[online backup](https://sqlite.org/backup.html). Deployment framing for 31–32:
[appropriate uses](https://sqlite.org/whentouse.html). These sources guide proposed observations;
their examples and outputs are not substituted for real validation of the authored fixtures.

## Keep, narrow, and defer

- Keep most of the experimental substance of old 4, 10–14, 18–23, 26–33, 35, 38–39, and 52,
  with fresh explanations and smaller scope where the route specifies a slice.
- Collapse initial setup/capability/visibility orientation; use a few meaningful header fields.
  Combine the crash and recovery pair through supplied orchestration, not by assigning both long
  old writeups. Narrow checkpoint modes, sync policy, and workload measurement to one comparison.
- Add statement lifetime, bytecode execution, and pager-cache ownership as explicit teaching
  outcomes. Add a focused sorting experiment. These connect directly to systems programming.
- Make old 6–7 (migration identity and STRICT typing), 15 (journal cleanup modes), 25 (request
  idempotency), 34 (VACUUM INTO), 36–37 (quota/salvage), 40 (statistics), and 48–51
  (independent files, ATTACH, cache invalidation, FTS) optional reference. Include small necessary
  reminders inline; do not make these references undeclared prerequisites.
- Move old 42–47 and 53 (offline histories, delivery, claims/fencing, convergence, restored
  identities, integrated agent) out of the core. Those are substantial systems topics, but this
  learner is already getting transaction/outbox/worker foundations in PostgreSQL. Offline
  reconciliation deserves a later project if requested.
- Replace the long architecture document in old 54 with a spoken/mental decision in lesson 32.
  A simple local control-store workload connects to the learner's saved
  [control-plane interests](../../articles/scalable-control-planes.md); no platform rebuild follows.
- Remove the six required external reading stops from the proposed route. Keep the official
  sources as optional depth and put their essential mechanisms in the lesson itself. This is an
  explicit proposed departure from the existing SQLite reading plan, not a metadata-only edit.

SQLite is not inherently unsuitable behind a network service: the application server can own
local SQLite files. The important boundary is where SQL runs and how writers coordinate, not
whether the end user accesses a service over a network. See
[appropriate uses](https://sqlite.org/whentouse.html#situations_where_a_client_server_rdbms_may_work_better).

## Lesson delivery and acceptance

Each lesson should explain the question, unfamiliar terms, and first-class terminal diagrams,
and every unfamiliar command needed before showing setup. Budget roughly 3 minutes for that
context, 4–5 for the experiment, and 2–3 for interpretation/cleanup. Optional variation and source
reading must remain optional. Use two terminals only when their interleaving is the point; use
short supplied Go programs for cursor lifetime or controlled processes, following the recorded
non-pgcoach language preference. The learner should not have to author an application.

Lean toward more explanatory diagrams, with plain-text readability and optional ANSI color.
Carry the architecture map through the course and highlight the current component. In each lesson,
include a short PostgreSQL comparison where it helps: heap versus table B-tree, tuple visibility
versus WAL page history, row locks versus writer admission, background processes versus application
maintenance, and shared buffers versus private pager caches. Explain mechanisms in full enough
terms to run after a gap in study; avoid assuming perfect recall of earlier PostgreSQL terminology.

Keep one causal question per lesson. Lessons 9, 19–22, and 31–32 have the highest pacing risk:
controllers must handle setup and teardown, traces should be short, checkpoint comparisons bounded,
and the incident limited to a known mechanism. If a lesson repeatedly exceeds fifteen minutes,
remove a comparison or simplify the fixture before changing the promised route. Do not label a
30-minute bundle a ten-minute lesson.

When implementation is requested, define the complete stable route, then author a first batch of
3–4 lessons and use the learner's actual pacing to refine presentation. Proposed course identity:
`sqlite-essentials`, separate from `sqlite`; retain the old catalog and progress. Use the generic
`tutor <course> <n> lesson|done` interface and shared Markdown renderer. No SQLite-specific
adapter is needed; the planned essentials course itself is not available until authored.

Before shipping each batch, validate exact commands independently and sequentially, capability-probe
the actual CLI and any Go binding, initialize policies in each connection, classify intentional
errors, and check data outcomes. A binding may use a different SQLite build from the CLI.
Use persistent connections for WAL evidence and deterministic interleaving rather than arbitrary
sleeps. A process crash is not a power-loss experiment; sync traces show requests, not device
guarantees; pager misses and VM steps are not physical disk latency. A TEMP B-TREE plan does not by
itself prove a disk spill. Clean only owned fixtures, preserve progress, and verify lab readiness.

The existing [SQLite design findings](../../knowledge/sqlite-curriculum-design.md) and
[validation gotchas](../../knowledge/sqlite-lesson-gotchas.md) remain prerequisites for authors.
No new experimental behavior or timing in this proposal has been validated yet.
