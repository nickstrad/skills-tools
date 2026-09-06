# Lesson 4 author validation

Lesson: `reusable-space-versus-file-size`\
Source: `curriculum/02-reuse.ts`\
Validated: 2026-09-06 on PostgreSQL 16

## Contract and rationale

The experiment uses one session and one bounded table, `pe_reuse`. It records the same four
measurements at `loaded`, `deleted`, `vacuumed` and `refilled`: visible row count, heap main-fork
bytes, physical dead-tuple count and physical free bytes. Disabling autovacuum on only this table
keeps a background worker from changing a sample. `VACUUM (TRUNCATE FALSE)` makes tail retention an
explicit control, so stable heap size can be interpreted as reuse rather than accidental truncation.
The final command drops the table and its local setting.

The review limits the conclusion to the heap main fork measured by `pg_relation_size`. Indexes,
TOAST, auxiliary forks and filesystem allocation require separate accounting. It mentions the
rewrite, lock and temporary-capacity costs of `VACUUM FULL` without running it or turning the lesson
into a tuning exercise.

## Structural checks

- The source passed `deno fmt --check` and standalone `deno check`.
- A minimal temporary course copy registered `VISIBILITY` followed by `REUSE`;
  `deno task build
  postgres-essentials` produced four lessons and the curriculum passed
  `deno check`.
- The built identity is PLAN row 4, with prerequisite `old-reader-retains-history`, one session and
  a 25-minute estimate.

## Exact runtime evidence

The parent validation controller ran the exact registered, built Lesson 4 setup and code through the
repository validator on a unique private PostgreSQL cluster. It completed without unexpected errors
and asserted every labelled phase:

| phase    | visible_rows | heap_bytes | dead_tuple_count | free_space |
| -------- | -----------: | ---------: | ---------------: | ---------: |
| loaded   |         4000 |    1826816 |                0 |      76572 |
| deleted  |            0 |    1826816 |             4000 |      76572 |
| vacuumed |            0 |    1826816 |                0 |    1819680 |
| refilled |         4000 |    1826816 |                0 |      76572 |

The unchanged 1,826,816-byte heap, vacuum's free-space increase and the refill's consumption of that
space prove the intended relationship. The exact bytes are an observed PostgreSQL 16 example, not a
cross-build guarantee; the lesson asks the learner to compare phase relationships.

The parent controller stopped and removed `/tmp/pg-essentials-validation-rzxpr4db` normally. Both
tracked progress hashes were unchanged. The author-side cluster setup was stopped before `initdb`
after sandbox ownership escalation was interrupted, so it produced no PostgreSQL process or data
cluster. Its minimal `/tmp/pg-essentials-l4-sol-agent` source copy was removed after this report.

## Remaining validation boundary

The parent owns final renderer integration, exact registered-catalog checks and repository-wide
format, lint, type and navigation tests. Learning-time fit remains an estimate until learner
feedback; the experiment behavior itself is accepted.
