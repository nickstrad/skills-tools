import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function twoPhaseExperiment(loseBeforeDecision: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\nlose_before_decision = ${loseBeforeDecision ? "True" : "False"}\n` + code`
import sqlite3,sys
peer_data,peer_sock,peer_log=root/'participant-b',root/'participant-b-socket',root/'participant-b.log'
peer_sock.mkdir()
if os.geteuid()==0:
    os.chown(peer_sock,owner.pw_uid,owner.pw_gid)
peer_env=dict(env,PGHOST=str(peer_sock))
coordinators=[];probes=[]
operation='transfer-1';payload=dict(source='A',destination='B',amount=25)

# A separately executed coordinator: persisted decision first, participant finalization second.
coordinator_program=r'''
import json,pathlib,sqlite3,subprocess,sys
spec=json.loads(pathlib.Path(sys.argv[1]).read_text());mode=sys.argv[2]
root=pathlib.Path(spec['root'])
def emit(label,value):
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
def quote(value):
    return "'"+str(value).replace("'","''")+"'"
def query(part,command):
    result=subprocess.run([spec['psql'],'-X','-At','-v','ON_ERROR_STOP=1','-c',command],
        env=dict(spec['env'],PGHOST=part['host'],PGPORT=part['port']),text=True,capture_output=True,timeout=15)
    assert result.returncode==0,result.stdout+result.stderr
    return result.stdout.strip()
def connect():
    db=sqlite3.connect(spec['decision_log'],isolation_level=None,timeout=5)
    assert db.execute('PRAGMA journal_mode=DELETE').fetchone()[0]=='delete'
    db.execute('PRAGMA synchronous=FULL')
    assert db.execute('PRAGMA synchronous').fetchone()[0]==2
    return db
def record(db):
    row=db.execute('select operation,payload,participants,decision from operations').fetchall()
    assert len(row)==1
    operation,payload,parts,decision=row[0]
    assert operation==spec['operation'] and json.loads(payload)==spec['payload']
    assert json.loads(parts)==spec['participants']
    return decision
def expected_receipt(part,decision):
    delta=part['delta'] if decision=='COMMIT' else 0
    return dict(operation=spec['operation'],gid=part['gid'],participant=part['name'],
        payload=spec['payload'],decision=decision,delta=delta,balance_after=100+delta)
def receipt(part):
    return json.loads(query(part,"select coalesce(json_agg(r),'[]') from outcomes r"))
def prepared(part):
    return json.loads(query(part,"select coalesce(json_agg(gid),'[]') from pg_prepared_xacts"))
def resolve(part,decision):
    assert query(part,'select system_identifier from pg_control_system()')==part['system_identifier']
    pending=prepared(part);assert pending in [[],[part['gid']]],pending
    if decision=='COMMIT':
        action='commit_prepared' if pending else 'verify_committed_receipt'
        if pending: query(part,'COMMIT PREPARED '+quote(part['gid']))
    else:
        action='rollback_prepared' if pending else 'verify_or_record_abort'
        if pending: query(part,'ROLLBACK PREPARED '+quote(part['gid']))
        # Record a stable ABORT outcome after rollback. Reentry checks its complete payload.
        query(part,"insert into outcomes values("+quote(spec['operation'])+','+quote(part['gid'])+','+
            quote(part['name'])+','+quote(json.dumps(spec['payload']))+"::jsonb,'ABORT',0,100) "
            'on conflict(operation) do nothing')
    expected=expected_receipt(part,decision)
    assert receipt(part)==[expected],dict(participant=part['name'],receipt=receipt(part),expected=expected)
    assert query(part,'select balance from account where id=1')==str(expected['balance_after'])
    assert prepared(part)==[]
    return dict(participant=part['name'],action=action,outcome=expected)

db=connect()
if mode=='start':
    db.execute('BEGIN IMMEDIATE')
    db.execute('insert into operations(operation,payload,participants,decision) values(?,?,?,NULL)',
        (spec['operation'],json.dumps(spec['payload'],sort_keys=True),json.dumps(spec['participants'],sort_keys=True)))
    db.commit()
    for part in spec['participants']:
        assert query(part,'select system_identifier from pg_control_system()')==part['system_identifier']
        delta=part['delta']
        query(part,"BEGIN; update account set balance=balance+("+str(delta)+") where id=1; "
            "insert into outcomes select "+quote(spec['operation'])+','+quote(part['gid'])+','+quote(part['name'])+','+
            quote(json.dumps(spec['payload']))+"::jsonb,'COMMIT',"+str(delta)+",balance from account where id=1; "
            'PREPARE TRANSACTION '+quote(part['gid'])+';')
        assert prepared(part)==[part['gid']]
    emit('coordinator-prepared',dict(decision=record(db),participants=spec['participants']))
    assert sys.stdin.readline().strip()=='DECIDE'
    db.execute('BEGIN IMMEDIATE')
    db.execute("update operations set decision='COMMIT' where decision is null")
    if spec['lose_before_decision']:
        emit('coordinator-boundary',dict(local_uncommitted_decision=record(db),decision_transaction_open=db.in_transaction))
    else:
        db.commit();assert record(db)=='COMMIT'
        first=resolve(spec['participants'][0],'COMMIT')
        emit('coordinator-boundary',dict(durable_decision='COMMIT',first=first))
    assert sys.stdin.readline().strip()=='EXIT'
else:
    db.execute('BEGIN IMMEDIATE')
    decision=record(db)
    if decision is None:
        db.execute("update operations set decision='ABORT' where decision is null")
        decision='ABORT'
    db.commit();assert record(db)==decision
    emit(mode+'-decision',dict(decision=decision,synchronous=db.execute('PRAGMA synchronous').fetchone()[0]))
    if mode=='recover': assert sys.stdin.readline().strip()=='RESOLVE'
    actions=[resolve(part,decision) for part in spec['participants']]
    emit(mode+'-outcomes',actions)
db.close()
'''

def quote(value):
    return "'"+str(value).replace("'","''")+"'"

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def target(part):
    return env if part=='A' else peer_env

def query(part,command):
    result=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',command],
        env=target(part),text=True,capture_output=True,timeout=15)
    assert result.returncode==0,result.stdout+result.stderr
    return result.stdout.strip()

def rows(part,table,order):
    return json.loads(query(part,"select coalesce(json_agg(r order by "+order+"),'[]') from "+table+' r'))

def inventory():
    return {part:dict(account=rows(part,'account','id'),outcomes=rows(part,'outcomes','operation'),
        prepared=json.loads(query(part,"select coalesce(json_agg(r),'[]') from (select gid,transaction::text as xid,"
            'prepared,owner,database from pg_prepared_xacts order by gid) r'))) for part in ['A','B']}

def decision():
    db=sqlite3.connect(root/'decisions.sqlite',timeout=5)
    result=db.execute('select operation,payload,participants,decision from operations').fetchall();db.close()
    assert len(result)==1
    op,pay,parts,value=result[0]
    assert op==operation and json.loads(pay)==payload and json.loads(parts)==spec['participants']
    return value

def launch(mode):
    output=(root/(mode+'-coordinator.log')).open('w')
    process=subprocess.Popen([sys.executable,str(root/'coordinator.py'),str(root/'spec.json'),mode],
        stdin=subprocess.PIPE,stdout=output,stderr=subprocess.STDOUT,text=True)
    item=dict(process=process,output=output,mode=mode);coordinators.append(item)
    return item

def reached(item,label):
    def check():
        assert item['process'].poll() is None,(root/(item['mode']+'-coordinator.log')).read_text()
        path=root/(label+'.json')
        if not path.exists(): return None
        try: return json.loads(path.read_text())
        except json.JSONDecodeError: return None
    return wait_for(label,check)

def send(item,value):
    item['process'].stdin.write(value+'\n');item['process'].stdin.flush()

def finish(item):
    assert item['process'].wait(timeout=15)==0,(root/(item['mode']+'-coordinator.log')).read_text()
    item['output'].close()

def probe(part,label):
    before=inventory();gid=operation+':'+part
    prepared_row=[r for r in before[part]['prepared'] if r['gid']==gid][0]
    output=(root/(label+'.log')).open('w')
    process=subprocess.Popen([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
        '-c',"BEGIN; SET LOCAL lock_timeout='1500ms'; UPDATE account SET balance=balance WHERE id=1; ROLLBACK;"],
        env=dict(target(part),PGAPPNAME=label),stdout=output,stderr=subprocess.STDOUT,text=True)
    probes.append(dict(process=process,output=output))
    def blocked():
        data=json.loads(query(part,"select row_to_json(a) from (select pid,wait_event_type,wait_event,pg_blocking_pids(pid) as blockers "
            'from pg_stat_activity where application_name='+quote(label)+') a'))
        return data if data and data['wait_event_type']=='Lock' and data['wait_event']=='transactionid' else None
    waiter=wait_for('prepared participant blocks writer',blocked,seconds=4)
    locks=json.loads(query(part,"select coalesce(json_agg(r),'[]') from (select pid,mode,granted,transactionid::text as xid "
        "from pg_locks where locktype='transactionid' and transactionid="+quote(prepared_row['xid'])+'::xid) r'))
    assert any(r['pid'] is None and r['granted'] and r['mode']=='ExclusiveLock' for r in locks)
    assert any(r['pid']==waiter['pid'] and not r['granted'] and r['mode']=='ShareLock' for r in locks)
    assert 0 in waiter['blockers'],waiter
    assert process.wait(timeout=5)!=0;output.close()
    errors=(root/(label+'.log')).read_text()
    assert '55P03:' in errors and 'lock timeout' in errors,errors
    assert inventory()==before
    emit(label,dict(waiter=waiter,prepared=prepared_row,locks=locks,sqlstate='55P03',state_unchanged=True))

def vacuum(label,protected):
    result=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c','VACUUM (VERBOSE) junk'],
        env=env,text=True,capture_output=True,timeout=10)
    assert result.returncode==0,result.stderr
    (root/(label+'.log')).write_text(result.stdout+result.stderr)
    assert ('250 are dead but not yet removable' if protected else '250 removed') in result.stderr,result.stderr
    stats=json.loads(sql("select row_to_json(s) from (select tuple_count,dead_tuple_count from pgstattuple('junk')) s"))
    assert stats==dict(tuple_count=250,dead_tuple_count=250 if protected else 0),stats
    emit(label,dict(stats=stats,verbose=result.stderr.strip()))

def peer_start():
    server('pg_ctl','-D',peer_data,'-l',peer_log,'-w','-t','20','start',timeout=25)
    assert query('B',"select current_setting('data_directory')")==str(peer_data)

def peer_stop():
    if (peer_data/'postmaster.pid').exists():
        server('pg_ctl','-D',peer_data,'-m','fast','-w','-t','20','stop',timeout=25)

try:
    with (data/'postgresql.conf').open('a') as config:
        config.write('\nmax_prepared_transactions=4\nautovacuum=off\n')
    server('initdb','-D',peer_data,'-U','postgres','--auth-local=trust','--auth-host=reject',
        '--no-locale','--data-checksums','--wal-segsize=1')
    with (peer_data/'postgresql.conf').open('a') as config:
        config.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='"+str(peer_sock)+"'\n"
            "shared_buffers='16MB'\nmax_connections=10\nmax_prepared_transactions=4\nautovacuum=off\n"
            "fsync=on\nsynchronous_commit=on\nfull_page_writes=on\nmin_wal_size='2MB'\nmax_wal_size='8MB'\n"
            "checkpoint_timeout='1h'\nlogging_collector=off\nlog_checkpoints=on\n")
    start();peer_start()
    parts=[]
    for part,delta in [('A',-25),('B',25)]:
        query(part,'''create table account(id int primary key,balance int not null check(balance>=0));
insert into account values(1,100);
create table outcomes(operation text primary key,gid text unique not null,participant text not null,
 payload jsonb not null,decision text not null check(decision in ('COMMIT','ABORT')),
 delta int not null,balance_after int not null);''')
        assert query(part,'show max_prepared_transactions')=='4'
        parts.append(dict(name=part,host=target(part)['PGHOST'],port='6543',gid=operation+':'+part,
            system_identifier=query(part,'select system_identifier from pg_control_system()'),delta=delta))
    assert parts[0]['system_identifier']!=parts[1]['system_identifier']
    sql('create extension pgstattuple; create table junk(id int primary key); insert into junk select generate_series(1,500)')
    spec=dict(root=str(root),psql=str(bindir/'psql'),env=env,decision_log=str(root/'decisions.sqlite'),
        operation=operation,payload=payload,participants=parts,lose_before_decision=lose_before_decision)
    (root/'spec.json').write_text(json.dumps(spec));(root/'coordinator.py').write_text(coordinator_program)
    db=sqlite3.connect(root/'decisions.sqlite',isolation_level=None)
    assert db.execute('PRAGMA journal_mode=DELETE').fetchone()[0]=='delete'
    db.execute('PRAGMA synchronous=FULL')
    db.execute("create table operations(operation text primary key,payload text not null,participants text not null,"
        "decision text check(decision in ('COMMIT','ABORT')))")
    db.execute("create trigger decision_immutable before update of decision on operations when old.decision is not null "
        "and new.decision is not old.decision begin select raise(ABORT,'decision is immutable'); end")
    emit('configuration',dict(participants=parts,sqlite_version=sqlite3.sqlite_version,
        synchronous=db.execute('PRAGMA synchronous').fetchone()[0],journal_mode=db.execute('PRAGMA journal_mode').fetchone()[0],
        postgres={p:{k:query(p,'show '+k) for k in ['server_version','max_prepared_transactions','fsync','synchronous_commit','full_page_writes']} for p in ['A','B']},
        loss_boundary='before_decision_commit' if lose_before_decision else 'after_first_participant_commit'))
    db.close()
    initial=inventory();emit('initial',initial)
    coordinator=launch('start');reached(coordinator,'coordinator-prepared')
    prepared_before=inventory();assert decision() is None
    for part in ['A','B']:
        assert prepared_before[part]['account']==[dict(id=1,balance=100)] and prepared_before[part]['outcomes']==[]
        assert len(prepared_before[part]['prepared'])==1
        assert query(part,"select count(*) from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid()")=='0'
    emit('both-prepared-no-decision',prepared_before)
    probe('A','prepared-before-crash')
    sql('delete from junk where id<=250');vacuum('vacuum-before-crash',True)
    # Participant A really crashes while detached prepared state remains undecided.
    offset=log.stat().st_size
    server('pg_ctl','-D',data,'-m','immediate','-w','-t','20','stop',timeout=25);start()
    recovery_log=log.read_text()[offset:];(root/'participant-crash-recovery.log').write_text(recovery_log)
    assert 'automatic recovery in progress' in recovery_log and 'recovering prepared transaction' in recovery_log,recovery_log
    assert inventory()==prepared_before
    emit('prepared-after-crash',inventory());probe('A','prepared-after-crash-wait');vacuum('vacuum-after-crash',True)
    send(coordinator,'DECIDE');boundary=reached(coordinator,'coordinator-boundary')
    visible_decision=decision();partial=inventory()
    if lose_before_decision:
        assert boundary['local_uncommitted_decision']=='COMMIT' and boundary['decision_transaction_open']
        assert visible_decision is None and partial==prepared_before
    else:
        assert visible_decision=='COMMIT' and partial['A']['prepared']==[] and len(partial['B']['prepared'])==1
        assert partial['A']['account']==[dict(id=1,balance=75)] and partial['B']['account']==[dict(id=1,balance=100)]
        assert partial['A']['outcomes'][0]['decision']=='COMMIT' and partial['B']['outcomes']==[]
    emit('before-coordinator-loss',dict(decision=visible_decision,participants=partial,boundary=boundary))
    assert coordinator['process'].poll() is None
    coordinator['process'].kill();assert coordinator['process'].wait(timeout=5)==-9;coordinator['output'].close()
    assert decision()==visible_decision and inventory()==partial
    emit('after-coordinator-loss',dict(client_exit=-9,decision=decision(),participants=inventory()))
    probe('B','prepared-after-coordinator-loss')
    recovery=launch('recover');reached(recovery,'recover-decision')
    chosen='ABORT' if lose_before_decision else 'COMMIT'
    assert decision()==chosen and inventory()==partial
    emit('recovery-decision-before-resolution',dict(decision=decision(),participants=inventory()))
    send(recovery,'RESOLVE');finish(recovery)
    final=inventory();emit('resolved',dict(decision=decision(),participants=final))
    for part,delta in [('A',-25),('B',25)]:
        actual_delta=0 if lose_before_decision else delta
        expected=dict(operation=operation,gid=operation+':'+part,participant=part,payload=payload,
            decision=chosen,delta=actual_delta,balance_after=100+actual_delta)
        assert final[part]==dict(account=[dict(id=1,balance=100+actual_delta)],outcomes=[expected],prepared=[])
        assert query(part,'select count(*) from pg_locks where pid is null')=='0'
        assert query(part,"select count(*) from pg_locks where not granted")=='0'
        # A fresh competing transaction now acquires the formerly blocked account immediately.
        query(part,'BEGIN; update account set balance=balance where id=1; ROLLBACK;')
    assert sum(final[p]['account'][0]['balance'] for p in ['A','B'])==200
    vacuum('vacuum-after-resolution',False)
    repeat=launch('repeat');finish(repeat);assert inventory()==final and decision()==chosen
    emit('repeat-recovery-unchanged',dict(decision=decision(),participants=inventory()))
    stop();peer_stop();start();peer_start()
    for part in parts:
        assert query(part['name'],'select system_identifier from pg_control_system()')==part['system_identifier']
    assert inventory()==final and decision()==chosen
    restarted=launch('restarted');finish(restarted);assert inventory()==final and decision()==chosen
    emit('final-after-restarts',dict(decision=decision(),participants=inventory()))
    db=sqlite3.connect(root/'decisions.sqlite');assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close()
finally:
    for item in coordinators+probes:
        if item['process'].poll() is None:
            item['process'].kill();item['process'].wait(timeout=5)
        item['output'].close()
    # On an assertion failure preserve unresolved prepared state in these stopped private data dirs.
    stop();peer_stop()
    emit('cleanup',dict(participant_a_stopped=not (data/'postmaster.pid').exists(),
        participant_b_stopped=not (peer_data/'postmaster.pid').exists(),
        coordinator_exits=[i['process'].returncode for i in coordinators],probe_exits=[i['process'].returncode for i in probes]))
print('Inspected prepared participants, durable decision and recovery; evidence:',root,flush=True)

PY
`;
}

export const TWOPC_CORE = twoPhaseExperiment(false);
export const TWOPC_VARIATION = twoPhaseExperiment(true);

export const TWO_PHASE_COMMIT: Draft = {
  slug: "two-phase-commit",
  title: "Two-phase commit: recover prepared participants from a durable decision",
  revision: 4,
  tags: ["two-phase-commit", "transactions", "durability", "gc-horizon", "recovery"],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 3 "Pages and Tuples".`,
  difficulty: "advanced",
  safetyLevel: "dangerous",
  runIn: "shell",
  sessions: 3,
  estimatedMinutes: 60,
  prerequisites: ["crash-and-redo", "xmin-horizon-blocks-cleanup", "idempotency-keys"],
  overview: code`
Preparing a transaction makes one participant able to finish later, but does not decide what a
multi-database operation should do. Prepare a debit and credit in two independent PostgreSQL
processes, inspect their detached locks and cleanup horizon, and crash one participant while the
operation remains undecided. A separate Python coordinator then records its decision in SQLite;
you will kill it at an incomplete-finalization boundary and recover from that persisted decision.
Full participant receipts distinguish a completed outcome from merely missing prepared state.`,
  syntaxBreakdown: code`
### In plain terms

Participant A promises a debit25 and B promises a credit25, both starting at100. PREPARE makes
those promises survive session exit and a participant crash while leaving changes invisible and
locks held. The coordinator must commit its decision before telling either participant to finish.
After coordinator loss, a new process reads that decision and verifies every outcome; it cannot
infer a commit just because a GID disappeared. The supplied driver exposes each boundary so you can
choose a recovery policy from evidence instead of implementing a transaction manager from scratch.

### What you are learning

- A prepared transaction has a durable global identifier, no owning client and unresolved effects.
  It keeps locks and can hold back cleanup until another session resolves it.
- A participant's prepared promise differs from the coordinator's committed decision. A locally
  written but uncommitted decision is lost when the coordinator dies.
- Recovery uses the same operation identity, participant set, payload and irrevocable decision.
  Full outcome receipts establish what already happened and prevent reapplying the transfer.
- Participant finalization is separate in each database. Independent reads can see an intermediate
  debit without its credit; the protocol does not provide a shared cross-database read snapshot.

### Piece by piece

- The quoted Python heredoc runs a complete private fixture. pg_config --bindir or PGBIN finds the
  PostgreSQL executables. tempfile.mkdtemp allocates only this run's /tmp/pg-owned-* evidence root;
  pwd and chown select its owner, and root uses runuser -u for server commands. The data and
  participant-b directories are separate initialized databases with distinct system identifiers.
- initdb -D chooses the directory; -U creates postgres, --auth-local=trust permits the owned socket,
  --auth-host=reject rejects host authentication, --no-locale fixes locale, --data-checksums enables
  checksums and --wal-segsize=1 uses small MiB WAL segments. listen_addresses='' disables TCP;
  each unix_socket_directories path is private, and port6543 names each separate socket. Inherited
  PG variables are cleared; PGHOST, PGPORT, PGUSER and PGDATABASE select the intended endpoint.
  PGCONNECT_TIMEOUT=3 bounds setup, LC_ALL=C stabilizes diagnostics and PGOPTIONS bounds ordinary
  statements to five seconds and lock waits to one second.
- max_prepared_transactions=4 reserves prepared-transaction capacity when each server starts; the
  setting needs startup, so the fixture writes it before launch. autovacuum=off keeps the small
  cleanup comparison under the driver's control. shared_buffers=16MB and max_connections=10 bound
  resources; fsync, synchronous_commit and full_page_writes remain on. Small min/max_wal_size and
  one-hour checkpoint_timeout bound WAL policy. The source helper retains wal_level=replica;
  logging_collector=off and log_checkpoints=on leave ordinary server evidence in the named logs.
- pg_ctl -D -l -w -t20 starts the chosen server and waits for readiness with its log. SHOW reads
  effective settings and pg_control_system().system_identifier verifies endpoint identity.
  A's stop -m immediate deliberately crashes that owned participant; starting it performs crash
  recovery. The log must show automatic recovery and recovery of prepared state. Normal -m fast
  stops at the end support a separate ordinary-restart check. No shared learner server is used.
- psql -X ignores startup customization; -At returns unaligned tuples, -v ON_ERROR_STOP=1 stops on
  SQL failure and -v VERBOSITY=verbose includes SQLSTATE. Python subprocess argument arrays, timeouts,
  stdout/stderr capture and exit checks bound external work. Popen launches actual independent
  coordinator and blocking-probe processes; stdin markers pause the coordinator between stages.
  Independent queries establish the state rather than treating a printed marker as proof of commit.
- account has a nonnegative balance CHECK. outcomes has an operation PRIMARY KEY, a UNIQUE GID,
  participant name, full JSONB transfer payload, decision, applied delta and resulting balance.
  The registered operation is transfer-1 with sourceA, destinationB and amount25. GIDs transfer-1:A
  and transfer-1:B remain stable throughout retries; the participant descriptors retain private
  endpoints, expected system identifiers and deltas. Recovery verifies those descriptors and rows.
- Python sqlite3 creates a separate decisions.sqlite. PRAGMA journal_mode=DELETE selects rollback
  journaling; synchronous=FULL, read back as2 on every coordinator connection, synchronizes commits.
  BEGIN IMMEDIATE acquires the SQLite write transaction; parameterized SQL persists the operation,
  payload and complete participant set before preparation. A nullable decision means not yet decided.
  A trigger uses RAISE(ABORT,...) to reject changing an already non-null decision. commit() is the
  actual decision boundary; a SELECT in a separate connection shows what other processes can recover.
  PRAGMA integrity_check verifies the decision file at the end. This experiment tests process loss,
  not whether the underlying host/storage honors every power-loss durability assumption.
- The coordinator's first PostgreSQL transaction UPDATEs the local balance and INSERTs its complete
  COMMIT outcome, then PREPARE TRANSACTION detaches it under the registered GID. A's receipt carries
  delta-25/result75; B's carries delta25/result125. They are uncommitted and invisible to independent
  reads until resolved. Prepared SQL is executed before the short psql client exits; the Python
  coordinator then waits without holding either database connection.
- pg_prepared_xacts records gid, transaction (captured as xid text), prepared time, owner and
  database. pg_stat_activity proves no other client connection remains after preparation. These
  are participant promises, while the separately read SQLite decision is still null.
- A real competing UPDATE account SET balance=balance tries to acquire the protected row. Its
  BEGIN and SET LOCAL lock_timeout='1500ms' bound this attempt; PGAPPNAME labels its backend.
  pg_stat_activity must show Lock/transactionid. pg_blocking_pids includes0 for a prepared blocker;
  pg_locks on the captured XID must show a granted ExclusiveLock with null PID and the waiter's
  ungranted ShareLock. The probe actually fails55P03/lock timeout, exits and rolls back. Full account,
  receipt and prepared inventories must remain identical. Probe again after the participant crash
  and against B after coordinator loss.
- CREATE EXTENSION pgstattuple supplies physical tuple counts. A separate junk table gets500 rows
  from generate_series; DELETE commits removal of250 while A's older prepared XID remains. VACUUM
  (VERBOSE) reports250 dead but not yet removable, and pgstattuple records250 live/250 dead. The same
  comparison after A's crash still shows the retained250. Resolving the prepared transaction allows
  a final vacuum to remove250, leaving250 live/0 dead. This holds back reclamation; it does not mean
  all vacuum work everywhere has stopped.
- In core the coordinator commits SQLite's COMMIT decision, issues COMMIT PREPARED for A outside a
  transaction block, verifies A's outcome, then pauses before resolving B. Independent reads show
  durable COMMIT, A75 with a full COMMIT receipt and no prepared GID, and B100 with its prepared GID
  but no visible receipt. Popen.kill sends SIGKILL to that live coordinator; wait reaps exit-9. Those
  data remain, and B still blocks a writer. The temporary visible sum175 exposes partial finalization.
- The variation moves only the loss boundary: the coordinator UPDATEs its SQLite decision to
  COMMIT inside BEGIN IMMEDIATE but does not commit. Its own read sees COMMIT; an independent read
  sees null. Both PostgreSQL participants remain prepared at visible100/100. SIGKILL loses the
  uncommitted decision, and a fresh SQLite connection still reads null. A tentative local value is
  not a durable authorization to finalize participants.
- A new recover process opens BEGIN IMMEDIATE. An existing COMMIT must be obeyed; if the registered
  operation has no decision, this known-single-coordinator recovery policy durably records ABORT.
  The driver pauses recovery after that decision commit and independently verifies it while the
  participant states are still unresolved. Only RESOLVE permits participant finalization. This
  ordering assumes the previous coordinator is known dead; it does not elect a coordinator or fence
  another live writer during a partition.
- COMMIT PREPARED finishes a pending commit participant. If its GID is already absent, recovery
  requires the complete matching COMMIT receipt and resulting balance; missing prepared state alone
  is never accepted as commit evidence. ROLLBACK PREPARED discards tentative receipt/effect for an
  ABORT; a subsequent transaction INSERTs an explicit zero-delta ABORT outcome. ON CONFLICT DO
  NOTHING makes that outcome recording repeatable, and full-row comparison rejects inconsistent
  payloads or decisions. Retrying after rollback but before recording ABORT is safe here because
  the durable decision and registered participant set are retained and all writers obey them.
- json_agg with ordering and coalesce(...,'[]') records complete account/outcome/prepared inventories;
  row_to_json captures diagnostics. Assertions compare operation, GID, participant, JSONB payload,
  decision, delta and saved balance, require total200 after resolution and check no null-PID or
  waiting locks remain. A fresh UPDATE followed by ROLLBACK acquires each formerly blocked account.
  No extra debit is issued by recovery: it resolves the original prepared work or verifies a receipt.
- Two further independent recovery processes repeat the same decision, first immediately and then
  after both normal server restarts. They must leave all data unchanged with no prepared GIDs.
  finally reaps only this run's processes and stops both private servers. On an assertion failure it
  preserves unresolved prepared state in the stopped evidence directories for diagnosis, instead of
  inventing an outcome. Successful runs leave neither prepared work nor blocked probes.`,
  code: TWOPC_CORE,
  expectedResult: code`
Both participants prepare under transfer-1:A/B and disconnect their SQL clients. Independent balances
remain100/100, outcome tables are empty and SQLite has no decision. A's competing writer actually
waits on the prepared XID, with a null-PID ExclusiveLock and its own ungranted ShareLock; it fails
55P03/lock timeout. Vacuum retains250 dead junk rows. A's immediate-stop crash and WAL recovery
preserve the same GID/XID/prepared timestamp and invisible account state. The writer still times out,
and vacuum still retains250 dead rows.

Core then commits COMMIT to SQLite and resolves only A. Before and after the actual coordinator
kill, A is75 with its full COMMIT outcome and no prepared GID; B is100 with an unresolved GID and no
visible outcome. SQLite still says COMMIT, the coordinator exits-9, and B still blocks a writer.
Recovery independently reads that decision before resolution, verifies A's receipt and commits B's
prepared credit. Final75/125 totals200; both receipts match the operation/payload, deltas-25/+25 and
saved balances. Missing GIDs are accompanied by verified receipts, not treated as proof by themselves.

The variation kills the coordinator after it writes COMMIT locally but before its SQLite commit.
Its own transaction reads COMMIT while an independent reader sees null. Loss leaves both participants
prepared at visible100/100 and no durable decision. Recovery commits ABORT before rolling back either
participant. It then records matching ABORT outcomes with zero deltas and results100/100. The final
sum is200 with no transfer applied.

Either outcome releases all prepared/waiting locks; fresh competing updates acquire both accounts.
The next vacuum removes250 dead rows. Immediate repeat recovery and recovery after both normal
server restarts preserve complete account/receipt/decision state without duplicate effects. All
prepared lists end empty, SQLite integrity_check returns ok, the four coordinator processes exit
-9/0/0/0, and all three bounded probes fail only with their expected lock-timeout errors. Timing,
PIDs, XIDs, paths, identifiers and vacuum cost counters vary. Participant decisions are consistent
on completion, but independent reads can see partial finalization during recovery.`,
  systemsLens: code`
A durable promise to finish and a durable decision about what to finish are different records.
Prepared participants exchange availability for the ability to honor a later decision: they retain
locks and cleanup horizons when the coordinator is absent. Recovery must preserve the registered
operation and payload, obey a committed decision and verify each local outcome. This known-set,
one-coordinator experiment does not supply consensus, coordinator election, heuristic resolution,
cross-database snapshot isolation or independent-host durability.`,
  challenge: code`
Predict the independent SQLite read and both participant states when the coordinator is killed
before its decision transaction commits. Run the complete hint2 variation and compare it with core's
loss after A finalizes. Identify the evidence authorizing COMMIT versus ABORT, and explain why
recovery may not choose a new outcome after a durable COMMIT. Specify what evidence and authority an
operator needs to resolve an orphaned prepared GID; explain why a missing GID or a timed-out caller
is insufficient. Use the temporary sum175, blocked writer and retained250 rows to describe the
availability and observation costs of this protocol.`,
  caution: code`
Run the complete block in a shell with Python3 (including sqlite3), PostgreSQL16 server tools and
pgstattuple available. It creates two private Unix-socket clusters, crashes participant A, kills its
own coordinator process and deliberately holds prepared transactions briefly. It stops both servers
and retains the printed evidence directory. Successful completion resolves all prepared work; if an
assertion fails, inspect the retained decision and participant records before choosing an outcome.
No real learner cluster, learner progress or port5440 is used.`,
};
