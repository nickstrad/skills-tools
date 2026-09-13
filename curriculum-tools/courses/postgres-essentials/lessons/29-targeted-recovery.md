# Recover to a chosen point and account for excluded work

slug: targeted-recovery
category: durability-recovery
difficulty: intermediate
tags: wal, recovery, pitr, operation-history
prerequisites: recovery-needs-history
safety: privileged
run-in: shell
sessions: 1
min-version: 16
minutes: 12
revision: 1

## Overview
Recover a base backup to a named point that preserves useful work and excludes a later bad import.
Both operations committed successfully on the source. Your choice determines which committed
history the restored server will expose; recovery cannot infer which business operation was wrong.

## Syntax breakdown
### Mechanism map

```text
source WAL order:
  baseline id=1 -> backup -> COMMIT id=2 -> before_bad -> COMMIT id=3 -> after_bad
                             accepted       marker       bad import    marker

restore = backup + continuous archived WAL up to the chosen marker
  before_bad: ids 1,2
  after_bad:  ids 1,2,3
```

A **restore point** is a named WAL record created by **pg_create_restore_point(name)**. The fixture
creates each point after the preceding transaction has committed, on a quiet private primary.
**recovery_target_name** tells archive recovery which named record to stop at. Choosing a point
before the unwanted transaction excludes it by omitting later history; it does not undo that
transaction on the original source.

### Your task — about three minutes
Choose the target argument in Run that retains **id=2, accepted order** but excludes **id=3, bad
import**. Both available names are in the diagram. Connect the point's position to the operation
history; choosing merely the newest point will keep the bad import. The starter deliberately uses
the later point. Change the argument before running, or compare its output first. Allow three
minutes for the choice and evidence, with a twelve-minute core including setup and cleanup.

### Commands and supplied work
- **go run ... --lesson 29 --target NAME** passes your selected name to the supplied Go fixture.
  The accepted names are **before_bad** and **after_bad**. No timestamp or LSN needs transcription.
- The controller creates the baseline, takes **pg_basebackup -X none**, then commits the two
  operations and creates their named points. **pg_switch_wal()** closes the current segment, and
  an observed archive file confirms its availability before recovery begins.
- A new recovery directory gets the backup, **recovery.signal**, a private **restore_command**,
  **recovery_target_name**, and **recovery_target_action='pause'**. The latter leaves the recovered
  server in recovery mode at the target so the controller can inspect it without promotion.
- **pg_get_wal_replay_pause_state()** must report **paused**, not just a requested pause.
  The server log must name the selected restore point. **SELECT id,effect FROM operations ORDER
  BY id** compares every visible operation on the unchanged source and restored copy.
- Supplied process control uses private Unix sockets, 1 MB WAL segments and ordinary durability
  settings. Root's servers run as the postgres OS account. Commands have deadlines; fast shutdown
  and removal retire primary, backup, restore and both archive copies at the end.

## Caution
Use one shell with Go and PostgreSQL 16. The fixture accepts no existing cluster path; keep its
commands scoped to the generated `/tmp/pe-recovery-*` directory. Budget 500 MB and leave 2 GiB
free; the controller requires 3 GiB before allocation. Ctrl-C also cleans up. Stop on a retained-path
warning instead of accumulating copies. Do not resume or promote this inspection copy; it is
automatically stopped while still at the chosen target.

## Setup
```sh
cd /root/Software/skills-tools/curriculum-tools
```

## Run
```sh
# Choose the point that keeps the accepted order but excludes the bad import.
go run ./courses/postgres-essentials/lab/recovery --lesson 29 --target after_bad
```

## Expected result
The source always prints `1|baseline`, `2|accepted order`, `3|bad import`. With the starter
**after_bad**, the recovered history also has all three: recovery reaches its configured target
correctly, but that target fails the business requirement. The controller prints STOP after cleanup.

### Worked completion

```sh
go run ./courses/postgres-essentials/lab/recovery --lesson 29 --target before_bad
```

The restored copy prints only `1|baseline` and `2|accepted order`. Its log says
`recovery stopping at restore point "before_bad"`. Expect `accepted_order_preserved=true`,
`bad_import_excluded=true` and `recovery_paused=true`. Both runs finish with
`cleanup=owned_tree_removed removed=true`; no learner tables or progress change.
Missing timeline-history or later-segment probes can appear in the log before a successful target
pause. Judge the result by the named stopping point, paused state and complete recovered history.

## Systems lens
A recovery target is a data-loss decision even when the excluded work was unwanted. This example
has no good operation after the bad import; a real workload might, and the same cutoff would exclude
that work too. Compare operation histories and account for those consequences before adopting a
restored database. Named points require advance placement and continuous retained WAL from the
backup. They are useful controlled markers, not automatic detection of a correct business state.
This lesson stops at inspection; production cutover, client fencing and external effects remain
outside its claim.
