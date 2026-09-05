import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function conflictExperiment(skip: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\nskip_then_reconcile = ${skip ? "True" : "False"}\n` + code`
subdata,subsock,sublog=root/'subscriber',root/'subscriber-socket',root/'subscriber.log'
subsock.mkdir()
if os.geteuid()==0:
    os.chown(subsock,owner.pw_uid,owner.pw_gid)
subenv=dict(env,PGHOST=str(subsock))
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

def rows(query):
    return json.loads(query("select coalesce(json_agg(r order by id),'[]') from conflict_items r"))

def errors():
    return json.loads(sub_sql("select row_to_json(r) from (select apply_error_count,sync_error_count "
        "from pg_stat_subscription_stats where subid="+str(subid)+") r"))

def origin():
    return sub_sql("select remote_lsn from pg_replication_origin_status where external_id="+quote('pg_'+str(subid)))

def applied(bound):
    return sub_sql("select coalesce((select remote_lsn>="+quote(bound)+"::pg_lsn from "
        "pg_replication_origin_status where external_id="+quote('pg_'+str(subid))+"),false)")=='t'

def slot():
    return json.loads(sql("select row_to_json(s) from (select slot_name,active,restart_lsn,confirmed_flush_lsn,"
        "pg_wal_lsn_diff(pg_current_wal_insert_lsn(),confirmed_flush_lsn) as unconfirmed_bytes "
        "from pg_replication_slots where slot_name='owned_conflicts') s"))

def stopped():
    return sub_sql("select not subenabled and not exists(select 1 from pg_stat_subscription s "
        "where s.subid=p.oid and s.pid is not null) from pg_subscription p where oid="+str(subid))=='t'

def disable():
    sub_sql('alter subscription owned_subscription disable')
    wait_for('subscription disabled and workers gone',stopped)
    wait_for('source slot inactive',lambda: not slot()['active'])

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
    assert sub_sql("select count(*) from pg_subscription_rel where srsubid="+str(subid)+" and srsubstate='r'")=='1'
    return expected

def failure(label,record,offset,needle,previous):
    wait_for(label+' disables actual subscription',lambda: stopped() and errors()['apply_error_count']>previous)
    wait_for(label+' disconnects source slot',lambda: not slot()['active'])
    text=sublog.read_text()[offset:]
    assert needle in text,text
    import re
    finishes=re.findall(r'finished at ([0-9A-F]+/[0-9A-F]+)',text)
    assert finishes and finishes[-1]==record['start_lsn'],dict(finishes=finishes,record=record,log=text)
    assert not applied(record['end_lsn'])
    assert errors()['sync_error_count']==0
    emit(label+'_failure',dict(commit=record,finish_lsn=finishes[-1],log=text,errors=errors(),
        origin=origin(),slot=slot(),source_rows=rows(sql),subscriber_rows=rows(sub_sql)))
    return finishes[-1]

def differences():
    source={r['id']:r for r in rows(sql)}
    subscriber={r['id']:r for r in rows(sub_sql)}
    return [dict(id=i,source=source.get(i),subscriber=subscriber.get(i))
        for i in sorted(source.keys()|subscriber.keys()) if source.get(i)!=subscriber.get(i)]

try:
    with (data/'postgresql.conf').open('a') as config:
        config.write("\nwal_level=logical\nmax_wal_senders=4\nmax_replication_slots=4\nmax_wal_size='32MB'\nautovacuum=off\n")
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
    schema='create table conflict_items(id int primary key,value int not null,note text not null)'
    sql(schema)
    sub_sql(schema)
    sql("insert into conflict_items values(1,0,'seed'),(2,0,'delete in failed transaction')")
    sql('grant select on conflict_items to owned_publisher')
    sql('create publication owned_publication for table conflict_items')
    connection='host='+str(sock)+' port=6543 user=owned_publisher dbname=postgres'
    sub_sql('create subscription owned_subscription connection '+quote(connection)+
        " publication owned_publication with (slot_name='owned_conflicts',copy_data=true,"
        "disable_on_error=true,streaming=off,synchronous_commit=on)")
    subid=int(sub_sql("select oid from pg_subscription where subname='owned_subscription'"))
    wait_for('initial copy ready',lambda: sub_sql("select count(*) from pg_subscription_rel where srsubid="+
        str(subid)+" and srsubstate='r'")=='1' and rows(sub_sql)==rows(sql))
    wait_for('initial sync slots removed',lambda: sql('select count(*) from pg_replication_slots')=='1')
    baseline=commit("insert into conflict_items values(10,1,'baseline receipt')")
    converged(baseline['end_lsn'])
    assert errors()==dict(apply_error_count=0,sync_error_count=0)
    emit('owned_conflict_endpoints',dict(identities=identities,source=str(data),subscriber=str(subdata),
        skip_then_reconcile=skip_then_reconcile,baseline=rows(sql),origin=origin()))

    sub_sql("insert into conflict_items values(600,999,'local collision')")
    offset=len(sublog.read_text());previous=errors()['apply_error_count']
    failed=commit("update conflict_items set value=7,note='same failed transaction' where id=1; "
        "delete from conflict_items where id=2; "
        "insert into conflict_items values(610,10,'also in failed transaction'); "
        "insert into conflict_items values(600,77,'source authority')")
    finish=failure('uniqueness',failed,offset,'duplicate key value violates unique constraint',previous)
    assert sub_sql("select value from conflict_items where id=1")=='0'
    assert sub_sql('select count(*) from conflict_items where id=2')=='1'
    assert sub_sql('select count(*) from conflict_items where id=610')=='0'
    stuck=origin();confirmation=slot()['confirmed_flush_lsn']
    queued=[]
    for i in [601,602]:
        queued.append(commit('insert into conflict_items values('+str(i)+",1,'queued behind failure')"))
    assert stopped() and origin()==stuck and slot()['confirmed_flush_lsn']==confirmation
    assert slot()['unconfirmed_bytes']>0 and sub_sql('select count(*) from conflict_items where id in (601,602)')=='0'
    emit('uniqueness_backlog',dict(commits=queued,origin=origin(),slot=slot(),differences=differences(),
        source_rows=rows(sql),subscriber_rows=rows(sub_sql)))
    # Preserve the local collision before the declared source-authoritative repair discards it.
    sub_sql('create table local_conflict_evidence as select * from conflict_items where id=600')
    assert sub_sql('select value from local_conflict_evidence')=='999'
    if skip_then_reconcile:
        sub_sql('alter subscription owned_subscription skip (lsn='+quote(finish)+')')
        enable()
        wait_for('later backlog applied after whole-transaction skip',lambda: applied(queued[-1]['end_lsn'])
            and sub_sql('select count(*) from conflict_items where id in (601,602)')=='2')
        diff=differences()
        assert [d['id'] for d in diff]==[1,2,600,610],diff
        assert errors()['apply_error_count']==previous+1
        emit('skip_advanced_but_diverged',dict(origin=origin(),slot=slot(),differences=diff,
            source_rows=rows(sql),subscriber_rows=rows(sub_sql)))
        disable()
        # The driver owns and pauses all source writes; reconcile precisely this inventoried transaction.
        values=rows(sql)
        repair=[r for r in values if r['id'] in [1,600,610]]
        assert len(repair)==3
        changes='delete from conflict_items where id=2; '
        for row in repair:
            changes+=('insert into conflict_items values('+str(row['id'])+','+str(row['value'])+','+quote(row['note'])+
                ') on conflict(id) do update set value=excluded.value,note=excluded.note; ')
        sub_sql('begin; '+changes+' commit')
        assert differences()==[]
        emit('skipped_transaction_reconciled',dict(repaired_rows=repair,removed_id=2,
            source_rows=rows(sql),subscriber_rows=rows(sub_sql)))
    else:
        sub_sql('delete from conflict_items where id=600')
    enable()
    converged(queued[-1]['end_lsn'])
    after_unique=commit("insert into conflict_items values(700,1,'after uniqueness recovery')")
    converged(after_unique['end_lsn'])
    emit('uniqueness_recovered',dict(source_rows=rows(sql),subscriber_rows=rows(sub_sql),
        origin=origin(),errors=errors(),post_recovery_commit=after_unique))

    # DDL is applied only at the source; the following row shape must actually fail on the target.
    sql('alter table conflict_items add column priority int not null default 0')
    assert sub_sql("select count(*) from information_schema.columns where table_name='conflict_items' and column_name='priority'")=='0'
    offset=len(sublog.read_text());previous=errors()['apply_error_count']
    incompatible=commit("update conflict_items set priority=7,note='schema transaction' where id=1; "
        "insert into conflict_items values(800,8,'new schema row',8)")
    failure('schema',incompatible,offset,'missing replicated column',previous)
    stuck=origin();confirmation=slot()['confirmed_flush_lsn']
    later=commit("insert into conflict_items values(801,9,'queued after schema failure',9)")
    assert stopped() and origin()==stuck and slot()['confirmed_flush_lsn']==confirmation
    assert sub_sql('select count(*) from conflict_items where id in (800,801)')=='0'
    assert sub_sql("select note from conflict_items where id=1")=='same failed transaction'
    emit('schema_backlog',dict(commit=later,origin=origin(),slot=slot(),source_rows=rows(sql),subscriber_rows=rows(sub_sql)))
    sub_sql('alter table conflict_items add column priority int not null default 0')
    enable()
    converged(later['end_lsn'])
    final_receipt=commit("insert into conflict_items values(900,1,'after schema recovery',1)")
    final=converged(final_receipt['end_lsn'])
    assert [r['id'] for r in final]==[1,10,600,601,602,610,700,800,801,900]
    assert errors()==dict(apply_error_count=2,sync_error_count=0),errors()
    assert sub_sql('select count(*) from local_conflict_evidence where id=600 and value=999')=='1'
    assert slot()['active']
    emit('conflict_recovery_complete',dict(source_rows=final,subscriber_rows=rows(sub_sql),origin=origin(),
        errors=errors(),slot=slot(),post_recovery_commit=final_receipt))
    print('PASS: actual uniqueness/schema errors stop apply; queued source commits survive; repair/reconciliation restores every source row and later receipts.',flush=True)
finally:
    try:
        if (subdata/'postmaster.pid').exists():
            existing=sub_sql("select oid from pg_subscription where subname='owned_subscription'")
            if existing:
                subid=int(existing)
                disable()
                sub_sql('alter subscription owned_subscription set (slot_name=none)')
                sub_sql('drop subscription owned_subscription')
                assert sub_sql("select count(*) from pg_subscription where subname='owned_subscription'")=='0'
        if (data/'postmaster.pid').exists():
            owned="slot_name='owned_conflicts'"
            if subid is not None:
                owned+=' or slot_name like '+quote('pg_'+str(subid)+'_sync_%')
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
    print('Owned conflict source/subscriber stopped and subscription/publication/slots removed; evidence retained at',root,flush=True)

PY`;
}
export const LOGICAL_CONFLICTS_CORE = conflictExperiment(false);
export const LOGICAL_CONFLICTS_VARIATION = conflictExperiment(true);

export const LOGICAL_CONFLICTS: Draft = {
  slug: "conflicts-stop-the-apply-worker",
  revision: 4,
  tags: ["logical-replication", "consistency", "retries", "observability"],
  title: "Repair logical apply failures and reconcile a skipped transaction",
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 45,
  prerequisites: ["publication-and-subscription"],
  overview: code`
Cause a uniqueness violation and a missing-column error on a real independent logical subscriber.
Each error disables apply while the source continues committing; inspect the failed transaction,
queued work and independent data before repairing the cause and checking complete agreement.
The variation skips the uniqueness transaction, measures every resulting discrepancy, then reconciles
those rows explicitly before repeating schema recovery.`,
  reading:
    'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".',
  caution: code`
Run the complete shell script with Python3 and PostgreSQL16 server binaries plus pg_walinspect;
PGBIN can select the binary folder. It owns fresh source/subscriber directories, processes and
private sockets, ignores inherited PG/PGLAB settings and disables TCP. Root uses runuser for the
postgres OS owner. Allow a few hundred MB per retained run; all owned servers and replication
objects are cleaned up in finally.

The publisher is the declared authority for this fixture. The local collision is preserved in a
subscriber evidence table before repair discards it from the replicated table. The skip variation
intentionally creates and measures divergence, then pauses apply and all driver-owned source writes
for a narrowly inventoried repair. This policy requires an authority decision and a stable comparison
boundary; a live multi-writer service cannot copy these assumptions without enforcing them.`,
  syntaxBreakdown: code`
### In plain terms

An asynchronous source COMMIT can succeed while the subscriber rejects its transaction. Restarting
apply or advancing its position does not prove the data is correct. Here a uniqueness error rolls
back an entire local apply transaction, including changes made before the collision. Repair allows
the original transaction to replay; skipping it allows later work through but also omits its valid
changes. A separate schema error shows why source DDL and subscriber compatibility need coordination.

### What you are learning

- **Transaction failure:** an incoming constraint error rolls back the local transaction and stops later ordered apply in this chosen mode.
- **Failure versus backlog:** a source acknowledgement, subscription state, error counter, origin and full row inventory give different evidence.
- **Repair versus skip:** removing an obstruction replays the transaction; skipping requires an explicit data reconciliation decision.
- **Schema compatibility:** a source column addition is not a subscriber migration, and later rows can fail until the target is compatible.

### Piece by piece

- **python3** embeds the owned-cluster helper. **PGBIN / pg_config --bindir** selects server tools;
  **tempfile.mkdtemp** creates fresh paths. Root-only **runuser/os.chown** assigns server ownership.
  Cleared PG variables, independent **PGHOST** sockets and **listen_addresses=''** isolate the pair
  even though both use **PGPORT=6543**. Connect/statement/lock and subprocess timeouts bound calls.
- **initdb -D -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** selects each data directory/administrator, permits local access within protected
  paths, rejects host authentication, fixes locale and creates checksummed storage with1MB WAL.
  **pg_control_system.system_identifier** must differ; the writable logical subscriber reports
  **pg_is_in_recovery=false**, unlike a physical standby.
- **pg_ctl -D -l -w -t20 start** starts only those owned directories with file-backed logs and a
  readiness deadline. Both use16MB buffers,10 connections, fsync/synchronous_commit/full_page_writes
  on,1h checkpoints and autovacuum off. Source **wal_level=logical**, four senders/slots and32MB WAL
  target support this bounded stream. The subscriber allows eight workers, four logical workers and
  one sync worker; its WAL target is8MB. These are fixture limits, not production sizing advice.
- Subscriber **log_error_verbosity=verbose** and **log_line_prefix='%m [%p] %e '** retain timestamp,
  PID and SQLSTATE along with detailed error context. The driver saves a file offset before each
  induced error and reads only the later log region, avoiding stale failure matches.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, emits unaligned tuples only, fails
  on errors and executes one command string. The SQL quote helper escapes controlled literal values;
  no user-supplied query or identifier is interpolated.
- Both sides explicitly create **conflict_items(id PRIMARY KEY,value,note)**. Source seeds IDs1,2;
  **CREATE ROLE ... LOGIN REPLICATION** and **GRANT SELECT** enable its connection and initial copy.
  **CREATE PUBLICATION ... FOR TABLE** selects this table. Target DDL remains independently owned.
- **CREATE SUBSCRIPTION ... WITH (copy_data=true,disable_on_error=true,streaming=off,
  synchronous_commit=on)** copies the seed image and consumes complete committed transactions.
  The chosen disable_on_error policy automatically disables the subscription after each failure;
  this experiment does not depend on observing a retry loop. Explicit synchronous_commit controls
  the apply worker's own local commit durability; it does not make source commits wait for apply.
- **pg_subscription.oid** identifies the subscription's relation states, workers and replication
  origin **pg_<oid>**. **pg_subscription_rel.srsubstate='r'**, full copied contents and removal of
  generated sync slots establish the initial handoff. A new ID10 receipt verifies normal apply.
- **commit** runs BEGIN, **txid_current**, supplied changes and COMMIT on one source connection.
  **pg_current_wal_insert_lsn** before it and **pg_current_wal_flush_lsn** after successful COMMIT
  bound **pg_get_wal_records_info**. Filtering **Transaction/COMMIT** by the captured XID yields its
  start_lsn and end_lsn. The helper requires exactly one record, not a guessed idle WAL boundary.
- **pg_replication_origin_status.remote_lsn** must reach the captured COMMIT **end_lsn** before
  fresh source/subscriber contents are compared. **pg_stat_subscription_stats** supplies cumulative
  apply_error_count and sync_error_count. They start at0; successful repair does not reset them.
- A local subscriber ID600/value999 intentionally collides with source ID600/value77. The source
  transaction first updates ID1 to value7, deletes ID2 and inserts610, then inserts600. The worker
  reports **23505/duplicate key**, disables the subscription and rolls back all four changes. Target
  ID1 stays0, ID2 remains,610 is absent and600 retains its local value.
- **stopped** requires **pg_subscription.subenabled=false** and no live PID for that subscription
  in **pg_stat_subscription**. **pg_replication_slots.active=false** confirms source disconnection.
  **failure** also requires an increased apply error count and the matching new log text; a null
  PID alone is not diagnosis. No initial-copy error is permitted.
- The log's **finished at** LSN must equal the captured physical COMMIT **start_lsn** in this
  PostgreSQL16 streaming=off fixture. This is the exact value supplied to **ALTER SUBSCRIPTION
  SKIP**. It differs from the COMMIT end used by the apply gate; do not substitute one for the other.
  Log XIDs, LSNs and PIDs vary per run; the fixture checks their relationships.
- Source commits later IDs601,602 while the subscription is stopped. Origin and slot confirmation
  remain fixed, the target lacks both receipts, and **pg_wal_lsn_diff(current insertion,
  confirmed_flush_lsn)** is positive. This unconfirmed byte distance is a WAL interval, not a row
  count or exact disk usage. Save **restart_lsn** separately as the retention requirement.
- **CREATE TABLE local_conflict_evidence AS SELECT ... WHERE id=600** preserves the local version
  before the source-authoritative decision removes it. Core **DELETE WHERE id=600**, followed by
  **ALTER SUBSCRIPTION ENABLE**, lets the original transaction replay. Full contents and origin
  must catch up through602, then a newly committed ID700 proves later work still applies.
- Hint2 changes only the uniqueness recovery policy. **ALTER SUBSCRIPTION SKIP (lsn='...')** uses
  the validated logged finish LSN, then ENABLE resumes apply. Even when origin reaches602 and
  both later receipts exist, full comparison must find exactly four discrepancies: old ID1, extra
  ID2, wrong local ID600 and missing610. Skipping affects the whole transaction, including its
  non-conflicting changes; absence of a new error does not mean consistency.
- **disable** waits for disabled state, no workers and an inactive slot before reconciliation.
  The driver also issues no source writes during the comparison/repair. It deletes extra ID2 and
  applies the inventoried authoritative IDs1,600,610 using **INSERT ... ON CONFLICT(id) DO UPDATE**
  in one local transaction. **excluded.value/note** refer to the proposed source values. Require
  zero differences, then ENABLE and verify the same fresh ID700 receipt as the core.
- The next phase executes source-only **ALTER TABLE ADD COLUMN priority int NOT NULL DEFAULT 0**.
  **information_schema.columns** proves the subscriber lacks priority. A source transaction updates
  ID1's priority/note and inserts800 using the new shape; actual apply fails **55000/missing
  replicated column** and disables the subscription. ID801 commits behind it while origin and
  confirmation remain fixed;800/801 are absent and ID1 retains its pre-failure note locally.
- Execute matching subscriber **ADD COLUMN** while stopped, then ENABLE. The retained failed
  transaction and later801 replay. A fresh900 receipt must pass its COMMIT-end gate. Final contents
  match all ten rows and their values/notes/priorities; ID2 is absent and local600/value999 remains
  only in the separate evidence table. Cumulative apply errors are2 and sync errors0.
- **differences** joins complete row inventories by ID, retaining missing, extra and mismatched
  payloads. **emit/json.dumps** saves each failure, transaction boundary, queued workload and
  before/after comparison to the owned root. These records support a recovery decision beyond
  worker counters. The final active slot and readiness accompany, rather than replace, data checks.
- **finally** disables the owned subscription and waits for workers to leave, detaches its slot
  with **SET (slot_name=none)** and drops the local subscription. Drop only its inactive named main
  slot/generated sync slots, require zero remaining source slots, remove its publication and stop
  both servers with **pg_ctl -m fast -w -t20 stop**. Logs and row evidence remain for inspection.`,
  code: LOGICAL_CONFLICTS_CORE,
  expectedResult: code`
After initial copy and receipt10, both servers agree and error counters are0. The local600 collision
causes23505 and one apply error, disables the subscription and disconnects its source slot. The
entire incoming transaction rolls back: ID1 remains0, ID2 remains present,610 is absent and600 is
still the local999 version. Source601/602 commit while origin/confirmation stay fixed and those
rows remain absent on the subscriber. The logged finish LSN matches the physical COMMIT start;
it is distinct from the end boundary used by the post-recovery apply gate.

Core removes the saved local collision from the replicated table, enables apply and recovers the
whole failed transaction plus queued work. Hint2 skips that transaction first: origin advances and
601/602 arrive, but exactly IDs1,2,600,610 disagree. Explicit stopped-apply/source-paused reconciliation
removes those differences. Both paths then verify a newly streamed700 receipt and complete equality.

Source-only priority DDL does not change the subscriber schema. The next transaction causes55000,
missing replicated column priority, and the second apply error. The subscription stops;800/801 stay
absent while source work is committed. Matching subscriber DDL and ENABLE recover both transactions.
A later900 receipt applies. Final IDs are1,10,600,601,602,610,700,800,801,900 on both sides with all
payloads equal; ID1 has value7/priority7,800 priority8,801 priority9, and the discarded600/value999
image is retained separately. Error counts remain2 apply/0 sync. All owned replication objects and
servers are cleaned up. LSNs, XIDs, PIDs and timings vary; fixed retry intervals are not asserted.`,
  systemsLens: code`
Progress and correctness are separate recovery conditions. A failed ordered transaction can block
later work, but bypassing it may restore progress while preserving hidden discrepancies. A recovery
policy needs an authority decision, a bounded inventory of lost effects, a stable repair boundary
and evidence that subsequent work succeeds. Schema compatibility is another part of that contract,
not a property supplied automatically by the replication connection.`,
  challenge: code`
Run hint2 and predict every discrepancy caused by skipping the four-operation transaction. Explain
why merely replacing the conflicting600 row is insufficient after skip, and why an advancing origin
and unchanged error count do not establish agreement. For a service with independent subscriber
writes, state how you would decide authority, pause or version the comparison, preserve disputed
values and reconcile before admitting reads again.`,
};
