# SQLite lesson positions after the 2026-09-04 revision

Use slugs as identity and ordinals only as current display positions. This map compares the prior
48-lesson course with the 54-lesson course. Editorial-only revisions preserve existing completion
credit; a higher lesson revision makes a completed lesson eligible to be revisited.

| Previous position | Current position | Stable slug                       | Lesson revision |
| ----------------: | ---------------: | --------------------------------- | --------------: |
|                 1 |                1 | build-sqlite-lab                  |               1 |
|                 2 |                2 | inspect-build-capabilities        |               3 |
|                 3 |                3 | share-one-file-between-sessions   |               1 |
|               new |                4 | connection-settings-are-local     |               1 |
|                 4 |                5 | decode-database-header            |               2 |
|                 5 |                6 | application-id-schema-versioning  |               3 |
|               new |                7 | strict-storage-contracts          |               1 |
|                 6 |                8 | pages-and-dbstat                  |               1 |
|                 7 |                9 | btree-splits                      |               1 |
|                 8 |               10 | rowid-storage                     |               1 |
|                 9 |               11 | without-rowid-layout              |               3 |
|                10 |               12 | overflow-pages                    |               1 |
|                11 |               13 | freelist-vacuum-and-reuse         |               1 |
|                12 |               14 | rollback-journal-lifecycle        |               1 |
|                13 |               15 | journal-modes                     |               2 |
|                14 |               16 | crash-leaves-hot-journal          |               3 |
|                15 |               17 | hot-journal-recovery              |               3 |
|                16 |               18 | synchronous-contracts             |               3 |
|                17 |               19 | batching-changes-the-cost         |               3 |
|               new |               20 | transaction-errors-have-scope     |               1 |
|                18 |               21 | deferred-write-race               |               2 |
|                19 |               22 | immediate-reserves-writer         |               3 |
|                20 |               23 | rollback-reader-writer-blocking   |               3 |
|                21 |               24 | busy-timeout-bounds-wait          |               3 |
|                23 |               25 | idempotent-retry-ledger           |               3 |
|                24 |               26 | wal-sidecar-files                 |               1 |
|                25 |               27 | reader-and-writer-overlap         |               1 |
|                27 |               28 | busy-snapshot-upgrade             |               2 |
|                28 |               29 | checkpoint-modes                  |               2 |
|               new |               30 | automatic-checkpoint-cost         |               1 |
|                29 |               31 | checkpoint-starvation             |               1 |
|                30 |               32 | unsafe-live-copy                  |               1 |
|                31 |               33 | online-cli-backup                 |               1 |
|                32 |               34 | vacuum-into-snapshot              |               1 |
|                33 |               35 | integrity-and-domain-checks       |               1 |
|               new |               36 | bounded-storage-failure           |               1 |
|                34 |               37 | recover-damaged-copy              |               3 |
|                35 |               38 | query-plan-as-evidence            |               3 |
|                36 |               39 | index-read-write-tradeoff         |               3 |
|                37 |               40 | analyze-changes-plans             |               3 |
|                38 |               41 | measure-the-writer-envelope       |               3 |
|                43 |               42 | local-oplog                       |               3 |
|                40 |               43 | outbox-replay-after-crash         |               3 |
|                41 |               44 | durable-job-claims                |               3 |
|                44 |               45 | duplicate-and-lost-ack            |               3 |
|                45 |               46 | ordering-conflicts-and-tombstones |               3 |
|               new |               47 | restore-and-rejoin-history        |               1 |
|               new |               48 | independent-database-writers      |               1 |
|               new |               49 | attached-database-boundaries      |               1 |
|               new |               50 | cache-invalidation-and-snapshots  |               1 |
|               new |               51 | fts-derived-state                 |               1 |
|                46 |               52 | wal-growth-incident               |               3 |
|                47 |               53 | offline-agent-capstone            |               3 |
|                48 |               54 | sqlite-architecture-decision      |               3 |

Retired positions: 22 compare-and-swap-update; 26 snapshot-reader; 39 transactional-outbox; 42
lease-expiry-and-fencing. Their history remains attached to those retired slugs, not the new lessons
at those numbers. See PLAN.md for where their coverage was consolidated.
