import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function resnapshotExperiment(refresh: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\ntry_refresh = ${refresh ? "True" : "False"}\n` + code`
subdata,subsock,sublog=root/'subscriber',root/'subscriber-socket',root/'subscriber.log'
subsock.mkdir()
if os.geteuid()==0:
    os.chown(subsock,owner.pw_uid,owner.pw_gid)
subenv=dict(env,PGHOST=str(subsock))
subid=None
subids=[]
slot_name='owned_retention'

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

def rows(query):
    return json.loads(query("select coalesce(json_agg(r order by id),'[]') from retention_items r"))

def relation():
    return json.loads(sub_sql("select coalesce(json_agg(r),'[]') from (select srrelid::regclass::text as table_name,"
        "srsubstate,srsublsn from pg_subscription_rel where srsubid="+str(subid)+") r"))

def errors():
    return json.loads(sub_sql("select row_to_json(r) from (select apply_error_count,sync_error_count "
        "from pg_stat_subscription_stats where subid="+str(subid)+") r"))

def origin():
    return sub_sql("select remote_lsn from pg_replication_origin_status where external_id="+quote('pg_'+str(subid)))

def applied(bound):
    return sub_sql("select coalesce((select remote_lsn>="+quote(bound)+"::pg_lsn from "
        "pg_replication_origin_status where external_id="+quote('pg_'+str(subid))+"),false)")=='t'

def slot():
    return json.loads(sql("select coalesce((select row_to_json(s) from (select slot_name,plugin,active,restart_lsn,"
        "confirmed_flush_lsn,catalog_xmin::text,wal_status,safe_wal_size,"
        "pg_wal_lsn_diff(pg_current_wal_insert_lsn(),confirmed_flush_lsn) as unconfirmed_bytes "
        "from pg_replication_slots where slot_name="+quote(slot_name)+") s),'null'::json)"))

def wal_files():
    return json.loads(sql("select json_agg(r order by name) from (select name,size from pg_ls_waldir() "
        "where name ~ '^[0-9A-F]{24}$') r"))

def stopped():
    return sub_sql("select not subenabled and not exists(select 1 from pg_stat_subscription s "
        "where s.subid=p.oid and s.pid is not null) from pg_subscription p where oid="+str(subid))=='t'

def disable():
    sub_sql('alter subscription owned_subscription disable')
    wait_for('subscription disabled and workers gone',stopped)
    wait_for('source slot absent or inactive',lambda: slot() is None or not slot()['active'])

def enable():
    sub_sql('alter subscription owned_subscription enable')

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

def converged(bound):
    expected=rows(sql)
    wait_for('applied commit and complete contents',lambda: applied(bound) and rows(sub_sql)==expected)
    assert relation()[0]['srsubstate']=='r'
    return expected

def differences():
    source={r['id']:r for r in rows(sql)}
    subscriber={r['id']:r for r in rows(sub_sql)}
    return [dict(id=i,source=source.get(i),subscriber=subscriber.get(i))
        for i in sorted(source.keys()|subscriber.keys()) if source.get(i)!=subscriber.get(i)]

def create_subscription():
    global subid
    connection='host='+str(sock)+' port=6543 user=owned_publisher dbname=postgres'
    sub_sql('create subscription owned_subscription connection '+quote(connection)+
        ' publication owned_publication with (slot_name='+quote(slot_name)+
        ',copy_data=true,disable_on_error=true,streaming=off,synchronous_commit=on)')
    subid=int(sub_sql("select oid from pg_subscription where subname='owned_subscription'"))
    subids.append(subid)
    wait_for('new subscription copy ready',lambda: relation() and relation()[0]['srsubstate']=='r'
        and rows(sub_sql)==rows(sql))
    wait_for('new table-sync slot removed',lambda: sql('select count(*) from pg_replication_slots')=='1')

try:
    with (data/'postgresql.conf').open('a') as config:
        config.write("\nwal_level=logical\nmax_wal_senders=4\nmax_replication_slots=4\nmax_wal_size='8MB'\n"
            "max_slot_wal_keep_size=-1\nwal_keep_size=0\nautovacuum=off\n")
    start()
    sql('create extension pg_walinspect')
    sql('create role owned_publisher login replication')
    server('initdb','-D',subdata,'-U','postgres','--auth-local=trust','--auth-host=reject',
        '--no-locale','--data-checksums','--wal-segsize=1')
    with (subdata/'postgresql.conf').open('a') as config:
        config.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='"+str(subsock)+"'\n"
            "shared_buffers='16MB'\nmax_connections=10\nmax_worker_processes=8\nmax_logical_replication_workers=4\n"
            "max_sync_workers_per_subscription=1\nfsync=on\nsynchronous_commit=on\nfull_page_writes=on\n"
            "min_wal_size='2MB'\nmax_wal_size='8MB'\ncheckpoint_timeout='1h'\nlogging_collector=off\n"
            "autovacuum=off\nlog_error_verbosity=verbose\nlog_line_prefix='%m [%p] %e '\n")
    server('pg_ctl','-D',subdata,'-l',sublog,'-w','-t','20','start',timeout=25)
    assert sub_sql('show data_directory')==str(subdata)
    identities=dict(source=sql('select system_identifier::text from pg_control_system()'),
        subscriber=sub_sql('select system_identifier::text from pg_control_system()'))
    assert identities['source']!=identities['subscriber'] and sub_sql('select pg_is_in_recovery()')=='f'
    schema='create table retention_items(id int primary key,value int not null,note text not null)'
    sql(schema)
    sub_sql(schema)
    sql("insert into retention_items select g,0,'seed' from generate_series(1,10) g")
    sql('grant select on retention_items to owned_publisher')
    sql('create table unrelated_churn(id int, padding text)')
    sql('create publication owned_publication for table retention_items')
    sub_sql('create table consumer_generation(generation int not null); insert into consumer_generation values(1)')
    sub_sql('create table consumer_audit(seq bigserial primary key,generation int not null,op text not null, '
        'id int not null,value int not null,note text not null)')
    sub_sql("""create function audit_retention() returns trigger language plpgsql as $$
    begin
      if TG_OP='DELETE' then
        insert into public.consumer_audit(generation,op,id,value,note)
          select generation,TG_OP,OLD.id,OLD.value,OLD.note from public.consumer_generation;
        return OLD;
      end if;
      insert into public.consumer_audit(generation,op,id,value,note)
        select generation,TG_OP,NEW.id,NEW.value,NEW.note from public.consumer_generation;
      return NEW;
    end $$""")
    sub_sql('create trigger audit_retention after insert or update or delete on retention_items '
        'for each row execute function audit_retention()')
    sub_sql('alter table retention_items enable replica trigger audit_retention')
    create_subscription()
    initial=commit("insert into retention_items values(90,1,'initial receipt')")
    converged(initial['end_lsn'])
    emit('owned_retention_endpoints',dict(identities=identities,source=str(data),subscriber=str(subdata),
        try_refresh=try_refresh,source_rows=rows(sql),subscriber_rows=rows(sub_sql)))

    disable()
    paused=slot();before_rows=rows(sub_sql);before_wal=wal_files()
    retained=commit("update retention_items set value=1,note='retained update' where id between 1 and 3; "
        "delete from retention_items where id=4; insert into retention_items values(20,20,'retained insert')")
    for batch in range(4):
        sql('insert into unrelated_churn select '+str(batch*256)+"+g,repeat(md5(g::text),16) from generate_series(1,256) g")
        sql('select pg_switch_wal()')
    sql('checkpoint')
    queued=slot();after_wal=wal_files()
    assert queued['restart_lsn']==paused['restart_lsn'] and queued['confirmed_flush_lsn']==paused['confirmed_flush_lsn']
    assert queued['unconfirmed_bytes']>3*1024*1024 and queued['safe_wal_size'] is None
    needed=sql('select pg_walfile_name('+quote(paused['restart_lsn'])+'::pg_lsn)')
    assert needed in [f['name'] for f in after_wal]
    assert rows(sub_sql)==before_rows and not applied(retained['end_lsn'])
    emit('logical_slot_retains_pending_work',dict(before=paused,after=queued,oldest_needed_file=needed,
        before_wal=before_wal,after_wal=after_wal,source_rows=rows(sql),subscriber_rows=rows(sub_sql),commit=retained))
    enable()
    converged(retained['end_lsn'])
    resumed=commit("insert into retention_items values(91,1,'retained-slot resume receipt')")
    converged(resumed['end_lsn'])
    wait_for('consumer acknowledgement advances',lambda: sql('select confirmed_flush_lsn>='+quote(resumed['end_lsn'])+
        "::pg_lsn from pg_replication_slots where slot_name='owned_retention'")=='t')
    emit('retained_slot_resumes',dict(slot=slot(),origin=origin(),source_rows=rows(sql),subscriber_rows=rows(sub_sql),commit=resumed))

    disable()
    gap=commit("update retention_items set value=50,note='missed gap update' where id=1; "
        "delete from retention_items where id=2; insert into retention_items values(600,600,'missed gap insert')")
    ephemeral_insert=commit("insert into retention_items values(1000,7,'committed then deleted in gap')")
    ephemeral_image=next(r for r in rows(sql) if r['id']==1000)
    ephemeral_delete=commit('delete from retention_items where id=1000')
    assert sub_sql('select count(*) from consumer_audit where id=1000')=='0'
    lost=slot();oldorigin=origin()
    assert not applied(gap['end_lsn']) and stopped()
    emit('pending_history_before_slot_drop',dict(slot=lost,origin=oldorigin,commit=gap,
        transient_insert=ephemeral_insert,transient_image=ephemeral_image,transient_delete=ephemeral_delete,
        source_rows=rows(sql),subscriber_rows=rows(sub_sql),differences=differences()))
    sql("select pg_drop_replication_slot('owned_retention')")
    assert slot() is None
    assert sub_sql("select subslotname from pg_subscription where oid="+str(subid))=='owned_retention'
    offset=len(sublog.read_text())
    enable()
    wait_for('actual missing-slot connection error',lambda: 'replication slot "owned_retention" does not exist' in sublog.read_text()[offset:])
    wait_for('failed connection worker exited',lambda: sub_sql("select count(*) from pg_stat_subscription where subid="+
        str(subid)+" and pid is not null")=='0')
    enabled_after_failure=sub_sql("select subenabled from pg_subscription where oid="+str(subid))
    connection_errors=errors()
    assert enabled_after_failure=='t' and connection_errors==dict(apply_error_count=0,sync_error_count=0)
    disable()
    emit('missing_slot_connection_failure',dict(log=sublog.read_text()[offset:],errors=connection_errors,
        enabled_before_explicit_disable=enabled_after_failure,origin=origin(),slot=slot()))

    recreated=json.loads(sql("select row_to_json(r) from pg_create_logical_replication_slot('owned_retention','pgoutput') r"))
    assert sql('select '+quote(recreated['lsn'])+'::pg_lsn>'+quote(ephemeral_delete['end_lsn'])+'::pg_lsn')=='t'
    # Old WAL records remain physically inspectable, but the new logical slot has a new start.
    for record in [gap,ephemeral_insert,ephemeral_delete]:
        assert sql('select count(*) from pg_get_wal_records_info('+quote(record['start_lsn'])+','+quote(record['end_lsn'])+
            ") where resource_manager='Transaction' and record_type='COMMIT' and xid::text="+quote(record['xid']))=='1'
    assert origin()==oldorigin
    emit('same_name_new_slot',dict(old_slot=lost,new_slot=slot(),creation=recreated,preserved_origin=origin(),
        old_commit_records_still_available=[gap,ephemeral_insert,ephemeral_delete]))
    enable()
    probe=commit("insert into retention_items values(900,1,'new-slot streamed receipt')")
    wait_for('new slot streams new work',lambda: applied(probe['end_lsn']) and sub_sql('select count(*) from retention_items where id=900')=='1')
    diff=differences()
    assert [d['id'] for d in diff]==[1,2,600],diff
    emit('new_slot_progress_without_repair',dict(slot=slot(),origin=origin(),differences=diff,
        source_rows=rows(sql),subscriber_rows=rows(sub_sql),commit=probe))
    before_refresh=relation()
    if try_refresh:
        sub_sql('alter subscription owned_subscription refresh publication with (copy_data=true)')
    control=commit("insert into retention_items values(901,1,'after refresh decision')")
    wait_for('receipt after refresh decision',lambda: applied(control['end_lsn'])
        and sub_sql('select count(*) from retention_items where id=901')=='1')
    assert relation()==before_refresh and [d['id'] for d in differences()]==[1,2,600]
    emit('refresh_decision_does_not_resnapshot',dict(tried_refresh=try_refresh,before_relation=before_refresh,
        after_relation=relation(),differences=differences(),origin=origin(),commit=control))

    # Declare the source authoritative for current table state and stop all driver-owned source writes.
    disable()
    snapshot=rows(sql)
    sub_sql('create table stale_consumer_evidence as select * from retention_items')
    oldsubid=subid
    sub_sql('alter subscription owned_subscription set (slot_name=none)')
    sub_sql('drop subscription owned_subscription')
    assert sub_sql('select count(*) from pg_replication_origin_status where external_id='+quote('pg_'+str(oldsubid)))=='0'
    sql("select pg_drop_replication_slot('owned_retention')")
    sub_sql('begin; truncate retention_items; update consumer_generation set generation=2; commit')
    assert rows(sub_sql)==[]
    slot_name='owned_resnapshot'
    create_subscription()
    assert subid!=oldsubid and rows(sub_sql)==snapshot
    copied=json.loads(sub_sql("select json_agg(r order by id) from (select id,value,note from consumer_audit "
        "where generation=2 and op='INSERT') r"))
    assert copied==snapshot
    assert errors()==dict(apply_error_count=0,sync_error_count=0)
    emit('fresh_snapshot_reconciles_current_state',dict(old_subscription_oid=oldsubid,new_subscription_oid=subid,
        snapshot=snapshot,copied_rows=copied,slot=slot(),source_rows=rows(sql),subscriber_rows=rows(sub_sql)))
    after=commit("insert into retention_items values(902,1,'after resnapshot receipt')")
    final=converged(after['end_lsn'])
    assert [r['id'] for r in final]==[1,3,5,6,7,8,9,10,20,90,91,600,900,901,902]
    assert sub_sql('select count(*) from stale_consumer_evidence where id=2')=='1'
    assert sub_sql('select value from stale_consumer_evidence where id=1')=='1'
    assert sub_sql('select count(*) from stale_consumer_evidence where id=600')=='0'
    assert sql('select count(*) from retention_items where id=1000')=='0'
    assert sub_sql('select count(*) from consumer_audit where id=1000')=='0'
    assert errors()==dict(apply_error_count=0,sync_error_count=0) and slot()['active']
    emit('resnapshot_complete_with_history_limit',dict(source_rows=final,subscriber_rows=rows(sub_sql),
        origin=origin(),slot=slot(),errors=errors(),post_snapshot_commit=after,
        historical_insert=ephemeral_insert,historical_delete=ephemeral_delete,
        historical_image=ephemeral_image,consumer_events_for_1000=0))
    print('PASS: retained slot replays pending work; same-name recreation does not repair the gap; fresh snapshot restores current state but not the missing historical event.',flush=True)
finally:
    try:
        if (subdata/'postmaster.pid').exists():
            existing=sub_sql("select oid from pg_subscription where subname='owned_subscription'")
            if existing:
                subid=int(existing)
                if subid not in subids:
                    subids.append(subid)
                disable()
                sub_sql('alter subscription owned_subscription set (slot_name=none)')
                sub_sql('drop subscription owned_subscription')
                assert sub_sql("select count(*) from pg_subscription where subname='owned_subscription'")=='0'
        if (data/'postmaster.pid').exists():
            owned="slot_name in ('owned_retention','owned_resnapshot')"
            for identifier in subids:
                owned+=' or slot_name like '+quote('pg_'+str(identifier)+'_sync_%')
            wait_for('owned source slots inactive',lambda: sql('select count(*) from pg_replication_slots where ('+owned+') and active')=='0')
            sql('select pg_drop_replication_slot(slot_name) from pg_replication_slots where '+owned)
            assert sql('select count(*) from pg_replication_slots')=='0'
            sql('drop publication if exists owned_publication')
    finally:
        try:
            if (subdata/'postmaster.pid').exists():
                server('pg_ctl','-D',subdata,'-m','fast','-w','-t','20','stop',timeout=25)
        finally:
            stop()
    print('Owned resnapshot source/subscriber stopped and subscription/publication/slots removed; evidence retained at',root,flush=True)

PY`;
}
export const LOGICAL_RESNAPSHOT_CORE = resnapshotExperiment(false);
export const LOGICAL_RESNAPSHOT_VARIATION = resnapshotExperiment(true);

export const LOGICAL_RESNAPSHOT: Draft = {
  slug: "slot-lag-and-disk",
  revision: 4,
  tags: ["replication-slots", "logical-replication", "wal", "consistency", "recovery"],
  title: "Recover a logical consumer after its slot is lost",
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 45,
  prerequisites: ["conflicts-stop-the-apply-worker"],
  overview: code`
Pause an independent logical subscriber and verify that its retained slot lets it replay pending
changes. Then delete the slot with another backlog still pending: a new slot with the same name
streams new work but leaves missing, extra and stale rows. Rebuild from a fresh subscription snapshot
and verify complete current state, while preserving evidence of a historical event the snapshot
cannot reconstruct. The variation first tries publication refresh on the existing subscription.`,
  reading:
    'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".',
  caution: code`
Run the complete shell script with Python3, PostgreSQL16 server binaries and pg_walinspect available;
PGBIN can select the binary folder. It initializes private source/subscriber directories and sockets,
ignores inherited PG/PGLAB settings and disables TCP. Root uses runuser as the postgres OS owner.
Allow a few hundred MB per retained run. Cleanup removes only owned replication objects and stops
both servers, retaining logs and evidence.

The experiment deliberately drops a slot with unconsumed work, then replaces the target table's
contents after preserving its stale rows. The driver owns all source writes and pauses them during
resnapshot; the source is the declared authority for current table state. This is a state-replica
rebuild, not restoration of an audit log or replay of every historical business effect. The local
replica trigger measures received changes and copied rows; it is not an external delivery protocol.`,
  syntaxBreakdown: code`
### In plain terms

A replication slot retains the source history and decoding position a consumer still needs. Stopping
the consumer leaves that slot intact; deleting it removes those responsibilities and its state.
Reusing the name creates a new starting point. A fresh snapshot can rebuild today's table, including
updates and deletions the consumer missed, but it cannot reveal every event that happened and then
disappeared before that snapshot. This experiment measures each boundary independently.

### What you are learning

- **Retention and acknowledgement:** a disconnected consumer can pin source WAL; applying and acknowledging its backlog lets the position advance.
- **Slot identity and state:** a remembered name or subscriber origin does not recreate a deleted source slot's old decoding position.
- **Progress versus agreement:** new receipts and an advancing origin can coexist with missing, extra and stale rows.
- **Resnapshot scope:** rebuilding a table reconciles current state; recovering historical events requires additional retained evidence or a separate event history.

### Piece by piece

- **python3** embeds the owned-cluster helper. **PGBIN / pg_config --bindir** selects binaries;
  **tempfile.mkdtemp** creates fresh paths. Root-only **runuser/os.chown** assigns server ownership.
  Cleared PG variables and separate **PGHOST** sockets isolate the endpoints; both use local
  **PGPORT=6543**, with **listen_addresses=''** disabling TCP. Connect, statement/lock and subprocess
  timeouts bound calls. No learner cluster or progress database is targeted.
- **initdb -D -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** selects each directory/administrator, permits local access within protected
  paths, rejects host authentication, fixes locale and enables checksums with 1MB WAL segments.
  Source/subscriber **pg_control_system.system_identifier** must differ, and the writable logical
  subscriber reports **pg_is_in_recovery=false**.
- **pg_ctl -D -l -w -t20 start** starts each owned directory with a log and readiness deadline.
  Both fixtures use 16MB buffers, 10 connections, fsync/synchronous_commit/full_page_writes on,
  1h checkpoints, autovacuum off and an 8MB WAL target. The source enables **wal_level=logical**,
  four senders/slots, **wal_keep_size=0** and **max_slot_wal_keep_size=-1**. Only that last explicit
  setting makes slot WAL retention uncapped here; an 8MB max_wal_size is not a hard disk limit.
  Subscriber capacity is eight workers, four logical workers and one table-sync worker.
- Subscriber **log_error_verbosity=verbose** and **log_line_prefix='%m [%p] %e '** retain timestamp,
  PID and SQLSTATE. A saved file offset isolates the missing-slot attempt's new log region.
  **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, prints unaligned tuples only,
  fails on SQL errors and runs a command string. **quote** escapes controlled SQL literals.
- Both sides create matching **retention_items(id PRIMARY KEY,value,note)** schemas. Source
  **generate_series(1,10)** seeds ten rows. **CREATE ROLE ... LOGIN REPLICATION** and **GRANT SELECT**
  supply the replication connection and initial-copy access. **CREATE PUBLICATION ... FOR TABLE**
  selects retention_items alone. **unrelated_churn** generates bounded WAL outside that publication.
- The subscriber's **consumer_generation** starts at 1. An **AFTER INSERT OR UPDATE OR DELETE
  FOR EACH ROW** trigger, explicitly **ENABLE REPLICA**, records generation, operation and row
  values in **public.consumer_audit**. **TG_OP**, **OLD/NEW** and a **bigserial** sequence identify
  received row effects. The function schema-qualifies both local tables because logical workers
  have a different search_path from interactive sessions. Generation 2 later labels the new copy.
- **create_subscription** uses **CREATE SUBSCRIPTION ... CONNECTION ... WITH (slot_name=...,
  copy_data=true,disable_on_error=true,streaming=off,synchronous_commit=on)**. These independent
  clusters allow automatic slot creation. COPY initializes the target; complete committed
  transactions then stream with locally synchronous apply commits. Source commits remain
  asynchronous with respect to this subscriber.
- **pg_subscription.oid** identifies its workers, relation states, statistics and origin
  **pg_<oid>**. Require **pg_subscription_rel.srsubstate='r'**, exact source/subscriber rows and
  removal of generated table-sync slots before proceeding. A new receipt90 verifies normal apply.
  Relation **srsublsn** is retained as state coordination, not a snapshot identity.
- **commit** brackets one source BEGIN/txid_current/writes/COMMIT with **pg_current_wal_insert_lsn**
  and the flushed position after successful COMMIT. **pg_get_wal_records_info** filtered by that
  XID and **Transaction/COMMIT** returns one physical start/end pair. **applied** requires the
  matching **pg_replication_origin_status.remote_lsn** to reach that COMMIT end. **converged** also
  compares fresh complete row inventories; origin alone never proves correctness.
- **ALTER SUBSCRIPTION DISABLE** stops apply while preserving the slot. **stopped** requires
  subenabled=false and no live subscription PID in **pg_stat_subscription**; **disable** also waits
  for its source slot to be inactive or absent. This uses live state rather than a fixed sleep.
- Save **pg_replication_slots.restart_lsn**, **confirmed_flush_lsn**, **catalog_xmin**, plugin,
  active, wal_status and safe_wal_size. Restart names the oldest retained WAL requirement;
  confirmation tracks acknowledged progress, while catalog_xmin protects decoding's catalog view.
  **pg_wal_lsn_diff(current insertion,confirmation)** is a WAL byte interval, not pending row count
  or exact retained file size. safe_wal_size is NULL under this fixture's uncapped slot setting.
- With the consumer stopped, source updates IDs1–3, deletes4 and inserts20. Four batches each
  insert 256 rows with **repeat(md5(g::text),16)** into the unpublished churn table, then
  **pg_switch_wal** finishes the current 1MB segment. This bounds the work while showing that a slot
  retains the physical WAL sequence, including activity outside its publication.
- **CHECKPOINT** provides a cleanup opportunity, yet restart and confirmation remain fixed and
  the unconfirmed interval exceeds 3MB. **pg_ls_waldir** with a 24-hex-character filename filter
  records actual segment names/sizes; **pg_walfile_name(restart_lsn)** identifies the required
  segment in this sampled interval, which must still exist. The target remains exactly its old
  image. Existing preallocated/recycled files mean the total file count need not increase.
- **ENABLE** resumes with the original slot. The pending changes and a new91 receipt must apply
  completely, and source confirmation must reach91's COMMIT end. Save restart/confirmation and
  origin separately; their positions need not be identical, and file removal need not be immediate.
- Disable again. Commit an update of1 to value50, deletion of2 and new600, then commit insertion
  and deletion of transient1000 in two separate source transactions. A fresh source read between
  those commits preserves1000's actual image. The stopped consumer has no audit event for1000.
  Save all COMMIT boundaries, source/target inventories and the slot/origin before discarding it.
- **pg_drop_replication_slot('owned_retention')** removes the inactive source slot. A missing
  catalog row proves it is gone; the subscriber still remembers the same subslotname and origin.
  ENABLE actually fails to start streaming because that slot does not exist. Read the new error
  context and wait for the failed worker to exit before explicitly disabling the subscription.
- The observed missing-slot startup error is **08P01** on the subscriber. Despite
  disable_on_error=true, the subscription remains enabled and apply_error_count/sync_error_count
  are both 0 at this boundary. These counters and that policy do not cover every connection/startup
  failure. Log and worker evidence explain the stall; an explicit DISABLE bounds retry behavior.
- **pg_create_logical_replication_slot('owned_retention','pgoutput')** reuses the name but returns
  a new consistent starting LSN beyond all gap commits. The old subscriber origin is unchanged.
  The experiment re-inspects each old physical COMMIT successfully: merely having those WAL bytes
  on disk does not make this newly created logical slot resume its predecessor's decoding history.
- Enable and commit900. It arrives and origin advances, while complete comparison still finds
  exactly ID1 stale, ID2 extra and ID600 missing. No later write overwrites these discrepancies.
  A new cursor and a working stream therefore do not constitute gap recovery.
- Hint2 adds **ALTER SUBSCRIPTION REFRESH PUBLICATION WITH (copy_data=true)** at this point; core
  omits that one action. Both then commit the same901 receipt. The existing table's relation state
  is unchanged and the same three discrepancies remain. Refresh registers newly published tables;
  its copy_data option does not recopy a table already registered with this subscription.
- For actual resnapshot, declare the source authoritative and pause all driver-owned source writes.
  Disable apply and preserve the full stale target using **CREATE TABLE stale_consumer_evidence
  AS SELECT**. **SET (slot_name=none)** detaches the old slot before **DROP SUBSCRIPTION**; verify
  its old origin disappears, then drop that inactive recreated source slot explicitly.
- In one target transaction, **TRUNCATE retention_items** and advance consumer_generation to 2.
  This removes stale rows and missed deletions instead of appending another copy onto old data.
  The separate stale evidence and audit remain. **create_subscription** now uses the new
  owned_resnapshot slot; its new subscription OID/origin and COPY establish a new stream boundary.
- With source writes still paused, the new generation's audited INSERT images must equal the
  saved authoritative snapshot and both table inventories. Only then commit receipt902; its
  COMMIT-end/origin gate and full equality prove continued streaming. Final 15 rows include correct
  value50 on1 and the source row600, exclude2/4, and retain all post-recovery receipts.
- The source and subscriber no longer contain1000, and neither consumer generation has an audit
  event for it. Its previously committed insert/delete and intermediate source image remain in
  the driver's historical evidence. The snapshot repairs current state without reconstructing this
  missing event; a historical consumer needs additional retained history or explicit reconciliation.
- **emit/json.dumps** records exact row differences, physical COMMITs, slot generations, errors,
  WAL files and snapshot images. **finally** disables and drops the owned subscription, drops only
  named main slots/generated sync slots for its recorded OIDs after inactivity, requires zero
  remaining source slots, removes the publication and stops both servers with
  **pg_ctl -m fast -w -t20 stop**. Logs and evidence remain.`,
  code: LOGICAL_RESNAPSHOT_CORE,
  expectedResult: code`
The initial subscriber and receipt90 agree. While disabled, source UPDATE/DELETE/INSERT and bounded
unpublished churn commit; slot restart/confirmation stay fixed, the unconfirmed WAL interval exceeds
3MB and its required segment survives CHECKPOINT. The target remains stale. Total WAL file count
may stay unchanged because files are reused. Re-enabling the retained slot applies all pending
changes and receipt91; its confirmation advances through that committed work.

The next backlog changes1, deletes2 and inserts600; source1000 also commits and is later deleted,
with its intermediate image saved. Dropping the slot leaves the subscriber definition/origin intact.
An actual missing-slot streaming startup error follows ENABLE; the observed subscription stays
enabled with apply/sync counters0 until the driver explicitly disables it.

The same-name replacement slot starts beyond the gap. Old COMMIT records remain physically
inspectable, but receipt900 and an advancing origin coexist with discrepancies1,2,600. Hint2's
REFRESH(copy_data=true), followed by the same901 control receipt, leaves those discrepancies and the
existing table relation state unchanged.

A new subscription into an emptied target actually recopies the authoritative snapshot. Its audited
copy images match that snapshot, and receipt902 then applies. Both servers finish with exactly
IDs1,3,5,6,7,8,9,10,20,90,91,600,900,901,902 and identical values/notes. The stale snapshot preserves
old1, extra2 and missing600 separately. Neither consumer generation received1000's historical event;
resnapshot does not manufacture it. The new subscription has zero apply/sync errors, all owned
replication objects are removed and both servers stop. LSNs, XIDs, OIDs, file counts and timing vary;
slot-generation and full-data relationships are the assertions.`,
  systemsLens: code`
A consumer checkpoint depends on retained history and the state that interprets it. Replacing its
name does not restore that relationship. Recovery must choose whether it needs a current projection,
every historical transition or an independently committed business effect. A snapshot can rebuild
the first while leaving the others unresolved; progress metrics cannot choose that policy or prove
its data requirements.`,
  challenge: code`
Run hint2 and predict whether REFRESH with copy_data=true will change the three discrepancies on an
already-ready table. Explain why a successful new901 receipt is insufficient evidence. For a search
index and a billing/audit consumer, separately decide whether this resnapshot is enough, what
additional history or reconciliation is needed, and which gates must hold before each resumes work.`,
};
