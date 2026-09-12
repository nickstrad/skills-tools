# Synchronous commit: flush, apply and a canceled acknowledgement

slug: synchronous-replication-blocks-commit
category: replication
difficulty: advanced
tags: synchronous-replication, durability, availability, consistency, wal
prerequisites: read-your-writes-on-a-replica, commit-means-fsync
safety: privileged
run-in: shell
sessions: 1
min-version: 16
minutes: 35
revision: 4

## Overview
Pause replay on an owned synchronous standby and compare local, remote-flush and remote-apply
commit policies. Inspect the actual waiting transaction's WAL record and primary visibility, then
stop the standby and cancel a required acknowledgement. Reconcile every receipt before deciding
whether the write needs a retry; the variation reconnects the standby instead of canceling.

## Syntax breakdown
### In plain terms

Synchronous commit waits for a chosen stage on a required standby. Durable receipt of WAL does
not imply applied rows, and a canceled acknowledgement does not undo an already durable commit.
This experiment observes all three boundaries separately and uses exact receipt values to resolve
the outcome after the wait ends.

### What you are learning

- **Per-transaction policy:** local flush, remote flush and remote apply make different promises.
- **Failure location:** paused replay permits remote flush; a disconnected required receiver cannot acknowledge it.
- **Commit versus visibility:** a durable commit record can coexist with an active wait and an invisible row.
- **Cancellation outcome:** a warning and local receipt must be reconciled instead of treating cancel as rollback.

### Piece by piece

- **python3** runs the complete owned-replication helper. **PGBIN / pg_config --bindir** locates
  binaries. **tempfile.mkdtemp**, private sockets and cleared PG variables isolate files/connections;
  root-only **runuser/os.chown** assigns server ownership to postgres.
- **initdb -D** chooses a new data directory; **-U postgres** names its administrator;
  **--auth-local=trust** permits local access through the protected socket directory;
  **--auth-host=reject** rejects host authentication; **--no-locale**, **--data-checksums** and
  **--wal-segsize=1** select fixed locale, checksums and1MB WAL segments. **listen_addresses=''**
  disables TCP. **pg_ctl -D ... -l ... -w -t20** names data/log files and waits at most20 seconds
  for readiness; **-m fast stop** stops the selected owned server, rolling back active work.
- **fsync/full_page_writes=on**, **wal_level=replica**, small shared buffers,
  **max_wal_size=128MB**, **checkpoint_timeout=1h**, **autovacuum=off** and
  **wal_sender_timeout=5s** configure the private fixture without altering an existing cluster.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, prints unaligned tuples only,
  stops on SQL errors and executes a supplied command. **-v VERBOSITY=verbose** retains warning
  SQLSTATE/detail/location. **PGCONNECT_TIMEOUT**, **statement_timeout**, **lock_timeout** and
  Python subprocess waits bound operations; warnings still require inspection after exit status0.
- **CREATE EXTENSION pg_walinspect** enables actual WAL decoding. **sync_receipts** constrains
  unique request IDs and non-null policy/payload. IDs1–5 are independent work receipts whose
  complete values are compared on primary and standby, rather than accepting a count alone.
- **clone_standby** creates a **LOGIN REPLICATION** role. **pg_basebackup -U** selects it,
  **-D** names the copy, **-c fast** requests its checkpoint, **-X stream** includes WAL,
  **-R** writes recovery settings, **-C -S owned_standby** creates/names the physical slot and
  **--manifest-checksums=SHA256 -v** adds checksums/diagnostics. **pg_verifybackup** verifies before
  intentional config edits. **standby.signal/primary_conninfo/primary_slot_name** link recovery
  to the source; **hot_standby=on**, **archive_mode=off**, private socket,
  **wal_receiver_status_interval=1s** and retry100ms configure the copy.
- **ALTER SYSTEM SET synchronous_standby_names='FIRST 1 (owned_standby)'** writes the owned
  primary's reloadable acknowledgement requirement. **pg_reload_conf** requests reload; its true
  return is not proof of completion. Poll **pg_stat_replication.sync_state='sync'**, then
  **SHOW synchronous_standby_names** to confirm the effective policy and matching application name.
- Observer/cleanup connections set **synchronous_commit=local** through **PGOPTIONS** so their
  administration cannot accidentally need the offline standby. Each writer uses **BEGIN; SET LOCAL
  synchronous_commit=...; INSERT; COMMIT**; **SET LOCAL** lasts only for that transaction.
  **local** requires primary WAL flush, **on** also requires the selected standby's durable WAL
  flush, and **remote_apply** additionally requires replay. **off** and **remote_write** are not
  measured here. The configured standby name is required even when its connection disappears.
- **pg_wal_replay_pause** requests a pause; **pg_get_wal_replay_pause_state='paused'** verifies
  the actual state. **pg_last_wal_replay_lsn** must stay fixed. **pg_stat_wal_receiver.flushed_lsn**
  advances through committed work while the standby receipt query remains empty. Thus IDs1/local
  and2/on finish during pause, while ID3/remote_apply remains waiting despite durable reception.
- **subprocess.Popen** starts concurrent owned clients. **PGAPPNAME=commit_N** identifies each
  backend; stdout/stderr go to separate retained files. **poll** proves the client has not exited.
  **time.monotonic** samples total client duration including process startup, observation and
  deliberate waiting; these single samples are not a service latency benchmark or a p99 estimate.
- **pg_stat_activity** supplies the matching **pid**, active **backend_xid**, **state=active**,
  **wait_event_type=IPC** and **wait_event=SyncRep**. A fixed sleep is not accepted as proof of
  the wait. **wait_for** polls it with an eight-second observation deadline.
- **pg_current_wal_insert_lsn** brackets the write. **pg_get_wal_records_info(start,end)** decodes
  that interval; filter **resource_manager='Transaction'**, **record_type='COMMIT'** and the
  waiting **xid** to find its actual commit record. **pg_current_wal_flush_lsn >= end_lsn** proves
  local durability through that record. Python **lsn** compares the hexadecimal high/low halves.
  The enclosing interval may contain extra WAL; the XID match identifies this transaction.
- A separate primary query during **SyncRep** still excludes the waiting receipt: IDs1–2 are
  visible during ID3's wait, and IDs1–4 during ID5's wait. Local WAL durability is already proven,
  but the transaction has not completed visibility/lock cleanup. Its absent row at this moment is
  not rollback evidence. **json_agg(... ORDER BY id)** and **coalesce(...,'[]')** preserve exact
  ordered values; Python **json.loads/dumps** saves each observation as a JSON evidence file.
- **pg_wal_replay_resume** releases apply. After ID3's normal COMMIT acknowledgement, a new
  standby statement sees IDs1–3 without an additional read-side LSN wait. This relies on a fresh
  snapshot and this fixed history; an older repeatable-read snapshot need not see the write.
- A bounded **pg_ctl ... stop** stops the standby and the driver waits for no sender row. ID4/local
  still finishes; ID5/on waits for remote flush. Its exact commit record is locally flushed, but
  no sender is present and the client has not received normal acknowledgement.
- **pg_cancel_backend(pid)** targets only the identified waiting writer. PostgreSQL emits a
  warning that the wait was canceled and the transaction already committed locally; psql also
  prints **COMMIT** and returns0. The driver requires that warning and reconciles all five exact
  primary receipts while the standby is still stopped. Cancellation has relaxed the requested
  remote-acknowledgement promise; the local result does not prove the standby has the write.
- The variation changes only ID5's resolution: restart the same standby instead of canceling.
  Its normal COMMIT acknowledgement has no warning. **pg_create_restore_point** supplies an
  actual record-end marker for idle bootstrap, flush observation and final catch-up; a bare idle
  insertion position can be ahead of the last replayable record. These local observer markers do
  not change the writers' acknowledgement policies or replace the exact COMMIT-record evidence.
  **wait_replay** polls the final **pg_last_wal_replay_lsn** bound before comparing receipts; flush
  acknowledgement alone would not justify that final standby read.
- Finally cancels any remaining owned writer before stopping the topology. Bounded **wait/kill**
  cleans up the owned client if needed, then standby stops, **pg_replication_slots.active** becomes
  false, **pg_drop_replication_slot** removes only its owned slot and the primary stops.

## Caution
Run the complete shell script with Python3, matching PostgreSQL16 binaries and pg_walinspect,
including pg_basebackup/pg_verifybackup; PGBIN may select the binary folder. It creates a private
source/standby, ignores inherited PG/PGLAB settings and disables TCP. Root uses runuser as the
postgres OS owner. Only these owned processes are paused, stopped or canceled. Each writer has a
20-second statement limit; observation and client waits are bounded. Finally cancels any remaining
owned writer, stops standby, removes its inactive slot and stops source. Retain the printed stopped
paths/logs; allow a few hundred MB. Both nodes share one host, so this tests acknowledgement
semantics rather than independent-host survival or production latency.

## Run
```sh
python3 - <<'PY'

import json, os, pathlib, pwd, shutil, subprocess, tempfile, time

bindir = pathlib.Path(os.environ.get("PGBIN") or subprocess.check_output(
    ["pg_config", "--bindir"], text=True).strip())
for name in ("initdb", "pg_ctl", "psql"):
    if not (bindir / name).is_file():
        raise RuntimeError("Missing PostgreSQL server executable: " + str(bindir / name))
root = pathlib.Path(tempfile.mkdtemp(prefix="pg-owned-", dir="/tmp"))
owner = pwd.getpwnam("postgres") if os.geteuid() == 0 else pwd.getpwuid(os.geteuid())
if os.geteuid() == 0:
    os.chown(root, owner.pw_uid, owner.pw_gid)
prefix = ["runuser", "-u", owner.pw_name, "--"] if os.geteuid() == 0 else []
data, sock, log = root / "data", root / "socket", root / "server.log"
sock.mkdir()
if os.geteuid() == 0:
    os.chown(sock, owner.pw_uid, owner.pw_gid)
env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
env.update(PGHOST=str(sock), PGPORT="6543", PGUSER="postgres", PGDATABASE="postgres",
           PGCONNECT_TIMEOUT="3", PGOPTIONS="-c statement_timeout=5000 -c lock_timeout=1000",
           LC_ALL="C")
print("owned evidence directory:", root, flush=True)

def run(args, timeout=30):
    result = subprocess.run(args, env=env, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(str(args) + "\n" + result.stdout + result.stderr)
    return result.stdout.strip()

def server(name, *args, timeout=30):
    return run(prefix + [str(bindir / name), *map(str, args)], timeout)

def sql(query):
    return run([str(bindir / "psql"), "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", query], 10)

def wait_for(label, check, seconds=20):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        result = check()
        if result:
            return result
        time.sleep(0.2)
    raise RuntimeError("Timed out waiting for " + label + "; inspect " + str(log))

def start():
    server("pg_ctl", "-D", data, "-l", log, "-w", "-t", "20", "start", timeout=25)
    assert sql("select current_setting('data_directory')") == str(data)

def stop():
    # Only the directory allocated above is ever passed to pg_ctl.
    if (data / "postmaster.pid").exists():
        server("pg_ctl", "-D", data, "-m", "fast", "-w", "-t", "20", "stop", timeout=25)

server("initdb", "-D", data, "-U", "postgres", "--auth-local=trust",
       "--auth-host=reject", "--no-locale", "--data-checksums", "--wal-segsize=1")
with (data / "postgresql.conf").open("a") as config:
    config.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='" + str(sock) + "'\n"
                 "shared_buffers='16MB'\nmax_connections=10\nwal_level=replica\n"
                 "fsync=on\nsynchronous_commit=on\nfull_page_writes=on\n"
                 "min_wal_size='2MB'\nmax_wal_size='8MB'\ncheckpoint_timeout='1h'\n"
                 "logging_collector=off\nlog_checkpoints=on\n")

standby, standby_sock, standby_log = root/'standby',root/'standby-socket',root/'standby.log'
standby_sock.mkdir()
if os.geteuid()==0:
    os.chown(standby_sock,owner.pw_uid,owner.pw_gid)
replica_env = dict(env,PGHOST=str(standby_sock))
with (data/'postgresql.conf').open('a') as config:
    config.write("\nmax_wal_size='128MB'\nwal_sender_timeout='5s'\nautovacuum=off\n")

def replica_sql(query):
    result = subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',query],
        env=replica_env,text=True,capture_output=True,timeout=10)
    if result.returncode:
        raise RuntimeError(result.stdout+result.stderr)
    return result.stdout.strip()

def sender():
    return json.loads(sql("select coalesce(json_agg(s),'[]') from (select pid,usename,application_name,state,sync_state,"
        "sent_lsn,write_lsn,flush_lsn,replay_lsn,backend_xmin from pg_stat_replication "
        "where application_name='owned_standby') s"))

def receiver():
    return json.loads(replica_sql("select coalesce(json_agg(r),'[]') from (select pid,status,sender_host,sender_port,"
        "slot_name,received_tli,written_lsn,flushed_lsn from pg_stat_wal_receiver) r"))

def clone_standby():
    for name in ('pg_basebackup','pg_verifybackup'):
        assert (bindir/name).is_file(),'Missing utility: '+name
    sql('create role owned_repl login replication')
    result = subprocess.run(prefix+[str(bindir/'pg_basebackup'),'-D',str(standby),'-U','owned_repl','-c','fast',
        '-X','stream','-R','-C','-S','owned_standby','--manifest-checksums=SHA256','-v'],
        env=env,text=True,capture_output=True,timeout=60)
    (root/'standby-basebackup.log').write_text(result.stdout+result.stderr)
    assert result.returncode==0,result.stdout+result.stderr
    assert 'backup successfully verified' in server('pg_verifybackup',standby,timeout=60)
    assert (standby/'standby.signal').is_file()
    # Append to auto.conf after -R's primary_conninfo, leaving that generated connection intact.
    with (standby/'postgresql.auto.conf').open('a') as config:
        config.write("\nunix_socket_directories='"+str(standby_sock)+"'\ncluster_name='owned_standby'\n"
            "archive_mode=off\nhot_standby=on\nwal_receiver_status_interval='1s'\n"
            "wal_retrieve_retry_interval='100ms'\n")
    server('pg_ctl','-D',standby,'-l',standby_log,'-w','-t','20','start',timeout=25)
    assert replica_sql('show data_directory')==str(standby)
    assert replica_sql('select pg_is_in_recovery()')=='t'
    wait_for('streaming sender and receiver',lambda:
        len(sender())==1 and sender()[0]['state']=='streaming' and len(receiver())==1 and receiver()[0]['status']=='streaming')

def wait_replay(position,seconds=20):
    wait_for('standby replay through '+position,lambda:
        replica_sql("select coalesce(pg_last_wal_replay_lsn()>='"+position+"'::pg_lsn,false)")=='t',seconds)

def stop_replication():
    try:
        if (standby/'postmaster.pid').exists():
            server('pg_ctl','-D',standby,'-m','fast','-w','-t','20','stop',timeout=25)
        if (data/'postmaster.pid').exists():
            wait_for('owned physical slot inactive',lambda:
                sql("select not exists(select 1 from pg_replication_slots where slot_name='owned_standby' and active)")=='t')
            sql("select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name='owned_standby'")
            assert sql("select count(*) from pg_replication_slots where slot_name='owned_standby'")=='0'
    finally:
        stop()
    print('Owned standby/source stopped and owned slot removed; evidence retained at',root,flush=True)

reconnect_instead_of_cancel = False

clients=[]

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def lsn(value):
    high,low=value.split('/')
    return (int(high,16)<<32)+int(low,16)

def rows(query):
    return json.loads(query("select coalesce(json_agg(r order by id),'[]') from sync_receipts r"))

def launch(id,policy,note):
    label='commit_'+str(id)
    stdout=(root/(label+'.stdout')).open('w')
    stderr=(root/(label+'.stderr')).open('w')
    writer_env=dict(env,PGAPPNAME=label,PGOPTIONS='-c statement_timeout=20000 -c lock_timeout=1000')
    before=sql('select pg_current_wal_insert_lsn()')
    query="begin; set local synchronous_commit='"+policy+"'; insert into sync_receipts values("+str(id)+",'"+policy+"','"+note+"'); commit"
    process=subprocess.Popen([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',query],
        env=writer_env,text=True,stdout=stdout,stderr=stderr)
    item=dict(id=id,policy=policy,note=note,label=label,process=process,stdout=stdout,stderr=stderr,
        began=time.monotonic(),before=before)
    clients.append(item)
    return item

def finished(item,canceled=False):
    result=item['process'].wait(timeout=10)
    item['stdout'].close(); item['stderr'].close()
    stdout=(root/(item['label']+'.stdout')).read_text()
    stderr=(root/(item['label']+'.stderr')).read_text()
    assert result==0 and 'COMMIT' in stdout,(result,stdout,stderr)
    if canceled:
        assert 'canceling wait for synchronous replication' in stderr
        assert 'already committed locally' in stderr
    else:
        assert stderr=='',stderr
    return dict(id=item['id'],policy=item['policy'],returncode=result,stdout=stdout,stderr=stderr,
        elapsed_ms=round(1000*(time.monotonic()-item['began']),2))

def waiting(item):
    def check():
        result=json.loads(sql("select coalesce(json_agg(s),'[]') from (select pid,state,wait_event_type,wait_event,"
            "backend_xid::text as xid,query from pg_stat_activity where application_name='"+item['label']+"') s"))
        return result[0] if len(result)==1 and result[0]['wait_event']=='SyncRep' else False
    state=wait_for('actual SyncRep for '+item['label'],check,8)
    assert state['wait_event_type']=='IPC' and item['process'].poll() is None
    end=sql('select pg_current_wal_insert_lsn()')
    records=json.loads(sql("select coalesce(json_agg(r),'[]') from (select start_lsn,end_lsn,xid::text,"
        "resource_manager,record_type from pg_get_wal_records_info('"+item['before']+"','"+end+"') "
        "where resource_manager='Transaction' and record_type='COMMIT' and xid::text='"+state['xid']+"') r"))
    assert len(records)==1,records
    flushed=sql('select pg_current_wal_flush_lsn()')
    assert lsn(flushed)>=lsn(records[0]['end_lsn'])
    # The sampled upper bound may include later WAL; the matching COMMIT record is exact.
    evidence=dict(activity=state,commit_record=records[0],source_flush=flushed,
        visible_source=rows(sql),sender=sender())
    assert item['process'].poll() is None
    assert [row['id'] for row in evidence['visible_source']]==list(range(1,item['id']))
    return evidence

try:
    start()
    sql('create extension pg_walinspect')
    sql('create table sync_receipts(id int primary key,policy text not null,note text not null)')
    clone_standby()
    # Observer/cleanup connections explicitly keep local acknowledgement. Writers use SET LOCAL.
    env['PGOPTIONS']='-c statement_timeout=5000 -c lock_timeout=1000 -c synchronous_commit=local'
    sql("alter system set synchronous_standby_names='FIRST 1 (owned_standby)'")
    sql('select pg_reload_conf()')
    wait_for('standby selected synchronously',lambda: len(sender())==1 and sender()[0]['sync_state']=='sync')
    assert sql('show synchronous_standby_names')=='FIRST 1 (owned_standby)'
    wait_replay(sql("select pg_create_restore_point('sync_baseline')"))
    replica_sql('select pg_wal_replay_pause()')
    wait_for('actual paused replay',lambda: replica_sql('select pg_get_wal_replay_pause_state()')=='paused')
    paused=replica_sql('select pg_last_wal_replay_lsn()')
    local_result=finished(launch(1,'local','paused local'))
    flush_result=finished(launch(2,'on','paused remote flush'))
    bound=sql("select pg_create_restore_point('sync_flush_observation')")
    wait_for('durable standby receive',lambda: len(receiver())==1 and lsn(receiver()[0]['flushed_lsn'])>=lsn(bound))
    assert rows(replica_sql)==[] and replica_sql('select pg_last_wal_replay_lsn()')==paused
    assert len(rows(sql))==2
    emit('flush_without_apply',dict(local=local_result,remote_flush=flush_result,bound=bound,
        paused_replay=paused,receiver=receiver(),source=rows(sql),standby=rows(replica_sql)))
    apply=launch(3,'remote_apply','paused remote apply')
    apply_wait=waiting(apply)
    wait_for('remote flush through waiting commit',lambda: len(receiver())==1 and
        lsn(receiver()[0]['flushed_lsn'])>=lsn(apply_wait['commit_record']['end_lsn']))
    assert replica_sql('select pg_get_wal_replay_pause_state()')=='paused'
    assert replica_sql('select pg_last_wal_replay_lsn()')==paused
    assert rows(replica_sql)==[] and apply['process'].poll() is None
    apply_wait['receiver']=receiver()
    emit('remote_apply_wait',apply_wait)
    replica_sql('select pg_wal_replay_resume()')
    apply_result=finished(apply)
    # COMMIT's requested apply acknowledgement, without an extra read-side LSN wait.
    assert len(rows(replica_sql))==3 and rows(replica_sql)==rows(sql)
    emit('remote_apply_acknowledged',dict(client=apply_result,source=rows(sql),standby=rows(replica_sql)))
    server('pg_ctl','-D',standby,'-m','fast','-w','-t','20','stop',timeout=25)
    wait_for('no connected standby',lambda: sender()==[])
    offline_local=finished(launch(4,'local','offline local'))
    blocked=launch(5,'on','offline required flush')
    blocked_wait=waiting(blocked)
    assert blocked_wait['sender']==[]
    emit('disconnected_wait',dict(local_client=offline_local,required_flush=blocked_wait))
    if not reconnect_instead_of_cancel:
        assert sql('select pg_cancel_backend('+str(blocked_wait['activity']['pid'])+')')=='t'
        canceled=finished(blocked,canceled=True)
        assert len(rows(sql))==5
        assert not (standby/'postmaster.pid').exists()
        emit('canceled_acknowledgement',dict(client=canceled,authoritative_receipts=rows(sql),
            standby_stopped=True,requested_remote_flush_proven=False))
    server('pg_ctl','-D',standby,'-l',standby_log,'-w','-t','20','start',timeout=25)
    wait_for('synchronous standby reconnected',lambda: len(sender())==1 and sender()[0]['sync_state']=='sync')
    if reconnect_instead_of_cancel:
        emit('reconnected_acknowledgement',finished(blocked))
    final_bound=sql("select pg_create_restore_point('sync_final_receipts')")
    wait_replay(final_bound)
    expected=[dict(id=x['id'],policy=x['policy'],note=x['note']) for x in clients]
    assert rows(sql)==rows(replica_sql)==expected
    emit('complete_receipts',dict(source=rows(sql),standby=rows(replica_sql),sender=sender()))
    print('PASS: paused replay permits remote flush but blocks apply; disconnected acknowledgement reconciles to five exact receipts.',flush=True)
finally:
    # Cancel any owned waiting writer before topology teardown, even if an assertion failed.
    for item in clients:
        if item['process'].poll() is None:
            try:
                sql("select pg_cancel_backend(pid) from pg_stat_activity where application_name='"+item['label']+"'")
                item['process'].wait(timeout=5)
            except (RuntimeError,subprocess.TimeoutExpired):
                item['process'].kill(); item['process'].wait(timeout=5)
        item['stdout'].close(); item['stderr'].close()
    stop_replication()
PY
```

## Expected result
The standby is selected with sync_state=sync. While replay is actually paused, ID1/local and
ID2/on receive normal COMMIT acknowledgements; primary has both receipts and standby has none.
ID3/remote_apply waits in IPC/SyncRep even though its actual COMMIT record is locally flushed and
standby flushed receive reaches it. A fresh primary query still sees only IDs1–2 during the wait.
Resume produces normal COMMIT and fresh matching IDs1–3 on both nodes.

With the standby stopped and sender absent, ID4/local completes while ID5/on enters SyncRep.
Primary WAL contains ID5's flushed COMMIT record, but an independent query sees only IDs1–4.
Canceling ID5's wait yields WARNING/01000 plus COMMIT and exit0. The warning states local commit
has occurred without ensuring replication. Before standby restart, all five correct primary
receipts are visible. The variation instead reconnects the standby and gets normal COMMIT without
that warning. Final replay and exact values agree for IDs1–5 on both nodes. LSNs, XIDs, PIDs and
sampled client times vary. All owned clients and servers stop, and the physical slot is removed.

## Systems lens
Synchronous acknowledgement joins another stage of the replication pipeline to the write's response
path. It trades availability for the configured receipt guarantee, but does not elect or fence a
writer. A local commit record, visibility to other transactions and a caller's acknowledgement are
separate boundaries. Canceling after local durability cannot turn that record into an abort; after
an ambiguous client outcome, reconcile by the stable request receipt before retrying. This run
receives an explicit local-commit warning; it does not pretend to have lost the response.

## Optional variation
Change only the disconnected ID5 wait's resolution: use pgcoach hint2 to reconnect the standby
instead of canceling. Compare the warning, acknowledgement and authoritative receipt outcomes.
Choose a per-transaction policy for critical orders versus rebuildable telemetry, then explain the
availability cost and what evidence is required before retrying a canceled or disconnected client.
