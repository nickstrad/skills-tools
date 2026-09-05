import { code, type Draft } from "../../../src/types.ts";

const driver = code`
python3 - <<'PY'
import json, math, os, re, statistics, subprocess, tempfile, uuid
from pathlib import Path

for name in ('PGHOST','PGPORT','PGUSER','PGDATABASE'):
    if not os.environ.get(name):
        raise SystemExit('Export ' + name + ' for the disposable lab first')
batch = int(os.environ.get('WAL_BATCH', '1'))
if batch not in (1,5):
    raise SystemExit('WAL_BATCH must be 1 or 5')
env = dict(os.environ, PGCONNECT_TIMEOUT='3', PGOPTIONS='-c statement_timeout=10000')
schema = 'wal_commit_' + uuid.uuid4().hex[:12]
evidence = Path(tempfile.mkdtemp(prefix='pg-commit-cost-'))
print('evidence:', evidence, 'increments_per_transaction:', batch, flush=True)

def sql(statement):
    result = subprocess.run(['psql','-X','-At','-v','ON_ERROR_STOP=1','-c',statement],
                            env=env, capture_output=True, text=True, timeout=5)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

def wal_stats():
    return json.loads(sql("select json_build_object('sync',wal_sync,'write',wal_write,"
                          "'bytes',wal_bytes,'reset',stats_reset) from pg_stat_wal"))

def percentile(values, fraction):
    return sorted(values)[math.ceil(len(values)*fraction)-1]

settings = json.loads(sql("select json_object_agg(name,setting) from pg_settings where name in "
                         "('server_version','fsync','wal_sync_method','wal_writer_delay',"
                         "'synchronous_standby_names','shared_buffers','wal_compression')"))
(evidence/'settings.json').write_text(json.dumps(settings,indent=2)+'\n')
if settings['fsync'] != 'on' or settings['synchronous_standby_names'] != '':
    raise SystemExit('Use a lab with fsync=on and no configured synchronous standbys')
script = evidence/'transaction.sql'
script.write_text('BEGIN;\n' + ('UPDATE '+schema+'.counter SET n=n+1 WHERE id=:client_id;\n')*batch
                  + 'COMMIT;\n')
cases = [('on',1),('off',1),('on',4),('off',4)]
print('round sync clients transactions increments failures tps increments_per_s median_ms p95_ms p99_ms wal_sync_delta wal_write_delta', flush=True)
try:
    sql('CREATE SCHEMA '+schema)
    sql('CREATE TABLE '+schema+'.counter(id int primary key,n int not null) WITH (autovacuum_enabled=off,fillfactor=70)')
    for round_no, order in enumerate((cases,list(reversed(cases))),1):
        for sync, clients in order:
            sql('TRUNCATE '+schema+'.counter; INSERT INTO '+schema+'.counter SELECT g,0 FROM generate_series(0,3) g')
            label = 'r'+str(round_no)+'_'+sync+'_c'+str(clients)
            before = wal_stats()
            command = ['pgbench','-n','-M','prepared','-c',str(clients),'-j','1',
                       '-t',str(400//batch//clients),'-f',str(script),'-l',
                       '--log-prefix',str(evidence/(label+'.log')),os.environ['PGDATABASE']]
            with (evidence/(label+'.summary')).open('w') as summary:
                proc = subprocess.Popen(command, env=dict(env,PGAPPNAME=schema+'_'+label,
                    PGOPTIONS='-c statement_timeout=10000 -c synchronous_commit='+sync),
                    stdout=summary, stderr=subprocess.STDOUT)
                try:
                    proc.wait(timeout=30)
                finally:
                    if proc.poll() is None:
                        proc.kill()
                    proc.wait(timeout=5)
            after = wal_stats()
            (evidence/(label+'.wal.json')).write_text(json.dumps({'before':before,'after':after},indent=2)+'\n')
            if before['reset'] != after['reset']:
                raise RuntimeError('WAL statistics reset during '+label)
            records = [line.split() for path in evidence.glob(label+'.log.*')
                       for line in path.read_text().splitlines() if line.strip()]
            values = [float(row[2])/1000 for row in records if len(row)>2 and row[2].isdigit()]
            counts = json.loads(sql('SELECT json_agg(n ORDER BY id) FROM '+schema+'.counter'))
            expected = [400//clients if i<clients else 0 for i in range(4)]
            invalid_records = len(records)-len(values)
            summary = (evidence/(label+'.summary')).read_text()
            failed_match = re.search(r'^number of failed transactions: (\d+)',summary,re.MULTILINE)
            if not failed_match:
                raise RuntimeError('Missing failed-transaction count '+label)
            failures = int(failed_match[1])
            if proc.returncode or failures or invalid_records or len(values)!=400//batch or counts!=expected:
                raise RuntimeError('Invalid committed/log outcome '+label+' counts='+str(counts)+'\n'+summary)
            match = re.search(r'^tps = ([0-9.]+)',summary,re.MULTILINE)
            if not match:
                raise RuntimeError('Missing throughput summary '+label)
            tps = float(match[1])
            print(round_no,sync,clients,len(values),sum(counts),failures,round(tps,2),round(tps*batch,2),
                  round(statistics.median(values),3),round(percentile(values,.95),3),
                  round(percentile(values,.99),3),after['sync']-before['sync'],
                  after['write']-before['write'],flush=True)
finally:
    sql('DROP SCHEMA IF EXISTS '+schema+' CASCADE')
print('Validated eight trials: each has exactly400 committed increments and zero failures.',flush=True)
print('No crash was performed; visibility after an async commit is not proof of crash durability.',flush=True)
PY`;

export const FSYNC_PROBE = code`python3 - <<'PY'
import subprocess, tempfile
from pathlib import Path
folder=Path(tempfile.mkdtemp(prefix='pg-fsync-probe-'))
with (folder/'results.txt').open('w') as output:
    result=subprocess.run(['pg_test_fsync','-f',str(folder/'probe.out'),'-s','1'],
                          stdout=output,stderr=subprocess.STDOUT,timeout=60)
print((folder/'results.txt').read_text())
print('Probe evidence:',folder)
if result.returncode:
    raise SystemExit(result.returncode)
PY`;

export const COMMIT_WORKLOAD: Draft = {
  slug: "commit-means-fsync",
  title: "Measure commit waiting, concurrency and useful work",
  tags: ["wal", "fsync", "durability", "capacity"],
  difficulty: "intermediate",
  safetyLevel: "writes-data",
  runIn: "shell",
  sessions: 1,
  revision: 4,
  estimatedMinutes: 30,
  prerequisites: ["every-change-is-a-wal-record", "build-lab-cluster"],
  reading:
    code`PostgreSQL 14 Internals, Chapter 11 "WAL Modes" (sections "Performance", "Fault Tolerance")`,
  readingNotes:
    code`Chapter 11 explains the performance and failure consequences of WAL settings. Run the comparison first, then connect waiting for local WAL flush with the acknowledgement contract. The optional file probe measures a different boundary from a full database transaction.`,
  overview:
    code`Compare synchronous and asynchronous commit waiting with one and four clients, using a fixed amount of useful work and raw transaction latencies. Verify every committed increment before interpreting throughput or WAL-sync counters. A second sweep reverses the order so one warm-up sequence does not silently become the conclusion.`,
  caution:
    code`Run from a shell with explicit lab PGHOST, PGPORT, PGUSER and PGDATABASE, Python3 and PostgreSQL16 psql/pgbench on PATH. The lab must have fsync enabled and no synchronous standbys configured. The driver uses at most four benchmark clients, a30-second budget per trial, unique owned schema/evidence paths and local session settings. Raw evidence is retained; its schema is removed after the benchmark stops. No server restart or global setting change occurs.`,
  code: driver,
  expectedResult:
    code`Every trial completes exactly400 increments distributed evenly among the active client IDs, with zero failed log entries and the expected transaction count. The core has400 transaction samples per trial; the batch-five variation has80, still totaling400 increments. Process errors, deadlines, reset epochs or result mismatches fail the run. All eight trials must pass before accepting their timing comparison.

Compare both rounds' actual throughput, median/p95/p99 transaction latency and WAL-sync deltas. Synchronous commits wait for the required local flush; concurrent commits can share that work. Asynchronous commits can return before that flush, but may still be flushed before your observation. No fixed speedup or one-sync-per-transaction equality is required. The driver records wal_sync_method because some methods do not use separate sync calls counted by wal_sync; zero in that column is not proof that durability work was skipped.

WAL counters are cluster-wide and can include background work; the samples do not establish an exact physical-device fsync count for each client. The final row checks establish current committed visibility, not survival of a crash that this experiment never performed.`,
  systemsLens:
    code`Keep the workload outcome and acknowledgement boundary explicit. Group commit can amortize flush work while preserving synchronous acknowledgement. Application batching changes the atomic unit and amortizes transaction overhead; asynchronous commit changes what acknowledgement promises. Compare useful operations per second and transaction latency rather than treating those three choices as equivalent optimizations.`,
  challenge:
    code`Change only the grouping from one increment per transaction to five. Keep400 useful increments per trial and the same policy/client sweep. Compare increments_per_s and transaction latency while acknowledging the smaller80-sample tail estimate; exact batch-five code is in hint2.

Optional depth: run a file-flush probe on its own temporary file. It requires pg_test_fsync from the
same PostgreSQL installation on PATH. Results describe the filesystem containing its printed
folder. To compare with WAL storage, first set TMPDIR to an existing writable directory on the
same filesystem as the lab's pg_wal, outside the server data directory. Each method is sampled for one second, with a60-second total
process bound. This does not measure the database transaction path or guarantee a hardware latency
floor for your application.

` + FSYNC_PROBE.split("\n").map((line) => "    " + line).join("\n"),
  syntaxBreakdown: code`
### In plain terms

Each client updates its own counter, so a deliberate shared-row lock does not dominate this experiment. Compare the same400 increments under two commit policies and two concurrency levels, then change how many increments share a transaction.

### What you are learning

- Waiting for a commit flush and observing a row are different boundaries.
- Group commit can share flush work across independent transactions.
- Application batching changes the atomic unit; compare useful work as well as transaction counts.
- Closed-loop latency samples and cluster WAL counters have explicit attribution limits.

### Piece by piece

- **python3 - and the quoted here-document** (supplied driver): Run Python without shell interpolation of program contents. WAL_BATCH selects1 or5 increments per transaction; other values are rejected.
- **PGHOST, PGPORT, PGUSER, PGDATABASE, PGCONNECT_TIMEOUT and PGOPTIONS** (connection inputs): Select the existing disposable lab, bound connection startup, and give statements a10-second budget. Each benchmark connection sets its own synchronous_commit policy; server configuration is unchanged.
- **uuid, tempfile and pathlib** (owned resources): Generate a unique schema and evidence directory. Raw settings, SQL script, per-transaction logs, summaries and counter snapshots remain available after cleanup.
- **psql -X -At -v ON_ERROR_STOP=1 -c** (observer flags): Ignore startup files, print unaligned tuple-only results, stop on errors and execute the supplied SQL string. Each observer command has a5-second process bound.
- **pg_settings, json_object_agg and json_build_object** (configuration and structured evidence): Record actual WAL settings. Require fsync=on and no synchronous standby policy so the comparison isolates local durability waiting. JSON retains nullable reset timestamps for comparison.
- **CREATE SCHEMA, fillfactor, autovacuum_enabled and TRUNCATE** (fresh fixture): Reset four owned counters before each trial with the same layout, disable their automatic maintenance and reserve update room. These controls do not remove all shared-buffer, CPU or WAL contention.
- **BEGIN, UPDATE, :client_id and COMMIT** (benchmark transaction): pgbench supplies a zero-based client ID; each client increments its own row. The variation repeats five updates before committing. Failed transactions do not count as useful work.
- **pgbench -n -M prepared -c -j -t -f -l --log-prefix** (load controls): -n skips initialization vacuum; -M uses prepared protocol; -c chooses1 or4 clients; -j stays1 in every trial; -t sets transactions per client; -f selects the script; -l enables raw latency logs; --log-prefix keeps files under the evidence directory. Connections persist across transactions.
- **subprocess.Popen, wait, kill and finally** (bounded ownership): Wait at most30 seconds for the owned benchmark, kill it if still running and reap it before removing its schema. Observer/driver errors do not become successful timing results.
- **pg_stat_wal, wal_sync_method and stats_reset** (aggregate durability work): Compare published WAL-write/sync counters across the trial with an unchanged reset epoch. These are cluster-wide counters; open_sync/open_datasync can synchronize as part of the write rather than a separate counted sync call.
- **median, nearest-rank percentiles and tps** (measurements): Convert the third pgbench log field from microseconds to milliseconds. Multiply transactions/second by batch size for useful increments/second. Tail samples describe completed submitted transactions, not an independent arrival queue or a production SLO.
- **json_agg, expected counts and DROP SCHEMA ... CASCADE** (invariant and cleanup): Verify each active client's exact share of400 increments and every inactive row's zero before accepting timing. Drop only the generated schema after its processes end.
- **pg_test_fsync -f -s** (optional file probe): -f selects a newly owned temporary file, and -s1 samples each tested method for one second. TMPDIR chooses the filesystem for tempfile's new directory; use a writable parent on the WAL filesystem for a relevant comparison. subprocess.run applies an overall60-second bound and saves all output; compare only supported methods and do not equate this file test with database transaction latency.
`,
};
export const COMMIT_WORKLOAD_VARIATION = driver.replace(
  "python3 - <<'PY'",
  "WAL_BATCH=5 python3 - <<'PY'",
);
