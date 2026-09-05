import { code, type Draft } from "../../../src/types.ts";

export const FREEZE_PROGRAM = code`
import fcntl, hashlib, json, os, pathlib, pwd, shutil, sqlite3, subprocess, sys, tempfile, time

phase = sys.argv[1]
assert phase in ('prepare','inspect','recover','cleanup')
if phase == 'prepare':
    decision = sys.argv[2] if len(sys.argv)>2 else 'ABORT'
    assert decision in ('ABORT','COMMIT')
    assert shutil.disk_usage('/tmp').free > 2*1024**3, 'Keep at least 2GB free'
    root = pathlib.Path(tempfile.mkdtemp(prefix='pg-owned-',dir='/tmp'))
    owner = pwd.getpwnam('postgres') if os.geteuid()==0 else pwd.getpwuid(os.geteuid())
    if os.geteuid()==0:os.chown(root,owner.pw_uid,owner.pw_gid)
    program = root/'freeze.py'
    program.write_text(pathlib.Path(__file__).read_text())
    pathlib.Path(str(__file__)+'.location').write_text(str(program))
    config = dict(root=str(root),owner=owner.pw_name,
        bindir=os.environ.get('PGBIN') or subprocess.check_output(['pg_config','--bindir'],text=True).strip())
    (root/'fixture.json').write_text(json.dumps(config))
else:
    root = pathlib.Path(__file__).resolve().parent
    config = json.loads((root/'fixture.json').read_text())
    assert str(root)==config['root'] and root.parent==pathlib.Path('/tmp') and root.name.startswith('pg-owned-')
    owner = pwd.getpwnam(config['owner'])
lock = (root/'phase.lock').open('w')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
bindir = pathlib.Path(config['bindir'])
prefix = ['runuser','-u',owner.pw_name,'--'] if os.geteuid()==0 else []
data,sock,log = root/'data',root/'socket',root/'server.log'
env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST=str(sock),PGPORT='6543',PGUSER='postgres',PGDATABASE='postgres',
    PGCONNECT_TIMEOUT='3',PGOPTIONS='-c statement_timeout=10000 -c lock_timeout=1000',LC_ALL='C')

def run(args,expected=0):
    p = subprocess.run(args,env=env,capture_output=True,text=True,timeout=30)
    assert p.returncode==expected,p.stdout+p.stderr
    return p

def utility(name,*args):
    return run(prefix+[str(bindir/name),*map(str,args)]).stdout.strip()

def sql(query):
    return run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',query]).stdout.strip()

def save(name,value):
    (root/(name+'.json')).write_text(json.dumps(value,indent=2))
    return value

def read(name):
    return json.loads((root/(name+'.json')).read_text())

def stopped():
    assert not (data/'postmaster.pid').exists()
    run(prefix+[str(bindir/'pg_ctl'),'-D',str(data),'status'],3)

def start():
    stopped()
    utility('pg_ctl','-D',data,'-l',log,'-w','-t','20','start')
    assert sql('show data_directory')==str(data)

def stop():
    if (data/'postmaster.pid').exists():utility('pg_ctl','-D',data,'-m','fast','-w','-t','20','stop')
    if data.exists():stopped()

def rows():
    return json.loads(sql("select json_agg(r order by id) from evidence_rows r"))

def expected():
    return [dict(id=i,amount=3*i,payload=hashlib.md5(str(i).encode()).hexdigest()*16) for i in range(1,201)]

def sample():
    tuples = json.loads(sql("select json_agg(r order by id) from (select l.id,h.t_xmin::text as xmin,f.combined_flags "
        "from generate_series(0,(pg_relation_size('evidence_rows')/8192-1)::int) b "
        "cross join lateral heap_page_items(get_raw_page('evidence_rows',b)) h "
        "cross join lateral heap_tuple_infomask_flags(h.t_infomask,h.t_infomask2) f "
        "join evidence_rows l on l.ctid=format('(%s,%s)',b,h.lp)::tid where h.lp_flags=1) r"))
    return dict(collected_at=time.time(),
        relation=json.loads(sql("select json_build_object('relfrozenxid',relfrozenxid::text,'xid_age',age(relfrozenxid),"
            "'bytes',pg_relation_size(oid)) from pg_class where oid='evidence_rows'::regclass")),
        tuple_flags=tuples,frozen_rows=sum('HEAP_XMIN_FROZEN' in r['combined_flags'] for r in tuples),
        visibility=json.loads(sql("select json_agg(r order by blkno) from pg_visibility_map('evidence_rows') r")),
        prepared=json.loads(sql("select coalesce(json_agg(r),'[]') from (select transaction::text as xid,gid,prepared,owner,database from pg_prepared_xacts) r")),
        clients=json.loads(sql("select coalesce(json_agg(r),'[]') from (select pid,application_name,state,backend_xid::text,backend_xmin::text,wait_event_type,wait_event "
            "from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid()) r")),
        slots=json.loads(sql("select coalesce(json_agg(r),'[]') from (select slot_name,xmin::text,catalog_xmin::text from pg_replication_slots) r")),
        effect=json.loads(sql("select coalesce(json_agg(r),'[]') from decision_effect r")))

def vacuum(label):
    p = run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',
        'vacuum (freeze,verbose,disable_page_skipping) evidence_rows'])
    (root/(label+'.log')).write_text(p.stdout+p.stderr)
    assert 'VACUUM' in p.stdout and 'finished vacuuming' in p.stderr
    return save(label,sample())

def coordinator():
    with sqlite3.connect('file:'+str(root/'coordinator.sqlite')+'?mode=ro',uri=True) as db:
        values=db.execute('select gid,decision,effect_id,amount from decisions').fetchall()
    assert len(values)==1 and values[0][0]=='freeze_hold' and values[0][1] in ('ABORT','COMMIT') and values[0][2:]==(1,41)
    return dict(gid=values[0][0],decision=values[0][1],effect_id=values[0][2],amount=values[0][3])

if phase=='cleanup':
    stopped();shutil.rmtree(root)
    print('Removed only the owned fixture:',root)
    sys.exit(0)

try:
    if phase=='prepare':
        sock.mkdir()
        if os.geteuid()==0:os.chown(sock,owner.pw_uid,owner.pw_gid)
        utility('initdb','-D',data,'-U','postgres','--auth-local=trust','--auth-host=reject',
            '--no-locale','--data-checksums','--wal-segsize=1')
        with (data/'postgresql.conf').open('a') as f:
            f.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='"+str(sock)+"'\n"
                "shared_buffers='16MB'\nmax_connections=10\nmax_prepared_transactions=4\nautovacuum=off\n"
                "archive_mode=off\nmin_wal_size='2MB'\nmax_wal_size='8MB'\ncheckpoint_timeout='1h'\n"
                "fsync=on\nsynchronous_commit=on\nfull_page_writes=on\nlogging_collector=off\n")
        start()
        assert sql('show block_size')=='8192'
        sql('create extension pageinspect; create extension pg_visibility; '
            'create table evidence_rows(id int primary key,amount int not null,payload text not null); '
            'create table decision_effect(id int primary key,amount int not null)')
        sql("insert into evidence_rows select i,3*i,repeat(md5(i::text),16) from generate_series(1,100) i")
        baseline=vacuum('baseline')
        assert baseline['frozen_rows']==100
        sql("begin; insert into decision_effect values(1,41); prepare transaction 'freeze_hold'")
        # The sole fixture coordinator commits a final decision but does not yet finalize the participant.
        with sqlite3.connect(root/'coordinator.sqlite') as db:
            db.executescript('pragma journal_mode=DELETE; pragma synchronous=FULL; '
                'create table decisions(gid text primary key,decision text not null,effect_id int not null,amount int not null)')
            db.execute('insert into decisions values(?,?,?,?)',('freeze_hold',decision,1,41));db.commit()
        sql("insert into evidence_rows select i,3*i,repeat(md5(i::text),16) from generate_series(101,200) i")
        assert rows()==expected()
        save('ledger-before',rows())
        first=vacuum('first-pass');second=vacuum('second-pass')
        assert first['frozen_rows']==second['frozen_rows']==100
        assert first['relation']['relfrozenxid']==second['relation']['relfrozenxid']==first['prepared'][0]['xid']
        assert len(first['prepared'])==len(second['prepared'])==1 and not second['clients'] and not second['slots']
        assert not second['effect']
        stop();start()
        restarted=vacuum('restart-pass')
        assert restarted['frozen_rows']==100 and restarted['prepared']==second['prepared']
        symptom=save('symptom',dict(ledger_rows=200,completed_passes=3,
            frozen_rows=[first['frozen_rows'],second['frozen_rows'],restarted['frozen_rows']],
            frozen_boundary=[s['relation']['relfrozenxid'] for s in (first,second,restarted)],
            instruction='Vacuum completed but freezing plateaued. Choose evidence, identify the dependency and justify a correctness-preserving remedy.'))
        print(json.dumps(symptom,indent=2))
    elif phase=='inspect':
        area=sys.argv[2] if len(sys.argv)>2 else 'all'
        assert area in ('all','tuples','horizons','passes','decision','data')
        start()
        fresh=sample()
        saved=read('restart-pass')
        values=dict(tuples=dict(saved=saved['tuple_flags'],fresh=fresh['tuple_flags'],visibility=fresh['visibility']),
            horizons=dict(saved={k:saved[k] for k in ('relation','prepared','clients','slots')},
                fresh_after_restart={k:fresh[k] for k in ('relation','prepared','clients','slots')}),
            passes={name:dict(observation=read(name),log=(root/(name+'.log')).read_text()) for name in ('first-pass','second-pass','restart-pass')},
            decision=coordinator(),data=dict(ledger=rows(),effect=fresh['effect']))
        evidence=values if area=='all' else values[area]
        save('inspection-'+area,evidence);print(json.dumps(evidence,indent=2))
    else:
        action=sys.argv[2]
        assert action=='resolve', 'Choose resolve using the durable decision; do not guess a transaction outcome'
        assert not (root/'recovery.json').exists(), 'Recovery already completed; prepare a new fixture'
        start()
        before=sample();decision=coordinator()
        assert len(before['prepared'])==1 and before['prepared'][0]['gid']==decision['gid']
        assert before['frozen_rows']==100 and not before['effect']
        save('action',dict(selected=action,coordinator=decision,before=before))
        verb='rollback' if decision['decision']=='ABORT' else 'commit'
        sql(verb+" prepared 'freeze_hold'")
        after=vacuum('resolved-pass')
        assert not after['prepared'] and after['frozen_rows']==200
        assert all(r['all_frozen'] for r in after['visibility'])
        assert after['relation']['relfrozenxid']!=before['relation']['relfrozenxid']
        desired=[] if decision['decision']=='ABORT' else [dict(id=1,amount=41)]
        assert after['effect']==desired
        assert rows()==expected()==read('ledger-before')
        save('ledger-final',rows())
        stop();start()
        durable=sample()
        assert not durable['prepared'] and durable['effect']==desired and durable['frozen_rows']==200
        assert rows()==expected() and coordinator()==decision
        result=save('recovery',dict(decision=decision['decision'],before=before,after=after,
            durable_after_restart=durable,ledger_rows=200,ledger_amount=sum(r['amount'] for r in rows()),
            effect=desired,limit='A bounded horizon dependency; no real wraparound deadline or forced anti-wraparound worker is simulated.'))
        print(json.dumps(result,indent=2))
        print('Verified resolved decision, tuple freezing, horizon progress and unchanged ledger across restart.')
finally:
    stop()
    print('Owned server stopped. Controller and evidence:',root/'freeze.py',flush=True)
    print('After recording findings, release this fixture: python3 "'+str(root/'freeze.py')+'" cleanup',flush=True)
`;

export function freezeSetup(decision = "ABORT"): string {
  return code`set -eu
FREEZE_BOOTSTRAP=$(mktemp /tmp/pg-freeze-XXXXXX.py)
cat > "$FREEZE_BOOTSTRAP" <<'PY'
` + FREEZE_PROGRAM + '\nPY\npython3 "$FREEZE_BOOTSTRAP" prepare ' + decision + code`
FREEZE=$(cat "$FREEZE_BOOTSTRAP.location")
# In a new shell, set FREEZE to the printed absolute freeze.py path.
`;
}

export const FREEZE_CORE = freezeSetup();
export const FREEZE_VARIATION = freezeSetup("COMMIT") + code`
python3 "$FREEZE" inspect all
python3 "$FREEZE" recover resolve
`;

export const FREEZE_INCIDENT: Draft = {
  slug: "wraparound-drill",
  revision: 4,
  title: "Incident: completed vacuum, unfinished freezing",
  tags: ["wraparound", "freezing", "xid", "incident", "two-phase-commit"],
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 35,
  prerequisites: [
    "wraparound-and-freezing",
    "autovacuum-triggers",
    "read-the-server-log",
    "two-phase-commit",
  ],
  reading:
    code`PostgreSQL 14 Internals, Chapter 7 "Freezing" (sections "Transaction ID Wraparound", "Managing Freezing"); Chapter 6 "Vacuum and Autovacuum" (section "Monitoring")`,
  readingNotes: code`
Chapter 7 explains freezing and the relation/database horizons that bound transaction-ID age;
Chapter 6 supplies vacuum monitoring context. Read after diagnosing why the completed passes do
not finish freezing. This exercise applies that mechanism to a durable prepared-transaction
obligation, whose decision protocol is outside the book and comes from the earlier2PC lesson.
It does not lower wraparound thresholds, burn large numbers of XIDs or simulate a production deadline.`,
  overview: code`
Several vacuum passes completed, yet part of a small ledger remains unfrozen and its frozen
boundary does not move. Select tuple, horizon, process and durable outcome evidence to identify the
dependency, then choose a remedy that preserves the required transaction result. Verify physical
freeze progress and complete application state after resolution and restart. The tutor can prepare
only the symptom packet before disclosing construction; full source remains available on request.`,
  caution: code`
Use the supplied shell with Python3, PostgreSQL16 tools and pageinspect/pg_visibility available.
It creates a private /tmp/pg-owned-* cluster with TCP disabled, clears inherited PG connection
variables and stops its server after every phase. Root uses runuser with the postgres OS account;
other users use their own account. PGBIN can select matching binaries. Keep at least2GB free;
this fixture uses roughly35MB. A file lock rejects concurrent phases for one fixture.
Never substitute a learner database or resolve an unrelated transaction. Preserve required
findings, then run the printed cleanup action to remove only this stopped fixture. The local
trial does not approach transaction-ID exhaustion or establish a real wraparound deadline.`,
  syntaxBreakdown: code`
### In plain terms

Vacuum can finish its scan without being allowed to freeze every tuple. Diagnose the boundary
from physical tuple flags and transaction evidence, then use the correct durable outcome to
release it. Frozen tuple count, a relation's frozen-XID marker, and a successful VACUUM command
answer different questions. Reducing a catalog age by discarding a transaction with an unknown
outcome is not a correctness-preserving recovery strategy.

### What you are learning

- **Eligibility versus completion:** a successful freeze pass cannot override an older transaction
  horizon. Repeating the same command may leave the same unfrozen tuples.
- **Persistent dependencies:** some transaction obligations survive client disconnection and server
  restart, so absence of an idle client does not establish absence of a horizon dependency.
- **Correct resolution:** use a recorded final decision, not an arbitrary commit/rollback chosen
  to make the vacuum metric improve.
- **Independent evidence:** verify tuple flags, visibility-map state, frozen boundary, full ledger
  payloads and the decision's business effect after restart.

### Piece by piece

- **set -eu**, **mktemp**, a quoted **cat <<'PY'** heredoc and **python3** write/run the complete
  controller. FREEZE_BOOTSTRAP.location records its owned path and **FREEZE** retains that path
  in this shell. Assign the printed absolute freeze.py path in a new shell.
- **prepare ABORT|COMMIT** creates the core or variation. The only varied condition is the final
  decision recorded by the fixture coordinator; diagnosis and freezing mechanics stay the same.
  **tempfile.mkdtemp** allocates the root, **shutil.disk_usage** checks2GB free, and **pwd/os.chown/
  runuser -u ... --** select the OS owner. **fcntl.flock(LOCK_EX|LOCK_NB)** rejects overlapping
  phases. Each command is bounded and stops its own server in finally.
- **PGBIN / pg_config --bindir** locates tools. **initdb -D ... -U postgres --auth-local=trust
  --auth-host=reject --no-locale --data-checksums --wal-segsize=1** names the data directory/role,
  confines trust to a protected private socket, rejects host authentication, fixes locale, enables
  checksums and uses1MB WAL segments. **listen_addresses=''** disables TCP;
  **unix_socket_directories/PGHOST**, **port/PGPORT**, **PGUSER/PGDATABASE** select that endpoint.
- **PGCONNECT_TIMEOUT=3**, **PGOPTIONS** with10s statement/1s lock deadlines, **LC_ALL=C**, and
  Python30s subprocess limits bound operations and fix diagnostics. **psql -X -At -v ON_ERROR_STOP=1
  -c** ignores startup files, prints tuples without alignment, fails on SQL errors and executes
  the supplied SQL. Inherited PG variables are removed.
- **pg_ctl -D ... -l ... -w -t20 start** chooses only the owned server/log and waits for readiness;
  **show data_directory** verifies its identity. **-m fast ... stop** stops it normally;
  **status** must return3 with no postmaster.pid before another phase or cleanup.
- **shared_buffers=16MB/max_connections=10**, **min_wal_size=2MB/max_wal_size=8MB** and
  **checkpoint_timeout=1h** bound resource use. **max_prepared_transactions=4** enables the
  prepared participant. **autovacuum=off/archive_mode=off** remove unrelated writers and archive
  accumulation. **fsync/synchronous_commit/full_page_writes=on** retain normal durability;
  **logging_collector=off** keeps the server log in the root. **show block_size** requires8KB pages.
- **CREATE EXTENSION pageinspect/pg_visibility** supplies physical tuple and visibility-map
  observations. **evidence_rows** is an immutable ledger: IDs1–200, amount3*id and a512-character
  payload from **repeat(md5(id::text),16)**. **generate_series** inserts100 baseline rows and100
  later rows in separate committed statements. Python reconstructs all expected payloads.
- **VACUUM (FREEZE, VERBOSE, DISABLE_PAGE_SKIPPING)** asks to freeze eligible tuples, records its
  actual completed-pass diagnostics and scans even pages ordinarily skippable through the
  visibility map. It does not ignore transaction visibility constraints. The first pass freezes
  the100 baseline tuples. Later passes operate on all200 while the dependency remains.
- **BEGIN; INSERT INTO decision_effect VALUES(1,41); PREPARE TRANSACTION 'freeze_hold'** detaches
  a real participant after assigning its XID and a tentative business effect. That transaction
  remains unresolved after its psql client exits and after server restart. A fresh reader still
  sees no effect row. No persistent client is needed to keep this particular obligation alive.
- **coordinator.sqlite** is an independent durable decision store. **journal_mode=DELETE** and
  **synchronous=FULL** configure it; a committed row identifies the exact GID, ABORT/COMMIT,
  effect identity1 and amount41. **sqlite3 mode=ro** reads it during diagnosis/resolution. This
  fixture has one known coordinator and one final decision; it is not coordinator election or
  a multi-host consensus protocol.
- **pg_relation_size/8192** enumerates all heap blocks. **get_raw_page** copies each block;
  **heap_page_items** returns physical tuple headers, including xmin. **lp_flags=1** selects
  normal tuple entries. **heap_tuple_infomask_flags(...).combined_flags** decodes flags;
  **HEAP_XMIN_FROZEN** is the combined indication used here, not a guessed numeric xmin value.
  **format('(%s,%s)',block,lp)::tid** joins physical entries to the ledger's current **ctid**,
  giving a complete per-identity flag inventory with no concurrent ledger writer.
- **pg_visibility_map** reports all-visible and all-frozen per block. **pg_class.relfrozenxid**
  and **age(relfrozenxid)** expose a relation's frozen boundary and current relative age. The
  fixture's fresh XIDs are nearby; it neither extrapolates time-to-wraparound nor requires
  database ages to agree. Page flags and the relation marker remain distinct evidence.
- **pg_prepared_xacts** identifies the detached participant, its XID/GID, preparation time, owner
  and database. **pg_stat_activity** lists other client PIDs, XIDs/xmin and waits; the observing
  connection is excluded. **pg_replication_slots** checks another possible horizon source via
  xmin/catalog_xmin. Empty client and slot inventories therefore do not contradict the prepared
  obligation. The completed-pass logs and saved samples remain available after restart.
- **inspect tuples|horizons|passes|decision|data|all** supplies selected evidence. Saved and
  fresh-after-restart horizons are labeled separately. Tuple inspection includes all flag rows;
  pass inspection includes actual verbose logs; decision inspection reads the committed coordinator
  record; data inspection includes the complete ledger and independently visible effect.
- After recording a diagnosis, run **python3 "$FREEZE" recover resolve**. It saves the selected
  action, current dependency and durable decision before mutation. It resolves only the exact
  registered GID with **ROLLBACK PREPARED** for ABORT or **COMMIT PREPARED** for COMMIT. Supplying
  another action is rejected; the learner does not guess an outcome to release the horizon.
- A new identical freeze pass must freeze all200 tuples, mark every ledger page all-frozen and
  advance relfrozenxid after the prepared entry disappears. Full ledger JSON must remain identical
  to the original200 rows/amount60,300. The separately checked effect must be absent for ABORT
  or exactly(id1,amount41) for COMMIT. Another restart verifies the resolved state and frozen flags.
- **python3 "$FREEZE" cleanup** verifies stopped state and removes only the owned fixture.
  Record required evidence first; raw directories should not accumulate across experiments.`,
  code: FREEZE_CORE,
  expectedResult: code`
Preparation reports200 ledger rows and three completed passes with frozen counts100/100/100 and
an unchanged frozen boundary. It saves detailed evidence and stops; this is not a simulated
wraparound deadline. Inspection shows IDs1–100 frozen and101–200 not frozen, one detached prepared
transaction, no other client backends and no replication slots. Its XID matches the pinned relation
boundary in this fixture, and its business row is not yet visible. Restart did not release it.

After the explicit resolve action follows the committed coordinator decision, the prepared entry
is gone, all200 tuple flags are frozen, every ledger visibility-map entry is all-frozen, and the
relation boundary advances. The complete200-row ledger remains unchanged with amount60,300.
ABORT core leaves no decision_effect row; COMMIT variation leaves exactly(id1,amount41). A later
server restart preserves both the decision outcome and200 frozen tuples. Paths, actual XIDs,
relative ages, page counts and timings vary; no forced anti-wraparound worker or real safety
threshold is exercised.`,
  systemsLens: code`
Background maintenance can complete its work while a foreground protocol still forbids reclamation
or freezing. Diagnose the retained obligation and its authority, not just the worker's existence.
Correctness includes both resource progress and the transaction's required business outcome;
releasing a dependency with the wrong decision is not successful recovery.`,
  challenge: code`
Select the evidence that distinguishes a slow worker from an eligibility limit. Record which
identities remain unfrozen, the dependency that explains them, and the source authorizing its
resolution. Run the supplied resolve action and reconcile physical progress with application state.
Use hint2 to change only the durable final decision to COMMIT. Predict which observation changes
and which ledger/freeze facts remain invariant, then verify and clean up both fixtures.`,
};
