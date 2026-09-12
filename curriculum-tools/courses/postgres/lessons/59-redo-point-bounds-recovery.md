# Recovery cost: compare redo work with actual readiness

slug: redo-point-bounds-recovery
category: checkpointing
difficulty: advanced
tags: checkpoints, recovery, wal, durability
prerequisites: checkpoint-anatomy, crash-and-redo
safety: dangerous
run-in: shell
sessions: 1
min-version: 16
minutes: 30
revision: 4

## Overview
Recover matching receipt datasets with either an old checkpoint or a checkpoint after their bulk
load. Each case includes the same committed tail write, so both must actually replay WAL. Run two
pairs in reversed order on fresh owned clusters, inspect the replayed interval, and measure client
and domain readiness separately from the log's sampled redo duration.

## Syntax breakdown
### In plain terms

A recent checkpoint can shorten the retained interval that crash recovery must examine. The amount
of log and the time until a real query returns are separate measurements. We preserve the same final
receipts in both conditions and require fresh recovery evidence instead of assuming a restart did
useful replay work.

### What you are learning

- **Matched recovery trials:** compare equal rows, layout, settings and failure type.
- **Recovery bounds:** a redo position selects a WAL interval; records and page state determine work.
- **Readiness layers:** process startup, successful SQL and verified domain state have different costs.
- **Record boundaries:** redo done reports a record's start address, not necessarily the log end.

### Piece by piece

- **python3**, **subprocess.run**, **sys.executable** and **sys.argv** run four complete child trials
  in order: old/recent, recent/old. Each child initializes a new cluster. The outer driver retains
  stdout/stderr and parsed results under **tempfile.mkdtemp**'s pg-recovery-cost directory; assertions
  reject failed child processes or unequal datasets/settings/heap sizes.
- The embedded helper locates binaries through **PGBIN** or **pg_config --bindir** and allocates a
  unique private socket/data directory. Root uses **runuser -u ... --** and **os.chown**; non-root
  runs directly. **initdb -D ... -U postgres --auth-local=trust --auth-host=reject --no-locale
  --data-checksums --wal-segsize=1** chooses the directory and database owner, restricts connection
  mechanisms, fixes locale, enables checksums and uses1MB WAL segments. TCP listening is disabled.
- **shared_buffers=32MB**, **max_wal_size=128MB**, **checkpoint_timeout=1h** and disabled
  **bgwriter_lru_maxpages/autovacuum** bound interference in this small private fixture. The heap
  must stay under16MB. **fsync/full_page_writes/synchronous_commit** stay on; **pg_settings** records
  actual values. No caller session setting is changed.
- **psql -X -At -v ON_ERROR_STOP=1 -c** returns predictable output and stops on SQL errors.
  **PGCONNECT_TIMEOUT**, **statement_timeout** and **lock_timeout** bound helper operations.
  **pg_ctl -D ... -l ... -w -t20 start** bounds startup and saves its log; a SQL query then verifies
  the owned **data_directory**. Final **-m fast stop** shuts down cleanly after each trial.
- **CREATE TABLE** supplies primary-key, positive-amount and non-null constraints.
  **generate_series** and **repeat** make20,000 receipts. **WITH ins AS (INSERT ... RETURNING id)**
  allows **count/sum** to verify the bulk input while **pg_current_xact_id** records its writing
  transaction. Both conditions then commit one receipt with id20,001 and amount7.
- **CHECKPOINT** first establishes a common empty-table baseline. Only the recent condition runs
  it again after the bulk load. **pg_control_checkpoint** saves both metadata states, and checks
  reject an unexpected intermediate redo advance. **pg_relation_size** checks identical heap size.
- **pg_current_wal_insert_lsn** saves the interval end after the committed tail;
  **pg_current_wal_flush_lsn** must cover it. All buffer sampling and initial position-function
  lookups occur before the tail commit, which also flushes any observer hint WAL. The Python **lsn** function converts hexadecimal LSN
  halves to byte positions. The difference from **redo_lsn** measures address distance, not seconds.
- **pg_buffercache** samples dirty and resident main-fork heap buffers, matched by database,
  tablespace, filenode and **relforknumber=0**, before the tail write. These are observations, not a count of pages that
  recovery must rewrite; already-written pages can cause redo to skip page work.
- **pg_ctl -m immediate stop** deliberately stops without a shutdown checkpoint. A missing
  **postmaster.pid** plus **pg_controldata**'s **in production** state establishes the unclean stop.
  Its saved REDO location must match the pre-crash SQL control value.
- **pg_waldump -p ... -s REDO -e END** reads the stopped cluster's WAL before restart can recycle
  it. **rmgr**, **tx**, **lsn** and record descriptions identify record count, transaction IDs and
  the last record's start. Bulk transaction records occur only in the old-checkpoint range; tail
  INSERT and COMMIT records must occur in both. The end LSN is an exclusive interval boundary.
- **time.monotonic** measures restart through **pg_ctl** readiness polling and a fresh successful
  SQL query, then through independent domain verification. The sample includes helper/process and
  query overhead. It does not include failure detection or application reconnection policy.
- **count**, **count(distinct id)**, **min/max**, **sum** and **bool_and** verify all expected IDs,
  amounts and payloads after restart. **pg_is_in_recovery** must be false, and **timeline_id** must
  remain unchanged. A tiny receipt aggregate is this fixture's definition of domain readiness.
- The saved log-byte offset isolates **recovery.log**. Python **re.search** requires interruption,
  automatic recovery, redo start/done and ready messages. The redo start must equal the saved redo
  position; redo done must equal the offline dump's last record start after normalizing optional
  leading hexadecimal zeroes. The log's elapsed value is
  rounded and can be0.00s without meaning no work occurred.
- **json_build_object**, **row_to_json**, **json_object_agg**, **json.loads/dumps** preserve control,
  settings, intervals, rows and times as retained JSON. The variation doubles only the bulk row
  count to40,000; the tail becomes id40,001 with amount7 and the same payload.

## Caution
This shell script deliberately crashes four newly allocated /tmp/pg-owned-* clusters in sequence.
It ignores existing PG connection variables and PGLAB. Use Python3 and PostgreSQL16 server tools,
including pg_controldata, pg_waldump and pg_buffercache; PGBIN may select the binary directory.
Each child owns a private socket with TCP disabled, and finally stops its server; root uses runuser
with the postgres OS account. Evidence and stopped data directories remain at printed paths.
This tests server-process failure on intact local storage, with warm OS caches. It does not test
power loss, lost devices, cold storage, traffic failover or application restart.

## Run
```sh
python3 - <<'PY'
import json, pathlib, subprocess, sys, tempfile
trial_source = "\nimport json, os, pathlib, pwd, shutil, subprocess, tempfile, time\n\nbindir = pathlib.Path(os.environ.get(\"PGBIN\") or subprocess.check_output(\n    [\"pg_config\", \"--bindir\"], text=True).strip())\nfor name in (\"initdb\", \"pg_ctl\", \"psql\"):\n    if not (bindir / name).is_file():\n        raise RuntimeError(\"Missing PostgreSQL server executable: \" + str(bindir / name))\nroot = pathlib.Path(tempfile.mkdtemp(prefix=\"pg-owned-\", dir=\"/tmp\"))\nowner = pwd.getpwnam(\"postgres\") if os.geteuid() == 0 else pwd.getpwuid(os.geteuid())\nif os.geteuid() == 0:\n    os.chown(root, owner.pw_uid, owner.pw_gid)\nprefix = [\"runuser\", \"-u\", owner.pw_name, \"--\"] if os.geteuid() == 0 else []\ndata, sock, log = root / \"data\", root / \"socket\", root / \"server.log\"\nsock.mkdir()\nif os.geteuid() == 0:\n    os.chown(sock, owner.pw_uid, owner.pw_gid)\nenv = {k: v for k, v in os.environ.items() if not k.startswith(\"PG\")}\nenv.update(PGHOST=str(sock), PGPORT=\"6543\", PGUSER=\"postgres\", PGDATABASE=\"postgres\",\n           PGCONNECT_TIMEOUT=\"3\", PGOPTIONS=\"-c statement_timeout=5000 -c lock_timeout=1000\",\n           LC_ALL=\"C\")\nprint(\"owned evidence directory:\", root, flush=True)\n\ndef run(args, timeout=30):\n    result = subprocess.run(args, env=env, text=True, capture_output=True, timeout=timeout)\n    if result.returncode:\n        raise RuntimeError(str(args) + \"\\n\" + result.stdout + result.stderr)\n    return result.stdout.strip()\n\ndef server(name, *args, timeout=30):\n    return run(prefix + [str(bindir / name), *map(str, args)], timeout)\n\ndef sql(query):\n    return run([str(bindir / \"psql\"), \"-X\", \"-At\", \"-v\", \"ON_ERROR_STOP=1\", \"-c\", query], 10)\n\ndef wait_for(label, check, seconds=20):\n    deadline = time.monotonic() + seconds\n    while time.monotonic() < deadline:\n        result = check()\n        if result:\n            return result\n        time.sleep(0.2)\n    raise RuntimeError(\"Timed out waiting for \" + label + \"; inspect \" + str(log))\n\ndef start():\n    server(\"pg_ctl\", \"-D\", data, \"-l\", log, \"-w\", \"-t\", \"20\", \"start\", timeout=25)\n    assert sql(\"select current_setting('data_directory')\") == str(data)\n\ndef stop():\n    # Only the directory allocated above is ever passed to pg_ctl.\n    if (data / \"postmaster.pid\").exists():\n        server(\"pg_ctl\", \"-D\", data, \"-m\", \"fast\", \"-w\", \"-t\", \"20\", \"stop\", timeout=25)\n\nserver(\"initdb\", \"-D\", data, \"-U\", \"postgres\", \"--auth-local=trust\",\n       \"--auth-host=reject\", \"--no-locale\", \"--data-checksums\", \"--wal-segsize=1\")\nwith (data / \"postgresql.conf\").open(\"a\") as config:\n    config.write(\"\\nlisten_addresses=''\\nport=6543\\nunix_socket_directories='\" + str(sock) + \"'\\n\"\n                 \"shared_buffers='16MB'\\nmax_connections=10\\nwal_level=replica\\n\"\n                 \"fsync=on\\nsynchronous_commit=on\\nfull_page_writes=on\\n\"\n                 \"min_wal_size='2MB'\\nmax_wal_size='8MB'\\ncheckpoint_timeout='1h'\\n\"\n                 \"logging_collector=off\\nlog_checkpoints=on\\n\")\n\nimport re, sys\nrows, checkpoint_bulk = int(sys.argv[1]), sys.argv[2] == 'yes'\nfor name in ('pg_controldata','pg_waldump'):\n    assert (bindir / name).is_file(), 'Missing server tool: ' + name\nwith (data / 'postgresql.conf').open('a') as config:\n    config.write(\"\\nshared_buffers='32MB'\\nmax_wal_size='128MB'\\nbgwriter_lru_maxpages=0\\nautovacuum=off\\n\")\n\ndef lsn(value):\n    high, low = value.split('/')\n    return (int(high,16)<<32) + int(low,16)\n\ntry:\n    start()\n    settings = json.loads(sql(\"select json_object_agg(name,setting) from pg_settings where name in \"\n        \"('server_version','shared_buffers','max_wal_size','checkpoint_timeout','bgwriter_lru_maxpages',\"\n        \"'autovacuum','fsync','full_page_writes','synchronous_commit')\"))\n    assert all(settings[k]=='on' for k in ('fsync','full_page_writes','synchronous_commit'))\n    sql('create extension pg_buffercache')\n    sql(\"create table recovery_receipts(id int primary key, amount int not null check(amount>0), \"\n        \"pad text not null) with(autovacuum_enabled=false)\")\n    sql('checkpoint')\n    baseline = json.loads(sql('select row_to_json(c) from pg_control_checkpoint() c'))\n    bulk = json.loads(sql(\"with ins as (insert into recovery_receipts select g,g,repeat('r',200) \"\n        \"from generate_series(1,\" + str(rows) + \") g returning id) \"\n        \"select json_build_object('rows',count(*),'sum_ids',sum(id),'xid',pg_current_xact_id()::text) from ins\"))\n    assert bulk['rows']==rows and bulk['sum_ids']==rows*(rows+1)//2\n    heap_bytes = int(sql(\"select pg_relation_size('recovery_receipts')\"))\n    assert heap_bytes < 16*1024*1024, 'Keep the main heap below half the configured cache'\n    assert sql('select redo_lsn from pg_control_checkpoint()') == baseline['redo_lsn']\n    if checkpoint_bulk:\n        sql('checkpoint')\n    before = json.loads(sql('select row_to_json(c) from pg_control_checkpoint() c'))\n    assert (lsn(before['redo_lsn']) > lsn(baseline['redo_lsn'])) == checkpoint_bulk\n    dirty = json.loads(sql(\"select json_build_object('resident',count(*),'dirty',count(*) filter(where isdirty)) \"\n        \"from pg_buffercache where reldatabase=(select oid from pg_database where datname=current_database()) \"\n        \"and reltablespace=(select dattablespace from pg_database where datname=current_database()) \"\n        \"and relfilenode=pg_relation_filenode('recovery_receipts') and relforknumber=0\"))\n    # Warm position-function lookups before the final synchronous commit can flush observer hint WAL.\n    sql('select pg_current_wal_insert_lsn(),pg_current_wal_flush_lsn()')\n    # Identical committed tail in both conditions requires actual redo in each restart.\n    tail_xid = sql(\"with ins as (insert into recovery_receipts values(\" + str(rows+1) + \",7,repeat('r',200))) \"\n        \"select pg_current_xact_id()::text\")\n    upper = sql('select pg_current_wal_insert_lsn()')\n    assert lsn(sql('select pg_current_wal_flush_lsn()')) >= lsn(upper)\n    offset = log.stat().st_size\n    server('pg_ctl','-D',data,'-m','immediate','-w','-t','20','stop',timeout=25)\n    assert not (data/'postmaster.pid').exists()\n    control_text = server('pg_controldata','-D',data)\n    (root/'unclean-control.txt').write_text(control_text)\n    assert re.search(r'Database cluster state:\\s+in production',control_text)\n    saved_redo = re.search(r\"Latest checkpoint's REDO location:\\s+(\\S+)\",control_text).group(1)\n    assert saved_redo == before['redo_lsn']\n    # Decode before restart can recycle the range, and exclude the end address itself.\n    dump = run([str(bindir/'pg_waldump'),'-p',str(data/'pg_wal'),'-s',saved_redo,'-e',upper],timeout=30)\n    (root/'recovery-range.waldump').write_text(dump)\n    lines = [line for line in dump.splitlines() if line.startswith('rmgr:')]\n    assert lines\n    def xid_lines(xid):\n        return [line for line in lines if re.search(r'tx:\\s+' + xid + r'\\b',line)]\n    bulk_lines, tail_lines = xid_lines(bulk['xid']), xid_lines(tail_xid)\n    assert bool(bulk_lines) == (not checkpoint_bulk)\n    assert any('INSERT' in line for line in tail_lines) and any('COMMIT' in line for line in tail_lines)\n    last_record_start = re.search(r'lsn:\\s+(\\S+),',lines[-1]).group(1)\n    # The wall-clock sample includes pg_ctl's readiness polling and a fresh SQL connection.\n    began = time.monotonic()\n    start()\n    client_ms = 1000*(time.monotonic()-began)\n    actual = json.loads(sql(\"select json_build_object('rows',count(*),'distinct_ids',count(distinct id),\"\n        \"'first',min(id),'last',max(id),'amount',sum(amount),\"\n        \"'all_correct',bool_and(amount=case when id=\" + str(rows+1) + \" then 7 else id end \"\n        \"and pad=repeat('r',200))) from recovery_receipts\"))\n    expected = dict(rows=rows+1,distinct_ids=rows+1,first=1,last=rows+1,\n        amount=rows*(rows+1)//2+7,all_correct=True)\n    assert actual==expected\n    assert sql('select pg_is_in_recovery()') == 'f'\n    assert sql('select timeline_id from pg_control_checkpoint()') == str(before['timeline_id'])\n    domain_ms = 1000*(time.monotonic()-began)\n    fresh_log = log.read_bytes()[offset:].decode()\n    (root/'recovery.log').write_text(fresh_log)\n    for marker in ('immediate shutdown request','database system was interrupted','automatic recovery in progress',\n                   'redo starts at','redo done at','ready to accept connections'):\n        assert marker in fresh_log, 'Missing actual recovery marker: ' + marker\n    redo_start = re.search(r'redo starts at (\\S+)',fresh_log).group(1)\n    redo_done = re.search(r'redo done at (\\S+).*?elapsed: ([0-9.]+) s',fresh_log)\n    assert redo_start==saved_redo and lsn(redo_done.group(1))==lsn(last_record_start)\n    result = dict(root=str(root),checkpoint_bulk=checkpoint_bulk,settings=settings,rows=rows,heap_bytes=heap_bytes,\n        baseline=baseline,before=before,flushed_upper=upper,redo_distance_bytes=lsn(upper)-lsn(saved_redo),\n        decoded_records=len(lines),bulk_records_in_range=len(bulk_lines),tail_records_in_range=len(tail_lines),\n        last_record_start=last_record_start,last_record_end=upper,buffers_before_tail=dirty,outcome=actual,\n        observed_redo_start=redo_start,observed_redo_done=redo_done.group(1),\n        redo_log_elapsed_s=float(redo_done.group(2)),client_ready_ms=round(client_ms,2),domain_verified_ms=round(domain_ms,2))\n    (root/'result.json').write_text(json.dumps(result,indent=2))\n    print('trial_result: ' + json.dumps(result,sort_keys=True),flush=True)\n    print(fresh_log,flush=True)\nfinally:\n    stop()\n    print('Private server stopped; retained actual recovery evidence at',root,flush=True)\n"
rows = 20000

report = pathlib.Path(tempfile.mkdtemp(prefix='pg-recovery-cost-',dir='/tmp'))
results = []
# Reverse the pair order on pass two; each trial initializes and stops a fresh cluster.
for index, checkpoint_bulk in enumerate((False, True, True, False),1):
    result = subprocess.run([sys.executable,'-c',trial_source,str(rows),'yes' if checkpoint_bulk else 'no'],
        text=True,capture_output=True)
    output = result.stdout + result.stderr
    (report/('trial-' + str(index) + '.log')).write_text(output)
    print(output,flush=True)
    assert result.returncode==0, 'Trial failed; inspect ' + str(report)
    value = json.loads(next(line.removeprefix('trial_result: ') for line in result.stdout.splitlines()
        if line.startswith('trial_result: ')))
    value['trial_order'] = index
    results.append(value)
assert len({r['heap_bytes'] for r in results})==1
assert all(r['outcome']==results[0]['outcome'] and r['settings']==results[0]['settings'] for r in results)
for stale, recent in ((results[0],results[1]),(results[3],results[2])):
    assert stale['redo_distance_bytes'] > recent['redo_distance_bytes']
    assert stale['decoded_records'] > recent['decoded_records']
(report/'results.json').write_text(json.dumps(results,indent=2))
print('PASS: four matched crashes, actual redo, equal complete receipt states; compare sampled timings without a speed-ratio assertion.')
print('Retained comparison:',report,flush=True)
PY
```

## Expected result
Four independent clusters recover from actual immediate shutdowns. In both old-checkpoint trials,
the decoded recovery range contains the bulk transaction; in both recent-checkpoint trials it does
not. All four ranges contain the common tail INSERT and COMMIT. Old-checkpoint distance and decoded
record count exceed the recent case in each pair. The heap size, settings and final dataset match.

Every final query returns20,001 distinct receipts, IDs1–20,001, total amount200,010,007, correct
per-ID amounts and payloads. The stopped control state is in production. Each fresh log reports
actual recovery with redo start equal to the saved control position and redo done equal to the last
record's start in the offline dump. That address can precede the saved end because a record occupies
bytes after its starting address; this difference alone does not show lost or unflushed WAL.

Compare the log's rounded redo duration, client_ready_ms and domain_verified_ms across both pairs.
Small cached samples may overlap or reverse in elapsed-time order; no speed ratio is required.
Each child stops its cluster, and the outer driver prints PASS only after cross-trial invariants.
The variation preserves40,001 receipts and total amount800,020,007 with the same matching checks.

## Systems lens
A recovery-time objective is a service requirement, while replay distance is one measured input to
recovery cost. Checkpoint position shifts work between normal running and startup; storage/cache
state, WAL record types, checkpoint-at-recovery work, orchestration and application readiness also
matter. Log bytes are neither elapsed time nor proof that each referenced page was rewritten.

Commit durability comes from the configured WAL and storage contract in both cases. The recent
checkpoint reduces required replay without strengthening an acknowledgement beyond that contract.
These local trials preserve intact data files and WAL; backup recovery must separately prove that
an independently restored starting state and available history suffice.

## Optional variation
In a copy of the supplied Run block, change only `rows = 20000` to `rows = 40000`. Compare both
order-reversed pairs, their record counts and the verified final sum. Each trial now has40,001
receipts including the same7-unit tail, for amount800,020,007. This bounded, same-host restart
does not establish a production recovery-time objective under a different workload or storage path.
