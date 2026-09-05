import { code, type Draft } from "../../../src/types.ts";

// The standalone controller supports symptom-first investigation with no live waiting server.
export const CORRUPTION_PROGRAM = code`
import fcntl, hashlib, json, os, pathlib, pwd, shutil, subprocess, sys, tempfile, time

phase = sys.argv[1]
assert phase in ('prepare', 'inspect', 'recover', 'cleanup')
if phase == 'prepare':
    boundary = sys.argv[2] if len(sys.argv) > 2 else 'early'
    assert boundary in ('early', 'late')
    assert shutil.disk_usage('/tmp').free > 2*1024**3, 'Keep at least 2GB free before this fixture'
    root = pathlib.Path(tempfile.mkdtemp(prefix='pg-owned-', dir='/tmp'))
    owner = pwd.getpwnam('postgres') if os.geteuid() == 0 else pwd.getpwuid(os.geteuid())
    if os.geteuid() == 0:
        os.chown(root, owner.pw_uid, owner.pw_gid)
    program = root/'corruption.py'
    program.write_text(pathlib.Path(__file__).read_text())
    pathlib.Path(str(__file__)+'.location').write_text(str(program))
    config = dict(root=str(root), owner=owner.pw_name, boundary=boundary,
        bindir=os.environ.get('PGBIN') or subprocess.check_output(['pg_config','--bindir'],text=True).strip())
    (root/'fixture.json').write_text(json.dumps(config))
else:
    root = pathlib.Path(__file__).resolve().parent
    config = json.loads((root/'fixture.json').read_text())
    assert str(root) == config['root'] and root.name.startswith('pg-owned-') and root.parent == pathlib.Path('/tmp')
    owner = pwd.getpwnam(config['owner'])
lock = (root/'phase.lock').open('w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
bindir = pathlib.Path(config['bindir'])
prefix = ['runuser','-u',owner.pw_name,'--'] if os.geteuid() == 0 else []
data, backup, restored, sock = root/'data', root/'backup', root/'restored', root/'socket'
env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST=str(sock), PGPORT='6543', PGUSER='postgres', PGDATABASE='postgres',
    PGCONNECT_TIMEOUT='3', PGOPTIONS='-c statement_timeout=10000 -c lock_timeout=1000', LC_ALL='C')

def run(args, expected=0):
    p = subprocess.run(args,env=env,capture_output=True,text=True,timeout=30)
    assert p.returncode == expected, p.stdout+p.stderr
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

def stopped(folder):
    assert not (folder/'postmaster.pid').exists(),str(folder)
    run(prefix+[str(bindir/'pg_ctl'),'-D',str(folder),'status'],3)

def stop(folder):
    if folder.exists() and (folder/'postmaster.pid').exists():
        utility('pg_ctl','-D',folder,'-m','fast','-w','-t','20','stop')
    if folder.exists():
        stopped(folder)

def start(folder):
    stopped(folder)
    utility('pg_ctl','-D',folder,'-l',root/(folder.name+'.log'),'-w','-t','20','start')
    assert sql('show data_directory') == str(folder)

def inventory(folder):
    result = {}
    for p in sorted(folder.rglob('*')):
        assert not p.is_symlink(),str(p)
        if p.is_file():
            result[str(p.relative_to(folder))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return result

def copy_verified(source,target):
    stopped(source)
    before = inventory(source)
    shutil.copytree(source,target)
    if os.geteuid() == 0:
        for p in [target,*target.rglob('*')]:
            os.chown(p,owner.pw_uid,owner.pw_gid)
    assert inventory(target) == before == inventory(source)
    return before

def checksums(folder,label,bad=False):
    stopped(folder)
    p = run(prefix+[str(bindir/'pg_checksums'),'--check','-D',str(folder)],1 if bad else 0)
    text = p.stdout+p.stderr
    (root/(label+'.log')).write_text(text)
    assert ('Bad checksums:  1' if bad else 'Bad checksums:  0') in text,text
    return dict(exit=p.returncode,output=text)

def rows():
    return json.loads(sql("select coalesce(json_agg(r order by id),'[]') from operations r"))

def expected(first,last):
    return [dict(id=i,amount=7*i,payload=''.join(hashlib.md5(f'{i}:{j}'.encode()).hexdigest() for j in range(1,17))) for i in range(first,last+1)]

def insert(first,last):
    sql("insert into operations select i,7*i,(select string_agg(md5(i::text||':'||j::text),'' order by j) "
        "from generate_series(1,16) j) from generate_series("+str(first)+','+str(last)+') i')

def take_backup():
    baseline = rows()
    assert baseline == expected(1,500 if config['boundary']=='early' else 510)
    save('backup-operations',baseline)
    stop(data)
    save('backup-files',copy_verified(data,backup))
    checksums(backup,'backup-checksums')
    start(data)

if phase == 'cleanup':
    for folder in (data,backup,restored):
        if folder.exists():stopped(folder)
    shutil.rmtree(root)
    print('Removed only the owned fixture:',root)
    sys.exit(0)

try:
    if phase == 'prepare':
        sock.mkdir()
        if os.geteuid() == 0:os.chown(sock,owner.pw_uid,owner.pw_gid)
        utility('initdb','-D',data,'-U','postgres','--auth-local=trust','--auth-host=reject',
            '--no-locale','--data-checksums','--wal-segsize=1')
        with (data/'postgresql.conf').open('a') as f:
            f.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='"+str(sock)+"'\n"
                "shared_buffers='16MB'\nmax_connections=10\nautovacuum=off\narchive_mode=off\n"
                "min_wal_size='2MB'\nmax_wal_size='8MB'\ncheckpoint_timeout='1h'\n"
                "fsync=on\nsynchronous_commit=on\nfull_page_writes=on\nlogging_collector=off\n")
        start(data)
        assert sql('show data_checksums') == 'on'
        assert sql('show block_size') == '8192'
        sql('create table operations(id int primary key,amount int not null,payload text not null)')
        insert(1,500)
        if config['boundary']=='early':take_backup()
        insert(501,510)
        if config['boundary']=='late':take_backup()
        accepted = rows()
        assert accepted == expected(1,510)
        save('accepted-operations',accepted)
        relpath = sql("select pg_relation_filepath('operations')")
        assert pathlib.PurePosixPath(relpath).parts[0]=='base' and '..' not in pathlib.PurePosixPath(relpath).parts
        block = 3
        on_page = json.loads(sql("select json_agg(id order by id) from operations where (ctid::text::point)[0]=3"))
        assert on_page
        stop(data)
        checksums(data,'source-clean-checksums')
        relation = data/relpath
        original_file = relation.read_bytes()
        page = original_file[block*8192:(block+1)*8192]
        marker = accepted[on_page[0]-1]['payload'][:64].encode()
        position = page.find(marker)
        assert position >= 24
        offset = block*8192+position+17
        damaged_file = bytearray(original_file)
        damaged_file[offset] ^= 1
        assert sum(a!=b for a,b in zip(original_file,damaged_file)) == 1
        (root/'original-page.bin').write_bytes(page)
        (root/'damaged-page.bin').write_bytes(damaged_file[block*8192:(block+1)*8192])
        with relation.open('r+b') as f:
            f.seek(offset);f.write(damaged_file[offset:offset+1]);f.flush();os.fsync(f.fileno())
        assert relation.read_bytes() == damaged_file
        save('damage',dict(relation=relpath,block=block,byte_offset=offset,rows_on_page=on_page,
            original_sha256=hashlib.sha256(original_file).hexdigest(),damaged_sha256=hashlib.sha256(damaged_file).hexdigest(),changed_bytes=1))
        offline = checksums(data,'damaged-checksums',True)
        start(data)
        query = "select sum(amount),string_agg(payload,',' order by id) from operations"
        failure = run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',query],1)
        assert 'invalid page in block 3' in failure.stderr and 'XX001' in failure.stderr,failure.stderr
        (root/'read-failure.log').write_text(failure.stdout+failure.stderr)
        stop(data)
        assert relation.read_bytes() == damaged_file
        symptom = save('symptom',dict(query=query,client_exit=failure.returncode,error=failure.stderr,
            instruction='Investigate the failed read, backup boundary and accepted operation inventory before choosing recovery.'))
        print(json.dumps(symptom,indent=2))
    elif phase == 'inspect':
        area = sys.argv[2] if len(sys.argv)>2 else 'all'
        assert area in ('all','read','checksums','backup','operations','damage')
        for folder in (data,backup,restored):
            if folder.exists():stopped(folder)
        values = dict(read=read('symptom'),checksums=(root/'damaged-checksums.log').read_text(),
            backup=dict(operations=read('backup-operations'),file_count=len(read('backup-files')),
                checksums=(root/'backup-checksums.log').read_text()),
            operations=read('accepted-operations'),damage=read('damage'))
        evidence = values if area=='all' else values[area]
        save('inspection-'+area,evidence)
        print(json.dumps(evidence,indent=2))
    else:
        action = sys.argv[2]
        assert action=='restore', 'Choose the supplied restore action; this fixture offers no in-place salvage'
        assert not restored.exists(), 'Restore already attempted; preserve its evidence and prepare a fresh case'
        for folder in (data,backup):stopped(folder)
        save('decision',dict(action=action,chosen_at=time.time()))
        assert inventory(backup)==read('backup-files')
        damage = read('damage')
        damaged_hash = hashlib.sha256((data/damage['relation']).read_bytes()).hexdigest()
        assert damaged_hash==damage['damaged_sha256']
        copy_started = time.monotonic()
        save('restored-copy-files',copy_verified(backup,restored))
        copy_seconds = time.monotonic()-copy_started
        checksums(restored,'restored-before-checksums')
        started = time.monotonic()
        start(restored)
        recovered = rows()
        target = read('backup-operations')
        assert recovered==target
        accepted = read('accepted-operations')
        missing = [r for r in accepted if r['id'] not in {x['id'] for x in recovered}]
        assert missing == (expected(501,510) if config['boundary']=='early' else [])
        save('restored-operations',recovered)
        save('lost-accepted-operations',missing)
        startup_and_inventory_seconds = time.monotonic()-started
        insert(511,511)
        final = rows()
        assert final==target+expected(511,511)
        save('restored-final-operations',final)
        stop(restored)
        checksums(restored,'restored-final-checksums')
        assert inventory(backup)==read('backup-files')
        assert hashlib.sha256((data/damage['relation']).read_bytes()).hexdigest()==damaged_hash
        result = save('recovery',dict(action=action,backup_rows=len(target),accepted_rows=len(accepted),
            recovered_rows=len(recovered),lost_accepted_ids=[r['id'] for r in missing],
            final_rows=len(final),final_amount=sum(r['amount'] for r in final),later_id=511,
            copy_seconds=copy_seconds,startup_and_inventory_seconds=startup_and_inventory_seconds,
            original_damage_preserved=True,backup_unchanged=True,
            limit='Cold-backup recovery point only; later accepted operations absent from the backup are not replayed.'))
        print(json.dumps(result,indent=2))
        print('Verified the restored boundary, explicit accepted-operation loss and later writable operation.')
finally:
    for folder in (data,restored):stop(folder)
    print('Owned servers stopped. Controller and evidence:',root/'corruption.py',flush=True)
    print('After recording your findings, release this fixture: python3 "'+str(root/'corruption.py')+'" cleanup',flush=True)
`;

export function corruptionSetup(boundary = "early"): string {
  return code`set -eu
CORRUPTION_BOOTSTRAP=$(mktemp /tmp/pg-corruption-XXXXXX.py)
cat > "$CORRUPTION_BOOTSTRAP" <<'PY'
` + CORRUPTION_PROGRAM + '\nPY\npython3 "$CORRUPTION_BOOTSTRAP" prepare ' + boundary + code`
CORRUPTION=$(cat "$CORRUPTION_BOOTSTRAP.location")
# In a new shell, set CORRUPTION to the printed absolute corruption.py path.
`;
}

export const CORRUPTION_CORE = corruptionSetup();
export const CORRUPTION_VARIATION = corruptionSetup("late") + code`
python3 "$CORRUPTION" inspect all
python3 "$CORRUPTION" recover restore
`;

export const CORRUPTION_INCIDENT: Draft = {
  slug: "corrupt-a-page-and-detect-it",
  revision: 4,
  title: "Incident: recover a failed read and account for accepted operations",
  tags: ["checksums", "corruption", "pages-and-tuples", "incident", "backup"],
  difficulty: "advanced",
  safetyLevel: "dangerous",
  runIn: "shell",
  estimatedMinutes: 45,
  prerequisites: [
    "table-is-a-file",
    "visibility-map-and-index-only-scans",
    "point-in-time-recovery",
  ],
  reading: code`PostgreSQL 14 Internals, Chapter 11 "WAL Modes" (section "Fault Tolerance")`,
  readingNotes: code`
Chapter 11 explains page checksums, corruption detection and protection against non-atomic writes.
Read its Fault Tolerance section after the initial diagnosis. This experiment changes one payload
byte while preserving the page structure, then verifies detection offline and through a real heap
read. The separate cold-backup restore and complete operation reconciliation go beyond the book;
use the earlier recovery lessons to compare this bounded recovery point with base-backup/WAL replay.`,
  overview: code`
A previously successful application read now fails. Investigate the actual error, the available
backup and the accepted operation inventory before choosing recovery. Restore into a separate
owned destination, prove every recovered identity and payload, and report any accepted work missing
at that recovery point. The tutor can prepare the symptom privately; full construction remains
available at run/full. Preparation alone does not complete the incident.`,
  caution: code`
Run the supplied shell only with Python3 and PostgreSQL16 server tools. It creates a private
/tmp/pg-owned-* fixture with TCP disabled and clears inherited PG connection settings. Root uses
the postgres OS account; another user uses their own account. PGBIN can select matching binaries.
The fixture deliberately changes one byte in its own stopped data file; never substitute the learner
lab or another directory. Its primary/backup/restore copies need roughly100MB at peak; keep at least
2GB free. Every phase finishes with stopped servers, and a file lock rejects simultaneous phases.
Keep the printed corruption.py path. After recording the evidence, run its supplied cleanup action;
it verifies stopped state and removes only this fixture. Save needed findings before cleanup.
This local backup proves the tested recovery boundary, not independent-host durability.`,
  syntaxBreakdown: code`
### In plain terms

A database that opens and a backup whose checksums pass still need an application-level recovery
check. Compare the failed read with the available recovery point, restore into another directory,
and reconcile every accepted operation. The supplied inventory lets you account for missing work
without guessing from a row count. Checksums detect altered page bytes; they neither identify the
physical cause of damage nor reconstruct accepted operations absent from a backup.

### What you are learning

- **Detection and scope:** preserve the actual read error, offline checksum result, affected page
  and original bytes before attempting recovery.
- **Recovery point:** the backup boundary determines which committed identities can be restored
  when no later WAL is supplied. Later acknowledgements do not move that boundary retroactively.
- **Application recovery:** full identities, amounts and payloads must agree with the chosen
  inventory; a later write verifies usable behavior beyond successful startup.
- **Evidence lifecycle:** keep the damaged source and backup unchanged during restoration, then
  release owned resources after recording the evidence you need.

### Piece by piece

- **set -eu**, **mktemp**, the quoted **cat <<'PY'** heredoc and **python3** write and run the
  supplied controller literally. CORRUPTION_BOOTSTRAP.location records its owned path;
  **CORRUPTION** keeps it in this shell. Assign the printed absolute path in a new shell.
- **prepare early|late** selects the backup boundary. Early is the core; late changes only when
  the same complete backup is taken relative to ten committed operations. **tempfile.mkdtemp**
  creates the unique root. **shutil.disk_usage** checks2GB headroom before allocation; budget the
  roughly100MB primary/backup/restore peak too. fixture.json exposes construction on request.
- **pwd**, **os.chown** and **runuser -u ... --** select the OS owner. **PGBIN / pg_config --bindir**
  locates binaries. **fcntl.flock(LOCK_EX|LOCK_NB)** holds an exclusive nonblocking phase lock
  for the controller's lifetime, rejecting overlapping commands against the same fixture.
- **initdb -D ... -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** creates the owned cluster: -D chooses its directory, -U its database role,
  local trust is confined to the private socket directory, host authentication is rejected,
  locale is fixed, checksums are enabled and WAL segments are1MB. **listen_addresses=''**
  disables TCP; **unix_socket_directories/PGHOST** and **port/PGPORT** select that private endpoint.
- **PGUSER/PGDATABASE**, **PGCONNECT_TIMEOUT=3**, **PGOPTIONS** and **LC_ALL=C** fix the connection,
  bound connection attempts and SQL/lock waits, and make diagnostics reproducible. Inherited PG
  variables are cleared. **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, prints
  unaligned tuples, fails on SQL errors and executes the supplied statement. Python's30s
  subprocess timeout bounds utility calls; SQL has10s statement and1s lock timeouts.
- **shared_buffers=16MB**, **max_connections=10**, **min_wal_size=2MB/max_wal_size=8MB** and
  **checkpoint_timeout=1h** bound this fixture. **autovacuum=off/archive_mode=off** remove
  unrelated maintenance and later archive replay. **fsync/synchronous_commit/full_page_writes=on**
  retain ordinary local durability. **logging_collector=off** keeps each pg_ctl log in the root.
- **pg_ctl -D ... -l ... -w -t20 start** selects one owned directory/log and waits up to20s;
  **show data_directory** checks the actual server. **-m fast ... stop** aborts open transactions
  and stops it normally. **status** must exit3 and postmaster.pid must be absent before offline
  work. The controller's finally block stops both possible servers, including on failure.
- **operations(id primary key, amount, payload)** is the immutable accepted-work ledger.
  **generate_series** creates IDs1–500 then501–510; amount is7*id. Ordered
  **string_agg(md5(...))** supplies an exact512-character payload per ID. Each INSERT commits
  before its accepted inventory is recorded. Python independently reconstructs all expected rows.
- **json_agg(... order by id)** captures complete ordered inventories, not just counts.
  **take_backup** queries the boundary inventory, stops the source, and uses **shutil.copytree**
  to copy the entire cleanly stopped cluster including WAL and transaction status. SHA256
  inventories compare every regular file in source and backup; symlinks are refused. The source
  restarts only after that complete copy. This is a cold filesystem backup, not a table-file copy,
  online backup, pg_basebackup manifest or PITR restore.
- **pg_checksums --check -D** scans the stopped cluster. Exit0 and zero bad checksums establish
  the clean backup/source samples. The supplied damaged case must exit1 with exactly one bad
  checksum. The command checks page integrity rather than business completeness or repair.
- **pg_relation_filepath('operations')** identifies the fixture's actual heap file. **ctid**
  records physical tuple addresses; **(ctid::text::point)[0]=3** inventories the IDs in block3.
  The fixture uses8KB pages and checks the target payload is beyond the24-byte page header.
  Python locates a known payload sequence in that page and flips exactly one byte with XOR1.
  **seek/write/flush/os.fsync** persist only that byte while the server is stopped; a full-file
  comparison proves no other byte changed. original-page.bin, damaged-page.bin and damage.json
  retain the before-image, damage and complete file hashes.
- The real application **sum(amount), string_agg(payload,... order by id)** reads the heap and
  fails on the damaged block. **VERBOSITY=verbose** includes SQLSTATEXX001 in the psql diagnostic.
  The error and offline scan identify a bad page in this fixture. Structurally invalid pages may
  also fail without checksums; a failed checksum does not identify which hardware/software caused it.
- **inspect read|checksums|backup|operations|damage|all** reads the saved evidence with servers
  stopped. Backup inspection includes its full operation inventory and checksum log; operations
  exposes all510 accepted rows. Use the evidence to predict which IDs a restore can recover.
  Full inventories remain available even when you choose a smaller first inspection packet.
- Run **python3 "$CORRUPTION" recover restore** after recording your diagnosis and recovery
  point. The action is recorded before copying; another action is rejected. **copy_verified**
  checks that the backup is still unchanged and copies it into a separate **restored** directory.
  A previous restore attempt is preserved rather than overwritten. A pre-start checksum check,
  actual startup and full SQL inventory comparison establish the restored state.
- **lost-accepted-operations.json** contains complete accepted records absent from that recovery
  point. The controller does not silently replay them from the saved inventory. It then commits
  a new operation511 and checks all restored rows plus that exact later row and the derived amount.
  ID511 avoids reusing an accepted identity missing from an early backup. A final stopped checksum
  scan is clean; the damaged source file and backup hashes must remain unchanged.
- **copy_seconds** measures the verified restore-copy call;
  **startup_and_inventory_seconds** measures startup and full domain inventory checks. Neither is
  a production RTO. They exclude diagnosis time and distinguish copy work from usable-state checks.
- **python3 "$CORRUPTION" cleanup** verifies all owned directories are stopped, then removes the
  whole fixture. Record diagnosis, full outcomes and selected hashes first. This cleanup step is
  explicit so independent investigation is possible without leaving a server running or retaining
  raw100MB fixtures indefinitely.`,
  code: CORRUPTION_CORE,
  expectedResult: code`
Preparation prints the actual heap-read failure: SQLSTATEXX001, page verification failure and an
invalid page in block3. The offline scan reports exactly one bad checksum; clean source/backup
scans report zero. It saves evidence and stops; recovery has not happened yet. The fixture changed
one payload byte while preserving the header and every other byte of the identified relation file.

After inspection and the explicit restore action, the early-backup core recovers all500 exact
baseline operations but lacks accepted IDs501–510. Those ten complete missing records are reported;
no later WAL is supplied and no inventory row is used as an unacknowledged repair. A new operation511
commits, leaving501 rows and total amount880,327. The late-backup variation recovers all510 accepted
operations, reports no missing IDs, then reaches511 rows and total915,712 after the same new write.

Both paths prove complete backup inventory agreement, clean restored checksums, unchanged original
backup hashes and preserved damaged-source file bytes. Actual paths, checksum values, affected-row
IDs within block3 and timings are measured rather than fixed expectations. Report the known loss
before calling the chosen recovery point acceptable; a clean restore alone does not imply no loss.`,
  systemsLens: code`
Recovery is an agreement between a retained history boundary and an application's accepted work.
Integrity checks detect some physical faults, while identity and payload reconciliation determine
whether the reconstructed state preserves the required meaning. A usable older state may be the
best available recovery point, but its loss must be explicit. Keep original evidence unchanged
until the recovery decision is checked, then release resources with a recorded retention purpose.`,
  challenge: code`
Record your first two inspection choices, diagnosis, chosen backup boundary and the full accepted
IDs you predict will be absent after restore. Run the supplied recovery and compare the actual
inventory. Use hint2's fresh late-backup variation to change only that boundary. Explain which
additional retained history would be needed to recover the ten later core operations, and why
checksums, successful startup or a readable index cannot establish that those operations survived.
After recording your conclusions, run cleanup for each owned fixture.`,
};
