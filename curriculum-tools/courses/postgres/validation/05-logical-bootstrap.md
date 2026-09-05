# Logical snapshot and change-stream bootstrap acceptance

Primary acceptance, 2026-09-05. Current80 publication-and-subscription is revision4 and incorporates
retired initial-sync-vs-streaming. Both initial subscription and later table refresh execute real
COPY with bounded concurrent INSERT/UPDATE/DELETE. Coverage passed before consolidation. The course
now has92 active lessons and seven reading stops; no completion transfers from the retired identity.

## Live evidence

Driver /tmp/pg-logical-bootstrap-validate.ts runs the exact source core and source variation. Final
core root /tmp/pg-owned-dfn4izle and variation root /tmp/pg-owned-pl36xp5k retain independent
source/subscriber data, logs and JSON evidence. Output is in
/tmp/pg-logical-bootstrap-{core,variation}.log and /tmp/pg-logical-bootstrap-validation.log. Each
pair has different system identifiers, private sockets and independently created matching
primary-key schemas; the source role has replication and initial-copy SELECT privileges.

A replica row trigger blocks after the actual COPY worker receives seed row1. The observed worker
waits on an advisory lock, owns its recorded XID and has relation state d/srsublsn NULL. Independent
subscriber reads see no committed rows or audit. Source commits two batches during this boundary;
each updates ten rows, deletes a seed row and inserts a new row. Physical COMMIT record ends for
those XIDs are beyond the recorded synchronization-slot confirmation. COPY remains held throughout.

After release, exactly100 audited seed INSERT images equal the saved original values and membership,
including old images of the changed/deleted rows. Their XID matches the blocked worker. Core items
COPY XID737 is followed by24 tail events in XIDs738,739; ledger COPY XID749 is followed by24 events
in751,752. Variation items COPY737 is followed by48 events in738–741; ledger COPY751 by48 events
in753–756. Every update old/new value, deletion and insertion is checked, with twelve events per
local transaction. State reaches r and complete source/subscriber contents match. A later ID2000
receipt passes the actual main-origin remote_lsn >= captured source COMMIT end gate and appears in a
fresh full-table comparison. Completed synchronization slots disappear.

The second table enters publisher membership before REFRESH, but the subscription has no relation
entry for it yet. REFRESH starts its actual copy. While that worker is held, receipt3000 commits and
applies on the already-ready first table; its origin advances while the new table remains
empty/state d. That table then passes the same snapshot/tail and post-ready tests. Final inventories
agree on all102 item rows and101 ledger rows, including exact notes/values. One main pgoutput slot
and streaming sender remain before cleanup; apply_error_count and sync_error_count are both0.

Sync slots sampled during COPY have temporary=false and active=false in all final runs; their short
lifetime is not described as PostgreSQL's temporary-slot flag. srsublsn is treated as relation state
coordination rather than an exported snapshot identity or a universal equality boundary.

## Failure, correction and exact learner commands

Initial prototype /tmp/pg-owned-s9kmqv0v blocked actual COPY successfully, then failed in its audit
trigger with an unqualified bootstrap_audit reference. Retried copy attempts are not accepted as
proof of the original snapshot. Explicit public.bootstrap_audit resolved the reference. Final audits
record empty worker search_path for both copied and later applied changes, with zero errors.
Corrected early prototypes /tmp/pg-owned-f6dv1lv1 and /tmp/pg-owned-aq8062et passed before the final
search_path instrumentation and blocked-XID equality assertion were added; only the final roots
above and below are acceptance evidence.

Exact copied-catalog hint2 was rendered by pgcoach80 and executed by
/tmp/pg-logical-bootstrap-exact.ts. Rendered text:
/tmp/pg-logical-bootstrap-rendered-publication-and-subscription.md. Raw execution:
/tmp/pg-logical-bootstrap-exact-publication-and-subscription.log. Its final root
/tmp/pg-owned-a3sf8esa repeats the four-batch results, including the same COPY/tail XID grouping,
continued existing-table stream during refresh and complete final inventories. All three final pairs
are verified stopped with pg_ctl status exit3, empty pg_replslot directories and no unexpected
source/subscriber server errors. The scripts disable/drop subscription, remove owned source slots
and publication, and kill/reap owned gate clients before stopping both servers.

## Catalog integration and limits

Scoped builder /tmp/pg-logical-bootstrap-scoped-build.py starts from HEAD and overlays owned
sources, plus the already-incorporated unrelated storage source needed to preserve the previous
generated artifact. It builds92 lessons, retires only initial-sync-vs-streaming, changes only the
surviving bootstrap lesson after normalizing ordinals/prerequisite slugs, and redirects the conflict
lesson's prerequisite to publication-and-subscription. No unrelated storage source is staged.

Copied migration /tmp/pg-bootstrap-progress.py initializes
/tmp/pg-observe-progress-khy15knm/progress.sqlite. Existing lesson IDs, progress and attempts are
unchanged; retired initial-sync-vs-streaming is inactive. The original first seven built lesson
objects are exactly preserved, capacity is unchanged after ordinal normalization, and all seven
reading stops remain. Learner progress SHA256 remains
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6. Thirty tests and full
formatting/lint/typecheck pass; logs: /tmp/pg-logical-bootstrap-{tests,check}.log. Lesson-map, PLAN,
canonical reading map and handoff record the new identity/order and combined closest-background
Chapters4/11 citation.

This is a controlled single-host experiment with one writer/driver, matching schemas and an enabled
replica trigger used only as instrumentation. It changes timing/write cost and supplies no
throughput claim. Each table has its own bootstrap; the result does not establish one global
multi-table snapshot. A worker or transport position alone is never accepted as full data readiness.
Conflict reconciliation and lost-slot resnapshot remain subsequent work.

## Verified cold archival before bootstrap

Space pressure was relieved only by archiving the explicitly identified, superseded current79
prototype data/receiver pairs /tmp/pg-owned-xfwzyf3w and /tmp/pg-owned-lavw2ihm. Script:
/tmp/pg-bootstrap-archive-prototypes.py. Each PostgreSQL16 directory had no PID, pg_ctl status3,
clean pg_controldata shutdown and no symlinks. All regular-file SHA256 hashes were computed, tar.gz
archives reopened and exact path/hash sets compared, then stopped state and original hashes
rechecked before removing original data directories. Root logs/JSON remain; each root retains
cold-archives.json, per-directory cold.sha256.json, cold.control and cold.tar.gz files. About705MB
was available immediately afterward. This preserves verified cold file images; it is not a tested
full database restore. Final acceptance roots were not archived. No learner/shared files were
removed.
