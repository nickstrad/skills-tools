import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function fencingExperiment(rollbackFence: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\nrollback_fence = ${rollbackFence ? "True" : "False"}\n` + code`
clients=[]
env['PGOPTIONS']='-c statement_timeout=15000 -c lock_timeout=5000'

def quote(value):
    return "'"+str(value).replace("'","''")+"'"

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def attempt(user,command):
    return subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',command],
        env=dict(env,PGUSER=user),text=True,capture_output=True,timeout=20)

def query(user,command):
    result=attempt(user,command);assert result.returncode==0,result.stdout+result.stderr
    return result.stdout.strip()

def rows(table,order):
    return json.loads(sql("select coalesce(json_agg(r order by "+order+"),'[]') from "+table+' r'))

def inventory():
    return dict(claims=rows('authority.claims','resource'),issued=rows('authority.issued','epoch'),
        state=rows('guarded.state','resource'),history=rows('guarded.history','revision'))

def write_command(epoch,value):
    return "select guarded.write_value('shard-1',"+str(epoch)+','+quote(value)+')'

def reject(label,user,command,code,message):
    before=inventory();result=attempt(user,command)
    (root/(label+'.log')).write_text(result.stdout+result.stderr)
    assert result.returncode!=0 and code+':' in result.stderr and message in result.stderr,result.stderr
    assert inventory()==before
    emit(label,dict(user=user,sqlstate=code,error=result.stderr.strip(),state_unchanged=True))

def launch(user,label):
    path=root/(label+'.log');output=path.open('w')
    process=subprocess.Popen([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],
        env=dict(env,PGUSER=user,PGAPPNAME=label),stdin=subprocess.PIPE,stdout=output,stderr=subprocess.STDOUT,text=True)
    item=dict(user=user,label=label,path=path,output=output,process=process);clients.append(item)
    return item

def send(item,commands,marker):
    item['process'].stdin.write(commands+'\n\\echo '+marker+'\n');item['process'].stdin.flush()

def reached(item,marker):
    def check():
        assert item['process'].poll() is None,item['path'].read_text()
        return marker in item['path'].read_text().splitlines()
    wait_for(marker,check,seconds=10)

def close(item):
    item['process'].stdin.write('\\q\n');item['process'].stdin.flush()
    assert item['process'].wait(timeout=5)==0,item['path'].read_text()
    item['output'].close()

def backend(item):
    return json.loads(sql("select row_to_json(a) from (select pid,usename,state,backend_xid::text as xid,"
        "wait_event_type,wait_event,pg_blocking_pids(pid) as blockers from pg_stat_activity "
        'where application_name='+quote(item['label'])+') a'))

try:
    start();identity=sql('select system_identifier from pg_control_system()')
    # Install functions and their grants together, before any worker connects.
    sql('''BEGIN;
create role authority_owner nologin nosuperuser nocreatedb nocreaterole noreplication;
create role resource_owner nologin nosuperuser nocreatedb nocreaterole noreplication;
create role worker_a login noinherit nosuperuser nocreatedb nocreaterole noreplication;
create role worker_b login noinherit nosuperuser nocreatedb nocreaterole noreplication;
revoke create on schema public from public;
create schema authority authorization authority_owner;
create schema guarded authorization resource_owner;
set role authority_owner;
create table authority.claims(resource text primary key,holder name,epoch bigint not null check(epoch>=0));
insert into authority.claims values('shard-1',null,0);
create table authority.issued(resource text not null,epoch bigint not null,holder name not null,
 primary key(resource,epoch));
create function authority.takeover(p_resource text,p_expected bigint) returns bigint
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $fn$
declare token bigint;
begin
 if session_user not in ('worker_a','worker_b') then
  raise exception using errcode='42501',message='worker identity required';
 end if;
 if p_resource is null or p_expected is null or p_expected<0 then
  raise exception using errcode='22023',message='resource and expected epoch required';
 end if;
 update authority.claims set holder=session_user,epoch=epoch+1
  where resource=p_resource and epoch=p_expected returning epoch into token;
 if not found then
  raise exception using errcode='40001',message='claim changed; inspect before another takeover';
 end if;
 insert into authority.issued values(p_resource,token,session_user);
 return token;
end
$fn$;
revoke all on function authority.takeover(text,bigint) from public;
reset role;
grant usage on schema authority to worker_a,worker_b,resource_owner;
grant execute on function authority.takeover(text,bigint) to worker_a,worker_b;
grant select on authority.issued to resource_owner;
set role resource_owner;
create table guarded.state(resource text primary key,epoch bigint not null,writer name,value text not null,
 revision int not null check(revision>=0));
insert into guarded.state values('shard-1',0,null,'initial',0);
create table guarded.history(resource text not null,revision int not null,epoch bigint not null,
 writer name not null,value text not null,primary key(resource,revision));
create function guarded.write_value(p_resource text,p_epoch bigint,p_value text) returns int
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $fn$
declare new_revision int;
begin
 -- Not STRICT: null is an explicit error, never a silently skipped function call.
 if p_resource is null or p_epoch is null or p_epoch<=0 or p_value is null then
  raise exception using errcode='22023',message='explicit resource, positive token and value required';
 end if;
 if not exists(select 1 from authority.issued
               where resource=p_resource and epoch=p_epoch and holder=session_user) then
  raise exception using errcode='42501',message='token was not issued to this worker';
 end if;
 -- The resource consults issued identity, not the authority's current holder/epoch.
 update guarded.state set epoch=p_epoch,writer=session_user,value=p_value,revision=revision+1
  where resource=p_resource and epoch<=p_epoch returning revision into new_revision;
 if not found then
  raise exception using errcode='55000',message='resource fenced this token';
 end if;
 insert into guarded.history values(p_resource,new_revision,p_epoch,session_user,p_value);
 return new_revision;
end
$fn$;
revoke all on function guarded.write_value(text,bigint,text) from public;
reset role;
grant usage on schema guarded to worker_a,worker_b;
grant execute on function guarded.write_value(text,bigint,text) to worker_a,worker_b;
COMMIT;''')
    roles=json.loads(sql("select json_agg(r order by rolname) from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin "
        "from pg_roles where rolname in ('worker_a','worker_b','authority_owner','resource_owner')) r"))
    permissions=[]
    for user in ['worker_a','worker_b']:
        observed=json.loads(query(user,"select row_to_json(r) from (select session_user,current_user,"
            "has_table_privilege(current_user,'guarded.state','UPDATE') as direct_update,"
            "has_table_privilege(current_user,'guarded.state','DELETE') as direct_delete,"
            "has_table_privilege(current_user,'guarded.state','TRUNCATE') as direct_truncate,"
            "has_table_privilege(current_user,'guarded.history','INSERT') as forge_history,"
            "has_table_privilege(current_user,'authority.issued','INSERT') as forge_issued,"
            "has_schema_privilege(current_user,'guarded','CREATE') as replace_interface,"
            "has_function_privilege(current_user,'guarded.write_value(text,bigint,text)','EXECUTE') as call_resource,"
            "pg_has_role(current_user,'resource_owner','MEMBER') as owner_member) r"))
        assert observed['session_user']==observed['current_user']==user
        assert observed['call_resource'] and not any(observed[k] for k in ['direct_update','direct_delete','direct_truncate','forge_history','forge_issued','replace_interface','owner_member'])
        permissions.append(observed)
    functions=json.loads(sql("select json_agg(r order by name) from (select p.oid::regprocedure::text as name,pg_get_userbyid(proowner) as owner,"
        "prosecdef,proisstrict,pronargdefaults,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        "where n.nspname in ('authority','guarded')) r"))
    assert len(functions)==2 and all(f['prosecdef'] and not f['proisstrict'] and f['pronargdefaults']==0 and f['proconfig']==['search_path=pg_catalog, pg_temp'] for f in functions)
    assert sql("select has_table_privilege('resource_owner','authority.claims','SELECT')")=='f'
    emit('configuration',dict(version=sql('show server_version'),system_identifier=identity,roles=roles,
        permissions=permissions,functions=functions,resource_can_read_current_claim=False,
        new_fence_fate='ROLLBACK' if rollback_fence else 'COMMIT'))
    initial=inventory();emit('initial',initial)
    token_a=int(query('worker_a',"select authority.takeover('shard-1',0)"));assert token_a==1
    assert query('worker_a',write_command(token_a,'A-initial'))=='1'
    token_b=int(query('worker_b',"select authority.takeover('shard-1',1)"));assert token_b==2
    taken_over=inventory()
    assert taken_over['claims']==[dict(resource='shard-1',holder='worker_b',epoch=2)]
    assert taken_over['state']==[dict(resource='shard-1',epoch=1,writer='worker_a',value='A-initial',revision=1)]
    emit('takeover-without-resource-fence',taken_over)
    assert query('worker_a',write_command(token_a,'A-after-takeover'))=='2'
    before_new_fence=inventory();emit('old-token-before-new-fence',before_new_fence)
    # B has executed the resource update, but has not yet committed the new fence.
    b=launch('worker_b','new-fence-worker')
    send(b,'BEGIN; '+write_command(token_b,'B-first')+';','NEW_FENCE_UNCOMMITTED');reached(b,'NEW_FENCE_UNCOMMITTED')
    owner_backend=backend(b);assert owner_backend['usename']=='worker_b' and owner_backend['state']=='idle in transaction' and owner_backend['xid']
    assert inventory()==before_new_fence
    emit('new-fence-uncommitted',dict(backend=owner_backend,visible=inventory()))
    a=launch('worker_a','old-token-waiter')
    send(a,'BEGIN; '+write_command(token_a,'A-racing')+'; COMMIT;','OLD_TOKEN_RETURNED')
    def blocked():
        value=backend(a)
        return value if value and value['wait_event_type']=='Lock' and value['wait_event']=='transactionid' and owner_backend['pid'] in value['blockers'] else None
    waiter=wait_for('old token waits on uncommitted resource fence',blocked,seconds=4)
    emit('old-token-wait',dict(waiter=waiter,new_fence_backend=owner_backend))
    send(b,'ROLLBACK;' if rollback_fence else 'COMMIT;','NEW_FENCE_DECIDED');reached(b,'NEW_FENCE_DECIDED');close(b)
    if rollback_fence:
        reached(a,'OLD_TOKEN_RETURNED');assert '3' in a['path'].read_text().splitlines();close(a)
        raced=inventory()
        assert raced['state']==[dict(resource='shard-1',epoch=1,writer='worker_a',value='A-racing',revision=3)]
        emit('new-fence-rolled-back',raced)
        # A fresh B transaction must commit the new fence before the old token is rejected.
        assert query('worker_b',write_command(token_b,'B-first'))=='4'
    else:
        assert a['process'].wait(timeout=10)!=0;a['output'].close()
        error=a['path'].read_text();assert '55000:' in error and 'resource fenced this token' in error,error
        raced=inventory()
        assert raced['state']==[dict(resource='shard-1',epoch=2,writer='worker_b',value='B-first',revision=3)]
        emit('new-fence-committed',dict(waiter_error=error,state=raced))
    fenced=inventory();emit('resource-fence-durable',fenced)
    assert fenced['state'][0]['epoch']==2 and fenced['state'][0]['writer']=='worker_b'
    reject('stale-token','worker_a',write_command(token_a,'stale'),'55000','resource fenced this token')
    reject('missing-token','worker_a',"select guarded.write_value(p_resource=>'shard-1',p_value=>'bypass')",'42883','does not exist')
    reject('null-token','worker_a',"select guarded.write_value('shard-1',NULL,'bypass')",'22023','positive token')
    reject('unissued-token','worker_a',write_command(999,'forged'),'42501','not issued to this worker')
    reject('other-worker-token','worker_a',write_command(token_b,'stolen'),'42501','not issued to this worker')
    reject('direct-value-bypass','worker_a',"update guarded.state set value='bypass' where resource='shard-1'",'42501','permission denied')
    reject('direct-epoch-bypass','worker_a',"update guarded.state set value='bypass',epoch=999 where resource='shard-1'",'42501','permission denied')
    reject('delete-bypass','worker_a',"delete from guarded.state",'42501','permission denied')
    reject('truncate-bypass','worker_a',"truncate guarded.state",'42501','permission denied')
    reject('forge-history','worker_a',"insert into guarded.history values('shard-1',999,999,'worker_a','forged')",'42501','permission denied')
    reject('forge-issued','worker_a',"insert into authority.issued values('shard-1',999,'worker_a')",'42501','permission denied')
    reject('replace-interface','worker_a',"create table guarded.intrusion(id int)",'42501','permission denied')
    reject('assume-owner','worker_a',"set role resource_owner",'42501','permission denied')
    reject('impersonate-worker','worker_a',"set session authorization worker_b",'42501','permission denied')
    reject('stale-takeover','worker_a',"select authority.takeover('shard-1',1)",'40001','claim changed')
    reject('temporary-shadow','worker_a',"create temp table state(resource text,epoch bigint); "
        "create temp table issued(resource text,epoch bigint,holder name); "
        "insert into issued values('shard-1',1,'worker_a'); "+write_command(token_a,'shadow-bypass'),
        '55000','resource fenced this token')
    final_revision=5 if rollback_fence else 4
    assert query('worker_b',write_command(token_b,'B-final'))==str(final_revision)
    final=inventory();emit('final-before-restart',final)
    assert final['claims']==[dict(resource='shard-1',holder='worker_b',epoch=2)]
    assert final['issued']==[dict(resource='shard-1',epoch=1,holder='worker_a'),dict(resource='shard-1',epoch=2,holder='worker_b')]
    expected_writes=[(1,'worker_a','A-initial'),(1,'worker_a','A-after-takeover')]
    if rollback_fence: expected_writes.append((1,'worker_a','A-racing'))
    expected_writes.extend([(2,'worker_b','B-first'),(2,'worker_b','B-final')])
    assert final['history']==[dict(resource='shard-1',revision=i+1,epoch=e,writer=w,value=v) for i,(e,w,v) in enumerate(expected_writes)]
    assert final['state']==[dict(resource='shard-1',epoch=2,writer='worker_b',value='B-final',revision=final_revision)]
    assert sql("select count(*) from pg_locks where not granted")=='0'
    stop();start();assert sql('select system_identifier from pg_control_system()')==identity
    assert inventory()==final
    reject('stale-after-restart','worker_a',write_command(token_a,'restart-bypass'),'55000','resource fenced this token')
    reject('direct-after-restart','worker_b',"update guarded.state set value='bypass'",'42501','permission denied')
    emit('final-after-restart',inventory())
finally:
    for item in clients:
        if item['process'].poll() is None:
            item['process'].kill();item['process'].wait(timeout=5)
        item['output'].close()
    stop()
    emit('cleanup',dict(server_stopped=not (data/'postmaster.pid').exists(),client_exits=[i['process'].returncode for i in clients]))
print('Inspected issued identities, resource acceptance and enforced fencing; evidence:',root,flush=True)

PY
`;
}

export const FENCING_CORE = fencingExperiment(false);
export const FENCING_VARIATION = fencingExperiment(true);

export const RESOURCE_FENCING: Draft = {
  slug: "fencing-tokens-with-a-monotonic-counter",
  title: "Fencing tokens: enforce the resource boundary and its commit order",
  revision: 4,
  tags: ["fencing", "leases", "optimistic-concurrency", "transactions", "distributed-patterns"],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 14 "Miscellaneous Locks".`,
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  sessions: 3,
  estimatedMinutes: 50,
  prerequisites: [
    "advisory-locks-as-leases",
    "optimistic-concurrency-with-version-columns",
    "idempotency-keys",
  ],
  overview: code`
A newer claim does not automatically stop an old worker at a resource that still accepts its token.
Use two restricted PostgreSQL worker logins, a controlled token issuer and a protected resource
function to observe the exact boundary. A delayed old-token write will wait behind a new fence's
uncommitted update; the commit or rollback determines whether that old write is rejected. Attempts
to omit the token, write tables directly or impersonate the function owner must fail through the
actual application roles, and the complete accepted-write history must agree with final state.`,
  syntaxBreakdown: code`
### In plain terms

The issuer says which epoch a worker received; the resource remembers the highest epoch it has
committed. Fencing rejects an older epoch at that resource. It cannot undo an old worker's write
that committed before the new fence, and merely executing a new fence inside BEGIN is insufficient.
The supplied driver coordinates unfamiliar role and process details; inspect its SQL, make a
prediction about the waiting writer, then use actual state and permission errors to defend the rule.

### What you are learning

- Claim issuance and resource acceptance have distinct commit boundaries. The resource's committed
  epoch, rather than the issuer's current holder, determines when an old token stops working.
- The resource must require a token and atomically compare it with stored state on every write.
  A caller-side predicate or a trigger that tolerates an unchanged epoch can be bypassed.
- Restricted roles and a narrow SECURITY DEFINER function enforce that interface. Token ownership,
  explicit null rejection, qualified names and controlled privileges are part of this implementation.
- A concurrent conditional UPDATE waits for an uncommitted fence, then rechecks eligibility after
  the other transaction's decision. A rolled-back fence has no lasting protection.

### Piece by piece

- The quoted Python heredoc supplies a standalone fixture. pg_config --bindir or PGBIN locates
  PostgreSQL tools; tempfile.mkdtemp allocates only this run's /tmp/pg-owned-* root. pwd/chown choose
  its owner, and root uses runuser -u for server commands. initdb -D names its data directory,
  -U creates postgres, --auth-local=trust permits the private socket, --auth-host=reject rejects
  host authentication, --no-locale fixes locale, --data-checksums enables checksums and
  --wal-segsize=1 bounds WAL segment size in MiB. This is a database-authorization experiment after
  selecting a role; the private trust-authenticated lab does not test login authentication.
- listen_addresses='' disables TCP, unix_socket_directories selects the private socket and
  port6543 names it. Inherited PG variables are cleared; PGHOST, PGPORT, PGUSER and PGDATABASE point
  only here. The driver overrides PGUSER for actual worker logins, rather than running application
  mutations as postgres. PGCONNECT_TIMEOUT=3 and PGOPTIONS bound connection setup and SQL;
  this experiment allows15-second statements/five-second lock waits for controlled concurrency.
  LC_ALL=C stabilizes errors. psql -X ignores personal startup files, -At emits unaligned tuples,
  -v ON_ERROR_STOP=1 stops on failure and -v VERBOSITY=verbose includes SQLSTATE.
- The shared helper's16MB shared_buffers and10 max_connections bound resources; wal_level=replica,
  fsync, synchronous_commit and full_page_writes retain ordinary durability. Small min/max_wal_size
  and one-hour checkpoint_timeout bound WAL policy; logging_collector=off and log_checkpoints=on
  leave server.log. pg_ctl -D -l -w -t20 starts that directory and waits for readiness; -m fast
  stops it. pg_control_system().system_identifier confirms the same database after normal restart.
- BEGIN/COMMIT install all tables, functions and grants together. CREATE ROLE gives authority_owner
  and resource_owner NOLOGIN, and workers LOGIN/NOINHERIT; NOSUPERUSER, NOCREATEDB, NOCREATEROLE and
  NOREPLICATION avoid broad application authority. CREATE SCHEMA ... AUTHORIZATION assigns each
  object's domain. SET ROLE during trusted setup creates objects under their non-login owners;
  RESET ROLE resumes setup privileges. Workers are not members of either owner role.
- authority.claims stores a resource PRIMARY KEY, holder and nonnegative epoch. authority.issued
  retains each (resource,epoch) PRIMARY KEY and the login that received it. authority.takeover is a
  PL/pgSQL VOLATILE SECURITY DEFINER function: it executes with authority_owner privileges, checks
  session_user, conditionally UPDATEs epoch=epoch+1 WHERE epoch=p_expected, INSERTs the issuance
  record and returns the token. RETURNING captures the actual result; FOUND detects a failed
  compare-and-swap. It raises40001 for a stale expected epoch and22023 for invalid input. This
  fixture explicitly authorizes the handoff to B; it does not implement lease expiry, a crash
  detector or an election. The workers are trusted to request authorized takeovers with fresh
  expectations; this counter is not an independent policy for who may become leader.
- guarded.state records resource, highest accepted epoch, writer, value and revision. guarded.history
  has PRIMARY KEY(resource,revision) and records every committed interface write. write_value has
  three required arguments with no defaults and is deliberately not STRICT: a null token reaches
  its explicit22023 check rather than silently returning null without executing. Omitting that
  argument has no matching function and produces42883. Positive issued tokens still must belong
  to session_user for that resource; another worker's token or an unissued999 fails42501.
- SECURITY DEFINER changes current_user during the function, but session_user retains the original
  authenticated login. It is used for token ownership and the recorded writer. Both functions SET
  search_path=pg_catalog,pg_temp, and all application tables are schema-qualified. Trusted setup
  revokes PUBLIC EXECUTE on the functions and PUBLIC CREATE on public; it grants workers only
  schema USAGE and EXECUTE on the two interfaces. The resource owner can SELECT authority.issued
  but cannot SELECT authority.claims. This separates issuer identity verification from current
  claim ownership even though both domains are hosted in the same private PostgreSQL process.
- The resource's UPDATE sets epoch, writer, value and revision=revision+1 only WHERE epoch<=p_epoch.
  It returns the new revision and INSERTs the matching history row in that same caller transaction.
  A missing eligible row raises55000/resource fenced this token and aborts the mutation. No API
  call can omit the epoch check. The same current token may make several different writes; fencing
  orders epochs and is not request deduplication or exactly-once execution.
- pg_roles verifies role flags. has_table_privilege and has_schema_privilege inspect denied direct
  mutations and interface replacement; has_function_privilege verifies granted execution and
  pg_has_role checks lack of owner membership. pg_proc/proowner, pg_get_userbyid, regprocedure,
  prosecdef, proisstrict, pronargdefaults and proconfig identify each function's owner, required
  arguments, null behavior and fixed search path. Worker queries of session_user/current_user and
  the concurrent backend's usename verify the actual application identity.
- A receives token1 and commits A-initial as resource revision1. B then receives token2; the issuer
  shows B/2 while the resource still shows A/1. A's issued token1 legitimately commits
  A-after-takeover as revision2 before the resource learns2. This is the interval that a lease or
  claim update alone cannot fence at another resource.
- Python Popen opens a real worker_b psql connection; BEGIN and write_value(token2,'B-first') return
  revision3 but remain uncommitted. Independent inventories still show revision2/epoch1.
  PGAPPNAME labels this client. Backslash echo marks a reached command; stdin sends a later decision,
  and backslash q exits normally. Captured logs, exit checks and bounded polling support the driver;
  markers coordinate execution while independent reads prove visibility.
- Another real worker_a connection calls write_value(token1,'A-racing'). pg_stat_activity must show
  Lock/transactionid and pg_blocking_pids must name B's idle-in-transaction backend with an XID.
  At core's B COMMIT, A's conditional UPDATE rechecks the now-epoch2 row and raises55000; A's failed
  transaction exits without a history row. In the variation B ROLLBACK removes both its tentative
  state and history. A's waiter then succeeds at epoch1/revision3. A fresh B transaction must commit
  epoch2/revision4 before the old worker is fenced. Waiting on an attempted fence is not the same
  as observing a committed fence.
- reject executes actual SQL as the named worker, captures verbose SQLSTATE and requires every
  claim/issuance/state/history row to remain unchanged. Tests include value-only and epoch-changing
  direct UPDATE, DELETE, TRUNCATE, forged history/issued INSERTs, CREATE in the protected schema,
  SET ROLE resource_owner and SET SESSION AUTHORIZATION worker_b. Each fails42501. Old-token calls
  fail55000, changed takeover expectations fail40001, and missing/null tokens fail42883/22023.
- The temporary-shadow trial creates pg_temp tables named state and issued, then tries an old token
  against the fully qualified function. The real resource still rejects it55000; neither the
  function's table references nor ownership checks are redirected to caller-created objects. The
  whole failing multi-command attempt rolls back. Schema permissions and actual escalation failures
  complement the fixed-path/catalog observations.
- json_agg with ordering and coalesce(...,'[]') records complete inventories; row_to_json captures
  diagnostics, and emit saves JSON beside raw client/error logs. Final history must exactly match
  accepted values, epochs, writer identities and contiguous revisions. B's current token succeeds
  again with B-final. Core ends with four writes; the rollback variation has five because A-racing
  committed before the replacement fence. Both end at epoch2, writerB, valueB-final and issuerB/2.
- Normal stop/start preserves the full inventory and system identity. Old-token rejection and B's
  own direct-write denial still hold afterward. pg_locks verifies no waiting lock remains. finally
  reaps only this run's clients, stops the private server and retains its data/logs/JSON. This test
  does not create a network partition, pause a VM, measure lease expiry or exercise power failure.`,
  code: FENCING_CORE,
  expectedResult: code`
Worker connections identify as worker_a/worker_b and have resource-interface execution but no direct
table writes, schema creation or owner-role membership. Both definer functions have qualified
objects, trusted search paths, no default arguments and explicit null handling. A gets token1 and
writes revision1. B's issued token2 changes the claim to B/2 while resource epoch1 remains; A still
writes revision2 with token1 before the resource accepts2.

B's uncommitted resource write returns revision3 but independent state remains revision2/epoch1.
A's old-token call actually waits on B's transaction ID. Core commits B: resource becomes
B-first/epoch2/revision3 and A fails55000 without changing history. The variation rolls back B:
A's waiting call instead commits A-racing/epoch1/revision3. A fresh B call then commits
B-first/epoch2/revision4. In both paths, only the committed resource fence makes later token1 calls
fail55000; the issuer takeover itself did not.

Omitted token fails42883, null token fails22023, unissued or another worker's token fails42501.
Value-only/epoch-changing direct writes, DELETE/TRUNCATE, forged history/issued rows, protected-schema
creation, owner-role assumption and login impersonation all fail42501. A stale takeover expectation
fails40001. Caller-created temporary tables do not redirect the qualified interface; its old-token
call still fails55000. Every rejected attempt preserves all four inventories.

B's valid current-token B-final write succeeds. Core history is A-initial/1, A-after-takeover/1,
B-first/2, B-final/2, with revisions1–4. Variation inserts A-racing/1 before the first committed B
write, with revisions1–5. Final resource is B-final/epoch2/writer worker_b; the claim is B/2 and
issued tokens are exactly1 for A and2 for B. All values/history survive normal restart; old-token
rejection and even B's own direct-write denial persist. The server stops with no waiting client.
Paths, PIDs, XIDs and system identifiers vary. Repeated same-epoch writes are permitted; this is
fencing, not idempotency.`,
  systemsLens: code`
Authority to act and a resource's acceptance of that authority are distinct state transitions.
A resource can reject an old generation only after learning a newer one, and a transaction that
rolls back has not durably taught it anything. Enforcing the comparison at a narrow interface makes
omitted predicates and unchanged epoch columns ineffective bypasses. Issued identity, protected
state and role privileges are explicit local mechanisms here; a distributed deployment also needs
an authoritative issuer, authenticated workers and a way for each independent resource to verify
credentials. This colocated experiment does not turn a counter into consensus or a lease timer into
an external write fence.`,
  challenge: code`
Predict A's waiting write when B rolls back its attempted resource fence. Run the complete hint2
variation and identify the exact state transition after which A starts being rejected. Explain the
extra accepted history row and why it does not contradict fencing. Then specify the issuer policy,
worker credentials, resource interface, epoch retention and failure boundaries for a worker that may
resume after takeover. Identify what guarantees remain if callers can update the resource directly,
and why multiple writes with the same valid epoch still need separate idempotency when retried.`,
  caution: code`
Run the complete block in a shell with Python3 and PostgreSQL16 server tools. It creates one private
cluster with dedicated owner/worker roles, holds two real transactions briefly, attempts explicit
permission violations and stops the server afterward. The private trust-authenticated socket is a
lab convenience; the experiment proves PostgreSQL role enforcement for the selected worker logins,
not authentication against an OS user who controls the lab. Only the printed owned data directory
is restarted or stopped. Learner databases and progress remain untouched.`,
};
