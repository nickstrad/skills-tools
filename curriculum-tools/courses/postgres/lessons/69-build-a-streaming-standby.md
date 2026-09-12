# Build and verify an owned physical streaming standby

slug: build-a-streaming-standby
category: replication
difficulty: intermediate
tags: streaming-replication, hot-standby, backup, replicated-log
prerequisites: base-backup
safety: privileged
run-in: shell
sessions: 1
min-version: 16
minutes: 25
revision: 4

## Overview
Create an owned primary and a real physical standby from a verified base backup. Identify the
sender/receiver link, then follow a committed post-backup receipt through replay and an independent
standby query. Actually reject a standby write. The variation replaces the receiver process and
verifies reconnection plus a later receipt, without treating reconnection as leader election.

## Syntax breakdown
### In plain terms

A physical standby starts from copied files and keeps applying the primary's WAL. A streaming
connection alone does not prove a particular committed row is readable, so we require a replay
boundary and the complete expected result. Being in recovery also restricts the standby to reads.

### What you are learning

- **Bootstrap plus streaming:** distinguish data in the base backup from a later replicated receipt.
- **Replication roles:** a source sender, standby receiver and startup replay process have separate work.
- **Readiness evidence:** role, identity, connection, replay position and actual rows answer different questions.
- **Reconnection:** replacing a receiver can resume transport without changing writer authority.

### Piece by piece

- **python3** runs the supplied owned-topology helper and experiment. **PGBIN** or **pg_config --bindir**
  selects binaries. **tempfile.mkdtemp** and private sockets isolate paths; root uses
  **runuser -u ... -- / os.chown** while other users run directly.
- **initdb -D ... -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** selects data directory and superuser, confines local trust behind the private
  directory, rejects host authentication, fixes locale and enables checksums/1MB segments.
  **listen_addresses=''** disables TCP. **shared_buffers=16MB**, **max_connections=10**,
  **max_wal_size=128MB**, **checkpoint_timeout=1h** and **autovacuum=off** bound this fixture.
- **fsync**, **synchronous_commit** and **full_page_writes** remain on; **wal_level=replica**
  permits physical streaming. **wal_sender_timeout=5s** bounds a sender's unresponsive connection.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, returns unaligned tuples and fails
  on SQL errors. Cleared inherited PG variables, **PGCONNECT_TIMEOUT**, **statement_timeout** and
  **lock_timeout** isolate and bound SQL. Standby queries use its explicit **PGHOST** socket.
- **CREATE TABLE** establishes primary-key, positive-amount and non-null receipt constraints.
  Receipt0 exists before the backup; receipt1 is committed only after streaming starts. Ordered
  **json_agg** returns every identity, amount and note for independent source/standby equality.
- **CREATE ROLE owned_repl LOGIN REPLICATION** creates the dedicated replication connection role.
  The fresh initdb HBA allows local replication through the protected socket. It is not an
  application superuser; **pg_stat_replication.usename** verifies the actual connection identity.
- **pg_basebackup -D ... -U owned_repl -c fast -X stream -R -C -S owned_standby
  --manifest-checksums=SHA256 -v** copies the source and required WAL, writes standby.signal and
  connection settings, creates/names a persistent physical slot, enables manifest checksums and
  records verbose output. **pg_verifybackup** verifies this copy before configuration changes.
- **postgresql.auto.conf** already contains **primary_conninfo/primary_slot_name** from **-R**.
  The helper appends the private standby socket, **cluster_name=owned_standby**, **archive_mode=off**,
  **hot_standby=on**, **wal_receiver_status_interval=1s** and **wal_retrieve_retry_interval=100ms**.
  The first controls periodic feedback; the second bounds retry delay for this lab. Keeping the
  generated source connection avoids accidentally pointing the copy at itself.
- **pg_ctl -D ... -l ... -w -t20 start** bounds startup and saves separate source/standby logs;
  **SHOW data_directory** verifies the answering copy. **pg_is_in_recovery** is false on the source
  and true on the hot standby. **pg_control_system.system_identifier** must match because the
  standby is a physical copy; matching identity alone does not prove current data or authority.
- **pg_stat_replication** reports the owned application's sender PID, user, state, sync_state,
  sent/write/flush/replay positions and backend_xmin. **pg_stat_wal_receiver** reports receiver PID,
  streaming status, source socket/port, slot, received timeline and written/flushed positions.
  Fresh connections and bounded polling require one streaming row at each end.
- **pg_create_restore_point** writes a named marker after receipt COMMIT and returns a real
  record end. An idle insertion position can be ahead of the last replayable record; this marker
  gives the gate concrete work to reach. It is not an exact per-request WAL charge. **pg_last_wal_replay_lsn >= bound** gates the
  subsequent fresh standby query within this fixed source history; complete rows still must match.
- The separate standby INSERT uses **VERBOSITY=verbose** so the driver can require SQLSTATE
  **25006** plus the read-only transaction error. Both servers are reread afterward to prove
  receipt99 was not added. An arbitrary connection or syntax error is not accepted as the result.
- The variation sends **os.kill(pid, signal.SIGTERM)** to the actual owned
  **pg_stat_wal_receiver.pid**,
  terminating that auxiliary process under the same OS owner. It commits receipt2 on the source and polls for a different streaming receiver PID. A fresh log
  offset must contain a new streaming start; the new commit's replay bound and complete rows pass.
  The experiment does not require a particular stale-read window during this brief reconnection.
- Fresh logs must include standby mode, consistent recovery, read-only readiness and streaming.
  **json.loads/dumps** retain role/link/row observations. **stop_replication** stops the standby,
  polls **pg_replication_slots.active=false**, calls **pg_drop_replication_slot** for only the owned
  slot, verifies its absence and stops the source in finally. No downstream lesson depends on a
  leftover running server; each builds its own topology.

## Caution
Use Python3 and matching PostgreSQL16 server tools, pg_basebackup and pg_verifybackup; PGBIN may
select their folder. The script creates its own /tmp/pg-owned-* primary, standby and sockets with
TCP disabled. Existing PG/PGLAB settings are ignored. Root uses runuser as the postgres OS owner.
The variation terminates only the receiver PID queried from this owned standby. Cleanup stops the
standby, removes its inactive owned slot and stops the source. Retained paths contain stopped
clusters and logs; allow a few hundred MB. Two local processes do not test independent-host failure.

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

reconnect = False

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def rows(query):
    return json.loads(query("select json_agg(r) from (select id,amount,note from stream_receipts order by id) r"))

try:
    start()
    sql('create table stream_receipts(id int primary key,amount int not null check(amount>0),note text not null)')
    sql("insert into stream_receipts values(0,1,'in backup')")
    clone_standby()
    source_id=sql('select system_identifier from pg_control_system()')
    assert replica_sql('select system_identifier from pg_control_system()')==source_id
    assert sql('select pg_is_in_recovery()')=='f'
    assert replica_sql('select pg_is_in_recovery()')=='t'
    assert replica_sql('show archive_mode')=='off' and replica_sql('show hot_standby')=='on'
    link_sender,link_receiver=sender()[0],receiver()[0]
    assert link_sender['usename']=='owned_repl' and link_sender['sync_state']=='async'
    assert link_receiver['sender_host']==str(sock) and link_receiver['sender_port']==6543
    assert link_receiver['slot_name']=='owned_standby' and link_receiver['received_tli']==1
    expected=[dict(id=0,amount=1,note='in backup')]
    assert rows(replica_sql)==expected
    sql("insert into stream_receipts values(1,10,'streamed after backup')")
    committed_bound=sql("select pg_create_restore_point('stream_receipt_committed')")
    wait_replay(committed_bound)
    expected.append(dict(id=1,amount=10,note='streamed after backup'))
    assert rows(sql)==rows(replica_sql)==expected
    # This fresh direct connection attempts an actual standby write; classify SQLSTATE precisely.
    failed=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
        '-c',"insert into stream_receipts values(99,99,'forbidden standby write')"],env=replica_env,
        text=True,capture_output=True,timeout=10)
    (root/'standby-write-error.log').write_text(failed.stdout+failed.stderr)
    assert failed.returncode!=0 and '25006' in failed.stderr and 'read-only transaction' in failed.stderr
    assert rows(sql)==rows(replica_sql)==expected
    core_log=standby_log.read_text()
    for marker in ('entering standby mode','consistent recovery state reached','ready to accept read-only connections',
                   'started streaming WAL from primary'):
        assert marker in core_log, 'Missing actual standby evidence: '+marker
    emit('streaming_ready',dict(system_identifier=source_id,source_directory=str(data),standby_directory=str(standby),
        source_recovery=False,standby_recovery=True,sender=sender(),receiver=receiver(),committed_bound=committed_bound,
        outcome=expected,standby_write_sqlstate='25006'))
    if reconnect:
        original_pid=receiver()[0]['pid']
        offset=standby_log.stat().st_size
        import signal
        os.kill(original_pid,signal.SIGTERM)
        sql("insert into stream_receipts values(2,20,'after receiver restart')")
        new_bound=sql("select pg_create_restore_point('stream_reconnected_receipt')")
        wait_for('a replacement streaming receiver',lambda:
            len(receiver())==1 and receiver()[0]['pid']!=original_pid and receiver()[0]['status']=='streaming')
        wait_replay(new_bound)
        expected.append(dict(id=2,amount=20,note='after receiver restart'))
        assert rows(sql)==rows(replica_sql)==expected
        fresh=standby_log.read_bytes()[offset:].decode()
        assert 'started streaming WAL from primary' in fresh
        (root/'receiver-reconnect.log').write_text(fresh)
        emit('receiver_reconnected',dict(old_pid=original_pid,new_receiver=receiver(),new_bound=new_bound,outcome=expected))
    assert replica_sql('select pg_is_in_recovery()')=='t' and sql('select pg_is_in_recovery()')=='f'
    print('PASS: actual base backup and streaming, role/link/identity checks, complete receipts and rejected standby write.',flush=True)
finally:
    stop_replication()
PY
```

## Expected result
The verified backup contains receipt0. Actual sender and receiver rows report streaming, the
source socket/port, owned_repl user and owned_standby slot. The source is out of recovery; the
standby remains in recovery with read-only queries enabled. Both retain the same system identifier.

After replay reaches the post-COMMIT bound, both queries return receipt0/amount1/note in backup and
receipt1/amount10/note streamed after backup. A real standby INSERT fails with SQLSTATE25006 and
read-only transaction text; neither server has receipt99. The variation replaces the receiver PID,
requires a fresh streaming log line and verifies receipt2/amount20/note after receiver restart.
No promotion occurs. Exact PIDs, LSNs and timing vary.

PASS follows link/identity/role/domain/error assertions. The standby stops, its physical slot is
removed after becoming inactive, and the source stops. The printed owned directory retains evidence.
Replication here proves local transport and replay, not automatic election, fencing or host resilience.

## Systems lens
A replicated log needs an initial state, continued delivery, replay and application verification.
Transport reconnection solves only one of those responsibilities. Asynchronous replication does not
wait for each commit to become readable on the follower, and the existence of a hot standby does not
choose a new leader or stop an old writer. The next experiments separate those boundaries explicitly.

## Optional variation
In a copy of the supplied Run block, change only `reconnect = False` to `reconnect = True`.
This terminates the owned receiver and commits one additional receipt. The changed streaming PID
and fresh log line prove reconnection; receipt2/amount20 on the standby proves application catch-up.
The source stays available, so this comparison does not exercise writer replacement or fencing.
