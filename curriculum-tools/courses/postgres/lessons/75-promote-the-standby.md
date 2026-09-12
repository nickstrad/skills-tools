# Promotion versus controlled cutover: fence the writer and inventory receipts

slug: promote-the-standby
category: replication
difficulty: advanced
tags: failover, timelines, split-brain, hot-standby, leader-election
prerequisites: read-your-writes-on-a-replica, point-in-time-recovery
safety: dangerous
run-in: shell
sessions: 1
min-version: 16
minutes: 40
revision: 4

## Overview
Run two independent owned topologies. First disconnect transport, acknowledge a write and promote
without stopping the old writer; inventory the resulting two writable histories. Then perform a
controlled cutover: close admission, revoke the old application login, verify all acknowledged
receipts on the candidate and stop the old primary before promotion. Test the old endpoint and
routing token, then accept a new write. The variation begins controlled cutover with replay paused.

## Syntax breakdown
### In plain terms

Promotion makes a standby writable; it does not revoke the old primary or select a trustworthy
history for clients. A controlled cutover must establish which acknowledged writes arrived and
ensure the old writer cannot continue before opening the new route. This experiment retains both
the failure evidence and the successful cutover's receipt inventory.

### What you are learning

- **History fork:** both servers can accept writes after promotion, with different acknowledged receipts.
- **Writer exclusion:** closing admission, revoking access and stopping the old process precede promotion.
- **Data readiness:** match known history, replay boundary and complete receipts before choosing the candidate.
- **Stale authority:** reject an old routing token even though the new node shares the same system identifier.

### Piece by piece

- **set -e** stops the shell if the first complete scenario fails; the second Python invocation
  creates a fresh independent topology rather than repairing or reusing the deliberate split brain.
  **python3** includes the full owned-replication helper in each scenario. **PGBIN / pg_config
  --bindir** locates binaries; **tempfile.mkdtemp**, private sockets and cleared PG variables
  isolate ownership, with root-only **runuser/os.chown** assigning server files to postgres.
- **initdb -D** names new data; **-U postgres** names its administrator; **--auth-local=trust**
  permits access through the protected socket directory; **--auth-host=reject** rejects host
  authentication; **--no-locale**, **--data-checksums** and **--wal-segsize=1** select fixed locale,
  checksums and1MB WAL segments. **listen_addresses=''** disables TCP.
- **fsync/synchronous_commit/full_page_writes=on**, **wal_level=replica**, small buffers,
  **max_wal_size=128MB**, **checkpoint_timeout=1h**, **autovacuum=off** and
  **wal_sender_timeout=5s** configure the private fixture. Replication is asynchronous; no
  synchronous-standby acknowledgement is configured by these local durability settings.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, prints unaligned tuples only,
  stops on SQL errors and executes supplied commands. **PGCONNECT_TIMEOUT**, **statement_timeout**,
  **lock_timeout** and Python subprocess timeouts bound calls. Writer connections select
  **PGUSER=app_writer**, a dedicated **LOGIN** role granted only **SELECT, INSERT** on the receipt
  table; administrative connections retain the owned postgres role.
- **INSERT ... RETURNING row_to_json(failover_receipts)** returns the actual inserted ID/payload.
  The driver records an acknowledgement only after that client command completes successfully.
  **json_agg ORDER BY id** and Python **json.loads/dumps** retain complete ordered inventories,
  not inferred totals. Probe IDs90–93 must never appear as accepted receipts.
- **authority** holds a trusted driver-owned epoch, endpoint and system identifier. **route** first
  compares the entire token and admission flag; a rejection reports zero database attempts.
  These local checks illustrate routing policy, while actual role/process operations exclude the
  old writer. No database timeline field independently grants writer ownership.
- **clone_standby** creates the dedicated **LOGIN REPLICATION** role. **pg_basebackup -U** selects
  it, **-D** names the copy, **-c fast** requests a checkpoint, **-X stream** includes WAL,
  **-R** writes recovery settings, **-C -S owned_standby** creates/names the physical slot and
  **--manifest-checksums=SHA256 -v** supplies checksums/diagnostics. **pg_verifybackup** verifies
  before intentional settings changes. **standby.signal/primary_conninfo/primary_slot_name**
  connect recovery; private socket, **hot_standby=on**, **archive_mode=off**, status interval1s
  and retry100ms configure the copy. Receipt0 is in its verified backup.
- **pg_create_restore_point** supplies a real WAL marker's record end. **wait_replay** polls
  **pg_last_wal_replay_lsn >= marker** for the baseline and controlled cutover. Python **lsn**
  converts hexadecimal halves for comparison only after this fixed-history identity check.
- In the unsafe scenario, **ALTER SYSTEM SET primary_conninfo=''** plus **pg_reload_conf** stops
  transport. Poll empty **pg_stat_wal_receiver** and **pg_stat_replication** before accepting
  source receipt1. Pausing replay alone would be insufficient to keep a receipt off the promoted
  branch: promotion can replay WAL that has already arrived. The candidate still has only receipt0.
- **pg_ctl -D ... -w -t20 promote** requests promotion and bounds the utility wait. Poll
  **pg_is_in_recovery=false**, then **CHECKPOINT** before requiring
  **pg_control_checkpoint.timeline_id=2**. **pg_control_system.system_identifier** must still match
  the source; **current_setting('data_directory')** verifies the owned endpoint. The removed
  **standby.signal**, new **00000002.history** parent1 row and fresh promotion log prove the
  transition. A timeline identifies ancestry, not election or current authority.
- After unsafe promotion, source receipt2 and promoted receipt3 both acknowledge. Independent
  queries show old IDs0,1,2 and new IDs0,3. Choosing either branch alone omits acknowledged work on
  the other; the rows remain in the preserved old/new evidence, and no automatic reconciliation
  has been implemented. The old routing token did not revoke itself when promotion occurred.
- Controlled cutover uses a fresh pair. Receipt1 acknowledges on the source, then **admission=False**
  rejects a new routed probe. **ALTER ROLE app_writer NOLOGIN** persistently blocks new application
  logins on that source; **pg_stat_activity** must show zero existing app sessions. NOLOGIN alone
  would not terminate an already connected client. A direct INSERT attempt must fail at login.
- **candidate** checks known system/parent timeline, recovery role, marker replay and exact source
  receipt inventory. Core waits for a caught-up candidate. Variation uses **pg_wal_replay_pause**
  and verifies **pg_get_wal_replay_pause_state='paused'** before receipt1; the initial candidate
  is refused with only receipt0. **pg_wal_replay_resume** releases it, then the same readiness gate
  must pass. No promotion or client retry is justified by an elapsed sleep alone.
- After readiness, clear **primary_slot_name** on the candidate, reload and require a receiver
  with no slot plus the old slot **active=false**. **pg_drop_replication_slot** removes that
  consumed owned obligation before shutdown, so cleanup never requires restarting the old primary.
  This short no-slot interval has a quiesced writer and a bounded private retained-WAL workload.
- **pg_ctl -D ... -m fast -w -t20 stop** stops the old primary. Require its postmaster PID file to
  be absent and a direct old-endpoint INSERT attempt to fail connecting before promoting the new
  node. The old role remains NOLOGIN in its stopped data. This fixture has no automatic restarter;
  an uncontrolled service manager or privileged operator is outside that enforced local boundary.
- After promotion and receipt verification, advance the driver epoch to2/new endpoint, enable
  **app_writer LOGIN** only on that new node and reopen admission. The old token must return
  stale_authority with zero database attempts; the current token commits receipt2. The complete
  new inventory must equal every successful acknowledgement, while the old server stays stopped.
- Finally stops the promoted candidate. In the unsafe case the old source is still live, so its
  inactive physical slot is dropped before stopping it. In the controlled case the slot was already
  removed and the old source stays stopped. Each scenario preserves its logs and independent
  inventories before all owned processes finish.

## Caution
Run the complete shell script with Python3 and matching PostgreSQL16 binaries, including
pg_basebackup/pg_verifybackup; PGBIN may select the binary folder. It deliberately creates split
brain only in disposable owned data/socket directories, with TCP disabled and inherited PG/PGLAB
settings ignored. Root uses runuser as the postgres OS owner. Two independent topologies run
sequentially and each stops in finally; no divergent writer remains running between lessons.
Retain the printed stopped paths and inventories; allow a few hundred MB.

The driver owns every application client and there is no external supervisor restarting a server.
Role revocation and verified process shutdown enforce this local cutover. Its in-memory routing
epoch demonstrates stale-admission rejection; it is not a distributed election, durable lease or
production fencing service. Losing contact with an uncontrolled writer would require an actual
external fencing/authority mechanism before making the same promise.

## Run
```sh
set -e
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

controlled = False
lagging = False

acknowledged=[]
admission=True

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def receipts(query):
    return json.loads(query('select coalesce(json_agg(r order by id),\'[]\') from failover_receipts r'))

def write(endpoint,id,note):
    target=env if endpoint=='source' else replica_env
    result=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',
        "insert into failover_receipts values("+str(id)+",'"+note+"') returning row_to_json(failover_receipts)"],
        env=dict(target,PGUSER='app_writer'),text=True,capture_output=True,timeout=10)
    if result.returncode:
        raise RuntimeError(result.stderr)
    row=json.loads(next(line for line in result.stdout.splitlines() if line.startswith('{')))
    assert row==dict(id=id,note=note)
    acknowledged.append(dict(endpoint=endpoint,receipt=row))
    return row

def route(token,id,note):
    if token!=authority:
        return dict(status='stale_authority',database_attempts=0)
    if not admission:
        return dict(status='admission_closed',database_attempts=0)
    row=write(authority['endpoint'],id,note)
    return dict(status='acknowledged',receipt=row,database_attempts=1)

def lsn(value):
    high,low=value.split('/')
    return (int(high,16)<<32)+int(low,16)

def identity(query):
    return json.loads(query("select json_build_object('system',system_identifier::text,'recovery',pg_is_in_recovery(),"
        "'directory',current_setting('data_directory'),'checkpoint_timeline',timeline_id) "
        "from pg_control_system(),pg_control_checkpoint()"))

def promote():
    began=standby_log.stat().st_size
    server('pg_ctl','-D',standby,'-w','-t','20','promote',timeout=25)
    wait_for('promotion complete',lambda: replica_sql('select pg_is_in_recovery()')=='f')
    replica_sql('checkpoint')
    state=identity(replica_sql)
    assert state['checkpoint_timeline']==2 and state['system']==source_identity['system']
    assert not (standby/'standby.signal').exists()
    history=(standby/'pg_wal'/'00000002.history').read_text()
    lines=[line.split() for line in history.splitlines() if line.strip() and not line.startswith('#')]
    assert len(lines)==1 and lines[0][0]=='1'
    fresh_log=standby_log.read_text()[began:]
    assert 'selected new timeline ID: 2' in fresh_log
    emit('promotion',dict(identity=state,history=history,log=fresh_log))

def candidate(bound,expected):
    state=identity(replica_sql)
    current=replica_sql('select pg_last_wal_replay_lsn()')
    values=receipts(replica_sql)
    ready=(state['system']==source_identity['system'] and state['recovery']
        and state['checkpoint_timeline']==1 and lsn(current)>=lsn(bound) and values==expected)
    return dict(ready=ready,replay=current,bound=bound,receipts=values,identity=state)

try:
    start()
    sql('create table failover_receipts(id int primary key,note text not null)')
    sql('create role app_writer login')
    sql('grant select,insert on failover_receipts to app_writer')
    source_identity=identity(sql)
    authority=dict(epoch=1,endpoint='source',system=source_identity['system'])
    old_token=dict(authority)
    assert route(old_token,0,'baseline')['status']=='acknowledged'
    clone_standby()
    wait_replay(sql("select pg_create_restore_point('failover_baseline')"))
    assert receipts(replica_sql)==[dict(id=0,note='baseline')]
    if not controlled:
        # Disconnect receipt transport, rather than merely pause apply: promotion can replay received WAL.
        replica_sql("alter system set primary_conninfo=''")
        replica_sql('select pg_reload_conf()')
        wait_for('standby transport disabled',lambda: receiver()==[] and sender()==[])
        assert route(old_token,1,'acknowledged before unsafe promotion')['status']=='acknowledged'
        assert receipts(replica_sql)==[dict(id=0,note='baseline')]
        promote()
        assert route(old_token,2,'old writer after promotion')['status']=='acknowledged'
        write('candidate',3,'new writer after promotion')
        old_rows=receipts(sql)
        new_rows=receipts(replica_sql)
        assert old_rows==[dict(id=0,note='baseline'),dict(id=1,note='acknowledged before unsafe promotion'),
            dict(id=2,note='old writer after promotion')]
        assert new_rows==[dict(id=0,note='baseline'),dict(id=3,note='new writer after promotion')]
        assert identity(sql)['recovery'] is False and identity(replica_sql)['recovery'] is False
        assert sender()==[] and receiver()==[]
        emit('split_brain_receipts',dict(acknowledged=acknowledged,old=old_rows,new=new_rows,
            old_identity=identity(sql),new_identity=identity(replica_sql),missing_if_new_chosen=[1,2],
            missing_if_old_chosen=[3]))
    else:
        if lagging:
            replica_sql('select pg_wal_replay_pause()')
            wait_for('actual paused replay',lambda: replica_sql('select pg_get_wal_replay_pause_state()')=='paused')
        assert route(old_token,1,'acknowledged before controlled cutover')['status']=='acknowledged'
        admission=False
        assert route(old_token,90,'closed admission probe')==dict(status='admission_closed',database_attempts=0)
        # Durable role revocation plus zero existing app sessions closes this fixture's writer path.
        sql('alter role app_writer nologin')
        assert sql("select count(*) from pg_stat_activity where usename='app_writer'")=='0'
        blocked_login=subprocess.run([str(bindir/'psql'),'-X','-At','-c',
            "insert into failover_receipts values(91,'revoked writer probe')"],
            env=dict(env,PGUSER='app_writer'),text=True,capture_output=True,timeout=5)
        assert blocked_login.returncode!=0 and 'not permitted to log in' in blocked_login.stderr
        final_old=receipts(sql)
        bound=sql("select pg_create_restore_point('closed_writer_boundary')")
        if not lagging:
            wait_replay(bound)
        initial=candidate(bound,final_old)
        if not lagging:
            assert initial['ready']
        if lagging:
            assert not initial['ready'] and initial['receipts']==[dict(id=0,note='baseline')]
            emit('lagging_candidate_refused',initial)
            replica_sql('select pg_wal_replay_resume()')
        wait_replay(bound)
        ready=candidate(bound,final_old)
        assert ready['ready']
        # Release the now-consumed owned slot before stopping the old server; no restart for cleanup.
        replica_sql("alter system set primary_slot_name=''")
        replica_sql('select pg_reload_conf()')
        wait_for('receiver uses no slot',lambda: len(receiver())==1 and receiver()[0]['slot_name'] is None)
        wait_for('old slot inactive',lambda: sql("select not active from pg_replication_slots where slot_name='owned_standby'")=='t')
        sql("select pg_drop_replication_slot('owned_standby')")
        stop()
        assert not (data/'postmaster.pid').exists()
        stopped_probe=subprocess.run([str(bindir/'psql'),'-X','-At','-c',
            "insert into failover_receipts values(92,'stopped endpoint probe')"],
            env=dict(env,PGUSER='app_writer'),text=True,capture_output=True,timeout=5)
        assert stopped_probe.returncode!=0 and 'connection to server' in stopped_probe.stderr
        emit('old_writer_fenced',dict(admission_closed=True,application_sessions=0,old_receipts=final_old,
            revoked_login_error=blocked_login.stderr,stopped_endpoint_error=stopped_probe.stderr,
            candidate=ready,postmaster_pid_file_absent=True))
        promote()
        assert receipts(replica_sql)==final_old
        authority=dict(epoch=2,endpoint='candidate',system=source_identity['system'])
        replica_sql('alter role app_writer login')
        admission=True
        stale=route(old_token,93,'stale authority probe')
        assert stale==dict(status='stale_authority',database_attempts=0)
        assert route(dict(authority),2,'new writer after controlled cutover')['status']=='acknowledged'
        final=receipts(replica_sql)
        expected=final_old+[dict(id=2,note='new writer after controlled cutover')]
        assert final==expected and [x['receipt'] for x in acknowledged]==expected
        assert not (data/'postmaster.pid').exists()
        emit('controlled_cutover_receipts',dict(acknowledged=acknowledged,old_inventory=final_old,new=final,
            authority=authority,stale_token_response=stale,old_server_still_stopped=True))
    print('PASS: '+('controlled cutover preserved all acknowledged receipts and rejects the old writer.' if controlled
        else 'unsafe promotion left two writable histories with divergent acknowledged receipt sets.'),flush=True)
finally:
    stop_replication()
PY

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

controlled = True
lagging = False

acknowledged=[]
admission=True

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def receipts(query):
    return json.loads(query('select coalesce(json_agg(r order by id),\'[]\') from failover_receipts r'))

def write(endpoint,id,note):
    target=env if endpoint=='source' else replica_env
    result=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',
        "insert into failover_receipts values("+str(id)+",'"+note+"') returning row_to_json(failover_receipts)"],
        env=dict(target,PGUSER='app_writer'),text=True,capture_output=True,timeout=10)
    if result.returncode:
        raise RuntimeError(result.stderr)
    row=json.loads(next(line for line in result.stdout.splitlines() if line.startswith('{')))
    assert row==dict(id=id,note=note)
    acknowledged.append(dict(endpoint=endpoint,receipt=row))
    return row

def route(token,id,note):
    if token!=authority:
        return dict(status='stale_authority',database_attempts=0)
    if not admission:
        return dict(status='admission_closed',database_attempts=0)
    row=write(authority['endpoint'],id,note)
    return dict(status='acknowledged',receipt=row,database_attempts=1)

def lsn(value):
    high,low=value.split('/')
    return (int(high,16)<<32)+int(low,16)

def identity(query):
    return json.loads(query("select json_build_object('system',system_identifier::text,'recovery',pg_is_in_recovery(),"
        "'directory',current_setting('data_directory'),'checkpoint_timeline',timeline_id) "
        "from pg_control_system(),pg_control_checkpoint()"))

def promote():
    began=standby_log.stat().st_size
    server('pg_ctl','-D',standby,'-w','-t','20','promote',timeout=25)
    wait_for('promotion complete',lambda: replica_sql('select pg_is_in_recovery()')=='f')
    replica_sql('checkpoint')
    state=identity(replica_sql)
    assert state['checkpoint_timeline']==2 and state['system']==source_identity['system']
    assert not (standby/'standby.signal').exists()
    history=(standby/'pg_wal'/'00000002.history').read_text()
    lines=[line.split() for line in history.splitlines() if line.strip() and not line.startswith('#')]
    assert len(lines)==1 and lines[0][0]=='1'
    fresh_log=standby_log.read_text()[began:]
    assert 'selected new timeline ID: 2' in fresh_log
    emit('promotion',dict(identity=state,history=history,log=fresh_log))

def candidate(bound,expected):
    state=identity(replica_sql)
    current=replica_sql('select pg_last_wal_replay_lsn()')
    values=receipts(replica_sql)
    ready=(state['system']==source_identity['system'] and state['recovery']
        and state['checkpoint_timeline']==1 and lsn(current)>=lsn(bound) and values==expected)
    return dict(ready=ready,replay=current,bound=bound,receipts=values,identity=state)

try:
    start()
    sql('create table failover_receipts(id int primary key,note text not null)')
    sql('create role app_writer login')
    sql('grant select,insert on failover_receipts to app_writer')
    source_identity=identity(sql)
    authority=dict(epoch=1,endpoint='source',system=source_identity['system'])
    old_token=dict(authority)
    assert route(old_token,0,'baseline')['status']=='acknowledged'
    clone_standby()
    wait_replay(sql("select pg_create_restore_point('failover_baseline')"))
    assert receipts(replica_sql)==[dict(id=0,note='baseline')]
    if not controlled:
        # Disconnect receipt transport, rather than merely pause apply: promotion can replay received WAL.
        replica_sql("alter system set primary_conninfo=''")
        replica_sql('select pg_reload_conf()')
        wait_for('standby transport disabled',lambda: receiver()==[] and sender()==[])
        assert route(old_token,1,'acknowledged before unsafe promotion')['status']=='acknowledged'
        assert receipts(replica_sql)==[dict(id=0,note='baseline')]
        promote()
        assert route(old_token,2,'old writer after promotion')['status']=='acknowledged'
        write('candidate',3,'new writer after promotion')
        old_rows=receipts(sql)
        new_rows=receipts(replica_sql)
        assert old_rows==[dict(id=0,note='baseline'),dict(id=1,note='acknowledged before unsafe promotion'),
            dict(id=2,note='old writer after promotion')]
        assert new_rows==[dict(id=0,note='baseline'),dict(id=3,note='new writer after promotion')]
        assert identity(sql)['recovery'] is False and identity(replica_sql)['recovery'] is False
        assert sender()==[] and receiver()==[]
        emit('split_brain_receipts',dict(acknowledged=acknowledged,old=old_rows,new=new_rows,
            old_identity=identity(sql),new_identity=identity(replica_sql),missing_if_new_chosen=[1,2],
            missing_if_old_chosen=[3]))
    else:
        if lagging:
            replica_sql('select pg_wal_replay_pause()')
            wait_for('actual paused replay',lambda: replica_sql('select pg_get_wal_replay_pause_state()')=='paused')
        assert route(old_token,1,'acknowledged before controlled cutover')['status']=='acknowledged'
        admission=False
        assert route(old_token,90,'closed admission probe')==dict(status='admission_closed',database_attempts=0)
        # Durable role revocation plus zero existing app sessions closes this fixture's writer path.
        sql('alter role app_writer nologin')
        assert sql("select count(*) from pg_stat_activity where usename='app_writer'")=='0'
        blocked_login=subprocess.run([str(bindir/'psql'),'-X','-At','-c',
            "insert into failover_receipts values(91,'revoked writer probe')"],
            env=dict(env,PGUSER='app_writer'),text=True,capture_output=True,timeout=5)
        assert blocked_login.returncode!=0 and 'not permitted to log in' in blocked_login.stderr
        final_old=receipts(sql)
        bound=sql("select pg_create_restore_point('closed_writer_boundary')")
        if not lagging:
            wait_replay(bound)
        initial=candidate(bound,final_old)
        if not lagging:
            assert initial['ready']
        if lagging:
            assert not initial['ready'] and initial['receipts']==[dict(id=0,note='baseline')]
            emit('lagging_candidate_refused',initial)
            replica_sql('select pg_wal_replay_resume()')
        wait_replay(bound)
        ready=candidate(bound,final_old)
        assert ready['ready']
        # Release the now-consumed owned slot before stopping the old server; no restart for cleanup.
        replica_sql("alter system set primary_slot_name=''")
        replica_sql('select pg_reload_conf()')
        wait_for('receiver uses no slot',lambda: len(receiver())==1 and receiver()[0]['slot_name'] is None)
        wait_for('old slot inactive',lambda: sql("select not active from pg_replication_slots where slot_name='owned_standby'")=='t')
        sql("select pg_drop_replication_slot('owned_standby')")
        stop()
        assert not (data/'postmaster.pid').exists()
        stopped_probe=subprocess.run([str(bindir/'psql'),'-X','-At','-c',
            "insert into failover_receipts values(92,'stopped endpoint probe')"],
            env=dict(env,PGUSER='app_writer'),text=True,capture_output=True,timeout=5)
        assert stopped_probe.returncode!=0 and 'connection to server' in stopped_probe.stderr
        emit('old_writer_fenced',dict(admission_closed=True,application_sessions=0,old_receipts=final_old,
            revoked_login_error=blocked_login.stderr,stopped_endpoint_error=stopped_probe.stderr,
            candidate=ready,postmaster_pid_file_absent=True))
        promote()
        assert receipts(replica_sql)==final_old
        authority=dict(epoch=2,endpoint='candidate',system=source_identity['system'])
        replica_sql('alter role app_writer login')
        admission=True
        stale=route(old_token,93,'stale authority probe')
        assert stale==dict(status='stale_authority',database_attempts=0)
        assert route(dict(authority),2,'new writer after controlled cutover')['status']=='acknowledged'
        final=receipts(replica_sql)
        expected=final_old+[dict(id=2,note='new writer after controlled cutover')]
        assert final==expected and [x['receipt'] for x in acknowledged]==expected
        assert not (data/'postmaster.pid').exists()
        emit('controlled_cutover_receipts',dict(acknowledged=acknowledged,old_inventory=final_old,new=final,
            authority=authority,stale_token_response=stale,old_server_still_stopped=True))
    print('PASS: '+('controlled cutover preserved all acknowledged receipts and rejects the old writer.' if controlled
        else 'unsafe promotion left two writable histories with divergent acknowledged receipt sets.'),flush=True)
finally:
    stop_replication()
PY
```

## Expected result
Unsafe scenario: transport disconnects while both servers still run. Source acknowledges receipt1,
then promotion creates timeline2 without stopping timeline1. Source receipt2 and new-node receipt3
both succeed. Old inventory is IDs0,1,2; new inventory is IDs0,3. Both nodes report recovery=false and
share one system identifier but differ in timeline/history. Selecting new alone omits acknowledged
IDs1,2; selecting old alone omits ID3. Both branches remain preserved for inspection.

Controlled scenario: receipt1 acknowledges before admission closes. A routed probe is refused,
new old-source app login actually fails, and zero existing app sessions are verified. Candidate
must contain exactly IDs0,1 and replay the closed-writer marker in the known history. Old source
stops and a direct endpoint write attempt fails before promotion. The epoch1 token is rejected
with zero database attempts; epoch2 commits receipt2. New inventory exactly matches all three
acknowledgements, with no probe rows. The variation first refuses an actually paused candidate
containing only ID0, resumes replay and then satisfies the same cutover contract. Every owned
server stops and physical slots are removed. Actual PIDs, system IDs, LSNs and timing vary.

## Systems lens
Promotion, data preservation and writer authority are separate requirements. A process role change
cannot revoke a disconnected old writer, and an ancestry label cannot elect its successor. This
controlled cutover quiesces a reachable writer and verifies the candidate before excluding the old
process and admitting the new route. It does not establish zero-loss failover from an unreachable
asynchronous primary, automatic elections or production fencing across supervisor restarts.

## Optional variation
Use pgcoach hint2 to start controlled cutover with replay deliberately paused before the last
acknowledged write. Predict the rejected candidate inventory and state the evidence required to
resume cutover. Then explain what this reachable-writer procedure cannot prove if the old primary
is unreachable, which external fencing fact would be required, and how acknowledged receipt
inventory affects the choice of authoritative history.
