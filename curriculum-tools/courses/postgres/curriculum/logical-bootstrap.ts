import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function bootstrapExperiment(batches: number): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY + `\nbatches = ${batches}\n` + code`
subdata,subsock,sublog=root/'subscriber',root/'subscriber-socket',root/'subscriber.log'
subsock.mkdir()
if os.geteuid()==0:
    os.chown(subsock,owner.pw_uid,owner.pw_gid)
subenv=dict(env,PGHOST=str(subsock))
keepers=[]
subid=None

def quote(value):
    return "'"+str(value).replace("'","''")+"'"

def sub_sql(command):
    result=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',command],
        env=subenv,text=True,capture_output=True,timeout=10)
    assert result.returncode==0,result.stdout+result.stderr
    return result.stdout.strip()

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def rows(query,table):
    return json.loads(query("select coalesce(json_agg(r order by id),'[]') from "+table+' r'))

def relation(table):
    return json.loads(sub_sql("select coalesce(json_agg(r),'[]') from (select srrelid::regclass::text as table_name,"
        "srsubstate,srsublsn from pg_subscription_rel where srsubid="+str(subid)+" and srrelid="+quote(table)+"::regclass) r"))

def workers():
    return json.loads(sub_sql("select coalesce(json_agg(r),'[]') from (select subname,pid,relid::regclass::text as table_name,"
        "received_lsn,latest_end_lsn from pg_stat_subscription where subid="+str(subid)+") r"))

def slots():
    return json.loads(sql("select coalesce(json_agg(r order by slot_name),'[]') from (select slot_name,plugin,active,"
        "temporary,restart_lsn,confirmed_flush_lsn,catalog_xmin::text from pg_replication_slots) r"))

def origin():
    return json.loads(sub_sql("select row_to_json(r) from (select external_id,remote_lsn,local_lsn "
        "from pg_replication_origin_status where external_id="+quote('pg_'+str(subid))+") r"))

def audit(table):
    return json.loads(sub_sql("select coalesce(json_agg(r order by seq),'[]') from (select seq,xid,op,before_row,after_row,worker_search_path "
        "from bootstrap_audit where table_name="+quote(table)+") r"))

def commit(commands):
    begin=sql('select pg_current_wal_insert_lsn()')
    output=sql('begin; select txid_current(); '+commands+'; commit')
    xid=next(line for line in output.splitlines() if line.isdigit())
    end=sql('select pg_current_wal_flush_lsn()')
    records=json.loads(sql("select json_agg(r) from (select start_lsn,end_lsn,xid::text from "
        "pg_get_wal_records_info("+quote(begin)+","+quote(end)+") where resource_manager='Transaction' "
        "and record_type='COMMIT' and xid::text="+quote(xid)+") r"))
    assert len(records)==1,records
    return records[0]

def applied(bound):
    return sub_sql("select coalesce((select remote_lsn>="+quote(bound)+"::pg_lsn from "
        "pg_replication_origin_status where external_id="+quote('pg_'+str(subid))+"),false)")=='t'

def gate(table,key):
    path=root/(table+'-gate.log')
    out=path.open('w')
    process=subprocess.Popen([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1'],
        env=dict(subenv,PGAPPNAME='gate_'+table),stdin=subprocess.PIPE,stdout=out,stderr=subprocess.STDOUT,text=True)
    item=dict(process=process,out=out,path=path,key=key)
    keepers.append(item)
    process.stdin.write('select pg_advisory_lock('+str(key)+');\n\\echo GATE_HELD\n')
    process.stdin.flush()
    def held():
        assert process.poll() is None,path.read_text()
        return 'GATE_HELD' in path.read_text().splitlines()
    wait_for(table+' gate held',held)
    return item

def release(item):
    item['process'].stdin.write('select pg_advisory_unlock('+str(item['key'])+');\n\\q\n')
    item['process'].stdin.flush()
    assert item['process'].wait(timeout=10)==0,item['path'].read_text()
    item['out'].close()
    assert 't' in item['path'].read_text().splitlines()

def copy_waiter(table):
    return json.loads(sub_sql("select coalesce(json_agg(r),'[]') from (select a.pid,a.state,a.wait_event_type,a.wait_event,"
        "a.backend_xid::text as xid from pg_stat_activity a join pg_stat_subscription s on a.pid=s.pid "
        "where s.subid="+str(subid)+" and s.relid="+quote(table)+"::regclass and a.wait_event_type='Lock' "
        "and a.wait_event='advisory') r"))

def setup_table(table,key):
    schema='create table '+table+'(id int primary key,value int not null,note text not null)'
    sql(schema)
    sql("insert into "+table+" select g,0,'seed' from generate_series(1,100) g")
    sql('grant select on '+table+' to owned_publisher')
    sub_sql(schema)
    sub_sql('create trigger observe_bootstrap after insert or update or delete on '+table+
        ' for each row execute function observe_bootstrap('+quote(key)+')')
    sub_sql('alter table '+table+' enable replica trigger observe_bootstrap')
    for query in (sql,sub_sql):
        assert query("select relreplident='d' and exists(select 1 from pg_index where indrelid=c.oid and indisprimary) "
            "from pg_class c where oid="+quote(table)+"::regclass")=='t'
    return rows(sql,table)

def handoff(table,key,first):
    global subid
    snapshot=setup_table(table,key)
    keeper=gate(table,key)
    if first:
        sql("create publication owned_publication for table "+table+" with (publish='insert, update, delete')")
        connection='host='+str(sock)+' port=6543 user=owned_publisher dbname=postgres'
        sub_sql('create subscription owned_subscription connection '+quote(connection)+
            " publication owned_publication with (slot_name='owned_bootstrap',copy_data=true)")
        subid=int(sub_sql("select oid from pg_subscription where subname='owned_subscription'"))
    else:
        sql('alter publication owned_publication add table '+table)
        assert relation(table)==[]
        assert sql("select count(*) from pg_publication_tables where pubname='owned_publication' and tablename="+quote(table))=='1'
        emit('publication_membership_before_refresh',dict(published_table=table,subscriber_relation=relation(table),
            existing_relation=relation('bootstrap_items')))
        sub_sql('alter subscription owned_subscription refresh publication with (copy_data=true)')
    blocked=wait_for(table+' real copy blocked in trigger',lambda: copy_waiter(table))
    state=relation(table)
    assert len(blocked)==1 and state[0]['srsubstate']=='d',dict(blocked=blocked,state=state)
    assert rows(sub_sql,table)==[] and audit(table)==[]
    synchronization=[s for s in slots() if s['slot_name'].startswith('pg_'+str(subid)+'_sync_')]
    assert len(synchronization)==1 and synchronization[0]['plugin']=='pgoutput',synchronization
    copy_position=synchronization[0]['confirmed_flush_lsn']
    assert copy_position is not None
    emit(table+'_copy_snapshot_selected',dict(snapshot_reference=snapshot,copy_worker=blocked,relation=state,
        synchronization_slot=synchronization[0],workers=workers()))
    if not first:
        existing=commit("insert into bootstrap_items values(3000,2,'during ledger copy')")
        wait_for('existing table continues during new-table copy',lambda: applied(existing['end_lsn'])
            and sub_sql('select count(*) from bootstrap_items where id=3000 and value=2')=='1')
        assert relation(table)[0]['srsubstate']=='d' and rows(sub_sql,table)==[]
        emit('existing_table_streams_during_refresh',dict(commit=existing,origin=origin(),new_table_state=relation(table)))
    writes=[]
    for n in range(1,batches+1):
        record=commit('update '+table+" set value=value+1,note='updated_"+str(n)+"' where id between 1 and 10; "
            'delete from '+table+' where id='+str(40+n)+'; insert into '+table+
            ' values('+str(100+n)+','+str(n)+",'inserted_"+str(n)+"')")
        assert sql('select '+quote(record['end_lsn'])+'::pg_lsn>'+quote(copy_position)+'::pg_lsn')=='t'
        writes.append(record)
    assert copy_waiter(table) and relation(table)[0]['srsubstate']=='d' and rows(sub_sql,table)==[]
    expected=rows(sql,table)
    assert len(expected)==100
    emit(table+'_writes_during_copy',dict(commits=writes,source_rows=expected,subscriber_rows=[],relation=relation(table)))
    release(keeper)
    wait_for(table+' ready with full source contents',lambda: relation(table) and relation(table)[0]['srsubstate']=='r'
        and rows(sub_sql,table)==expected,seconds=30)
    evidence=audit(table)
    copied=[e for e in evidence if e['op']=='INSERT' and e['after_row']['id']<=100]
    assert sorted([e['after_row'] for e in copied],key=lambda r:r['id'])==snapshot,copied
    copy_xids={e['xid'] for e in copied}
    assert copy_xids=={int(blocked[0]['xid'])},copy_xids
    tail=[e for e in evidence if e not in copied]
    assert len(tail)==12*batches and all(e['xid'] not in copy_xids for e in tail),tail
    for n in range(1,batches+1):
        updates=[e for e in tail if e['op']=='UPDATE' and e['after_row']['value']==n]
        assert sorted(e['after_row']['id'] for e in updates)==list(range(1,11))
        assert all(e['before_row']['value']==n-1 and e['after_row']['note']=='updated_'+str(n) for e in updates)
        deletes=[e for e in tail if e['op']=='DELETE' and e['before_row']['id']==40+n]
        inserts=[e for e in tail if e['op']=='INSERT' and e['after_row']['id']==100+n]
        assert len(deletes)==len(inserts)==1
        assert deletes[0]['before_row']==dict(id=40+n,value=0,note='seed')
        assert inserts[0]['after_row']==dict(id=100+n,value=n,note='inserted_'+str(n))
        assert len({e['xid'] for e in updates+deletes+inserts})==1
    post=commit('insert into '+table+" values(2000,1,'after ready')")
    expected=rows(sql,table)
    wait_for(table+' post-ready streamed receipt',lambda: applied(post['end_lsn']) and rows(sub_sql,table)==expected)
    assert relation(table)[0]['srsublsn'] is not None
    wait_for(table+' sync slot removed',lambda: len(slots())==1 and slots()[0]['slot_name']=='owned_bootstrap')
    emit(table+'_snapshot_and_tail_verified',dict(copy_transaction_ids=list(copy_xids),snapshot_rows=snapshot,
        worker_search_paths=sorted({e['worker_search_path'] for e in evidence}),
        applied_tail=tail,commits=writes,source_rows=expected,subscriber_rows=rows(sub_sql,table),
        state=relation(table),origin=origin(),post_ready_commit=post,slots=slots()))

try:
    with (data/'postgresql.conf').open('a') as config:
        config.write("\nwal_level=logical\nmax_wal_senders=6\nmax_replication_slots=6\nmax_wal_size='128MB'\nautovacuum=off\n")
    start()
    sql('create extension pg_walinspect')
    sql('create role owned_publisher login replication')
    server('initdb','-D',subdata,'-U','postgres','--auth-local=trust','--auth-host=reject',
        '--no-locale','--data-checksums','--wal-segsize=1')
    with (subdata/'postgresql.conf').open('a') as config:
        config.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='"+str(subsock)+"'\n"
            "shared_buffers='16MB'\nmax_connections=10\nmax_worker_processes=8\nmax_logical_replication_workers=4\n"
            "max_sync_workers_per_subscription=1\nfsync=on\nsynchronous_commit=on\nfull_page_writes=on\n"
            "min_wal_size='2MB'\nmax_wal_size='8MB'\ncheckpoint_timeout='1h'\nlogging_collector=off\nautovacuum=off\n")
    server('pg_ctl','-D',subdata,'-l',sublog,'-w','-t','20','start',timeout=25)
    assert sub_sql('show data_directory')==str(subdata)
    identities=dict(source=sql('select system_identifier::text from pg_control_system()'),
        subscriber=sub_sql('select system_identifier::text from pg_control_system()'))
    assert identities['source']!=identities['subscriber']
    assert sub_sql('select pg_is_in_recovery()')=='f'
    sub_sql('create table bootstrap_audit(seq bigserial primary key,table_name text not null,xid bigint not null, '
        'op text not null,before_row jsonb,after_row jsonb,worker_search_path text not null)')
    sub_sql("""create function observe_bootstrap() returns trigger language plpgsql as $$
    begin
      if TG_OP='INSERT' and NEW.id=1 and NEW.value=0 then
        perform pg_advisory_xact_lock(TG_ARGV[0]::bigint);
      end if;
      insert into public.bootstrap_audit(table_name,xid,op,before_row,after_row,worker_search_path)
        values(TG_TABLE_NAME,txid_current(),TG_OP,
          case when TG_OP='INSERT' then null else to_jsonb(OLD) end,
          case when TG_OP='DELETE' then null else to_jsonb(NEW) end,current_setting('search_path'));
      if TG_OP='DELETE' then return OLD; end if;
      return NEW;
    end $$""")
    emit('owned_bootstrap_endpoints',dict(identities=identities,source=str(data),subscriber=str(subdata),batches=batches))
    handoff('bootstrap_items',70101,True)
    handoff('bootstrap_ledger',70102,False)
    final={table:rows(sql,table) for table in ['bootstrap_items','bootstrap_ledger']}
    assert final=={table:rows(sub_sql,table) for table in final}
    assert len(final['bootstrap_items'])==102 and len(final['bootstrap_ledger'])==101
    publication=json.loads(sql("select row_to_json(p) from (select pubinsert,pubupdate,pubdelete,pubtruncate "
        "from pg_publication where pubname='owned_publication') p"))
    assert publication==dict(pubinsert=True,pubupdate=True,pubdelete=True,pubtruncate=False)
    publication_tables=json.loads(sql("select json_agg(tablename order by tablename) from pg_publication_tables where pubname='owned_publication'"))
    assert publication_tables==['bootstrap_items','bootstrap_ledger']
    sender=json.loads(sql("select json_agg(s) from (select usename,application_name,state from pg_stat_replication) s"))
    assert len(sender)==1 and sender[0]==dict(usename='owned_publisher',application_name='owned_subscription',state='streaming'),sender
    assert slots()[0]['active'] and slots()[0]['plugin']=='pgoutput'
    errors=json.loads(sub_sql("select row_to_json(s) from (select apply_error_count,sync_error_count from pg_stat_subscription_stats "
        "where subid="+str(subid)+") s"))
    assert errors==dict(apply_error_count=0,sync_error_count=0),errors
    emit('bootstrap_complete',dict(source=final,subscriber={table:rows(sub_sql,table) for table in final},
        states={table:relation(table) for table in final},publication=publication,tables=publication_tables,
        sender=sender,workers=workers(),slots=slots(),origin=origin(),errors=errors))
    print('PASS: actual initial copy and refreshed-table copy preserve their snapshots, apply concurrent insert/update/delete tails and continue streaming with complete domain agreement.',flush=True)
finally:
    for item in keepers:
        if item['process'].poll() is None:
            item['process'].kill()
            item['process'].wait(timeout=5)
        if not item['out'].closed:
            item['out'].close()
    try:
        if (subdata/'postmaster.pid').exists():
            existing=sub_sql("select oid from pg_subscription where subname='owned_subscription'")
            if existing:
                subid=int(existing)
                sub_sql('alter subscription owned_subscription disable')
                wait_for('owned subscription workers stopped',lambda: sub_sql("select count(*) from pg_stat_subscription "
                    "where subid="+str(subid)+" and pid is not null")=='0')
                sub_sql('alter subscription owned_subscription set (slot_name=none)')
                sub_sql('drop subscription owned_subscription')
                assert sub_sql("select count(*) from pg_subscription where subname='owned_subscription'")=='0'
        if (data/'postmaster.pid').exists():
            owned="slot_name='owned_bootstrap'"
            if subid is not None:
                owned+=' or slot_name like '+quote('pg_'+str(subid)+'_sync_%')
            wait_for('owned logical slots inactive',lambda: sql('select count(*) from pg_replication_slots where ('+owned+') and active')=='0')
            sql('select pg_drop_replication_slot(slot_name) from pg_replication_slots where '+owned)
            assert sql('select count(*) from pg_replication_slots')=='0'
            sql('drop publication if exists owned_publication')
    finally:
        try:
            if (subdata/'postmaster.pid').exists():
                server('pg_ctl','-D',subdata,'-m','fast','-w','-t','20','stop',timeout=25)
        finally:
            stop()
    print('Owned bootstrap clients/servers stopped; subscription, publication and slots removed; evidence retained at',root,flush=True)
PY`;
}

export const LOGICAL_BOOTSTRAP_VARIATION = bootstrapExperiment(4);
export const LOGICAL_BOOTSTRAP: Draft = {
  slug: "publication-and-subscription",
  revision: 4,
  tags: ["logical-replication", "replication-slots", "cdc", "snapshots", "consistency"],
  title: "Verify the snapshot and change stream during logical bootstrap",
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 50,
  prerequisites: ["slot-position-and-acknowledgement"],
  overview: code`
Bootstrap a real logical subscription while source writes continue, then add a second table through
publication refresh and repeat the handoff. Pause each actual COPY worker after it receives a row;
a subscriber audit records the original snapshot separately from later INSERT, UPDATE and DELETE
transactions. Require complete contents and a post-ready streamed receipt before declaring success.
The variation doubles the committed write batches during each paused copy.`,
  reading:
    'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 4 "Snapshots" and Chapter 11 "WAL Modes".',
  caution: code`
Run the complete shell script with Python3, PostgreSQL16 server binaries and pg_walinspect available;
PGBIN may select the binary folder. Fresh source/subscriber processes have independent data and
private sockets with TCP disabled. Inherited PG/PGLAB settings are ignored; root uses runuser as
the postgres OS owner. Allow a few hundred MB per retained run. Finally releases owned gate clients,
disables/drops the subscription, removes its source slots/publication and stops both servers.

An explicitly enabled replica row trigger is measurement instrumentation: it pauses COPY and records
row images in a local subscriber audit table. It changes timing and write cost, so this is not a
throughput benchmark or a production trigger recommendation. The driver owns all writers and uses
matching schemas/primary keys. No learner database, source slot or progress record is changed.`,
  syntaxBreakdown: code`
### In plain terms

A new subscriber needs an existing dataset and the changes committed while that dataset is being
copied. A final row count alone cannot prove the handoff was correct. Here the subscriber records
the exact seed rows it copied, then each later change in a different local transaction. The same
experiment runs when creating a subscription and when adding a table to an existing stream; the
older table continues receiving work while the new table is still copying.

### What you are learning

- **Snapshot plus tail:** the copied image and later committed row changes must join without missing or repeating work.
- **Membership versus readiness:** adding a publication table does not register it with an existing subscription until refresh.
- **Data and apply evidence:** transport positions, per-table state, origin progress and full domain contents answer different questions.
- **Schema and identity prerequisites:** logical apply maps into independently created target tables and needs appropriate row identity.

### Piece by piece

- **python3** embeds the owned-cluster helper. **PGBIN / pg_config --bindir** selects binaries;
  **tempfile.mkdtemp** creates private paths, and root-only **runuser/os.chown** assigns server
  ownership. Cleared PG variables and separate **PGHOST** sockets isolate both servers;
  **PGPORT=6543** is reused locally while **listen_addresses=''** disables TCP.
- **initdb -D -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** names each independent data directory/administrator, permits local access inside
  the protected directory, rejects host authentication, fixes locale and enables checksums with1MB
  WAL segments. **pg_control_system.system_identifier** must differ between the two clusters.
  The logical subscriber is an ordinary writable server with **pg_is_in_recovery=false**.
- Both fixtures use16MB buffers,10 connections, **fsync/synchronous_commit/full_page_writes=on**,
  1h checkpoint timeout, no logging collector and autovacuum off. Source **wal_level=logical**,
  six senders/slots and128MB WAL target support the bounded workload. Subscriber worker capacity is
  eight total workers, four logical workers and one table-sync worker per subscription. These are
  small lab bounds; they do not establish a production capacity recommendation.
- **pg_ctl -D -l -w -t20 start** starts each owned directory with its log and bounded readiness.
  **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, prints unaligned tuples only, fails
  on SQL errors and executes commands. Connect, statement/lock and subprocess timeouts bound calls.
  **quote** escapes controlled SQL string literals; there is no external connection or query input.
- **CREATE ROLE owned_publisher LOGIN REPLICATION** supplies the source replication connection.
  **GRANT SELECT** on each published table permits its initial COPY. **CREATE EXTENSION
  pg_walinspect** supports exact committed WAL-record boundaries used later for apply checks.
- **setup_table** creates identical source/subscriber schemas with **id PRIMARY KEY**, non-null
  integer value and non-null note. Source **generate_series(1,100)** seeds100 rows at value0/note seed.
  **pg_class.relreplident='d'** and a **pg_index.indisprimary** entry verify DEFAULT identity with a
  primary key on both sides. Schema is created explicitly; publication does not create target DDL.
- **bootstrap_audit** is a subscriber-only table with a **bigserial** sequence, table name, local
  transaction ID, operation, before/after JSON row images and observed worker search_path.
  **observe_bootstrap() RETURNS trigger LANGUAGE plpgsql** records each inserted, updated or deleted
  row. **TG_OP/TG_TABLE_NAME/TG_ARGV**, **OLD/NEW**, **to_jsonb** and **txid_current** supply the
  operation, target table, gate key, row images and local transaction identity.
- The trigger explicitly writes **public.bootstrap_audit**. Its table reference must resolve in
  the replication worker's execution environment; an unqualified reference failed during the
  prototype even though interactive psql could read that table. **current_setting('search_path')**
  records the actual worker setting rather than assuming the interactive default.
- **CREATE TRIGGER ... AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW**, followed by
  **ENABLE REPLICA TRIGGER**, makes this instrumentation run during logical apply and initial COPY.
  Logical workers use replica mode, which normally suppresses ordinary triggers. The initial row
  with id1/value0 calls **pg_advisory_xact_lock** on its table's dedicated gate before audit insertion.
- **gate** starts an owned persistent psql client with a stdin pipe and file-backed output.
  **pg_advisory_lock** holds that same key until explicitly released. **PGAPPNAME** labels the
  keeper; **psql \echo GATE_HELD** plus process polling establishes the held gate before bootstrap.
  The row trigger blocks only after a seed row from the real COPY has arrived, so later source
  writes happen after COPY's snapshot was selected. No fixed sleep chooses this boundary.
- **CREATE PUBLICATION owned_publication FOR TABLE ... WITH (publish='insert, update, delete')**
  selects the first table and all three tested operations. **CREATE SUBSCRIPTION ... CONNECTION
  ... PUBLICATION ... WITH (slot_name='owned_bootstrap',copy_data=true)** connects the independent
  subscriber and creates its pgoutput slot. These are separate clusters, so this does not exercise
  the same-cluster slot-creation wait. **pg_subscription.oid** identifies this subscription's workers,
  relation states and replication origin throughout the script.
- **copy_waiter** joins **pg_stat_subscription** and **pg_stat_activity** by worker PID, matches
  the table's relid and requires **wait_event_type='Lock'/wait_event='advisory'**. This locates the
  actual table-copy worker blocked inside the trigger. Its backend XID is saved; its ordinary
  activity state can be NULL because it is a background worker.
- **pg_subscription_rel** must show **srsubstate='d'** while independent table/audit reads are
  empty. The uncommitted copied rows are not yet visible. State codes include i initialize, d copy,
  f copy finished, s synchronized and r ready; brief intermediate states need not be sampled.
  **srsublsn** is a state-change coordination LSN in s/r, otherwise NULL. It is not a universal
  snapshot timestamp or an assertion that COPY and stream positions must be the same number.
- A table-sync worker creates a generated **pg_<subscription oid>_sync_...** source slot. Save
  its plugin, active/temporary flags, restart position, confirmation and catalog horizon while COPY
  is held. Its lifetime is bounded by synchronization; short-lived does not imply a temporary slot
  or a continuously active consumer. The main owned_bootstrap slot is a separate retention owner.
- **commit** executes BEGIN, **txid_current**, the supplied writes and COMMIT on one source
  connection. It brackets physical inspection with **pg_current_wal_insert_lsn** and the flushed
  position after successful COMMIT. **pg_get_wal_records_info** filtered by the captured XID and
  **Transaction/COMMIT** returns one exact end_lsn, avoiding a guessed idle insertion boundary.
- During each paused copy, each source batch updates IDs1–10 by one and changes their note,
  deletes one distinct seed ID starting at41, and inserts one new ID starting at101. Core runs two
  committed batches; hint2 runs four. Their COMMIT boundaries must be later than the sampled sync
  slot start. Fresh source contents change while the subscriber remains empty and its worker is
  still blocked in state d. Record the complete source rows and every committed boundary.
- **release** sends **pg_advisory_unlock** and **psql \q** to the keeper, checks true/success and
  waits for exit. The worker can finish COPY and catch up. **wait_for** then requires state r and
  full source/subscriber equality within30s, not merely a worker PID or received_lsn.
- Read the audit after readiness. Exactly100 seed INSERT images must equal the saved pre-copy
  source image, including rows later deleted and old values later updated. Their single local XID
  must match the previously blocked COPY worker. The later12 events per batch belong to different
  local transactions: ten UPDATEs with the expected old/new values, one DELETE and one INSERT.
  Each batch's twelve events share one local transaction. This checks actual snapshot and tail
  contents, rather than inferring a correct handoff from a final count.
- Commit a new **after ready** receipt with ID2000. The main **pg_replication_origin_status**
  entry named **pg_<subscription oid>** must reach that exact source COMMIT end in **remote_lsn**,
  followed by fresh full table equality. **local_lsn** is retained as the subscriber-side position.
  Apply-origin progress is different from **pg_stat_subscription.received_lsn/latest_end_lsn**;
  neither transport alone nor origin progress substitutes for per-table readiness and domain checks.
  The completed table-sync slot must disappear, leaving only the main slot.
- The second phase creates matching **bootstrap_ledger** tables on both sides, seeds only the
  source and installs a separate subscriber gate. **ALTER PUBLICATION ADD TABLE** changes publisher membership, verified through
  **pg_publication_tables**, while the subscriber still has no relation entry for that table.
  **ALTER SUBSCRIPTION REFRESH PUBLICATION WITH (copy_data=true)** registers it and starts its copy.
- While that new COPY worker is actually paused, commit receipt3000 to the already-ready
  bootstrap_items table. Require its origin progress and actual subscriber row while ledger is
  still empty/state d. Then repeat the complete two/four-batch INSERT/UPDATE/DELETE handoff for
  ledger. Each table has its own snapshot/coordination history; an unfinished multi-table bootstrap
  is not presented as one globally ready snapshot.
- Final **pg_publication** flags must permit INSERT/UPDATE/DELETE and exclude TRUNCATE; publication
  membership contains exactly the two tables. **pg_stat_replication** must show one streaming
  owned_subscription sender using owned_publisher, and the main slot must be active with pgoutput.
  **pg_stat_subscription_stats** must show zero apply/sync errors. Both complete inventories agree:
  102 item rows and101 ledger rows, with all values/notes checked rather than only those counts.
- **emit/json.dumps** retain complete row images, source COMMIT records, copied/catch-up transaction
  IDs, source slot observations, worker waits, membership, relation states and origin progress.
  **finally** kills/reaps any remaining gate client, disables the subscription and waits for workers
  to stop. **SET (slot_name=none)** detaches its slot before local DROP SUBSCRIPTION. Drop only the
  main slot and generated sync slots belonging to that subscription after verifying inactivity;
  remove the owned publication and stop both servers with **pg_ctl -m fast -w -t20 stop**.`,
  code: bootstrapExperiment(2),
  expectedResult: code`
For each table, the real copy worker reaches its advisory gate with state d, srsublsn NULL and no
visible copied rows. Its generated pgoutput synchronization slot is recorded separately from the
main subscription slot. Two source transactions each update ten seed rows, delete one seed row and
insert one new row while that copy remains unfinished.

After release, exactly100 audited seed INSERTs match the original value0/note seed image under the
blocked COPY worker's local XID. Exactly24 later row events form two distinct transactions with the
expected before/after values, deletes and inserts. State becomes r and complete table contents agree.
A new ID2000 receipt then passes the actual apply-origin COMMIT gate and appears correctly.

Adding ledger to the publication alone leaves it absent from subscription relation state. REFRESH
starts its own copy. During its pause, receipt3000 still reaches the already-ready items table.
Ledger then passes the same snapshot/tail and post-ready checks. Final source/subscriber inventories
match102 items and101 ledger rows, both ready, one active pgoutput main slot/sender, and zero apply
or sync errors. Temporary gate clients, subscription, publication and source slots are cleaned up;
all owned servers stop and their evidence remains.

Hint2 doubles only the overlap workload to four batches per table. It has the same100-row copied
images,48 tail events per table, IDs1–10 reaching value4, four seed deletions/new inserts, and the
same final row counts with their corresponding exact payloads. LSNs, XIDs, worker PIDs, sampled
intermediate states and timing vary. No throughput result or equality of different coordination
positions is claimed.`,
  systemsLens: code`
A snapshot supplies old state while a retained log supplies changes committed after that snapshot.
Correct bootstrap needs evidence that those two inputs join, not only that a transport connects or
that row counts happen to match. Publication membership, target schema, per-table readiness and
applied transaction boundaries are separate responsibilities. Observe complete row histories at the
handoff, then verify new work after readiness before allowing the replica to answer for that data.`,
  challenge: code`
Run hint2 with four source write batches during each paused COPY instead of two. Predict the copied
images, tail-event count, deleted/new IDs and final values before comparing the audit and both
servers. Explain why the final row counts stay unchanged despite more changes, why srsublsn is not
an exported snapshot ID, and which readiness checks an application needs while a newly published
table is still copying but an older table continues to stream.`,
};
