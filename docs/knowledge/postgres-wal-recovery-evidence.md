# PostgreSQL WAL and recovery evidence

Use these findings when designing durability, WAL cost and restore experiments. Verified2026-09-05
against PostgreSQL16.15; actual recovery findings will be added as those experiments are accepted.

## What happened

WAL lesson review found three kinds of overclaim: physical records were equated with committed
business outcomes, an LSN interval with exact per-request bytes, and the first post-checkpoint
update with a fixed8KB record. The revised experiments independently check rows, filter records by
transaction identity, inspect owned relation blocks and keep full-page protection enabled.

## Why it matters

A physically logged change can be invisible after abort. A record decoder exposes retained history
on the current timeline, not a complete standalone database backup. WAL address-space movement,
record bytes and page-image bytes are distinct measurements. Confusing these boundaries produces
incorrect application retry, durability and capacity decisions.

## How to apply

- Save inserted WAL positions around the operation, then establish a later synchronous write outside
  that interval before decoding it. Verify the saved endpoint is flushed. Background WAL, alignment
  and page headers mean LSN distance is not the target transaction's exact payload size.
- Filter records by the measured xid and resolve block references only for the current database and
  correct tablespace/filenode. pg_get_wal_block_info's false argument omits raw data; it does not
  remove block references. Commit records have no block references. See
  [pg_walinspect](https://www.postgresql.org/docs/16/pgwalinspect.html).
- Treat SQL-visible domain assertions as separate evidence from physical record presence. An aborted
  insert still logged heap/index work; the row check establishes its logical absence. Recovery needs
  a valid starting state and all required WAL, not an arbitrary retained suffix.
- Keep full_page_writes enabled while comparing first and second page touches and session-local
  compression. A first-touch image can be carried by FPI_FOR_HINT before the UPDATE rather than the
  UPDATE record itself. Inspect every record referencing the owned page. In the validated
  repeated-content fixture pglz reduced5764 image bytes to555; this does not measure compression CPU
  overhead. See [WAL settings](https://www.postgresql.org/docs/16/runtime-config-wal.html).
- A later flush can cover earlier work, and concurrent commits can share a flush. Do not infer one
  physical fsync per transaction from the durable-commit contract. Write-ahead ordering requires WAL
  to reach durable storage before the corresponding data-page write; committing need not flush every
  changed heap page. See [write-ahead logging](https://www.postgresql.org/docs/16/wal-intro.html).
