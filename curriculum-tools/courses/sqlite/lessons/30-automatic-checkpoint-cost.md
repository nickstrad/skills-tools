# See who pays for automatic checkpoints

slug: automatic-checkpoint-cost
category: wal
difficulty: advanced
tags: wal, checkpoints, synchronous, capacity
prerequisites: checkpoint-modes
safety: locking
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 25
revision: 1

## Overview
Run the same twelve commits in four fresh databases: FULL and NORMAL, each with threshold 1 and threshold 0. Comparing thresholds within one durability policy isolates checkpoint placement; comparing policies at one threshold isolates synchronization differences. Keep the writer alive so close-time cleanup cannot hide where the work occurred.

## Syntax breakdown
### In plain terms

The commit that reaches an automatic-checkpoint threshold can perform maintenance itself. That can put database-file writes and synchronization on an application's foreground path. We control checkpoint threshold and durability mode independently, because changing both at once would not tell us which caused a difference.

### What you are learning

- **Work placement:** The committing connection can also be the checkpointer.
- **Controlled comparison:** Four combinations separate threshold effects from FULL/NORMAL policy.
- **Durability boundary:** A sync system call is an engine request, not a power-cut experiment.
- **Measurement limits:** Shell-observed elapsed samples include polling overhead; WAL bytes and attributed trace ordering are the causal evidence.

### Piece by piece

- **set -eu, case, dirname, test, and mktemp -d** validate the owned lab parent and create a unique evidence directory. Nothing clears the main lab file.
- **command -v strace** and a small probe detect tracer availability. A denied ptrace policy is printed explicitly: file/row observations can continue, but the synchronization part remains unverified until run where tracing is allowed.
- **strace -qq -f -tt -yy -e trace=fsync,fdatasync,write -o FILE** traces the persistent process. -qq reduces tracer chatter; -f follows children; -tt timestamps events; -yy annotates file descriptors with paths; -e selects calls; -o preserves the trace. Look for -wal versus main-database syncs between writes of READY, COMMIT-n and CHECKPOINT_DONE markers.
- **mkfifo and exec 3** keep one sqlite3 connection alive. **-bail** makes unexpected SQL errors stop it. **PRAGMA journal_mode=WAL, synchronous, and wal_autocheckpoint** are set in that very connection, not a discarded setup process.
- **printf and bounded grep polling** feed one INSERT at a time and wait for its full COMMIT-n marker. **grep -F/-x/-q** means literal, whole-line, quiet matching; **seq and sleep** bound the observer loop.
- **date +%s%N** provides nanosecond timestamps; the difference includes command delivery and polling. **stat -c %s** gives live WAL byte length after each acknowledged commit.
- **PRAGMA wal_checkpoint(FULL)** is an explicit maintenance phase after all twelve commits. The printed triple is busy | log frames | checkpointed frames; **grep -B1** selects it immediately before the marker.
- **grep -Ec** counts sync calls up to the observed checkpoint, including setup. Inspect phase markers in the trace before attributing a total to commits alone. The final count assertion requires ROWS=12.
- **trap, kill -0, kill -KILL, wait, and descriptor closure** clean up owned work on exit. The FIFO is removed while databases, logs and available traces are retained.

## Caution
Use a disposable local path and retain evidence. Nanosecond units do not imply nanosecond measurement precision. A process kill cannot prove power-loss durability, and a trace blocked by host policy must be rerun with tracing permitted before claiming synchronization evidence.

## Run
```sh
(
set -eu
db=${TUTOR_SQLITE_DB:-}
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
parent=$(dirname -- "$db")
[ "$parent" != / ] && [ -d "$parent" ] && [ -w "$parent" ] || { echo 'database parent must be writable' >&2; exit 2; }
trace_enabled=0
if command -v strace >/dev/null && strace -qq -o /dev/null true 2>/dev/null; then trace_enabled=1; else echo 'strace_unavailable=ptrace policy; commit/WAL evidence will still run' >&2; fi
scratch=$(mktemp -d "$parent/sqlite-auto-checkpoint.XXXXXX")
pid=0
cleanup() { if [ "$pid" -gt 0 ] && kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; printf 'evidence_retained=%s\n' "$scratch"; }
trap cleanup EXIT
run_writer() {
  mode=$1; threshold=$2; label="$mode-$threshold"; fifo="$scratch/$label.fifo"; logfile="$scratch/$label.log"; database="$scratch/$label.db"
  mkfifo "$fifo"
  if [ "$trace_enabled" -eq 1 ]; then strace -qq -f -tt -yy -e trace=fsync,fdatasync,write -o "$scratch/$label.trace" sqlite3 -bail "$database" < "$fifo" > "$logfile" 2>&1 & else sqlite3 -bail "$database" < "$fifo" > "$logfile" 2>&1 & fi
  pid=$!
  exec 3>"$fifo"
  printf '%s\n' "PRAGMA journal_mode=WAL; PRAGMA synchronous=$mode; PRAGMA wal_autocheckpoint=$threshold; DROP TABLE IF EXISTS events; CREATE TABLE events(id INTEGER PRIMARY KEY, body TEXT); SELECT 'READY';" >&3
  ready=0; for n in $(seq 1 100); do if grep -q READY "$logfile"; then ready=1; break; fi; sleep 0.02; done
  [ "$ready" -eq 1 ] || { echo "$mode readiness deadline exceeded" >&2; return 3; }
  for n in $(seq 1 12); do
    start=$(date +%s%N)
    printf "INSERT INTO events(body) VALUES ('event-%s'); SELECT 'COMMIT-%s';\n" "$n" "$n" >&3
    done=0; for poll in $(seq 1 100); do if grep -Fxq "COMMIT-$n" "$logfile"; then done=1; break; fi; sleep 0.02; done
    [ "$done" -eq 1 ] || { echo "$mode commit $n deadline exceeded" >&2; return 3; }
    end=$(date +%s%N)
    bytes=$(stat -c '%s' "$database-wal" 2>/dev/null || echo 0)
    printf '%s commit=%02d observer_elapsed_ns=%s wal_bytes=%s\n' "$label" "$n" "$((end - start))" "$bytes"
  done
  printf "PRAGMA wal_checkpoint(FULL); SELECT 'CHECKPOINT_DONE';\n" >&3
  done=0; for poll in $(seq 1 100); do if grep -q CHECKPOINT_DONE "$logfile"; then done=1; break; fi; sleep 0.02; done
  [ "$done" -eq 1 ] || { echo "$mode checkpoint deadline exceeded" >&2; return 3; }
  printf '%s checkpoint_output=' "$label"; grep -B1 CHECKPOINT_DONE "$logfile" | head -n 1
  if [ "$trace_enabled" -eq 1 ]; then printf '%s sync_calls_before_close=%s\n' "$label" "$(grep -Ec 'fsync|fdatasync' "$scratch/$label.trace" || true)"; else printf '%s sync_calls=unavailable\n' "$label"; fi
  printf "SELECT 'ROWS=' || count(*) FROM events;\n" >&3
  exec 3>&-
  wait "$pid"; pid=0
  grep -Fxq 'ROWS=12' "$logfile" || { echo 'row assertion failed' >&2; return 4; }
  printf '%s rows=12 trace=%s\n' "$label" "$scratch/$label.trace"
  rm -f "$fifo"
}
run_writer FULL 1
run_writer FULL 0
run_writer NORMAL 1
run_writer NORMAL 0
)
```

## Expected result
All four cases assert rows=12. With threshold 1 the WAL repeatedly reuses a small allocated length; with threshold 0 it grows across the twelve commits until the explicit checkpoint, under both policies. Trace-capable runs show FULL syncing the WAL for commits; NORMAL shifts ordinary WAL synchronization to checkpoint/reuse boundaries. Threshold 1 can therefore put checkpoint syncs into NORMAL's foreground path too. Exact totals include setup and depend on reuse; inspect timestamps, file paths and markers. Unavailable tracing is an explicit partial experiment, never evidence of zero sync calls.

## Systems lens
Maintenance policy changes who pays and when, not just how much work exists. SQLite can charge checkpoint work to the application thread issuing COMMIT, unlike assuming a server background worker owns it. Separate your latency budget, durability contract, reader retention and checkpoint scheduling decisions; a faster observed acknowledgment can mean a different failure promise.

## Optional variation
Compare the supplied FULL-1 and FULL-0 traces first, then NORMAL-1 and NORMAL-0. Locate synchronization between COMMIT-12 and CHECKPOINT_DONE to separate the explicit checkpoint from foreground commit work. Threshold 1 repeatedly puts checkpoint work on the committing connection; threshold 0 defers that work in this controlled run. The next lesson supplies the long-reader comparison: an old snapshot limits safe checkpoint progress and WAL reuse even while later commits succeed.
