import { code, type Draft } from "../../../src/types.ts";
import { OWNED_REPLICATION_PY } from "./owned-replication.ts";

function readinessExperiment(fallback: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_REPLICATION_PY +
    `\nfallback = ${fallback ? "True" : "False"}\n` + code`
def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def lsn(value):
    high,low=value.split('/')
    return (int(high,16)<<32)+int(low,16)

identity_query="select json_build_object('system',system_identifier::text,'timeline',timeline_id," \
    "'recovery',pg_is_in_recovery(),'directory',current_setting('data_directory')) " \
    "from pg_control_system(),pg_control_checkpoint()"
state_query="select json_build_object('system',(select system_identifier::text from pg_control_system())," \
    "'timeline',(select received_tli from pg_stat_wal_receiver),'recovery',pg_is_in_recovery()," \
    "'directory',current_setting('data_directory'),'replay',pg_last_wal_replay_lsn())"
domain_query="select json_build_object('profile',(select row_to_json(p) from profiles p where id=1)," \
    "'receipt',(select row_to_json(r) from read_receipts r where request_key='request-42'))"
expected=dict(profile=dict(id=1,version=2,display_name='after'),
    receipt=dict(request_key='request-42',profile_id=1,version=2,display_name='after'))

def bounded_sql(query,deadline):
    remaining=deadline-time.monotonic()
    if remaining<=0:
        raise TimeoutError('read deadline expired')
    query_env=dict(replica_env,PGOPTIONS='-c statement_timeout='+str(max(1,int(remaining*1000))))
    result=subprocess.run([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1','-c',query],
        env=query_env,text=True,capture_output=True,timeout=remaining)
    if result.returncode:
        raise RuntimeError(result.stderr)
    if time.monotonic()>=deadline:
        raise TimeoutError('read completed after deadline')
    return json.loads(result.stdout.strip())

def read_with_token(token,seconds):
    began=time.monotonic()
    deadline=began+seconds
    comparisons=0
    domain_reads=0
    def answer(status,payload=None):
        return dict(status=status,payload=payload,lsn_comparisons=comparisons,domain_reads=domain_reads,
            elapsed_ms=round(1000*(time.monotonic()-began),2),deadline_ms=seconds*1000)
    # Tokens are trusted objects minted by this fixed writer, not arbitrary client SQL.
    # The topology epoch is a driver-owned fixture assertion, not a database election service.
    if any(token[k]!=pinned[k] for k in ('system','timeline','topology_epoch')):
        return answer('wrong_history')
    try:
        while True:
            state=bounded_sql(state_query,deadline)
            if (state['system']!=pinned['system'] or state['timeline']!=pinned['timeline']
                or not state['recovery'] or state['directory']!=str(standby)):
                return answer('wrong_history')
            comparisons+=1
            if state['replay'] is not None and lsn(state['replay'])>=lsn(token['bound']):
                # A NEW connection/statement takes a snapshot after the successful replay check.
                domain_reads+=1
                payload=bounded_sql(domain_query,deadline)
                if payload!=expected or payload['receipt']['request_key']!=token['request_key']:
                    return answer('receipt_mismatch')
                return answer('ready',payload)
            remaining=deadline-time.monotonic()
            if remaining<=0:
                raise TimeoutError('replay deadline expired')
            time.sleep(min(0.05,remaining))
    except (TimeoutError,subprocess.TimeoutExpired):
        return answer('timeout')
    except RuntimeError:
        return answer('unavailable')

try:
    start()
    sql('create table profiles(id int primary key,version int not null,display_name text not null)')
    sql('create table read_receipts(request_key text primary key,profile_id int not null references profiles(id),'
        'version int not null,display_name text not null)')
    sql("insert into profiles values(1,1,'before')")
    clone_standby()
    identity=json.loads(sql(identity_query))
    copy_identity=json.loads(replica_sql(identity_query))
    assert identity['recovery'] is False and identity['directory']==str(data)
    assert copy_identity['system']==identity['system'] and copy_identity['recovery'] is True
    assert identity['timeline']==copy_identity['timeline']==1
    pinned=dict(system=identity['system'],timeline=1,topology_epoch='owned-fixed-writer-1')
    wait_replay(sql('select pg_current_wal_insert_lsn()'))
    replica_sql('select pg_wal_replay_pause()')
    wait_for('actual paused replay',lambda: replica_sql('select pg_get_wal_replay_pause_state()')=='paused')
    paused_lsn=replica_sql('select pg_last_wal_replay_lsn()')
    # Commit the domain effect and the independently keyed receipt atomically, THEN mint a bound.
    sql("begin; update profiles set version=2,display_name='after' where id=1; "
        "insert into read_receipts values('request-42',1,2,'after'); commit")
    token=dict(pinned,bound=sql('select pg_current_wal_insert_lsn()'),request_key='request-42')
    assert lsn(token['bound'])>lsn(paused_lsn)
    wait_for('durably received token',lambda: len(receiver())==1 and
        lsn(receiver()[0]['flushed_lsn'])>=lsn(token['bound']))
    stale=json.loads(replica_sql(domain_query))
    assert stale==dict(profile=dict(id=1,version=1,display_name='before'),receipt=None)
    assert replica_sql('select pg_last_wal_replay_lsn()')==paused_lsn
    source=json.loads(sql(domain_query))
    assert source==expected
    timed_out=read_with_token(token,0.5)
    assert timed_out['status']=='timeout' and timed_out['payload'] is None
    assert timed_out['domain_reads']==0 and timed_out['lsn_comparisons']>0
    emit('paused_timeout',dict(token=token,paused_lsn=paused_lsn,receiver=receiver(),
        diagnostic_stale_rows=stale,source=source,response=timed_out))
    # Negative token tests keep the SAME valid numeric bound; reject identity before comparing it.
    rejected=[]
    for field,value in [('system',str(int(pinned['system'])+1)),('timeline',2),('topology_epoch','expired-writer')]:
        response=read_with_token(dict(token,**{field:value}),0.5)
        assert response['status']=='wrong_history' and response['payload'] is None
        assert response['lsn_comparisons']==response['domain_reads']==0
        rejected.append(dict(changed_field=field,response=response))
    emit('wrong_history_rejected',rejected)
    if fallback:
        # Separate bounded fallback request; the 500ms replica budget has already expired.
        # This fixture never promotes either node or changes writer ownership.
        assert json.loads(sql(identity_query))==identity
        primary_response=json.loads(sql(domain_query))
        assert primary_response==expected
        assert replica_sql('select pg_get_wal_replay_pause_state()')=='paused'
        assert json.loads(replica_sql(domain_query))==stale
        emit('explicit_primary_fallback',dict(authority=pinned,response=primary_response,
            standby_still_stale=True,replica_budget_reused=False))
    replica_sql('select pg_wal_replay_resume()')
    ready=read_with_token(token,5)
    assert ready['status']=='ready' and ready['payload']==expected and ready['domain_reads']==1
    assert json.loads(sql(domain_query))==ready['payload']
    emit('fresh_read_after_replay',ready)
    print('PASS: timeout served no data; wrong histories rejected before LSN comparison; fresh replay-gated receipt and profile agree.',flush=True)
finally:
    stop_replication()
PY`;
}

export const REPLICA_READINESS_VARIATION = readinessExperiment(true);
export const REPLICA_READINESS: Draft = {
  slug: "read-your-writes-on-a-replica",
  revision: 4,
  tags: ["streaming-replication", "consistency", "replicated-log", "wal"],
  title: "Read your write: a history-bound replay gate with a deadline",
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 30,
  prerequisites: ["replication-lag-under-load", "read-committed-sees-each-statement"],
  overview: code`
Commit a profile change and durable request receipt while an owned physical standby has replay
paused. Mint a token after COMMIT, then require a matching known history and replay through that
bound before taking a fresh application snapshot. Exercise a deadline that returns no data,
wrong-history rejection and successful catch-up; decide whether an explicit primary fallback is
appropriate for a caller whose replica deadline expired.`,
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
  caution: code`
Run the complete shell script with Python3 and matching PostgreSQL16 binaries, including
pg_basebackup/pg_verifybackup; PGBIN may select their folder. It creates private source/standby data
and socket directories, ignores inherited PG/PGLAB settings and disables TCP. Root uses runuser as
the postgres OS owner. Only the owned standby pauses. Finally stops it, removes its inactive slot
and stops the source. Keep the printed stopped paths/logs; allow a few hundred MB.

This fixed topology has one driver-owned writer and no failover. Tokens and routing metadata are
trusted local objects. The epoch label is a fixture assertion, not an implemented fencing service;
system ID and timeline alone cannot establish current writer authority. A production router must
validate its authority/history contract again across topology changes.`,
  syntaxBreakdown: code`
### In plain terms

A user's successful write should be visible in the response to their next read. Receiving its WAL
is insufficient: the standby must apply through a bound from the same known history, and the read
must use a snapshot taken afterward. A deadline makes delayed replay an explicit response policy.

### What you are learning

- **Post-commit token:** a later WAL bound contains the committed effect without identifying its exact record.
- **History scope:** positions are comparable only under the trusted topology and branch contract.
- **Fresh application snapshot:** the receipt and profile are read together after the replay check.
- **Deadline response:** timeout returns no stale payload; primary fallback is an explicit separate choice.

### Piece by piece

- **python3** runs the included owned-replication helper. **PGBIN / pg_config --bindir** finds
  matching binaries. **tempfile.mkdtemp**, private sockets and cleared PG variables isolate the
  fixture; root-only **runuser/os.chown** assigns server files to postgres.
- **initdb -D** selects the new data directory; **-U postgres** names its administrator;
  **--auth-local=trust** allows access inside the protected socket directory; **--auth-host=reject**
  rejects network authentication; **--no-locale**, **--data-checksums** and **--wal-segsize=1** select
  deterministic locale, checksums and1MB segments. **listen_addresses=''** disables TCP.
- **fsync/synchronous_commit/full_page_writes=on**, **wal_level=replica**, small buffers and
  **max_wal_size=128MB**, **checkpoint_timeout=1h**, **autovacuum=off**, **wal_sender_timeout=5s**
  configure this bounded private workload. **pg_ctl -D ... -l ... -w -t20** selects data/log files
  and waits at most20 seconds for startup; **-m fast stop** rolls back active work at shutdown.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores startup files, produces unaligned tuples only,
  stops on SQL errors and executes the supplied query. **PGCONNECT_TIMEOUT**, **statement_timeout**,
  **lock_timeout** and Python subprocess timeouts bound ordinary helper calls.
- **clone_standby** creates the dedicated **LOGIN REPLICATION** role. **pg_basebackup -U** chooses
  it, **-D** names the copy, **-c fast** requests a fast checkpoint, **-X stream** includes streamed
  WAL, **-R** writes recovery settings, **-C -S owned_standby** creates/names the physical slot and
  **--manifest-checksums=SHA256 -v** adds checksums and diagnostics. **pg_verifybackup** verifies
  the copy before settings change. **standby.signal/primary_conninfo/primary_slot_name** connect
  recovery to the source; private socket, **hot_standby=on**, **archive_mode=off**,
  **wal_receiver_status_interval=1s** and retry100ms configure the standby.
- **profiles** holds version1/before in the backup. **read_receipts** has an independent unique
  request key and a **REFERENCES** constraint linking the profile. Explicit **BEGIN/COMMIT**
  atomically changes the profile to version2/after and saves request-42 with the same values.
- **pg_control_system.system_identifier** identifies the originating cluster;
  **pg_control_checkpoint.timeline_id** identifies checkpoint history. **pg_is_in_recovery** and
  **current_setting('data_directory')** check roles and owned endpoints. The driver pins one
  unchanging topology epoch and timeline1, then checks **pg_stat_wal_receiver.received_tli** on
  each gate poll. A missing receiver or changed identity fails closed. These checks cannot elect
  a writer or prove authority after failover; divergent descendants share a system identifier.
- **pg_wal_replay_pause** requests suspension; **pg_get_wal_replay_pause_state='paused'** must
  actually hold first. **pg_current_wal_insert_lsn** runs in a separate call after COMMIT. This
  bound may include unrelated later WAL; it is sufficient within this history, not an exact
  transaction address. **pg_stat_wal_receiver.flushed_lsn** reaches it while replay remains fixed.
- **read_with_token** compares system, timeline and topology epoch before converting or comparing
  LSNs. Python **lsn** converts hexadecimal high/low halves to a byte position. Three synthetic
  wrong-identity tokens keep the correct numeric bound and must produce zero comparisons and
  zero application reads; they test rejection, not actual promotion or divergent recovery.
- **time.monotonic** gives the500ms replica deadline. Each **bounded_sql** call gets only the
  remaining subprocess budget and a matching **statement_timeout**, including the final data
  query. Poll sleeps are capped by that same remaining budget. Process startup/termination can
  add scheduling overhead; no hard real-time guarantee is claimed. Query errors return unavailable,
  expiration returns timeout, and neither response includes application data.
- **pg_last_wal_replay_lsn >= token.bound** admits the application query only after apply.
  **json_build_object**, **row_to_json** and Python **json.loads/dumps** keep the profile and
  request receipt in one statement snapshot and retain evidence files. A new psql connection
  ensures that snapshot is acquired after the gate, without an old repeatable-read transaction.
  Payload/key mismatches return receipt_mismatch rather than success.
- The printed stale query is diagnostic evidence outside the response path. Its version1 and
  absent receipt must never appear as a successful gated response. **pg_wal_replay_resume** permits
  a new five-second attempt; exactly one fresh domain query returns version2 and request-42.
- The variation changes only timeout policy: it separately checks the pinned source identity/role,
  then performs a bounded fresh primary read while standby remains paused and stale. This fallback
  has its own helper bounds; it is not completion within the expired500ms replica budget.
- Finally stops standby, waits for **pg_replication_slots.active=false**, uses
  **pg_drop_replication_slot** only on its owned slot, verifies absence and stops the source.`,
  code: readinessExperiment(false),
  expectedResult: code`
The source contains profile1/version2/after and receipt request-42 with matching values. While
replay is actually paused, flushed receive reaches the post-COMMIT token but diagnostic standby
rows remain version1/before with no receipt. The500ms attempt returns timeout, payload=null and
zero domain reads after at least one replay comparison. Measured elapsed time includes scheduling
and process overhead and need not equal exactly500ms.

Each of the three deliberately mismatched identity tokens returns wrong_history with zero LSN
comparisons, zero domain reads and no payload. After resume, a fresh attempt returns ready with
exactly one domain query and the correct profile plus receipt. The variation additionally returns
that same result from the pinned primary while the standby still has the stale diagnostic state.
All owned servers stop and the physical slot is removed.`,
  systemsLens: code`
An applied log position is a readiness boundary within an identified history. Read-your-writes
combines that boundary with a post-write token, a later snapshot and an explicit deadline response.
It does not promise globally latest data, serializability or writer election. During failover,
validate the history and authority contract before using either the token or a fallback endpoint.`,
  challenge: code`
Change only the timeout response policy: use pgcoach hint2 to return an explicit fresh read from
the pinned primary while the replica remains paused, then resume and verify the replica result.
Explain the extra primary load and why a500ms replica deadline cannot also describe the total
fallback response time. State what must change in this policy when writer authority changes.`,
};
