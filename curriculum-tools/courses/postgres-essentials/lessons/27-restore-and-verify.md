# Prove a backup can restore the intended data

slug: restore-and-verify
category: durability-recovery
difficulty: intermediate
tags: backups, recovery, verification
prerequisites: crash-replay
safety: privileged
run-in: shell
sessions: 1
min-version: 16
minutes: 12
revision: 1

## Overview
A backup command can succeed without proving that the restored application data is what you need.
Restore a physical backup into a separate server, then construct a query that compares its complete
small inventory with a known baseline. The source changes after the backup without changing its row
count, so counting rows cannot answer the question.

## Syntax breakdown
### Mechanism map

```text
private source: inventory (id, item, quantity)
        |
        +-- baseline query -- physical backup + required WAL -- separate restore
        |                                                        |
        +-- change quantity of id=2 to 99                  repeat baseline query
        |                                                        |
        +-- later source query                            compare every value

All three inventories have 3 rows. Only one source state matches the backup.
```

A physical backup contains cluster files. WAL makes the online copy consistent when PostgreSQL
starts it. It represents a recoverable point, not every later change to the source. The controller
keeps the source quiet while it takes this backup, then changes one quantity.

### Your task — about three minutes
Replace the query in Run. Select all three business columns from **inventory**, with a stable
ordering by its primary key **id**. The fixture has rows `(1,bolts,10)`, `(2,nuts,20)` and
`(3,washers,30)`. Your result must match the restored copy and distinguish the later source.
Use a normal SELECT; the controller runs it in a read-only transaction at all three points.
The supplied count query is a runnable starting point that deliberately lacks enough evidence.

Spend up to three minutes constructing the query and two debugging it; a worked command is below
if useful. Reading, running and cleanup fit a twelve-minute core. No written answer is needed.

### Commands and supplied work
- **go run ./courses/postgres-essentials/lab/recovery** runs the supplied Go controller from the
  engine directory. **--lesson 27** chooses this fixture; **--query** is your SQL, passed as one
  quoted shell argument. **ORDER BY id** gives deterministic row order for comparison.
- The controller supplies **initdb**, **pg_ctl**, backup and restore paths, and explicit private
  connection strings. Inherited PG connection settings are discarded. On root it runs server
  commands as the postgres OS account; ordinary users run them as themselves. PostgreSQL 16 and Go
  must already be installed.
- **pg_basebackup -D ... -X stream --checkpoint=fast** copies the cluster into a new destination,
  streams the WAL needed to recover that backup, and requests an immediate initial checkpoint.
  **pg_verifybackup** checks the backup manifest, file checksums and required WAL before the copy is
  started. Passing that check still needs a test restore and application-level verification.
- The restored copy gets a different Unix socket and no streaming connection to the source.
  **psql -X -Atq -v ON_ERROR_STOP=1** ignores startup customizations, prints compact results and
  stops on SQL errors. The three labels identify when and where your exact query ran.
- Automatic cleanup uses **pg_ctl -m fast -w** to end connections and stop each owned server,
  verifies stopped state, and removes its whole temporary tree, including backup and WAL files.

## Caution
Run in one shell, outside psql. Each invocation owns a new `/tmp/pe-recovery-*` directory and
accepts no existing cluster target. Budget 500 MB temporary space and leave 2 GiB free; the controller
requires 3 GiB before starting. TCP is disabled; normal fsync, full-page writes and synchronous local
commit remain enabled. Ctrl-C also runs cleanup. If cleanup reports a retained path, stop and inspect
that exact fixture before rerunning. Never substitute the learner's `/labs/pglab` paths.

## Setup
```sh
cd /root/Software/skills-tools/curriculum-tools
```

## Run
```sh
# Replace the count query with your ordered, complete inventory query.
go run ./courses/postgres-essentials/lab/recovery --lesson 27 \
  --query 'SELECT count(*) FROM inventory'
```

## Expected result
The unchanged starter prints `3` for baseline, restored copy and later source, followed by
`distinguishes_later_source=false` and STOP after cleanup. This is the limitation of your
verification query, not a failed restore.

### Worked completion

```sh
go run ./courses/postgres-essentials/lab/recovery --lesson 27 \
  --query 'SELECT id,item,quantity FROM inventory ORDER BY id'
```

Baseline and restored inventories both contain `1|bolts|10`, `2|nuts|20`, `3|washers|30`.
The later source instead contains `2|nuts|99`. Expect `backup_manifest_verified=true`,
`baseline_matches_restore=true` and `distinguishes_later_source=true`. An independent controller
query also prints the restored rows. Finish with `cleanup=owned_tree_removed removed=true` on
either run; all servers and copies from that invocation are gone. No manual table cleanup is needed.

## Systems lens
Verification needs an intended state and a comparison strong enough to detect wrong values.
A file listing proves files exist, a manifest checks backup integrity, and a restored inventory
tests usable application data. They answer different questions. Comparing only with the current
source would incorrectly reject this valid older backup. This small same-host test proves neither
off-host backup retention nor recovery time for a production-sized database.
