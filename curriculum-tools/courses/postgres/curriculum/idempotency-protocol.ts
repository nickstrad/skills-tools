import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function idempotencyExperiment(winnerAborts: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\nwinner_aborts = ${winnerAborts ? "True" : "False"}\n` + code`
# A fresh private cluster is initialized above. Only the first winner's fate varies.
clients=[]
env['PGOPTIONS']='-c statement_timeout=15000 -c lock_timeout=5000'

def quote(value):
    return "'"+str(value).replace("'","''")+"'"

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def rows(table,order):
    return json.loads(sql("select coalesce(json_agg(r order by "+order+"),'[]') from "+table+' r'))

def state():
    return dict(accounts=rows('accounts','id'),receipts=rows('receipts','request_id'),
                history=rows('debit_history','entry_id'))

def command(key,account,amount):
    return 'select apply_debit('+quote(key)+','+str(account)+','+str(amount)+')'

def attempt(query):
    return subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1',
        '-v','VERBOSITY=verbose','-c',query],env=env,text=True,capture_output=True,timeout=20)

def apply(key,account,amount):
    # Each attempt is a new connection and implicit transaction. Never retry payload/retirement errors.
    for number in range(1,4):
        result=attempt(command(key,account,amount))
        if result.returncode==0:
            return int(result.stdout.strip())
        if '40001:' not in result.stderr or number==3:
            raise RuntimeError(result.stdout+result.stderr)
        time.sleep(0.05*number)

def reject(label,query,code,message):
    before=state();result=attempt(query)
    (root/(label+'.log')).write_text(result.stdout+result.stderr)
    assert result.returncode!=0 and code+':' in result.stderr and message in result.stderr,result.stderr
    assert state()==before
    emit(label,dict(sqlstate=code,error=result.stderr.strip(),state_unchanged=True))

def launch(label):
    path=root/(label+'.log');output=path.open('w')
    process=subprocess.Popen([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1'],
        env=dict(env,PGAPPNAME=label),stdin=subprocess.PIPE,stdout=output,stderr=subprocess.STDOUT,text=True)
    item=dict(label=label,path=path,output=output,process=process)
    clients.append(item)
    return item

def send(item,commands,marker):
    item['process'].stdin.write(commands+'\n\\echo '+marker+'\n');item['process'].stdin.flush()

def reached(item,marker):
    def check():
        assert item['process'].poll() is None,item['path'].read_text()
        return marker in item['path'].read_text().splitlines()
    wait_for(item['label']+' '+marker,check,seconds=12)

def worker(label,commands,marker):
    item=launch(label);send(item,commands,marker);reached(item,marker)
    return item

def backend(item):
    return json.loads(sql("select row_to_json(a) from (select pid,state,backend_xid::text as xid,"
        "wait_event_type,wait_event,pg_blocking_pids(pid) as blockers from pg_stat_activity "
        "where application_name="+quote(item['label'])+") a"))

def held(item):
    value=backend(item)
    assert value['state']=='idle in transaction' and value['xid'],value
    return value

def blocked(item,winner):
    winner_pid=held(winner)['pid']
    def check():
        value=backend(item)
        return value if value and value['wait_event_type']=='Lock' and value['wait_event']=='transactionid' and winner_pid in value['blockers'] else None
    value=wait_for('actual unique-conflict wait',check,seconds=4)
    emit(item['label']+'-wait',value)

def close(item):
    item['process'].stdin.write('\\q\n');item['process'].stdin.flush()
    assert item['process'].wait(timeout=5)==0,item['path'].read_text()
    item['output'].close()

def lose(item):
    before=backend(item);assert item['process'].poll() is None
    item['process'].kill();exit_code=item['process'].wait(timeout=5)
    assert exit_code==-9
    item['output'].close()
    wait_for('lost client backend gone',lambda: sql('select count(*) from pg_stat_activity where application_name='+quote(item['label']))=='0')
    emit(item['label']+'-loss',dict(backend_before=before,client_exit=exit_code,backend_gone=True))

try:
    start()
    identity=sql('select system_identifier from pg_control_system()')
    emit('configuration',dict(system_identifier=identity,version=sql('show server_version'),
        isolation=sql('show transaction_isolation'),fsync=sql('show fsync'),
        synchronous_commit=sql('show synchronous_commit'),full_page_writes=sql('show full_page_writes'),
        winner_fate='ROLLBACK' if winner_aborts else 'COMMIT'))
    sql('''
create table accounts(id int primary key,balance int not null check(balance>=0));
insert into accounts values(1,100),(2,100),(3,100),(4,100);
create table receipts(
 request_id text primary key,account_id int not null references accounts(id),
 amount int not null check(amount>0),status text not null default 'active' check(status in ('active','retired')),
 balance_after int
);
-- Deliberately no unique request_id here: this audit must expose an unsafe repeated business debit.
create table debit_history(
 entry_id bigint generated always as identity primary key,request_id text not null,
 account_id int not null references accounts(id),amount int not null,balance_after int not null
);
create function apply_debit(p_request text,p_account int,p_amount int)
returns int language plpgsql volatile as $fn$
declare inserted_count int; saved public.receipts%rowtype; result_balance int;
begin
 if p_request is null or btrim(p_request)='' or p_account is null or p_amount is null or p_amount<=0 then
  raise exception using errcode='22023',message='request identity and positive payload required';
 end if;
 insert into public.receipts(request_id,account_id,amount) values(p_request,p_account,p_amount)
  on conflict(request_id) do nothing;
 get diagnostics inserted_count=row_count;
 if inserted_count=0 then
  -- A separate SQL command in this VOLATILE function gets a fresh Read Committed snapshot.
  select * into saved from public.receipts where request_id=p_request;
  if not found then
   raise exception using errcode='40001',message='receipt unavailable; retry a fresh transaction';
  end if;
  if saved.account_id<>p_account or saved.amount<>p_amount then
   raise exception using errcode='22023',message='request identity reused with different payload';
  end if;
  if saved.status='retired' then
   raise exception using errcode='55000',message='request identity retired; reconcile retained history';
  end if;
  if saved.balance_after is null then
   raise exception using errcode='40001',message='receipt unavailable; retry a fresh transaction';
  end if;
  return saved.balance_after;
 end if;
 update public.accounts set balance=balance-p_amount where id=p_account and balance>=p_amount
  returning balance into result_balance;
 if not found then
  raise exception using errcode='22003',message='insufficient balance';
 end if;
 insert into public.debit_history(request_id,account_id,amount,balance_after)
  values(p_request,p_account,p_amount,result_balance);
 update public.receipts set balance_after=result_balance where request_id=p_request;
 return result_balance;
end
$fn$;
''')
    initial=state();emit('initial',initial)
    # Session A performs a real debit, but its caller has not committed yet.
    a=worker('race-winner','BEGIN; '+command('race',1,20)+';','WINNER_HELD')
    emit('winner-uncommitted',dict(backend=held(a),visible=state()))
    assert state()==initial
    # Session B reproduces the old single-statement lookup. This diagnostic INSERT is always rolled back.
    b=launch('cte-loser')
    send(b,"""BEGIN;
with ins as (
 insert into receipts(request_id,account_id,amount) values('race',1,20)
 on conflict(request_id) do nothing returning balance_after
)
select coalesce(json_agg(r),'[]') from (
 select balance_after from ins union all
 select balance_after from receipts where request_id='race'
) r;
""",'CTE_RETURNED')
    blocked(b,a)
    send(a,'ROLLBACK;' if winner_aborts else 'COMMIT;','WINNER_DECIDED');reached(a,'WINNER_DECIDED')
    reached(b,'CTE_RETURNED')
    cte_result=[json.loads(line) for line in b['path'].read_text().splitlines() if line.startswith('[')]
    assert cte_result==[[dict(balance_after=None)]] if winner_aborts else cte_result==[[]],cte_result
    send(b,'ROLLBACK;','DIAGNOSTIC_ROLLED_BACK');reached(b,'DIAGNOSTIC_ROLLED_BACK')
    close(a);close(b)
    after_race=state()
    assert after_race['accounts'][0]['balance']==(100 if winner_aborts else 80)
    assert len(after_race['history'])==(0 if winner_aborts else 1)
    emit('cte-race-outcome',dict(result=cte_result[0],diagnostic_rolled_back=True,state=after_race))
    assert apply('race',1,20)==80
    assert len(state()['history'])==1
    assert apply('later',1,5)==75
    before_replay=state();assert apply('race',1,20)==80;assert state()==before_replay
    emit('original-result-replay',dict(returned=80,current_balance=75,state=state()))

    # Correct concurrent calls: B waits, then the function's separate SELECT returns A's result.
    a=worker('correct-winner','BEGIN; '+command('concurrent',2,30)+';','CORRECT_HELD')
    b=launch('correct-loser');send(b,'BEGIN; '+command('concurrent',2,30)+';','CORRECT_RETURNED')
    blocked(b,a)
    send(a,'COMMIT;','CORRECT_COMMITTED');reached(a,'CORRECT_COMMITTED');reached(b,'CORRECT_RETURNED')
    assert '70' in b['path'].read_text().splitlines()
    send(b,'COMMIT;','RETRY_COMMITTED');reached(b,'RETRY_COMMITTED');close(a);close(b)
    concurrent=state()
    assert concurrent['accounts'][1]['balance']==70
    assert len([r for r in concurrent['history'] if r['request_id']=='concurrent'])==1
    emit('correct-concurrent-result',dict(returned=70,state=concurrent))
    reject('payload-mismatch',command('concurrent',2,31),'22023','different payload')
    reject('account-mismatch',command('concurrent',1,30),'22023','different payload')
    reject('insufficient-balance',command('too-large',1,1000),'22003','insufficient balance')

    # Actual caller process loss; the parent's observations classify the boundary for the learner.
    before_loss=state()
    a=worker('lost-before','BEGIN; '+command('lost-before',1,10)+';','DEBIT_UNCOMMITTED')
    held(a);assert state()==before_loss;lose(a);assert state()==before_loss
    assert apply('lost-before',1,10)==65
    emit('before-commit-recovery',state())
    a=worker('lost-after','BEGIN; '+command('lost-after',1,10)+'; COMMIT;','DEBIT_COMMITTED')
    observed=backend(a);assert observed['state']=='idle' and observed['xid'] is None
    committed=state();assert committed['accounts'][0]['balance']==55
    assert [r for r in committed['receipts'] if r['request_id']=='lost-after'][0]['balance_after']==55
    emit('after-commit-before-loss',committed);lose(a);assert state()==committed
    assert apply('lost-after',1,10)==55 and state()==committed
    emit('after-commit-recovery',dict(returned=55,state=state()))

    # Isolated deliberate failure: deleting a receipt does not undo its debit.
    assert apply('unsafe-retention',3,9)==91
    unsafe_first=state();sql("delete from receipts where request_id='unsafe-retention'")
    assert state()['accounts'][2]['balance']==91
    assert apply('unsafe-retention',3,9)==82
    unsafe_second=state()
    assert len([r for r in unsafe_second['history'] if r['request_id']=='unsafe-retention'])==2
    emit('unsafe-receipt-deletion',dict(first=unsafe_first,after_reuse=unsafe_second,extra_debit=9))
    # Safe retirement removes the cached response but retains the admission guard in the same PK row.
    assert apply('retained-guard',4,9)==91
    sql("update receipts set status='retired',balance_after=null where request_id='retained-guard'")
    reject('retired-identity',command('retained-guard',4,9),'55000','identity retired')
    final=state()
    assert final['accounts']==[dict(id=i,balance=b) for i,b in [(1,55),(2,70),(3,82),(4,91)]]
    assert len(final['receipts'])==7 and len(final['history'])==8
    expected={'race':(1,20,80),'later':(1,5,75),'concurrent':(2,30,70),
        'lost-before':(1,10,65),'lost-after':(1,10,55),'unsafe-retention':(3,9,82),'retained-guard':(4,9,None)}
    for receipt in final['receipts']:
        account,amount,result=expected[receipt['request_id']]
        assert (receipt['account_id'],receipt['amount'],receipt['balance_after'])==(account,amount,result)
        assert receipt['status']==('retired' if result is None else 'active')
        effects=[r for r in final['history'] if r['request_id']==receipt['request_id']]
        assert len(effects)==(2 if account==3 else 1)
        assert all(r['account_id']==account and r['amount']==amount for r in effects)
        assert effects[-1]['balance_after']==(91 if result is None else result)
    for account in final['accounts']:
        effects=[r for r in final['history'] if r['account_id']==account['id']]
        balance=100
        for effect in effects:
            balance-=effect['amount'];assert balance==effect['balance_after']
        assert balance==account['balance']
    emit('final-before-restart',final)
    stop();start()
    assert sql('select system_identifier from pg_control_system()')==identity
    assert state()==final
    assert apply('race',1,20)==80 and state()==final
    reject('retired-after-restart',command('retained-guard',4,9),'55000','identity retired')
    emit('final-after-restart',state())
finally:
    for item in clients:
        if item['process'].poll() is None:
            item['process'].kill();item['process'].wait(timeout=5)
        item['output'].close()
    stop()
    emit('cleanup',dict(server_stopped=not (data/'postmaster.pid').exists(),
        client_exit_codes=[item['process'].returncode for item in clients]))
print('Inspected identity, payload, effect, result and retention boundaries; evidence:',root,flush=True)

PY
`;
}

export const IDEMPOTENCY_CORE = idempotencyExperiment(false);
export const IDEMPOTENCY_VARIATION = idempotencyExperiment(true);

export const IDEMPOTENCY_KEYS: Draft = {
  slug: "idempotency-keys",
  title: "Idempotency keys: recover concurrent and unknown request outcomes",
  revision: 4,
  tags: ["idempotency", "unique-constraints", "retries", "distributed-patterns"],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 12 "Relation-Level Locks".`,
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  sessions: 3,
  estimatedMinutes: 50,
  prerequisites: ["unique-constraint-race", "unknown-commit-outcome", "transactional-outbox"],
  overview: code`
A unique receipt is useful only if it agrees with the request payload, actual business effect and
answer returned on replay. Race two requests against a held transaction: the old combined
insert-or-select query can return no answer even after its rival commits. Then use separate SQL
commands in an atomic debit-and-receipt function, recover actual client loss before and after commit,
and compare receipt deletion with retirement that retains an identity guard. Four independent
accounts keep the safe outcomes and deliberately duplicated debit distinguishable.`,
  syntaxBreakdown: code`
### In plain terms

A receipt records which request changed which account, by how much, and what answer that request
produced. It is committed together with the debit and its history. The experiment asks whether a
concurrent duplicate, a restarted caller or an old request after retention expiry can charge again.
The Python driver supplies unfamiliar process coordination; inspect the SQL and saved evidence,
then choose an admission and recovery policy.

### What you are learning

- A uniqueness conflict can depend on a transaction newer than the statement's read snapshot.
  Waiting for that transaction does not refresh a SELECT in the same statement.
- Identity, payload agreement, business mutation and saved result form one transactional protocol.
  Returning a function result inside BEGIN does not prove its caller committed.
- A replay returns the original answer, even after other requests change the account balance.
  A lost caller must reuse the same identity and payload in a fresh transaction.
- Removing a receipt permits the key to look new. Retaining the identity while retiring its cached
  response can refuse reexecution, but cannot promise the discarded answer or bounded key storage.

### Piece by piece

- The shell's quoted Python heredoc supplies a complete standalone fixture. pg_config --bindir (or
  PGBIN) locates PostgreSQL; tempfile.mkdtemp creates only this run's /tmp/pg-owned-* directory.
  Root uses pwd, chown and runuser -u to run server commands as postgres; other users own their lab.
  Python's subprocess calls use argument arrays, captured output, exit checks and bounded waits.
- initdb -D selects that private data directory; -U creates postgres, --auth-local=trust allows this
  owned socket, --auth-host=reject rejects host authentication, --no-locale fixes locale,
  --data-checksums enables page checks and --wal-segsize=1 bounds WAL segment size in MiB.
  listen_addresses='' disables TCP; unix_socket_directories selects the private socket and port
  6543 names it. Inherited PG variables are cleared; PGHOST, PGPORT, PGUSER and PGDATABASE point only
  here. PGCONNECT_TIMEOUT=3 bounds connection setup and LC_ALL=C makes diagnostics consistent.
- shared_buffers=16MB and max_connections=10 bound resources. wal_level=replica, fsync=on,
  synchronous_commit=on and full_page_writes=on retain ordinary durability; min/max_wal_size and a
  one-hour checkpoint_timeout bound this small fixture's WAL policy. logging_collector=off and
  log_checkpoints=on leave evidence in server.log. These are fixture settings, not tuning advice.
  pg_ctl -D -l -w -t 20 starts and waits for readiness with that log; -m fast stops only this server.
  pg_control_system().system_identifier verifies the same cluster across a normal restart.
- psql -X ignores personal startup files; -At emits unaligned tuples, -v ON_ERROR_STOP=1 makes SQL
  failure stop the client and -v VERBOSITY=verbose includes SQLSTATE for expected rejections.
  PGOPTIONS sets a 15-second statement_timeout and five-second lock_timeout. PGAPPNAME labels each
  client; persistent Popen stdin permits BEGIN, a held function call, then COMMIT or ROLLBACK.
  Backslash echo marks a reached command boundary; backslash q exits normally. Markers coordinate
  the driver, while independent database reads establish visibility and committed effects.
- accounts has a nonnegative balance CHECK. receipts has a request_id PRIMARY KEY, account FOREIGN
  KEY, positive-amount CHECK, active/retired status and nullable balance_after. The response is null
  during an uncommitted creation or after explicit retirement. debit_history uses GENERATED ALWAYS
  AS IDENTITY for ordering actual effects; sequence gaps after rollback are valid. Its request_id
  deliberately is not unique, so the audit can expose repeated debits when a receipt is deleted.
- apply_debit is a PL/pgSQL VOLATILE function. It validates the request with null checks and btrim,
  then INSERT ... ON CONFLICT(request_id) DO NOTHING reserves the identity. GET DIAGNOSTICS
  ROW_COUNT distinguishes creation from a duplicate. For a duplicate, a separate SELECT INTO a
  receipts%rowtype variable gets a fresh snapshot at Read Committed. FOUND distinguishes a missing
  row. The function checks saved account and amount before returning the saved balance_after.
- A new request uses UPDATE ... WHERE balance>=p_amount RETURNING to debit only a funded account,
  records its history and updates the receipt's result inside the same caller transaction.
  RAISE EXCEPTION USING ERRCODE aborts all those changes: 22003 means insufficient balance,
  22023 means invalid or changed payload, 55000 means the identity is retired, and 40001 asks for a
  fresh transaction if the receipt/result is unavailable. Python apply allows at most three fresh
  implicit transactions for 40001, with short bounded delays; other failures stop immediately.
  No unavailable-receipt retry is needed in these controlled successful runs. The protocol assumes
  all active writers use it and retain identities; arbitrary direct SQL could bypass it.
- WITH ins AS (INSERT ... RETURNING) exposes inserted rows to UNION ALL with a SELECT of an
  existing receipt. Both parts share one statement snapshot. Session A holds a real debit; B starts
  this diagnostic statement and waits on A. pg_stat_activity records state, backend_xid and
  wait_event_type/ wait_event; pg_blocking_pids must name A for the observed Lock/transactionid wait.
  Only then does the driver decide A's fate. A commit leaves B with an empty JSON array: uniqueness
  sees the winner, while the old SELECT snapshot cannot. B's diagnostic transaction always rolls
  back. A fresh apply_debit call obtains the stored result without another debit.
- In the variation A rolls back. B can insert the diagnostic receipt and returns a null result;
  that insert-only fragment did not do a debit. B rolls it back, then the complete function creates
  receipt, debit and answer atomically. This temporary incomplete row is never committed as a
  working API response. The second concurrent trial calls the complete function in both sessions;
  B waits for A's commit, then its internal fresh SELECT returns 70 without another debit.
- Popen.kill sends SIGKILL to an actual owned psql caller; wait reaps it with exit -9. The driver
  waits until its backend disappears. Before-commit loss removes debit, history and receipt;
  after-commit loss preserves all three. The parent classifies the boundary through independent
  reads. This models caller process loss and recovery, not measured packet loss: forensic client
  logs can contain a result even though the killed caller no longer acts on it.
- json_agg with ordering and coalesce(...,'[]') produces complete inventories, and row_to_json
  records backend evidence. reject requires the expected SQLSTATE/message and unchanged full state.
  emit writes JSON files beside raw client logs. Replaying race returns 80 while its account is
  already 75; later caller-loss trials leave it 55. A too-large request tests atomic rollback on a
  business error; changed amount and changed account both test payload agreement.
- DELETE of unsafe-retention's receipt leaves account3's first debit intact; reuse debits another9.
  UPDATE of retained-guard instead keeps its primary key and payload, sets status='retired' and
  discards balance_after. Reuse fails55000; account4 stays91. This controlled retirement is an
  admission policy, not a measured TTL service. The retained history supports explicit
  reconciliation; deleting this guard later would reopen the same failure.
- Final assertions reconcile every receipt with its history, each intermediate saved balance and
  each account's starting100 minus committed debits. A normal stop/start preserves the full
  inventory; replay and retirement refusal are checked again. finally kills/reaps only outstanding
  owned clients, stops this server, and retains data, JSON and logs. Normal restart does not test
  host power failure, and one private database does not make arbitrary external effects atomic.`,
  code: IDEMPOTENCY_CORE,
  expectedResult: code`
Core observes the actual CTE loser waiting on the winner's transaction ID. After the winner commits,
that single statement returns [] even though an independently visible receipt records debit20 and
answer80. Its diagnostic transaction rolls back. A fresh complete request returns80 without another
debit. After a different request debits5, replay still returns80 while the account balance is75.

The complete concurrent calls both return70 for account2, with one committed debit30 and receipt.
Changed amount or account fails22023; insufficient balance fails22003 without any receipt or debit
for too-large. Killing lost-before's uncommitted caller leaves no effects; its fresh retry debits10
once. Killing lost-after's caller after independent commit evidence preserves its debit10 and
answer55; replay returns55 with no new history. Both killed clients exit -9 and lose their backends.

The deliberate unsafe account3 trial moves100 to91, deletes only the receipt, then repeats the same
request to reach82 with two debit9 history rows. Keep this as failure evidence. The safe retirement
trial leaves account4 at91 and a retained key with no cached answer; replay fails55000 without a
second debit. Final accounts1/2/3/4 are55/70/82/91, with seven receipts and eight committed history
rows. All payloads, saved results, history amounts and account totals reconcile and survive a
normal server restart. Replaying race still returns80; the retired key still fails55000.

The variation changes only the first winner to ROLLBACK: the diagnostic CTE returns one null result,
then is rolled back; a fresh complete call applies the sole committed debit20. Final domain values
match core, though history sequence IDs may differ because aborted allocations are not reused.
Paths, PIDs, XIDs, system identifier and timing vary. The claimed guarantee depends on retained
request identities, unchanged payloads and controlled writers using this transaction protocol.`,
  systemsLens: code`
A key coordinates admission, while a transaction ties identity to effect and result. Neither a
unique row nor a missing response proves which business outcome occurred. A read snapshot is a
separate boundary from uniqueness enforcement, so recovery must choose a fresh observation scope.
Retention is part of the API's semantics: once a name can look new again, old delivery can become a
new effect. Keeping an identity guard can refuse reexecution after cached results expire, at the
cost of retained identity storage and explicit reconciliation when callers still need an answer.`,
  challenge: code`
Predict the first waiter's result when the winner aborts instead of committing. Run the complete
variation in coaching hint2; compare the CTE output, the independent balance before recovery and
committed history afterward. Explain why rolling back the insert-only diagnostic is necessary.
Then specify the key namespace, payload agreement, retry bound, result retention and expired-key
admission rule for an API whose clients may retry months later. Use account3's repeated debit and
account4's refusal to defend the tradeoff; do not assume expiring keys makes retries safe.`,
  caution: code`
Run the complete block in a shell with Python3 and PostgreSQL16 server tools. It creates and stops
one private Unix-socket cluster, kills two of its own psql clients and deliberately repeats one
isolated debit after unsafe receipt deletion. It retains evidence under the printed /tmp path.
The intended protocol keeps identity guards indefinitely and assumes controlled writers; the
receipt-deletion trial violates that policy on account3. No learner cluster or progress is touched.`,
};
