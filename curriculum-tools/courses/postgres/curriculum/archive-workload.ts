import { code, type Draft } from "../../../src/types.ts";
import { OWNED_CLUSTER_PY } from "./owned-cluster.ts";

function archiveExperiment(segments: number): string {
  return "python3 - <<'PY'\n" + OWNED_CLUSTER_PY + `\nsegments = ${segments}\n` + code`
import hashlib
archive, gate = root / "archive", root / "archive.blocked"
archive.mkdir()
if os.geteuid() == 0:
    os.chown(archive, owner.pw_uid, owner.pw_gid)
gate.touch()
script = root / "archive.py"
script.write_text(
    "import pathlib, shutil, sys\n"
    + "archive = pathlib.Path(" + repr(str(archive)) + ")\n"
    + "gate = pathlib.Path(" + repr(str(gate)) + ")\n"
    + "if gate.exists():\n    print('owned archive gate is closed', file=sys.stderr)\n    sys.exit(1)\n"
    + "source, name = pathlib.Path(sys.argv[1]), sys.argv[2]\n"
    + "destination = archive / name\n"
    + "if destination.exists():\n"
    + "    sys.exit(0 if destination.read_bytes() == source.read_bytes() else 1)\n"
    + "temporary = archive / (name + '.partial')\n"
    + "shutil.copyfile(source, temporary)\n"
    + "temporary.replace(destination)\n")
# Root's script is readable by the private server's OS owner.
script.chmod(0o644)
with (data / "postgresql.conf").open("a") as config:
    config.write("archive_mode=on\narchive_command='python3 " + str(script) + " %p %f'\n")

def stats():
    return json.loads(sql("select row_to_json(s) from pg_stat_archiver s"))

def wal_bytes():
    return int(sql("select coalesce(sum(size),0) from pg_ls_waldir() where name ~ '^[0-9A-F]{24}$'"))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def emit(label, value):
    print(label + ": " + json.dumps(value, sort_keys=True), flush=True)
    (root / (label + ".json")).write_text(json.dumps(value, indent=2))

try:
    start()
    sql("create table archive_receipts(id int primary key, amount int check(amount > 0))")
    before = stats()
    settings = json.loads(sql("select json_build_object('wal_segment_size',current_setting('wal_segment_size'),"
        "'max_wal_size',current_setting('max_wal_size'),'archive_mode',current_setting('archive_mode'),"
        "'data_directory',current_setting('data_directory'))"))
    emit("settings", settings)
    targets = []
    for receipt in range(1, segments + 1):
        sql("insert into archive_receipts values (" + str(receipt) + ",10)")
        # A boundary LSN maps to the segment that just finished.
        targets.append(sql("select pg_walfile_name(pg_switch_wal())"))
    assert len(set(targets)) == segments
    wait_for("an actual archive command failure", lambda: stats()["failed_count"] > before["failed_count"])
    sql("checkpoint")
    ready = data / "pg_wal" / "archive_status"
    hashes = {name: digest(data / "pg_wal" / name) for name in targets}
    assert all((ready / (name + ".ready")).exists() for name in targets)
    assert not any((archive / name).exists() for name in targets)
    failed = stats()
    retained = wal_bytes()
    budget = int(sql("select pg_size_bytes(current_setting('max_wal_size'))"))
    assert retained > budget
    emit("failure", dict(stats=failed, target_segments=len(targets), retained_bytes=retained,
                         soft_budget_bytes=budget, all_targets_ready=True, target_hashes=hashes))

    # Repair only the owned failure gate. New WAL wakes the archiver; polling proves completion.
    gate.unlink()
    sql("insert into archive_receipts values (" + str(segments + 1) + ",10)")
    wake = sql("select pg_walfile_name(pg_switch_wal())")
    wait_for("every target and the wake segment to archive", lambda:
        all((archive / name).is_file() for name in targets + [wake])
        and stats()["archived_count"] >= before["archived_count"] + segments + 1, seconds=75)
    assert all(digest(archive / name) == hashes[name] for name in targets)
    assert not any((ready / (name + ".ready")).exists() for name in targets)
    sql("checkpoint")
    reclaimed = [name for name in targets if not (data / "pg_wal" / name).exists()]
    assert reclaimed, "Expected at least one old target name to become eligible for removal/recycling"
    outcome = json.loads(sql("select json_build_object('rows',count(*),'amount',sum(amount)) from archive_receipts"))
    assert outcome == dict(rows=segments + 1, amount=10 * (segments + 1))
    emit("repair", dict(stats=stats(), bytes_in_pg_wal=wal_bytes(), reclaimed_target_names=reclaimed,
                        archived_targets_match=True, outcome=outcome))
    print("PASS: failed archive retained WAL beyond the soft budget; repair copied every target; receipts agree.", flush=True)
finally:
    stop()
    print("Private server stopped; retained data, archive, hashes and log at", root, flush=True)
PY`;
}

export const ARCHIVE_WORKLOAD_VARIATION = archiveExperiment(20);
export const ARCHIVE_WORKLOAD: Draft = {
  slug: "wal-files-and-recycling",
  revision: 4,
  tags: ["wal", "backup", "durability", "capacity"],
  title: "Archive failure: retained history exceeds the WAL budget",
  difficulty: "advanced",
  safetyLevel: "privileged",
  runIn: "shell",
  estimatedMinutes: 25,
  prerequisites: ["every-change-is-a-wal-record"],
  overview: code`
An archive consumer that cannot accept completed WAL prevents PostgreSQL from reclaiming needed
history. Cause that failure in a fresh private cluster, exceed its small WAL target with a bounded
workload, then repair the consumer and prove every selected segment arrived unchanged. Decide which
measurements would warn you before retained history exhausted a service's disk.`,
  reading:
    code`PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "WAL Structure", "WAL Setup")`,
  readingNotes: code`
Chapter 10 supplies the segment, recycling and WAL-budget model; it does not cover archive_command
or pg_stat_archiver. This experiment extends that model to a failing consumer. Actual backup
restoration follows in the recovery lessons.`,
  caution: code`
Run in a shell with Python 3 and PostgreSQL server binaries installed; PGBIN may name their directory.
The script creates its own /tmp/pg-owned-* directory and socket, disables TCP, and stops that server
in finally. When run as root it uses the postgres OS account through runuser; otherwise it uses your
account. No existing PGHOST, PGPORT or PGLAB is used. Each run retains tens of MB of evidence plus
cluster files. Inspect the printed path before removing that stopped experiment later.
The local archive copy is an observable handoff, not an off-host backup or a crash-tested storage
protocol. Do not reuse this teaching archive script as production backup software.`,
  syntaxBreakdown: code`
### In plain terms

A log producer cannot discard history that an archive consumer still needs. max_wal_size is a soft
checkpoint target, not a ceiling that overrides this dependency. You will see actual failed archive commands,
retained files, successful repair and unchanged application receipts.

### What you are learning

- **Segment boundaries:** initdb fixes segment size; switching seals the current segment early.
- **Retention:** completed but unarchived segments remain needed across a checkpoint.
- **Consumer recovery:** success requires the selected files and their bytes, not just one advancing counter.
- **Capacity:** a controlled segment-count experiment demonstrates the dependency without filling a disk.

### Piece by piece

- **python3** runs the supplied driver. **tempfile.mkdtemp** allocates a unique owned directory;
  **PGBIN** or **pg_config --bindir** locates server tools. The driver clears inherited PG connection
  variables and uses its own socket; port6543 is a socket filename component with TCP disabled.
- **runuser -u ... --** selects the postgres OS owner when invoked as root. **os.chown** assigns the
  private directories to that owner. Non-root runs need neither operation.
- **initdb -D** chooses the newly allocated data directory; **-U** names its database superuser.
  **--auth-local=trust** is confined by the private directory; **--auth-host=reject** rejects TCP
  authentication. **--no-locale** removes locale variation, **--data-checksums** enables page
  checksums, and **--wal-segsize=1** makes each segment1MB for this small experiment.
- **pg_ctl -D ... -l ... -w -t20 start** writes a retained server log and waits at most20 seconds.
  **-m fast ... stop** disconnects clients, rolls back active transactions and shuts down the owned
  cluster. The driver bounds initdb, pg_ctl, psql and polling phases; failures retain the log.
- **fsync**, **synchronous_commit** and **full_page_writes** remain enabled. **wal_level=replica**
  permits archiving; **min_wal_size=2MB** and **max_wal_size=8MB** make retention visible cheaply.
  **checkpoint_timeout=1h** avoids a short timer controlling the experiment.
- **archive_mode=on** activates the archiver. **archive_command** substitutes **%p** (source path)
  and **%f** (segment name) into the supplied copy script. A gate file makes it return exit1; after
  repair, a complete temporary copy is renamed into the local archive. An existing identical file
  returns success; different bytes return failure. Atomic rename does not itself prove crash durability.
- **psql -X -At -v ON_ERROR_STOP=1 -c** ignores personal startup commands, emits one unaligned
  result without headings, stops on SQL errors and executes a query. **PGCONNECT_TIMEOUT**,
  **statement_timeout** and **lock_timeout** bound connection, statement and lock waits.
- **pg_walfile_name(pg_switch_wal())** records the just-completed segment. At an exact segment
  boundary, this naming function returns the preceding file; the next INSERT advances the stream.
- **pg_stat_archiver** supplies failed_count and archived_count from fresh observer connections.
  **pg_ls_waldir**, a24-hex-digit name filter and **sum(size)** count actual segment bytes.
  **pg_size_bytes** converts max_wal_size to the same unit. **CHECKPOINT** tests whether retention
  still prevents removal after dirty pages have been flushed.
- **archive_status/*.ready** identifies completed files waiting for archiving. The driver records
  SHA-256 hashes before repair, then checks each destination and the disappearance of its ready
  marker. **row_to_json/json_build_object** make counters and receipt aggregates readable evidence
  files; **wait_for** polls conditions, rather than assuming a sleep means success.
- **gate.unlink** repairs only the owned fault. A final receipt and switch wake the archiver.
  Another checkpoint permits obsolete names to disappear through removal or recycling. Those
  missing names do not distinguish deletion from renaming, and directory bytes need not fall to zero.`,
  code: archiveExperiment(12),
  expectedResult: code`
The settings report segment size1MB, WAL target8MB and archive_mode on. The failure report shows
failed_count increased, all12 selected segment files present with .ready markers, no corresponding
archive copies, and retained segment bytes greater than8388608 even after CHECKPOINT.

After repair all12 selected archived files match their recorded SHA-256 hashes, and the wake
segment is archived too. archived_count has risen by at least13; the historical failed_count need
not return to zero. At least one old target name disappears from pg_wal after the second checkpoint.
The final independent query reports rows13 and amount130. Exact counts of archive retries, elapsed
time and remaining WAL files vary. PASS is printed only after these assertions; the private server
is stopped and its evidence path retained.`,
  systemsLens: code`
A producer's reclamation boundary is coupled to its slowest required consumer. A checkpoint budget
cannot override history still needed by an archive, just as a log service cannot honor a strict
space target and indefinitely retain every lagging consumer's data. Monitor retained bytes, free
space, consumer progress and time to exhaustion; decide whether to repair, add capacity, throttle
production or deliberately abandon a recovery guarantee. A same-disk copy proves neither host-loss
survival nor restorability, which require additional failure boundaries and tests.`,
  challenge: code`
Predict what happens if the failure lasts for20 sealed segments instead of12, with the same8MB
budget and one10-unit receipt per segment. Run the complete variation from pgcoach hint2; compare
retained bytes and final receipts against the workload denominator. Explain why this bounded run
proves a soft budget but does not measure time to disk exhaustion under a production byte rate.`,
};
