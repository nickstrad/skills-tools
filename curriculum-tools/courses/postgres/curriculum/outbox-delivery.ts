import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function outboxExperiment(afterAck: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\nlose_after_ack = ${afterAck ? "True" : "False"}\n` + code`
receiver_data,receiver_sock,receiver_log=root/'receiver',root/'receiver-socket',root/'receiver.log'
receiver_sock.mkdir()
if os.geteuid()==0:
    os.chown(receiver_sock,owner.pw_uid,owner.pw_gid)
receiver_env=dict(env,PGHOST=str(receiver_sock))
clients=[]
relays=[]

def quote(value):
    return "'"+str(value).replace("'","''")+"'"

def query(target,command):
    result=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',command],
        env=target,text=True,capture_output=True,timeout=10)
    assert result.returncode==0,result.stdout+result.stderr
    return result.stdout.strip()

def receive_sql(command):
    return query(receiver_env,command)

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def inventory(target,table,order):
    return json.loads(query(target,"select coalesce(json_agg(r order by "+order+"),'[]') from "+table+' r'))

def outbox():
    return inventory(env,'source_outbox','event_id')

def receipts():
    return inventory(receiver_env,'receiver_receipts','event_id')

def total():
    return int(receive_sql('select total from receiver_balance where id=1'))

def claim_command(owner_name):
    return ("with candidate as (select event_id from source_outbox where status='pending' or "
        "(status='claimed' and lease_until<clock_timestamp()) order by event_id for update skip locked limit 1), "
        "claimed as (update source_outbox o set status='claimed',owner="+quote(owner_name)+
        ",generation=generation+1,attempts=attempts+1,lease_until=clock_timestamp()+interval '5 minutes' "
        "from candidate c where o.event_id=c.event_id returning o.event_id,o.order_id,o.payload,o.owner,o.generation) "
        "select coalesce(json_agg(c),'[]') from claimed c")

def claim(owner_name):
    return json.loads(sql(claim_command(owner_name)))

def acknowledge_command(token):
    return ("with acknowledged as (update source_outbox set status='sent',sent_at=clock_timestamp(),lease_until=null "
        "where event_id="+str(token['event_id'])+' and owner='+quote(token['owner'])+
        ' and generation='+str(token['generation'])+" and status='claimed' returning event_id) "
        'select count(*) from acknowledged')

def apply_command(token):
    return 'select apply_order('+quote(origin)+','+str(token['event_id'])+','+quote(json.dumps(token['payload']))+'::jsonb)'

def worker(label,target,commands,marker):
    path=root/(label+'.log');output=path.open('w')
    process=subprocess.Popen([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1'],
        env=dict(target,PGAPPNAME=label),stdin=subprocess.PIPE,stdout=output,stderr=subprocess.STDOUT,text=True)
    item=dict(label=label,target=target,path=path,output=output,process=process)
    clients.append(item)
    send(item,commands,marker)
    return item

def send(item,commands,marker):
    item['process'].stdin.write(commands+'\n\\echo '+marker+'\n');item['process'].stdin.flush()
    def reached():
        assert item['process'].poll() is None,item['path'].read_text()
        return marker in item['path'].read_text().splitlines()
    wait_for(item['label']+' '+marker,reached)

def backend(item):
    return json.loads(query(item['target'],"select row_to_json(a) from (select pid,state,backend_xid::text as xid "
        "from pg_stat_activity where application_name="+quote(item['label'])+") a"))

def lose_client(item):
    assert item['process'].poll() is None
    item['process'].kill();assert item['process'].wait(timeout=5)<0;item['output'].close()
    wait_for(item['label']+' backend gone',lambda: query(item['target'],
        "select count(*) from pg_stat_activity where application_name="+quote(item['label']))=='0')

def close_client(item):
    item['process'].stdin.write('\\q\n');item['process'].stdin.flush()
    assert item['process'].wait(timeout=5)==0,item['path'].read_text()
    item['output'].close()

def app_commands(order_id,customer,amount):
    return ('insert into source_orders values('+str(order_id)+','+quote(customer)+','+str(amount)+'); '+
        "insert into source_outbox(order_id,payload) values("+str(order_id)+",jsonb_build_object('event','order_created',"
        "'order_id',"+str(order_id)+",'customer',"+quote(customer)+",'amount',"+str(amount)+'));')

# This separate Python relay really calls both endpoints; the parent kills it at observed boundaries.
relay_program=r'''
import json,pathlib,subprocess,sys
spec=json.loads(pathlib.Path(sys.argv[1]).read_text())
def run(target,command):
    result=subprocess.run([spec['psql'],'-X','-At','-v','ON_ERROR_STOP=1','-c',command],
        env=spec[target],text=True,capture_output=True,timeout=10)
    assert result.returncode==0,result.stdout+result.stderr
    return result.stdout.strip()
applied=run('receiver_env',spec['apply'])
pathlib.Path(spec['receiver_marker']).write_text(json.dumps(dict(new_effects=int(applied))))
assert sys.stdin.readline().strip()=='ACK'
acknowledged=run('source_env',spec['acknowledge'])
assert acknowledged=='1',acknowledged
pathlib.Path(spec['sender_marker']).write_text(json.dumps(dict(sent_rows=int(acknowledged))))
assert sys.stdin.readline().strip()=='EXIT'
'''

def launch_relay(token):
    script=root/'relay.py';script.write_text(relay_program)
    spec=dict(psql=str(bindir/'psql'),source_env=dict(env,PGAPPNAME='owned_relay_sender'),
        receiver_env=dict(receiver_env,PGAPPNAME='owned_relay_receiver'),apply=apply_command(token),
        acknowledge=acknowledge_command(token),receiver_marker=str(root/'relay-receiver-committed.json'),
        sender_marker=str(root/'relay-sender-acknowledged.json'))
    config=root/'relay-config.json';config.write_text(json.dumps(spec))
    logfile=root/'relay-process.log';output=logfile.open('w')
    process=subprocess.Popen(['python3',str(script),str(config)],stdin=subprocess.PIPE,stdout=output,stderr=subprocess.STDOUT,text=True)
    item=dict(process=process,output=output,path=logfile,spec=spec)
    relays.append(item)
    return item

def relay_marker(item,name):
    path=pathlib.Path(item['spec'][name])
    def reached():
        assert item['process'].poll() is None,item['path'].read_text()
        return path.exists() and path.stat().st_size>0
    wait_for('relay '+name,reached)
    return json.loads(path.read_text())

try:
    start()
    sql('create extension pgrowlocks')
    server('initdb','-D',receiver_data,'-U','postgres','--auth-local=trust','--auth-host=reject',
        '--no-locale','--data-checksums','--wal-segsize=1')
    with (receiver_data/'postgresql.conf').open('a') as config:
        config.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='"+str(receiver_sock)+"'\n"
            "shared_buffers='16MB'\nmax_connections=10\nfsync=on\nsynchronous_commit=on\nfull_page_writes=on\n"
            "min_wal_size='2MB'\nmax_wal_size='8MB'\ncheckpoint_timeout='1h'\nlogging_collector=off\nautovacuum=off\n")
    server('pg_ctl','-D',receiver_data,'-l',receiver_log,'-w','-t','20','start',timeout=25)
    source_id=sql('select system_identifier::text from pg_control_system()')
    receiver_id=receive_sql('select system_identifier::text from pg_control_system()')
    assert source_id!=receiver_id and receive_sql('show data_directory')==str(receiver_data)
    origin=source_id+':postgres:source_outbox:v1'
    sql("""create table source_orders(order_id int primary key,customer text not null,amount int not null check(amount>0));
    create table source_outbox(event_id bigint generated always as identity primary key,
      order_id int not null unique references source_orders(order_id),payload jsonb not null,
      status text not null default 'pending' check(status in ('pending','claimed','sent')),
      owner text,generation bigint not null default 0,attempts int not null default 0,
      lease_until timestamptz,sent_at timestamptz)""")
    receive_sql("""create table receiver_receipts(origin text not null,event_id bigint not null,payload jsonb not null,
      primary key(origin,event_id));
    create table receiver_balance(id int primary key check(id=1),total bigint not null);
    insert into receiver_balance values(1,0);
    create function apply_order(p_origin text,p_event bigint,p_payload jsonb) returns int language plpgsql volatile as $$
    declare saved jsonb; amount int;
    begin
      if p_origin is null or btrim(p_origin)='' or p_event is null or p_event<=0 or p_payload is null
         or p_payload->>'event' is distinct from 'order_created' or p_payload->>'amount' is null then
        raise exception 'invalid event identity or payload' using errcode='22023';
      end if;
      amount:=(p_payload->>'amount')::int;
      if amount<=0 then raise exception 'positive amount required' using errcode='22023'; end if;
      insert into public.receiver_receipts values(p_origin,p_event,p_payload) on conflict do nothing;
      if found then
        update public.receiver_balance set total=total+amount where id=1;
        if not found then raise exception 'receiver balance missing' using errcode='22000'; end if;
        return 1;
      end if;
      select payload into saved from public.receiver_receipts where origin=p_origin and event_id=p_event;
      if not found then raise exception 'receipt unavailable' using errcode='40001'; end if;
      if saved is distinct from p_payload then
        raise exception 'receipt payload mismatch' using errcode='22023';
      end if;
      return 0;
    end $$""")
    emit('owned_outbox_endpoints',dict(source_id=source_id,receiver_id=receiver_id,origin=origin,
        source=str(data),receiver=str(receiver_data),lose_after_ack=lose_after_ack))

    aborted=worker('owned_aborted_application',env,'begin; '+app_commands(99,'aborted',99),'APPLICATION_UNCOMMITTED')
    state=backend(aborted)
    assert state['state']=='idle in transaction' and state['xid'] is not None
    assert inventory(env,'source_orders','order_id')==[] and outbox()==[] and claim('invisible-reader')==[]
    lose_client(aborted)
    assert inventory(env,'source_orders','order_id')==[] and outbox()==[]
    emit('application_process_loss_is_atomic',dict(backend_before_loss=state,orders=[],outbox=[],receiver_total=total()))
    sql('begin; '+app_commands(1,'ada',7)+' commit')
    sql('begin; '+app_commands(3,'grace',11)+' commit')
    orders=inventory(env,'source_orders','order_id');messages=outbox()
    assert orders==[dict(order_id=1,customer='ada',amount=7),dict(order_id=3,customer='grace',amount=11)]
    assert len(messages)==2 and all(m['payload']==dict(event='order_created',**o) for m,o in zip(messages,orders))
    emit('business_and_outbox_committed',dict(orders=orders,outbox=messages))

    first=worker('owned_claim_A',env,'begin; '+claim_command('A')+';','CLAIM_A_UNCOMMITTED')
    token_a=json.loads(next(line for line in first['path'].read_text().splitlines() if line.startswith('[{')))[0]
    assert token_a['order_id']==1 and backend(first)['state']=='idle in transaction'
    token_b=claim('B')[0]
    assert token_b['order_id']==3 and token_a['event_id']!=token_b['event_id']
    assert sql("select count(*) from pgrowlocks('source_outbox')")=='1'
    send(first,'commit;','CLAIM_A_COMMITTED')
    assert backend(first)['state']=='idle' and backend(first)['xid'] is None
    assert sql("select count(*) from pgrowlocks('source_outbox')")=='0'
    close_client(first)
    assert all(m['status']=='claimed' and m['generation']==1 for m in outbox())
    emit('short_disjoint_claims',dict(token_a=token_a,token_b=token_b,outbox=outbox(),source_row_locks_during_delivery=0))

    before_commit=worker('owned_receiver_before_commit',receiver_env,'begin; '+apply_command(token_b)+';','RECEIVER_UNCOMMITTED')
    state=backend(before_commit)
    assert state['state']=='idle in transaction' and state['xid'] is not None
    assert receipts()==[] and total()==0 and all(m['sent_at'] is None for m in outbox())
    lose_client(before_commit)
    assert receipts()==[] and total()==0
    emit('receiver_client_loss_before_commit',dict(backend_before_loss=state,receipts=[],total=0,outbox=outbox()))

    relay=launch_relay(token_a)
    assert relay_marker(relay,'receiver_marker')==dict(new_effects=1)
    assert total()==7 and receipts()==[dict(origin=origin,event_id=token_a['event_id'],payload=token_a['payload'])]
    assert all(m['sent_at'] is None for m in outbox())
    assert sql("select count(*) from pgrowlocks('source_outbox')")=='0'
    emit('receiver_committed_before_sender_ack',dict(receipts=receipts(),total=total(),outbox=outbox(),relay_pid=relay['process'].pid))
    if lose_after_ack:
        relay['process'].stdin.write('ACK\n');relay['process'].stdin.flush()
        assert relay_marker(relay,'sender_marker')==dict(sent_rows=1)
        assert next(m for m in outbox() if m['event_id']==token_a['event_id'])['status']=='sent'
    relay['process'].kill();assert relay['process'].wait(timeout=5)<0;relay['output'].close()
    assert total()==7
    after_loss=outbox()
    assert next(m for m in after_loss if m['event_id']==token_a['event_id'])['status']==('sent' if lose_after_ack else 'claimed')
    emit('relay_process_loss',dict(after_ack=lose_after_ack,exit_code=relay['process'].returncode,
        outbox=after_loss,receipts=receipts(),total=total()))

    # Controlled eligibility change represents lease expiry; it is not a measured failure detector.
    sql("update source_outbox set lease_until=clock_timestamp()-interval '1 second' where status='claimed'")
    original={token_a['event_id']:token_a,token_b['event_id']:token_b}
    recovered=[]
    for number in range(1 if lose_after_ack else 2):
        token=claim('recovery-'+str(number))[0]
        assert token['generation']==2 and token['payload']==original[token['event_id']]['payload']
        assert sql(acknowledge_command(original[token['event_id']]))=='0'
        before=total()
        applied=int(receive_sql(apply_command(token)))
        expected=0 if token['event_id']==token_a['event_id'] else 1
        assert applied==expected and total()==before+expected*token['payload']['amount']
        assert sql(acknowledge_command(token))=='1'
        recovered.append(dict(token=token,new_effects=applied,total=total(),stale_acknowledgement_rows=0))
    assert claim('empty-after-recovery')==[]
    assert int(receive_sql(apply_command(token_a)))==0 and total()==18
    assert sql(acknowledge_command(token_a))=='0'
    changed=dict(token_a,payload=dict(token_a['payload'],amount=999))
    mismatch=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',
        apply_command(changed)],env=receiver_env,text=True,capture_output=True,timeout=10)
    assert mismatch.returncode!=0 and '22023' in mismatch.stderr and 'receipt payload mismatch' in mismatch.stderr,mismatch.stderr
    assert total()==18
    emit('takeover_replay_and_acknowledgement',dict(recovered=recovered,outbox=outbox(),receipts=receipts(),
        total=total(),mismatched_payload_error=mismatch.stderr))

    final_orders=inventory(env,'source_orders','order_id');final_outbox=outbox();final_receipts=receipts()
    assert final_orders==orders and len(final_outbox)==len(final_receipts)==2
    assert [m['order_id'] for m in final_outbox]==[1,3]
    assert all(m['status']=='sent' and m['sent_at'] is not None and m['lease_until'] is None for m in final_outbox)
    expected_receipts=[dict(origin=origin,event_id=m['event_id'],payload=m['payload']) for m in final_outbox]
    assert final_receipts==expected_receipts
    assert total()==sum(o['amount'] for o in final_orders)==sum(r['payload']['amount'] for r in final_receipts)==18
    assert sql('select count(*) from source_orders where order_id=99')=='0'
    assert sql("select count(*) from pgrowlocks('source_outbox')")=='0'
    stop();start()
    server('pg_ctl','-D',receiver_data,'-m','fast','-w','-t','20','stop',timeout=25)
    server('pg_ctl','-D',receiver_data,'-l',receiver_log,'-w','-t','20','start',timeout=25)
    assert sql('select system_identifier::text from pg_control_system()')==source_id
    assert receive_sql('select system_identifier::text from pg_control_system()')==receiver_id
    assert inventory(env,'source_orders','order_id')==final_orders and outbox()==final_outbox
    assert receipts()==final_receipts and total()==18 and claim('after-restarts')==[]
    emit('outbox_complete_after_restarts',dict(orders=final_orders,outbox=final_outbox,receipts=final_receipts,total=total()))
    print('PASS: business/outbox commit atomically; independent receiver effects survive relay loss; takeover rejects stale acknowledgements and replay adds no duplicate credit.',flush=True)
finally:
    for item in relays+clients:
        if item['process'].poll() is None:
            item['process'].kill();item['process'].wait(timeout=5)
        if not item['output'].closed:
            item['output'].close()
    try:
        if (receiver_data/'postmaster.pid').exists():
            server('pg_ctl','-D',receiver_data,'-m','fast','-w','-t','20','stop',timeout=25)
    finally:
        stop()
    print('Owned outbox clients, relay and source/receiver servers stopped; evidence retained at',root,flush=True)

PY`;
}
export const OUTBOX_CORE = outboxExperiment(false);
export const OUTBOX_VARIATION = outboxExperiment(true);

export const TRANSACTIONAL_OUTBOX: Draft = {
  slug: "transactional-outbox",
  revision: 4,
  tags: ["outbox", "queues", "skip-locked", "idempotency", "distributed-patterns"],
  title: "Deliver a transactional outbox through independent receiver commits",
  reading:
    'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 13 "Row-Level Locks".',
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 45,
  prerequisites: ["skip-locked-work-queue", "atomic-abort", "slot-position-and-acknowledgement"],
  overview: code`
Commit business orders and their outbox messages together, then deliver to a separate PostgreSQL
receiver whose receipt and balance update commit independently. Kill an application before commit,
a receiver client before commit, and an actual relay process after receiver commit but before its
source acknowledgement. Recover short durable claims and verify that replay adds no duplicate credit.
The variation moves the relay loss to after the source sent marker commits.`,
  caution: code`
Run the complete shell script with Python3, PostgreSQL16 server binaries and pgrowlocks available;
PGBIN can select the binary folder. It initializes fresh source/receiver data and private sockets,
ignores inherited PG/PGLAB settings and disables TCP. Root uses runuser as the postgres OS owner.
Allow a few hundred MB per retained run. Finally kills/reaps owned clients and relay, stops both
servers and leaves their logs/tables for inspection.

The driver owns every application/relay writer and follows receiver-commit-before-source-ack order.
Event identity/payload and receiver receipts are retained unchanged for the experiment. The source
sent marker cannot itself verify a remote effect, and arbitrary direct writers could bypass this
protocol. Controlled lease expiry represents elapsed time; it does not measure a crash detector.
These independent transactions/processes share one host. No broker or network packet-loss fault is
simulated, and no general exactly-once delivery or external-resource fencing guarantee is claimed.`,
  syntaxBreakdown: code`
### In plain terms

An outbox puts the business change and its intended message in one source transaction. That does
not include the receiver's transaction. If the receiver commits and the relay dies before marking
the message sent, another relay must retry the same identity without repeating its business effect.
Here the effect is a separate database balance. Short committed claims identify who may mark source
completion; receipt identity and credit must commit together on the receiver.

### What you are learning

- **Source atomicity:** an order and its outbox event become committed together or both roll back.
- **Short durable claims:** SKIP LOCKED coordinates competing claim transactions; committed owner/generation state survives afterward without holding row locks during delivery.
- **Independent receiver effects:** receipt and credit share a receiver transaction, while source acknowledgement remains a separate commit.
- **Replay and ownership:** retry an immutable event after lost acknowledgement, reject mismatched payloads and prevent superseded claims from marking completion.

### Piece by piece

- **python3** embeds the owned-cluster helper. **PGBIN / pg_config --bindir** selects tools and
  **tempfile.mkdtemp** creates private paths. Root-only **runuser/os.chown** assigns server ownership.
  Cleared PG variables, independent **PGHOST** sockets and **listen_addresses=''** isolate the pair
  even though both use **PGPORT=6543**. Connect, SQL statement/lock and subprocess timeouts bound calls.
- **initdb -D -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** selects each directory/administrator, permits local access inside protected
  paths, rejects host authentication, fixes locale and enables checksums with 1MB WAL segments.
  **pg_control_system.system_identifier** must differ; the receiver's data_directory must match
  the new owned directory. The source identifier plus a fixed stream label namespaces its events.
- **pg_ctl -D -l -w -t20 start** starts each server with its own log and readiness deadline.
  Both fixtures use 16MB buffers, 10 connections, fsync/synchronous_commit/full_page_writes on,
  1h checkpoints and a small WAL target. Receiver autovacuum is disabled for this tiny fixture.
  These are independent ordinary databases; this experiment does not create replication slots.
- **psql -X -At -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c** ignores startup files, prints
  unaligned tuples only, stops on SQL failure, includes SQLSTATE for classification and executes a
  command. The string-literal **quote** helper escapes controlled values; **json.dumps/json_agg**
  transfer and retain complete row payloads rather than substituting printed delivery claims.
- **source_orders** holds a primary-key order, customer and positive integer amount.
  **source_outbox.event_id GENERATED ALWAYS AS IDENTITY** supplies a stable message ID; order_id
  is unique and references the order. A JSON payload records order_created, order ID, customer and
  amount. Status CHECK permits pending/claimed/sent, while owner, generation, lease_until, attempts
  and sent_at record the supplied claim/completion protocol. The CHECK alone does not enforce it.
- **receiver_receipts PRIMARY KEY(origin,event_id)** deduplicates one namespaced immutable event
  and retains its full JSON payload. **receiver_balance** has one total initially 0. This credit
  is the independently visible business effect, separate from the receipt row count.
- **apply_order RETURNS int LANGUAGE plpgsql VOLATILE** validates the controlled event identity
  and positive amount, then **INSERT ... ON CONFLICT DO NOTHING** attempts the receipt. **FOUND**
  selects whether to add the amount to receiver_balance. A missing balance raises an error, rolling
  back the receipt too. Otherwise a new application returns 1, with receipt and credit in one commit.
- A duplicate uses a separate **SELECT** inside the VOLATILE function to read its saved payload.
  **IS DISTINCT FROM** rejects any payload mismatch with **22023**; the same payload returns 0
  without crediting again. A vanished receipt raises40001 rather than claiming a saved result.
  Receipts are retained and writers controlled here; arbitrary receipt garbage collection and
  concurrent request/result recovery are not supplied by this fixture.
- **app_commands** emits both business INSERT and outbox INSERT using **jsonb_build_object**.
  The first application psql client holds these writes for order99 inside BEGIN. Its marker and
  observed **pg_stat_activity.state='idle in transaction'** with a backend XID establish the live
  uncommitted boundary. Independent order/outbox queries and a relay claim see nothing.
- **lose_client** sends an actual process kill, waits for the negative exit status and verifies
  that application_name disappears from pg_stat_activity. After the aborted application client
  dies, neither order99 nor its event survives. Identity sequences can have gaps after rollback;
  event IDs are captured from returned data, not inferred from a count.
- Two successful source transactions create orders1/3 for amounts7/11 and their corresponding
  outbox payloads. Fresh complete inventories must agree on order ID, customer and amount. No
  receiver credit exists yet; source commit alone is not delivery.
- **claim_command** uses a candidate CTE with pending or expired-claimed eligibility,
  **ORDER BY event_id FOR UPDATE SKIP LOCKED LIMIT 1**, then **UPDATE ... FROM ... RETURNING**.
  It atomically stores owner, increments generation/attempts and sets a five-minute deadline using
  **clock_timestamp()+interval**. JSON aggregation returns the actual token/payload or an empty list.
  Attempts counts committed claims, not every receiver call or network transmission.
- Claim A is deliberately held uncommitted. Claim B runs concurrently and commits a different row;
  the captured tokens must belong to orders1/3. **CREATE EXTENSION pgrowlocks** and
  **pgrowlocks('source_outbox')** observe one row lock while A is open, then zero after A commits.
  Both rows remain durably claimed even though no source row lock spans receiver work. SKIP LOCKED
  skips busy rows; it does not promise fairness or delivery ordering across messages.
- **worker/send** launch persistent psql clients with stdin pipes and file-backed output.
  **PGAPPNAME** identifies their actual backend, and **psql \echo** markers locate completed
  commands. **close_client** sends **\q** and waits for successful exit. Markers schedule the test;
  independent database queries prove committed outcomes.
- For claim B, a receiver client runs BEGIN/apply_order and pauses before COMMIT. Its backend is
  idle in transaction with an XID, while independent reads show no receipt and total0. Killing that
  client and waiting for its backend to leave rolls back both receipt and credit. Source remains
  claimed/unsent, so that work can later be recovered.
- **relay_program** is a separate Python process that actually calls receiver and source psql.
  Its private JSON configuration contains the captured immutable payload/token and both owned
  endpoint environments. It commits apply_order on the receiver, writes a receiver marker containing
  the returned new-effect count and waits on stdin before acknowledging the source.
- At that live relay boundary, independent receiver queries must show its full receipt and total7,
  while all source sent_at values remain NULL and pgrowlocks still finds zero source row locks.
  Core kills the actual relay Python process here and waits for its negative exit. The receiver's
  committed7 survives while source ownership remains claimed; there is no simulated PUBLISH step.
- Hint2 moves only that kill boundary. The parent sends **ACK**; the relay executes the guarded
  source acknowledgement and writes a second marker after its successful commit. Independently
  verify source status sent before killing the relay. Its message stays sent and is not reclaimed;
  the other abandoned receiver attempt still needs recovery.
- **acknowledge_command** updates only a claimed row matching event_id, owner and generation.
  It sets status sent/sent_at, clears the lease and returns the affected-row count through a CTE.
  A superseded generation or already-sent row returns 0. This protects source completion from stale
  claims; it cannot prevent an old worker from contacting a separate receiver.
- A controlled **UPDATE lease_until=clock_timestamp()-interval '1 second'** makes only remaining
  claimed rows eligible. This represents time passing after the observed process loss, rather than
  a real measured expiry delay. Expiry permits takeover; the generation change commits when the
  new claim succeeds. An elapsed deadline alone is not a resource fence.
- Recovery captures generation2 tokens using the same short claim statement. Before doing work,
  try each old token's acknowledgement and require 0. Then apply the exact retained payload:
  core's already-credited A returns0 and keeps7; B returns1 and adds11. Each valid generation2
  acknowledgement must change exactly one row. Hint2 reclaims only B because A was already sent.
- An additional duplicate receiver call for A still returns0 at total18. Its duplicate/stale source
  acknowledgement returns0. Reusing A's identity with amount999 must actually raise22023/payload
  mismatch and preserve all receipts/credit. The final join checks full payloads, not just totals.
- Final source orders1/3 match two sent outbox messages and two independently committed receiver
  receipts. Their amounts and receipt sum equal total18, failed order99 is absent, leases are NULL,
  and a new claim finds no work. **pg_ctl -m fast -w -t20 stop** and restart each server normally;
  verify identities, all tables and total18 survive, with the queue still empty. This is a restart
  check, not a power-loss or independent-host failure experiment.
- **emit** records uncommitted backend state, full business/event/receipt inventories, claim
  tokens, relay exit, replay counts and the mismatch error. **finally** kills/reaps any remaining
  owned clients/relay and stops both owned servers. Their tables, process logs and JSON remain.`,
  code: OUTBOX_CORE,
  expectedResult: code`
Order99 and its outbox event are invisible to independent reads/claims while the application is
uncommitted, and both remain absent after its client is killed. Successful orders1/3 have amounts7/11
and matching event payloads. Their captured event IDs are2/3 in the fresh fixture because the aborted
identity allocation is not reused.

A holds the first claim while B commits a different one. One source tuple lock exists before A's
commit and zero afterward; both messages remain claimed at generation1. Killing B's uncommitted
receiver client leaves no receipts or credit. The real relay then commits A's receipt/credit7 while
both source sent markers remain absent. Core kills it before acknowledgement, leaving both claims
abandoned but the receiver7 durable.

After controlled expiry, core reclaims both at generation2. Old-token acknowledgements affect0 rows;
A's receiver retry applies0 and keeps7, B applies1 and reaches18, then both valid acknowledgements
commit. Hint2 kills A's relay after its source sent commit instead: A remains sent at generation1,
only B is reclaimed at generation2, and final credit is still18. An empty claim and duplicate
acknowledgement both return0 work. A duplicate receiver call adds0; changed amount999 is rejected
with22023 and no data change.

Both normal server restarts preserve exactly two source orders, two sent outbox messages and two
matching receiver receipts. All full payloads agree, both leases are cleared, total18 equals the
source/receipt sum, and aborted99 remains absent. All owned clients/relay/servers stop. Process IDs,
XIDs, system identifiers and timestamps vary. No fixed network timing or general exactly-once
transport claim is inferred.`,
  systemsLens: code`
The outbox makes intent atomic with the source business change. Delivery still crosses a separate
commit boundary, so receiver identity and effect must commit together and survive retry. Durable
claim generations govern who can record source completion; receiver deduplication governs whether
repeated execution changes its business state. Their combined contract depends on immutable identity,
retained receipts and the enforced commit order, not on a sent label or a printed publication.`,
  challenge: code`
Run hint2 and predict which claim generation and attempt count changes when relay loss moves past
source acknowledgement. Explain why only one message is reclaimed while the same two credits
remain. For a service relay, specify the durable event identity, receipt retention, expiry/takeover,
receiver-commit/acknowledgement order and evidence you would use after a missing response.`,
};
