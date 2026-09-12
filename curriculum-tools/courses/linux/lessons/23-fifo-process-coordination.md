# Coordinate independent shells through a named pipe

slug: fifo-process-coordination
category: file-descriptors-and-pipes
difficulty: intermediate
tags: pipes, processes, file-descriptors
prerequisites: coordinate-two-shell-sessions
safety: writes-data
run-in: shell
sessions: 2
min-version: 5.1
minutes: 12
revision: 2

## Overview
Use two writer descriptors in Session B and one reader descriptor in Session A. A receives the message after the first writer closes, but its next read reaches EOF only when the final writer closes, separating endpoint lifetime from the earlier rendezvous lesson.

## Syntax breakdown
### In plain terms

This two-session experiment follows one FIFO through message delivery and end-of-file. Session B deliberately keeps a second writer open after sending the message, so Session A's second read cannot finish until that final writer closes.

### What you are learning

- EOF on a FIFO reader means every writer endpoint has closed.
- A file marker provides bounded coordination between the two sessions without changing FIFO data.

### Piece by piece

- Session A uses **mkfifo** and **stat -c %F** to create and verify the path. **exec 8< FIFO** opens a persistent reader; it blocks until B opens a writer.
- **read -r message <&8** consumes B's newline-terminated record. **: > FIRST_READ** records that this first read completed, then the second **read** waits for either more data or EOF.
- Session B opens **exec 9> FIFO** and **exec 10> FIFO** as two writer descriptors. It writes through 9 and closes only 9; descriptor 10 remains the final writer.
- The fixed poll for FIRST_READ proves A consumed the record before B closes 10. **exec 10>&-** closes the final writer, letting A's second read return nonzero at EOF.
- The `eof_status=0; read ... || eof_status=$?` sequence preserves expected EOF without terminating a shell that uses errexit. Both sessions use the fixed UID-qualified paths and bounded loops.

## Caution
Run the labelled Session A step first. It intentionally blocks while opening the reader and again while the final writer remains open; both sessions must use the same LINUX_LAB.

## Run
```sh
# Session A (blocks until B opens a writer; later blocks until B closes final writer)
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FIFO=$LAB/fifo-coordination-$UID.fifo
FIRST_READ=$LAB/fifo-first-read-$UID.ready
rm -f "$FIFO" "$FIRST_READ"
mkfifo "$FIFO"
trap '{ exec 8<&-; } 2>/dev/null || true; rm -f "$FIFO" "$FIRST_READ"' EXIT
printf 'fifo_type=%s\n' "$(stat -c %F "$FIFO")"
printf 'session_a=waiting_for_writer\n'
exec 8< "$FIFO"
read -r message <&8
printf 'session_a_received=%s\n' "$message"
: > "$FIRST_READ"
printf 'session_a=waiting_for_final_writer_close\n'
trailing=
eof_status=0
read -r trailing <&8 || eof_status=$?
printf 'session_a_eof_status=%s\n' "$eof_status"
if [ "$eof_status" -ne 0 ] && [ -z "$trailing" ]; then printf 'eof_after_final_writer=yes\n'; else printf 'eof_after_final_writer=no\n'; fi
exec 8<&-
rm -f "$FIFO" "$FIRST_READ"
trap - EXIT
printf 'session_a_cleanup=done\n'

# Session B
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
FIFO=$LAB/fifo-coordination-$UID.fifo
FIRST_READ=$LAB/fifo-first-read-$UID.ready
trap '{ exec 9>&-; } 2>/dev/null || true; { exec 10>&-; } 2>/dev/null || true' EXIT
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  [ -p "$FIFO" ] && break
  sleep 0.05
done
printf 'session_b_fifo=%s\n' "$(test -p "$FIFO" && echo present || echo absent)"
[ -p "$FIFO" ]
exec 9> "$FIFO"
exec 10> "$FIFO"
printf 'fifo-message-from-B\n' >&9
exec 9>&-
printf 'session_b=first_writer_closed_final_writer_open\n'
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  [ -e "$FIRST_READ" ] && break
  sleep 0.05
done
printf 'session_b_first_read_seen=%s\n' "$(test -e "$FIRST_READ" && echo yes || echo no)"
[ -e "$FIRST_READ" ]
exec 10>&-
trap - EXIT
printf 'session_b=final_writer_closed\n'
```

## Expected result
Session A prints fifo_type=fifo and waits for a writer. Session B reports session_b_fifo=present, session_b=first_writer_closed_final_writer_open, then session_b_first_read_seen=yes before session_b=final_writer_closed. A receives fifo-message-from-B, waits for final writer close, then reports session_a_eof_status=1 and eof_after_final_writer=yes before cleanup. The two A waits intentionally block until the corresponding B endpoint action.

## Systems lens
A FIFO combines a filesystem name with a kernel pipe, so opening and reading it creates a rendezvous between unrelated processes. Reader EOF is an endpoint-lifetime fact: it occurs after the final writer reference closes, which queue consumers and handoff scripts must distinguish from an idle producer.

## Optional variation
Rerun both sessions with the message changed to fifo-variation-from-B, keeping both writer
descriptors. Do not close descriptor10 before session_b_first_read_seen=yes. Session A receives
the new message, then its second read still waits for the final writer to close.

Compare the A/B labels: first-writer closure leaves another writer reference, while final-writer
closure allows EOF and eof_after_final_writer=yes. Message content does not change that ownership
relationship. A blocked queue read alone cannot establish that no producer endpoint remains.
