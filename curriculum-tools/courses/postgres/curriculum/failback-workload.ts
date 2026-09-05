import { code, type Draft } from "../../../src/types.ts";
import { OWNED_REPLICATION_PY } from "./owned-replication.ts";

function failbackExperiment(cascade: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_REPLICATION_PY +
    `\ninclude_cascade = ${cascade ? "True" : "False"}\n` + code`
acknowledged=[]
authority=dict(epoch=1,host=str(sock),open=True)
attempts=0
cascade,cascade_sock,cascade_log=root/'cascade',root/'cascade-socket',root/'cascade.log'
cascade_env=dict(env,PGHOST=str(cascade_sock))

def query(target,command):
    result=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',command],
        env=target,text=True,capture_output=True,timeout=10)
    assert result.returncode==0,result.stdout+result.stderr
    return result.stdout.strip()

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def rows(target):
    return json.loads(query(target,"select coalesce(json_agg(r order by id),'[]') from failback_receipts r"))

def identity(target):
    return json.loads(query(target,"select json_build_object('system',system_identifier::text,"
        "'recovery',pg_is_in_recovery(),'timeline',timeline_id,'directory',current_setting('data_directory')) "
        "from pg_control_system(),pg_control_checkpoint()"))

def receivers(target):
    return json.loads(query(target,"select coalesce(json_agg(r),'[]') from (select status,sender_host,slot_name,"
        "received_tli,flushed_lsn from pg_stat_wal_receiver) r"))

def senders(target):
    return json.loads(query(target,"select coalesce(json_agg(r),'[]') from (select application_name,usename,state,"
        "sent_lsn,flush_lsn,replay_lsn from pg_stat_replication) r"))

def write(token,id,note):
    global attempts
    if token!=authority['epoch']:
        return 'stale_authority'
    if not authority['open']:
        return 'admission_closed'
    attempts+=1
    target=dict(env,PGHOST=authority['host'],PGUSER='app_writer')
    result=query(target,"insert into failback_receipts values("+str(id)+",'"+note+"') returning row_to_json(failback_receipts)")
    receipt=json.loads(next(x for x in result.splitlines() if x.startswith('{')))
    assert receipt==dict(id=id,note=note)
    acknowledged.append(receipt)
    return 'acknowledged'

def replay(target,bound):
    return query(target,"select coalesce(pg_last_wal_replay_lsn()>='"+bound+"'::pg_lsn,false)")=='t'

def ready(target,bound,expected):
    return replay(target,bound) and rows(target)==expected

def probe(target):
    return subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
        '-c',"insert into failback_receipts values(99,'probe')"],env=dict(target,PGUSER='app_writer'),
        text=True,capture_output=True,timeout=5)

def stop_node(directory):
    if (directory/'postmaster.pid').exists():
        server('pg_ctl','-D',directory,'-m','fast','-w','-t','20','stop',timeout=25)

def drop_slot(target,name):
    wait_for('inactive '+name,lambda: query(target,"select not exists(select 1 from pg_replication_slots "
        "where slot_name='"+name+"' and active)")=='t')
    query(target,"select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name='"+name+"'")
    assert query(target,"select count(*) from pg_replication_slots where slot_name='"+name+"'")=='0'

def handover(source,target,source_data,target_data,slot_name,timeline,label):
    # Every client is owned and single-command; close admission and verify no old sessions survive.
    old_token=authority['epoch']
    authority['open']=False
    before=attempts
    assert write(old_token,99,'closed probe')=='admission_closed' and attempts==before
    query(source,'alter role app_writer nologin')
    assert query(source,"select count(*) from pg_stat_activity where usename='app_writer'")=='0'
    rejected=probe(source)
    assert rejected.returncode!=0 and 'not permitted to log in' in rejected.stderr,rejected.stderr
    bound=query(source,"select pg_create_restore_point('"+label+"_closed_writer')")
    source_identity=identity(source)
    assert source_identity['recovery']==False and source_identity['timeline']==timeline
    assert source_identity['directory']==str(source_data)
    assert identity(target)['system']==source_identity['system'] and identity(target)['recovery']==True
    assert identity(target)['directory']==str(target_data)
    received=wait_for(label+' candidate receiver',lambda: receivers(target))
    assert received[0]['sender_host']==source['PGHOST'] and received[0]['received_tli']==timeline
    assert received[0]['slot_name']==slot_name
    expected=sorted(acknowledged,key=lambda r:r['id'])
    wait_for(label+' closed-writer readiness',lambda: ready(target,bound,expected))
    assert rows(source)==rows(target)==expected
    emit(label+'_ready',dict(bound=bound,source=source_identity,candidate=identity(target),
        receiver=receivers(target),inventory=expected,rejected_login=rejected.stderr))
    # No app work may enter after this gate; detach and release its consumed slot before fencing.
    query(target,"alter system set primary_conninfo=''")
    query(target,'select pg_reload_conf()')
    wait_for(label+' detached receiver',lambda: receivers(target)==[])
    drop_slot(source,slot_name)
    stop_node(source_data)
    assert not (source_data/'postmaster.pid').exists()
    rejected=probe(source)
    assert rejected.returncode!=0 and 'connection to server' in rejected.stderr,rejected.stderr
    emit(label+'_old_writer_stopped',dict(directory=str(source_data),endpoint=source['PGHOST'],error=rejected.stderr))
    server('pg_ctl','-D',target_data,'-w','-t','20','promote',timeout=25)
    wait_for(label+' promotion',lambda: query(target,'select pg_is_in_recovery()')=='f')
    query(target,'checkpoint')
    assert identity(target)['timeline']==timeline+1 and identity(target)['system']==source_identity['system']
    assert not (target_data/'standby.signal').exists()
    history=(target_data/'pg_wal'/('%08X.history'%(timeline+1))).read_text()
    assert history.splitlines()[-1].split()[0]==str(timeline),history
    query(target,'alter system reset primary_conninfo')
    query(target,'alter system reset primary_slot_name')
    query(target,'alter role app_writer login')
    authority.update(epoch=old_token+1,host=target['PGHOST'],open=True)
    before=attempts
    assert write(old_token,99,'stale probe')=='stale_authority' and attempts==before
    assert rows(target)==expected
    emit(label+'_promoted',dict(authority=authority,identity=identity(target),history=history,
        inventory=rows(target),stale_token=old_token,rejected_without_db_attempt=True))

def clone_from(source,target_data,target_sock,name,timeline):
    result=subprocess.run(prefix+[str(bindir/'pg_basebackup'),'-D',str(target_data),'-U','owned_repl',
        '-c','fast','-X','stream','-R','-C','-S',name,'--manifest-checksums=SHA256','-v'],
        env=source,text=True,capture_output=True,timeout=60)
    (root/(name+'-basebackup.log')).write_text(result.stdout+result.stderr)
    assert result.returncode==0,result.stdout+result.stderr
    assert 'backup successfully verified' in server('pg_verifybackup',target_data,timeout=60)
    with (target_data/'postgresql.auto.conf').open('a') as config:
        config.write("\nunix_socket_directories='"+str(target_sock)+"'\ncluster_name='"+name+"'\n"
            "primary_conninfo='host="+source['PGHOST']+" port=6543 user=owned_repl application_name="+name+"'\n"
            "primary_slot_name='"+name+"'\nrecovery_target_timeline='"+str(timeline)+"'\n"
            "archive_mode=off\nhot_standby=on\nwal_receiver_status_interval='1s'\n")
    assert (target_data/'standby.signal').is_file()

try:
    start()
    sql('create table failback_receipts(id int primary key,note text not null)')
    sql('create role app_writer login')
    sql('grant select,insert on failback_receipts to app_writer')
    assert write(1,0,'original writer')=='acknowledged'
    clone_standby()
    handover(env,replica_env,data,standby,'owned_standby',1,'outbound')
    assert write(2,1,'replacement writer')=='acknowledged'
    # Rebuild the original endpoint as a verified follower; preserve its stopped original directory.
    retired=root/'retired-original-primary'
    assert not (data/'postmaster.pid').exists()
    data.rename(retired)
    clone_from(replica_env,data,sock,'owned_failback',2)
    start()
    assert identity(env)['recovery']==True
    wait_for('original endpoint now follows replacement',lambda: receivers(env)
        and receivers(env)[0]['received_tli']==2 and senders(replica_env)
        and senders(replica_env)[0]['state']=='streaming')
    rejected=probe(env)
    assert rejected.returncode!=0 and '25006' in rejected.stderr,rejected.stderr
    if include_cascade:
        cascade_sock.mkdir()
        if os.geteuid()==0:
            os.chown(cascade_sock,owner.pw_uid,owner.pw_gid)
        clone_from(env,cascade,cascade_sock,'owned_cascade',2)
        server('pg_ctl','-D',cascade,'-l',cascade_log,'-w','-t','20','start',timeout=25)
        assert identity(cascade_env)['recovery']==True and identity(cascade_env)['directory']==str(cascade)
        wait_for('third hop streams',lambda: receivers(cascade_env) and senders(env)
            and senders(env)[0]['state']=='streaming')
    # Refuse a candidate that has not applied the last acknowledged replacement-writer receipt.
    query(env,'select pg_wal_replay_pause()')
    wait_for('original candidate actually paused',lambda: query(env,'select pg_get_wal_replay_pause_state()')=='paused')
    assert write(2,2,'last replacement receipt')=='acknowledged'
    bound=replica_sql("select pg_create_restore_point('failback_candidate_test')")
    assert not ready(env,bound,acknowledged) and rows(env)!=rows(replica_env)
    emit('stale_candidate_refused',dict(bound=bound,candidate=rows(env),source=rows(replica_env),
        recovery=identity(env)['recovery'],promoted=False))
    query(env,'select pg_wal_replay_resume()')
    wait_for('candidate catches up',lambda: ready(env,bound,acknowledged))
    assert rows(env)==rows(replica_env)==acknowledged
    if include_cascade:
        wait_for('third hop applies later receipt',lambda: replay(cascade_env,bound))
        assert rows(cascade_env)==rows(env)==rows(replica_env)==acknowledged
        assert identity(cascade_env)['system']==identity(env)['system']==identity(replica_env)['system']
        assert identity(env)['recovery']==True
        assert receivers(cascade_env)[0]['sender_host']==str(sock)
        assert receivers(cascade_env)[0]['received_tli']==2
        assert receivers(cascade_env)[0]['slot_name']=='owned_cascade'
        assert receivers(env)[0]['sender_host']==str(standby_sock)
        assert senders(env)[0]['application_name']=='owned_cascade' and senders(env)[0]['usename']=='owned_repl'
        assert len(senders(replica_env))==1 and senders(replica_env)[0]['application_name']=='owned_failback'
        emit('cascade_verified',dict(middle=identity(env),middle_receiver=receivers(env),middle_sender=senders(env),
            leaf=identity(cascade_env),leaf_receiver=receivers(cascade_env),primary_senders=senders(replica_env),
            bound=bound,primary_rows=rows(replica_env),middle_rows=rows(env),leaf_rows=rows(cascade_env)))
        stop_node(cascade)
        drop_slot(env,'owned_cascade')
    handover(replica_env,env,standby,data,'owned_failback',2,'return')
    assert identity(env)['timeline']==3 and authority['epoch']==3 and authority['host']==str(sock)
    # Clear only this fixture's role-transition settings, then prove the original endpoint survives restart.
    sql('alter system reset all')
    sql('select pg_reload_conf()')
    auto=(data/'postgresql.auto.conf').read_text()
    assert all(not line.strip() or line.lstrip().startswith('#') for line in auto.splitlines())
    assert sql('select count(*) from pg_replication_slots')=='0'
    stop()
    start()
    assert identity(env)['recovery']==False and identity(env)['timeline']==3
    assert sql('show unix_socket_directories')==str(sock) and sql('show primary_conninfo')==''
    assert sql('show primary_slot_name')=='' and sql('show synchronous_standby_names')==''
    assert not (data/'standby.signal').exists() and not (standby/'postmaster.pid').exists()
    assert write(3,3,'original writer after failback and restart')=='acknowledged'
    assert rows(env)==acknowledged
    emit('failback_complete',dict(authority=authority,identity=identity(env),rows=rows(env),
        acknowledged=acknowledged,slots=int(sql('select count(*) from pg_replication_slots')),
        auto_conf=auto,old_original_directory=str(retired),cascade_exercised=include_cascade))
    print('PASS: controlled round trip preserves every acknowledgement, rejects stale authority and survives restart at the original endpoint.',flush=True)
finally:
    # Consumers stop before their immediate upstream slots are released, even if a gate fails.
    try:
        stop_node(cascade)
        for target,directory in [(env,data),(replica_env,standby)]:
            if (directory/'postmaster.pid').exists():
                query(target,"alter system set primary_conninfo=''")
                query(target,'select pg_reload_conf()')
        for target,directory in [(env,data),(replica_env,standby)]:
            if (directory/'postmaster.pid').exists():
                for name in ('owned_standby','owned_failback','owned_cascade'):
                    drop_slot(target,name)
    finally:
        try:
            stop_node(data)
        finally:
            stop_node(standby)
    assert all(not (p/'postmaster.pid').exists() for p in [data,standby,cascade])
    print('All owned failback nodes stopped and slots removed; evidence retained at',root,flush=True)
PY`;
}

export const FAILBACK_VARIATION = failbackExperiment(true);
export const FAILBACK_WORKLOAD: Draft = {
  slug: "cascading-and-failback",
  revision: 4,
  tags: ["failover", "streaming-replication", "timelines", "availability", "lab"],
  title: "Control the round trip back to the original writer",
  difficulty: "advanced",
  safetyLevel: "dangerous",
  runIn: "shell",
  estimatedMinutes: 40,
  prerequisites: ["rewind-the-old-primary"],
  overview: code`
Move the writer from an original node to a standby, rebuild the original endpoint as a verified
follower, and execute the controlled return. Refuse a stale candidate, close admission, verify the
last acknowledged work, exclude the outgoing writer and only then promote. Restart the returned
primary and verify every receipt. Cascading is optional depth in hint2; failback and cleanup are
part of both complete scripts.`,
  reading:
    'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".',
  caution: code`
Run the complete supplied shell script with Python3 and matching PostgreSQL16 server binaries;
PGBIN may select their folder. Fresh private sockets and owned data directories isolate this round
trip from the learner cluster; TCP is disabled and inherited PG/PGLAB settings are ignored. Root
uses runuser as the postgres OS owner. Allow a few hundred MB. The old original directory is
preserved before a full verified backup rebuilds that endpoint; this script does not repeat rewind.

The driver owns all app clients, and no supervisor may restart an excluded node. Its in-memory
epoch is an admission example, not a durable authority service. The explicit role/session and
process checks provide local writer exclusion. Both handovers require a reachable source and
known history; they do not promise lossless failover from an unreachable asynchronous primary.
Finally stops all owned nodes and removes their slots, retaining directories/logs for inspection.`,
  syntaxBreakdown: code`
### In plain terms

Returning to the original machine is another writer transfer. Its familiar address does not make
its data current or grant permission to write. Use the same exclusion and readiness contract in
both directions, then prove the final role survives restart. The optional third node observes
physical forwarding through a standby before it is stopped and removed from the live topology.

### What you are learning

- **A controlled round trip:** writer ownership moves twice; promotion alone supplies neither election nor exclusion.
- **Readiness before return:** one shared replay-and-inventory predicate refuses stale data and gates actual transfer.
- **Persistent role cleanup:** an empty override file, no standby.signal and a successful restart verify the final role.
- **Optional cascading:** a recovering middle node can send WAL to a separate downstream standby without becoming a writer.

### Piece by piece

- **python3** embeds the complete owned-cluster and replication helpers; **PGBIN** or
  **pg_config --bindir** chooses binaries. **tempfile.mkdtemp** allocates the root. Private socket
  directories and cleared PG variables isolate connections; root's **runuser/os.chown** assigns
  server ownership. **listen_addresses=''** disables TCP; **PGPORT=6543** is reused on distinct sockets.
- **initdb -D -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** creates data owned by the selected server user: -D names its directory, -U its
  administrator, local trust permits access inside the protected private directory, host reject
  denies network authentication, and the remaining flags select fixed locale, checksums and1MB WAL.
- **fsync/synchronous_commit/full_page_writes=on**, **wal_level=replica**,16MB buffers,
 10 connections,128MB maximum WAL target,1h checkpoint timeout,5s sender timeout and autovacuum off
  configure this small private experiment. Timeouts and retention targets are fixture bounds,
  not a production capacity recommendation.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, returns unaligned tuples only,
  stops on SQL errors and executes a command. **PGCONNECT_TIMEOUT**, statement/lock timeouts and
  Python subprocess deadlines bound calls. **VERBOSITY=verbose** exposes25006 for the read-only probe.
- **failback_receipts** stores unique IDs and non-null notes. **app_writer LOGIN** receives only
  **SELECT, INSERT** on that table. Every application command uses that role; **INSERT RETURNING
  row_to_json** and successful process exit precede acknowledgement in the driver. **json_agg ORDER
  BY id** compares complete inventories and payloads, including absence of probe99.
- The **authority** dictionary contains epoch, admitted endpoint and open/closed admission.
  **write** rejects an old epoch or closed admission before increasing its DB-attempt counter.
  This exercises a caller gate within the owned driver; it is not shared durable coordination.
- **clone_standby** creates **owned_repl LOGIN REPLICATION** and runs a real backup. **pg_basebackup
  -D** names the target, **-U** the replication user, **-c fast** the checkpoint request,
  **-X stream** includes required WAL, **-R** writes recovery settings, **-C -S** creates/names its
  slot, and **--manifest-checksums=SHA256 -v** adds file checksums and diagnostics.
  **pg_verifybackup** verifies the result before settings change. This first backup contains ID0.
- **standby.signal**, **primary_conninfo** and **primary_slot_name** request recovery from the
  named upstream through its slot. Private socket/name overrides distinguish endpoints;
  **hot_standby=on**, archive off,1s receiver status and100ms retry configure the copy.
  **pg_ctl -D -l -w -t20 start** names data/log paths and waits with a20s bound.
- **handover** is used in both directions. Close admission and prove a routed probe makes no DB
  attempt. **ALTER ROLE app_writer NOLOGIN** prevents new source logins; **pg_stat_activity** must
  show zero existing app sessions because NOLOGIN cannot stop them. A direct probe actually fails
  with role not permitted to log in.
- After admission closes, **pg_create_restore_point** generates a real WAL record-end boundary.
  **pg_control_system.system_identifier**, **pg_control_checkpoint.timeline_id**,
  **pg_is_in_recovery** and **current_setting('data_directory')** establish the expected source,
  candidate directory and physical roles. Source is checkpointed after promotion before its timeline
  is compared. Receiver **sender_host/received_tli/slot_name** matches the selected source history.
- **ready** requires **pg_last_wal_replay_lsn >= marker** and exact acknowledged receipt contents
  in a fresh query. **wait_for** polls this predicate with a20s deadline before transfer. Bare LSN
  comparison outside the checked topology/history is not an authorization rule. Domain correctness
  is checked independently of the transport's streaming label.
- Once the writer is closed and the candidate ready, clear candidate **primary_conninfo** with
  **ALTER SYSTEM**, reload using **pg_reload_conf**, and wait for its receiver to disappear.
  **pg_replication_slots.active** gates **pg_drop_replication_slot** on the outgoing source.
  Detaching this fully consumed stream permits slot cleanup before stopping the excluded writer;
  no app work can enter after the marker. No later shutdown-WAL delivery guarantee is assumed.
- **pg_ctl -m fast -w -t20 stop** stops the outgoing writer. The missing **postmaster.pid** and a
  direct endpoint INSERT that fails connecting establish exclusion before **pg_ctl promote**.
  Promotion is followed by recovery=false, a checkpoint, the next timeline and no standby.signal.
  Read the new **00000002.history/00000003.history** and verify the immediate parent timeline.
- **ALTER SYSTEM RESET primary_conninfo/primary_slot_name** removes obsolete receiver overrides.
  Enable app LOGIN only on the promoted target, move driver endpoint/epoch, and reject the old
  token with no DB attempt. The first transfer moves from original timeline1 to replacement2;
  receipt1 then acknowledges there.
- Rename the stopped original data to **retired-original-primary**, retaining its files and
  previously saved inventory. **clone_from** takes another complete verified backup from the
  replacement into the original data path. This is an explicit full rebuild, not a claim that the
  old files can simply restart on a different history. The new receiver uses **owned_failback**,
  the original socket and a pinned **recovery_target_timeline=2**. An actual INSERT fails25006.
- In optional hint2, **clone_from** takes a third verified backup from this recovering middle node,
  with **owned_cascade** created on that immediate upstream. Full-page writes, replication-role
  authentication and sender capacity allow the standby to serve the backup and WAL. Give the leaf
  its own socket/data/log, pin timeline2 and point its receiver at the middle node.
- **pg_wal_replay_pause** plus **pg_get_wal_replay_pause_state='paused'** freezes actual candidate
  apply before replacement receipt2 acknowledges. The shared ready predicate returns false; candidate
  rows remain0,1 while source rows are0,1,2 and the candidate remains in recovery. Then
  **pg_wal_replay_resume** and a bounded readiness gate permit catch-up.
- In the optional topology, the post-backup receipt2 and a real marker must reach the leaf too.
  **pg_stat_wal_receiver** proves replacement→middle and middle→leaf endpoints/timeline2;
  **pg_stat_replication** proves the middle's owned_cascade sender while it remains in recovery.
  The replacement has just its owned_failback sender. All three complete inventories match0,1,2.
  Stop the leaf, wait for its slot to become inactive on the middle and drop that slot before return.
  Cascading is asynchronous; this does not establish a synchronous acknowledgement from the leaf.
- The second handover closes the replacement writer and checks a new post-closure marker plus
  all receipts. Its login/session, source-stop, endpoint rejection and candidate promotion gates
  match the outbound transfer. The original endpoint becomes timeline3; epoch2 is now rejected.
- **ALTER SYSTEM RESET ALL** clears only this owned fixture's override file. Read
  **postgresql.auto.conf** and require comments/blank lines only; require zero replication slots.
  Stop/restart the returned primary, then require original socket, recovery=false, timeline3,
  empty receiver/synchronous-standby settings and absent standby.signal. The replacement remains
  stopped. Receipt3 acknowledges after that restart and the full final set is IDs0,1,2,3.
- **emit/json.dumps** retain each admission, inventory, exclusion, history and final-state report.
  The **finally** block stops the optional leaf, clears live receivers, removes only the three named
  owned slots once inactive, and stops both remaining owned nodes even after a failed gate.
  Stopped evidence directories remain; cleanup does not reset timeline3 back to1 or start the
  learner's original lab.`,
  code: failbackExperiment(false),
  expectedResult: code`
Outbound admission closes, direct old-source login is rejected, and candidate inventory contains
acknowledged ID0 behind the same-history marker. The source stops and rejects endpoint access before
promotion to timeline2; the old token is rejected without a DB attempt. Receipt1 acknowledges on
the replacement. A full verified backup rebuilds the original endpoint as a read-only follower.

While that candidate is paused, source receipt2 acknowledges, but candidate rows stay0,1 and the
shared readiness predicate refuses it. After resume, all0,1,2 agree. The return handover closes the
replacement writer, gates a new marker/inventory, drops its consumed slot and verifies old endpoint
exclusion before promotion. The original endpoint is now timeline3 with a history containing
parents1 and2; epoch2 is rejected. After clearing owned overrides and an actual restart, it remains
a primary on the original socket. Receipt3 acknowledges there and exact final IDs0,1,2,3 and notes
match all four acknowledgements. There are no probe99 rows, live replacement writers or slots.

Hint2 additionally proves replacement→middle→leaf streaming on timeline2, with the middle still in
recovery, only one direct replacement sender and exact IDs0,1,2 at every hop before return. Leaf and
its slot are stopped/released first. Both scripts finally stop all owned nodes and retain evidence.
Actual LSNs, system identifiers, timings and file sizes vary; neither transfer uses a fixed sleep
as readiness proof.`,
  systemsLens: code`
Failback is a second authority transfer with the same proof obligations as the first. Close the
writer set, establish the acknowledged-data boundary, exclude the outgoing writer and verify the
new role before accepting more work. Returning to a familiar address cannot replace those checks.
A cascade changes the transport path and resource obligations; it does not grant writer authority
or make an asynchronous leaf part of a synchronous commit guarantee.`,
  challenge: code`
Run the optional hint2 cascade variation. Before receipt2, predict which source each receiver and
sender should report, then verify that a later receipt crosses both hops while the middle remains
in recovery. Explain why the leaf's slot belongs to the middle and why it must be released before
that topology is dismantled. For a planned return to a preferred host, state the evidence needed
before each authority change and what policy applies if the readiness deadline expires.`,
};
