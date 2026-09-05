import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function pitrExperiment(laterFirst: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\nselected_target = '${laterFirst ? "after_cleanup" : "before_cleanup"}'\n` + code`
import re, hashlib
archive, backup = root/'archive',root/'backup'
archive.mkdir()
if os.geteuid()==0:
    os.chown(archive,owner.pw_uid,owner.pw_gid)
for name in ('pg_basebackup','pg_verifybackup'):
    assert (bindir/name).is_file(), 'Missing utility: '+name
archive_script = root/'archive.py'
archive_script.write_text(
    "import os,pathlib,shutil,sys\n"
    "source=pathlib.Path(sys.argv[1]); destination=pathlib.Path("+repr(str(archive))+")/sys.argv[2]\n"
    "if destination.exists(): sys.exit(0 if destination.read_bytes()==source.read_bytes() else 1)\n"
    "temporary=destination.with_name(destination.name+'.partial')\n"
    "shutil.copyfile(source,temporary)\n"
    "with temporary.open('rb') as stream: os.fsync(stream.fileno())\n"
    "temporary.replace(destination)\n"
    "fd=os.open(str(destination.parent),os.O_RDONLY); os.fsync(fd); os.close(fd)\n")
archive_script.chmod(0o644)
restore_script = root/'restore.py'
restore_script.write_text(
    "import pathlib,shutil,sys\nsource=pathlib.Path("+repr(str(archive))+")/sys.argv[1]\n"
    "if not source.is_file(): sys.exit(1)\nshutil.copyfile(source,sys.argv[2])\n")
restore_script.chmod(0o644)
with (data/'postgresql.conf').open('a') as config:
    config.write("\nmax_wal_size='128MB'\narchive_mode=on\narchive_command='python3 "+str(archive_script)+" %p %f'\nautovacuum=off\n")
targets = []

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def lsn(value):
    high,low=value.split('/')
    return (int(high,16)<<32)+int(low,16)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def own_tree(path):
    if os.geteuid()==0:
        for current,dirs,files in os.walk(path):
            os.chown(current,owner.pw_uid,owner.pw_gid)
            for name in files:
                os.chown(pathlib.Path(current)/name,owner.pw_uid,owner.pw_gid)

def target_sql(target,query):
    result = subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',query],
        env=dict(env,PGHOST=str(target/'socket')),text=True,capture_output=True,timeout=10)
    assert result.returncode==0,result.stdout+result.stderr
    return result.stdout.strip()

outcome_query = ("select json_build_object('jobs',(select count(*) from pitr_jobs),"
    "'receipts',(select count(*) from pitr_receipts),'job_ids',(select json_agg(id order by id) from pitr_jobs),"
    "'receipt_ids',(select json_agg(job_id order by job_id) from pitr_receipts),"
    "'amount',(select sum(amount) from pitr_receipts),"
    "'correct',not exists(select 1 from pitr_jobs j left join pitr_receipts r on r.job_id=j.id "
    "where j.amount<>j.id or j.state<>case when j.id<=10 then 'done' else 'queued' end "
    "or (j.id<=10 and (r.job_id is null or r.amount<>j.amount or r.request_id<>'request-'||j.id::text)) "
    "or (j.id>10 and r.job_id is not null)),"
    "'orphans',(select count(*) from pitr_receipts r left join pitr_jobs j on j.id=r.job_id where j.id is null))")

def expected(name,tail=False):
    first=1 if name=='before_cleanup' else 6
    ids=list(range(first,21))+([999] if tail else [])
    return dict(jobs=len(ids),receipts=11-first,job_ids=ids,receipt_ids=list(range(first,11)),
        amount=sum(range(first,11)),correct=True,orphans=0)

try:
    start()
    sql('create extension pg_walinspect')
    sql("create table pitr_jobs(id int primary key,amount int not null check(amount>0),state text not null "
        "check(state in ('queued','done')))")
    sql("create table pitr_receipts(request_id text primary key,job_id int unique not null references pitr_jobs(id),"
        "amount int not null check(amount>0))")
    sql('create table recovery_branch(id int primary key,label text not null)')
    sql("insert into pitr_jobs select g,g,'queued' from generate_series(1,20) g")
    original_id=sql('select system_identifier from pg_control_system()')
    original_tli=int(sql('select timeline_id from pg_control_checkpoint()'))
    assert original_tli==1
    base = subprocess.run(prefix+[str(bindir/'pg_basebackup'),'-D',str(backup),'-c','fast','-X','stream',
        '--manifest-checksums=SHA256','-v'],env=env,text=True,capture_output=True,timeout=60)
    (root/'basebackup.log').write_text(base.stdout+base.stderr)
    assert base.returncode==0,base.stdout+base.stderr
    assert 'backup successfully verified' in server('pg_verifybackup',backup,timeout=60)
    manifest=json.loads((backup/'backup_manifest').read_text())
    sql("begin; update pitr_jobs set state='done' where id<=10; "
        "insert into pitr_receipts select 'request-'||id,id,amount from pitr_jobs where id<=10; commit")
    assert json.loads(sql(outcome_query))==expected('before_cleanup')
    before_lower=sql('select pg_current_wal_insert_lsn()')
    before_point=sql("select pg_create_restore_point('before_cleanup')")
    # One destructive transaction removes receipts and their jobs without violating the FK.
    sql('begin; delete from pitr_receipts where job_id<=5; delete from pitr_jobs where id<=5; commit')
    assert json.loads(sql(outcome_query))==expected('after_cleanup')
    after_lower=sql('select pg_current_wal_insert_lsn()')
    after_point=sql("select pg_create_restore_point('after_cleanup')")
    # A later committed tail is outside BOTH requested histories.
    sql("insert into pitr_jobs values(999,999,'queued')")
    points={}
    for name,lower,position in [('before_cleanup',before_lower,before_point),('after_cleanup',after_lower,after_point)]:
        record=json.loads(sql("select row_to_json(r) from pg_get_wal_records_info('"+lower+"','"+position+"') r "
            "where resource_manager='XLOG' and record_type='RESTORE_POINT'"))
        assert lsn(record['end_lsn'])==lsn(position)
        assert record['resource_manager']=='XLOG' and record['record_type']=='RESTORE_POINT' and name in record['description']
        points[name]=record
    sealed=sql('select pg_walfile_name(pg_switch_wal())')
    start_segment=lsn(manifest['WAL-Ranges'][0]['Start-LSN'])//1048576
    end_segment=lsn(after_point)//1048576
    required=[f'00000001{i//4096:08X}{i%4096:08X}' for i in range(start_segment,end_segment+1)]
    hashes={name:digest(data/'pg_wal'/name) for name in required}
    wait_for('all required history archived',lambda: all((archive/name).is_file() for name in required+[sealed]))
    assert all(digest(archive/name)==hashes[name] for name in required)
    source_outcome=json.loads(sql(outcome_query))
    assert source_outcome==expected('after_cleanup',tail=True)
    emit('source_history',dict(system_identifier=original_id,timeline=original_tli,selected_target=selected_target,
        manifest_ranges=manifest['WAL-Ranges'],points=points,required_hashes=hashes,outcome=source_outcome))

    other='before_cleanup' if selected_target=='after_cleanup' else 'after_cleanup'
    branches={}
    for name in (selected_target,other):
        target=root/name
        shutil.copytree(backup,target)
        targets.append(target)
        (target/'socket').mkdir()
        # Force recovery to fetch actual verified archive files, preserving the pristine backup.
        for wal in (target/'pg_wal').iterdir():
            if re.fullmatch(r'[0-9A-F]{24}',wal.name): wal.unlink()
        with (target/'postgresql.conf').open('a') as config:
            config.write("\nunix_socket_directories='"+str(target/'socket')+"'\nprimary_conninfo=''\n"
                "restore_command='python3 "+str(restore_script)+" %f %p'\n"
                "recovery_target_name='"+name+"'\nrecovery_target_timeline='1'\nrecovery_target_action='promote'\n")
        (target/'recovery.signal').touch()
        own_tree(target)
        branch_log=root/(name+'.log')
        began=time.monotonic()
        server('pg_ctl','-D',target,'-l',branch_log,'-w','-t','20','start',timeout=25)
        assert target_sql(target,'show data_directory')==str(target)
        # Read-only consistency may precede completion/promotion.
        wait_for(name+' promoted',lambda: target_sql(target,'select pg_is_in_recovery()')=='f')
        actual=json.loads(target_sql(target,outcome_query))
        assert actual==expected(name)
        assert target_sql(target,'select system_identifier from pg_control_system()')==original_id
        assert target_sql(target,'select count(*) from recovery_branch')=='0'
        target_sql(target,"insert into recovery_branch values(1,'"+name+"')")
        branch_control=json.loads(target_sql(target,'select row_to_json(c) from pg_control_checkpoint() c'))
        timeline=branch_control['timeline_id']
        assert timeline>1 and timeline not in [b['timeline'] for b in branches.values()]
        history_name=f'{timeline:08X}.history'
        wait_for('branch history archived',lambda: (archive/history_name).is_file())
        history=(target/'pg_wal'/history_name).read_text()
        assert (archive/history_name).read_text()==history
        entries=[line.split(None,2) for line in history.splitlines() if line.strip() and not line.startswith('#')]
        assert len(entries)==1 and int(entries[0][0])==1
        assert lsn(entries[0][1])==lsn(points[name]['end_lsn'])
        segment=target_sql(target,'select pg_walfile_name(pg_switch_wal())')
        assert segment.startswith(f'{timeline:08X}')
        wait_for('new branch WAL archived',lambda: (archive/segment).is_file())
        assert digest(archive/segment)==digest(target/'pg_wal'/segment)
        text_log=branch_log.read_text()
        for marker in ('starting point-in-time recovery to "'+name+'"','recovery stopping at restore point "'+name+'"',
            'completed backup recovery','selected new timeline ID: '+str(timeline),'ready to accept connections'):
            assert marker in text_log,'Missing target evidence: '+marker
        assert any('restored log file "'+filename+'" from archive' in text_log for filename in required)
        branches[name]=dict(directory=str(target),system_identifier=original_id,timeline=timeline,
            target_record_start=points[name]['start_lsn'],target_record_end=points[name]['end_lsn'],
            history=history,branch_segment=segment,outcome=actual,marker=name,
            domain_verified_ms=round(1000*(time.monotonic()-began),2))
        emit(name+'_branch',branches[name])
    # Both restored histories and the source remain available during independent comparison.
    for name in branches:
        target=root/name
        assert json.loads(target_sql(target,outcome_query))==expected(name)
        assert target_sql(target,'select label from recovery_branch where id=1')==name
    assert json.loads(sql(outcome_query))==source_outcome
    assert sql('select count(*) from recovery_branch')=='0'
    assert int(sql('select timeline_id from pg_control_checkpoint()'))==1
    assert all(digest(archive/name)==hashes[name] for name in required)
    assert 'backup successfully verified' in server('pg_verifybackup',backup,timeout=60)
    emit('comparison',dict(selected_target=selected_target,branches=branches,source=source_outcome,
        original_archive_unchanged=True,pristine_backup_verified=True))
    print('PASS: named-target PITR, both correct divergent histories, archived branch identities and unchanged source.',flush=True)
finally:
    try:
        for target in targets:
            if (target/'postmaster.pid').exists():
                server('pg_ctl','-D',target,'-m','fast','-w','-t','20','stop',timeout=25)
    finally:
        stop()
    print('Owned source and both restored histories stopped; evidence retained at',root,flush=True)
PY`;
}

export const PITR_VARIATION = pitrExperiment(true);
export const PITR_WORKLOAD: Draft = {
  slug: "point-in-time-recovery",
  revision: 4,
  tags: ["pitr", "recovery", "backup", "timelines"],
  title: "Named-target recovery: preserve and compare divergent histories",
  difficulty: "advanced",
  safetyLevel: "dangerous",
  runIn: "shell",
  estimatedMinutes: 35,
  prerequisites: ["base-backup", "redo-point-bounds-recovery"],
  overview: code`
Restore an actual backup to named points before and after a destructive committed cleanup. Compare
both restored job/receipt histories with their source, verify archived timeline ancestry and write
a different marker on each branch. The variation selects the later target first, showing why timeline
allocation order is not a ranking of the application states those histories contain.`,
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
  caution: code`
Run in a shell with Python3 and matching PostgreSQL16 server tools, pg_basebackup, pg_verifybackup
and pg_walinspect; PGBIN may select the binary folder. The script deletes rows only on a fresh owned
source and removes WAL only from two new restore copies to force real archive retrieval. It ignores
existing PG/PGLAB settings. Each server has a private socket and TCP disabled; root uses runuser as
the postgres OS owner. All three stop in finally. Allow a few hundred MB and retain the printed
backup, archive, branch data and logs for comparison. Same-disk archiving does not test host loss.`,
  syntaxBreakdown: code`
### In plain terms

Recovery can follow one original history only as far as a selected restore point, then promote the
copy into a new writable branch. We restore before and after the same committed deletion and retain
both copies, so their data and ancestry can be inspected together rather than inferred from filenames.

### What you are learning

- **Named targets:** a WAL restore-point record identifies the chosen boundary precisely.
- **Required history:** an intact backup and verified archived WAL are both used by actual recovery.
- **Branch ancestry:** the history file connects the new timeline to its original parent and fork LSN.
- **Authority limits:** timeline numbers and bare LSNs are not standalone freshness or fencing tokens.

### Piece by piece

- **python3** runs the supplied driver. The embedded helper uses **PGBIN** or **pg_config --bindir**,
  **tempfile.mkdtemp**, and root-only **runuser -u ... -- / os.chown** for owned server processes.
  **initdb -D ... -U postgres --auth-local=trust --auth-host=reject --no-locale --data-checksums
  --wal-segsize=1** creates the private cluster with checksums and1MB WAL segments. Local trust is
  protected by the private parent directory; **listen_addresses=''** disables TCP.
- **fsync**, **synchronous_commit** and **full_page_writes** remain on; **wal_level=replica** supports
  backup/recovery. **max_wal_size=128MB**, **checkpoint_timeout=1h** and **autovacuum=off** reduce
  interference for this bounded fixture. **pg_ctl -D ... -l ... -w -t20** bounds lifecycle and
  retains logs; **-m fast** stops each owned server cleanly.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files and fails on SQL errors. Cleared PG
  variables and **PGCONNECT_TIMEOUT/statement_timeout/lock_timeout** isolate and bound queries.
  Restored queries override **PGHOST** with the copy's socket and verify **data_directory**.
- **archive_mode=on/archive_command** invoke the supplied archive script. **%p/%f** name source
  path and destination filename; identical existing files succeed and differing bytes fail. A
  temporary copy, **os.fsync**, rename and parent-directory sync publish each file. One archiver
  writes at a time in this experiment; this is not a concurrent multi-host archive publication API.
- **CREATE TABLE**, primary keys, unique receipt job IDs, foreign keys, **NOT NULL** and positive
  amount/state **CHECK** constraints define20 queued jobs and empty receipts. **recovery_branch**
  starts empty and later holds a distinct committed marker in each promoted copy.
- **pg_basebackup -D ... -c fast -X stream --manifest-checksums=SHA256 -v** creates the actual
  pristine backup. **pg_verifybackup** checks files and required WAL before and after the experiment.
  **pg_control_system.system_identifier** identifies the source cluster; backup copies retain it.
- A committed **BEGIN/UPDATE/INSERT SELECT/COMMIT** completes jobs1–10 and creates their receipts
  after the backup. **pg_create_restore_point('before_cleanup')** records that completed state.
  One transaction then deletes receipts and jobs1–5, followed by **after_cleanup**. Job999 is
  committed after both targets and must be absent from both restored histories.
- **pg_current_wal_insert_lsn** brackets each restore-point insertion. **pg_get_wal_records_info**
  decodes that range and verifies each target's XLOG RESTORE_POINT type, description and
  start/end LSN. **pg_create_restore_point** returns the record end, so it is not passed to a
  decoder as that record's start. The later synchronous tail commit flushes both earlier restore-point records.
  **pg_walfile_name(pg_switch_wal())** seals their segment for actual archiving.
- The manifest's **WAL-Ranges** identifies the starting history. The driver converts hexadecimal
  LSN halves to byte positions and enumerates required1MB segments through the later target, with
  timeline1 prefixes. **hashlib.sha256** compares each source segment with its archived bytes;
  **wait_for** polls file existence with a deadline before restoration begins.
- **shutil.copytree** creates two copies and preserves the pristine backup. Only ordinary WAL
  segment files in those copies are removed. **recovery.signal**, **restore_command** with
  **%f/%p**, **recovery_target_name**, **recovery_target_timeline='1'** and
  **recovery_target_action='promote'** request the selected original history and promote at its
  named point. Explicit timeline1 prevents the second restore from following the first new branch.
- The restore script copies available archive files and returns exit1 for absent names. Real
  restored-from-archive log lines are required. **pg_ctl -w** can return at read-only consistency;
  a bounded **pg_is_in_recovery=false** poll requires promotion before marker writes.
- **count**, ordered **json_agg**, **sum**, **NOT EXISTS**, **LEFT JOIN** and **CASE** verify all
  job/receipt identities, values, expected queued/done states and zero orphans. Separate table
  counts prevent joins from hiding extra rows. The source additionally retains job999.
- **pg_control_checkpoint.timeline_id** identifies each promoted copy. Its eight-hex-digit
  **.history** filename must exist locally and in the shared archive with equal contents. Parsing
  its parent and fork LSN requires parent1 and the selected restore-point record's end address.
  Numeric LSN comparison normalizes leading zeroes used by different output formats.
- Each branch inserts a unique **recovery_branch** label and switches WAL. Its archived segment
  must use its own timeline prefix and match the local bytes. Waiting for the first history file
  in the archive lets the second promotion discover it and allocate another timeline number.
- Fresh logs must show the named PITR request, stopping at that restore point, completed backup
  recovery, new timeline selection and readiness. **time.monotonic** records sampled recovery and
  domain/archive-check elapsed time, including helper overhead; this is not a production RTO.
- Both copies remain running while their rows and marker labels are independently rechecked. The
  source remains on timeline1 with its original post-cleanup state and no branch marker; original
  archived hashes and pristine backup verification must still pass. **json.loads/dumps** retain
  the records, ancestry, source/copy outcomes and evidence paths. Nested finally stops all servers.`,
  code: pitrExperiment(false),
  expectedResult: code`
The source ends with jobs6–20 plus999, five receipts for jobs6–10, receipt amount40, correct values
and zero orphans. The before_cleanup restore contains jobs1–20, ten receipts for1–10 and amount55;
after_cleanup contains jobs6–20, five receipts and amount40. Neither restored copy has job999.
Their post-promotion marker labels differ, and the source marker table stays empty.

Both actual recoveries fetch archived WAL and stop at their selected named restore point. Each
promotes out of recovery. Its local/archived history file identifies parent timeline1 and the chosen
restore-point record's end LSN. Its new archived WAL uses the allocated timeline prefix. The first
restored target receives timeline2 and the second timeline3 in this fresh fixture. Original archive
hashes and pristine backup verification remain intact while all three histories are compared.

The core selects before_cleanup first. The variation selects after_cleanup first, so the later
application state gets timeline2 and the earlier state timeline3. The data still follows the target,
not the larger timeline number. Exact LSNs, segment names, hashes and timings vary. Both branches and
the source stop; their data, logs, records and history files remain at the printed owned directory.`,
  systemsLens: code`
History identity and application freshness answer different questions. A timeline records a branch
within one cluster's recovery history; a larger timeline can represent a recovery to an earlier
application state. An LSN comparison needs a known shared history, and a timeline ID alone does not
fence an old writer or establish replica readiness. Keep lineage and application evidence together.

A named restore point is a WAL boundary, not a promise that every arbitrary byte prefix is a usable
database. The backup must reach consistency, required history must exist, and transaction decisions
still determine visible rows. This fixture places points between committed transactions and tests
the resulting states directly; it does not replace authority control for a live failover.`,
  challenge: code`
Select after_cleanup first using the complete pgcoach hint2 variation. Predict the selected rows,
receipt sum and absence of job999. Then compare the second, earlier-target branch and explain why
its larger allocated timeline number cannot certify later application data or permission to write.`,
};
