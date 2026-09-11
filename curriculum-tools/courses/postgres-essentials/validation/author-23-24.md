# Lessons 23–24 author validation

Accepted on 2026-09-11 against a private PostgreSQL 16 cluster. The source-driven Deno runner
imported `curriculum/18-wal.ts`, executed each lesson's exact `setup + code`, and extracted the SQL
fence from each optional challenge. `psql -X -v ON_ERROR_STOP=1` reported no errors. The Python
controller created the Unix-socket-only cluster with `fsync=on` and 16 MB shared buffers, ran all
four selections, stopped it normally, confirmed it was stopped, and removed the fixture root.

- `23-core`: `flush_reached_saved_write=t`; both final row counters were 1. The async sample saved
  insert LSN `0/1517550`, pre-insert flush LSN `0/15174C8`, and measured 136 unflushed bytes. This
  gap is timing-dependent and may be zero.
- `23-variation`: `wal_bytes_generated=1264`, `visible_rows=0` after rollback.
- `24-core`: 200 individual INSERT command tags appeared in each phase. Autocommit measured 59,464
  WAL bytes (297.32/row); one explicit transaction measured 51,544 (257.72/row). Both row counts
  were 200 and `checksums_equal=t`. No checkpoint occurred between phases.
- `24-variation`: ten BEGIN/COMMIT pairs each enclosed 20 individual INSERT commands;
  `ten_transaction_wal_bytes=51840`, `useful_rows=200`.

Exact LSNs and byte counts are run evidence, not universal costs. Cluster-wide activity,
full-page-image history, layout and asynchronous flush timing can change them. The stable checks are
the synchronous lower-bound comparison, committed/rolled-back row evidence, equal final content,
positive intervals, and the controlled run's transaction-count ordering.

Source hashes accepted by this run:

```text
c966f9b478ebd27fcfd90943d8948bbe077195127aede0bdb8cf07693fcd50ef  curriculum/18-wal.ts
b924f7f149c8bdde72600157915c723855ae3c012bb86d3368e1e36fd7e290d2  validation/author-23-24.ts
957156f6d1938f9fed0865c848e3a4541bcc95a6911bad988c07e72ec2e6f762  validation/author-23-24.py
```

Final checks found no matching fixture directory or author postmaster. The root filesystem retained
16 GB free. The learner server and progress were never targeted.
