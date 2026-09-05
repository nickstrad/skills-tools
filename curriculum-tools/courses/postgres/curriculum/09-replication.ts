import { code, type Module } from "../../../src/types.ts";
import { SYNC_ACKNOWLEDGEMENT } from "./sync-acknowledgement.ts";
import { STANDBY_CONFLICTS } from "./standby-conflicts.ts";
import { SLOT_RETENTION } from "./slot-retention.ts";
import { FAILOVER_WORKLOAD } from "./failover-workload.ts";
import { REWIND_WORKLOAD } from "./rewind-workload.ts";
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

    REWIND_WORKLOAD,

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
