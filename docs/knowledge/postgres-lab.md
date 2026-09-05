# PostgreSQL lab cluster

Keep the learner lab distinct from disposable validation infrastructure. Updated 2026-09-05.

## What happened

The original course validation used `/var/lib/postgresql/pglab`. That old tree accumulated about 6.1
GB of primary/backup/archive files and was removed on 2026-09-05 after checking its stopped state,
distinguishing the live learner path, and recording a complete file inventory. Historical validation
reports naming that path are not instructions to recreate or retain it.

The learner's current PostgreSQL 16.15 lab is `/labs/pglab/primary`, port 5440, Unix socket `/tmp`,
role `postgres`, database `lab`. At cleanup verification it was running and contained the learner's
storage experiment tables and installed course extensions. Lesson 9 creates its own `st_toast`
table; no old author-validation database or archive is needed to begin it.

The agent's `/tmp/postgres-pivot-20260904` validation cluster on port 5540 had no client sessions
and was stopped during cleanup. Its retained evidence and the per-experiment `pg-owned-*` images
were compacted for the outstanding whole-course audit. Consult the current handoff and
`/root/pg-cleanup-20260905/compacted.jsonl` for actual archive locations before using an old scratch
path. No permanently running author cluster is required.

## Why it matters

A stopped cluster still consumes disk. Archives, replicas, base backups and restore destinations can
exceed primary data size many times over. In this incident disk was effectively full despite healthy
memory and inode availability. Similar `pglab` names concealed two different trees.

## How to apply

Follow [VM resources and cleanup](vm-resource-cleanup.md) before starting validation and at every
checkpoint. Recheck `data_directory`, port, actual processes, active clients and path ownership.
Protect `/labs/pglab` and learner progress; use uniquely owned temporary clusters for authoring. Do
not restart or remove the learner lab as housekeeping.

Do not prune an archive by the current WAL filename. Retention depends on every backup/recovery
point and consumer that still needs history. `pg_archivecleanup` is appropriate only with a verified
oldest-needed segment and understood consumers; its documentation cautions against using a
single-standby cleanup rule for shared or long-term backup archives.
[PostgreSQL 16 pg_archivecleanup](https://www.postgresql.org/docs/16/pgarchivecleanup.html). When an
entire disposable validation lab has no remaining obligation, stop it and remove that owned lab,
retaining only evidence required by a specific pending audit. Clean up again after the audit before
marking the overall course goal finished.
