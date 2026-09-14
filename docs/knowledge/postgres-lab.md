# PostgreSQL lab cluster

Updated 2026-09-14.

Keep the learner lab distinct from disposable validation infrastructure.

## The learner lab

The PostgreSQL 16 Essentials lab is `/labs/pglab/primary`, port 5440, Unix socket `/tmp`, role
`postgres`, database `lab`. On 2026-09-14 the user stopped studying Essentials and authorized
retiring its live resources. `pglab.service` is now **stopped and disabled**, with a clean
shutdown confirmed by pg_controldata. Do not restart it as a readiness check or treat the absent
socket as a fault. Its 353 MiB data/archive tree is retained for a possible later restart.
If the course resumes with that tree intact, start it with `systemctl`, never `pg_ctl` from tmux.
Connection,
unit and recovery details are in the knowledge store: `kb show data/postgres-learner-lab.md`.

DuckDB does not depend on that cluster: lessons 1–2 use PostgreSQL 16 binaries and the postgres
OS account to create private `/tmp/duckdb-lesson.*` fixtures on socket port 55439, without TCP.
With Essentials stopped, the DuckDB session helper created a fresh fixture, queried all five
source orders, and removed it normally; both connector extensions loaded. Keep those binaries,
the postgres account, sqlite3 and the pinned DuckDB cache installed.

The distinct package-managed `16/main` cluster on port 5432 is also **stopped and disabled**.
The user explicitly requires no standing PostgreSQL instance unrelated to an active DuckDB
lesson. `postgresql.service` and `postgresql@16-main.service` are disabled, and
`/etc/postgresql/16/main/start.conf` is `manual`. The installed postgresql-generator creates
runtime service dependencies for `auto` clusters, so disabling a generated instance alone
is insufficient to change that configuration; change start.conf and run `systemctl daemon-reload`.
Manual mode permits an explicit later `systemctl start postgresql@16-main.service`.
The retained data contains postgres, playground (no user tables), and internals (public.t).
No PostgreSQL processes or TCP/Unix listeners remained after stopping both persistent clusters.
With both stopped, a fresh DuckDB lesson-2 fixture returned five source orders, both connector
extensions loaded, and cleanup again left no PostgreSQL process or socket.
Keep only temporary PostgreSQL instances required by an active DuckDB lesson running.

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
Preserve learner progress and any retained lab data; use uniquely owned temporary clusters for
authoring. Keep the intentional stopped state until the user resumes Essentials. General older
instructions to verify a live learner endpoint do not override this retirement decision.

Do not prune an archive by the current WAL filename. Retention depends on every backup/recovery
point and consumer that still needs history. `pg_archivecleanup` is appropriate only with a verified
oldest-needed segment and understood consumers; its documentation cautions against using a
single-standby cleanup rule for shared or long-term backup archives.
[PostgreSQL 16 pg_archivecleanup](https://www.postgresql.org/docs/16/pgarchivecleanup.html). When an
entire disposable validation lab has no remaining obligation, stop it and remove that owned lab,
retaining only evidence required by a specific pending audit. Clean up again after the audit before
marking the overall course goal finished.
