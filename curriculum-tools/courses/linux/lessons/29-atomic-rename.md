# Observe a pathname switch without partial files

slug: atomic-rename
category: filesystem-objects
difficulty: intermediate
tags: filesystem, inodes, processes
prerequisites: paths-and-inodes
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 14
revision: 2

## Overview
Have a reader repeatedly open one pathname while a writer replaces it with complete alpha and omega files. The reader should observe whole values only, demonstrating same-filesystem rename as an atomic namespace operation.

## Syntax breakdown
### In plain terms

This publishes complete alpha and omega files repeatedly while another process opens one fixed pathname. Readers should obtain an old complete object or a new complete object, not a partly written stream. It establishes visibility atomicity, not crash durability.

### What you are learning

- Same-filesystem rename is an atomic pathname update when it succeeds.
- Visibility atomicity and durable storage ordering require different evidence.

### Piece by piece

- **printf > TEMP** and **mv -f TEMP TARGET** (writer and forced replacement): printf prepares one complete source file; mv requests rename and **-f** suppresses overwrite prompting. The reader only observes TARGET.
- **IFS= read -r value < TARGET** (shell reader): empty **IFS** preserves whitespace and **-r** prevents backslash interpretation. Every iteration opens TARGET afresh and samples one line.
- **case** (classifier): accepts only complete alpha or omega records. An empty read is also invalid: successful replacement does not introduce a missing-destination gap.
- **wait** and **trap** (join and cleanup): wait joins the recorded reader PID and trap kills only that PID and removes exact lab files on an early exit.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
TARGET=$LAB/atomic-current-$UID
TEMP=$LAB/atomic-temp-$UID
BAD=$LAB/atomic-bad-$UID
printf 'alpha\n' > "$TARGET"
rm -f "$BAD"
reader_pid=
trap 'test -n "$reader_pid" && kill "$reader_pid" 2>/dev/null || true; test -n "$reader_pid" && wait "$reader_pid" 2>/dev/null || true; rm -f "$TARGET" "$TEMP" "$BAD"' EXIT
( for iteration in $(seq 1 3000); do
    value=
    IFS= read -r value < "$TARGET" || true
    case "$value" in
      alpha|omega) ;;
      *) printf 'invalid=<%s>\n' "$value" > "$BAD"; break ;;
    esac
  done ) &
reader_pid=$!
for iteration in $(seq 1 200); do
  printf 'omega\n' > "$TEMP"
  mv -f "$TEMP" "$TARGET"
  printf 'alpha\n' > "$TEMP"
  mv -f "$TEMP" "$TARGET"
done
wait "$reader_pid"
reader_pid=
if [ -s "$BAD" ]; then printf 'invalid_observation=%s\n' "$(cat "$BAD")"; else printf 'invalid_observation=none\n'; fi
printf 'reader_sample_limit=3000 writer_swaps=400\n'
if [ ! -s "$BAD" ]; then printf 'atomicity=preserved\n'; else printf 'atomicity=violated\n'; fi
rm -f "$TARGET" "$TEMP" "$BAD"
trap - EXIT
```

## Expected result
invalid_observation=none and atomicity=preserved; the reader sees only complete alpha or omega records (an empty or partial record is rejected). reader_sample_limit=3000 and writer_swaps=400 are bounded workload labels.

## Systems lens
Rename changes a directory's pointer in one namespace operation, allowing readers to choose an old complete object or a new complete object. Release artifacts and configuration rollouts use this commit-like boundary.

## Optional variation
**Predict:** If a writer overwrites one pathname directly with two writes, what new observation becomes possible?

**Inspect and explain:** Run this complete bounded example:

```bash
lab=$LINUX_LAB; if [ -z "$lab" ]; then lab=$HOME/linux-systems-lab; fi; mkdir -p "$lab"; f="$lab/direct-vary-$UID"; for n in $(seq 1 10); do printf left > "$f"; printf 'during='; cat "$f"; printf '\n'; printf right >> "$f"; done; printf 'final='; cat "$f"; rm -f "$f"
```

Compare each during value with the final value. Explain which incomplete content direct publication exposed.

**Vary:** The loop makes exactly ten direct publications.

**Hint:** Keep TEMP and TARGET on the same mount for the main rename experiment.

**Apply:** State the extra fsync and directory-durability evidence a deployment tool would need before claiming a published file survives power loss.
