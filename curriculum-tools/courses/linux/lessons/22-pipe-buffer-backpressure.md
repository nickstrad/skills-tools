# Turn a finite FIFO buffer into backpressure

slug: pipe-buffer-backpressure
category: file-descriptors-and-pipes
difficulty: intermediate
tags: pipes, processes, file-descriptors
prerequisites: standard-stream-fds
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 14
revision: 2

## Overview
Start a producer writing a bounded eight-megabyte stream to a FIFO with no draining consumer. Its write side blocks when the kernel pipe buffer fills; starting a consumer releases the producer and lets the exact byte count complete.

## Syntax breakdown
### In plain terms

The producer has an open FIFO endpoint because descriptor 7 keeps both ends open. It blocks when the finite buffer fills because there is no draining consumer yet; starting the consumer releases that backpressure.

### What you are learning

- A pipe buffer is finite and creates flow control.
- A process state and elapsed delay are samples; completed byte count is the decisive completion evidence.

### Piece by piece

- **mkfifo** creates the named pipe. **exec 7<> FIFO** opens both endpoints in this shell so producer opening does not block; descriptor 7 does not drain bytes.
- **BLOCK_BYTES=65536** and **BLOCK_COUNT=128** name the supplied block shape; **$((BLOCK_BYTES * BLOCK_COUNT))** calculates the expected total so a variation changes one value. **dd if=/dev/zero of=FIFO bs=... count=...** writes that many fixed-size blocks. The **status=none** flag suppresses dd's progress text so only lesson labels remain. After **sleep 0.15**, **ps -o stat=** samples the producer; S or D supports `producer_blocked=yes` on this host.
- The consumer **dd** uses the same block values. Its **iflag=fullblock** flag makes it read whole requested blocks despite short pipe reads, and its **status=none** flag keeps its own progress messages out of the evidence; it then writes the drain file.
- **wait** joins producer and consumer. **wc -c < DRAIN** compares the completed byte count with EXPECTED_BYTES; this proves progress after draining, unlike a state snapshot.
- The trap kills/waits recorded PIDs, closes descriptor 7, and removes only FIFO and drain files.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FIFO=$LAB/backpressure-$UID.fifo
DRAIN=$LAB/backpressure-$UID.bin
BLOCK_BYTES=65536
BLOCK_COUNT=128
EXPECTED_BYTES=$((BLOCK_BYTES * BLOCK_COUNT))
rm -f "$FIFO" "$DRAIN"
mkfifo "$FIFO"
exec 7<>"$FIFO"
producer_pid=
consumer_pid=
trap 'test -n "$producer_pid" && kill "$producer_pid" 2>/dev/null || true; test -n "$consumer_pid" && kill "$consumer_pid" 2>/dev/null || true; test -n "$producer_pid" && wait "$producer_pid" 2>/dev/null || true; test -n "$consumer_pid" && wait "$consumer_pid" 2>/dev/null || true; exec 7>&-; rm -f "$FIFO" "$DRAIN"' EXIT
dd if=/dev/zero of="$FIFO" bs="$BLOCK_BYTES" count="$BLOCK_COUNT" status=none &
producer_pid=$!
sleep 0.15
producer_state=$(ps -o stat= -p "$producer_pid" 2>/dev/null | tr -d ' ' | cut -c1)
if [ "$producer_state" = S ] || [ "$producer_state" = D ]; then producer_blocked=yes; else producer_blocked=no; fi
printf 'producer_pid=%s\n' "$producer_pid"
printf 'producer_state=%s\n' "$producer_state"
printf 'producer_blocked=%s\n' "$producer_blocked"
dd if="$FIFO" of="$DRAIN" bs="$BLOCK_BYTES" count="$BLOCK_COUNT" iflag=fullblock status=none &
consumer_pid=$!
wait "$producer_pid"
producer_status=$?
wait "$consumer_pid"
consumer_status=$?
exec 7>&-
printf 'producer_status=%s consumer_status=%s\n' "$producer_status" "$consumer_status"
printf 'produced_bytes=%s\n' "$(wc -c < "$DRAIN")"
if [ "$producer_status" -eq 0 ] && [ "$consumer_status" -eq 0 ] && [ "$(wc -c < "$DRAIN")" -eq "$EXPECTED_BYTES" ]; then printf 'backpressure_released=yes\n'; else printf 'backpressure_released=no\n'; fi
rm -f "$FIFO" "$DRAIN"
producer_pid=
consumer_pid=
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
producer_blocked=yes while the FIFO has no draining consumer, then both statuses are 0, produced_bytes=8388608, and backpressure_released=yes after the consumer starts. Descriptor 7 already holds FIFO endpoints open, so this demonstrates finite-buffer blocking rather than writer-open blocking. The producer state may be S or D depending on kernel accounting.

## Systems lens
A pipe is a bounded kernel buffer, not an infinite queue. When producer throughput exceeds consumer throughput, blocking is the built-in feedback signal used by shells, RPC streams, and worker pipelines.

## Optional variation
**Predict.** Before running, what state, completion statuses, and byte relationship would demonstrate backpressure and later release?

**Inspect and explain.** Explain why descriptor 7 means the observation is buffer pressure, not absence of a reader endpoint.

**Vary.** In a full rerun, change only `BLOCK_COUNT=128` to `BLOCK_COUNT=64`; EXPECTED_BYTES and both dd count arguments then follow that one value.

**Hint.** Keep the shared BLOCK_COUNT and iflag=fullblock; the arithmetic assignment updates the assertion before cleanup.

**Apply.** For a streaming service, name the queue-size and consumer-progress evidence needed before blaming a blocked producer.
