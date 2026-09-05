import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function decodingExperiment(full: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\nfull_identity = ${full ? "True" : "False"}\n` + code`
slot_name='owned_decode'
slow=None
slow_output=None

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def slot():
    return json.loads(sql("select row_to_json(s) from (select slot_name,plugin,slot_type,database,active,"
        "restart_lsn,confirmed_flush_lsn,catalog_xmin::text from pg_replication_slots "
        "where slot_name='owned_decode') s"))

def decode(consume):
    function='pg_logical_slot_get_changes' if consume else 'pg_logical_slot_peek_changes'
    return json.loads(sql("select coalesce(json_agg(r),'[]') from (select lsn::text,xid::text,data from "+function+
        "('owned_decode',null,null,'include-xids','1','skip-empty-xacts','0','stream-changes','0')) r"))

def physical(begin,end,xid):
    return json.loads(sql("select coalesce(json_agg(r),'[]') from (select start_lsn,end_lsn,xid::text,"
        "resource_manager,record_type,description from pg_get_wal_records_info('"+begin+"','"+end+"') "
        "where xid::text='"+xid+"' order by start_lsn) r"))

def transaction(commands,outcome='commit'):
    output=sql('begin; select txid_current(); '+commands+'; '+outcome)
    ids=[line for line in output.splitlines() if line.isdigit()]
    assert len(ids)==1,output
    return ids[0]

def one_transaction(events,xid,row_count):
    assert len(events)==row_count+2,events
    assert all(event['xid']==xid for event in events),events
    assert events[0]['data']=='BEGIN '+xid and events[-1]['data']=='COMMIT '+xid,events
    assert all(event['data'].startswith('table public.decode_receipts: ') for event in events[1:-1]),events

def current_rows():
    return json.loads(sql("select coalesce(json_agg(r order by id),'[]') from decode_receipts r"))

try:
    with (data/'postgresql.conf').open('a') as config:
        config.write("\nwal_level=logical\nmax_replication_slots=4\nautovacuum=off\n")
    start()
    assert sql('show wal_level')=='logical'
    sql('create extension pg_walinspect')
    sql('create table decode_receipts(id int primary key,note text not null,value int not null)')
    if full_identity:
        sql('alter table decode_receipts replica identity full')
    assert sql("select relreplident from pg_class where oid='decode_receipts'::regclass")==('f' if full_identity else 'd')
    created=sql("select row_to_json(s) from pg_create_logical_replication_slot('owned_decode','test_decoding') s")
    initial=slot()
    assert initial['plugin']=='test_decoding' and initial['slot_type']=='logical'
    assert initial['database']=='postgres' and initial['active']==False
    assert decode(False)==[]
    emit('slot_created',dict(created=json.loads(created),state=initial,full_identity=full_identity))

    begin=sql('select pg_current_wal_insert_lsn()')
    committed=transaction("insert into decode_receipts values(1,'kept',10),(2,'deleted',20); "
        "update decode_receipts set value=11 where id=1; delete from decode_receipts where id=2")
    end=sql("select pg_create_restore_point('logical_committed')")
    sql('checkpoint')
    assert sql("select pg_current_wal_flush_lsn()>='"+end+"'::pg_lsn")=='t'
    records=physical(begin,end,committed)
    assert any(r['resource_manager']=='Heap' and 'INSERT' in r['record_type'] for r in records)
    assert any(r['resource_manager']=='Heap' and 'UPDATE' in r['record_type'] for r in records)
    assert any(r['resource_manager']=='Heap' and r['record_type']=='DELETE' for r in records)
    assert sum(r['resource_manager']=='Transaction' and r['record_type']=='COMMIT' for r in records)==1
    before_peek=slot()['confirmed_flush_lsn']
    peek=decode(False)
    assert decode(False)==peek and slot()['confirmed_flush_lsn']==before_peek
    one_transaction(peek,committed,4)
    changes=[row['data'] for row in peek[1:-1]]
    assert changes[0]=="table public.decode_receipts: INSERT: id[integer]:1 note[text]:'kept' value[integer]:10"
    assert changes[1]=="table public.decode_receipts: INSERT: id[integer]:2 note[text]:'deleted' value[integer]:20"
    if full_identity:
        assert changes[2]=="table public.decode_receipts: UPDATE: old-key: id[integer]:1 note[text]:'kept' value[integer]:10 new-tuple: id[integer]:1 note[text]:'kept' value[integer]:11",changes
        assert changes[3]=="table public.decode_receipts: DELETE: id[integer]:2 note[text]:'deleted' value[integer]:20",changes
    else:
        assert changes[2]=="table public.decode_receipts: UPDATE: id[integer]:1 note[text]:'kept' value[integer]:11",changes
        assert changes[3]=="table public.decode_receipts: DELETE: id[integer]:2",changes
    consumed=decode(True)
    assert consumed==peek and decode(True)==[]
    after_get=slot()['confirmed_flush_lsn']
    assert sql("select '"+after_get+"'::pg_lsn>'"+before_peek+"'::pg_lsn")=='t'
    emit('committed_physical_and_logical',dict(xid=committed,physical=records,logical=peek,
        confirmed_before_peek=before_peek,confirmed_after_get=after_get,full_identity=full_identity))

    begin=sql('select pg_current_wal_insert_lsn()')
    aborted=transaction("insert into decode_receipts values(700,'rolled back',70)",'rollback')
    end=sql("select pg_create_restore_point('logical_aborted')")
    sql('checkpoint')
    assert sql("select pg_current_wal_flush_lsn()>='"+end+"'::pg_lsn")=='t'
    records=physical(begin,end,aborted)
    assert any(r['resource_manager']=='Heap' and 'INSERT' in r['record_type'] for r in records)
    assert any(r['resource_manager']=='Transaction' and r['record_type']=='ABORT' for r in records)
    assert not any(r['resource_manager']=='Transaction' and r['record_type']=='COMMIT' for r in records)
    absent=decode(True)
    assert absent==[] and sql('select count(*) from decode_receipts where id=700')=='0'
    emit('aborted_physical_only',dict(xid=aborted,physical=records,logical=absent,visible_700=False))

    ddl=transaction('alter table decode_receipts add column extra text')
    ddl_events=decode(True)
    one_transaction(ddl_events,ddl,0)
    new_schema=transaction("insert into decode_receipts values(701,'after ddl',71,'v2')")
    schema_events=decode(True)
    one_transaction(schema_events,new_schema,1)
    assert schema_events[1]['data']=="table public.decode_receipts: INSERT: id[integer]:701 note[text]:'after ddl' value[integer]:71 extra[text]:'v2'",schema_events
    emit('schema_without_ddl_command',dict(ddl_xid=ddl,ddl_events=ddl_events,row_events=schema_events,
        actual_columns=json.loads(sql("select json_agg(column_name order by ordinal_position) from information_schema.columns "
            "where table_schema='public' and table_name='decode_receipts'"))))

    slow_path=root/'older-transaction.log'
    slow_output=slow_path.open('w')
    slow=subprocess.Popen([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1'],
        env=dict(env,PGAPPNAME='owned_decode_older'),stdin=subprocess.PIPE,stdout=slow_output,stderr=subprocess.STDOUT,text=True)
    slow.stdin.write("begin;\ninsert into decode_receipts(id,note,value) values(800,'started first',8);\n"
        "select 'older_xid='||txid_current();\n\\echo OLDER_READY\n")
    slow.stdin.flush()
    def older_ready():
        assert slow.poll() is None,slow_path.read_text()
        return 'OLDER_READY' in slow_path.read_text()
    wait_for('older transaction open',older_ready)
    older=next(line.split('=')[1] for line in slow_path.read_text().splitlines() if line.startswith('older_xid='))
    newer=transaction("insert into decode_receipts(id,note,value) values(801,'committed first',9)")
    assert int(older)<int(newer)
    state=json.loads(sql("select row_to_json(a) from (select state,backend_xid::text as xid from pg_stat_activity "
        "where application_name='owned_decode_older') a"))
    assert state==dict(state='idle in transaction',xid=older)
    early=decode(True)
    one_transaction(early,newer,1)
    assert 'id[integer]:801' in early[1]['data']
    assert sql('select count(*) from decode_receipts where id=800')=='0'
    assert sql('select count(*) from decode_receipts where id=801')=='1'
    assert slow.poll() is None
    emit('newer_commit_delivered_while_older_open',dict(older_xid=older,newer_xid=newer,
        older_backend=state,events=early,visible_ids=[r['id'] for r in current_rows()]))
    slow.stdin.write('commit;\n\\q\n')
    slow.stdin.flush()
    assert slow.wait(timeout=10)==0,slow_path.read_text()
    slow_output.close()
    late=decode(True)
    one_transaction(late,older,1)
    assert 'id[integer]:800' in late[1]['data']
    assert sql("select '"+late[1]['lsn']+"'::pg_lsn<'"+early[1]['lsn']+"'::pg_lsn and '"+late[-1]['lsn']+"'::pg_lsn>'"+early[-1]['lsn']+"'::pg_lsn")=="t"
    assert decode(True)==[]
    final=[dict(id=1,note='kept',value=11,extra=None),dict(id=701,note='after ddl',value=71,extra='v2'),
        dict(id=800,note='started first',value=8,extra=None),dict(id=801,note='committed first',value=9,extra=None)]
    assert current_rows()==final
    emit('commit_order_and_final_contents',dict(older_xid=older,newer_xid=newer,
        emitted_commit_order=[early[-1]['xid'],late[-1]['xid']],late_events=late,rows=final,slot=slot()))
    print('PASS: physical commit/abort evidence matches the selected logical mode, schema omission and replica identity are explicit, and a later commit is delivered while the older transaction stays open.',flush=True)
finally:
    if slow is not None and slow.poll() is None:
        try:
            slow.stdin.write('rollback;\n\\q\n')
            slow.stdin.flush()
            slow.wait(timeout=10)
        except (BrokenPipeError,subprocess.TimeoutExpired):
            slow.kill()
            slow.wait(timeout=5)
    if slow_output is not None and not slow_output.closed:
        slow_output.close()
    try:
        if (data/'postmaster.pid').exists():
            sql("select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name='owned_decode'")
            assert sql("select count(*) from pg_replication_slots where slot_name='owned_decode'")=='0'
    finally:
        stop()
    print('Owned logical slot removed, client/server stopped; evidence retained at',root,flush=True)
PY`;
}

export const LOGICAL_DECODING_VARIATION = decodingExperiment(true);
export const LOGICAL_DECODING: Draft = {
  slug: "decode-the-log",
  revision: 4,
  tags: ["logical-decoding", "cdc", "replication-slots", "wal", "replicated-log"],
  title: "Compare physical WAL with committed logical changes",
  difficulty: "intermediate",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 35,
  prerequisites: ["shell-and-psql-toolkit", "every-change-is-a-wal-record"],
  overview: code`
Read the same committed and aborted work as physical WAL records and as logical row events.
Inspect how a selected output plugin represents schema changes and old row values, then keep an
older transaction open while a newer one commits and is decoded. This separates physical log
order, commit order and application visibility. The optional variation changes replica identity
from DEFAULT to FULL while preserving the workload.`,
  reading:
    'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".',
  caution: code`
Run the complete shell script with Python3 and matching PostgreSQL16 binaries, pg_walinspect and
test_decoding installed. PGBIN may select the binary folder. The script creates one fresh private
cluster with wal_level=logical, private socket and no TCP listener; inherited PG/PGLAB settings are
ignored. Root uses runuser as the postgres OS owner. Allow about100MB per retained run. The named
logical slot and the concurrent client are cleaned up, and the owned server stops even on failure.
No pre-existing database, slot or learner progress is changed.

The example plugin runs with stream-changes=0 and skip-empty-xacts=0. Its committed-transaction text
output is the subject of the claims below; other plugins and streaming/two-phase modes have different
contracts. No receiver application or independent delivery acknowledgement is implemented here.`,
  syntaxBreakdown: code`
### In plain terms

Physical WAL includes changes that will later abort, plus storage work such as index updates.
Logical decoding interprets that history using database catalogs and an output plugin. In this
selected mode, it emits committed transactions with row changes, omits an aborted insert, and does
not reconstruct the ALTER TABLE statement. A transaction that commits sooner can be delivered
while an older transaction remains open; its lower transaction ID does not reserve delivery order.

### What you are learning

- **Two interpretations of WAL:** physical record/XID evidence and logical row events describe different aspects of the same work.
- **Transaction boundaries:** commit determines delivery in this mode; neither XID nor every row event's LSN is emission order.
- **Schema and row identity:** plugin output and replica identity determine which details are available to a consumer.
- **An independent consumer boundary:** peeking and consuming a slot do not establish an external application's successful effect.

### Piece by piece

- **python3** embeds the complete owned-cluster helper. **PGBIN / pg_config --bindir** selects
  binaries; **tempfile.mkdtemp** creates owned files and sockets. Root-only **runuser/os.chown**
  assigns ownership. Cleared PG variables, a private **PGHOST**, **PGPORT=6543** and
  **listen_addresses=''** isolate the server and disable TCP.
- **initdb -D -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** names the data directory and administrator, permits local access inside the
  protected private directory, rejects host authentication, fixes locale, enables checksums and
  selects1MB WAL segments. The helper uses16MB buffers,10 connections,1h checkpoint timeout and
  small WAL targets; **fsync/synchronous_commit/full_page_writes=on** retain normal durability.
- Append **wal_level=logical** before startup; **SHOW wal_level** verifies it. This level includes
  information logical decoding requires. **max_replication_slots=4** bounds fixture slot capacity;
  **autovacuum=off** reduces unrelated activity. **pg_ctl -D -l -w -t20 start** starts the owned
  data directory with its own log and bounded readiness wait.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, prints unaligned tuples only, stops
  on errors and runs a command. **PGCONNECT_TIMEOUT**, statement/lock timeouts and Python subprocess
  deadlines bound calls. **sql** returns captured output; any unexpected nonzero process exit fails.
- **CREATE EXTENSION pg_walinspect** enables SQL inspection of retained physical WAL.
  **decode_receipts(id PRIMARY KEY,note NOT NULL,value NOT NULL)** constrains the workload's identity
  and payload. In hint2, **ALTER TABLE ... REPLICA IDENTITY FULL** is set before slot creation;
  **pg_class.relreplident** verifies f rather than the core's d for DEFAULT.
- **pg_create_logical_replication_slot('owned_decode','test_decoding')** creates this database's
  named logical stream with the example text plugin. It does not install a publication or subscriber.
  The returned position and **pg_replication_slots** identify plugin, logical type, database postgres,
  inactive consumer, **restart_lsn**, **confirmed_flush_lsn** and **catalog_xmin**. Restart position
  retains needed WAL; the catalog horizon protects metadata needed for decoding. Inactivity alone
  does not release either obligation. Creating the fresh slot precedes all tested transactions.
- **transaction** submits BEGIN, **txid_current**, supplied commands and COMMIT or ROLLBACK on one
  connection. txid_current assigns/returns its XID; parsing that numeric result lets independent
  physical/logical observations be matched to the exact transaction.
- The first transaction inserts IDs1 and2, updates ID1 value10→11 and deletes ID2, then commits.
  **pg_current_wal_insert_lsn** brackets its start. **pg_create_restore_point** provides a real
  record-end boundary afterward. **CHECKPOINT** then forces the recorded interval to disk;
  **pg_current_wal_flush_lsn >= end** verifies this before inspection. The same procedure is used
  for rollback, which does not supply a successful synchronous-COMMIT flush boundary.
- **pg_get_wal_records_info(start,end)** decodes the physical interval. Filter **xid::text** to
  the captured transaction and order by **start_lsn**; retain **end_lsn**, **resource_manager**,
  **record_type** and **description**. Require heap insert/update/delete plus exactly one
  Transaction/COMMIT. Heap and Btree records express storage work; they are not one logical event
  per physical record. A HOT_UPDATE still becomes an ordinary logical UPDATE.
- **decode** calls either **pg_logical_slot_peek_changes** or **pg_logical_slot_get_changes**.
  Two NULL arguments impose no caller LSN or change-count limit on the currently available batch.
  **include-xids=1** prints transaction IDs, **skip-empty-xacts=0** preserves empty transaction
  envelopes, and **stream-changes=0** selects output after transaction completion rather than
  streamed in-progress chunks. These explicit plugin choices bound what this experiment proves.
- Each result contains **lsn**, **xid** and **data**. Python **json.loads** and SQL **row_to_json /
  json_agg** retain all rows for exact assertions. Two peeks return the same six events and leave
  confirmed_flush_lsn unchanged. A get returns those same events and advances confirmation; the
  next get is empty. The confirmation may move across non-row WAL too, so it need not equal the
  last printed row event's position. It records source consumption, not a receiver's business commit.
- **one_transaction** checks a single XID, BEGIN/COMMIT boundaries and the exact number of row
  events. Four row events sit inside the first six-line envelope: INSERT1, INSERT2, UPDATE1,
  DELETE2. DEFAULT with this primary key emits the update's new tuple and delete's ID2 only.
  FULL adds **old-key** with ID1/note/value10 before **new-tuple** value11, and the deleted row's
  note/value20. The text and final row results are asserted, not inferred from the setting alone.
- The rollback transaction inserts ID700 and then aborts. After the explicit flush gate, physical
  WAL must contain its Heap/INSERT and Transaction/ABORT with no COMMIT. The logical get returns no
  events and a fresh table query cannot see ID700. This establishes omission in the selected
  non-streaming mode; it does not claim aborted activity left no physical WAL or that every CDC
  protocol can never expose in-progress work.
- A committed **ALTER TABLE ADD COLUMN extra text** yields only BEGIN/COMMIT with this plugin's
  empty-envelope option. A later INSERT701 prints **extra[text]:'v2'**, and
  **information_schema.columns ORDER BY ordinal_position** confirms the actual schema. The decoder
  knows the new row shape but does not emit the migration command; schema compatibility still
  requires a consumer policy. No automatic downstream DDL application is demonstrated.
- **subprocess.Popen** keeps an older psql session alive with a stdin pipe and file-backed output.
  **PGAPPNAME=owned_decode_older** identifies it in **pg_stat_activity**. It begins and inserts800,
  then prints its XID and a **psql \echo OLDER_READY** marker. Poll that actual output and the
  process status before starting the second transaction; no sleep duration substitutes for readiness.
- The newer connection inserts801 and commits. Require its XID greater than the older assigned XID,
  then verify the older backend is **idle in transaction** with its matching **backend_xid**.
  While that backend remains open, consume exactly the newer transaction's three events. A fresh
  query sees801 but not800. Thus this older transaction does not block delivery of that later commit.
- Send COMMIT and **psql \q** to the older client and require successful process exit. Its three
  events arrive on the next get. Compare actual positions: the older row event has an earlier LSN
  than the already-delivered newer row event, while its COMMIT LSN is later. Reordering buffers group
  transaction changes; sorting all emitted row LSNs would destroy this observed commit grouping.
- **current_rows** compares the complete final table in ID order:1/value11,701/value71/extra v2,
 800/value8 and801/value9 with their exact notes; other extra values are NULL. IDs2 and700 are absent.
  Structured **emit** reports save physical records, logical envelopes, backend state and outcomes.
- **finally** rolls back/quits any still-open owned client, with bounded terminate fallback,
  closes its output file, drops only **owned_decode**, verifies its absence and stops the owned
  server with **pg_ctl -m fast -w -t20 stop**. A slot's source cursor can persist across connections;
  deliberate cleanup releases it here. Consumer deduplication and crash-time offset replay are
  separate delivery questions for the next lesson.`,
  code: decodingExperiment(false),
  expectedResult: code`
The first committed transaction has physical heap insert/update/delete records, index work and one
COMMIT. Its logical output is exactly six events: BEGIN, INSERT1, INSERT2, UPDATE1, DELETE2, COMMIT,
all with its XID. Two peeks repeat the same events without confirmation advancing; get returns them,
advances confirmation and leaves the next get empty. DEFAULT UPDATE has only the new tuple here;
DELETE identifies ID2. FULL variation includes old note/value10 on UPDATE and note/value20 on DELETE.

The aborted ID700 has physical INSERT and ABORT but no COMMIT, no logical events in this mode, and
no visible row. Committed ADD COLUMN yields an empty BEGIN/COMMIT envelope; subsequent INSERT701
contains the new extra[text]:'v2' field but no ALTER TABLE command.

The older session remains idle in transaction with its lower XID while the newer transaction's
three events are consumed. Fresh rows include801 but not800. Only after the older client commits do
its three events arrive. Emitted commit order is newer XID then older XID; the older row-event LSN
is earlier, but its COMMIT LSN is later. Exact final IDs1,701,800,801, notes, values and extra fields
match the expected table; IDs2/700 remain absent. The slot is removed and client/server stop.
Actual XIDs, LSNs, physical sizes and timings vary; the asserted row values, envelopes and ordering
relationships are invariant for this supplied workload and plugin mode.`,
  systemsLens: code`
A durability log and a change stream answer different questions. Physical WAL records work before
its final outcome; a decoder groups and interprets it according to transaction and plugin rules.
Commit order can differ from both XID order and the order of individual row records in WAL. A
consumer must use the promised transaction/schema/identity contract rather than infer one from a
raw position or assume decoding itself commits a downstream effect.`,
  challenge: code`
Run hint2 with only replica identity changed to FULL. Predict the extra old-row fields in UPDATE
and DELETE, then compare the exact events and unchanged final table. Explain why that additional
row identity does not provide the missing ALTER TABLE command. For an audit or search consumer,
choose the before-image and schema-change policy you need, and explain why the older open
transaction's XID must not be used to hold back the newer committed result in this experiment.`,
};
