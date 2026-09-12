# WAL pressure: observe checkpoints under a small soft target

slug: max-wal-size-forces-checkpoints
category: checkpointing
difficulty: intermediate
tags: checkpoints, wal, capacity, configuration
prerequisites: checkpoint-anatomy, wal-files-and-recycling
safety: privileged
run-in: shell
sessions: 1
min-version: 16
minutes: 25
revision: 4

## Overview
Generate the same bounded receipt workload on fresh owned clusters with8MB and128MB WAL targets.
Wait for the actual setting, then connect requested-checkpoint deltas to fresh WAL-reason log lines.
Compare sampled retained segments and correct row outcomes while separating checkpoint pressure from
archive/slot retention and from claims about foreground latency.

## Syntax breakdown
### In plain terms

A small WAL target can cause PostgreSQL to request a checkpoint while the producer continues writing.
The target influences scheduling and recycling; it does not reserve a fixed amount of disk or prove
that a workload is being throttled. We remove archive and slot dependencies to isolate this trigger.

### What you are learning

- **Checkpoint reason:** cumulative requested counters need fresh log context to identify WAL pressure.
- **Setting readiness:** reload acknowledgement is distinct from the active value and source.
- **Soft storage target:** WAL file allocation, recovery requirements and consumers affect retention.
- **Workload equivalence:** compare identical receipt values before interpreting different costs.

### Piece by piece

- **python3**, **subprocess.run** and **sys.argv** run a complete child experiment at8MB and128MB.
  Each child includes its own cluster helper. **tempfile.mkdtemp** allocates the comparison and
  private-cluster directories; stdout/stderr, JSON results and per-batch samples are retained.
- **PGBIN** or **pg_config --bindir** locates binaries. Root uses **runuser -u ... --** and
  **os.chown**; other users run directly. **initdb -D ... -U postgres --auth-local=trust
  --auth-host=reject --no-locale --data-checksums --wal-segsize=1** chooses the directory and role,
  restricts authentication, fixes locale, enables checksums and selects1MB WAL files. The private
  containing directory protects local trust and **listen_addresses=''** disables TCP.
- **shared_buffers=64MB**, **max_connections=10**, **checkpoint_timeout=1h** and **autovacuum=off**
  bound background interference. **checkpoint_completion_target=0** removes normal write pacing
  in this fixture. **fsync**, **full_page_writes** and **synchronous_commit** stay enabled.
- **pg_ctl -D ... -l ... -w -t20 start** bounds startup; **-m fast stop** cleans up in finally.
  **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, emits plain tuples and stops on SQL
  errors. The helper clears inherited PG variables; **PGCONNECT_TIMEOUT**, **statement_timeout**
  and **lock_timeout** bound calls. The data_directory query verifies the owned instance.
- **pg_settings** records actual configuration. **server_version_num** requires PostgreSQL16's
  **pg_stat_bgwriter** counter layout. **archive_mode=off**, **wal_keep_size=0** and no rows in
  **pg_replication_slots** exclude the earlier archive/consumer retention failure from this fixture.
- **ALTER SYSTEM SET max_wal_size** writes one override to **postgresql.auto.conf**;
  **pg_reload_conf** requests reloading. **wait_for** polls **setting/unit/sourcefile/pending_restart**
  until the selected MB value is active from the expected file with no pending restart.
- **CREATE TABLE** establishes primary-key, positive-amount and non-null constraints.
  **generate_series** plus **repeat** inserts1,000 sequential receipt IDs and300-character payloads
  per transaction. The fixed loop commits32 batches in each core trial,64 in the variation.
- **CHECKPOINT** establishes the baseline before the saved log offset. No manual checkpoint is
  issued during the workload. Fresh connections read **pg_stat_bgwriter**; the small-budget case
  polls until a requested checkpoint has published. **stats_reset** must not change.
- **checkpoints_req/timed**, **buffers_checkpoint/clean/backend** and checkpoint write/sync times
  are cumulative counters; subtraction gives the selected interval's cluster work. The fresh log
  must identify **checkpoint starting: wal** and completion, with no manual start in the interval.
  Timed checkpoints stay unchanged. Exact requested counts depend on concurrent background timing.
- **pg_ls_waldir** lists files. The24-uppercase-hex-digit name filter selects ordinary WAL segments;
  **count/sum/coalesce** measure segment count and bytes. The largest sample is a sampled peak,
  not a continuous high-water mark. Preallocation and recycling affect bytes alongside retention.
- **pg_current_wal_insert_lsn** brackets the workload; Python **lsn** subtracts hexadecimal byte
  positions. This interval includes checkpoint and catalog work and WAL framing; it is not exact
  receipt-only attribution. No assertion attributes a byte difference entirely to full-page images.
- **count**, **count(distinct id)**, **min/max**, **sum** and **bool_and** verify the same complete
  receipt state and payloads at both budgets. **pg_control_checkpoint** records redo movement too.
- **ALTER SYSTEM RESET max_wal_size** removes only this override. A reload and actual-value/source
  poll require128MB from **postgresql.conf**. A regular expression checks no active max_wal_size
  line remains in the auto file; other settings would not need to be erased. Nested finally stops
  the cluster even if this restoration check fails.
- **json_build_object**, **row_to_json**, **json_object_agg**, **json.loads/dumps** preserve settings,
  counters, samples and rows. A saved byte offset selects only fresh log output; Python assertions
  require both individual evidence and equal cross-trial settings/outcomes before PASS.

## Caution
Run in a shell with Python3 and PostgreSQL16 server binaries; PGBIN may select their directory.
The script creates two owned /tmp/pg-owned-* clusters serially and ignores your existing PG/PGLAB
connection settings. Private sockets have no TCP listener. Root uses runuser as the postgres OS user.
ALTER SYSTEM operates only on the new clusters; finally removes its one max_wal_size override,
verifies the original128MB setting/source, then stops each server even if restoration fails.
The retained paths contain stopped data, logs and samples. checkpoint_completion_target=0 accelerates
completion for this bounded experiment; it is a fixture choice, not a deployment recommendation.

## Run
```sh
python3 - <<'PY'
import json, pathlib, subprocess, sys, tempfile
trial_source = "\nimport json, os, pathlib, pwd, shutil, subprocess, tempfile, time\n\nbindir = pathlib.Path(os.environ.get(\"PGBIN\") or subprocess.check_output(\n    [\"pg_config\", \"--bindir\"], text=True).strip())\nfor name in (\"initdb\", \"pg_ctl\", \"psql\"):\n    if not (bindir / name).is_file():\n        raise RuntimeError(\"Missing PostgreSQL server executable: \" + str(bindir / name))\nroot = pathlib.Path(tempfile.mkdtemp(prefix=\"pg-owned-\", dir=\"/tmp\"))\nowner = pwd.getpwnam(\"postgres\") if os.geteuid() == 0 else pwd.getpwuid(os.geteuid())\nif os.geteuid() == 0:\n    os.chown(root, owner.pw_uid, owner.pw_gid)\nprefix = [\"runuser\", \"-u\", owner.pw_name, \"--\"] if os.geteuid() == 0 else []\ndata, sock, log = root / \"data\", root / \"socket\", root / \"server.log\"\nsock.mkdir()\nif os.geteuid() == 0:\n    os.chown(sock, owner.pw_uid, owner.pw_gid)\nenv = {k: v for k, v in os.environ.items() if not k.startswith(\"PG\")}\nenv.update(PGHOST=str(sock), PGPORT=\"6543\", PGUSER=\"postgres\", PGDATABASE=\"postgres\",\n           PGCONNECT_TIMEOUT=\"3\", PGOPTIONS=\"-c statement_timeout=5000 -c lock_timeout=1000\",\n           LC_ALL=\"C\")\nprint(\"owned evidence directory:\", root, flush=True)\n\ndef run(args, timeout=30):\n    result = subprocess.run(args, env=env, text=True, capture_output=True, timeout=timeout)\n    if result.returncode:\n        raise RuntimeError(str(args) + \"\\n\" + result.stdout + result.stderr)\n    return result.stdout.strip()\n\ndef server(name, *args, timeout=30):\n    return run(prefix + [str(bindir / name), *map(str, args)], timeout)\n\ndef sql(query):\n    return run([str(bindir / \"psql\"), \"-X\", \"-At\", \"-v\", \"ON_ERROR_STOP=1\", \"-c\", query], 10)\n\ndef wait_for(label, check, seconds=20):\n    deadline = time.monotonic() + seconds\n    while time.monotonic() < deadline:\n        result = check()\n        if result:\n            return result\n        time.sleep(0.2)\n    raise RuntimeError(\"Timed out waiting for \" + label + \"; inspect \" + str(log))\n\ndef start():\n    server(\"pg_ctl\", \"-D\", data, \"-l\", log, \"-w\", \"-t\", \"20\", \"start\", timeout=25)\n    assert sql(\"select current_setting('data_directory')\") == str(data)\n\ndef stop():\n    # Only the directory allocated above is ever passed to pg_ctl.\n    if (data / \"postmaster.pid\").exists():\n        server(\"pg_ctl\", \"-D\", data, \"-m\", \"fast\", \"-w\", \"-t\", \"20\", \"stop\", timeout=25)\n\nserver(\"initdb\", \"-D\", data, \"-U\", \"postgres\", \"--auth-local=trust\",\n       \"--auth-host=reject\", \"--no-locale\", \"--data-checksums\", \"--wal-segsize=1\")\nwith (data / \"postgresql.conf\").open(\"a\") as config:\n    config.write(\"\\nlisten_addresses=''\\nport=6543\\nunix_socket_directories='\" + str(sock) + \"'\\n\"\n                 \"shared_buffers='16MB'\\nmax_connections=10\\nwal_level=replica\\n\"\n                 \"fsync=on\\nsynchronous_commit=on\\nfull_page_writes=on\\n\"\n                 \"min_wal_size='2MB'\\nmax_wal_size='8MB'\\ncheckpoint_timeout='1h'\\n\"\n                 \"logging_collector=off\\nlog_checkpoints=on\\n\")\n\nimport re, sys\nbudget_mb, batches = int(sys.argv[1]), int(sys.argv[2])\nwith (data/'postgresql.conf').open('a') as config:\n    config.write(\"\\nshared_buffers='64MB'\\nmax_wal_size='128MB'\\ncheckpoint_completion_target=0\\nautovacuum=off\\n\")\n\ndef setting():\n    return json.loads(sql(\"select row_to_json(s) from (select setting,unit,sourcefile,pending_restart \"\n        \"from pg_settings where name='max_wal_size') s\"))\n\ndef stats():\n    return json.loads(sql('select row_to_json(s) from pg_stat_bgwriter s'))\n\ndef wal_files():\n    return json.loads(sql(\"select json_build_object('segments',count(*),'bytes',coalesce(sum(size),0)) \"\n        \"from pg_ls_waldir() where name ~ '^[0-9A-F]{24}$'\"))\n\ndef lsn(value):\n    high, low = value.split('/')\n    return (int(high,16)<<32) + int(low,16)\n\nrestored = None\ntry:\n    start()\n    assert 160000 <= int(sql('show server_version_num')) < 170000, 'Select PostgreSQL16 binaries with PGBIN'\n    actual_settings = json.loads(sql(\"select json_object_agg(name,setting) from pg_settings where name in \"\n        \"('server_version','shared_buffers','wal_segment_size','checkpoint_timeout','checkpoint_completion_target',\"\n        \"'fsync','full_page_writes','synchronous_commit','archive_mode','wal_keep_size','autovacuum')\"))\n    assert all(actual_settings[k]=='on' for k in ('fsync','full_page_writes','synchronous_commit'))\n    assert actual_settings['archive_mode']=='off' and actual_settings['wal_keep_size']=='0'\n    assert sql('select count(*) from pg_replication_slots')=='0'\n    initial = setting()\n    assert initial['setting']=='128' and initial['unit']=='MB'\n    sql(\"create table pressure_receipts(id int primary key,amount int not null check(amount>0),pad text not null) \"\n        \"with(autovacuum_enabled=false)\")\n    sql(\"alter system set max_wal_size='\" + str(budget_mb) + \"MB'\")\n    assert sql('select pg_reload_conf()')=='t'\n    wait_for('actual WAL budget', lambda: setting()['setting']==str(budget_mb))\n    active = setting()\n    assert active['sourcefile']==str(data/'postgresql.auto.conf') and not active['pending_restart']\n    sql('checkpoint')\n    wait_for('baseline requested checkpoint publication',lambda: stats()['checkpoints_req']>=1)\n    baseline, initial_wal = stats(), wal_files()\n    control_before = json.loads(sql('select row_to_json(c) from pg_control_checkpoint() c'))\n    offset = log.stat().st_size\n    lower = sql('select pg_current_wal_insert_lsn()')\n    samples = []\n    for batch in range(batches):\n        first,last = batch*1000+1,(batch+1)*1000\n        sql(\"insert into pressure_receipts select g,g,repeat('w',300) from generate_series(\" + str(first) + ',' + str(last) + ') g')\n        samples.append(dict(batch=batch+1,wal=wal_files(),counters=stats()))\n    upper = sql('select pg_current_wal_insert_lsn()')\n    if budget_mb==8:\n        wait_for('published WAL-driven checkpoint completion',lambda: stats()['checkpoints_req']>baseline['checkpoints_req'])\n    after = stats()\n    fresh_log = log.read_bytes()[offset:].decode()\n    (root/'pressure.log').write_text(fresh_log)\n    assert after['stats_reset']==baseline['stats_reset']\n    delta = {key:after[key]-baseline[key] for key in ('checkpoints_req','checkpoints_timed','buffers_checkpoint',\n        'buffers_clean','buffers_backend','checkpoint_write_time','checkpoint_sync_time')}\n    assert delta['checkpoints_timed']==0\n    starts = fresh_log.count('checkpoint starting: wal')\n    if budget_mb==8:\n        assert delta['checkpoints_req']>0 and starts>0 and 'checkpoint complete:' in fresh_log\n    else:\n        assert delta['checkpoints_req']==0 and starts==0\n    assert 'checkpoint starting: immediate' not in fresh_log\n    count = batches*1000\n    outcome = json.loads(sql(\"select json_build_object('rows',count(*),'distinct_ids',count(distinct id),\"\n        \"'first',min(id),'last',max(id),'amount',sum(amount),'all_correct',\"\n        \"bool_and(amount=id and pad=repeat('w',300))) from pressure_receipts\"))\n    assert outcome==dict(rows=count,distinct_ids=count,first=1,last=count,amount=count*(count+1)//2,all_correct=True)\n    result = dict(root=str(root),budget_mb=budget_mb,batches=batches,settings=actual_settings,initial=initial,active=active,\n        lower=lower,upper=upper,wal_distance_bytes=lsn(upper)-lsn(lower),control_before=control_before,\n        control_after=json.loads(sql('select row_to_json(c) from pg_control_checkpoint() c')),\n        baseline=baseline,after=after,delta=delta,wal_starts=starts,initial_wal=initial_wal,final_wal=wal_files(),\n        peak_sampled_wal_bytes=max(s['wal']['bytes'] for s in samples),outcome=outcome)\n    (root/'samples.json').write_text(json.dumps(samples,indent=2))\n    print(fresh_log,flush=True)\nfinally:\n    try:\n        if (data/'postmaster.pid').exists():\n            sql('alter system reset max_wal_size')\n            assert sql('select pg_reload_conf()')=='t'\n            wait_for('restored actual budget',lambda: setting()['setting']=='128')\n            restored = setting()\n            assert restored['sourcefile']==str(data/'postgresql.conf') and not restored['pending_restart']\n            assert not re.search(r'^\\s*max_wal_size\\s*=',(data/'postgresql.auto.conf').read_text(),re.M)\n            print('Restored owned max_wal_size to128MB with no remaining override.',flush=True)\n    finally:\n        stop()\n        print('Private server stopped; retained WAL-pressure evidence at',root,flush=True)\nresult['restored'] = restored\n(root/'result.json').write_text(json.dumps(result,indent=2))\nprint('trial_result: ' + json.dumps(result,sort_keys=True),flush=True)\n"
batches = 32

report = pathlib.Path(tempfile.mkdtemp(prefix='pg-wal-pressure-',dir='/tmp'))
results = []
for budget in (8,128):
    completed = subprocess.run([sys.executable,'-c',trial_source,str(budget),str(batches)],text=True,capture_output=True)
    output = completed.stdout+completed.stderr
    (report/('budget-'+str(budget)+'.log')).write_text(output)
    print(output,flush=True)
    assert completed.returncode==0, 'Trial failed; inspect ' + str(report)
    results.append(json.loads(next(line.removeprefix('trial_result: ') for line in completed.stdout.splitlines()
        if line.startswith('trial_result: '))))
assert results[0]['outcome']==results[1]['outcome'] and results[0]['settings']==results[1]['settings']
(report/'results.json').write_text(json.dumps(results,indent=2))
print('PASS: equal receipt workload, WAL-driven checkpoint evidence at8MB, no checkpoint at128MB, both settings restored.')
print('Retained comparison:',report,flush=True)
PY
```

## Expected result
Both active budgets are confirmed in MB from postgresql.auto.conf with no pending restart. The8MB
case reports a positive requested-checkpoint delta and fresh checkpoint starting: wal plus completion.
The128MB case has no requested-checkpoint delta or WAL checkpoint start for this bounded workload.
Neither records a timed checkpoint or a manual request inside the measured interval.

Both preserve32,000 distinct receipts, IDs1–32,000, total amount512,016,000 and every expected amount
and payload. Per-batch samples and final JSON report actual WAL distance, retained segment bytes,
checkpoint deltas and redo positions; exact counts and sampled peaks vary. The variation preserves
64,000 receipts and total amount2,048,032,000. No throughput/latency or exact image-amplification
claim is inferred from checkpoint logs alone.

Finally both clusters show128MB from their original postgresql.conf, with no remaining max_wal_size
override, and stop. max_wal_size remains a soft target even if this run's observed segment bytes stay
below it; the earlier archive failure experiment separately demonstrates consumer-required retention.

## Systems lens
A storage target can trigger background work without imposing a hard bound on producer output or
consumer-required history. Checkpoint frequency trades ordinary write work, page-image opportunities
and recovery work; archives and slots add independent retention constraints. A warning about frequent
checkpoints identifies scheduling pressure, not direct proof of client stalls or inadequate bandwidth.
Measure those outcomes before changing a service policy.

## Optional variation
Double only the number of1,000-row batches using the complete pgcoach hint2 variation. Predict the
receipt sum and which budget should show checkpoint activity. Compare actual record-distance and
segment samples without assuming an exact checkpoint count, a hard disk ceiling or measured latency.
