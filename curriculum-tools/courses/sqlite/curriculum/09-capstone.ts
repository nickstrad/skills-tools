import { code, type Module } from "../../../src/types.ts";

export const CAPSTONE: Module = {
  category: "capstone",
  title: "Incident and architecture capstone",
  lessons: [
    {
      slug: "wal-growth-incident",
      title: "Diagnose a WAL-growth incident",
      difficulty: "advanced",
      tags: ["wal", "checkpoints", "incident", "backpressure"],
      prerequisites: ["checkpoint-starvation"],
      overview:
        "Hold a reader snapshot while a writer produces a bounded burst, inspect checkpoint progress and sidecar files, and then release the snapshot. Reconstruct a short incident timeline from evidence before restoring checkpoint progress.",
      syntaxBreakdown:
        "PRAGMA journal_mode=WAL enables the write-ahead log. wal_checkpoint(PASSIVE) reports busy, log-frame, and checkpointed-frame counts. wal_checkpoint(TRUNCATE) asks SQLite to finish and truncate the WAL when readers permit it.",
      setup: code`
PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS incident_events;
CREATE TABLE incident_events(id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
DELETE FROM incident_events;
`,
      code: code`
-- Session A
BEGIN;
SELECT count(*) AS reader_snapshot FROM incident_events;
.print timeline: reader opened
.shell stat -c 'wal_bytes_before=%s' "$TUTOR_SQLITE_DB-wal" 2>/dev/null || true
-- Session B
PRAGMA wal_autocheckpoint=0;
BEGIN;
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 200)
INSERT INTO incident_events(payload) SELECT printf('burst-a-%04d-%s', x, hex(randomblob(700))) FROM n;
COMMIT;
BEGIN;
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 200)
INSERT INTO incident_events(payload) SELECT printf('burst-b-%04d-%s', x, hex(randomblob(700))) FROM n;
COMMIT;
BEGIN;
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 200)
INSERT INTO incident_events(payload) SELECT printf('burst-c-%04d-%s', x, hex(randomblob(700))) FROM n;
COMMIT;
.print timeline: writer committed 600 rows
.shell stat -c 'wal_bytes_after_write=%s' "$TUTOR_SQLITE_DB-wal" 2>/dev/null || true
PRAGMA wal_checkpoint(PASSIVE);
.print timeline: passive checkpoint attempted while reader remains open
.shell stat -c 'wal_bytes_after_passive=%s' "$TUTOR_SQLITE_DB-wal" 2>/dev/null || true
-- Session A
SELECT count(*) AS still_old_snapshot FROM incident_events;
COMMIT;
-- Session B
PRAGMA wal_checkpoint(TRUNCATE);
.print timeline: reader released and truncate completed
.shell stat -c 'wal_bytes_after_truncate=%s' "$TUTOR_SQLITE_DB-wal" 2>/dev/null || true
SELECT count(*) AS current_rows FROM incident_events;
`,
      expectedResult:
        "The labeled timeline reports wal_bytes_before, wal_bytes_after_write, wal_bytes_after_passive, and wal_bytes_after_truncate for TUTOR_SQLITE_DB-wal. Session A first sees 0 rows and continues to see 0 inside its read transaction. Session B commits three 200-row, large-payload transactions while A is open; wal_bytes_after_write and the passive checkpoint log-frame count are visibly larger than zero. The passive checkpoint output is a three-column tuple (busy, log frames, checkpointed frames); it normally reports 0 busy and 0 checkpointed frames because A pins the old snapshot. After A commits, TRUNCATE returns 0|0|0, the final WAL size is 0 or near-zero, and current_rows is 600. No rows are lost.",
      systemsLens:
        "A long-lived reader extends the WAL reclamation horizon. New writes succeed, but checkpoint progress stalls and disk usage becomes backpressure. The incident is an interaction between snapshot lifetime and checkpoint policy, not a distributed replication event.",
      challenge:
        "Repeat with a reader that never ends and write until a filesystem budget is nearly reached. Define an alert based on reader age and WAL bytes, then release the reader and verify recovery.",
      caution:
        "The intentionally open read transaction blocks checkpoint reclamation. Keep the burst bounded and release Session A before leaving the lesson; never run an unbounded WAL-growth experiment on a valuable database.",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      minVersion: "3.45",
      estimatedMinutes: 30,
    },
    {
      slug: "offline-agent-capstone",
      title: "Assemble and recover an offline agent",
      difficulty: "advanced",
      tags: ["architecture", "outbox", "leases", "backup", "recovery"],
      prerequisites: ["wal-growth-incident"],
      overview:
        "Build a versioned application database that combines an outbox, idempotent inbox, fenced job lease, and oplog. Inject bounded process termination, duplicate transfer, a lost acknowledgement, a stale worker, and damage to a copy; then check recovery and convergence invariants.",
      syntaxBreakdown:
        "PRAGMA user_version stores an application schema generation. .backup makes an engine-coordinated copy. timeout bounds process termination. INSERT OR IGNORE and token-guarded UPDATE implement deduplication and fencing.",
      code: code`
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
lab_dir=$(dirname -- "$db")
if [ "$lab_dir" = / ] || [ ! -d "$lab_dir" ] || [ ! -w "$lab_dir" ]; then echo 'database parent must be an existing writable non-root directory' >&2; exit 2; fi
if [ -L "$db" ] || { [ -e "$db" ] && [ ! -f "$db" ]; }; then echo 'database path must not be a symlink or non-regular file' >&2; exit 2; fi
case "$lab_dir" in *"'"*) echo 'database parent may not contain a single quote for SQL path safety' >&2; exit 2;; esac
replica_b=$lab_dir/offline-agent-replica-b.db
backup=$lab_dir/offline-agent.backup.sqlite
damaged=$lab_dir/offline-agent.damaged.sqlite
recovered=$lab_dir/offline-agent.recovered.sqlite
rm -f "$db" "$db-journal" "$db-wal" "$db-shm" "$replica_b" "$replica_b-journal" "$replica_b-wal" "$replica_b-shm" "$backup" "$damaged" "$recovered"
sqlite3 "$db" <<'SQL'
PRAGMA journal_mode=WAL;
PRAGMA user_version=1;
CREATE TABLE accounts(id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);
CREATE TABLE outbox(op_id TEXT PRIMARY KEY, payload TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);
CREATE TABLE jobs(id INTEGER PRIMARY KEY, state TEXT NOT NULL, owner TEXT, token INTEGER NOT NULL, result TEXT);
CREATE TABLE oplog(op_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, seq INTEGER NOT NULL, payload TEXT NOT NULL, UNIQUE(device_id, seq));
INSERT INTO accounts VALUES (1, 100);
INSERT INTO jobs VALUES (1, 'claimed', 'agent-a', 1, NULL);
BEGIN;
UPDATE accounts SET balance = balance - 10 WHERE id = 1;
INSERT INTO outbox VALUES ('op-1', 'debit=10', 0);
INSERT INTO oplog VALUES ('device-a-1', 'device-a', 1, 'debit=10');
COMMIT;
SQL
sqlite3 "$replica_b" <<'SQL'
PRAGMA user_version=1;
CREATE TABLE accounts(id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);
CREATE TABLE inbox(op_id TEXT PRIMARY KEY, payload TEXT NOT NULL, applied INTEGER NOT NULL DEFAULT 0);
CREATE TABLE oplog(op_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, seq INTEGER NOT NULL, payload TEXT NOT NULL, UNIQUE(device_id, seq));
INSERT INTO accounts VALUES (1, 100);
SQL
echo '--- process termination before commit ---'
set +e
(printf '%s\n' 'BEGIN; INSERT INTO accounts VALUES (2, 50);'; sleep 5; printf '%s\n' 'COMMIT;') 2>/dev/null | timeout 1 sqlite3 "$db" >/dev/null
crash_status=$?
set -e
sqlite3 "$db" 'PRAGMA integrity_check; SELECT count(*) AS account_rows_after_crash FROM accounts;'
echo "terminated_process_exit=$crash_status"
echo '--- duplicate transfer and lost acknowledgement ---'
sqlite3 "$replica_b" <<'SQL'
BEGIN;
INSERT OR IGNORE INTO inbox(op_id, payload) VALUES ('op-1', 'debit=10');
SELECT changes() AS first_receipt;
COMMIT;
SQL
sqlite3 "$db" 'SELECT op_id, sent FROM outbox;'
sqlite3 "$replica_b" <<'SQL'
BEGIN;
INSERT OR IGNORE INTO inbox(op_id, payload) VALUES ('op-1', 'debit=10');
SELECT changes() AS duplicate_receipt;
UPDATE accounts SET balance = balance - 10 WHERE id = 1 AND EXISTS (SELECT 1 FROM inbox WHERE op_id = 'op-1' AND applied = 0);
UPDATE inbox SET applied = 1 WHERE op_id = 'op-1' AND applied = 0;
COMMIT;
SELECT count(*) AS logical_receipts, (SELECT balance FROM accounts WHERE id = 1) AS replica_b_balance FROM inbox;
SQL
sqlite3 "$db" <<'SQL'
UPDATE outbox SET sent = 1 WHERE op_id = 'op-1' AND sent = 0;
SELECT op_id, sent FROM outbox;
SQL
sqlite3 "$replica_b" <<'SQL'
INSERT OR IGNORE INTO oplog VALUES ('device-a-1', 'device-a', 1, 'debit=10');
SELECT count(*) AS replica_b_oplog_rows FROM oplog;
SQL
echo '--- replica convergence ---'
replica_a_balance=$(sqlite3 "$db" 'SELECT balance FROM accounts WHERE id = 1;')
replica_b_balance=$(sqlite3 "$replica_b" 'SELECT balance FROM accounts WHERE id = 1;')
if [ "$replica_a_balance" = "$replica_b_balance" ]; then echo "replica_balances=$replica_a_balance/$replica_b_balance convergence=converged"; else echo "replica_balances=$replica_a_balance/$replica_b_balance convergence=diverged"; fi
echo '--- stale fenced worker ---'
sqlite3 "$db" <<'SQL'
UPDATE jobs SET owner = 'agent-b', token = token + 1, state = 'claimed' WHERE id = 1;
UPDATE jobs SET state = 'done', result = 'late-a' WHERE id = 1 AND owner = 'agent-a' AND token = 1;
SELECT changes() AS stale_worker_rows;
UPDATE jobs SET state = 'done', result = 'result-b' WHERE id = 1 AND owner = 'agent-b' AND token = 2;
SELECT id, state, owner, token, result FROM jobs;
SQL
sqlite3 "$db" ".backup '$backup'"
echo "source_integrity=$(sqlite3 "$db" 'PRAGMA integrity_check;')"
echo "backup_integrity=$(sqlite3 "$backup" 'PRAGMA integrity_check;')"
echo "backup_user_version=$(sqlite3 "$backup" 'PRAGMA user_version;')"
echo "backup_balance=$(sqlite3 "$backup" 'SELECT balance FROM accounts WHERE id = 1;')"
cp "$backup" "$damaged"
dd if=/dev/zero of="$damaged" bs=1 seek=100 count=8 conv=notrunc status=none
set +e
sqlite3 "$damaged" 'PRAGMA integrity_check;' >"$lab_dir/damaged-check.out" 2>&1
damaged_status=$?
sqlite3 "$damaged" '.recover' >"$lab_dir/recover.sql" 2>"$lab_dir/recover.err"
recover_status=$?
set -e
echo "damaged_integrity_exit=$damaged_status"
echo "recover_status=$recover_status"
cat "$lab_dir/recover.err"
if grep -q 'sqlite_dbpage' "$lab_dir/recover.err"; then
  echo 'recover_fallback=dump'
  sqlite3 "$damaged" '.dump' >"$lab_dir/dump.sql" 2>"$lab_dir/dump.err" || true
  sqlite3 "$recovered" <"$lab_dir/dump.sql" || true
else
  echo 'recover_fallback=none'
  sqlite3 "$recovered" <"$lab_dir/recover.sql" || true
fi
echo "recovered_integrity=$(sqlite3 "$recovered" 'PRAGMA integrity_check;' 2>&1 || true)"
echo "recovered_tables=$(sqlite3 "$recovered" 'SELECT count(*) FROM sqlite_master WHERE type = "table";' 2>&1 || true)"
rm -f "$replica_b" "$replica_b-journal" "$replica_b-wal" "$replica_b-shm"
`,
      expectedResult:
        "The bounded terminated process exits 124, but source integrity_check is ok and account_rows_after_crash is 1, so the uncommitted account row is absent. Replica B's first receipt is 1, duplicate_receipt is 0, logical_receipts is 1, and its balance becomes 90 exactly once; the sender outbox advances to sent = 1 after the lost acknowledgement is retried. Replica B receives one oplog row, and replica_balances=90/90 reports convergence=converged. The stale worker update changes 0 rows; agent-b token 2 completes the job. Source and engine-created backup integrity are both ok; backup_user_version=1 and backup_balance=90. The damaged copy reports a nonzero integrity exit. On SQLite 3.45.1, recover_status=1 and stderr contains sql error: no such table: sqlite_dbpage (1), so the script selects recover_fallback=dump; that fallback prints recovered_integrity=ok and recovered_tables=0. Builds with sqlite_dbpage instead load the captured .recover SQL and print their actual recovered integrity/table count. Salvage is evidence only, not a backup guarantee.",
      systemsLens:
        "Reliable local systems compose small invariants at transaction boundaries: intent with state, receipts with deduplication, ownership with fencing, and recovery with verified copies. SQLite supplies local atomicity and recovery machinery; delivery, failure domains, and convergence policy still belong to the application.",
      challenge:
        "Add a schema migration that increments user_version, then rehearse restore into a clean directory and measure elapsed recovery time. Define which missing remote effects belong in the RPO statement.",
      caution:
        "This lesson deliberately terminates a disposable process and modifies only a copy of the backup. Set TUTOR_SQLITE_DB to a uniquely named lab path, preserve original evidence, and never run damage commands against a source database.",
      safetyLevel: "dangerous",
      runIn: "shell",
      sessions: 1,
      minVersion: "3.45",
      estimatedMinutes: 45,
    },
    {
      slug: "sqlite-architecture-decision",
      title: "Write an evidence-backed SQLite architecture decision",
      difficulty: "advanced",
      tags: ["architecture", "capacity", "durability", "rto", "observability"],
      prerequisites: ["offline-agent-capstone"],
      overview:
        "Measure a small capstone-shaped workload and turn the observations into an ADR/runbook. State concurrency, latency, durability mode, backup cadence, RPO, RTO, failure domain, invariant checks, and explicit exit criteria for moving beyond SQLite.",
      syntaxBreakdown:
        "EXPLAIN QUERY PLAN records an access mechanism. PRAGMA synchronous and journal_mode state durability settings. stat reports file bytes. A shell heredoc writes an auditable ADR beside the disposable database.",
      code: code`
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
lab_dir=$(dirname -- "$db")
if [ "$lab_dir" = / ] || [ ! -d "$lab_dir" ] || [ ! -w "$lab_dir" ]; then echo 'database parent must be an existing writable non-root directory' >&2; exit 2; fi
if [ -L "$db" ] || { [ -e "$db" ] && [ ! -f "$db" ]; }; then echo 'database path must not be a symlink or non-regular file' >&2; exit 2; fi
case "$lab_dir" in *"'"*) echo 'database parent may not contain a single quote for SQL path safety' >&2; exit 2;; esac
decision=$lab_dir/sqlite-architecture-adr.md
test_db=$lab_dir/architecture-decision.sqlite
backup=$lab_dir/architecture-decision.backup.sqlite
restored=$lab_dir/architecture-decision.restored.sqlite
rm -f "$test_db" "$test_db-wal" "$test_db-shm" "$test_db-journal" "$backup" "$restored" "$decision"
sqlite3 "$test_db" <<'SQL'
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
CREATE TABLE events(id INTEGER PRIMARY KEY, tenant TEXT NOT NULL, payload TEXT NOT NULL);
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 5000)
INSERT INTO events SELECT x, 'tenant-' || (x % 100), 'event-' || x FROM n;
CREATE INDEX events_tenant_idx ON events(tenant);
ANALYZE;
SQL
version=$(sqlite3 "$test_db" 'SELECT sqlite_version();')
plan=$(sqlite3 "$test_db" "EXPLAIN QUERY PLAN SELECT payload FROM events WHERE tenant = 'tenant-7';")
pages=$(sqlite3 "$test_db" 'PRAGMA page_count;')
bytes=$(stat -c '%s' "$test_db")
timer_output=$(sqlite3 "$test_db" <<'SQL' 2>&1
.timer on
SELECT count(*) FROM events WHERE tenant = 'tenant-7';
.timer off
SQL
)
restore_start=$(date +%s%N)
sqlite3 "$test_db" ".backup '$backup'"
sqlite3 "$backup" ".backup '$restored'"
sqlite3 "$restored" 'PRAGMA integrity_check; SELECT count(*) FROM events WHERE tenant = "tenant-7";' >"$lab_dir/restore-check.out"
restore_end=$(date +%s%N)
restore_ms=$(( (restore_end - restore_start) / 1000000 ))
echo '# SQLite architecture decision' >"$decision"
echo '' >>"$decision"
echo '## Observed evidence' >>"$decision"
echo "- SQLite runtime version: $version" >>"$decision"
echo "- Query plan: $plan" >>"$decision"
echo "- Main-file bytes: $bytes" >>"$decision"
echo "- Page count: $pages" >>"$decision"
echo "- Timed lookup output: $timer_output" >>"$decision"
echo "- Backup/restore check: $(cat "$lab_dir/restore-check.out")" >>"$decision"
echo "- Measured backup/restore elapsed milliseconds: $restore_ms" >>"$decision"
echo '' >>"$decision"
echo '## Decision and boundaries' >>"$decision"
echo '- Use SQLite for one-host embedded state with one writer and bounded reader concurrency.' >>"$decision"
echo '- Keep WAL on a local filesystem; it is not distributed replication or consensus.' >>"$decision"
echo '- Use NORMAL only when the documented synchronization contract and recovery objective accept its trade-off; otherwise measure FULL.' >>"$decision"
echo '- Run engine integrity checks plus domain invariant queries after restore.' >>"$decision"
echo '- Chosen backup cadence: every 15 minutes, with RPO <= 15 minutes as an explicit assumption to verify in a restore rehearsal.' >>"$decision"
echo '- Chosen restore objective: RTO <= 5 minutes, measured from backup selection through integrity and domain checks.' >>"$decision"
echo '- Failure domain: one host and its local filesystem; a host loss requires an independently stored backup.' >>"$decision"
echo '- Invariant checks: integrity_check, foreign_key_check, account/outbox balance, receipt uniqueness, and lease-token monotonicity.' >>"$decision"
echo '- Back up with .backup or VACUUM INTO, then restore-test on the 15-minute cadence to measure RPO/RTO.' >>"$decision"
echo '' >>"$decision"
echo '## Exit criteria' >>"$decision"
echo '- Move beyond SQLite when measured writer contention violates the latency budget, the required failure domain spans hosts, or backup/restore cannot meet the RPO/RTO.' >>"$decision"
echo '' >>"$decision"
echo '## References' >>"$decision"
echo '- Course observations above (plans, bytes, pages, timings).' >>"$decision"
echo '- https://www.sqlite.org/wal.html' >>"$decision"
echo '- https://www.sqlite.org/backup.html' >>"$decision"
echo '- https://www.sqlite.org/atomiccommit.html' >>"$decision"
cat "$decision"
`,
      expectedResult:
        "The script prints an ADR containing the measured query plan, main-file bytes, page count, and timer output, followed by explicit decisions and exit criteria. The plan uses events_tenant_idx, the row count is 50, and the file metrics are positive integers. Numbers and timings are host-specific; every operational claim in the ADR points either to observed evidence or to a SQLite primary reference.",
      systemsLens:
        "Architecture is a contract between workload requirements and measured guarantees. SQLite is a strong local state machine with a single-writer envelope; an ADR makes the failure domain, recovery objective, and trigger for a different system explicit before an incident forces the decision.",
      challenge:
        "Add a two-writer benchmark and a restore stopwatch to the ADR. Pick concrete latency, RPO, and RTO thresholds, then rerun measurements after changing synchronous and journal modes.",
      caution:
        "Do not copy host-specific timing into a universal claim. Keep the ADR with the workload, SQLite version, filesystem, and exact commands that produced its evidence.",
      safetyLevel: "writes-data",
      runIn: "shell",
      sessions: 1,
      minVersion: "3.45",
      estimatedMinutes: 35,
    },
  ],
};
