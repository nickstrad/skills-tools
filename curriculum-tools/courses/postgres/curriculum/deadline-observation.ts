import { code, type Draft } from "../../../src/types.ts";

const driver = code`
python3 - <<'PY'
import os, selectors, subprocess, time, uuid

for name in ('PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE'):
    if not os.environ.get(name):
        raise SystemExit('Set ' + name + ' to your disposable course lab first')
explicit = os.environ.get('OBS_AUTOCOMMIT', '0') != '1'
schema = 'obs_deadline_' + uuid.uuid4().hex[:12]
base = ['psql', '-X', '-q', '-At', '-P', 'pager=off']
clients = []

def query(sql):
    run = subprocess.run(base + ['-v', 'ON_ERROR_STOP=1', '-c', sql],
                         text=True, capture_output=True, timeout=5)
    if run.returncode:
        raise RuntimeError(run.stderr)
    return run.stdout.strip()

class Client:
    def __init__(self):
        self.proc = subprocess.Popen(base + ['-v', 'ON_ERROR_STOP=0'], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        clients.append(self)
    def send(self, sql):
        marker = 'END_' + uuid.uuid4().hex
        self.proc.stdin.write((sql + '\n\\echo ' + marker + '\n').encode())
        self.proc.stdin.flush()
        data = b''
        deadline = time.monotonic() + 5
        with selectors.DefaultSelector() as ready:
            ready.register(self.proc.stdout, selectors.EVENT_READ)
            while marker.encode() not in data:
                if time.monotonic() >= deadline:
                    raise TimeoutError('Owned psql response deadline exceeded')
                if ready.select(0.1):
                    chunk = os.read(self.proc.stdout.fileno(), 65536)
                    if not chunk:
                        raise RuntimeError('Owned psql disconnected: ' + data.decode())
                    data += chunk
        return data.decode().split(marker)[0].strip()
    def close(self):
        if self.proc.poll() is None:
            try:
                self.proc.communicate(b'\\q\n', timeout=2)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=2)

try:
    query('create schema ' + schema + '; create table ' + schema +
          ".ledger(id int primary key, note text); insert into " + schema + ".ledger values(1,'original')")
    holder = Client()
    holder_pid = int(holder.send('select pg_backend_pid();'))
    holder.send("set idle_in_transaction_session_timeout='5s'; begin; update " + schema +
                ".ledger set note='uncommitted' where id=1;")
    state = query('select state from pg_stat_activity where pid=' + str(holder_pid))
    locks = query("select count(*) from pgrowlocks('" + schema + ".ledger')")
    print('before timeout:', 'pid=' + str(holder_pid), 'state=' + state, 'locked_rows=' + locks)
    assert state == 'idle in transaction' and locks == '1'
    deadline = time.monotonic() + 10
    while query('select count(*) from pg_stat_activity where pid=' + str(holder_pid)) != '0':
        if time.monotonic() >= deadline:
            raise TimeoutError('Idle backend did not disappear')
        time.sleep(0.1)
    note = query('select note from ' + schema + '.ledger where id=1')
    locks = query("select count(*) from pgrowlocks('" + schema + ".ledger')")
    assert note == 'original' and locks == '0'
    print('after timeout: backend_absent=true locked_rows=0 note=' + note)
    output, _ = holder.proc.communicate(b"select 'probe';\n", timeout=5)
    output = output.decode()
    print('expired client:', output.strip(), 'exit=' + str(holder.proc.returncode))
    assert 'idle-in-transaction timeout' in output and holder.proc.returncode != 0

    survivor = Client()
    new_pid = int(survivor.send('select pg_backend_pid();'))
    assert new_pid != holder_pid
    print('reconnected: new_backend=true note=' + query('select note from ' + schema + '.ledger'))
    survivor.send("set statement_timeout='200ms';" + (' begin;' if explicit else ''))
    survivor.send('insert into ' + schema + ".ledger values(99,'before statement timeout');")
    cancelled = survivor.send('select pg_sleep(2);\n\\echo SQLSTATE=:SQLSTATE')
    print(cancelled)
    assert 'SQLSTATE=57014' in cancelled
    probe = survivor.send("select 'usable';\n\\echo SQLSTATE=:SQLSTATE")
    print(probe)
    assert ('SQLSTATE=25P02' if explicit else 'SQLSTATE=00000') in probe
    if explicit:
        survivor.send('rollback;')
    same_pid = int(survivor.send('select pg_backend_pid();')) == new_pid
    persisted = query('select count(*) from ' + schema + '.ledger where id=99')
    assert same_pid and persisted == ('0' if explicit else '1')
    print('statement outcome:', 'explicit_transaction=' + str(explicit),
          'same_backend=true', 'earlier_insert_rows=' + persisted)
finally:
    for client in clients:
        client.close()
    query('drop schema if exists ' + schema + ' cascade')
PY`;

export const DEADLINE_OBSERVATION: Draft = {
  slug: "idle-in-transaction-kills-you",
  title: "Verify what a deadline cancels, rolls back and disconnects",
  tags: ["timeouts", "connections", "observability", "gc-horizon"],
  reading:
    code`PostgreSQL 14 Internals, Chapter 8 "Rebuilding Tables and Indexes" (section "Precautions"); Chapter 4 "Snapshots" (section "Transaction Horizon")`,
  readingNotes:
    code`These chapters explain why retained transactions or snapshots obstruct maintenance. This experiment focuses on transaction and connection cleanup; the earlier horizon experiments establish reclamation effects. Read afterward for the distinction between a held snapshot and a backend that is merely idle between statements.`,
  difficulty: "intermediate",
  safetyLevel: "locking",
  runIn: "shell",
  sessions: 1,
  revision: 4,
  estimatedMinutes: 25,
  prerequisites: [
    "wait-events-tell-you-where-time-goes",
    "lock-timeout-and-nowait",
    "install-lab-extensions",
  ],
  overview:
    code`A request timeout and an idle-transaction timeout act at different boundaries. Run supplied clients that hold uncommitted work, observe the actual backend and locks disappearing, then compare cancellation inside an explicit transaction with cancellation in autocommit. Verify stored rows and connection identity before choosing a retry policy.`,
  caution:
    code`Run from a shell with PGHOST, PGPORT, PGUSER and PGDATABASE set to your disposable lab, using psql and Python 3. The driver creates a uniquely named schema, owns two psql processes and drops only its schema after closing them. All deadlines are local to those clients; your interactive psql sessions are unaffected. A failed assertion stops the experiment and cleans up.`,
  code: driver,
  expectedResult:
    code`Before expiry the owned backend is idle in transaction and locked_rows=1. After its five-second idle deadline, polling observes backend_absent=true, locked_rows=0 and note=original. Its next request reports FATAL: terminating connection due to idle-in-transaction timeout, and noninteractive psql exits unsuccessfully. A new connection has a different backend PID.

In the explicit-transaction core, the two-second sleep reaches the 200ms statement deadline and reports SQLSTATE=57014. The next query returns 25P02 because the transaction is failed. After ROLLBACK the same backend works and earlier_insert_rows=0. The deliberate FATAL and two SQL errors are expected evidence; no other errors are expected.

The autocommit variation still gets 57014, but the next query succeeds (00000), the backend survives, and earlier_insert_rows=1. That earlier insert committed separately. PIDs and exact elapsed times vary; the checks establish outcomes instead of treating a fixed sleep as proof of cleanup.`,
  systemsLens:
    code`A deadline is a policy at a particular boundary, not a generic instruction to undo the last request. Statement cancellation can leave a connection alive with an unusable transaction; a session deadline destroys connection state. Establish the transaction outcome and the operation's identity before retrying. Local database cleanup does not revoke an external side effect or fence another service.`,
  challenge:
    code`Keep both timeout values and operations fixed, but omit the explicit BEGIN/ROLLBACK around the second client's work. Predict whether row 99 survives and whether the next query needs rollback. Run the exact autocommit variant from hint2.`,
  syntaxBreakdown: code`
### In plain terms

The supplied shell block runs clients for you so an idle timeout cannot race your typing. You inspect their state and stored rows, then explain why the two deadlines leave different connection and transaction outcomes.

### What you are learning

- Session expiry rolls back the owned unfinished transaction and releases its locks.
- Statement cancellation inside BEGIN requires ROLLBACK before reusing that connection.
- In autocommit, an earlier successful statement already has its own committed outcome.

### Piece by piece

- **PGHOST, PGPORT, PGUSER and PGDATABASE** (connection environment): Select the existing course lab explicitly. The driver refuses missing values; it never creates or restarts a server.
- **python3 - <<'PY'** (quoted shell here-document): Sends the supplied program to Python without shell expansion of its contents. OBS_AUTOCOMMIT=1 in the variation changes only the second client's transaction scope.
- **uuid.uuid4, CREATE SCHEMA and DROP SCHEMA ... CASCADE** (owned fixture): Generate a unique SQL-safe namespace for ledger. Cleanup cascades only within that generated schema after its clients close.
- **subprocess.run and Popen** (client processes): Short observer queries have a five-second process deadline. Persistent clients retain one connection across commands; communicate, kill and wait bound shutdown of those owned processes.
- **psql -X -q -At -P pager=off -v ON_ERROR_STOP** (client flags): -X ignores startup files; -q reduces chatter; -A removes alignment; -t removes headers; -P disables paging. ON_ERROR_STOP=1 makes unexpected observer errors fail; value 0 lets the persistent client report expected errors and continue to the next marker.
- **selectors, os.read, monotonic and \echo** (response boundaries): Wait up to five seconds for a unique psql marker after each block. Read stdout and stderr together so SQL failures remain visible. A marker means the client finished that block, not that SQL committed successfully.
- **pg_backend_pid, pg_stat_activity and pgrowlocks** (independent evidence): Record the holder's exact PID, observe its idle transaction, and count locked rows in the owned table. Repeated observer queries use fresh connections and snapshots.
- **idle_in_transaction_session_timeout** (session deadline): The holder sets five seconds, starts BEGIN, updates a row, then sends no SQL. Bounded polling waits for its actual disappearance; the client probe obtains the server's FATAL reason.
- **statement_timeout and pg_sleep(2)** (statement deadline): The second client sets 200ms and deliberately requests a two-second timer. SQLSTATE 57014 classifies cancellation; 25P02 classifies a later query in the failed transaction.
- **BEGIN, ROLLBACK and autocommit** (outcome boundaries): The core discards row 99 with its failed transaction; the variation's earlier INSERT commits before the failing sleep. PID equality establishes that the second connection survived.
- **assert and finally** (validation and cleanup): Assertions check locks, rows, PIDs and expected error codes. Finally closes every owned client and drops the fixture on success or failure; it preserves no learner progress.
`,
};
export const DEADLINE_VARIATION = driver.replace(
  "python3 - <<'PY'",
  "OBS_AUTOCOMMIT=1 python3 - <<'PY'",
);
