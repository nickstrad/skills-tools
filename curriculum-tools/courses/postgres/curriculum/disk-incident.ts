import { code, type Draft } from "../../../src/types.ts";

// A complete staged controller is embedded in each supplied shell fixture.
export const DISK_INCIDENT_PROGRAM = code`
import datetime, hashlib, json, os, pathlib, pwd, re, secrets, shutil
import sqlite3, subprocess, sys, tempfile, time

phase = sys.argv[1]
assert phase in ('prepare', 'inspect', 'recover')
if phase == 'prepare':
    cause = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('INCIDENT_CASE') or secrets.choice(('slot', 'archive', 'production'))
    assert cause in ('slot', 'archive', 'production')
    root = pathlib.Path(tempfile.mkdtemp(prefix='pg-owned-', dir='/tmp'))
    owner = pwd.getpwnam('postgres') if os.geteuid() == 0 else pwd.getpwuid(os.geteuid())
    if os.geteuid() == 0:
        os.chown(root, owner.pw_uid, owner.pw_gid)
    program = root / 'incident.py'
    program.write_text(pathlib.Path(__file__).read_text())
    pathlib.Path(str(__file__)+'.location').write_text(str(program))
    config = dict(cause=cause, owner=owner.pw_name, root=str(root),
        bindir=os.environ.get('PGBIN') or subprocess.check_output(['pg_config', '--bindir'], text=True).strip())
    (root / 'fixture.json').write_text(json.dumps(config))
else:
    root = pathlib.Path(__file__).resolve().parent
    config = json.loads((root / 'fixture.json').read_text())
    assert str(root) == config['root'] and root.name.startswith('pg-owned-')
    owner = pwd.getpwnam(config['owner'])

bindir = pathlib.Path(config['bindir'])
data, sock, log = root / 'data', root / 'socket', root / 'server.log'
archive, gate = root / 'archive', root / 'destination-unavailable'
prefix = ['runuser', '-u', owner.pw_name, '--'] if os.geteuid() == 0 else []
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST=str(sock), PGPORT='6543', PGUSER='postgres', PGDATABASE='postgres',
    PGCONNECT_TIMEOUT='3', PGOPTIONS='-c statement_timeout=15000 -c lock_timeout=1000', LC_ALL='C')

def run(args, timeout=30):
    p = subprocess.run(args, env=env, capture_output=True, text=True, timeout=timeout)
    assert p.returncode == 0, p.stdout + p.stderr
    return p.stdout.strip()

def server(name, *args):
    return run(prefix + [str(bindir / name), *map(str, args)])

def sql(query):
    return run([str(bindir / 'psql'), '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query])

def scalar(query):
    return json.loads(sql(query))

def wait(label, predicate, seconds=30):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.2)
    raise RuntimeError('Timeout: ' + label + '; evidence: ' + str(root))

def emit(name, value):
    (root / (name + '.json')).write_text(json.dumps(value, indent=2))
    print(name + ': ' + json.dumps(value, sort_keys=True), flush=True)

def source():
    return scalar("select coalesce(json_agg(r order by id),'[]') from operations r")

def receiver():
    with sqlite3.connect(root / 'receiver.sqlite') as db:
        rows = [dict(id=r[0], amount=r[1], payload=r[2]) for r in db.execute(
            'select id,amount,payload from receipts order by id')]
        total = db.execute('select total from balance').fetchone()[0]
    assert total == sum(r['amount'] for r in rows)
    return rows, total

def receive():
    through = sql('select pg_current_wal_flush_lsn()')
    def decode(function):
        return scalar("select coalesce(json_agg(r),'[]') from (select lsn::text,xid::text,data from "
            + function + "('incident_feed','" + through + "',null,'include-xids','1',"
            "'skip-empty-xacts','1','stream-changes','0')) r")
    events = decode('pg_logical_slot_peek_changes')
    payload, xid, bound = [], None, None
    for event in events:
        text = event['data']
        if text.startswith('BEGIN '):
            assert xid is None and text == 'BEGIN ' + event['xid']
            xid = event['xid']
        elif text.startswith('COMMIT '):
            assert xid == event['xid'] and text == 'COMMIT ' + xid
            xid, bound = None, event['lsn']
        else:
            assert xid == event['xid']
            match = re.fullmatch(r"table public\.operations: INSERT: id\[integer\]:(\d+) amount\[integer\]:(\d+) payload\[text\]:'([0-9a-f]+)'", text)
            assert match, text[:200]
            payload.append((int(match[1]), int(match[2]), match[3]))
    assert xid is None
    with sqlite3.connect(root / 'receiver.sqlite') as db:
        db.execute('pragma synchronous=FULL')
        for item in payload:
            old = db.execute('select amount,payload from receipts where id=?', (item[0],)).fetchone()
            if old is None:
                db.execute('insert into receipts values(?,?,?)', item)
                db.execute('update balance set total=total+?', (item[1],))
            else:
                assert old == item[1:]
        db.commit()
    # The independent receipt/effect commit precedes source acknowledgement.
    assert decode('pg_logical_slot_get_changes') == events
    confirmed = sql("select confirmed_flush_lsn from pg_replication_slots where slot_name='incident_feed'")
    return dict(decoded_rows=len(payload), acknowledged_commit=bound, consumed_through=through,
        confirmed_flush_lsn=confirmed, receiver_rows=len(receiver()[0]))

def workload(count):
    first = int(sql('select coalesce(max(id),0)+1 from operations'))
    begin = sql('select pg_current_wal_insert_lsn()')
    started = time.monotonic()
    sql('insert into operations select i,i*3,(select string_agg(md5(i::text || \':\' || j::text),\'\' order by j) '
        'from generate_series(1,24) j) from generate_series(' + str(first) + ',' + str(first+count-1) + ') i')
    writer_seconds = time.monotonic() - started
    # Fixed offered-work window; slow hosts record the longer actual window.
    time.sleep(max(0, 1.0-writer_seconds))
    end = sql('select pg_current_wal_insert_lsn()')
    elapsed = time.monotonic() - started
    size = int(sql("select pg_wal_lsn_diff('" + end + "','" + begin + "')"))
    return dict(first_id=first, rows=count, seconds=elapsed, writer_seconds=writer_seconds,
        target_window_seconds=1, start_lsn=begin, end_lsn=end,
        wal_bytes=size, wal_bytes_per_operation=size/count, wal_bytes_per_second=size/elapsed)

def sample():
    wal = scalar("select json_agg(r order by name) from (select name,size from pg_ls_waldir() where name ~ '^[0-9A-F]{24}$') r")
    slots = scalar("select coalesce(json_agg(r),'[]') from (select slot_name,active,restart_lsn,confirmed_flush_lsn,"
        "wal_status,safe_wal_size,pg_wal_lsn_diff(pg_current_wal_insert_lsn(),restart_lsn) as retained_distance from pg_replication_slots) r")
    return dict(collected_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        insert_lsn=sql('select pg_current_wal_insert_lsn()'), flush_lsn=sql('select pg_current_wal_flush_lsn()'),
        wal_files=wal, wal_file_bytes=sum(r['size'] for r in wal), slots=slots,
        archiver=scalar('select row_to_json(r) from pg_stat_archiver r'),
        ready=sorted(p.name for p in (data/'pg_wal'/'archive_status').glob('*.ready')),
        checkpoint=scalar('select row_to_json(r) from pg_control_checkpoint() r'),
        source_rows=int(sql('select count(*) from operations')), receiver_rows=len(receiver()[0]),
        settings=scalar("select json_build_object('max_wal_size',current_setting('max_wal_size'),"
            "'wal_segment_size',current_setting('wal_segment_size'),'archive_mode',current_setting('archive_mode'),"
            "'max_slot_wal_keep_size',current_setting('max_slot_wal_keep_size'))"))

def archive_wake():
    # Switch only for archive liveness, outside every measured workload interval.
    sql("select pg_create_restore_point('incident_archive_wake')")
    return sql('select pg_walfile_name(pg_switch_wal())')

def drain_archive():
    name = archive_wake()
    wait('archive caught up', lambda: (archive/name).is_file() and not list((data/'pg_wal'/'archive_status').glob('*.ready')), 75)

if phase == 'prepare':
    for folder in (sock, archive):
        folder.mkdir()
        if os.geteuid() == 0:
            os.chown(folder, owner.pw_uid, owner.pw_gid)
    server('initdb', '-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=reject',
        '--no-locale', '--data-checksums', '--wal-segsize=1')
    script = root / 'archive.py'
    script.write_text('import pathlib,shutil,sys\n'
        + 'root=pathlib.Path(' + repr(str(root)) + ')\n'
        + "if (root/'destination-unavailable').exists():\n print('owned destination unavailable',file=sys.stderr)\n sys.exit(1)\n"
        + "source=pathlib.Path(sys.argv[1]); dest=root/'archive'/sys.argv[2]\n"
        + "if dest.exists():\n sys.exit(0 if source.read_bytes()==dest.read_bytes() else 1)\n"
        + "temporary=dest.with_suffix('.partial'); shutil.copyfile(source,temporary); temporary.replace(dest)\n")
    with (data/'postgresql.conf').open('a') as f:
        f.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='"+str(sock)+"'\n"
            "shared_buffers='16MB'\nmax_connections=10\nwal_level=logical\nmax_replication_slots=2\n"
            "fsync=on\nsynchronous_commit=on\nfull_page_writes=on\nmin_wal_size='2MB'\nmax_wal_size='8MB'\n"
            "checkpoint_timeout='1h'\nautovacuum=off\nlogging_collector=off\nlog_checkpoints=on\n"
            "archive_mode=on\narchive_command='python3 "+str(script)+" %p %f'\n")
    with sqlite3.connect(root/'receiver.sqlite') as db:
        db.executescript('pragma journal_mode=DELETE; pragma synchronous=FULL; '
            'create table receipts(id integer primary key,amount integer not null,payload text not null); '
            'create table balance(total integer not null); insert into balance values(0);')

started = False
try:
    assert not (data/'postmaster.pid').exists(), 'Another phase already owns this server'
    started = True
    server('pg_ctl', '-D', data, '-l', log, '-w', '-t', '20', 'start')
    assert sql('show data_directory') == str(data)
    if phase == 'prepare':
        sql('create table operations(id int primary key,amount int not null,payload text not null)')
        sql("select pg_create_logical_replication_slot('incident_feed','test_decoding')")
        baseline = workload(300)
        receive()
        drain_archive()
        sql('checkpoint')
        before = sample()
        if cause == 'archive':
            gate.touch()
        batches = []
        observations = []
        for _ in range(4):
            batches.append(workload(3000))
            if cause != 'slot':
                receive()
            if cause != 'archive':
                drain_archive()
            else:
                archive_wake()
            observations.append(sample())
        if cause == 'archive':
            wait('observed archive failure', lambda: sample()['archiver']['failed_count'] > before['archiver']['failed_count'])
        sql('checkpoint')
        sql('checkpoint')
        after = sample()
        packet = dict(baseline_workload=baseline, before=before, workloads=batches,
            during=observations, after_checkpoints=after,
            note='Saved incident window; switches used for archive liveness are outside workload LSN intervals.')
        (root/'incident.json').write_text(json.dumps(packet, indent=2))
        targets = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (data/'pg_wal').iterdir()
            if p.is_file() and (data/'pg_wal'/'archive_status'/(p.name+'.ready')).exists()}
        (root/'pending-hashes.json').write_text(json.dumps(targets))
        (root/'source-before.json').write_text(json.dumps(source()))
        (root/'receiver-before-rows.json').write_text(json.dumps(receiver()[0]))
        (root/'receiver-before.json').write_text(json.dumps(dict(rows=len(receiver()[0]), total=receiver()[1])))
        emit('symptom', dict(wal_bytes_before=before['wal_file_bytes'],
            wal_bytes_peak_during_workload=max(s['wal_file_bytes'] for s in observations),
            wal_bytes_after_checkpoints=after['wal_file_bytes'], committed_rows=after['source_rows'],
            instruction='Investigate saved workload, WAL, slot, archiver and data evidence before choosing a remedy.'))
    elif phase == 'inspect':
        area = sys.argv[2] if len(sys.argv) > 2 else 'all'
        assert area in ('all', 'slots', 'archiver', 'wal', 'workload', 'data', 'logs')
        saved = json.loads((root/'incident.json').read_text())
        fresh = sample()
        if area == 'all':
            evidence = dict(saved=saved, fresh_after_restart=fresh)
        elif area == 'workload':
            evidence = dict(baseline=saved['baseline_workload'], incident=saved['workloads'])
        elif area == 'logs':
            evidence = log.read_text().splitlines()[-60:]
        else:
            keys = dict(slots=['slots'], archiver=['archiver','ready'],
                wal=['wal_files','wal_file_bytes','checkpoint','insert_lsn','settings'], data=['source_rows','receiver_rows'])[area]
            evidence = {stage:{key:value[key] for key in keys} for stage,value in
                [('saved_before',saved['before']),('saved_after',saved['after_checkpoints']),('fresh_after_restart',fresh)]}
        emit('inspection-'+area, evidence)
    else:
        action = sys.argv[2]
        assert action in ('resume', 'discard-reseed', 'repair-archive', 'reduce-demand')
        assert not (root/'recovery.json').exists(), 'Recovery already completed; prepare a new case'
        before = sample()
        emit('decision', dict(action=action, before=before))
        # Admission uses observed dependencies, not the hidden preparation label.
        pending = before['source_rows'] > before['receiver_rows']
        archive_failed = bool(before['ready']) and gate.exists()
        eligible = ((action in ('resume','discard-reseed') and pending and not archive_failed)
            or (action == 'repair-archive' and archive_failed and not pending)
            or (action == 'reduce-demand' and not pending and not archive_failed))
        if not eligible:
            raise RuntimeError('This action does not address the prepared condition; inspect evidence and choose again. No remedy applied.')
        details = {}
        if action == 'resume':
            details['delivery'] = receive()
            assert receiver()[0] == source()
        elif action == 'discard-reseed':
            old = receiver()[0]
            sql("select pg_drop_replication_slot('incident_feed')")
            sql('checkpoint')
            sql('checkpoint')
            sql("select pg_create_logical_replication_slot('incident_feed','test_decoding')")
            details['new_slot_empty_tail'] = receive()
            assert details['new_slot_empty_tail']['decoded_rows'] == 0
            assert receiver()[0] == old and len(old) < len(source())
            details['gap_rows'] = len(source())-len(old)
            # No writer runs concurrently in this fixture. One SELECT is the complete snapshot.
            snapshot = source()
            with sqlite3.connect(root/'receiver.sqlite') as db:
                db.execute('pragma synchronous=FULL')
                db.execute('delete from receipts')
                db.executemany('insert into receipts values(?,?,?)',[(r['id'],r['amount'],r['payload']) for r in snapshot])
                db.execute('update balance set total=?',(sum(r['amount'] for r in snapshot),))
                db.commit()
            assert receiver()[0] == snapshot
            details['snapshot_rows'] = len(snapshot)
        elif action == 'repair-archive':
            targets = json.loads((root/'pending-hashes.json').read_text())
            assert targets and gate.exists()
            gate.unlink()
            drain_archive()
            assert all(hashlib.sha256((archive/name).read_bytes()).hexdigest()==digest for name,digest in targets.items())
            details['verified_archives'] = targets
        else:
            details['reduced_workload'] = workload(300)
            original = json.loads((root/'incident.json').read_text())['workloads']
            assert details['reduced_workload']['wal_bytes'] < min(r['wal_bytes'] for r in original)
            assert details['reduced_workload']['wal_bytes_per_second'] < min(r['wal_bytes_per_second'] for r in original)
            details['delivery'] = receive()
        # Complete data, an actual later tail and a redundant retry test recovery usefulness.
        assert receiver()[0] == source()
        details['later_work'] = workload(1)
        details['later_delivery'] = receive()
        assert details['later_delivery']['decoded_rows'] == 1
        final = source()
        assert receiver()[0] == final
        total = receiver()[1]
        assert receive()['decoded_rows'] == 0 and receiver()[1] == total
        drain_archive()
        for _ in range(2):
            sql('checkpoint')
            assert receive()['decoded_rows'] == 0
        sql('checkpoint')
        after = sample()
        details.update(action=action, source_rows=len(final), receiver_rows=len(receiver()[0]),
            total=total, before=before, after=after,
            reclaimed_names=sorted({r['name'] for r in before['wal_files']}-{r['name'] for r in after['wal_files']}))
        assert details['reclaimed_names'], 'No old segment name became reclaimable'
        assert after['slots'][0]['wal_status'] == 'reserved', 'Consumer still retains history beyond the normal target'
        assert after['wal_file_bytes'] < before['wal_file_bytes'], 'The incident WAL allocation did not fall'
        (root/'source-final.json').write_text(json.dumps(final))
        emit('recovery', details)
        print('PASS: complete receiver contents, later delivery, duplicate stability and eligible old WAL verified.', flush=True)
finally:
    if started and (data/'postmaster.pid').exists():
        server('pg_ctl', '-D', data, '-m', 'fast', '-w', '-t', '20', 'stop')
    if started:
        status = subprocess.run(prefix+[str(bindir/'pg_ctl'),'-D',str(data),'status'], capture_output=True, text=True, timeout=5)
        assert status.returncode == 3 and not (data/'postmaster.pid').exists()
        print('Owned server stopped. Evidence and next-stage controller:', root/'incident.py', flush=True)
`;

export function diskIncidentSetup(cause = ""): string {
  return code`set -eu
INCIDENT_BOOTSTRAP=$(mktemp /tmp/pg-incident-XXXXXX.py)
cat > "$INCIDENT_BOOTSTRAP" <<'PY'
` + DISK_INCIDENT_PROGRAM + '\nPY\npython3 "$INCIDENT_BOOTSTRAP" prepare' +
    (cause ? " " + cause : "") + code`
INCIDENT=$(cat "$INCIDENT_BOOTSTRAP.location")
# Keep INCIDENT for the inspection and recovery commands in this shell.
# In another shell, set INCIDENT to the printed absolute incident.py path.
`;
}

export const DISK_INCIDENT_CORE = diskIncidentSetup();
export const DISK_INCIDENT_VARIATION = diskIncidentSetup("slot") + code`
python3 "$INCIDENT" inspect all
python3 "$INCIDENT" recover discard-reseed
`;

export const DISK_INCIDENT: Draft = {
  slug: "abandoned-slot-fills-the-disk",
  revision: 4,
  title: "Incident: diagnose growing WAL before choosing a remedy",
  tags: ["replication-slots", "wal", "capacity", "incident", "observability"],
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 45,
  prerequisites: ["wal-files-and-recycling", "replication-slot-retains-wal", "slot-lag-and-disk"],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
  overview: code`
WAL files grew during a bounded write workload. Determine whether retained consumer history,
unsuccessful archiving or changed write demand explains the evidence, then choose a remedy that
restores both resource progress and complete application results. Preparation selects a case and
stops the private server; you own the investigation and action choice. Full fixture construction
is supplied, and the tutor can run it for you before showing only the symptom packet.`,
  caution: code`
Run in a shell with Python3, matching PostgreSQL16 server tools and test_decoding installed. Each
case creates a private /tmp/pg-owned-* cluster, socket, archive and independent SQLite receiver;
it retains roughly100MB of evidence. PGBIN may select the server binary directory. Root uses the
postgres OS account through runuser; other users use their own account. Inherited PG connection
variables are cleared and TCP is disabled. Every phase stops its server, including failed remedies.
Run one phase at a time for a given case.
Keep the printed incident.py path: all subsequent commands target only that owned case. Inspect
its stopped state before later removing evidence. No phase fills a filesystem or deletes WAL by hand.
The archive is a local verified copy; it is not an off-host or tested backup restore.`,
  syntaxBreakdown: code`
### In plain terms

The same growing WAL directory can reflect different obligations. Investigate the saved incident
window, choose an action, and verify the receiver's identities, amounts and payloads as well as old
WAL becoming reclaimable. An inactive slot alone is not a diagnosis: this fixture's finite consumer
disconnects after every successful batch too.

### What you are learning

- **Causal diagnosis:** compare workload intervals, retention positions and archive backlog before
  attributing directory growth to one mechanism. More than one contributor can exist.
- **Recovery obligations:** releasing a slot and recovering its consumer are separate operations.
- **Measurement scope:** actual inserted WAL bytes, full segment allocation and archived copies
  measure different things. A completed checkpoint cannot override a consumer's retention promise.
- **Application evidence:** a receiver receipt and its balance mutation commit together, and full
  source/receiver payload agreement establishes the recovered projection in this controlled history.

### Piece by piece

- **set -eu** stops the shell on failed commands or unset variables. **mktemp** creates a unique
  bootstrap file; **cat > ... <<'PY'** writes the supplied Python literally. **python3** runs it.
  **INCIDENT_BOOTSTRAP.location** records the resulting controller path and **INCIDENT** retains
  it in this shell. In another shell, assign INCIDENT the absolute incident.py path printed by the
  completed preparation. Never substitute an existing database's directory.
- **prepare** creates one case selected by **secrets.choice**. The optional **INCIDENT_CASE**
  environment value or explicit prepare argument selects slot, archive or production for a
  reproducible worked case. Fixture labels live in fixture.json; diagnose from incident.json and
  the supported inspection commands before opening that setup record.
- **tempfile.mkdtemp** allocates the owned root; **pwd**, **os.chown** and **runuser -u ... --**
  select its OS owner. **PGBIN / pg_config --bindir** locates executables. **initdb -D** names the
  new data directory, **-U** its administrator, **--auth-local=trust** its protected local access,
  **--auth-host=reject** host rejection, **--no-locale** fixed locale, **--data-checksums** page
  checksums and **--wal-segsize=1** small1MB segments.
- **listen_addresses=''** disables TCP; **unix_socket_directories/PGHOST**, **port/PGPORT** and
  **PGUSER/PGDATABASE** choose only the private endpoint. **PGCONNECT_TIMEOUT** bounds connection
  attempts. **PGOPTIONS** applies15s statement and1s lock deadlines. **psql -X** ignores startup
  files, **-At** prints tuples without alignment, **-v ON_ERROR_STOP=1** stops on errors and **-c**
  runs the supplied SQL. Python subprocess timeouts bound each utility call independently.
- **pg_ctl -D ... -l ... -w -t20 start** identifies data/log files, waits for readiness and bounds
  the wait. A query checks the actual data_directory. **-m fast ... stop** rolls back open work
  and stops that owned server in finally; **status** must return3 with no postmaster.pid afterward.
  Inspection also starts and stops the server. Its fresh sample includes this lifecycle work and
  is explicitly separate from the saved original incident window.
- **wal_level=logical/max_replication_slots=2** enable decoding. **fsync/synchronous_commit/
  full_page_writes=on** preserve ordinary local durability settings;16MB shared buffers and ten
  connections bound the fixture. **min_wal_size=2MB/max_wal_size=8MB/checkpoint_timeout=1h** set
  recycling/checkpoint targets. **autovacuum=off** removes that uncontrolled writer; explicit and
  size-triggered checkpoints still occur. **log_checkpoints=on/logging_collector=off** retain
  checkpoint evidence in the pg_ctl log.
- **operations** is an immutable ledger. **generate_series** supplies contiguous IDs, amount is
  three times the ID, and ordered **string_agg(md5(...))** constructs the exact768-character payload.
  An initial300-row transaction precedes four3,000-row transactions. **pg_current_wal_insert_lsn**
  and **pg_wal_lsn_diff** measure actual WAL across each controlled window. **time.monotonic**
  records elapsed time; a bounded sleep completes a target one-second window when writing finishes
  sooner. Longer actual windows are reported honestly. writer_seconds is the SQL-call duration;
  seconds includes the offered-work window and final observation, not consumer/archive work.
- **wal_bytes_per_operation/wal_bytes_per_second** divide the observed insertion interval by its
  row count/time. Checkpoint/page-image/background records in that interval remain included; this
  is not a universal per-request charge or production capacity benchmark. Archive wake-up switches
  happen outside these intervals and must not be counted as useful workload WAL bytes.
- **pg_create_logical_replication_slot(...,'test_decoding')** creates incident_feed. The finite
  receiver calls **pg_logical_slot_peek_changes** without advancing it. **include-xids=1** identifies
  transaction envelopes, **skip-empty-xacts=1** omits empty decoded transactions, and
  **stream-changes=0** keeps ordinary complete transactions. The parser validates BEGIN/COMMIT
  identities and every controlled INSERT payload; it is not a general-purpose decoding client.
- **SQLite receipts/balance** are independent committed receiver state. **journal_mode=DELETE**
  and **synchronous=FULL** configure its local store. One transaction inserts new identities and
  increments the balance; an existing identity must match its full amount/payload. Only after its
  commit does **pg_logical_slot_get_changes** consume the same events. Peek and get share a captured
  **pg_current_wal_flush_lsn** upper bound, so later commits are outside both calls; the returned
  events must agree. A consuming call also progresses through decoded WAL with no application
  events. Acknowledging only the last application commit can leave later checkpoint history pinned.
  This exercise resumes a finite consumer; earlier delivery lessons examine loss between commits.
- **archive_mode/archive_command** invoke the supplied copy program for completed files. An owned
  destination gate causes real failures in one case. Existing destination contents must match;
  **shutil.copyfile** and a temporary-file rename complete a new copy. **pg_create_restore_point**
  produces WAL that wakes archiving when followed by **pg_switch_wal**. Unlike a logical message,
  that wake record does not appear as an application decoding event.
- **inspect workload|wal|slots|archiver|data|logs|all** supplies the corresponding evidence, not
  a diagnosis. **pg_ls_waldir** plus a24-hex-name filter preserves complete segment names/sizes.
  **pg_replication_slots** reports restart_lsn, confirmed_flush_lsn, active, wal_status and
  safe_wal_size; NULL headroom under unlimited retention does not mean zero remaining capacity.
  **pg_stat_archiver** counters/timestamps and **archive_status/*.ready** distinguish failure
  history from currently pending files. **pg_control_checkpoint** identifies the checkpoint/redo
  position. Data inspection compares source and receiver counts; recovery checks full contents.
  Logs show the last60 lines. All inspection output and collection timestamps remain in JSON.
- After preparation, run **python3 "$INCIDENT" inspect all** for the complete packet, or replace
  all with one of those evidence names. Record your diagnosis, then run exactly one of these
  complete commands: **python3 "$INCIDENT" recover resume**,
  **python3 "$INCIDENT" recover repair-archive**,
  **python3 "$INCIDENT" recover reduce-demand**, or
  **python3 "$INCIDENT" recover discard-reseed**. These are alternative actions, not a sequence
  to paste together. The coaching inspect stage supplies them in separate copyable shell blocks.
- **CHECKPOINT** completes a cleanup opportunity, twice where requested. Segment names can be
  removed or recycled while allocated files remain; file count need not become zero. Compare
  saved before/during/after samples and fresh reads separately. A still-needed slot or archive
  segment can survive a checkpoint beyond the soft8MB target.
- **recover** records the chosen action before changing application/retention state. Choose one
  of **resume**, **repair-archive**, **reduce-demand** or **discard-reseed** after diagnosis. An
  irrelevant action raises an explicit no-remedy-applied error; the server still stops. A completed
  case cannot be recovered again; create a fresh case for another recovery branch.
- **resume** actually decodes and commits missing receiver operations, then acknowledges them.
  **repair-archive** removes only the owned failure gate, waits for backlog completion and checks
  every saved pending file's SHA256. **reduce-demand** changes the next controlled window from
  3,000 to300 operations and measures its actual WAL bytes/rate before delivering those operations.
- **discard-reseed** drops incident_feed, checkpoints and creates a new slot. A real empty decode
  from the new slot and the still-incomplete receiver show the missing tail. With no concurrent
  fixture writer, one SELECT supplies a complete source snapshot; a SQLite transaction replaces
  receipts and the derived balance. This works because the immutable ledger retains every required
  operation. It does not reconstruct deleted event history or replay arbitrary external effects.
- Every successful remedy compares full source/receiver rows, commits one later operation and
  verifies its actual decoded delivery. A redundant receive adds nothing. Archive catch-up and
  checkpoints, with bounded empty decoding calls to acknowledge intervening history, must then
  release old segment names, reduce allocated WAL and return the slot to reserved status.
  source-before.json, source-final.json,
  receiver-before-rows.json, receiver.sqlite and recovery.json preserve the domain evidence.`,
  code: DISK_INCIDENT_CORE,
  expectedResult: code`
Preparation completes300 baseline operations and12,000 later operations, saves the incident
window, prints only the measured symptom and stops. That stage has not recovered the incident.
Request inspection evidence, record a diagnosis, then execute exactly one selected recovery command
from the coaching inspect stage. The initial cause is randomized unless explicitly selected.

For the retained-consumer case, the receiver stays at300 while the source reaches12,300; the
restart anchor remains fixed across checkpoints and retained history exceeds the8MB target despite
healthy archiving. Resume delivers exactly12,000 missing rows. For the archive case, receiver
contents already agree but actual archive failures and pending files persist; repair verifies every
saved pending file hash. For the production case, receiver contents and archiving keep up; compare
the measured300-row baseline with3,000-row windows and the checkpoint/file evidence. The remedy's
300-row window produces fewer actual WAL bytes and a lower observed window rate than those larger
windows. Allocated directory size is not a direct counter of those generated bytes.

After the final new streamed operation, resume/archive outcomes contain12,301 exact rows with
balance226,990,353; reduced demand contains12,601 with balance238,196,703. A redundant receive
adds no effect. In the supplied discard-reseed variation, the new slot initially decodes zero
missing old rows while the receiver is12,000 rows behind. The complete snapshot restores12,300
rows, and later delivery reaches the same12,301-row result as resume. Every successful branch
compares full payloads, releases old WAL filenames, reduces WAL allocation and returns the slot to
reserved status. Actual LSNs, byte counts, timing, archived
file counts and retained pool sizes vary; no production disk-exhaustion forecast is claimed.`,
  systemsLens: code`
Storage growth is the combined result of production, retention obligations and allocation policy.
A remedy must address the observed dependency and its downstream state. Dropping a cursor can
release a resource promise while destroying a consumer's continuation point; a reconstruction is
valid only when the available source still represents every required operation or state. Preserve
incident-time measurements so later recovery activity does not rewrite the causal account.`,
  challenge: code`
Diagnose the selected case before opening fixture.json. Record the two strongest observations,
one alternative they weaken, the chosen action and its consumer consequence. Use the inspect stage
for exact diagnostic/recovery commands. Then run hint2's fresh retained-consumer case changing only
the recovery choice to discard-reseed. Compare the actual gap, reconstructed contents, later tail
and released WAL with a fresh resume case. Explain when an immutable source ledger makes this
reconstruction possible and when a current-state snapshot would lose required historical effects.`,
};
