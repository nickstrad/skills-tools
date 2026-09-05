import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function backupExperiment(repair: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY + `\nrepair = ${repair ? "True" : "False"}\n` +
    code`
import re, hashlib
backup, good, broken = root/'backup',root/'restore-good',root/'restore-missing'
for name in ('pg_basebackup','pg_verifybackup'):
    assert (bindir/name).is_file(), 'Missing server utility: ' + name
targets = []

outcome_query = ("select json_build_object('jobs',(select count(*) from backup_jobs),"
    "'receipts',(select count(*) from backup_receipts),'pairs',count(*),'distinct_ids',count(distinct j.id),"
    "'first',min(j.id),'last',max(j.id),'amount',sum(j.amount),'receipt_amount',sum(r.amount),"
    "'all_correct',bool_and(j.amount=j.id and r.amount=j.id and j.state='done' "
    "and r.request_id='request-'||j.id::text)) from backup_jobs j join backup_receipts r on r.job_id=j.id")
expected = dict(jobs=2000,receipts=2000,pairs=2000,distinct_ids=2000,first=1,last=2000,
    amount=2001000,receipt_amount=2001000,all_correct=True)

constraint_probe = """
do $$ begin
  begin
    insert into backup_jobs values(1,1,'done');
    raise exception 'Primary key failed to reject duplicate';
  exception when unique_violation then null; end;
  begin
    insert into backup_receipts values('duplicate-job',1,1);
    raise exception 'Receipt job uniqueness failed';
  exception when unique_violation then null; end;
  begin
    insert into backup_receipts values('missing-job',999999,1);
    raise exception 'Foreign key failed';
  exception when foreign_key_violation then null; end;
  begin
    update backup_jobs set amount=-1 where id=1;
    raise exception 'Positive amount check failed';
  exception when check_violation then null; end;
end $$;
"""

def emit(label,value):
    print(label + ': ' + json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def own_tree(path):
    if os.geteuid()==0:
        for current, dirs, files in os.walk(path):
            os.chown(current,owner.pw_uid,owner.pw_gid)
            for name in files:
                os.chown(pathlib.Path(current)/name,owner.pw_uid,owner.pw_gid)

def restored_sql(target,query):
    target_env = dict(env,PGHOST=str(target/'socket'))
    result = subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',query],
        env=target_env,text=True,capture_output=True,timeout=10)
    assert result.returncode==0,result.stdout+result.stderr
    return result.stdout.strip()

def prepare(target):
    # A fresh copy, never an in-place change to the verified backup.
    shutil.copytree(backup,target)
    targets.append(target)
    own_tree(target)

def configure(target):
    (target/'socket').mkdir()
    with (target/'postgresql.conf').open('a') as config:
        config.write("\nunix_socket_directories='"+str(target/'socket')+"'\n"
            "archive_mode=off\nrestore_command=''\nprimary_conninfo=''\n")
    own_tree(target)

def verify_domain(target):
    assert restored_sql(target,"show data_directory")==str(target)
    assert restored_sql(target,'select pg_is_in_recovery()')=='f'
    actual = json.loads(restored_sql(target,outcome_query))
    assert actual==expected
    restored_sql(target,constraint_probe)
    assert json.loads(restored_sql(target,outcome_query))==expected
    return actual

def start_target(target,logfile):
    server('pg_ctl','-D',target,'-l',logfile,'-w','-t','20','start',timeout=25)
    assert restored_sql(target,'show data_directory')==str(target)
    wait_for('restored copy out of recovery',lambda: restored_sql(target,'select pg_is_in_recovery()')=='f')

try:
    start()
    assert sql("select count(*) from pg_tablespace where spcname not in ('pg_default','pg_global')")=='0'
    settings = json.loads(sql("select json_object_agg(name,setting) from pg_settings where name in "
        "('server_version','fsync','full_page_writes','synchronous_commit','wal_level','data_checksums')"))
    assert all(settings[k]=='on' for k in ('fsync','full_page_writes','synchronous_commit','data_checksums'))
    sql("create table backup_jobs(id int primary key,amount int not null check(amount>0),state text not null "
        "check(state in ('queued','done')))")
    sql("create table backup_receipts(request_id text primary key,job_id int unique not null references "
        "backup_jobs(id),amount int not null check(amount>0))")
    sql("insert into backup_jobs select g,g,'done' from generate_series(1,2000) g")
    sql("insert into backup_receipts select 'request-'||id,id,amount from backup_jobs")
    assert json.loads(sql(outcome_query))==expected
    backup_run = subprocess.run(prefix+[str(bindir/'pg_basebackup'),'-D',str(backup),'-c','fast','-X','stream',
        '--manifest-checksums=SHA256','-v'],env=env,text=True,capture_output=True,timeout=60)
    (root/'basebackup.log').write_text(backup_run.stdout+backup_run.stderr)
    assert backup_run.returncode==0,backup_run.stdout+backup_run.stderr
    assert not (backup/'postmaster.pid').exists() and not (backup/'standby.signal').exists()
    verification = server('pg_verifybackup',backup,timeout=60)
    assert 'backup successfully verified' in verification
    (root/'verify-backup.log').write_text(verification)
    label = (backup/'backup_label').read_text()
    manifest = json.loads((backup/'backup_manifest').read_text())
    required = re.search(r'START WAL LOCATION: .*?\(file (\w+)\)',label).group(1)
    required_hash = hashlib.sha256((backup/'pg_wal'/required).read_bytes()).hexdigest()
    emit('backup_evidence',dict(settings=settings,label=label,wal_ranges=manifest['WAL-Ranges'],
        required_segment=required,required_sha256=required_hash,verification=verification,expected=expected))
    # A later committed change must not appear in the restored backup.
    sql("begin; update backup_jobs set amount=amount+100 where id=1; "
        "update backup_receipts set amount=amount+100 where job_id=1; commit")
    changed = json.loads(sql(outcome_query))
    assert changed['amount']==2001100 and changed['receipt_amount']==2001100 and not changed['all_correct']
    stop()
    assert not (data/'postmaster.pid').exists()
    emit('source_stopped',dict(after_backup_outcome=changed,source_running=False))

    # Manifest verification precedes any restore-specific config edits.
    prepare(good)
    configure(good)
    began = time.monotonic()
    start_target(good,root/'good-recovery.log')
    client_ms = 1000*(time.monotonic()-began)
    actual = verify_domain(good)
    domain_ms = 1000*(time.monotonic()-began)
    good_log = (root/'good-recovery.log').read_text()
    for marker in ('starting backup recovery','completed backup recovery','redo starts at','redo done at','ready to accept connections'):
        assert marker in good_log, 'Missing backup restore evidence: '+marker
    emit('independent_restore',dict(outcome=actual,constraints=['primary_key','unique_job','foreign_key','positive_amount'],
        client_ready_ms=round(client_ms,2),domain_verified_ms=round(domain_ms,2),source_running=False))
    server('pg_ctl','-D',good,'-m','fast','-w','-t','20','stop',timeout=25)

    prepare(broken)
    (broken/'pg_wal'/required).unlink()
    # Keep backup_label: removing it would hide the recovery contract rather than repair it.
    assert (broken/'backup_label').read_text()==label
    failed_verify = subprocess.run(prefix+[str(bindir/'pg_verifybackup'),str(broken)],env=env,
        text=True,capture_output=True,timeout=30)
    (root/'verify-missing.log').write_text(failed_verify.stdout+failed_verify.stderr)
    verification_error = failed_verify.stdout+failed_verify.stderr
    no_wal = not any(re.fullmatch(r'[0-9A-F]{24}',p.name) for p in (broken/'pg_wal').iterdir())
    assert failed_verify.returncode!=0 and 'WAL parsing failed' in verification_error
    assert required in verification_error or (no_wal and 'could not find any WAL file' in verification_error)
    configure(broken)
    failed_began = time.monotonic()
    failed = subprocess.run(prefix+[str(bindir/'pg_ctl'),'-D',str(broken),'-l',str(root/'missing-recovery.log'),
        '-w','-t','10','start'],env=env,text=True,capture_output=True,timeout=15)
    failed_ms = 1000*(time.monotonic()-failed_began)
    missing_log = (root/'missing-recovery.log').read_text()
    assert failed.returncode!=0 and 'FATAL:  could not locate required checkpoint record' in missing_log
    assert 'ready to accept connections' not in missing_log
    assert not (broken/'postmaster.pid').exists()
    emit('missing_wal_failure',dict(removed=required,verification_exit=failed_verify.returncode,verification_error=verification_error,
        startup_exit=failed.returncode,failure='could not locate required checkpoint record',
        elapsed_ms=round(failed_ms,2),server_stopped=True))

    if repair:
        archive = root/'repair-archive'
        archive.mkdir()
        shutil.copy2(backup/'pg_wal'/required,archive/required)
        own_tree(archive)
        restore_script = root/'restore.py'
        restore_script.write_text("import pathlib,shutil,sys\nsource=pathlib.Path("+repr(str(archive))+")/sys.argv[1]\n"
            "if not source.is_file(): sys.exit(1)\nshutil.copyfile(source,sys.argv[2])\n")
        restore_script.chmod(0o644)
        with (broken/'postgresql.conf').open('a') as config:
            config.write("\nrestore_command='python3 "+str(restore_script)+" %f %p'\n")
        (broken/'recovery.signal').touch()
        own_tree(broken)
        assert hashlib.sha256((archive/required).read_bytes()).hexdigest()==required_hash
        offset = (root/'missing-recovery.log').stat().st_size
        start_target(broken,root/'missing-recovery.log')
        repaired = verify_domain(broken)
        repair_log = (root/'missing-recovery.log').read_bytes()[offset:].decode()
        assert 'restored log file "'+required+'" from archive' in repair_log
        assert 'completed backup recovery' in repair_log and 'ready to accept connections' in repair_log
        (root/'repair-recovery.log').write_text(repair_log)
        emit('history_repaired',dict(outcome=repaired,required_sha256=required_hash,
            timeline=restored_sql(broken,'select timeline_id from pg_control_checkpoint()'),source_running=False))
    # Prove the retained original remains usable; restore operations touched copies only.
    assert hashlib.sha256((backup/'pg_wal'/required).read_bytes()).hexdigest()==required_hash
    assert 'backup successfully verified' in server('pg_verifybackup',backup,timeout=60)
    print('PASS: actual verified backup, independent correct restore, constraint probes and classified missing-WAL startup failure.',flush=True)
finally:
    try:
        for target in targets:
            if (target/'postmaster.pid').exists():
                server('pg_ctl','-D',target,'-m','fast','-w','-t','20','stop',timeout=25)
    finally:
        stop()
    print('Owned source/restores stopped; retained pristine backup and evidence at',root,flush=True)
PY`;
}

export const BACKUP_VARIATION = backupExperiment(true);
export const BACKUP_WORKLOAD: Draft = {
  slug: "base-backup",
  revision: 4,
  tags: ["backup", "checkpoints", "wal", "durability"],
  title: "Prove a backup restores, then remove required history",
  difficulty: "advanced",
  safetyLevel: "dangerous",
  runIn: "shell",
  estimatedMinutes: 30,
  prerequisites: ["checkpoint-anatomy", "wal-files-and-recycling"],
  overview: code`
Create and verify a real physical backup of jobs and their completion receipts. Stop its owned
source, restore independently and check every result plus actual constraint enforcement. Then remove
required WAL from a second disposable copy and require a classified startup failure, preserving the
intact backup as evidence. A backup command's success and recoverability are separate claims.`,
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
  caution: code`
Use Python3 and matching PostgreSQL16 pg_basebackup, pg_verifybackup and server binaries; PGBIN may
select the directory. The script creates only owned /tmp/pg-owned-* source/backup/restore paths,
disables TCP and uses distinct private sockets. It ignores existing PG/PGLAB settings; root uses
runuser with the postgres OS owner. It deliberately removes one WAL file from a new restore copy,
never from the source or pristine backup. All servers stop in finally, and evidence is retained.
Allow a few hundred MB of free local space. Same-disk copies and a stopped source test independent
restoration, not host-loss durability. No existing backup is overwritten and no backup_label is
removed to bypass a failed restore.`,
  syntaxBreakdown: code`
### In plain terms

A physical backup needs its required WAL to become a usable database. File verification is valuable,
but we also start the copy with the source offline and verify its application state. The missing-WAL
copy must fail; the supplied variation repairs that missing history through a private archive.

### What you are learning

- **Backup contract:** copied files, backup metadata and required WAL work together.
- **Independent recovery:** restored answers must come from the copy, without source connectivity.
- **Domain verification:** counts, individual values, relationships and constraint enforcement matter.
- **Missing history:** a manifest failure and an actual startup failure are distinct evidence.

### Piece by piece

- **python3** executes the supplied script. **PGBIN** or **pg_config --bindir** locates matching
  utilities, **tempfile.mkdtemp** owns a new directory, and **runuser -u ... -- / os.chown** supply
  the postgres OS owner when invoked as root. Other users run directly.
- **initdb -D ... -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** creates the private cluster with local trust behind its protected directory,
  rejected host authentication, fixed locale, checksums and1MB WAL segments. TCP listening is off.
  **fsync/full_page_writes/synchronous_commit** remain on; **wal_level=replica** permits backup WAL
  streaming. **pg_settings** checks actual protection settings; no custom tablespaces are allowed.
- **pg_ctl -D ... -l ... -w -t20 start/stop** bounds lifecycle and saves logs. **-m fast** stops
  cleanly. **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup customization, returns plain tuples
  and fails on SQL errors. Cleared inherited PG variables plus **PGCONNECT_TIMEOUT**,
  **statement_timeout** and **lock_timeout** bound and isolate connections.
- **CREATE TABLE** creates2,000 jobs and receipts. Primary keys reject duplicate identities;
  **UNIQUE(job_id)** permits only one receipt per job, **REFERENCES** enforces existing jobs,
  **CHECK** restricts positive amounts and job state, and **NOT NULL** forbids missing values.
  **generate_series**, text concatenation and **INSERT SELECT** supply the exact matching fixtures.
- **pg_basebackup -D ... -c fast -X stream --manifest-checksums=SHA256 -v** writes a fresh plain
  backup, requests the initial fast checkpoint, streams required WAL on a second replication
  connection, records SHA-256 file checksums and retains verbose progress. **subprocess.run** saves
  both output streams with a60-second bound. Default backup syncing is retained.
- **pg_verifybackup DIR** verifies the intact backup and required WAL range before restore-specific
  configuration edits. **backup_manifest** supplies **WAL-Ranges** with start/end LSNs and timeline;
  **backup_label** supplies the start WAL filename and checkpoint location. The label does not
  itself contain the backup end LSN. **hashlib.sha256** records the required segment's bytes.
- A later **BEGIN/UPDATE/COMMIT** adds100 to job1 and its receipt on the source. Its total becomes
 2,001,100, while the backup still represents2,001,000. The source is stopped before either copy
  starts; absence of **postmaster.pid** verifies its stopped state.
- **shutil.copytree/copy2** creates independent restore inputs, preserving the pristine backup.
  Each gets its own **unix_socket_directories**. **archive_mode=off**, empty **restore_command** and
  empty **primary_conninfo** keep the core independent of archive and streaming sources. **own_tree**
  transfers copied file ownership only when root. **restored_sql** selects each owned socket, and
  **SHOW data_directory** proves which copy answered. **pg_ctl -w** can return at read-only
  readiness during archive recovery; a bounded **pg_is_in_recovery=false** poll additionally requires
  completed recovery before the write/constraint probes.
- **count**, **count(distinct id)**, **min/max**, **sum**, **bool_and** and the job/receipt join check
  all2,000 matching identities, totals, state and individual values. Separate table counts ensure
  the join cannot hide extra unpaired rows. **pg_is_in_recovery** must be false before acceptance.
- **DO** blocks attempt duplicate job/receipt identities, a missing foreign key and a negative
  amount. Each nested block catches only its expected **unique_violation**, **foreign_key_violation**
  or **check_violation**; unexpected success raises a different error. Subtransactions roll back
  each rejected attempt, then the full outcome is checked again.
- **time.monotonic** samples startup through a working SQL query, then through complete domain
  and constraint checks. These include helper and local-cache costs, not a production RTO.
  Fresh **good-recovery.log** must show backup recovery start/completion, redo and readiness.
- **Path.unlink** removes only the selected required segment from restore-missing. Its label stays
  unchanged. **pg_verifybackup** must fail its WAL parsing, naming the missing file or reporting no WAL
  files when the removed segment was the only one. **pg_ctl -w -t10 start** must return
  failure within the subprocess bound, with the actual **could not locate required checkpoint
  record** fatal message, no ready line and no live PID file. An arbitrary error is not accepted.
- In the variation, **shutil.copy2** supplies the byte-verified segment to **repair-archive**.
  **restore_command** calls the supplied Python copy program with **%f** (requested filename) and
  **%p** (destination). Missing archive names return exit1; the required file is copied.
  **recovery.signal** requests archive recovery. Only newly appended log bytes may prove repair;
  the actual restored-from-archive line and full domain/constraint checks must pass with source off.
- **json_build_object**, **json_object_agg**, **json.loads/dumps** retain structured evidence.
  The original segment hash and a final **pg_verifybackup** prove the pristine input remains intact.
  Nested finally stops all owned restore and source processes while preserving files for inspection.`,
  code: backupExperiment(false),
  expectedResult: code`
The intact backup passes pg_verifybackup and retains backup_label, manifest WAL ranges and the
required segment hash. Source job/receipt totals change to2,001,100 after backup; the source then
stops. The independently started copy has2,000 jobs and2,000 matching receipts, IDs1–2,000, both
totals2,001,000, all correct individual amounts/request IDs and done states. Duplicate identities,
a receipt for a nonexistent job and a negative amount are rejected without changing those answers.
The fresh log reports completed backup recovery and readiness.

Removing the label's required starting segment from another copy causes pg_verifybackup to report
missing WAL, then actual startup fails with could not locate required checkpoint record. No ready
line or live PID remains. This is an expected, specifically classified failure; the intact backup
still verifies. All source/restore servers stop, and raw evidence remains at the printed path.

The variation additionally serves the missing byte-identical segment through a private restore
command, requires a restored-from-archive log line, and verifies the same correct rows/constraints.
The source remains stopped. Exact LSNs, filenames, copy sizes, timeline after archive recovery and
sampled timings vary; a local repair does not establish independent-host archive durability.`,
  systemsLens: code`
A backup promise depends on a recoverable starting state plus every required piece of history.
A file manifest can detect missing or changed inputs, but actual recovery and application assertions
cross additional boundaries. Removing recovery metadata to make startup proceed destroys the test;
supplying verified missing history preserves the recovery contract.

Physical backup consistency does not mean an instantaneous application snapshot was copied. The
backup protocol and WAL establish a recoverable state. Recovery from later operator mistakes requires
a chosen historical target and retained subsequent WAL, which the next lesson must exercise.`,
  challenge: code`
After reproducing the missing-WAL failure, supply that exact segment from the pristine backup
through an owned archive restore command. Predict which failure should disappear and which row
values should remain. Run the complete pgcoach hint2 variation; require actual archive retrieval,
completed backup recovery and unchanged domain/constraint assertions with the source offline.`,
};
