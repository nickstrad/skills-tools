# PostgreSQL lab cluster

Updated 2026-09-13.

Keep the learner lab distinct from disposable validation infrastructure.

## The learner lab

The learner's PostgreSQL 16 lab is `/labs/pglab/primary`, port 5440, Unix socket `/tmp`, role
`postgres`, database `lab`. It runs as the enabled system unit `pglab.service`; start, stop and
restart it with `systemctl`, never with `pg_ctl start` from a shell or tmux pane. Connection,
unit and recovery details are in the knowledge store: `kb show data/postgres-learner-lab.md`.

## What happened

The original course validation used `/var/lib/postgresql/pglab`. That old tree accumulated about 6.1
GB of primary/backup/archive files and was removed on 2026-09-05 after checking its stopped state,
distinguishing the live learner path, and recording a complete file inventory. Historical validation
reports naming that path are not instructions to recreate or retain it.

The agent's `/tmp/postgres-pivot-20260904` validation cluster on port 5540 was stopped during the
same cleanup, and the final whole-course audit later removed its remaining bulky evidence;
[the final cleanup report](../../curriculum-tools/courses/postgres/validation/09-final-cleanup.md)
records the disposition. `/root/pg-cleanup-20260905/` retains compact inventories and small
diagnostics, not a running cluster or backup service. Historical scratch paths are not lesson
dependencies.

## Why it matters

A stopped cluster still consumes disk. Archives, replicas, base backups and restore destinations can
exceed primary data size many times over. Similar `pglab` names concealed two different trees.

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
