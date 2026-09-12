# Observe a controlled process tree

slug: process-tree
category: processes-and-identity
difficulty: beginner
tags: processes, procfs
prerequisites: pid-and-parentage
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Create a parent, child, and grandchild that sleep briefly, then inspect their hierarchy with pstree and ps --forest. The tree shows which execution contexts were forked from which ancestors.

## Syntax breakdown
### In plain terms

One controlled root creates a child and grandchild. Two process views sample the same short-lived hierarchy before exact cleanup removes the root.

### What you are learning

- A process tree is ancestry, not merely a list of command names.
- Display formatting is sampled evidence and may change as children exit.

### Piece by piece

- **bash -c** creates each shell; the inner **&** starts the grandchild and **wait** keeps its parent alive.
- **$!** records the outer root. **trap ... EXIT** kills and waits for only that PID if the observation fails midway.
- **pstree -p PID** prints descendants and annotates each with its PID. **ps --forest** draws indentation from parentage; **-p** selects the root and **--ppid** asks for direct children.
- **sleep 0.2** is a bounded observation delay, not a guarantee that every display will retain every short-lived process.

## Run
```sh
tree_parent=
bash -c 'bash -c "sleep 5" & wait' &
tree_parent=$!
trap 'kill "$tree_parent" 2>/dev/null || true; wait "$tree_parent" 2>/dev/null || true' EXIT
sleep 0.2
printf 'tree_root_pid=%s\n' "$tree_parent"
printf 'pstree_evidence=\n'
pstree -p "$tree_parent"
printf 'ps_forest_evidence=\n'
ps -o pid=,ppid=,stat=,comm= --forest -p "$tree_parent" --ppid "$tree_parent"
kill "$tree_parent" 2>/dev/null || true
wait "$tree_parent" 2>/dev/null || true
trap - EXIT
printf 'cleanup=tree_stopped\n'
```

## Expected result
pstree_evidence contains tree_root_pid and at least one descendant, and ps_forest_evidence lists the root and its child with matching PID/PPID columns. cleanup=tree_stopped follows exact root cleanup; short-lived PIDs and display spacing vary.

## Systems lens
Fork ancestry propagates environment, credentials, and open descriptors while retaining a parent-child lifecycle edge. A service tree is therefore useful evidence when an unexpected worker survives or inherits state.

## Optional variation
Before cleanup, both views should show the controlled root and at least one descendant; a short-lived grandchild may also appear. Match a PID in `pstree` to the PID/PPID columns in `ps --forest`; the indentation represents that parentage.

For a shorter fresh snapshot, replace the root command with:

```sh
bash -c 'bash -c "sleep 2" & wait' &
```

Keep the bounded `sleep 0.2` observation and use the printed `tree_root_pid` value, held in the `tree_parent` variable, for exact cleanup rather than a broad process search. An orphaned-looking worker first needs its parent tree; command-line or descriptor evidence can then explain how it was started or what it retains.
