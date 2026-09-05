import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function notificationExperiment(publishAfterListen: boolean): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY +
    `\npublish_after_listen = ${publishAfterListen ? "True" : "False"}\n` + code`
import re
clients=[]

def quote(value):
    return "'"+str(value).replace("'","''")+"'"

def emit(label,value):
    print(label+': '+json.dumps(value,sort_keys=True),flush=True)
    (root/(label+'.json')).write_text(json.dumps(value,indent=2))

def rows(table,order):
    return json.loads(sql("select coalesce(json_agg(r order by "+order+"),'[]') from "+table+' r'))

def inventory():
    return dict(jobs=rows('jobs','id'),receipts=rows('receipts','job_id'),credit=rows('credit','id'))

def launch(label):
    path=root/(label+'.log');output=path.open('w')
    process=subprocess.Popen([str(bindir/'psql'),'-X','-At','-v','ON_ERROR_STOP=1'],
        env=dict(env,PGAPPNAME=label),stdin=subprocess.PIPE,stdout=output,stderr=subprocess.STDOUT,text=True)
    item=dict(label=label,path=path,output=output,process=process);clients.append(item)
    return item

def command(item,commands,marker):
    before=len(item['path'].read_text())
    item['process'].stdin.write(commands+'\n\\echo '+marker+'\n');item['process'].stdin.flush()
    def ready():
        assert item['process'].poll() is None,item['path'].read_text()
        return marker in item['path'].read_text().splitlines()
    wait_for(marker,ready)
    return item['path'].read_text()[before:]

def backend(item):
    return json.loads(sql("select row_to_json(a) from (select pid,state,backend_xid::text as xid "
        'from pg_stat_activity where application_name='+quote(item['label'])+') a'))

def notices(item):
    return [dict(payload=payload,sender_pid=int(pid)) for payload,pid in re.findall(
        r'Asynchronous notification "work_ready" with payload "([^"]*)" received from server process with PID (\d+)\.',
        item['path'].read_text())]

def wake_count(item):
    return sum(n['payload']=='wake-up' for n in notices(item))

def barrier(item,label):
    # A separately committed signal after the tested actions closes the observation interval.
    sql("select pg_notify('work_ready',"+quote(label)+')')
    for number in range(10):
        command(item,"select 'poll';",label+'-POLL-'+str(number))
        if any(n['payload']==label for n in notices(item)):
            return notices(item)
    raise RuntimeError('Missing notification barrier '+label)

def register(item):
    text=command(item,"BEGIN; LISTEN work_ready; COMMIT; select coalesce(json_agg(channel),'[]') from pg_listening_channels() channel;",'REGISTERED')
    assert '["work_ready"]' in text,text
    assert backend(item)['state']=='idle'

def consume(item,label,hold=False):
    result=command(item,('BEGIN; ' if hold else '')+'select process_pending();',label+'-RETURNED')
    arrays=[json.loads(line) for line in result.splitlines() if line.startswith('[')]
    assert len(arrays)==1,result
    emit(label,dict(returned=arrays[0],backend=backend(item),visible=inventory()))
    return arrays[0]

def publish_command(jobs):
    return 'insert into jobs(id,customer,amount) values '+','.join('('+str(i)+','+quote(customer)+','+str(amount)+')' for i,customer,amount in jobs)+';'

def close(item):
    item['process'].stdin.write('\\q\n');item['process'].stdin.flush()
    assert item['process'].wait(timeout=5)==0,item['path'].read_text()
    item['output'].close()

def lose(item):
    before=backend(item);assert item['process'].poll() is None
    item['process'].kill();assert item['process'].wait(timeout=5)==-9;item['output'].close()
    wait_for('listener backend gone',lambda: sql('select count(*) from pg_stat_activity where application_name='+quote(item['label']))=='0')
    emit('listener-loss',dict(backend_before=before,client_exit=-9,backend_gone=True,visible=inventory()))

try:
    start();identity=sql('select system_identifier from pg_control_system()')
    sql('''
create table jobs(id int primary key,customer text not null,amount int not null check(amount>0),
 status text not null default 'pending' check(status in ('pending','done')));
create table credit(id int primary key,total int not null);
insert into credit values(1,0);
create table receipts(job_id int primary key references jobs(id),customer text not null,
 amount int not null,credit_after int not null);
create function wake_worker() returns trigger language plpgsql as $fn$
begin
 perform pg_notify('work_ready','wake-up');
 return new;
end
$fn$;
create trigger jobs_wakeup after insert on jobs for each row execute function wake_worker();
create function process_pending() returns jsonb language plpgsql volatile as $fn$
declare job public.jobs%rowtype; new_total int; result jsonb:='[]'::jsonb;
begin
 for job in select * from public.jobs where status='pending' order by id limit 10 for update skip locked loop
  update public.credit set total=total+job.amount where id=1 returning total into new_total;
  if not found then raise exception 'credit row missing'; end if;
  insert into public.receipts values(job.id,job.customer,job.amount,new_total);
  update public.jobs set status='done' where id=job.id;
  result:=result||jsonb_build_array(jsonb_build_object('job_id',job.id,'amount',job.amount,'credit_after',new_total));
 end loop;
 return result;
end
$fn$;
''')
    emit('configuration',dict(version=sql('show server_version'),system_identifier=identity,
        startup_publish='after_listen_commit' if publish_after_listen else 'before_listen_commit',
        fsync=sql('show fsync'),synchronous_commit=sql('show synchronous_commit'),full_page_writes=sql('show full_page_writes')))
    initial=inventory();emit('initial',initial)
    listener=launch('first-listener')
    command(listener,'BEGIN; LISTEN work_ready;','LISTEN_PENDING')
    assert backend(listener)['state']=='idle in transaction'
    if not publish_after_listen: sql(publish_command([(1,'Ada',5)]))
    result=command(listener,"COMMIT; select coalesce(json_agg(channel),'[]') from pg_listening_channels() channel;",'LISTEN_COMMITTED')
    assert '["work_ready"]' in result and backend(listener)['state']=='idle',result
    if publish_after_listen: sql(publish_command([(1,'Ada',5)]))
    assert consume(listener,'initial-scan')==[dict(job_id=1,amount=5,credit_after=5)]
    barrier(listener,'startup-barrier')
    assert wake_count(listener)==(1 if publish_after_listen else 0),notices(listener)
    emit('startup-reconciliation',dict(notifications=notices(listener),wake_count=wake_count(listener),visible=inventory()))
    stable=inventory();baseline=wake_count(listener)

    # Business work and its trigger notification are both discarded on publisher rollback.
    producer=launch('aborted-producer')
    command(producer,'BEGIN; '+publish_command([(99,'Rolled back',999)]),'PUBLISHER_HELD')
    held=backend(producer);assert held['state']=='idle in transaction' and held['xid']
    assert inventory()==stable
    barrier(listener,'before-publisher-rollback');assert wake_count(listener)==baseline
    command(producer,'ROLLBACK;','PUBLISHER_ABORTED');close(producer)
    barrier(listener,'after-publisher-rollback');assert wake_count(listener)==baseline and inventory()==stable
    emit('publisher-rollback',dict(held_backend=held,notifications=notices(listener),visible=inventory()))

    # Two trigger invocations with the identical channel/payload collapse into one committed wake-up.
    producer=launch('committed-producer')
    command(producer,'BEGIN; '+publish_command([(2,'Grace',7),(3,'Linus',11)]),'BATCH_HELD')
    assert inventory()==stable
    barrier(listener,'before-publisher-commit');assert wake_count(listener)==baseline
    command(producer,'COMMIT;','BATCH_COMMITTED');close(producer)
    barrier(listener,'after-publisher-commit');assert wake_count(listener)==baseline+1,notices(listener)
    published=inventory();assert [r['id'] for r in published['jobs'] if r['status']=='pending']==[2,3]
    emit('coalesced-wakeup',dict(new_jobs=[2,3],new_wakeups=1,notifications=notices(listener),visible=published))

    # The actual listening client performs receipt + credit + completion, then is killed before commit.
    returned=consume(listener,'uncommitted-listener-batch',hold=True)
    assert returned==[dict(job_id=2,amount=7,credit_after=12),dict(job_id=3,amount=11,credit_after=23)]
    held=backend(listener);assert held['state']=='idle in transaction' and held['xid']
    assert inventory()==published
    lose(listener);assert inventory()==published
    # No subscribed backend exists while these two new jobs and their wake-up commit.
    assert sql("select count(*) from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid()")=='0'
    sql(publish_command([(4,'Barbara',13),(5,'Edsger',17)]))
    offline=inventory();assert [r['id'] for r in offline['jobs'] if r['status']=='pending']==[2,3,4,5]
    assert offline['credit']==[dict(id=1,total=5)] and offline['receipts']==published['receipts']
    emit('work-while-listener-absent',offline)

    replacement=launch('replacement-listener');register(replacement)
    barrier(replacement,'reconnected-barrier');assert wake_count(replacement)==0,notices(replacement)
    emit('no-notification-replay',dict(notifications=notices(replacement),visible=inventory()))
    # Work commits after registration but before the initial durable scan. Its wake-up may be redundant.
    sql(publish_command([(6,'Leslie',19)]))
    returned=consume(replacement,'reconnect-durable-scan')
    assert returned==[dict(job_id=i,amount=a,credit_after=t) for i,a,t in [(2,7,12),(3,11,23),(4,13,36),(5,17,53),(6,19,72)]]
    barrier(replacement,'after-reconnect-scan');assert wake_count(replacement)==1,notices(replacement)
    emit('recovered-despite-missed-wakes',dict(processed_jobs=[2,3,4,5,6],new_wakeups=1,notifications=notices(replacement),visible=inventory()))
    final=inventory()
    # Redundant doorbells prompt a scan, but are not new work and do not imply another credit.
    sql("select pg_notify('work_ready','wake-up')")
    barrier(replacement,'redundant-wake-barrier');assert wake_count(replacement)==2
    assert consume(replacement,'redundant-wakeup-scan')==[] and inventory()==final
    assert consume(replacement,'bounded-poll-scan')==[] and inventory()==final
    expected=[(1,'Ada',5),(2,'Grace',7),(3,'Linus',11),(4,'Barbara',13),(5,'Edsger',17),(6,'Leslie',19)]
    assert final['jobs']==[dict(id=i,customer=c,amount=a,status='done') for i,c,a in expected]
    running=0;receipts=[]
    for i,c,a in expected:
        running+=a;receipts.append(dict(job_id=i,customer=c,amount=a,credit_after=running))
    assert final['receipts']==receipts and final['credit']==[dict(id=1,total=72)]
    assert sum(r['amount'] for r in final['receipts'])==sum(r['amount'] for r in final['jobs'])==72
    assert sql("select count(*) from pg_locks where not granted")=='0'
    emit('final-before-restart',final);close(replacement)
    stop();start();assert sql('select system_identifier from pg_control_system()')==identity
    assert inventory()==final
    restarted=launch('restarted-listener');register(restarted)
    assert consume(restarted,'restart-durable-scan')==[] and inventory()==final
    barrier(restarted,'restart-barrier');assert wake_count(restarted)==0
    emit('final-after-restart',dict(notifications=notices(restarted),visible=inventory()))
    close(restarted)
finally:
    for item in clients:
        if item['process'].poll() is None:
            item['process'].kill();item['process'].wait(timeout=5)
        item['output'].close()
    stop()
    emit('cleanup',dict(server_stopped=not (data/'postmaster.pid').exists(),
        clients=[dict(label=i['label'],exit=i['process'].returncode) for i in clients]))
print('Inspected notification boundaries and complete durable reconciliation; evidence:',root,flush=True)

PY
`;
}

export const NOTIFY_CORE = notificationExperiment(false);
export const NOTIFY_VARIATION = notificationExperiment(true);

export const NOTIFICATION_RECOVERY: Draft = {
  slug: "listen-notify-as-a-bus",
  title: "LISTEN/NOTIFY: recover missed wake-ups from durable work",
  revision: 4,
  tags: ["listen-notify", "queues", "outbox", "durability", "distributed-patterns"],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 1 "Introduction".`,
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  sessions: 3,
  estimatedMinutes: 45,
  prerequisites: ["transactional-outbox", "idempotency-keys", "skip-locked-work-queue"],
  overview: code`
A notification tells a worker to inspect durable state; it cannot tell the worker how much work is
pending or whether an earlier attempt committed. Register a real listener, apply jobs to a balance,
and kill that listening client with a batch still uncommitted. More jobs arrive while it is absent.
The replacement must commit LISTEN before scanning, recover every pending job and tolerate wake-ups
that were missed, folded together or refer to work it has already completed.`,
  syntaxBreakdown: code`
### In plain terms

Jobs hold the requested credits, receipts record the applied credits and a balance measures the
actual effect. NOTIFY sends a generic wake-up, so its count is deliberately different from the job
count. The finite Python driver coordinates real psql listener and publisher sessions; the listener
itself executes the durable processing function. You will compare data, notifications and transaction
boundaries, then choose how a service should combine startup scans, wake-ups and bounded polling.

### What you are learning

- LISTEN becomes effective at commit. Commit registration first, then inspect durable state in a
  fresh transaction; work around that boundary can be found by the scan even without a wake-up.
- Publisher rollback discards its row and notification. Identical channel/payload notifications
  within one transaction fold together, while a disconnected listener has no replay offset.
- A received wake-up and a returned processing result are not proof of a worker commit. Credit,
  receipt and job completion must commit together so a lost worker can retry pending work safely.
- Notifications may be redundant or missed. Durable job status and receipts drive reconciliation,
  including an empty scan after an extra wake-up or an ordinary poll.

### Piece by piece

- The quoted Python heredoc supplies a standalone private fixture. pg_config --bindir or PGBIN
  finds PostgreSQL tools; tempfile.mkdtemp creates only this run's /tmp/pg-owned-* root. pwd/chown
  select its owner and root uses runuser -u for server commands. initdb -D selects the data path,
  -U creates postgres, --auth-local=trust permits the private socket, --auth-host=reject rejects
  host authentication, --no-locale fixes locale, --data-checksums enables page checks and
  --wal-segsize=1 uses small MiB WAL segments. No installed Python database package is needed.
- listen_addresses='' disables TCP; unix_socket_directories gives this server its private socket
  and port6543 names it. Inherited PG variables are cleared; PGHOST, PGPORT, PGUSER and PGDATABASE
  select only this endpoint. PGCONNECT_TIMEOUT=3 bounds connection setup, PGOPTIONS bounds
  statements to five seconds/locks to one second, and LC_ALL=C stabilizes notification/error text.
  shared_buffers=16MB and max_connections=10 bound resources. wal_level=replica, fsync,
  synchronous_commit and full_page_writes retain ordinary durability. Small min/max_wal_size,
  one-hour checkpoint_timeout, logging_collector=off and log_checkpoints=on bound the fixture's
  WAL policy and leave server.log; these settings are not workload tuning advice.
- pg_ctl -D -l -w -t20 starts the named server and waits for readiness with its log; -m fast stops
  it. pg_control_system().system_identifier identifies the same database after normal restart.
  Python subprocess argument arrays, output capture, exit checks and timeouts bound external work.
  psql -X ignores personal startup files, -At returns unaligned tuples and -v ON_ERROR_STOP=1 stops
  on SQL failure. Popen stdin drives actual persistent listener/publisher connections; PGAPPNAME
  labels each backend. Backslash echo marks a reached command boundary and backslash q exits.
- jobs has an id PRIMARY KEY, customer, positive-amount CHECK and pending/done status. credit has
  one total. receipts has a job_id PRIMARY KEY/FOREIGN KEY to jobs, matching customer/amount and the
  saved cumulative credit_after. All final rows are compared, not only a done count.
- wake_worker is a PL/pgSQL trigger function. PERFORM pg_notify('work_ready','wake-up') invokes the
  function form of NOTIFY without using a returned value, then RETURN NEW completes the trigger.
  CREATE TRIGGER ... AFTER INSERT ... FOR EACH ROW attaches it to every job insertion. The trigger
  runs in the publisher's transaction, tying each row and its wake-up to the same commit/rollback.
  Two rows in one transaction invoke it twice with identical channel/payload, yielding one signal.
- process_pending is a VOLATILE PL/pgSQL function returning JSONB. A jobs%rowtype loop selects at
  most10 pending rows in id order, using FOR UPDATE SKIP LOCKED so a local concurrent processor
  would skip locked work. UPDATE credit ... RETURNING obtains the new total; FOUND detects a
  missing balance. INSERT receipt and UPDATE job status='done' share that caller transaction.
  The receipt PRIMARY KEY and row claim protect local processing under these controlled writers.
  JSONB concatenation with jsonb_build_array/jsonb_build_object reports each executed job/amount/
  credit_after. That return value alone is not a commit acknowledgement inside BEGIN.
- The first psql listener executes BEGIN; LISTEN work_ready and pauses before COMMIT. Core publishes
  job1 before that commit; the variation publishes it just afterward. pg_listening_channels is
  queried in the listening session after commit and must report work_ready. In either path, the
  next fresh processing transaction finds job1 and commits credit5. Core receives no job1 wake-up;
  the variation receives one. Registration before the durable scan covers both timings.
- psql prints asynchronous notifications with channel, payload and sender PID while servicing the
  connection. Python re.findall extracts those actual lines into evidence; it does not fabricate
  a notification from a row. The driver sends a uniquely named, separately committed barrier
  notification after each tested sequence and issues bounded SELECT 'poll' round trips until that
  barrier is received. Ordered committed notifications on this channel close the observed interval;
  absence is checked against that barrier, not assumed after an arbitrary sleep. Barrier signals
  are test coordination and are excluded from the counted wake-up payloads.
- A held publisher inserts job99 and queues its trigger notification. Independent inventories
  still show only completed job1/credit5, and the listening client receives no new wake-up through
  the before-rollback barrier. ROLLBACK discards both row and notification; a later barrier confirms
  no wake-up was delivered. Another held publisher inserts jobs2/3 with amounts7/11. Before COMMIT
  neither work nor wake-up is visible; afterward two pending jobs exist and exactly one new
  wake-up reaches the listener. This is commit-dependent eligibility, not simultaneous client
  delivery or a guarantee that every retained read snapshot can see the new rows.
- The actual listening client begins a processing transaction and returns tentative credits12/23
  for jobs2/3. pg_stat_activity shows its idle-in-transaction state and backend_xid, while separate
  reads still see those jobs pending, only job1's receipt and credit5. Popen.kill sends SIGKILL to
  that owned psql client, wait reaps exit-9, and the driver waits until its backend disappears.
  Receipt, credit and completion all roll back. Receiving the wake-up did not complete the work.
- With no other client backend present, jobs4/5 (amounts13/17) commit while the listener is absent.
  Their wake-up has no subscribed recipient. A replacement psql session commits LISTEN, then
  receives a fresh barrier with zero replayed wake-ups; four old jobs remain pending at credit5.
  Job6/amount19 commits after registration but before the replacement's initial durable scan.
- That real replacement listener scans all pending jobs2–6 and atomically applies them, returning
  cumulative credits12/23/36/53/72. It receives only job6's one new wake-up, while recovering five
  jobs whose earlier processing or signalling was lost. An extra generic wake-up then prompts an
  empty scan; a further bounded poll also finds nothing. Done status, not signal count or payload,
  prevents another credit. The finite driver coordinates these scan points explicitly; it is not
  an always-running listener service or a poll-latency benchmark.
- json_agg with ordering and coalesce(...,'[]') produces complete inventories; row_to_json records
  backend state. emit writes JSON beside raw session logs. Final assertions match all six jobs and
  receipts by identity/customer/amount, each cumulative credit and total72. Failed job99 is absent.
  pg_locks verifies no waiting locks remain. Normal listener exit clears its subscription.
- After a normal server stop/start, a new listener commits registration and scans durable state:
  no work remains, no old wake-ups replay, and all rows/credit72 persist. finally reaps only this
  run's clients, stops this private server and retains its data/logs/JSON. Publisher rollback and
  actual listener-process loss are measured; no network packet loss or host power failure is claimed.`,
  code: NOTIFY_CORE,
  expectedResult: code`
Core's job1 commits before LISTEN registration commits, so the first durable scan applies it for
credit5 with zero startup wake-ups. The variation changes only that publication to just after
LISTEN commit, producing one startup wake-up and the same credit5. In both paths, the listener's
subsequent query confirms registration before the durable scan.

The held job99 publisher makes neither its row nor wake-up visible; rollback leaves both absent.
The committed two-row jobs2/3 batch produces exactly one wake-up because both trigger calls carry
identical channel/payload in one transaction. The listener's tentative processing returns12/23
inside BEGIN while independent state remains credit5, one receipt and jobs2/3 pending. Killing that
actual listener yields exit-9, backend disappearance and complete rollback of its batch.

Jobs4/5 commit while no listener exists. Reconnection receives no historical wake-ups; the durable
inventory still has jobs2–5 pending. Job6 commits after the replacement's LISTEN commit and before
its scan. That scan processes all five pending jobs and returns cumulative credits12/23/36/53/72,
although only one new work wake-up is received. An extra wake-up and a further poll both return an
empty processing array and leave credit72 unchanged.

Final six done jobs and six matching receipts carry amounts5/7/11/13/17/19, customer names and
cumulative credits5/12/23/36/53/72. Job99 is absent, all amounts sum72, no job remains pending and
there is no waiting lock. Normal server restart preserves all data; a newly registered listener
finds no work or replayed wake-ups. All five client processes are reaped (first listener-9, four
normal exits) and the server stops. Barrier payloads are separate coordination signals; count only
wake-up when comparing work notifications. Paths, PIDs, timing and system identifiers vary.`,
  systemsLens: code`
A durable work inventory and an ephemeral signal answer different questions. Notifications reduce
the need to wait for the next poll, while scans reconcile actual unfinished work across startup,
rollback and disconnection. Commit registration before the initial fresh scan; tolerate overlap
between that scan and received wake-ups. Keep the local business effect, receipt and completion
atomic, and retain identities/status so repeated scans do not repeat effects. This lesson's local
PostgreSQL credit is not an independent external receiver commit; the outbox lesson handles that
additional boundary.`,
  challenge: code`
Predict the startup notification count when job1 moves from before to after LISTEN commit, with
its publication still before the first durable scan. Run the complete hint2 variation and explain
why final credits remain identical. Then design a worker's startup/reconnect sequence, bounded poll
policy and local commit boundary using evidence from the one-wake/two-job batch, lost listener,
one-wake/five-job recovery and empty redundant scan. State what changes if the business effect is
an external API and can commit independently of this database.`,
  caution: code`
Run the complete block in a shell with Python3 and PostgreSQL16 server tools. It creates one private
Unix-socket cluster, kills its own listener during an uncommitted processing batch and stops all
owned clients and the server afterward. Logs/JSON and data remain under the printed /tmp path.
The trigger and processing function assume these controlled publishers/workers; arbitrary direct
writers could violate their protocol. Learner databases and progress are untouched.`,
};
