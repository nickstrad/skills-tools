import { code, type Draft } from "../../../src/types.ts";

export const CANCEL_PROGRAM = code`
import fcntl, json, os, pathlib, pwd, shutil, subprocess, sys, tempfile, time, uuid

phase=sys.argv[1]
assert phase in ('survey','inspect','apply','cleanup')
if phase=='survey':
    scope=sys.argv[2] if len(sys.argv)>2 else 'explicit'
    assert scope in ('explicit','autocommit')
    assert shutil.disk_usage('/tmp').free>2*1024**3,'Keep at least2GB free'
    root=pathlib.Path(tempfile.mkdtemp(prefix='pg-owned-',dir='/tmp'))
    owner=pwd.getpwnam('postgres') if os.geteuid()==0 else pwd.getpwuid(os.geteuid())
    if os.geteuid()==0:os.chown(root,owner.pw_uid,owner.pw_gid)
    (root/'cancel.py').write_text(pathlib.Path(__file__).read_text())
    pathlib.Path(str(__file__)+'.location').write_text(str(root/'cancel.py'))
    config=dict(root=str(root),owner=owner.pw_name,scope=scope,
        bindir=os.environ.get('PGBIN') or subprocess.check_output(['pg_config','--bindir'],text=True).strip())
    (root/'fixture.json').write_text(json.dumps(config))
else:
    root=pathlib.Path(__file__).resolve().parent
    config=json.loads((root/'fixture.json').read_text())
    assert str(root)==config['root'] and root.parent==pathlib.Path('/tmp') and root.name.startswith('pg-owned-')
    owner=pwd.getpwnam(config['owner'])
lock=(root/'phase.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
bindir=pathlib.Path(config['bindir']);data=root/'data';sock=root/'socket'
prefix=['runuser','-u',owner.pw_name,'--'] if os.geteuid()==0 else []
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST=str(sock),PGPORT='6543',PGUSER='postgres',PGDATABASE='postgres',
    PGCONNECT_TIMEOUT='3',PGOPTIONS='-c statement_timeout=5000 -c lock_timeout=0',LC_ALL='C')
clients=[]

def run(args,expected=0):
    p=subprocess.run(args,env=env,capture_output=True,text=True,timeout=15)
    assert p.returncode==expected,p.stdout+p.stderr
    return p

def utility(name,*args):return run(prefix+[str(bindir/name),*map(str,args)]).stdout.strip()
def sql(query):return run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',query]).stdout.strip()
def save(name,value):
    (root/(name+'.json')).write_text(json.dumps(value,indent=2));return value

def read(name):return json.loads((root/(name+'.json')).read_text())
def wait(label,predicate,seconds=2):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        result=predicate()
        if result:return result
        time.sleep(.02)
    raise RuntimeError('Timeout: '+label)

def stopped():
    assert not (data/'postmaster.pid').exists()
    run(prefix+[str(bindir/'pg_ctl'),'-D',str(data),'status'],3)

def stop():
    if (data/'postmaster.pid').exists():utility('pg_ctl','-D',data,'-m','fast','-w','-t','10','stop')
    if data.exists():stopped()

def start():
    stopped();utility('pg_ctl','-D',data,'-l',root/'server.log','-w','-t','10','start')
    assert sql('show data_directory')==str(data)

class Client:
    def __init__(self,name):
        self.name=name;self.app='incident_'+phase+'_'+name+'_'+uuid.uuid4().hex[:12]
        self.path=root/(phase+'-'+name+'.log');self.output=self.path.open('wb')
        self.proc=subprocess.Popen([str(bindir/'psql'),'-X','-q','-At','-v','ON_ERROR_STOP=0','-v','VERBOSITY=verbose'],
            env=dict(env,PGAPPNAME=self.app),stdin=subprocess.PIPE,stdout=self.output,stderr=subprocess.STDOUT)
        clients.append(self)
        self.pid=int(self.send('select pg_backend_pid();').strip())
        self.send("set idle_in_transaction_session_timeout='8s';")
    def begin(self,query):
        token='DONE_'+uuid.uuid4().hex
        offset=self.path.stat().st_size
        self.proc.stdin.write((query+'\n\\echo '+token+'\n').encode());self.proc.stdin.flush()
        return token,offset
    def finish(self,mark,disconnect=False):
        token,offset=mark;deadline=time.monotonic()+2
        while time.monotonic()<deadline:
            text=self.path.read_text()[offset:]
            if token in text:return text.split(token)[0].strip()
            if self.proc.poll() is not None:
                assert disconnect,text
                return text
            time.sleep(.01)
        raise RuntimeError('Client response deadline: '+self.name)
    def send(self,query):return self.finish(self.begin(query))
    def close(self):
        killed=False
        if self.proc.poll() is None:
            try:self.proc.communicate(b'\\q\n',timeout=1)
            except (subprocess.TimeoutExpired,BrokenPipeError):
                killed=True;self.proc.kill();self.proc.wait(timeout=2)
        self.output.close()
        assert self.proc.poll() is not None
        return dict(name=self.name,application_name=self.app,client_pid=self.proc.pid,
            returncode=self.proc.returncode,forced_client_kill=killed)


def activity(client):
    return json.loads(sql("select coalesce(json_agg(r),'[]') from (select pid,application_name,state,wait_event_type,wait_event,"
        "pg_blocking_pids(pid) as blockers,backend_xid::text,backend_xmin::text,query_start,xact_start,left(query,160) as query from pg_stat_activity "
        "where pid="+str(client.pid)+" and application_name='"+client.app+"') r"))

def signal(client,kind):
    assert kind in ('cancel','terminate')
    result=sql('select pg_'+kind+"_backend(pid) from pg_stat_activity where pid="+str(client.pid)+
        " and application_name='"+client.app+"' and datname='postgres' and backend_type='client backend'")
    assert result=='t','Identity changed or signal rejected: '+client.name
    return dict(pid=client.pid,application_name=client.app,kind=kind,signal_sent=True)

def cpu(client):
    # Linux backend CPU ticks, independent of pg_stat_activity's wait snapshot.
    fields=pathlib.Path('/proc/'+str(client.pid)+'/stat').read_text().rsplit(')',1)[1].split()
    return (int(fields[11])+int(fields[12]))/os.sysconf('SC_CLK_TCK')

def domain():
    return json.loads(sql("select json_build_object('balance',(select amount from balance where id=1),"
        "'notes',(select coalesce(json_agg(r order by id),'[]') from notes r),"
        "'row_locks',(select coalesce(json_agg(r),'[]') from pgrowlocks('balance') r))"))

def setup_trial():
    sql('create extension if not exists pgrowlocks; drop table if exists balance,notes; '
        'create table balance(id int primary key,amount int not null); insert into balance values(1,100); '
        'create table notes(id int primary key,payload text not null); insert into notes values(1,\'committed baseline\'); '
        "create or replace function burn_cpu() returns text language plpgsql as $$declare v text='seed'; begin "
        'for i in 1..100000000 loop v=md5(v); end loop; return v; end$$')
    holder=Client('holder');request=Client('request');compute=Client('compute')
    holder.send('begin; update balance set amount=999 where id=1;')
    request.send(('begin; ' if config['scope']=='explicit' else '')+"insert into notes values(2,'before waiting statement');")
    compute.send("begin; insert into notes values(3,'before computation');")
    compute_mark=compute.begin("select burn_cpu();\n\\echo COMPUTE_SQLSTATE=:SQLSTATE")
    request_started=time.monotonic()
    request_mark=request.begin("update balance set amount=amount+7 where id=1;\n\\echo REQUEST_SQLSTATE=:SQLSTATE")
    wait('request waiting on exact holder',lambda: (a:=activity(request)) and a[0]['wait_event_type']=='Lock' and holder.pid in a[0]['blockers'])
    packet=dict(trial=phase,scope=config['scope'],request_budget_seconds=2,
        actors={c.name:activity(c)[0] for c in (holder,request,compute)},domain=domain())
    assert packet['actors']['holder']['state']=='idle in transaction'
    assert packet['actors']['compute']['state']=='active' and not packet['actors']['compute']['blockers']
    assert packet['domain']['balance']==100 and len(packet['domain']['row_locks'])==1
    save(phase+'-inventory',packet)
    return holder,request,compute,request_mark,compute_mark,request_started,packet

if phase=='cleanup':
    stopped();shutil.rmtree(root);print('Removed only the owned fixture:',root);sys.exit(0)

try:
    if phase=='inspect':
        stopped()
        area=sys.argv[2] if len(sys.argv)>2 else 'all'
        assert area in ('all','activity','data','lifecycle','deadline')
        saved=read('survey-inventory')
        values=dict(activity=saved['actors'],data=saved['domain'],lifecycle=read('survey-finished'),deadline=read('survey-deadline'))
        print(json.dumps(save('inspection-'+area,values if area=='all' else values[area]),indent=2))
    else:
        if phase=='survey':
            sock.mkdir()
            if os.geteuid()==0:os.chown(sock,owner.pw_uid,owner.pw_gid)
            utility('initdb','-D',data,'-U','postgres','--auth-local=trust','--auth-host=reject',
                '--no-locale','--data-checksums','--wal-segsize=1')
            with (data/'postgresql.conf').open('a') as f:
                f.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='"+str(sock)+"'\n"
                    "shared_buffers='16MB'\nmax_connections=10\nautovacuum=off\narchive_mode=off\n"
                    "min_wal_size='2MB'\nmax_wal_size='8MB'\ncheckpoint_timeout='1h'\n"
                    "fsync=on\nsynchronous_commit=on\nfull_page_writes=on\nlogging_collector=off\n")
        else:
            action=sys.argv[2]
            assert action in ('cancel-request','terminate-request'),'Choose a supplied request policy'
            assert not (root/'outcome.json').exists(),'Apply already completed; create a fresh fixture'
            save('decision',dict(action=action,meaning='Validate this policy on an equivalent fresh request, not the finished survey request'))
        start()
        holder,request,compute,request_mark,compute_mark,request_started,packet=setup_trial()
        if phase=='survey':
            cpu_before={c.name:cpu(c) for c in (holder,request,compute)}
            sample_start=time.monotonic()
            while time.monotonic()-request_started<2:time.sleep(.02)
            deadline_actors={c.name:activity(c)[0] for c in (holder,request,compute)}
            assert deadline_actors['request']['wait_event_type']=='Lock'
            assert request_mark[0] not in request.path.read_text()[request_mark[1]:]
            cpu_delta={c.name:cpu(c)-cpu_before[c.name] for c in (holder,request,compute)}
            assert cpu_delta['compute']>0
            save('survey-deadline',dict(elapsed_seconds=time.monotonic()-request_started,
                budget_seconds=2,response_complete=False,actors=deadline_actors,
                cpu_sample_seconds=time.monotonic()-sample_start,backend_cpu_seconds=cpu_delta))
            # Observation closes before learner inspection; it is not a chosen remedy or budget trial.
            for c in (request,compute,holder):signal(c,'terminate')
            wait('survey backends gone',lambda: all(not activity(c) for c in (request,compute,holder)))
            final=domain()
            expected_notes=[dict(id=1,payload='committed baseline')]+([dict(id=2,payload='before waiting statement')] if config['scope']=='autocommit' else [])
            assert final==dict(balance=100,notes=expected_notes,row_locks=[])
            save('survey-finished',dict(reason='All survey actors terminated by fixture cleanup; saved PIDs are historical. Apply creates fresh actors.',domain=final))
            print(json.dumps(dict(symptom={k:read('survey-deadline')[k] for k in ('elapsed_seconds','budget_seconds','response_complete')},instruction='Inspect the saved inventory, choose the least disruptive request policy, then apply it to a fresh equivalent trial.'),indent=2))
        else:
            kind='cancel' if action=='cancel-request' else 'terminate'
            sent=signal(request,kind)
            response=request.finish(request_mark,disconnect=kind=='terminate')
            elapsed=time.monotonic()-request_started
            assert elapsed<2,'Chosen request policy exceeded supplied2s budget'
            if kind=='cancel':
                assert 'REQUEST_SQLSTATE=57014' in response and 'canceling statement due to user request' in response
                state=activity(request)[0]['state']
                assert state==('idle in transaction (aborted)' if config['scope']=='explicit' else 'idle')
                probe=request.send("select 'probe';\n\\echo PROBE_SQLSTATE=:SQLSTATE")
                assert ('PROBE_SQLSTATE=25P02' if config['scope']=='explicit' else 'PROBE_SQLSTATE=00000') in probe
                request.send('rollback;' if config['scope']=='explicit' else 'select 1;')
                assert int(request.send('select pg_backend_pid();'))==request.pid
            else:
                assert '57P01' in response and 'terminating connection due to administrator command' in response
                wait('request backend absent',lambda: not activity(request))
                probe='disconnected'
            post_request=domain()
            assert post_request['balance']==100
            expected_notes=[dict(id=1,payload='committed baseline')]+([dict(id=2,payload='before waiting statement')] if config['scope']=='autocommit' else [])
            assert post_request['notes']==expected_notes
            assert activity(holder)[0]['state']=='idle in transaction' and activity(compute)[0]['state']=='active'
            save('request-outcome',dict(action=action,signal=sent,client_output=response,probe=probe,
                elapsed_seconds=elapsed,budget_seconds=2,session_survived=kind=='cancel',domain=post_request,
                holder_untouched=activity(holder),compute_untouched=activity(compute)))
            # Bounded comparisons follow the chosen request intervention; they are not its measured budget.
            idle_signal=signal(holder,'cancel')
            time.sleep(.1)
            idle_after=activity(holder)
            assert idle_after[0]['state']=='idle in transaction' and len(domain()['row_locks'])==1
            assert holder.send('select pg_backend_pid();').strip()==str(holder.pid)
            save('idle-cancel',dict(signal=idle_signal,after=idle_after,domain=domain()))
            compute_signal=signal(compute,'cancel')
            compute_response=compute.finish(compute_mark)
            assert 'COMPUTE_SQLSTATE=57014' in compute_response and 'canceling statement due to user request' in compute_response
            assert activity(compute)[0]['state']=='idle in transaction (aborted)'
            compute.send('rollback;')
            assert int(compute.send('select pg_backend_pid();'))==compute.pid
            save('compute-cancel',dict(signal=compute_signal,client_output=compute_response,domain=domain()))
            holder_signal=signal(holder,'terminate')
            wait('holder backend absent',lambda: not activity(holder))
            holder_response=holder.finish(holder.begin("select 'after termination';"),disconnect=True)
            assert '57P01' in holder_response and 'terminating connection due to administrator command' in holder_response
            final=domain()
            assert final==dict(balance=100,notes=expected_notes,row_locks=[])
            save('holder-termination',dict(signal=holder_signal,client_output=holder_response,domain=final))
            outcome=save('outcome',dict(action=action,scope=config['scope'],request_seconds=elapsed,
                request_session_survived=kind=='cancel',request_budget_seconds=2,domain=final,
                idle_cancel_left_transaction=True,holder_terminated=True,compute_session_survived=True,
                observation_boundary='Apply used new actor identities; survey cleanup and later comparisons are not the chosen request intervention.'))
            print(json.dumps(outcome,indent=2))
            print('Verified request budget, session/transaction outcomes, idle-cancel limitation and owned termination.')
finally:
    exits=[]
    try:
        for c in clients:exits.append(c.close())
    finally:
        stop()
    save(phase+'-lifecycle',dict(server_stopped=True,clients=exits))
    print('Owned server and clients stopped. Controller and evidence:',root/'cancel.py',flush=True)
    print('After recording findings, release this fixture: python3 "'+str(root/'cancel.py')+'" cleanup',flush=True)
`;

export function cancelSetup(scope = "explicit"): string {
  return code`set -eu
CANCEL_BOOTSTRAP=$(mktemp /tmp/pg-cancel-XXXXXX.py)
cat > "$CANCEL_BOOTSTRAP" <<'PY'
` + CANCEL_PROGRAM + '\nPY\npython3 "$CANCEL_BOOTSTRAP" survey ' + scope + code`
CANCEL=$(cat "$CANCEL_BOOTSTRAP.location")
rm -- "$CANCEL_BOOTSTRAP" "$CANCEL_BOOTSTRAP.location"
# In a new shell, set CANCEL to the printed absolute cancel.py path.
`;
}

export const CANCEL_CORE = cancelSetup();
export const CANCEL_VARIATION = cancelSetup("autocommit") + code`
python3 "$CANCEL" inspect all
python3 "$CANCEL" apply cancel-request
`;

export const CANCEL_INCIDENT: Draft = {
  slug: "runaway-query-and-cancel",
  revision: 4,
  title: "Incident: a request misses its response budget",
  tags: ["timeouts", "connections", "incident", "observability", "transactions"],
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 35,
  prerequisites: ["lock-queue-and-blocking-pids", "idle-in-transaction-kills-you"],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 15 "Locks on Memory Structures".`,
  overview: code`
A request remains incomplete at its supplied response deadline. Choose evidence from a real activity,
wait, CPU and data inventory, identify the relevant sessions, and select the least disruptive policy
that meets a fresh request's budget. Verify the client response, transaction state, connection and
complete committed data. The short survey stops before you inspect it; applying your policy creates
an equivalent new trial with new identities. The tutor can show only the symptom before revealing
construction. The complete source and worked actions remain available on request.`,
  caution: code`
Use this shell on Linux with Python3, PostgreSQL16 and pgrowlocks available. It creates an owned
/tmp/pg-owned-* cluster with TCP disabled and no inherited PG connection settings. Root uses the
postgres OS account through runuser; other users use their own account. PGBIN selects matching
binaries. Keep at least2GB free; one fixture uses roughly35MB. A file lock rejects overlapping phases.
Each phase bounds its clients and stops its server, including failure cleanup. Never substitute
learner PIDs or databases. Saved survey PIDs are historical; the applied trial registers fresh ones.
Record findings, then use the printed cleanup command to reclaim this stopped fixture.`,
  syntaxBreakdown: code`
### In plain terms

A slow request, an executing computation and an idle transaction can need different interventions.
Identify the dependency first. A signal's true result is not proof of a completed response, a released
lock or a preserved connection. Measure each outcome and account for earlier writes at their actual
transaction boundary. The supplied two-second budget is a local experiment contract, not a production
SLO or an automatic timeout response.

### What you are learning

- **Diagnosis:** join exact client identities to activity, blocking PIDs, row locks, CPU deltas and
  visible data. An active state or null wait event alone does not prove CPU consumption.
- **Least disruptive policy:** cancel the waiting request within its budget while retaining its
  connection. Termination is a runnable comparison with an actual disconnect cost.
- **Transaction boundary:** a statement error aborts an explicit transaction; a prior autocommitted
  statement remains committed. Verify exact identities and payloads, not only a count.
- **Completion evidence:** distinguish signal dispatch, client SQLSTATE, backend presence and row
  locks. Cancelling an idle transaction does not end it or release its held row lock here.
- **Resource lifecycle:** inspect saved observations without leaving actors running. Apply the
  policy to a fresh equivalent request, and never use an old PID as an intervention capability.

### Piece by piece

- **set -eu**, **mktemp**, the quoted **cat <<'PY'** heredoc and **python3** stage the complete
  controller. **CANCEL_BOOTSTRAP.location** supplies its owned path, retained in **CANCEL**; the
  bootstrap files are then removed. In a new shell assign the printed absolute cancel.py path.
- **survey explicit|autocommit** makes the short observation run. **tempfile.mkdtemp**, **pwd**,
  **os.chown** and **runuser -u ... --** choose its unique directory and OS owner. **shutil.disk_usage**
  checks headroom. **fcntl.flock(LOCK_EX|LOCK_NB)** prevents concurrent phases on one fixture.
- **PGBIN / pg_config --bindir** selects the tools. **initdb -D ... -U postgres --auth-local=trust
  --auth-host=reject --no-locale --data-checksums --wal-segsize=1** creates a checksummed private
  cluster with1MB WAL segments. The directory's protected socket permits local access; host
  authentication is rejected. **listen_addresses=''** disables TCP; **PGHOST/PGPORT/PGUSER/
  PGDATABASE** choose that socket,6543,postgres,postgres. Inherited PG variables are cleared.
- **pg_ctl -D ... -l ... -w -t10 start**, verified **show data_directory**, **-m fast stop** and
  **status** returning3 bind lifecycle operations to this exact cluster. **shared_buffers=16MB**,
  **max_connections=10**, **min_wal_size=2MB/max_wal_size=8MB** and **checkpoint_timeout=1h** bound
  the small lab. **autovacuum=off/archive_mode=off** remove unrelated writers and retained archive
  files. **fsync/synchronous_commit/full_page_writes=on** preserve normal commit settings;
  **logging_collector=off** keeps diagnostics in server.log.
- **subprocess.Popen** gives three independent psql clients separate logs and unique **PGAPPNAME**
  values. **psql -X -q -At** ignores startup files and simplifies output. Actor **ON_ERROR_STOP=0**
  permits intentional error probes; **VERBOSITY=verbose** and **:SQLSTATE** expose exact outcomes.
  Observer **ON_ERROR_STOP=1** rejects unexpected SQL failures. A unique **\\echo DONE_...** marker
  ties each asynchronous response to its command; **pg_backend_pid()** records the live backend.
- **PGCONNECT_TIMEOUT=3**, **statement_timeout=5000**, **lock_timeout=0**, an actor's
  **idle_in_transaction_session_timeout=8s**, Python15s utility limits and two-second polling
  deadlines bound failure paths. The5s statement timeout is a fallback: accepted policy trials
  must finish before2s with the actual user-request cancellation diagnostic. **LC_ALL=C** fixes
  those diagnostics. **time.monotonic** measures elapsed durations independently of wall-clock jumps.
- **balance(id,amount)** starts with(1,100); **notes(id,payload)** starts with(1,committed baseline).
  The holder executes **BEGIN; UPDATE balance SET amount=999 WHERE id=1** and waits idle. The
  request inserts note2 before its blocked **UPDATE balance SET amount=amount+7**. Core groups both
  statements in **BEGIN**; the variation changes only that boundary to autocommit.
- A third client inserts tentative note3, then executes **burn_cpu()**, a bounded-by-timeout
  PL/pgSQL loop applying **md5** repeatedly. It is independent of the holder/request row conflict.
  **/proc/PID/stat** user/system ticks divided by **SC_CLK_TCK** measure each backend's actual CPU
  time over the survey interval. This Linux measurement is separate from a wait snapshot.
- **pg_stat_activity** supplies PID, unique application name, state, waits, XID/xmin, query text and
  transaction/query start times. **pg_blocking_pids(pid)** identifies the holder for the waiting
  request. **CREATE EXTENSION pgrowlocks** and **pgrowlocks('balance')** inspect actual row locks.
  Fresh observer reads return committed balance/notes, independently of each actor's tentative work.
- Survey records a real incomplete response after at least2s, its activity inventory and measured
  CPU deltas. It then explicitly terminates its three owned actors for fixture cleanup, checks
  rolled-back state, closes clients and stops the server. This cleanup is not the chosen policy.
  **inspect activity|deadline|data|lifecycle|all** reads the saved evidence with the server stopped.
- After recording a diagnosis, **python3 "$CANCEL" apply cancel-request** recreates equivalent
  fresh actors, reinitializes only these fixture tables, saves the action and applies the policy.
  Alternatively use **apply terminate-request** on a fresh fixture to compare disconnection. One
  completed apply is allowed per fixture. The measured budget starts when the new waiting UPDATE
  is sent and ends when its client response arrives; later comparisons are outside that budget.
- **pg_cancel_backend(pid)** and **pg_terminate_backend(pid)** are called only through a fresh
  predicate matching PID, registered application name, database and client-backend type. A **true**
  result means the signal was sent. The controller separately awaits the client response and
  checks session/transaction/data outcomes; it never treats true as completion.
- Request cancellation must produce **57014** with the user-request diagnostic. In core the state
  becomes **idle in transaction (aborted)** and a new command gets **25P02** until **ROLLBACK**.
  The same PID then accepts work. In autocommit the state is idle, a new command succeeds with
  **00000**, and committed note2 survives. A failed explicit transaction does not imply its earlier
  row locks remain held: inspect lock ownership rather than inferring it from that state label.
- Request termination instead produces **57P01**, a disconnected client and absence of that exact
  backend. In either policy the fresh balance remains100; core note2 is absent and autocommit
  note2 remains. The independent holder and computation must still be untouched at this boundary.
- The later comparisons cancel the idle holder, verify it remains idle with its row lock and same
  PID, then cancel the computation with **57014**, roll back its failed transaction and verify its
  same connection. Note3 never commits. Finally terminate the owned holder, observe **57P01** and
  backend disappearance, and prove tentative999 rolled back and the row-lock inventory is empty.
- **request-outcome.json**, **idle-cancel.json**, **compute-cancel.json**, **holder-termination.json**,
  **outcome.json**, client/server logs and phase **lifecycle.json** records keep the boundaries
  explicit. Cleanup closes/waits for all owned clients and stops the server in **finally**, recording
  client exit codes and any forced client kill. Successful phase validation requires none forced.
  **python3 "$CANCEL" cleanup** checks stopped state and removes only this fixture after findings
  are recorded.`,
  code: CANCEL_CORE,
  expectedResult: code`
The survey observes the request still incomplete after its2s budget. Its wait inventory names the
idle holder as blocker; that holder owns the balance row lock. The separate computation accumulates
measured backend CPU time. Core fresh readers see balance100 and only baseline note1. Survey actors
are explicitly terminated and the server stopped before learner inspection.

Applying cancel-request to a fresh equivalent request completes before2s with57014, preserves its
connection, and leaves the independent holder and computation active in their previous states. Core
requires ROLLBACK after25P02 and loses tentative note2; the autocommit variation accepts the next
command directly and retains exactly note2's prior committed payload. Terminate-request instead
returns57P01 and removes the request backend while respecting the same committed-data boundary.

The bounded later comparisons show idle-holder cancellation leaves its transaction/row lock alive,
computation cancellation preserves its connection after rollback, and holder termination removes
its backend/lock and rolls back999. Final balance is100, note3 is absent, and the full notes set is
only baseline1 for core or baseline1 plus committed2 for autocommit. All clients exit and the owned
server stops. Timing, PIDs, XIDs and CPU values vary; no universal latency or CPU-capacity claim is
made. A successful survey is not successful policy application.`,
  systemsLens: code`
Operational intervention needs both an identity boundary and an outcome boundary. A stale PID is
not an authority to signal, and signal acknowledgement is not a completed request. Choose the scope
of cancellation from the actual dependency and response contract, then reconcile work at the commit
boundary. Keeping a connection and keeping a transaction's writes are different outcomes.`,
  challenge: code`
Select two measurements before inspecting everything. Identify the blocked request and distinguish
its dependency from independent CPU work. Choose the least disruptive policy meeting the supplied
budget, predict its connection and data outcomes, and apply it to the fresh trial. Explain the idle
cancel comparison from actual lock evidence. Use hint2 to change only the request's prior-write
transaction boundary; predict and verify exactly which note survives. Optionally compare request
termination on another fresh fixture. Record your findings and reclaim each fixture.`,
};
