# PostgreSQL lab cluster

The disposable cluster the PostgreSQL Systems course validates against. Last updated 2026-09-03.

## What happened

The 96-lesson course was validated lesson by lesson on a cluster created by module 01: port 5440,
database `lab`, data under `$PGLAB=/var/lib/postgresql/pglab`. Every lesson was run by an Opus
subagent per module and spot-checked (2 to 3 lessons per module) by the primary agent before the
module was marked done.

`archive_mode` is on in that cluster, so its WAL archive directory grows without bound while the
lab exists.

## Why it matters

A validation cluster that fills the disk fails unrelated lessons in confusing ways.

## How to apply

When disk is tight, prune the archive with `pg_archivecleanup` older than the start segment of
`backup1` (the base backup the backup lessons create). Recreate the lab from module 01 rather than
repairing it. Start follow-up work from the `curriculum-author` skill and `courses/postgres/PLAN.md`.
