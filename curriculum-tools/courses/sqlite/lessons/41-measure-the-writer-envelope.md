# Measure a workload-specific single-writer envelope

slug: measure-the-writer-envelope
category: performance
difficulty: advanced
tags: transactions, busy, capacity, backpressure
prerequisites: analyze-changes-plans
safety: locking
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 30
revision: 3

## Overview
Run equal 40-row workloads with one persistent writer and different transaction sizes, then isolate a controlled contention window with a second writer. Every connection installs its own WAL, synchronization and wait policies. Treat the instrumented results as a bounded workload experiment, not SQLite's peak capacity.

## Syntax breakdown
### In plain terms

This exercise separates two costs often collapsed into one benchmark number: doing work under the writer reservation, and failing to obtain that reservation. The batching comparison changes transaction count while holding total rows fixed. The second experiment intentionally makes ten attempts fail before releasing the holder; it explains contention rather than simulating random production traffic.

### What you are learning

- **Fair comparison:** Count rows, transactions, settings, and connection lifetimes separately.
- **Admission outcome:** A busy attempt is not a completed transaction and must not disappear from the denominator.
- **Observer overhead:** Measuring every transaction through a shell adds polling, process-launch and logging costs.
- **Capacity boundary:** File-wide serialization is a mechanism; an acceptable workload envelope must include latency, errors, storage growth and recovery requirements.

### Piece by piece

- **set -eu, case, dirname, test, and mktemp -d** reject an absent or unsafe lab path and create a unique evidence directory. **rm -f** only clears explicitly named artifacts inside that newly created directory.
- **mkfifo and exec 4/5** feed commands to persistent sqlite3 processes. The shell keeps their input descriptors open so per-connection settings survive every transaction. **sqlite3 -bail** stops baseline workers on SQL errors; the racer deliberately continues after expected busy errors.
- **PRAGMA journal_mode=WAL, synchronous=NORMAL, wal_autocheckpoint=0, and busy_timeout** install the actual worker policies. NORMAL here is a workload choice, not a claim of power-loss durability; disabled automatic checkpointing makes live WAL growth observable.
- **BEGIN IMMEDIATE, WITH RECURSIVE, and COMMIT** admit one writer, generate a bounded batch, and publish it. Batch 1 runs 40 transactions; batch 10 runs four, both inserting 40 rows.
- **printf, grep -Fxq, seq, and bounded sleep loops** send commands and wait for complete READY/DONE marker lines. -F means literal matching, -x means a whole line, and -q suppresses output. Deadlines turn missing acknowledgments into errors instead of hanging forever.
- **date +%s%N** samples epoch nanoseconds around each send/wait cycle. **stat -c %s** reads WAL bytes while the writer is still open. These observer latencies include shell polling; they are not engine-only commit latency.
- **sort -n, wc -l, awk, and percentile ranks** order those observed samples and select p50/p95. The throughput denominator also includes instrumentation and final verification. **.timer on** retains separate SQLite statement timings in the worker log, not one aggregate transaction profile.
- **The unpaced phase** generates 4,000 identical INSERTs before timing, then feeds either 4,000 single-row transactions or 400 ten-row transactions to a persistent worker. The timer excludes file generation and connection setup; it includes SQL transport, parsing, execution and one final polling handshake. No per-transaction shell sampling runs in this phase. Both row counts and live WAL sizes are checked before closure, and rows/s is reported separately from the instrumented 40-row comparison.
- **The holder and racer** have separate connections. The holder reserves the writer until ten racer statements have returned busy, then commits its own row. Each racer attempt is one atomic INSERT, avoiding a failed BEGIN followed by accidentally autocommitted work.
- **grep error classification, wait status, and row assertions** require zero unexpected errors, ten busy attempts and ten committed racer rows. The final total is eleven including the holder. The mixed percentile combines failed waits and successful writes; inspect those populations separately for a production report.
- **trap, kill -0, kill -KILL, and wait** detect, terminate if necessary, and reap only processes this script created. Logs and latency samples remain at the printed evidence path.

## Caution
Use only the printed disposable evidence directory. The holder releases after ten acknowledged attempts, not a guessed sleep interval. This instrumented CLI fixture excludes realistic arrivals, host crashes and power loss; its throughput is not a sizing recommendation.

## Run
```sh
(
set -eu
db=${TUTOR_SQLITE_DB:-}
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
parent=$(dirname -- "$db")
[ "$parent" != / ] && [ -d "$parent" ] && [ -w "$parent" ] || { echo 'database parent must be a writable non-root directory' >&2; exit 2; }
scratch=$(mktemp -d "$parent/sqlite-envelope.XXXXXX")
printf 'scratch_dir=%s\n' "$scratch"
pid=0; holder=0; racer=0
cleanup() { for process in "$pid" "$holder" "$racer"; do if [ "$process" -gt 0 ] && kill -0 "$process" 2>/dev/null; then kill -KILL "$process" 2>/dev/null || true; wait "$process" 2>/dev/null || true; fi; done; printf 'evidence_retained=%s\n' "$scratch"; }
trap cleanup EXIT

percentiles() {
  file=$1
  count=$(wc -l < "$file")
  [ "$count" -gt 0 ] || { echo 'observer_latency_samples=0 observer_p50_ns=NA observer_p95_ns=NA'; return; }
  p50=$(( (count + 1) / 2 )); p95=$(( (95 * count + 99) / 100 ));
  sort -n "$file" > "$file.sorted"
  awk -v p50="$p50" -v p95="$p95" '{ a[NR]=$1 } END { print "observer_latency_samples=" NR " observer_p50_ns=" a[p50] " observer_p95_ns=" a[p95] }' "$file.sorted"
}
run_persistent() {
  name=$1; batch=$2; total=$3; database="$scratch/$name-$batch.db"; fifo="$scratch/$name-$batch.fifo"; log="$scratch/$name-$batch.log"; samples="$scratch/$name-$batch.latency"
  rm -f "$database" "$database-wal" "$database-shm" "$fifo" "$log" "$samples"
  mkfifo "$fifo"
  sqlite3 -bail "$database" < "$fifo" > "$log" 2>&1 & pid=$!
  exec 4>"$fifo"
  printf '%s\n' "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=100; CREATE TABLE writes(id INTEGER PRIMARY KEY, worker TEXT, batch INTEGER, payload TEXT);" ".timer on" "SELECT 'READY';" >&4
  ready=0; for n in $(seq 1 100); do if grep -q READY "$log"; then ready=1; break; fi; sleep 0.01; done
  [ "$ready" -eq 1 ] || { echo "$name readiness deadline exceeded" >&2; return 3; }
  start_total=$(date +%s%N)
  for tx in $(seq 1 "$total"); do
    start=$(date +%s%N)
    printf '%s\n' "BEGIN IMMEDIATE; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < $batch) INSERT INTO writes(worker,batch,payload) SELECT '$name', $batch, 'row-' || x FROM n; COMMIT; SELECT 'DONE-$tx';" >&4
    done=0; for n in $(seq 1 100); do if grep -Fxq "DONE-$tx" "$log"; then done=1; break; fi; sleep 0.01; done
    [ "$done" -eq 1 ] || { echo "$name transaction $tx deadline exceeded" >&2; return 3; }
    end=$(date +%s%N); printf '%s\n' "$((end - start))" >> "$samples"
    printf '%s batch=%s txn=%02d observer_latency_ns=%s wal_bytes=%s\n' "$name" "$batch" "$tx" "$((end - start))" "$(stat -c '%s' "$database-wal" 2>/dev/null || echo 0)"
  done
  printf '.quit\n' >&4; exec 4>&-; wait "$pid"; pid=0
  busy=$(grep -ic 'database is locked' "$log" || true)
  unexpected=$(grep -Ei 'error|failed' "$log" | grep -Eiv 'database is locked' | wc -l || true)
  rows=$(sqlite3 "$database" "SELECT count(*) FROM writes WHERE worker='$name';")
  finish=$(date +%s%N); elapsed=$((finish - start_total)); throughput=$(awk -v rows="$rows" -v ns="$elapsed" 'BEGIN { if (ns > 0) printf "%.2f", rows/(ns/1000000000); else print "0" }')
  timer_lines=$(grep -c 'Run Time:' "$log" || true)
  [ "$busy" -eq 0 ] && [ "$unexpected" -eq 0 ] || { echo "$name produced an unexpected baseline error; inspect $log" >&2; return 4; }
  [ "$rows" -eq "$((total * batch))" ] || { echo 'baseline row assertion failed' >&2; return 4; }
  printf '%s attempts=%s successes=%s busy=%s unexpected_errors=%s rows=%s throughput_rows_s=%s engine_timer_lines=%s ' "$name" "$total" "$total" "$busy" "$unexpected" "$rows" "$throughput" "$timer_lines"
  percentiles "$samples"
}
echo '--- one persistent writer, same SQL settings, batch sizes 1 and 10 ---'
run_persistent single 1 40
run_persistent single 10 4
echo '--- unpaced comparison: pre-generated 4000-row workloads, no per-transaction polling ---'
for batch in 1 10; do
  database="$scratch/unpaced-$batch.db"; fifo="$scratch/unpaced-$batch.fifo"; log="$scratch/unpaced-$batch.log"
  workload="$scratch/unpaced-$batch.sql"; transactions=$((4000 / batch))
  awk -v batch="$batch" -v txs="$transactions" 'BEGIN {
    for (t=1; t<=txs; t++) {
      print "BEGIN IMMEDIATE;";
      for (i=1; i<=batch; i++) print "INSERT INTO writes VALUES (" ((t-1)*batch+i) ");";
      print "COMMIT;";
    }
  }' > "$workload"
  mkfifo "$fifo"
  sqlite3 -bail "$database" < "$fifo" > "$log" 2>&1 & pid=$!
  exec 4>"$fifo"
  printf '%s\n' 'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=100; CREATE TABLE writes(id INTEGER PRIMARY KEY);' "SELECT 'READY';" >&4
  ready=0; for n in $(seq 1 200); do if grep -Fxq READY "$log"; then ready=1; break; fi; sleep 0.01; done
  [ "$ready" -eq 1 ] || { echo 'unpaced readiness deadline exceeded' >&2; exit 3; }
  started=$(date +%s%N)
  cat "$workload" >&4
  printf "%s\n" "SELECT 'WORK_DONE';" >&4
  done=0; for n in $(seq 1 1000); do if grep -Fxq WORK_DONE "$log"; then done=1; break; fi; sleep 0.01; done
  [ "$done" -eq 1 ] || { echo 'unpaced workload deadline exceeded' >&2; exit 3; }
  elapsed=$(( $(date +%s%N) - started ))
  wal_bytes=$(stat -c '%s' "$database-wal")
  printf '%s\n' "SELECT 'ROWS=' || count(*) FROM writes;" '.quit' >&4
  exec 4>&-; wait "$pid"; pid=0
  grep -Fxq 'ROWS=4000' "$log" || { echo 'unpaced row assertion failed' >&2; exit 4; }
  awk -v batch="$batch" -v txs="$transactions" -v ns="$elapsed" -v wal="$wal_bytes" 'BEGIN { printf "unpaced batch=%d transactions=%d rows=4000 elapsed_ns=%.0f throughput_rows_s=%.2f live_wal_bytes=%s\n", batch, txs, ns, 4000/(ns/1000000000), wal; }'
done
echo '--- two persistent writers: holder owns first half, then releases by marker ---'
database="$scratch/two.db"; fifo_a="$scratch/a.fifo"; fifo_b="$scratch/b.fifo"; log_a="$scratch/a.log"; log_b="$scratch/b.log"; samples="$scratch/racer.latency"
sqlite3 "$database" 'PRAGMA journal_mode=WAL; CREATE TABLE writes(id INTEGER PRIMARY KEY, worker TEXT, batch INTEGER, payload TEXT);' >/dev/null
mkfifo "$fifo_a" "$fifo_b"; sqlite3 "$database" < "$fifo_a" > "$log_a" 2>&1 & holder=$!; sqlite3 "$database" < "$fifo_b" > "$log_b" 2>&1 & racer=$!
exec 4>"$fifo_a"; exec 5>"$fifo_b"
printf '%s\n' "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=0; BEGIN IMMEDIATE; INSERT INTO writes(worker,batch,payload) VALUES ('holder',1,'lock');" "SELECT 'HOLDER_READY';" ".timer on" >&4
ready=0; for n in $(seq 1 100); do if grep -Fxq HOLDER_READY "$log_a"; then ready=1; break; fi; sleep 0.01; done
[ "$ready" -eq 1 ] || { echo 'holder readiness deadline exceeded' >&2; exit 3; }
printf '%s\n' "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=50;" "SELECT 'RACER_READY';" ".timer on" >&5
ready=0; for n in $(seq 1 100); do if grep -Fxq RACER_READY "$log_b"; then ready=1; break; fi; sleep 0.01; done
[ "$ready" -eq 1 ] || { echo 'racer readiness deadline exceeded' >&2; exit 3; }
: > "$samples"
for tx in $(seq 1 20); do
  start=$(date +%s%N)
  printf '%s\n' "INSERT INTO writes(worker,batch,payload) VALUES ('racer',1,'row-$tx'); SELECT 'RACER-DONE-$tx';" >&5
  done=0; for n in $(seq 1 100); do if grep -Fxq "RACER-DONE-$tx" "$log_b"; then done=1; break; fi; sleep 0.01; done
  [ "$done" -eq 1 ] || { echo "racer transaction $tx deadline exceeded" >&2; exit 3; }
  end=$(date +%s%N); printf '%s\n' "$((end - start))" >> "$samples"
  printf 'racer txn=%02d observer_latency_ns=%s wal_bytes=%s\n' "$tx" "$((end - start))" "$(stat -c '%s' "$database-wal" 2>/dev/null || echo 0)"
  [ "$tx" -eq 10 ] && { printf '%s\n' "COMMIT; SELECT 'HOLDER_RELEASED';" '.quit' >&4; exec 4>&-; holder_status=0; wait "$holder" || holder_status=$?; holder=0; [ "$holder_status" -eq 0 ] || { echo "holder exited unexpectedly; inspect $log_a" >&2; exit 4; }; }
done
printf '.quit\n' >&5; exec 5>&-; racer_status=0; wait "$racer" || racer_status=$?; racer=0
busy=$(grep -ic 'database is locked' "$log_b" || true); unexpected=$(grep -Ei 'error|failed' "$log_b" | grep -Eiv 'database is locked' | wc -l || true)
rows=$(sqlite3 "$database" "SELECT count(*) FROM writes WHERE worker='racer';")
timer_lines=$(grep -c 'Run Time:' "$log_b" || true)
[ "$unexpected" -eq 0 ] || { echo "unexpected racer error; inspect $log_b" >&2; exit 4; }
[ "$racer_status" -le 1 ] && [ "$busy" -eq 10 ] && [ "$rows" -eq 10 ] || { echo 'contention outcome assertion failed' >&2; exit 4; }
[ "$(sqlite3 "$database" 'SELECT count(*) FROM writes;')" -eq 11 ] || { echo 'final row assertion failed' >&2; exit 4; }
printf 'two_writer attempts=20 successes=%s busy=%s unexpected_errors=%s rows=%s engine_timer_lines=%s ' "$((rows))" "$busy" "$unexpected" "$rows" "$timer_lines"; percentiles "$samples"
printf 'two_writer final_rows=%s final_wal_bytes=%s logs=%s,%s\n' "$(sqlite3 "$database" 'SELECT count(*) FROM writes;')" "$(stat -c '%s' "$database-wal" 2>/dev/null || echo 0)" "$log_a" "$log_b"
)
```

## Expected result
Both single-writer runs assert 40 rows, zero busy errors and zero unexpected errors: batch 1 has 40 successful transactions, batch 10 has four. Each prints observer latency p50/p95, instrumented rows/s and engine timer-line counts. The additional unpaced runs both assert 4000 rows, using 4000 versus 400 transactions, and report workload rows/s plus live WAL bytes. In the distinct contention experiment, exactly 20 racer attempts split into ten busy outcomes and ten successes; final_rows is 11 including the holder. WAL bytes are measured live; final WAL may be zero after all connections close. Timing ratios are host- and instrumentation-dependent, not a required outcome or a peak-throughput estimate.

## Systems lens
Batching trades fewer commits for longer writer occupancy and a larger retry unit. Busy timeout is a bounded admission wait, not extra write capacity. Carry the mechanism into an architecture decision, but obtain sustained, minimally instrumented measurements of the actual workload before claiming that its latency/error budgets fit.

## Optional variation
Compare the supplied fixed-row batch cases first: 40 rows in 40 versus four transactions, then 4000 rows in 4000 versus 400 transactions without per-transaction polling. Repeat Run with only the racer's `PRAGMA busy_timeout=50` changed to `PRAGMA busy_timeout=100`. Its first ten attempts still return busy because the holder releases only afterward; their configured wait component totals roughly one second instead of half a second. The final ten successes and eleven total rows remain unchanged.

For a workload-specific extension, adapt the supplied unpaced phase while keeping total rows and connection policies comparable. Measure successful work and rejected admission separately; the mixed contention percentile does not describe either population alone. The existing fixture does not establish an unmeasured production workload's capacity.
