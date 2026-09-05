import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function deliveryExperiment(crash: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\ncrash_source = ${crash ? "True" : "False"}\n` + code`
import re
receiver_data,receiver_sock,receiver_log=root/'receiver',root/'receiver-socket',root/'receiver.log'
receiver_sock.mkdir()
if os.geteuid()==0:
    os.chown(receiver_sock,owner.pw_uid,owner.pw_gid)
receiver_env=dict(env,PGHOST=str(receiver_sock))
clients=[]

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

def slot(name='owned_delivery'):
    return json.loads(sql("select row_to_json(s) from (select slot_name,active,restart_lsn,confirmed_flush_lsn,"
        "xmin::text,catalog_xmin::text from pg_replication_slots where slot_name="+quote(name)+") s"))

def decode(name='owned_delivery',consume=False,limit=None):
    fn='pg_logical_slot_get_changes' if consume else 'pg_logical_slot_peek_changes'
    return json.loads(sql("select coalesce(json_agg(r),'[]') from (select lsn::text,xid::text,data from "+fn+
        "("+quote(name)+",null,"+('null' if limit is None else str(limit))+
        ",'include-xids','1','skip-empty-xacts','1','stream-changes','0')) r"))

def batch(events,table):
    assert len(events)>=3 and events[0]['data']=='BEGIN '+events[0]['xid']
    assert events[-1]['data']=='COMMIT '+events[0]['xid']
    assert all(row['xid']==events[0]['xid'] for row in events)
    pattern=r'table public\.'+table+r': INSERT: event_id\[integer\]:(\d+) delta\[integer\]:(\d+)'
    payload=[]
    for row in events[1:-1]:
        match=re.fullmatch(pattern,row['data'])
        assert match,row
        payload.append(dict(event_id=int(match[1]),delta=int(match[2])))
    assert len({x['event_id'] for x in payload})==len(payload)
    return dict(events=payload,commit_lsn=events[-1]['lsn'],xid=events[-1]['xid'])

def source_rows(table):
    return json.loads(sql('select coalesce(json_agg(r order by event_id),\'[]\') from '+table+' r'))

def receipts(origin):
    return json.loads(receive_sql("select coalesce(json_agg(r order by event_id),'[]') from "
        "(select event_id,delta from receiver_receipts where origin="+quote(origin)+") r"))

def balance():
    return int(receive_sql('select total from receiver_balance where id=1'))

def apply_command(origin,payload):
    return 'select apply_events('+quote(origin)+','+quote(json.dumps(payload))+'::jsonb)'

def worker(label,target,commands,marker):
    path=root/(label+'.log')
    output=path.open('w')
    process=subprocess.Popen([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1'],
        env=dict(target,PGAPPNAME=label),stdin=subprocess.PIPE,stdout=output,stderr=subprocess.STDOUT,text=True)
    item=dict(label=label,target=target,path=path,output=output,process=process)
    clients.append(item)
    process.stdin.write(commands+'\n\\echo '+marker+'\n')
    process.stdin.flush()
    def reached():
        assert process.poll() is None,path.read_text()
        return marker in path.read_text().splitlines()
    wait_for(label+' boundary',reached)
    return item

def backend(item):
    return json.loads(query(item['target'],"select row_to_json(a) from (select pid,state,backend_xid::text as xid "
        "from pg_stat_activity where application_name="+quote(item['label'])+") a"))

def lose_process(item):
    assert item['process'].poll() is None
    item['process'].kill()
    assert item['process'].wait(timeout=5)<0
    item['output'].close()
    wait_for(item['label']+' backend gone',lambda: query(item['target'],
        "select count(*) from pg_stat_activity where application_name="+quote(item['label']))=='0')

def advance(bound):
    result=json.loads(sql("select row_to_json(a) from pg_replication_slot_advance('owned_delivery',"+quote(bound)+") a"))
    assert result['end_lsn']==bound,result
    assert slot()['confirmed_flush_lsn']==bound
    return result

try:
    with (data/'postgresql.conf').open('a') as config:
        config.write("\nwal_level=logical\nmax_replication_slots=4\nmax_wal_size='128MB'\nautovacuum=off\n")
    start()
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
    origin=source_id+':postgres:delivery_events'
    unsafe_origin=source_id+':postgres:unsafe_events'
    receive_sql('create table receiver_receipts(origin text not null,event_id int not null,delta int not null,primary key(origin,event_id)); '
        'create table receiver_balance(id int primary key check(id=1),total bigint not null); insert into receiver_balance values(1,0)')
    receive_sql("""create function apply_events(p_origin text,p_events jsonb) returns int language plpgsql as $$
    declare item record; old_delta int; applied int:=0;
    begin
      for item in select * from jsonb_to_recordset(p_events) as r(event_id int,delta int) order by event_id loop
        insert into receiver_receipts values(p_origin,item.event_id,item.delta) on conflict do nothing;
        if found then
          update receiver_balance set total=total+item.delta where id=1;
          applied:=applied+1;
        else
          select delta into strict old_delta from receiver_receipts where origin=p_origin and event_id=item.event_id;
          if old_delta is distinct from item.delta then
            raise exception 'receipt payload mismatch' using errcode='22000';
          end if;
        end if;
      end loop;
      return applied;
    end $$""")
    sql('create table unsafe_events(event_id int primary key,delta int not null); '
        'create table delivery_events(event_id int primary key,delta int not null)')
    emit('independent_endpoints',dict(source_id=source_id,receiver_id=receiver_id,source=str(data),receiver=str(receiver_data)))

    # Deliberately wrong order: consume first, then lose the consumer before the receiver commits.
    sql("select pg_create_logical_replication_slot('owned_unsafe','test_decoding')")
    sql('insert into unsafe_events values(1,1),(2,2)')
    unsafe=decode('owned_unsafe',True)
    unsafe_batch=batch(unsafe,'unsafe_events')
    bad=worker('owned_bad_delivery',receiver_env,'begin;\n'+apply_command(unsafe_origin,unsafe_batch['events'])+';', 'BAD_UNCOMMITTED')
    assert backend(bad)['state']=='idle in transaction' and backend(bad)['xid'] is not None
    assert receipts(unsafe_origin)==[] and balance()==0
    lose_process(bad)
    assert receipts(unsafe_origin)==[] and balance()==0 and decode('owned_unsafe')==[]
    emit('consumed_before_effect_lost',dict(source_rows=source_rows('unsafe_events'),consumed=unsafe,
        receiver_rows=receipts(unsafe_origin),balance=balance(),source_slot=slot('owned_unsafe'),next_read=[]))
    sql("select pg_drop_replication_slot('owned_unsafe')")

    sql("select pg_create_logical_replication_slot('owned_delivery','test_decoding')")
    initial=slot()
    sql('insert into delivery_events select g,g from generate_series(10,19) g')
    first_events=decode(limit=5)
    first=batch(first_events,'delivery_events')
    assert len(first_events)==12 and first['events']==[dict(event_id=i,delta=i) for i in range(10,20)]
    assert decode(limit=5)==first_events and slot()['confirmed_flush_lsn']==initial['confirmed_flush_lsn']
    emit('soft_limit_and_repeatable_peek',dict(requested_limit=5,actual_count=len(first_events),batch=first,
        initial_slot=initial,after_peeks=slot()))

    pending=worker('owned_before_commit',receiver_env,'begin;\n'+apply_command(origin,first['events'])+';', 'APPLIED_UNCOMMITTED')
    state=backend(pending)
    assert state['state']=='idle in transaction' and state['xid'] is not None
    assert receipts(origin)==[] and balance()==0
    lose_process(pending)
    assert receipts(origin)==[] and balance()==0 and decode(limit=5)==first_events
    emit('process_loss_before_receiver_commit',dict(backend_before_loss=state,receiver_rows=receipts(origin),
        balance=balance(),replayed_events=first_events,source_slot=slot()))

    committed=worker('owned_after_commit',receiver_env,'begin;\n'+apply_command(origin,first['events'])+';\ncommit;', 'RECEIVER_COMMITTED')
    assert backend(committed)['state']=='idle' and backend(committed)['xid'] is None
    assert receipts(origin)==first['events'] and balance()==145
    lose_process(committed)
    assert slot()['confirmed_flush_lsn']==initial['confirmed_flush_lsn'] and decode(limit=5)==first_events
    assert int(receive_sql(apply_command(origin,first['events'])))==0
    assert receipts(origin)==first['events'] and balance()==145
    # A reused identity with different data must fail, not silently deduplicate an unrelated effect.
    mismatch=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',
        apply_command(origin,[dict(event_id=10,delta=999)])],env=receiver_env,text=True,capture_output=True,timeout=10)
    assert mismatch.returncode!=0 and '22000' in mismatch.stderr and 'receipt payload mismatch' in mismatch.stderr,mismatch.stderr
    assert receipts(origin)==first['events'] and balance()==145
    emit('process_loss_after_receiver_commit',dict(replayed_events=first_events,retry_new_receipts=0,
        receiver_rows=receipts(origin),balance=balance(),source_slot=slot(),mismatched_payload_error=mismatch.stderr))

    # Later unprocessed work must stay pending when only the first complete transaction is acknowledged.
    sql('insert into delivery_events values(20,20),(21,21)')
    sql('checkpoint')
    before_ack=slot()
    acknowledgement=worker('owned_after_source_ack',env,
        "select end_lsn from pg_replication_slot_advance('owned_delivery',"+quote(first['commit_lsn'])+");", 'SOURCE_ACKNOWLEDGED')
    assert slot()['confirmed_flush_lsn']==first['commit_lsn']
    acknowledged=slot()
    assert first['commit_lsn'] in acknowledgement['path'].read_text().splitlines()
    lose_process(acknowledgement)
    remaining_events=decode()
    remaining=batch(remaining_events,'delivery_events')
    assert remaining['events']==[dict(event_id=20,delta=20),dict(event_id=21,delta=21)]
    assert balance()==145
    emit('process_loss_after_source_ack',dict(before_ack=before_ack,acknowledged=acknowledged,
        remaining=remaining,receiver_rows=receipts(origin),balance=balance()))

    if crash_source:
        # Persisted slot state predates advance; the independent receiver stays live through source crash.
        server('pg_ctl','-D',data,'-m','immediate','-w','-t','20','stop',timeout=25)
        assert not (data/'postmaster.pid').exists() and (receiver_data/'postmaster.pid').exists()
        assert receipts(origin)==first['events'] and balance()==145
        start()
        assert sql('select system_identifier::text from pg_control_system()')==source_id
        assert receive_sql('select system_identifier::text from pg_control_system()')==receiver_id
        recovered=slot()
        assert sql("select "+quote(recovered['confirmed_flush_lsn'])+"::pg_lsn<"+quote(first['commit_lsn'])+"::pg_lsn")=='t',recovered
        replayed=decode(limit=5)
        assert replayed==first_events
        assert int(receive_sql(apply_command(origin,batch(replayed,'delivery_events')['events'])))==0
        assert balance()==145 and receipts(origin)==first['events']
        advance(first['commit_lsn'])
        assert decode()==remaining_events
        emit('source_crash_replays_acknowledged_batch',dict(before_crash=acknowledged,after_recovery=recovered,
            replayed_events=replayed,retry_new_receipts=0,receiver_rows=receipts(origin),balance=balance()))

    assert int(receive_sql(apply_command(origin,remaining['events'])))==2
    advance(remaining['commit_lsn'])
    final=source_rows('delivery_events')
    assert final==receipts(origin)==[dict(event_id=i,delta=i) for i in range(10,22)]
    assert balance()==186 and int(receive_sql('select sum(delta) from receiver_receipts'))==186
    assert decode()==[] and receipts(unsafe_origin)==[]
    server('pg_ctl','-D',receiver_data,'-m','fast','-w','-t','20','stop',timeout=25)
    server('pg_ctl','-D',receiver_data,'-l',receiver_log,'-w','-t','20','start',timeout=25)
    assert receive_sql('select system_identifier::text from pg_control_system()')==receiver_id
    assert receipts(origin)==final and balance()==186 and receipts(unsafe_origin)==[]
    emit('safe_delivery_complete',dict(source_rows=final,receiver_rows=receipts(origin),balance=balance(),
        source_slot=slot(),remaining_events=[],unsafe_missing_rows=source_rows('unsafe_events'),
        unsafe_receiver_rows=receipts(unsafe_origin),source_crash_exercised=crash_source,receiver_restart_verified=True))
    print('PASS: unsafe consumption loses effects; receiver-first commit plus receipts survives process losses and replays without double credit, with later work preserved.',flush=True)
finally:
    for item in clients:
        if item['process'].poll() is None:
            item['process'].kill()
            item['process'].wait(timeout=5)
        if not item['output'].closed:
            item['output'].close()
    try:
        if (data/'postmaster.pid').exists():
            sql("select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name in ('owned_unsafe','owned_delivery')")
            assert sql('select count(*) from pg_replication_slots')=='0'
    finally:
        try:
            if (receiver_data/'postmaster.pid').exists():
                server('pg_ctl','-D',receiver_data,'-m','fast','-w','-t','20','stop',timeout=25)
        finally:
            stop()
    print('Owned delivery clients/servers stopped and source slots removed; evidence retained at',root,flush=True)
PY`;
}

export const SLOT_DELIVERY_VARIATION = deliveryExperiment(true);
export const SLOT_DELIVERY: Draft = {
  slug: "slot-position-and-acknowledgement",
  revision: 4,
  tags: ["replication-slots", "logical-decoding", "idempotency", "retries", "gc-horizon"],
  title: "Commit the receiver effect before acknowledging the source",
  difficulty: "advanced",
  safetyLevel: "dangerous",
  runIn: "shell",
  estimatedMinutes: 45,
  prerequisites: ["decode-the-log"],
  overview: code`
A source slot and a receiver transaction commit independently. First consume too early and lose a
receiver effect; then apply a complete decoded transaction using durable receipts before advancing
its source position. Kill actual consumer processes before receiver commit, after receiver commit
and after source acknowledgement. The variation also crashes the source before its new slot
position is checkpointed, producing a replay that must not credit the receiver twice.`,
  reading:
    'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".',
  caution: code`
Run the complete shell script with Python3, matching PostgreSQL16 binaries and test_decoding
installed; PGBIN may select the binary folder. Two independently initialized PostgreSQL processes
use fresh owned data directories and private sockets with TCP disabled. Inherited PG/PGLAB settings
are ignored. Root uses runuser as the postgres OS owner. Allow a few hundred MB per retained run.
Only owned psql clients are killed; hint2 deliberately crashes only the owned source with an
immediate stop. Finally stops clients/servers and drops the source's named slots.

The driver owns the only consumer. It accepts one known INSERT-only schema, stable event IDs and a
fixed source namespace; its parser is not a general CDC client. Receipts remain available for every
replay in this experiment. Separate processes on one host demonstrate independent commit/process
boundaries, not independent host failure domains. The deliberately unsafe trial's two missing
effects remain explicitly classified as unreconciled; they are not included in the safe trial's
success claim.`,
  syntaxBreakdown: code`
### In plain terms

Reading a change, committing its effect and acknowledging the source are three different events.
A failure between them can lose an effect or repeat a delivery. The receiver stores each event's
identity and balance change in the same transaction, so a retry can recognize already-committed
work. Advance the source only through a complete transaction that the receiver has committed;
never use a newer source position merely because it is available.

### What you are learning

- **Independent commits:** the source cursor does not know whether the receiver committed its balance change.
- **Atomic receipt and effect:** deduplication must be committed with the business change, with conflicting identity reuse rejected.
- **Bounded acknowledgement:** a soft batch limit preserves the transaction envelope; acknowledge its COMMIT boundary without skipping later work.
- **Crash-time replay:** source acknowledgement can roll back to checkpointed slot state, so durable receiver receipts still matter afterward.

### Piece by piece

- **python3** embeds the complete owned-cluster helper. **PGBIN / pg_config --bindir** selects
  binaries, **tempfile.mkdtemp** creates the private root, and root-only **runuser/os.chown** assigns
  server ownership. Cleared PG variables, separate **PGHOST** sockets and **listen_addresses=''**
  isolate connections; each private socket uses **PGPORT=6543** without a TCP listener.
- **initdb -D -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** creates each new data directory and administrator, permits access within the
  protected local directory, rejects host authentication, fixes locale and enables checksums with
  1MB WAL segments. The receiver is independently initialized, not cloned from the source.
- **pg_ctl -D -l -w -t20 start** starts each owned directory with its log and a20s readiness bound.
  **pg_control_system.system_identifier** must differ between source and receiver, and the receiver
  data_directory must match its owned path. Both use **fsync/synchronous_commit/full_page_writes=on**,
  16MB buffers,10 connections,1h checkpoint timeout, no logging collector and autovacuum off.
  Source **wal_level=logical**, four slots and128MB maximum WAL target support the small stream
  without an automatic checkpoint racing the variation's explicit persistence boundary.
- **psql -X -At -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c** ignores startup files, prints unaligned
  tuples only, fails on SQL errors, exposes SQLSTATE and runs a command. Connect, statement, lock
  and subprocess timeouts bound calls. **quote** escapes SQL string literals; JSON carries only
  the controlled event IDs/deltas, not SQL supplied by decoded data.
- **unsafe_events** and **delivery_events** are separate source tables, each with a primary-key
  event_id and non-null integer delta. They separate a deliberate lost-effect trial from the safe
  protocol. A source namespace combines its fixed system identifier, database and stream name;
  it is separate from the event ID. Resetting a real stream or reusing IDs would require a new
  identity policy, not silently reusing these receipts.
- **receiver_receipts(origin,event_id,delta)** has a composite primary key on origin/event_id.
  **receiver_balance** has one constrained row, initially total0. Both live only on the independent
  receiver. **apply_events(text,jsonb)** is a PL/pgSQL function returning the number of newly applied
  events. **jsonb_to_recordset** converts the supplied batch to typed rows in event-ID order.
- Inside the same receiver transaction, **INSERT ON CONFLICT DO NOTHING** attempts a receipt.
  PL/pgSQL **FOUND** says whether it inserted one. Only a new receipt permits **UPDATE total=total+delta**.
  Otherwise **SELECT INTO STRICT** reads the old payload; **IS DISTINCT FROM** and
  **RAISE EXCEPTION ... ERRCODE='22000'** reject different data under the same identity. The counter
  increments only for fresh effects. Function errors roll back its changes with the transaction;
  a receipt cannot survive an aborted balance update as a separate successful commit here.
- **pg_create_logical_replication_slot** creates each owned cursor with **test_decoding**.
  **pg_replication_slots** records active, restart_lsn, confirmed_flush_lsn, xmin and catalog_xmin.
  These are source consumer/retention observations, not receiver state. Inactive slots can still
  retain WAL/catalog history; only this fixture's named slots are ever dropped.
- **decode** calls **pg_logical_slot_peek_changes** or **pg_logical_slot_get_changes**. Its NULL
  upper LSN reads currently available changes; **upto_nchanges** is a soft row-count limit.
  **include-xids=1**, **skip-empty-xacts=1** and **stream-changes=0** select XID-labelled, nonempty,
  completed transaction envelopes for this example plugin. **json_agg/json.loads** retain all events.
- **batch** requires exactly one matching BEGIN/COMMIT XID envelope, then **re.fullmatch** accepts
  only the chosen table's two nonnegative integer INSERT columns. It checks unique event IDs and
  returns payload plus the COMMIT event's LSN. It never treats an individual row LSN or current WAL
  end as a substitute for the acknowledged complete transaction.
- The unsafe trial commits source IDs1,2 and calls **get** before any receiver commit. A psql
  worker begins, runs apply_events and pauses with its transaction still open. An independent
  receiver query sees no receipts and total0. Kill that client, verify its backend disappears,
  and require no receiver effects while the source's next read is empty. Source rows still exist;
  consuming them did not deliver their effects. Save this failure inventory and drop owned_unsafe.
- The safe slot starts before **INSERT SELECT generate_series(10,19)** commits ten source events
  in one transaction. Requesting five changes returns12 events: BEGIN, ten INSERTs and COMMIT.
  Two complete peeks match while confirmed_flush_lsn stays unchanged. The soft limit does not split
  this transaction; the receiver must handle a batch larger than the requested count.
- **worker** starts an owned **subprocess.Popen** psql client, keeps its stdin open and writes
  output to a private log. **PGAPPNAME** identifies that client in **pg_stat_activity**.
  A **psql \echo** marker is printed only after the supplied SQL boundary completes. Poll that
  actual marker and process status; **state/backend_xid** distinguish an open transaction from
  an idle connection after COMMIT. The marker schedules fault injection; independent database
  queries, rather than that printed marker alone, establish effect and cursor outcomes.
- **lose_process** calls **kill** on that exact psql process, requires a signal exit and waits
  until its named backend is gone. An idle-in-transaction connection then rolls back. In the first
  safe loss, all ten attempted receipts and credits disappear together; a fresh peek still returns
  the original batch. No source acknowledgement was sent.
- The next worker applies the same batch and actually **COMMITs**. Before killing it, an independent
  query must see ten receipts and total145; the backend is idle without an active XID. Kill the
  consumer before it acknowledges the source. The source still replays the same twelve events.
  A new receiver call returns0 new receipts and leaves total145. These are process-loss tests at
  observed boundaries, not a simulated packet-loss or hidden network acknowledgement mechanism.
- Reuse event10 with delta999 as a conflicting retry. Require actual SQLSTATE22000 and the payload
  mismatch error, with all receipts and total145 unchanged. Deduplication must not silently accept
  a different effect under an old identity.
- Commit a later source transaction with IDs20,21. **CHECKPOINT** saves the source slot's current
  pre-acknowledgement state before advancing. A new worker calls **pg_replication_slot_advance** only
  to the first batch's parsed COMMIT LSN; observe returned end_lsn and confirmed_flush_lsn equal it,
  then kill that consumer after the acknowledgement. The next peek must contain exactly the later
  two-event payload, while the receiver still has only the first ten events and total145.
- Optional hint2 performs **pg_ctl -m immediate -w -t20 stop** on the owned source before another
  checkpoint can persist the advanced position. The separate receiver stays running with its ten
  receipts and total145. Restart the source, verify both original system identities, and require
  its recovered confirmation below the already-acknowledged COMMIT boundary. This supplied failure
  must actually replay the first batch; a generic claim that every crash always rewinds is not made.
- Reapply the replayed batch: the receiver returns0 and total stays145. Advance through that same
  COMMIT again, and verify the later batch remains unchanged. Slot position is persisted at
  checkpoints; source crash replay is a reason receiver deduplication remains necessary even after
  a source acknowledgement has been observed.
- Apply the later two events in an independent receiver commit and then **advance** only through
  their COMMIT. The source stream is empty. Complete source and receiver inventories are exactly
  IDs10–21 with delta equal to ID; total186 equals the sum of every committed receiver receipt.
  Stop/restart the receiver normally, verify its system identity and require the same rows/total.
  The separately inventoried unsafe IDs1,2 still have no receiver receipts.
- **emit/json.dumps** save endpoint identities, batch frames, cursor positions, observed backend
  state and independent domain outcomes. **finally** reaps any surviving owned clients, drops
  owned_unsafe/owned_delivery if present, verifies zero source slots and stops both servers with
  **pg_ctl -m fast -w -t20 stop**. It retains data/log paths for inspection.`,
  code: deliveryExperiment(false),
  expectedResult: code`
The unsafe trial consumes IDs1,2, kills an uncommitted receiver client and ends with source rows
still present, no receiver receipts, total0 and an empty next source read. That failure remains
explicitly unreconciled.

For the safe stream, a requested five-change batch returns12 events for ten source inserts. Repeated
peek leaves confirmation unchanged. Killing the first receiver attempt before COMMIT leaves zero
receipts/credit and the entire batch available. After actual receiver COMMIT, killing the consumer
before source acknowledgement leaves ten receipts and total145. Replay adds0 new effects; a changed
payload under event10 fails22000 without changing state.

Advance only through the first batch's COMMIT, then lose the acknowledging client. The later
IDs20,21 remain pending. In hint2, an actual source crash returns the slot to its earlier saved
position and replays the first batch while the independent receiver retains total145; deduplication
again adds0. After the final two events commit and are acknowledged, both safe inventories exactly
match IDs10–21/deltas10–21 and total186, including after receiver restart. No pending safe events or
owned source slots remain after cleanup. Every owned client/server stops.

XIDs, LSNs, paths, system IDs and timing vary. The counts, receipt sets, totals, error state and
relative commit/acknowledgement boundaries are asserted. No universal exactly-once network delivery
or irreversible monotonic slot position is claimed.`,
  systemsLens: code`
A source offset cannot atomically commit an independent receiver. Commit the receiver's identity
record and effect together, then acknowledge only the completed source transaction. Failures may
repeat delivery, so make those repeats harmless and reject conflicting identity reuse. This gives
one committed credit per retained immutable event identity within the tested receiver contract;
it does not make source and receiver one distributed transaction or remove recovery obligations
when receipts or required source history are lost.`,
  challenge: code`
Run hint2, changing only source failure after acknowledgement: crash it before the advanced slot
position is checkpointed. Predict the recovered source position, replayed batch and receiver total.
Explain why the receiver must keep deduplication receipts even after acknowledgement, why using the
source's newest WAL position would risk skipping IDs20,21, and what recovery policy is needed if
required receipts or source history have already been discarded.`,
};
