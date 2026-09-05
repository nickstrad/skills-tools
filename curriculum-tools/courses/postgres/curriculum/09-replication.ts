import { code, type Module } from "../../../src/types.ts";
import { SYNC_ACKNOWLEDGEMENT } from "./sync-acknowledgement.ts";
import { STANDBY_CONFLICTS } from "./standby-conflicts.ts";
import { SLOT_RETENTION } from "./slot-retention.ts";
import { FAILOVER_WORKLOAD } from "./failover-workload.ts";
import { REPLICA_READINESS } from "./replica-readiness.ts";
import { REPLAY_LAG } from "./replay-lag.ts";
import { STANDBY_WORKLOAD } from "./standby-workload.ts";

export const REPLICATION: Module = {
  category: "replication",
  title: "Physical streaming replication and failover",
  lessons: [
    STANDBY_WORKLOAD,

    REPLAY_LAG,

    REPLICA_READINESS,

    SYNC_ACKNOWLEDGEMENT,

    STANDBY_CONFLICTS,

    SLOT_RETENTION,

    FAILOVER_WORKLOAD,

    {
      slug: "rewind-the-old-primary",
      tags: ["failover", "timelines", "recovery", "fencing", "split-brain"],
      title: "pg_rewind: rejoin a diverged primary without a new base backup",
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 30,
      prerequisites: ["promote-the-standby"],
      overview: code`
The old primary has a write the new primary never saw. It cannot simply start following the new
primary: their histories diverged, and physical replication has no way to un-apply a page change.
The safe, slow answer is to throw the old primary away and take a fresh base backup -- 350 MB here,
terabytes in production.

pg_rewind is the fast answer. It asks the new primary "where did our timelines diverge", then reads
the old primary's WAL from that point forward to find every block it touched afterwards, copies
just those blocks back from the new primary, and rewinds the control file to the divergence point.
What is left is a data directory that can replay the new primary's history. The doomed row from the
previous lesson disappears -- physically, silently, with no error anywhere -- which is what
"resolving split brain" always means: somebody's committed data is chosen for deletion.`,
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".',
      syntaxBreakdown: code`
### In plain terms

After failover, the old primary may contain WAL that the promoted standby never received, so the two directories have diverged. **pg_rewind** finds the common history and copies only the changed blocks needed to make the old primary follow the new one. This is a repair step before rejoining it as a standby, not a way to merge two independent writers.

### What you are learning

- Rejoining a diverged server requires stopping it and finding a shared WAL history.
- Data checksums or wal_log_hints provide the block-change evidence pg_rewind needs.
- Rewind also copies configuration and removes target-only files, so settings must be restored afterward.

### Piece by piece

- **pg_rewind** (shell repair program)
  - What it is: Synchronizes a target data directory with a source after they diverged along related timelines.
  - What it does here: Rewrites the old primary so it can become a standby of the promoted server.
  - What it gives us: Its divergence LSN, copied-byte count, and Done message prove the target was repaired.
  - **--target-pgdata** names the stopped directory to repair; **--source-server** supplies a live source connection; **--source-pgdata** is the alternative for a stopped source.
  - **-R** writes standby.signal and primary_conninfo after the rewind; **--dry-run** reports work without changing files; **-P** prints progress.
- **clean shutdown** (server state requirement)
  - What it is: A shutdown that leaves the data directory consistent and records its final state.
  - What it does here: Allows pg_rewind to inspect the target; a crashed target must be started and stopped cleanly first.
  - What it gives us: pg_controldata reports Database cluster state: shut down, the prerequisite evidence.
- **data checksums** and **wal_log_hints** (block-change evidence)
  - What they are: Checksums detect page changes; wal_log_hints causes hint-bit changes to be WAL-logged.
  - What they do here: At least one must have been enabled when the cluster was initialized, otherwise pg_rewind cannot identify changed blocks.
  - What it gives us: The initialization setting explains why rewind can identify changed pages rather than copying the whole cluster.
- **postgresql.conf** and **postgresql.auto.conf** (data-directory configuration files)
  - What they are: Server settings stored inside the directory being synchronized.
  - What they do here: Source settings can overwrite target port and connection settings, so inspect and rewrite auto.conf before restarting the rejoined node.
  - What it gives us: cat output exposes the copied port and connection values that would otherwise start the node on the wrong socket.
- **standby.signal** and **primary_conninfo** (rejoin markers)
  - What they are: A marker and connection string that make the repaired directory follow its new source.
  - What they do here: -R creates them; the connection points at the promoted primary rather than the old 5440 role.
  - What it gives us: File existence plus the host=/tmp port=5441 line prove the old primary will follow the promoted source.
- **pg_controldata** (control-file shell reader)
  - What it is: Prints cluster state, timeline, and checkpoint location directly from a data directory.
  - What it does here: Confirms the target is shut down and shows the target/source histories before rewind.
  - What it gives us: Cluster state, TimeLineID, and Latest checkpoint location are the before-repair comparison.
- **--restore-target-wal / -c** (pg_rewind recovery option)
  - What it is: Allows rewind to fetch missing target WAL through restore_command instead of requiring it in pg_wal.
  - What it does here: The challenge names this fallback when wal_keep_size was too small and the required segment was recycled.
  - What it gives us: A successful fallback run proves restore_command supplied the missing history.
- **grep, tail, printf, cat, and ls** (shell file tools)
  - What they are: Filter lines, select the last match, write formatted text, print a file, and verify a file exists.
  - What they do here: Extract the newest primary_conninfo, rewrite auto.conf safely for the rejoined port, and verify standby.signal and startup log lines.
  - What it gives us: The final file and log output show exactly which source the restarted server follows.
`,
      caution: code`
pg_rewind deliberately destroys committed data on the target: everything the old primary wrote
after the divergence point is gone. In production you take a backup of the diverged node first if
the lost transactions might matter, because this is your only chance to read them.`,
      code: code`
export PATH=/usr/lib/postgresql/16/bin:$PATH
export PGLAB=$HOME/pglab

# 0. pg_rewind needs a cleanly shut down target. This is also, finally, the
#    fencing: the old primary stops writing.
psql -h /tmp -p 5440 -d lab -c 'select id, node from rep_split order by id'
pg_ctl -D "$PGLAB/primary" stop -m fast -w
pg_controldata -D "$PGLAB/primary" | grep -E 'cluster state|TimeLineID|Latest checkpoint location'
pg_controldata -D "$PGLAB/standby" | grep -E 'cluster state|TimeLineID|Latest checkpoint location'

# 1. Dry run first: it prints the divergence point without touching anything.
pg_rewind --target-pgdata="$PGLAB/primary" --source-server='host=/tmp port=5441 user=postgres dbname=postgres' --dry-run -P

# 2. For real, writing standby.signal and primary_conninfo on the way out.
pg_rewind --target-pgdata="$PGLAB/primary" --source-server='host=/tmp port=5441 user=postgres dbname=postgres' -R -P

# 3. Undo the footgun: the source's postgresql.auto.conf came along for the
#    ride and says port 5441, cluster_name lab-standby, archive_mode off. Keep
#    only the primary_conninfo line pg_rewind appended.
echo '--- postgresql.auto.conf as pg_rewind left it ---'
cat "$PGLAB/primary/postgresql.auto.conf"
# tail -1: there are two primary_conninfo lines now -- the source's, pointing at
# 5440, and the one pg_rewind just appended, pointing at 5441. The last wins.
CONNINFO=$(grep '^primary_conninfo' "$PGLAB/primary/postgresql.auto.conf" | tail -1)
printf '%s\n%s\n%s\n' '# Do not edit this file manually!' '# It will be overwritten by the ALTER SYSTEM command.' "$CONNINFO" > "$PGLAB/primary/postgresql.auto.conf"
echo '--- and as it must be ---'
cat "$PGLAB/primary/postgresql.auto.conf"
ls "$PGLAB/primary/standby.signal"

# 4. Start the old primary as a standby of the new one.
pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start -w
sleep 3
grep -E 'entering standby mode|new target timeline|consistent recovery state|started streaming' "$PGLAB/primary/log/postgresql.log" | tail -6
psql -h /tmp -p 5440 -d lab -x -c 'select pg_is_in_recovery(), (select timeline_id from pg_control_checkpoint()) as control_file_timeline, (select received_tli from pg_stat_wal_receiver) as streaming_timeline'
psql -h /tmp -p 5441 -d lab -x -c 'select application_name, state, sync_state, sent_lsn, replay_lsn from pg_stat_replication'

# 5. The doomed row is gone from the rewound node, and both nodes agree again.
echo '--- 5440 (rewound, now a standby) ---'; psql -h /tmp -p 5440 -d lab -c 'select id, node from rep_split order by id'
echo '--- 5441 (primary) ---'; psql -h /tmp -p 5441 -d lab -c 'select id, node from rep_split order by id'
psql -h /tmp -p 5441 -d lab -c "insert into rep_split(node) values ('written on 5441 while 5440 follows it')"
sleep 1
psql -h /tmp -p 5440 -d lab -c 'select id, node from rep_split order by id'`,
      expectedResult: code`
The old primary shuts down cleanly and pg_controldata shows the two histories side by side:

  target ($PGLAB/primary)   Database cluster state: shut down       TimeLineID: 1
                            Latest checkpoint location: 1/AF000028
  source ($PGLAB/standby)   Database cluster state: in production   TimeLineID: 2
                            Latest checkpoint location: 1/AE030D30

The dry run prints exactly what the real run will do, stopping just short of writing:

  pg_rewind: connected to server
  pg_rewind: servers diverged at WAL location 1/AE02ECB8 on timeline 1
  pg_rewind: rewinding from last common checkpoint at 1/AD000060 on timeline 1
  pg_rewind: reading source file list
  pg_rewind: reading target file list
  pg_rewind: reading WAL in target
  pg_rewind: need to copy 69 MB (total source directory size is 441 MB)
  71608/71608 kB (100%) copied
  pg_rewind: creating backup label and updating control file
  pg_rewind: syncing target data directory
  pg_rewind: Done!

"servers diverged at WAL location 1/AE02ECB8 on timeline 1" is the same LSN as the branch point in
00000002.history from the previous lesson; pg_rewind found it by reading the source's timeline
history, not by guessing. "need to copy 69 MB (total source directory size is 441 MB)" is the whole
value of the tool: 69 MB instead of 441 MB, and most of those 69 MB are the churn tables earlier
lessons left behind, not the one divergent row.

If you instead get "could not open file .../pg_wal/0000000100000001000000A9: No such file or
directory" followed by "could not find previous WAL record", the old primary recycled the WAL that
pg_rewind needs to read and the rewind is impossible. That is exactly what wal_keep_size in the
previous lesson prevents; pg_rewind -c (--restore-target-wal, which uses the target's
restore_command to fetch segments from the archive) is the other way out.

Then the configuration footgun, in full:

  --- postgresql.auto.conf as pg_rewind left it ---
  primary_conninfo = '... host=/tmp port=5440 ...'     <- copied from the source
  port = 5441                                          <- copied from the source
  cluster_name = 'lab-standby'                         <- copied from the source
  hot_standby = on
  archive_mode = off
  logging_collector = off
  primary_conninfo = '... host=/tmp port=5441 ...'     <- appended by pg_rewind -R

Started as it stands, the old primary would come up on port 5441 calling itself lab-standby. After
the rewrite the file holds only the primary_conninfo pointing at 5441, and standby.signal exists.

The restarted server is a standby of the node that replaced it:

  LOG:  entering standby mode
  LOG:  consistent recovery state reached at 1/AE035F88
  LOG:  started streaming WAL from primary at 1/AE000000 on timeline 2

  pg_is_in_recovery     | t
  control_file_timeline | 1     (still 1 until its first restartpoint)
  streaming_timeline    | 2

and from 5441 it looks like any other standby: application_name lab-primary, state streaming,
sent_lsn = replay_lsn = 1/AE035FC0.

The point of the lesson is one missing row:

  --- 5440 (rewound, now a standby) ---   --- 5441 (primary) ---
    1 | primary 5440, before promotion      1 | primary 5440, before promotion
   34 | NEW primary 5441, after promotion   34 | NEW primary 5441, after promotion

id 2, "OLD primary 5440, after promotion -- this write is doomed", is gone. It was committed, it
was fsynced, a client was told it had succeeded, and nothing anywhere raised an error when it was
deleted. The final INSERT on 5441 shows up on 5440 a second later as id 35: one history again.`,
      systemsLens: code`
pg_rewind is a log-diff-and-repair, and the reason it can exist is the same reason PITR can exist:
the WAL is a complete, ordered record of every block that changed, so "which blocks did I touch
after we diverged" is a question the log can answer exactly. It copies those blocks and nothing
else, which is why it takes seconds where a base backup takes hours. Merkle-tree repair in
Cassandra, rsync against a snapshot, and a Raft follower truncating its log to the leader's last
common index are all the same move: find the divergence point, and repair only the delta.

The important part is what it costs. Un-fencing a diverged node means deleting whatever it
committed alone, and there is no merge and no conflict resolution, because physical replication
does not know what a row is. Every operational consequence follows from that. It is why the old
primary must be stopped -- and stopped cleanly -- before you rewind it; why "just start it back up
and see" is the worst possible response to a failover; and why a system that lets two nodes accept
writes must either prevent divergence up front (a quorum, a lease, a fencing token) or accept that
recovering from it will delete someone's acknowledged data.

Notice the asymmetry that made this cheap: the divergence was seconds old. pg_rewind's cost is
proportional to how much the two nodes wrote after they split, not to database size, so a
split-brain caught in seconds is a seconds-long repair, and one caught in a day may be worse than a
full base backup. Detection latency is not just an availability metric; it is the thing that
decides which recovery procedure you get to use.`,
      challenge: code`
Read what pg_rewind actually did. Run it with --debug on a second divergence and count the blocks
it copied, then compare that with the size of the WAL between the divergence point and the old
primary's end of log. Then break it on purpose: crash the target with pg_ctl stop -m immediate
instead of -m fast and watch pg_rewind refuse with "target server must be shut down cleanly". Why
is that check not optional?`,
    },

    {
      slug: "cascading-and-failback",
      tags: [
        "failover",
        "streaming-replication",
        "timelines",
        "availability",
        "lab",
      ],
      title: "Cascade, fail back, and put the lab away",
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 35,
      prerequisites: ["rewind-the-old-primary"],
      overview: code`
Two things are left. The first is cascading: a standby is also a WAL sender, so you can chain
replicas, and 5440 -- which is currently a standby -- can feed a third node without the primary
knowing or caring. You will build one on port 5442, watch a write travel 5441 to 5440 to 5442, and
then throw it away.

The second is failback, and it is the whole reason this module can be run twice. The lab must end
exactly as module 01 built it: one primary on 5440 with its data in $PGLAB/primary, nothing on
5441, no standby directory, no replication slots, and a postgresql.auto.conf with no settings in
it. So you will reverse the roles one more time -- stop the primary on 5441 cleanly, confirm 5440
has replayed everything, promote it, and delete the rest. The only trace left is the timeline: the
lab started on timeline 1 and ends on timeline 3, one branch per promotion, which is exactly what
the .history files in pg_wal say.`,
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".',
      syntaxBreakdown: code`
### In plain terms

Replication does not have to be a star: one standby can forward WAL to another, creating a cascade. This lesson then performs a controlled failback, proving that the old primary is fully caught up before it is promoted or rejoined. The ordering prevents split brain, where two servers accept conflicting writes.

### What you are learning

- A cascading standby can receive and send WAL at the same time while still remaining in recovery.
- Failback is a sequencing problem: stop the writer, verify replay reached its final LSN, then promote or reconfigure.
- Resetting generated settings is part of cleanup because configuration files live with the data directory.

### Piece by piece

- **primary_conninfo** (standby connection setting)
  - What it is: Connection information naming the upstream PostgreSQL server.
  - What it does here: Pointing it at a standby makes that standby the middle node's WAL source.
  - What it gives us: The middle node can show a walreceiver connection upstream and a walsender connection downstream.
- **pg_is_in_recovery()** (role check)
  - What it is: Reports whether a server is still replaying WAL.
  - What it does here: It remains t on the cascading middle node even while that node serves another standby.
  - What it gives us: t plus a nonzero standbys_it_feeds count proves the middle node has both roles.
- **pg_stat_replication** (sender view)
  - What it is: Lists standbys connected to this server's walsender.
  - What it does here: Rows prove the middle node is forwarding WAL, not merely receiving it.
  - What it gives us: application_name, state, sent_lsn, and replay_lsn identify the downstream cascade and its progress.
- **pg_last_wal_replay_lsn()** (replay-position function)
  - What it is: Returns the latest WAL position applied by recovery.
  - What it does here: Compare it with the stopped primary's final LSN; equality or passage proves the old primary's changes are present before failback.
  - What it gives us: received and replayed values show whether it is safe to promote the node being failed back to.
- **pg_ctl stop -m fast** (controlled shutdown)
  - What it is: Stops a server after quickly terminating active sessions and flushing required state.
  - What it does here: Removes the old writer before promotion so no second writer can continue.
  - What it gives us: A clean shutdown state and a final WAL position establish the boundary for failback.
- **ALTER SYSTEM RESET ALL** (configuration cleanup command)
  - What it is: Removes all ALTER SYSTEM entries from postgresql.auto.conf.
  - What it does here: Clears inherited primary_conninfo and other temporary settings; inspect the file to confirm only comments remain.
  - What it gives us: An auto.conf containing only comments proves no old role or port override remains.
- **standby.signal** (role marker)
  - What it is: The file that requests recovery on the next startup.
  - What it does here: Promotion removes it, so a promoted node remains a primary after restart.
  - What it gives us: Its absence is the durable evidence that the final 5440 server will stay primary.
- **pg_basebackup** (replication backup program)
  - What it is: Copies a consistent data directory over a replication connection.
  - What it does here: Copies the middle standby into cascade, proving a standby can itself be a backup source.
  - What it gives us: Completion and the cascade startup log prove the third node joined the chain.
  - **-R, -D, -h, -p, -U, -c fast, -X stream, and -P** have the same meanings as the first lesson; here the source is port 5440 and the destination later listens on 5442.
- **cat >> ... <<CONF** (shell heredoc append)
  - What it is: Appends the lines between CONF markers to a file.
  - What it does here: Gives the cascade its own port, name, and log behavior after the base copy.
  - What it gives us: The resulting auto.conf values distinguish cascade port 5442 from its copied source.
- **pg_stat_wal_receiver** (receiver view)
  - What it is: Reports the upstream endpoint and WAL position for a standby receiver.
  - What it does here: sender_port 5440 and received_tli 2 prove the cascade follows the middle node's current timeline.
  - What it gives us: The receiver row identifies the upstream port and timeline actually in use.
- **rm -rf** (recursive shell removal)
  - What it is: Deletes a directory and its contents without prompting.
  - What it does here: Removes only the throwaway cascade and old standby directories after their servers are stopped; never aim it at an unknown path.
  - What it gives us: A later directory listing and socket check show the removed servers no longer exist or listen.
- **df -h** and **ss -ltn** (host checks)
  - What they are: Report filesystem capacity and listening TCP sockets.
  - What they do here: Confirm cleanup freed the expected directory and only port 5440 remains.
  - What it gives us: Filesystem and socket output are final operational evidence that the lab is reset.
`,
      caution: code`
This lesson is mandatory, not optional: it is what returns the lab to the layout every other module
assumes. When it finishes, check the list at the end -- 5440 in recovery = false, $PGLAB holding
only archive, backup1, primary and primary.log, nothing listening on 5441 or 5442, no replication
slots, and postgresql.auto.conf with no settings.

One thing does not come back: $PGLAB/archive is now a complete history of timeline 1 only. The
promoted standby ran with archive_mode = off (deliberately, see build-a-streaming-standby), so its
timeline-2 segments were never archived, and the only timeline-2 WAL that exists is inside
$PGLAB/primary. Point-in-time recovery from the archive can therefore still reach any moment on
timeline 1 but cannot follow the branch. In production each node archives to its own namespaced
location and you keep them all; in a lab with one archive directory, one writer is the only safe
rule.`,
      code: code`
export PATH=/usr/lib/postgresql/16/bin:$PATH
export PGLAB=$HOME/pglab

# ============ part 1: a cascading standby, 5441 -> 5440 -> 5442 ============
# Take the base backup from 5440, which is itself a standby. Nothing special is
# required for that: a standby serves replication connections like any node.
pg_basebackup -R -D "$PGLAB/cascade" -h /tmp -p 5440 -U postgres -c fast -X stream -P
cat >> "$PGLAB/cascade/postgresql.auto.conf" <<CONF
port = 5442
cluster_name = 'lab-cascade'
hot_standby = on
archive_mode = off
logging_collector = off
CONF
rm -f "$PGLAB/cascade/log/postgresql.log"
pg_ctl -D "$PGLAB/cascade" -l "$PGLAB/cascade.log" start -w
sleep 2
grep -E 'entering standby mode|consistent recovery state|started streaming' "$PGLAB/cascade.log"

# The middle node is a follower and a leader at the same time.
psql -h /tmp -p 5440 -d lab -c 'select pg_is_in_recovery() as node_5440_is_a_standby, (select count(*) from pg_stat_replication) as standbys_it_feeds'
psql -h /tmp -p 5440 -d lab -x -c 'select application_name, state, sent_lsn, replay_lsn from pg_stat_replication'
psql -h /tmp -p 5442 -d lab -x -c 'select status, sender_port, received_tli from pg_stat_wal_receiver'

# One write on the real primary reaches the end of the chain.
psql -h /tmp -p 5441 -d lab -c "insert into rep_split(node) values ('written on 5441, replicated through 5440 to 5442')"
sleep 2
psql -h /tmp -p 5442 -d lab -c 'select id, node from rep_split order by id'

# Take the cascade away again.
pg_ctl -D "$PGLAB/cascade" stop -m fast -w
rm -rf "$PGLAB/cascade" "$PGLAB/cascade.log"

# ==================== part 2: fail back to 5440 ====================
# Stop the primary FIRST. A fast shutdown writes a shutdown checkpoint and lets
# the walsender ship it, so the standby ends up holding every byte.
psql -h /tmp -p 5441 -d lab -c 'select pg_current_wal_lsn() as primary_lsn_before_shutdown'
pg_ctl -D "$PGLAB/standby" stop -m fast -w
sleep 2
psql -h /tmp -p 5440 -d lab -c 'select pg_last_wal_receive_lsn() as received, pg_last_wal_replay_lsn() as replayed'
pg_controldata -D "$PGLAB/standby" | grep -E 'cluster state|Latest checkpoint location'

# Now, and only now, promote the original node back into its original role.
pg_ctl -D "$PGLAB/primary" promote -w
sleep 2
grep -E 'received promote request|selected new timeline|ready to accept connections' "$PGLAB/primary/log/postgresql.log" | tail -4
psql -h /tmp -p 5440 -d lab -c 'select pg_is_in_recovery(), timeline_id from pg_control_checkpoint()'
psql -h /tmp -p 5440 -d lab -c "insert into rep_split(node) values ('written on 5440 after failback')"
psql -h /tmp -p 5440 -d lab -c 'select id, node from rep_split order by id'
cat "$PGLAB/primary/pg_wal/00000003.history"

# ================ part 3: put the lab back exactly as it was ================
rm -rf "$PGLAB/standby" "$PGLAB/standby.log"
psql -h /tmp -p 5440 -d lab -c 'alter system reset all'
psql -h /tmp -p 5440 -d lab -c 'select pg_reload_conf()'
psql -h /tmp -p 5440 -d lab -c 'select pg_drop_replication_slot(slot_name) from pg_replication_slots'
psql -h /tmp -p 5440 -d lab -c 'select count(*) as slots_left from pg_replication_slots'
psql -h /tmp -p 5440 -d lab -c "select pg_read_file('postgresql.auto.conf') as auto_conf"
psql -h /tmp -p 5440 -d lab -c "select name, setting from pg_settings where name in ('synchronous_standby_names','max_slot_wal_keep_size','wal_keep_size','primary_slot_name','max_standby_streaming_delay','archive_mode')"
psql -h /tmp -p 5440 -d lab -c 'select pg_is_in_recovery() as in_recovery, timeline_id, redo_lsn from pg_control_checkpoint()'
ls "$PGLAB"
ss -ltn | grep -E '5440|5441|5442'
df -h /var/lib/postgresql`,
      expectedResult: code`
PART 1, the cascade. pg_basebackup runs against 5440 -- itself a standby -- with no special flags,
copies 405 MB, and the third node starts:

  LOG:  entering standby mode
  LOG:  consistent recovery state reached at 1/AE0360F0
  LOG:  started streaming WAL from primary at 1/AE000000 on timeline 2

Note "from primary": the walreceiver's message does not care that its sender is a standby. The
middle node is both roles at once, which is the thing to see:

  node_5440_is_a_standby | standbys_it_feeds
  t                      |                 1

  application_name | lab-cascade
  state            | streaming
  sent_lsn         | 1/AE0360F0
  replay_lsn       | 1/AE0360F0

pg_is_in_recovery() is true on 5440 and pg_stat_replication has a row on it at the same time. On
5442, pg_stat_wal_receiver reports sender_port 5440 and received_tli 2 -- it is following timeline
2 through a node that is not on the end of it.

One insert on the real primary reaches the bottom of the chain within seconds:

   id | node
   36 | written on 5441, replicated through 5440 to 5442

PART 2, the failback. The primary's last LSN before shutdown is 1/AE036210; after the fast shutdown
the standby reports

  received   |  replayed
  1/AE036288 | 1/AE036288

which is past the number the primary printed, because a fast shutdown writes a shutdown checkpoint
and ships it to connected standbys before exiting. (The standby's own log records the other side of
that: "FATAL: could not send end-of-streaming message to primary: server closed the connection
unexpectedly", then a failed reconnect. Those two lines are the walreceiver noticing its source is
gone, not a problem.) received = replayed = the source's final
position is the check that means "promoting now loses nothing", and pg_controldata on the stopped
node confirms "Database cluster state: shut down".

The promotion is the same single command as the unplanned one, and produces the third timeline:

  LOG:  received promote request
  LOG:  selected new timeline ID: 3
  LOG:  database system is ready to accept connections

  pg_is_in_recovery | timeline_id
  f                 |           3

(timeline_id is 3 straight away this time: a standby that was already caught up runs its
end-of-recovery checkpoint immediately.) A write on 5440 succeeds and gets id 67, another 32-value
jump for the same reason as the first promotion. The history file now lists both branches:

  $ cat $PGLAB/primary/pg_wal/00000003.history
  1	1/AE02ECB8	no recovery target specified
  2	1/AE036288	no recovery target specified

Two lines, two promotions: timeline 2 branched from timeline 1 at the failover, timeline 3 branched
from timeline 2 at the failback. Note the second branch point is the same LSN the standby had
replayed to -- a switchover branches at the end of the history, not in the middle of it, which is
why no rewind was needed this time.

PART 3, the receipt. ALTER SYSTEM RESET ALL leaves postgresql.auto.conf with nothing but its two
comment lines, pg_drop_replication_slot returns 0 rows, slots_left is 0, and every setting this
module touched is back to its default:

  name                        | setting
  archive_mode                | on
  max_slot_wal_keep_size      | -1
  max_standby_streaming_delay | 30000
  primary_slot_name           |
  synchronous_standby_names   |
  wal_keep_size               | 0

  in_recovery | timeline_id |  redo_lsn
  f           |           3 | 1/AE0362B8

$PGLAB holds archive, backup1, primary and primary.log and nothing else; ss lists only 5440; df is
back where it was before the cascade. The lab is module 01's lab again, three timelines older.`,
      systemsLens: code`
Failback is failover run deliberately, and the difference between the two is the ordering. Here you
stopped the writer, verified the follower had caught up, and only then promoted -- three steps that
between them guarantee no divergence, which is why this lesson needed no pg_rewind afterwards. The
unplanned version two lessons ago skipped all three and cost a rewind and somebody's committed row.
Nearly every "controlled switchover" feature in every replicated system is that ordering wrapped in
a command: quiesce the leader, wait for the follower's log to match, transfer leadership, and only
then let the new leader accept writes.

Cascading is worth noticing for what it costs the primary: nothing. Replication here is pull-based
from the follower's side and stateless from the sender's, so a chain of ten replicas costs the
primary one connection, and fan-out is the follower's problem. That is why read replicas scale
reads and why they do not scale writes, and it is the same shape as a CDN or a Kafka follower-fetch
topology. It also carries the same tail-latency property: lag composes down the chain, so the
bottom of a cascade is behind by the sum of every hop.

The timeline history is the module's receipt. 00000003.history lists both branch points, so any
server or archive can tell exactly which history a WAL segment belongs to and refuse to mix them.
The lab now runs on timeline 3 and can never accidentally replay a timeline-1 or timeline-2 record
from after the branches, which is precisely the property an epoch number buys you in a consensus
protocol: not the prevention of divergence, but the permanent, unforgeable ability to detect it.`,
      challenge: code`
Do the switchover properly, with no promotion at all. Instead of stopping 5441 and promoting 5440,
try the sequence a tool like Patroni uses: pause writes, checkpoint, verify the standby's replay
LSN equals the primary's flush LSN, promote the standby, and rewind the old primary with pg_rewind
-- then measure how long the whole thing takes with a client running inserts in a loop, and count
how many of its transactions failed. That number is your real RTO for a planned switchover.`,
    },
  ],
};
