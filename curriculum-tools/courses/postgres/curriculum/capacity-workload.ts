import { code, type Draft } from "../../../src/types.ts";

export const CAPACITY: Draft = {
  slug: "connection-saturation",
  revision: 4,
  title: "Measure throughput and waiting as active clients increase",
  tags: ["connections", "capacity", "observability", "row-locks"],
  difficulty: "advanced",
  safetyLevel: "writes-data",
  runIn: "shell",
  sessions: 1,
  estimatedMinutes: 30,
  prerequisites: [
    "wait-events-tell-you-where-time-goes",
    "pg-stat-statements-as-tracing",
    "row-locks-are-in-the-tuple",
  ],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 1 "Introduction" (section "Clients and the Client-Server Protocol").`,
  overview: code`
More active clients can increase waiting without increasing completed work. Run a fixed transaction
count against one deliberately serialized counter, varying client concurrency while recording
throughput, individual latencies and wait samples. Use the committed counter and transaction logs
together before interpreting the performance results.`,
  caution: code`
Use the dedicated lab database with PGHOST, PGPORT, PGUSER and PGDATABASE explicitly exported in this
shell. The driver requires Python 3, psql and pgbench 16 from the lab installation. Run it while other
benchmarks are idle. It uses at most eight benchmark clients plus one observer, with a 30-second monitored
budget per trial (plus at most five seconds for an in-flight observer query), and creates and drops only a uniquely named experiment schema. Raw evidence stays
in the printed temporary directory. Interrupted/failed runs are not successful capacity results.`,
  syntaxBreakdown: code`
### In plain terms

Each client repeatedly increments the same database row and holds its transaction open briefly.
That gives every transaction one shared point it must pass through. The supplied driver runs 400
transactions with 1, 2, 4 and 8 clients, then repeats in reverse order. You compare how much work
finishes per second and how long each client waits, rather than opening connections until failure.

### What you are learning

- **Concurrency versus admission:** Active work and permitted connections are different budgets.
  max_connections is an admission limit; it is not a promise of useful throughput.
- **Closed-loop load:** Each benchmark client waits for its transaction before submitting another.
  Slower service reduces offered work, unlike an independent stream of external arrivals.
- **A serialized service point:** Every update needs the same row lock. Holding it longer creates
  an intentional bottleneck whose queue becomes observable.
- **Evidence at two boundaries:** pgbench logs client transactions; the counter checks committed
  database work. Both must agree before the timing table is accepted.
- **Empirical tail latency:** Sorting individual latencies gives sample percentiles. Four hundred
  samples make p99 the 396th ordered observation; this is not a stable production SLO.

### Piece by piece

- **python3 - and the quoted PY heredoc** (shell invocation)
  - What they are: Python reads the supplied program from standard input; quoting the heredoc
    delimiter prevents the shell from expanding its contents.
  - What they do here: They run the complete experiment driver without an application framework.
  - What they give us: A reproducible shell command and a printed table of measured trials.
- **os.environ and PCAP_HOLD_MS** (driver configuration)
  - What they are: Environment variables supply libpq connection settings and the controlled hold time.
  - What they do here: The driver requires explicit lab coordinates and bounds the hold time to 0–20ms.
  - What they give us: The core uses 5ms; the variation uses 1ms with every other input unchanged.
- **uuid, tempfile.mkdtemp and pathlib.Path** (Python standard-library helpers)
  - What they are: A random identifier, an owned evidence directory and filesystem path operations.
  - What they do here: They name one schema and keep its script, transaction logs and wait samples.
  - What they give us: Independent reruns and a concrete path for inspecting the measurements.
- **subprocess.run / Popen, timeout, poll, kill and wait** (process control)
  - What they are: APIs for bounded commands and one owned background benchmark process.
  - What they do here: psql queries have a five-second client timeout; the benchmark has a 30-second
    observation budget and is stopped if the driver fails before it exits.
  - What they give us: Exit status and captured errors; finally closes the owned process and schema.
- **psql -X -A -t -v ON_ERROR_STOP=1 -c** (SQL client flags)
  - What they are: -X skips startup files, -A removes table formatting, -t removes headings, -v sets
    a psql variable and -c supplies one command string. ON_ERROR_STOP makes unexpected errors fail.
  - What they do here: They create/reset the fixture, sample waits and read the committed counter.
  - What they give us: Small parseable results; unexpected SQL is not silently treated as success.
- **PGAPPNAME, PGCONNECT_TIMEOUT and PGOPTIONS** (libpq environment)
  - What they are: A backend label, connection deadline and per-session server settings.
  - What they do here: They identify each run and cap server statements at 10 seconds.
  - What they give us: Wait samples for only this trial's clients in the current database.
- **BEGIN, UPDATE, pg_sleep and COMMIT** (benchmark transaction)
  - What they are: One transaction changes the shared counter, pauses and publishes its change.
  - What they do here: The row lock remains held during the pause; other clients must wait their turn.
  - What they give us: A known serialized point and one committed increment per successful transaction.
- **pgbench -n -c -j -t -f -l --log-prefix** (load-driver flags)
  - What they are: -n skips startup vacuum; -c sets clients; -j sets worker threads; -t sets transactions
    per client; -f selects the custom SQL; -l logs each transaction; --log-prefix selects owned files.
  - What they do here: Every trial totals 400 transactions with one fixed driver thread, so the sweep changes only clients.
  - What they give us: Per-transaction latency in the third log field (microseconds) and the standard
    throughput summary. Trials keep connections open; they do not measure connect-per-request cost.
- **pg_stat_activity and FILTER** (wait sampling)
  - What they are: Live backend state and conditional counts for Lock and PgSleep waits.
  - What they do here: Roughly every 0.1 seconds, an observer counts only the benchmark's labelled clients.
  - What they give us: Raw samples and a peak observed number of lock waiters; this is not a duration
    profile or proof of every wait. Sampling itself consumes resources on the same host.
- **statistics.median, sorted and math.ceil** (latency summary)
  - What they are: Standard Python operations on recorded values.
  - What they do here: They convert microseconds to milliseconds and choose nearest-rank p95/p99.
  - What they give us: Empirical percentiles for completed transactions, alongside explicit failure counts.
- **pgbench tps, counter checks and reversed rounds** (measurement controls)
  - What they are: pgbench throughput excluding initial connection time, a committed-result check,
    and a second sweep from 8 clients down to 1.
  - What they do here: They expose disagreement between logs and effects and reduce a simple run-order bias.
  - What they give us: A workload-specific comparison; a few runs do not establish a production optimum.
- **DROP SCHEMA ... CASCADE** (owned cleanup)
  - What it is: It removes a schema and the objects inside it.
  - What it does here: The driver drops only its generated pcap_ schema after terminating its benchmark.
  - What it gives us: No leftover experiment table; evidence files remain for inspection.`,
  code: code`
python3 - <<'PY'
import math
import os
from pathlib import Path
import re
import statistics
import subprocess
import tempfile
import time
import uuid

for name in ('PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE'):
    if not os.environ.get(name):
        raise SystemExit('Export ' + name + ' for the dedicated lab before running.')
hold_ms = float(os.environ.get('PCAP_HOLD_MS', '5'))
if not math.isfinite(hold_ms) or not 0 <= hold_ms <= 20:
    raise SystemExit('PCAP_HOLD_MS must be between 0 and 20.')
base_env = dict(os.environ, PGCONNECT_TIMEOUT='3', PGOPTIONS='-c statement_timeout=10000')
schema = 'pcap_' + uuid.uuid4().hex[:12]
evidence = Path(tempfile.mkdtemp(prefix='pg-capacity-'))
print('schema:', schema, 'evidence:', evidence, 'hold_ms:', hold_ms, flush=True)

def sql(statement):
    result = subprocess.run(
        ['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement],
        env=dict(base_env, PGAPPNAME=schema + '_observer'),
        capture_output=True, text=True, timeout=5)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[math.ceil(fraction * len(ordered)) - 1]

script = evidence / 'transaction.sql'
script.write_text('BEGIN;\nUPDATE ' + schema + '.counter SET n=n+1 WHERE id=1;\n'
                  'SELECT pg_sleep(' + str(hold_ms / 1000) + ');\nCOMMIT;\n')
print('round clients commits failures tps median_ms p95_ms p99_ms peak_lock_waiters', flush=True)
try:
    settings = sql("SELECT current_setting('server_version'),current_setting('synchronous_commit'),"
                   "current_setting('fsync'),current_setting('shared_buffers'),"
                   "current_setting('default_transaction_isolation')")
    (evidence / 'settings.txt').write_text('version|synchronous_commit|fsync|shared_buffers|isolation\n' + settings + '\n')
    sql('CREATE SCHEMA ' + schema)
    sql('CREATE TABLE ' + schema + '.counter(id int primary key,n int not null)')
    for round_no, clients_order in enumerate(((1, 2, 4, 8), (8, 4, 2, 1)), 1):
        for clients in clients_order:
            sql('TRUNCATE ' + schema + '.counter; INSERT INTO ' + schema + '.counter VALUES(1,0)')
            label = schema + '_r' + str(round_no) + '_c' + str(clients)
            prefix = evidence / (label + '.log')
            summary_path = evidence / (label + '.summary')
            samples = []
            command = ['pgbench', '-n', '-c', str(clients), '-j', '1',
                       '-t', str(400 // clients), '-f', str(script), '-l',
                       '--log-prefix', str(prefix), os.environ['PGDATABASE']]
            with summary_path.open('w') as summary:
                process = subprocess.Popen(command, env=dict(base_env, PGAPPNAME=label),
                                           stdout=summary, stderr=subprocess.STDOUT)
                deadline = time.monotonic() + 30
                try:
                    while process.poll() is None:
                        if time.monotonic() >= deadline:
                            raise TimeoutError('Trial exceeded 30 seconds: ' + label)
                        sample = sql("SELECT count(*) FILTER(WHERE wait_event_type='Lock'),"
                                     "count(*) FILTER(WHERE wait_event='PgSleep'),count(*) "
                                     "FROM pg_stat_activity WHERE datname=current_database() "
                                     "AND application_name='" + label + "'")
                        samples.append(sample)
                        time.sleep(0.1)
                finally:
                    if process.poll() is None:
                        process.kill()
                    process.wait()
            (evidence / (label + '.waits')).write_text('\n'.join(samples) + '\n')
            records = [line.split() for path in evidence.glob(label + '.log.*')
                       for line in path.read_text().splitlines() if line.strip()]
            latencies = [float(row[2]) / 1000 for row in records if row[2].isdigit()]
            failures = len(records) - len(latencies)
            commits = int(sql('SELECT n FROM ' + schema + '.counter WHERE id=1'))
            if process.returncode or failures or len(latencies) != 400 or commits != 400:
                raise RuntimeError('Invalid trial: ' + label + '\n' + summary_path.read_text())
            match = re.search(r'^tps = ([0-9.]+)', summary_path.read_text(), re.MULTILINE)
            if not match:
                raise RuntimeError('No throughput summary: ' + str(summary_path))
            peak_waiters = max((int(row.split('|')[0]) for row in samples), default=0)
            print(round_no, clients, commits, failures, round(float(match[1]), 2),
                  round(statistics.median(latencies), 3), round(percentile(latencies, .95), 3),
                  round(percentile(latencies, .99), 3), peak_waiters, flush=True)
finally:
    sql('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE')
print('All eight trials: 400 recorded successes = 400 committed increments, zero failures.', flush=True)
print('Retained evidence:', evidence, flush=True)
PY`,
  expectedResult: code`
Each of eight trials must record 400 successful transactions, zero failed log entries and exactly 400
committed increments. A process error, deadline or mismatch stops the experiment and prints an error;
there is no inferred success from a timing line alone. Raw server settings, summaries, logs and scoped wait samples
remain under the printed directory, and the owned schema is dropped.

With a 5ms pause inside the row lock, the single shared counter deliberately limits concurrency.
Additional clients can spend more time queued while completed throughput changes little. Compare
both rounds: record actual throughput, median, p95, p99 and observed lock waiters rather than expecting
fixed numbers or a monotonic result. An empty lock sample is not proof that no wait occurred.

In the validated 5ms run, throughput stayed around 131–141 transactions/second while empirical p99
rose from about 10–14ms at one client to 173–197ms at eight. These numbers describe that run, not a
required output. Reducing the hold to 1ms produced about 248–285 transactions/second; eight clients
still had materially higher tail latency than one or two.

The 1ms variation changes the service point's hold time, not the number of shards or connection slots.
Compare both matrices and explain where a higher concurrency stops buying useful throughput. The
experiment is closed-loop, logs only submitted transactions and runs on one local machine. It does
not include an independent arrival queue, network partitions or application end-to-end p99, and it
cannot choose a production pool size for a different workload.`,
  systemsLens: code`
Capacity depends on where work must serialize, not just how many callers can enter. More callers can
increase queueing and tail latency once a shared resource is busy. Reducing time at that resource,
partitioning the invariant or limiting active work are different interventions with different
correctness costs. Measure offered load, completed work and latency together; a closed-loop driver
can hide overload by automatically slowing its own arrival rate.`,
  challenge: code`
Run the same supplied driver with PCAP_HOLD_MS=1 instead of 5. Compare both reversed sweeps and choose
a concurrency limit for this counter workload that keeps measured p99 below 30ms in both rounds,
explaining the latency/throughput tradeoff and the limits of those samples. State why
that limit is an experiment result rather than a recommendation for every PostgreSQL service.`,
};
