import { code, type Draft } from "../../../src/types.ts";

export const CAPSTONE_PROGRAM = code`
import fcntl, json, os, pathlib, pwd, re, shutil, signal, sqlite3, subprocess, sys, tempfile, threading, time, uuid

phase=sys.argv[1]
assert phase in ('run','inspect','cleanup','admission-child','worker-child')
if phase=='run':
    boundary=sys.argv[2] if len(sys.argv)>2 else 'after'
    assert boundary in ('before','after')
    assert shutil.disk_usage('/tmp').free>2*1024**3,'Keep at least 2GB free'
    root=pathlib.Path(tempfile.mkdtemp(prefix='pg-owned-',dir='/tmp'))
    owner=pwd.getpwnam('postgres') if os.geteuid()==0 else pwd.getpwuid(os.geteuid())
    if os.geteuid()==0:os.chown(root,owner.pw_uid,owner.pw_gid)
    (root/'capstone.py').write_text(pathlib.Path(__file__).read_text())
    pathlib.Path(str(__file__)+'.location').write_text(str(root/'capstone.py'))
    config=dict(root=str(root),owner=owner.pw_name,boundary=boundary,
        bindir=os.environ.get('PGBIN') or subprocess.check_output(['pg_config','--bindir'],text=True).strip())
    (root/'fixture.json').write_text(json.dumps(config))
else:
    root=pathlib.Path(__file__).resolve().parent;config=json.loads((root/'fixture.json').read_text())
    assert str(root)==config['root'] and root.parent==pathlib.Path('/tmp') and root.name.startswith('pg-owned-')
    owner=pwd.getpwnam(config['owner'])
if not phase.endswith('-child'):
    phase_lock=(root/'phase.lock').open('w');fcntl.flock(phase_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
bindir=pathlib.Path(config['bindir']);data=root/'data';sock=root/'socket'
prefix=['runuser','-u',owner.pw_name,'--'] if os.geteuid()==0 else []
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST=str(sock),PGPORT='6543',PGUSER='postgres',PGDATABASE='postgres',PGCONNECT_TIMEOUT='3',
    PGOPTIONS='-c statement_timeout=5000 -c lock_timeout=2000',LC_ALL='C')
clients=[];children=[]

def save(name,value):
    (root/(name+'.json')).write_text(json.dumps(value,indent=2));return value

def read(name):return json.loads((root/(name+'.json')).read_text())
def record(event,**values):
    with (root/'history.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        with (root/'history.jsonl').open('a') as f:
            f.write(json.dumps(dict(at=time.time(),monotonic=time.monotonic(),process=os.getpid(),event=event,**values))+'\n');f.flush();os.fsync(f.fileno())

def quote(value):return "'"+str(value).replace("'","''")+"'"
def run(args,expected=0):
    p=subprocess.run(args,env=env,capture_output=True,text=True,timeout=15)
    assert p.returncode==expected,p.stdout+p.stderr
    return p

def utility(name,*args):return run(prefix+[str(bindir/name),*map(str,args)]).stdout.strip()
def sql(query):return run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',query]).stdout.strip()
def wait(label,predicate,seconds=5):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        result=predicate()
        if result:return result
        time.sleep(.01)
    raise RuntimeError('Deadline: '+label)

def stopped():
    assert not (data/'postmaster.pid').exists()
    run(prefix+[str(bindir/'pg_ctl'),'-D',str(data),'status'],3)

def start():
    utility('pg_ctl','-D',data,'-l',root/'server.log','-w','-t','10','start')
    assert sql('show data_directory')==str(data)

def stop(mode='fast'):
    if (data/'postmaster.pid').exists():utility('pg_ctl','-D',data,'-m',mode,'-w','-t','10','stop')
    if data.exists():stopped()

class Client:
    def __init__(self,role,label):
        self.pid=None;self.role=role;self.app=label+'_'+uuid.uuid4().hex[:10]
        self.path=root/(self.app+'.log');self.output=self.path.open('wb');self.killed=False
        self.proc=subprocess.Popen([str(bindir/'psql'),'-X','-q','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],
            env=dict(env,PGUSER=role,PGAPPNAME=self.app),stdin=subprocess.PIPE,stdout=self.output,stderr=subprocess.STDOUT)
        clients.append(self);self.pid=int(self.command('select pg_backend_pid();').strip())
    def command(self,query):
        query=query.rstrip()
        if not query.endswith(';'):query+=';'
        token='DONE_'+uuid.uuid4().hex;offset=self.path.stat().st_size
        self.proc.stdin.write((query+'\n\\echo '+token+'\n').encode());self.proc.stdin.flush()
        end=time.monotonic()+6
        while time.monotonic()<end:
            text=self.path.read_text()[offset:]
            if token in text:return text.split(token)[0].strip()
            assert self.proc.poll() is None,text
            time.sleep(.002)
        raise RuntimeError('Client response deadline '+self.app)
    def value(self,query):
        return json.loads(self.command(query))
    def close(self):
        if self.output.closed:return
        if self.proc.poll() is None:
            try:self.proc.communicate(b'\\q\n',timeout=1)
            except (subprocess.TimeoutExpired,BrokenPipeError):self.killed=True;self.proc.kill();self.proc.wait(timeout=2)
        self.output.close()
        record('client-exit',application=self.app,backend=self.pid,client=self.proc.pid,code=self.proc.returncode,forced=self.killed)
    def lose(self):
        self.proc.kill();assert self.proc.wait(timeout=2)==-9;self.killed=True;self.output.close()
        wait('lost listener backend absent',lambda: sql('select count(*) from pg_stat_activity where pid='+str(self.pid)+' and application_name='+quote(self.app))=='0')
        record('listener-loss',application=self.app,backend=self.pid,client=self.proc.pid,code=-9,backend_absent=True)

def admit(client,i,batch='recovery',cap=8,payload=None):
    payload='task/'+str(i) if payload is None else payload
    return client.value('select public.admit('+str(i)+','+quote(batch)+','+str(7*i)+','+quote(payload)+','+str(cap)+')')

def claim(client,batch='recovery',lease=2000):
    value=client.value('select coalesce(public.claim('+quote(batch)+','+str(lease)+"),'null'::jsonb)")
    if value:record('claim',id=value['id'],generation=value['generation'],owner=value['owner'],token=value)
    return value

def complete(client,token,result):
    value=client.value('select public.complete('+str(token['id'])+','+str(token['generation'])+','+str(result)+')')
    record('completion',id=token['id'],generation=token['generation'],owner=client.role,outcome=value)
    return value

def receive(token,service=0):
    entered=time.monotonic()
    with sqlite3.connect(root/'receiver.sqlite',timeout=3) as db:
        db.execute('pragma synchronous=FULL');db.execute('begin immediate');locked=time.monotonic()
        old=db.execute('select amount,payload,result from receipts where id=?',(token['id'],)).fetchone()
        if old:
            assert old[:2]==(token['amount'],token['payload']),'Receiver payload mismatch'
            result=old[2];effect=0
        else:
            time.sleep(service)
            db.execute('update credit set total=total+? where id=1',(token['amount'],))
            result=db.execute('select total from credit where id=1').fetchone()[0]
            db.execute('insert into receipts values(?,?,?,?)',(token['id'],token['amount'],token['payload'],result));effect=1
        db.commit();ended=time.monotonic()
    value=dict(id=token['id'],effect=effect,result=result,lock_wait_seconds=locked-entered,seconds=ended-entered)
    record('receiver-commit',id=token['id'],generation=token['generation'],payload=token['payload'],**{k:v for k,v in value.items() if k!='id'})
    return value

def receiver():
    with sqlite3.connect('file:'+str(root/'receiver.sqlite')+'?mode=ro',uri=True) as db:
        db.row_factory=sqlite3.Row
        return dict(receipts=[dict(r) for r in db.execute('select * from receipts order by id')],total=db.execute('select total from credit where id=1').fetchone()[0])

def inventory():
    result={}
    for table in ['requests','jobs','results']:
        result[table]=json.loads(sql("select coalesce(json_agg(r order by id),'[]') from public."+table+' r'))
    result['receiver']=receiver();return result

def gate(i,payload,seconds=.15):
    end=time.monotonic()+seconds;started=time.monotonic()
    while True:
        item=next((r for r in receiver()['receipts'] if r['id']==i),None)
        if item:
            assert item['payload']==payload
            return dict(status='ready',receipt=item,seconds=time.monotonic()-started)
        if time.monotonic()>=end:return dict(status='not-ready',id=i,seconds=time.monotonic()-started)
        time.sleep(.01)

def child(which):
    path=root/(which+'.log');output=path.open('w')
    process=subprocess.Popen(['python3',str(root/'capstone.py'),which],stdin=subprocess.PIPE,stdout=output,stderr=subprocess.STDOUT,text=True)
    item=dict(process=process,output=output,label=which);children.append(item)
    marker=root/(which+'.json')
    def ready():
        assert process.poll() is None,path.read_text()
        return marker.exists() and marker.stat().st_size
    wait(which+' durable boundary',ready)
    return item,read(which)

def lose_child(item):
    p=item['process'];assert p.poll() is None;p.kill();assert p.wait(timeout=2)==-9;item['output'].close()
    record('process-loss',label=item['label'],pid=p.pid,exit=-9)

if phase in ('admission-child','worker-child'):
    signal.alarm(12)
    try:
        c=Client('api' if phase=='admission-child' else 'worker_a',phase)
        if phase=='admission-child':
            result=admit(c,2);assert result['status']=='accepted';c.close()
            record('admission-unknown',id=2,payload='task/2',database_outcome=result,client_outcome='no reply yet')
            save(phase,dict(database_outcome=result,client_reply_sent=False))
        else:
            token=claim(c,lease=700);assert token['id']==1;c.close()
            effect=receive(token) if config['boundary']=='after' else None
            save(phase,dict(token=token,receiver=effect,source_completion_sent=False))
        assert sys.stdin.readline().strip()=='CONTINUE'
        raise RuntimeError('Parent should inject the specified process loss')
    finally:
        for c in clients:c.close()
    sys.exit(0)

if phase=='cleanup':
    stopped();shutil.rmtree(root);print('Removed only the owned fixture:',root);sys.exit(0)
if phase=='inspect':
    stopped();area=sys.argv[2] if len(sys.argv)>2 else 'all';assert area in ('history','recovery','capacity','all')
    values=dict(history=[json.loads(l) for l in (root/'history.jsonl').read_text().splitlines()],recovery=read('recovery'),capacity=read('capacity'))
    print(json.dumps(values if area=='all' else values[area],indent=2));sys.exit(0)

try:
    sock.mkdir()
    if os.geteuid()==0:os.chown(sock,owner.pw_uid,owner.pw_gid)
    utility('initdb','-D',data,'-U','postgres','--auth-local=trust','--auth-host=reject','--no-locale','--data-checksums','--wal-segsize=1')
    with (data/'postgresql.conf').open('a') as f:
        f.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='"+str(sock)+"'\n"
            "shared_buffers='16MB'\nmax_connections=12\nautovacuum=off\narchive_mode=off\n"
            "min_wal_size='2MB'\nmax_wal_size='8MB'\ncheckpoint_timeout='1h'\nfsync=on\n"
            "synchronous_commit=on\nfull_page_writes=on\nlogging_collector=off\nlog_checkpoints=on\n")
    start()
    with sqlite3.connect(root/'receiver.sqlite') as db:
        db.executescript('pragma journal_mode=DELETE; pragma synchronous=FULL; create table credit(id integer primary key,total integer not null); insert into credit values(1,0); create table receipts(id integer primary key,amount integer not null,payload text not null,result integer not null);')
    sql('''
begin;
create role api login; create role worker_a login; create role worker_b login;
revoke create on schema public from public;
create table public.requests(id bigint primary key,batch text not null,amount bigint not null,payload text not null,accepted_at timestamptz not null default clock_timestamp());
create table public.jobs(id bigint primary key references public.requests(id),state text not null default 'pending',generation int not null default 0,owner name,lease_until timestamptz);
create table public.results(id bigint primary key references public.requests(id),generation int not null,owner name not null,receiver_result bigint not null);
create function public.admit(p_id bigint,p_batch text,p_amount bigint,p_payload text,p_cap int) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare old public.requests%rowtype; pending int;
begin
 if p_id is null or p_id<=0 or p_amount is null or p_amount<=0 or p_payload is null or p_batch is null or p_cap is null or p_cap not between 1 and 16 then raise exception 'invalid request'; end if;
 perform pg_advisory_xact_lock(7001);
 select * into old from public.requests where id=p_id;
 if found then
  if old.batch<>p_batch or old.amount<>p_amount or old.payload<>p_payload then return jsonb_build_object('status','rejected','reason','payload-mismatch','id',p_id); end if;
  return jsonb_build_object('status','replayed','id',p_id,'payload',old.payload);
 end if;
 select count(*) into pending from public.jobs j join public.requests r using(id) where r.batch=p_batch and j.state<>'done';
 if pending>=p_cap then return jsonb_build_object('status','rejected','reason','queue-full','id',p_id,'pending',pending); end if;
 insert into public.requests(id,batch,amount,payload) values(p_id,p_batch,p_amount,p_payload);
 insert into public.jobs(id) values(p_id);
 perform pg_notify('task_ready',p_id::text);
 return jsonb_build_object('status','accepted','id',p_id,'payload',p_payload,'pending',pending+1);
end$$;
create function public.claim(p_batch text,p_ms int) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare selected bigint; answer jsonb;
begin
 if p_ms is null or p_ms not between 100 and 10000 then raise exception 'invalid lease'; end if;
 select j.id into selected from public.jobs j join public.requests r using(id) where r.batch=p_batch and (j.state='pending' or (j.state='claimed' and j.lease_until<clock_timestamp())) order by j.id for update of j skip locked limit 1;
 if not found then return null; end if;
 update public.jobs set state='claimed',generation=generation+1,owner=session_user,lease_until=clock_timestamp()+p_ms*interval '1 millisecond' where id=selected;
 select jsonb_build_object('id',r.id,'amount',r.amount,'payload',r.payload,'owner',j.owner,'generation',j.generation,'lease_until',j.lease_until) into answer from public.requests r join public.jobs j using(id) where r.id=selected;
 return answer;
end$$;
create function public.complete(p_id bigint,p_generation int,p_result bigint) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare changed bigint;
begin
 update public.jobs set state='done',lease_until=null where id=p_id and generation=p_generation and owner=session_user and state='claimed' returning id into changed;
 if not found then return jsonb_build_object('status','rejected','id',p_id,'reason','stale-or-unowned'); end if;
 insert into public.results values(p_id,p_generation,session_user,p_result);
 return jsonb_build_object('status','done','id',p_id);
end$$;
revoke all on function public.admit(bigint,text,bigint,text,int),public.claim(text,int),public.complete(bigint,int,bigint) from public;
grant execute on function public.admit(bigint,text,bigint,text,int) to api;
grant execute on function public.claim(text,int),public.complete(bigint,int,bigint) to worker_a,worker_b;
commit;
''')
    listener=Client('postgres','listener');listener.command('begin; listen task_ready; commit;');listener.lose()
    api=Client('api','recovery_api')
    one=admit(api,1);assert one['status']=='accepted';record('admission',id=1,payload='task/1',client_outcome=one)
    admission,unknown=child('admission-child');assert not unknown['client_reply_sent'];lose_child(admission)
    replay=admit(api,2);assert replay['status']=='replayed';record('admission-retry',id=2,payload='task/2',client_outcome=replay)
    mismatch=admit(api,2,payload='changed');assert mismatch['reason']=='payload-mismatch';record('admission-rejected',id=2,payload='changed',client_outcome=mismatch)
    for i in [3,4]:
        result=admit(api,i);assert result['status']=='accepted';record('admission',id=i,payload='task/'+str(i),client_outcome=result,wakeup_listener_absent=True)
    api.close()
    worker,abandoned=child('worker-child');lose_child(worker)
    before=save('before-crash',inventory())
    coordinates_before=json.loads(sql("select json_build_object('system_identifier',system_identifier::text,'timeline',(select timeline_id from pg_control_checkpoint()),'insert_lsn',pg_current_wal_insert_lsn(),'flush_lsn',pg_current_wal_flush_lsn()) from pg_control_system()"))
    offset=(root/'server.log').stat().st_size;stop('immediate');start()
    after=save('after-crash',inventory());assert before==after
    crashlog=(root/'server.log').read_text()[offset:];assert 'database system was interrupted' in crashlog and 'redo starts at' in crashlog
    (root/'crash-window.log').write_text(crashlog)
    coordinates_after=json.loads(sql("select json_build_object('system_identifier',system_identifier::text,'timeline',(select timeline_id from pg_control_checkpoint()),'insert_lsn',pg_current_wal_insert_lsn(),'flush_lsn',pg_current_wal_flush_lsn()) from pg_control_system()"))
    assert coordinates_before['system_identifier']==coordinates_after['system_identifier'] and coordinates_before['timeline']==coordinates_after['timeline']
    pending_read=gate(2,'task/2');assert pending_read['status']=='not-ready';save('read-before-delivery',pending_read)
    reconnect=Client('postgres','reconnected_listener');reconnect.command('begin; listen task_ready; commit;')
    sql("select pg_notify('task_ready','barrier')")
    wait('notification barrier',lambda: 'barrier' in reconnect.command("select 'poll';"))
    notifications=re.findall(r'Asynchronous notification "task_ready" with payload "([^"]*)"',reconnect.path.read_text())
    assert notifications==['barrier'],notifications
    save('missed-wakeups',dict(old_listener=listener.app,new_listener=reconnect.app,notifications=notifications,scan=inventory()['jobs']))
    worker_b=Client('worker_b','recovery_b');worker_a=Client('worker_a','stale_a')
    wait('real claim deadline expired',lambda: sql('select lease_until<clock_timestamp() from public.jobs where id=1')=='t')
    token=claim(worker_b);assert token['id']==1 and token['generation']==abandoned['token']['generation']+1
    stale=complete(worker_a,abandoned['token'],0);assert stale['status']=='rejected'
    # Direct writes must be rejected even when a stale worker bypasses the helper.
    bypass=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',"update public.jobs set state='done' where id=1"],env=dict(env,PGUSER='worker_a'),text=True,capture_output=True,timeout=5)
    assert bypass.returncode!=0 and '42501' in bypass.stderr;(root/'bypass-rejected.log').write_text(bypass.stdout+bypass.stderr)
    delivered=receive(token);assert delivered['effect']==(0 if config['boundary']=='after' else 1)
    assert complete(worker_b,token,delivered['result'])['status']=='done'
    while (token:=claim(worker_b)):
        effect=receive(token);assert complete(worker_b,token,effect['result'])['status']=='done'
    ready=gate(2,'task/2');assert ready['status']=='ready'
    recovery=inventory();assert len(recovery['requests'])==len(recovery['results'])==len(recovery['receiver']['receipts'])==4
    assert all(j['state']=='done' for j in recovery['jobs']) and recovery['receiver']['total']==70
    for c in [reconnect,worker_a,worker_b]:c.close()
    save('recovery',dict(boundary=config['boundary'],unknown=unknown,replayed=replay,mismatch=mismatch,abandoned=abandoned,stale=stale,receiver_retry=delivered,read_before=pending_read,read_after=ready,coordinates_before=coordinates_before,coordinates_after=coordinates_after,final=recovery))
    record('recovery-complete',accepted_ids=[1,2,3,4],receiver_total=70)

    # Matched fixed-count arrival schedules. Work arrives independently of worker completion.
    capacity=[]
    def benchmark(index,rate,workers):
        batch='load-'+str(index);n=16;cap=6;service=.06
        producer=Client('api',batch+'_api');actors=[Client('worker_'+('a' if i==0 else 'b'),batch+'_worker'+str(i)) for i in range(workers)]
        monitor=Client('postgres',batch+'_monitor')
        offered=[];done=[];failures=[];samples=[];finished=threading.Event();stop_sample=threading.Event();sync=threading.Lock()
        start_lsn=sql('select pg_current_wal_insert_lsn()');began=time.monotonic()
        def consume(c):
            try:
                while time.monotonic()-began<12:
                    token=claim(c,batch)
                    if token is None:
                        if finished.is_set():return
                        time.sleep(.005);continue
                    effect=receive(token,service)
                    assert complete(c,token,effect['result'])['status']=='done'
                    with sync:done.append(dict(id=token['id'],finished=time.monotonic(),receiver=effect,owner=c.role))
                raise RuntimeError('Work drain deadline exceeded')
            except BaseException as e:failures.append(repr(e))
        def sample():
            try:
                while not stop_sample.is_set():
                    value=monitor.value("select json_build_object('pending',(select count(*) from public.jobs j join public.requests r using(id) where r.batch="+quote(batch)+" and j.state<>'done'),'actors',(select coalesce(json_agg(a),'[]') from (select pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) as blockers from pg_stat_activity where application_name like "+quote(batch+'_worker%')+") a))")
                    value['at']=time.monotonic();samples.append(value);stop_sample.wait(.025)
            except BaseException as e:failures.append(repr(e))
        threads=[threading.Thread(target=consume,args=(c,)) for c in actors];sampler=threading.Thread(target=sample)
        def process_resources(c):
            fields=pathlib.Path('/proc/'+str(c.pid)+'/stat').read_text().rsplit(')',1)[1].split()
            return dict(cpu_seconds=(int(fields[11])+int(fields[12]))/os.sysconf('SC_CLK_TCK'),rss_bytes=int(fields[21])*os.sysconf('SC_PAGE_SIZE'))
        resource_before={c.app:process_resources(c) for c in [producer,*actors]}
        for t in threads:t.start()
        sampler.start()
        try:
            for i in range(n):
                scheduled=began+i/rate;remaining=scheduled-time.monotonic()
                if remaining>0:time.sleep(remaining)
                sent=time.monotonic();identity=1000+index*100+i
                outcome=admit(producer,identity,batch,cap);responded=time.monotonic()
                item=dict(id=identity,scheduled=scheduled,sent=sent,response_at=responded,lateness_seconds=sent-scheduled,ack_seconds=responded-sent,scheduled_response_seconds=responded-scheduled,outcome=outcome)
                offered.append(item);record('offered',batch=batch,payload='task/'+str(identity),**item)
            finished.set()
            for t in threads:t.join(timeout=12)
            assert all(not t.is_alive() for t in threads),'Worker thread still running'
        finally:
            finished.set();stop_sample.set();sampler.join(timeout=6)
            for t in threads:t.join(timeout=12)
        assert not sampler.is_alive() and all(not t.is_alive() for t in threads),'Background thread still live'
        assert not failures,failures
        ended=time.monotonic();resource_after={c.app:process_resources(c) for c in [producer,*actors]}
        wal=int(sql('select pg_wal_lsn_diff(pg_current_wal_insert_lsn(),'+quote(start_lsn)+')'))
        accepted=[x['id'] for x in offered if x['outcome']['status']=='accepted'];rejected=[x['id'] for x in offered if x['outcome']['status']=='rejected']
        assert sorted(accepted)==sorted(x['id'] for x in done) and len(set(accepted))==len(accepted) and len(accepted)+len(rejected)==n
        assert all(x['outcome'].get('reason')=='queue-full' for x in offered if x['id'] in rejected)
        byid={x['id']:x for x in offered};latencies=sorted(x['finished']-byid[x['id']]['scheduled'] for x in done)
        result=dict(batch=batch,rate=rate,workers=workers,count=n,admission_cap=cap,service_seconds=service,offered=offered,completed=done,accepted=accepted,rejected=rejected,samples=samples,resource_before=resource_before,resource_after=resource_after,
            total_seconds=ended-began,offering_seconds=offered[-1]['response_at']-began,throughput=len(done)/(ended-began),p95_end_to_end=latencies[min(len(latencies)-1,int(.95*len(latencies)))],max_pending=max([x['pending'] for x in samples]+[x['outcome'].get('pending',0) for x in offered]),wal_bytes=wal,wal_per_completed=wal/len(done),max_producer_lateness=max(x['lateness_seconds'] for x in offered),failures=failures)
        assert result['max_pending']<=cap
        if rate==4:assert not rejected
        else:assert rejected,'Offered overload did not produce the expected bounded rejection'
        for c in [producer,*actors,monitor]:c.close()
        save(batch,result);return result
    for repeat in range(2):
        for rate,workers in [(4,1),(80,1),(80,2)]:capacity.append(benchmark(len(capacity),rate,workers))
    save('capacity',capacity)
    final=inventory();requests={r['id']:r for r in final['requests']};receipts={r['id']:r for r in final['receiver']['receipts']};results={r['id']:r for r in final['results']}
    assert set(requests)==set(receipts)==set(results)
    for i,r in requests.items():
        assert receipts[i]['payload']==r['payload']=='task/'+str(i) and receipts[i]['amount']==r['amount']==7*i
        assert results[i]['receiver_result']==receipts[i]['result']
    assert final['receiver']['total']==sum(r['amount'] for r in requests.values()) and all(j['state']=='done' for j in final['jobs'])
    rejected={i for trial in capacity for i in trial['rejected']};assert not (rejected & set(requests))
    save('final-inventory',final);stop();start();assert inventory()==final;save('durable-final',inventory())
    summary=save('outcome',dict(boundary=config['boundary'],accepted=len(requests),rejected=len(rejected),receiver_effects=len(receipts),receiver_total=final['receiver']['total'],capacity=[{k:t[k] for k in ['batch','rate','workers','count','accepted','rejected','throughput','p95_end_to_end','max_pending','wal_per_completed','max_producer_lateness']} for t in capacity],all_accepted_reconciled=True,all_rejected_absent=True,final_restart_equal=True))
    print(json.dumps(summary,indent=2))
finally:
    for item in children:
        if item['process'].poll() is None:item['process'].kill();item['process'].wait(timeout=2)
        if not item['output'].closed:item['output'].close()
    try:
        for c in clients:c.close()
    finally:stop()
    save('lifecycle',dict(server_stopped=True,clients=[dict(application=c.app,pid=c.proc.pid,code=c.proc.poll(),intentional_or_failure_kill=c.killed) for c in clients],children=[dict(label=c['label'],pid=c['process'].pid,code=c['process'].poll()) for c in children]))
    print('Owned server and clients stopped. Controller and evidence:',root/'capstone.py',flush=True)
    print('After recording findings, release this fixture: python3 "'+str(root/'capstone.py')+'" cleanup',flush=True)
`;

export function capstoneSetup(boundary = "after"): string {
  return code`set -eu
CAPSTONE_BOOTSTRAP=$(mktemp /tmp/pg-capstone-XXXXXX.py)
cat > "$CAPSTONE_BOOTSTRAP" <<'PY'
` + CAPSTONE_PROGRAM + '\nPY\npython3 "$CAPSTONE_BOOTSTRAP" run ' + boundary + code`
CAPSTONE=$(cat "$CAPSTONE_BOOTSTRAP.location")
rm -- "$CAPSTONE_BOOTSTRAP" "$CAPSTONE_BOOTSTRAP.location"
# In a new shell, set CAPSTONE to the printed absolute capstone.py path.
`;
}
export const CAPSTONE_CORE = capstoneSetup();
export const CAPSTONE_VARIATION = capstoneSetup("before") + code`
python3 "$CAPSTONE" inspect recovery
python3 "$CAPSTONE" inspect capacity
`;

export const TASK_RUNNER_CAPSTONE: Draft = {
  slug: "postmortem-from-the-log",
  revision: 4,
  title: "Capstone: reconcile a task runner through failure and overload",
  tags: ["postmortem", "recovery", "idempotency", "queues", "capacity"],
  difficulty: "advanced",
  safetyLevel: "dangerous",
  runIn: "shell",
  estimatedMinutes: 60,
  prerequisites: [
    "crash-and-redo",
    "read-the-server-log",
    "connection-saturation",
    "skip-locked-work-queue",
    "transactional-outbox",
    "idempotency-keys",
    "fencing-tokens-with-a-monotonic-counter",
    "listen-notify-as-a-bus",
    "read-your-writes-on-a-replica",
  ],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
  overview: code`
Run a supplied task runner through unknown admission outcome, worker loss, database crash, missed
wake-ups and bounded overload. Reconstruct every accepted, rejected and retried request from its
operation history, source state and independent receiver effect. Then defend an admission and
worker-concurrency decision using repeated controlled measurements. The complete local workload is
supplied; the final deliverable is your correctness reconciliation and causal capacity account.`,
  caution: code`
This Linux/Python3/PostgreSQL16 shell deliberately kills only its registered child processes and
immediately stops its own private /tmp/pg-owned-* PostgreSQL cluster to exercise recovery. It uses
Python's SQLite library as an independent receiver store. Keep at least2GB free; the fixture uses
roughly35MB. It clears inherited PG settings, disables TCP, and identifies its own data directory.
Root uses runuser with the postgres OS account; other users use their own account. PGBIN can select
matching binaries. Never substitute the learner lab. Client, thread and utility deadlines bound
failures; finally stops owned processes. A file lock prevents overlapping phases. After recording
needed findings, execute the printed cleanup command. These commits share a host; no power-loss,
network-partition, multi-host availability or production-capacity guarantee is tested.`,
  syntaxBreakdown: code`
### In plain terms

PostgreSQL accepts an immutable request and durable job together. A worker claims briefly, releases
its database locks, and commits a receipt plus credit at a separate receiver before acknowledging
completion at PostgreSQL. Losing a response or a worker can leave these boundaries uncertain.
Recovery uses retained identity, durable state and guarded completion to finish all accepted work.
The receiver deliberately serializes a fixed service interval during load trials, so adding source
workers need not increase useful capacity.

### What you are learning

- **Complete reconciliation:** account for every request's identity, payload, attempt, client
  outcome, source/receiver commit and recovery disposition. An aggregate alone cannot prove it.
- **Unknown versus absent:** a process lost after admission commit has not sent its reply. Retry
  the same identity and payload to retrieve the durable result; reject changed payloads.
- **Recoverable ownership:** an expired claim is eligible again. A new generation supersedes the
  old local completion; the independent receiver separately deduplicates immutable effects.
- **Readiness and wake-ups:** an absent notification is not absent work. Register before scanning
  durable state. Return a receiver result only when a fresh receipt matches the requested identity.
- **Capacity evidence:** maintain scheduled arrivals independently of worker completion; report
  admission rejection, scheduler lateness, acknowledgement/end-to-end latency, backlog, throughput,
  waits, CPU and WAL. Separate offering time from completed drain time.

### Piece by piece

- **set -eu**, **mktemp**, the quoted **cat <<'PY'** heredoc and **python3** stage the full program.
  **CAPSTONE_BOOTSTRAP.location** supplies the persistent controller path in **CAPSTONE**; the
  bootstrap files are removed. Set the printed absolute capstone.py path when opening another shell.
- **run after|before** selects the sole failure-boundary variation: worker loss after or before
  receiver commit. Everything else, including the six load trials, uses the same supplied logic.
  **tempfile.mkdtemp**, **pwd**, **os.chown** and **runuser -u ... --** allocate and own a unique
  fixture. **shutil.disk_usage** enforces local headroom; **fcntl.flock(LOCK_EX|LOCK_NB)** protects
  each top-level phase. Child modes are launched only by the owned controller.
- **PGBIN / pg_config --bindir** locates tools. **initdb -D ... -U postgres --auth-local=trust
  --auth-host=reject --no-locale --data-checksums --wal-segsize=1** makes the private cluster with
  checksums and1MB WAL segments. The protected local socket permits local access; host authentication
  is rejected. **listen_addresses=''** disables TCP. **PGHOST/PGPORT/PGUSER/PGDATABASE** select the
  socket,6543,postgres,postgres; inherited PG variables are removed.
- **pg_ctl -D ... -l ... -w -t10 start**, **show data_directory** and **status** returning3 identify
  the owned server. **-m immediate stop** exercises database crash recovery; final **-m fast stop**
  is normal cleanup. **shared_buffers=16MB/max_connections=12**, **min_wal_size=2MB/max_wal_size=8MB**,
  **checkpoint_timeout=1h**, **autovacuum=off/archive_mode=off** bound fixture activity and storage.
  **fsync/synchronous_commit/full_page_writes=on** retain normal durability settings;
  **logging_collector=off/log_checkpoints=on** keep recovery/checkpoint evidence in server.log.
- **subprocess.Popen**, separate psql log files and unique **PGAPPNAME** values register each actual
  client/backend. **psql -X -q -At -v ON_ERROR_STOP=1 -v VERBOSITY=verbose** ignores startup files,
  simplifies output and fails with detailed SQL errors. Every SQL command is terminated before a
  unique **\\echo DONE_...** marker; a marker alone would not execute an unfinished query buffer.
  JSON responses are parsed as a complete value because PostgreSQL JSON can span multiple lines.
- **PGCONNECT_TIMEOUT=3**, **statement_timeout=5000/lock_timeout=2000**, Python15s utility limits,
  six-second client response polling and finite thread joins bound failures. Child **signal.alarm(12)**
  limits their marker wait. **time.monotonic** measures durations; wall-clock timestamps supplement
  the operation history. **history.lock**, append, **flush** and **os.fsync** serialize diagnostic
  JSONL records across parent, child and threads. This history is evidence, not an implicit replay log.
- **requests(id,batch,amount,payload,accepted_at)** retains immutable accepted identities. **jobs**
  adds pending/claimed/done, generation, owner and lease_until; **results** records guarded local
  completion and the receiver's stored result. IDs carry amount7*id and exact payload task/id.
- **CREATE ROLE api/worker_a/worker_b** creates restricted callers. Table owners install the functions
  and grants in one transaction. **REVOKE CREATE ON SCHEMA public**, qualified table names and
  **SECURITY DEFINER SET search_path=pg_catalog,pg_temp** confine the interfaces. Default PUBLIC
  function execution is revoked; api receives only admit, workers only claim/complete. Workers have
  no direct table DML, which the actual42501 bypass test verifies.
- **public.admit** validates inputs and takes **pg_advisory_xact_lock(7001)** while deciding identity
  and capacity. A retained matching identity returns replayed; mismatched batch/amount/payload returns
  a structured rejection. If outstanding jobs in that batch reach the supplied cap, queue-full is
  returned without creating a request. Otherwise request/job insertion and **pg_notify('task_ready',
  id::text)** commit together. The cap is admission policy, not PostgreSQL's max_connections.
- **public.claim** uses **FOR UPDATE OF j SKIP LOCKED LIMIT1** on pending or actually expired work,
  then increments generation and records **session_user**, which retains the caller's identity inside
  a definer function. **clock_timestamp()+milliseconds*interval '1 millisecond'** sets a real lease.
  The claim transaction commits before receiver work. **coalesce(...,'null'::jsonb)** represents an
  empty claim explicitly; SQL NULL otherwise prints as an empty psql field.
- **public.complete** updates only a claimed row with the matching non-null generation and actual
  caller owner, and inserts its result in that same transaction. A stale or unowned attempt returns
  a structured rejection. This guards local completion; it does not fence a separate receiver or
  prove an arbitrary caller actually delivered an external effect. The supplied workers are trusted
  to follow the protocol and may crash/retry, rather than behave maliciously.
- **receiver.sqlite** uses **journal_mode=DELETE**, **synchronous=FULL** and an independent commit.
  Python **sqlite3.connect(timeout=3)** and **BEGIN IMMEDIATE** bound acquisition of its writer lock.
  A new receipt updates credit and inserts identity/amount/payload/stored result atomically. A retry
  with the same payload returns that stored result with zero new effect. It does not return the
  current aggregate as though it were the original result. The fixture retains identities throughout.
- The admission child calls admit for ID2, closes its database client after commit, and records its
  observed boundary before replying. The parent kills that actual process with **Popen.kill**, waits
  for exit-9, and retries ID2. The marker is diagnostic evidence available to the investigator; no
  application reply was sent. This is a specified process-loss boundary, not a claimed network fault.
- The worker child commits a700ms claim for ID1. Core independently commits its receiver effect,
  then the parent kills the worker before source completion. The variation kills it before that
  effect. Parent inventories record the actual source/receiver boundary, not a printed publication.
- The owned PostgreSQL server then receives an immediate stop and restarts. **pg_control_system**,
  **pg_control_checkpoint**, insertion/flush LSNs and a bounded fresh log slice record the same system
  identity/timeline and actual redo. Every accepted request and receiver outcome must equal the
  pre-crash inventory. These LSNs are supporting coordinates, not a generic replay-readiness gate.
  This crash creates no promotion branch; no .history artifact or failover is invented.
- An actual registered **LISTEN task_ready** client is killed before the recovery requests commit.
  Its exact backend disappearance is checked. Recovery commits a new LISTEN, sends an independent
  barrier notification, and observes only that barrier rather than old work notifications. A fresh
  durable job scan drives recovery. **pg_notify** is a wake-up hint, not durable queue storage.
- Recovery polls the real lease deadline, claims ID1 as worker_b in generation2, and attempts the
  stale worker_a generation1 completion plus a forbidden direct UPDATE. The former returns rejected,
  the latter42501. Retry at the receiver adds zero effects in core and one in the before variation;
  only then does current-generation completion commit. The durable scan drains IDs2–4 as well.
- **gate(id,payload,seconds=.15)** opens fresh read-only receiver observations until a matching
  receipt exists or the deadline expires. ID2 initially returns not-ready with no result, then ready
  with its exact stored receipt after delivery. This is an explicitly chosen receiver-receipt
  freshness contract, not an unconditional replica read or a physical replication experiment.
- **benchmark** repeats16 scheduled unique requests at4/s with one worker,80/s with one worker,
  then the same80/s with two workers. It repeats that trio twice. Cap6, payload/amount rules and
  receiver service60ms remain fixed. IDs are disjoint by trial. **threading.Thread/Event/Lock** run
  persistent psql workers and a monitor while the producer follows **start+i/rate**; it records
  lateness rather than shifting the schedule to hide overload. Drain is bounded by12s.
- Each newly applied receiver effect deliberately holds its SQLite writer transaction during the
  same60ms service interval. Writer-lock acquisition wait and complete receiver time are measured
  separately. This supplies a reproducible serial service constraint; the result includes Python,
  psql, logging, scheduling and filesystem costs, not just PostgreSQL execution time.
- The monitor samples pending work and actual PostgreSQL state/waits/blocking PIDs. Linux
  **/proc/PID/stat**, **SC_CLK_TCK** and **SC_PAGE_SIZE** give before/after backend CPU seconds and
  resident bytes. **pg_wal_lsn_diff** over the controlled trial yields workload-plus-protocol WAL;
  **wal_per_completed** includes claim/completion overhead and any other bounded fixture WAL.
- Every trial records scheduled, sent and response times; exact admitted/rejected IDs; each completion;
  acknowledgement and schedule-to-result latencies; offering/drain duration; completed throughput;
  maximum observed/admission-reported backlog; and CPU/wait/WAL data. The p95 uses the small sample's
  nearest-rank position. Report scheduler lateness and the entire sample count alongside it.
- Final reconciliation joins every accepted source identity to exactly one matching receipt and local
  result, compares stored results and credit=sum(amount), proves rejected load identities are absent,
  and verifies all jobs done. Another clean source restart must preserve the complete inventory.
  **inspect history|recovery|capacity|all** reads the saved evidence while the server is stopped.
  **cleanup** checks stopped state and removes only the owned fixture after findings are recorded.`,
  code: CAPSTONE_CORE,
  expectedResult: code`
ID2's admission is durable despite no reply; same-payload retry is replayed and changed payload is
rejected. All four recovery requests survive the tested source crash. The disconnected listener
misses their notifications; a new registered listener sees the barrier and the durable scan still
finds every unfinished job. ID1's real lease expires, generation2 supersedes1, stale completion is
rejected and direct worker DML fails42501. Core's receiver retry adds zero effects; changing only loss
to before receiver commit makes that retry add one. Final recovery IDs1–4 each have one complete
receipt/result, balance70, and done jobs. ID2's receipt gate moves from bounded not-ready to ready.

Both4/s trials admit all16 requests. Each80/s trial produces some measured queue-full rejections;
its accepted/rejected identity set and timings depend on scheduling. Backlog never exceeds6. Every
accepted request drains into exactly one matching receiver effect/result; rejected load identities
remain absent. Compare one and two workers from actual throughput, latency and receiver-lock waits;
do not assume that more workers improve a serialized service. All six16-request histories remain
available. The final source restart preserves complete requests/jobs/results and receiver state.

Each injected listener/admission/worker loss has an actual process exit and recorded boundary.
The controlled PostgreSQL crash has fresh interrupted/redo log evidence and preserves system identity
and timeline. Remaining clients and owned server stop at the end. Exact counts beyond the four
recovery requests, aggregate amounts, CPU/WAL values and latency distributions are measured outputs,
not portable constants.`,
  systemsLens: code`
Correctness and capacity share an admission boundary. Once a durable request is accepted, overload
or an uncertain reply cannot silently erase its obligation. Separate recoverable local ownership
from independently committed effects, reconcile identity across those commits, and expose bounded
rejection before accepting more work than the service can handle. A causal incident account joins
operation history with resource evidence and states which failure domains remain untested.`,
  challenge: code`
Before running, state the request/effect invariant, predict both unknown outcomes and choose the
first evidence you would inspect. Afterward, reconcile every accepted, rejected and retried identity
from history through source jobs/results and receiver receipts/credit. Explain the crash, missed
wake-up, stale completion and freshness boundaries using their actual evidence. Then compare both
repetitions of each capacity condition and defend one admission/concurrency policy, including its
rejection, latency, recovery and resource costs. Separate demonstrated outcomes, documented
mechanisms and untested host/network failures. Use hint2 to move only the worker loss before receiver
commit; predict the changed retry effect and unchanged final recovery state. Record the account and
clean up both fixtures.`,
};
