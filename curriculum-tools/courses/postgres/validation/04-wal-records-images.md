# WAL records and page-image acceptance

Primary sequential implementation,2026-09-05, first subsection of chunk4. Current lessons52/53
retain their slugs at revision4. Chunk4 and the overall goal remain incomplete.

## Runtime evidence

PostgreSQL16.15, private socket /tmp/postgres-pivot-20260904/socket, port5540, pivot_primary. Both
cores and source variations ran individually, then the exact pgcoach-rendered hints ran in order
against a refreshed copied catalog. All six executions completed without SQL errors or harness
timeouts; every domain/flush check was true.

- The record core's target xid has Heap INSERT, Btree INSERT_LEAF, Heap HOT_UPDATE, Heap DELETE and
  Transaction COMMIT. Its352-byte cluster interval is not described as the sum of record payloads.
  All relation blocks resolve correctly. The aborted xid has heap/index insertion work and ABORT,
  while the aborted row is absent. The fresh hint-table scan retains5000 rows and logs 23
  FPI_FOR_HINT blocks,180552 image bytes in this run. A later flushing marker is outside each
  selected interval. The indexed-key variation has ordinary UPDATE and additional B-tree work; final
  intended key/value and row-count assertions pass.
- The uncompressed page-image run reports image bytes5764,0,5768 for first, second and
  after-next-checkpoint phases. Total interval bytes5992,288,6136 include more than just images. The
  last phase's image comes from FPI_FOR_HINT before pruning/update, an important reason to inspect
  all owned-page records rather than only HOT_UPDATE rows.
- The pglz variation reports image bytes555,0,569. block_fpi_info includes COMPRESS_PGLZ for the
  images. Both runs keep full_page_writes on, retain100 rows and sum(version)=3, and restore the
  original session settings. These are byte measurements, not compression-CPU or throughput proof.

Source driver /tmp/pg-wal-evidence.ts is invoked by /tmp/pg-wal-evidence.sh. Logs are
/tmp/pg-wal-{records,page-images}-{core,variation}.log. Exact CLI driver /tmp/pg-wal-exact.ts and
/tmp/pg-wal-exact.sh retain /tmp/pg-wal-rendered-SLUG.md and /tmp/pg-wal-exact-SLUG.log for the two
surviving slugs. The copied catalog path is in /tmp/pg-observe-progress-path.

## Integration

95-lesson build, seven reading stops and all backward prerequisites pass. First7 built objects and
accepted capacity are unchanged. Fresh copied progress refresh preserves current attempts,
completion records and original IDs; live progress was untouched by author tools. Its hash at this
check was395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6 (the learner can
independently advance). All30 tests pass; full repository format/lint/type checks pass. Logs:
/tmp/pg-wal-foundation-tests.log and /tmp/pg-wal-foundation-check.log.

The pre-existing guides/02-storage.ts edit and untracked root bin/ were excluded from this change.
Next is the measured commit-cost driver, then archive/crash/recovery and the remaining chunk4 work
specified in designs/04-durability-recovery.md. No WAL or timeline identity has been retired yet.
