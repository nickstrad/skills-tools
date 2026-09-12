## The question

Can a replica safely serve from its local Git repository after it misses a catch-up notification?

A notification is a **hint** that work may be available. It can reduce delay, but delivery does not
define what was published. The object-store index remains the authority. A **guarded read** first
captures that index, brings the local repository to the captured prefix, checks its refs, and only
then reads Git. The read and replay share a bounded local lock so they cannot observe one another
halfway through an update.

```text
publish A --X--> dropped wake-up       raw Git read: base (stale)
                        |
guarded read -> check index -> replay A -> verify refs -> serve A
                 authority                  local cache
```

The guarantee is precise: the guarded read serves the complete index version it captured. A new
publication may happen after that observation. This is not a promise of “latest at response time.”

Budget: 4 minutes for the model and prediction, 8 for the missed-hint experiment, 4 for the warm
read, and 4 for the unavailable-authority check and cleanup.

## Predict

After A is published and its wake-up is dropped, predict three results: what raw Git names as
`main`, what the first guarded read returns, and whether a second guarded read must download A again.

Then ask what a freshness-enforcing reader should do when the object store cannot answer but the
local Git repository still contains a valid older commit.

## Build a fresh supplied helper and seed the authority

The build compiles supplied plumbing; there is no learner coding task. Keep this terminal open so
the later blocks retain `CURSOR_LAB` and `CURSOR`.

```bash
COURSE=/root/Software/skills-tools/systems-projects/projects/cursor-git
CURSOR_LAB=$("$COURSE/lab/lab.sh" start store)
"$COURSE/lab/build.sh" "$CURSOR_LAB"
CURSOR="$CURSOR_LAB/cursor"
printf 'Your disposable lab: %s\nHelper: %s\n' "$CURSOR_LAB" "$CURSOR"
"$COURSE/lab/seed.sh" "$CURSOR_LAB"
"$CURSOR" replay "$CURSOR_LAB" cache-a
git --git-dir="$CURSOR_LAB/cache-a.git" rev-parse refs/heads/main
jq '{applied,entries,refs}' "$CURSOR_LAB/cache-a.git/cursor-state.json"
```

`build.sh LAB` places the binary inside the owned lab and prints its path. `replay LAB NAME` creates
`NAME.git`, fetches the captured index in order, verifies every record and pack checksum, imports
objects through Git, and advances `cursor-state.json` only after its ref effects succeed. Expect an
applied count of 1 for the base entry and both `main` and `feature` at the base OID.

## Publish A but drop its wake-up

```bash
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" a refs/heads/main
"$COURSE/lab/upload.sh" "$CURSOR_LAB" a
"$CURSOR" publish "$CURSOR_LAB" a
"$CURSOR" wake "$CURSOR_LAB" cache-a --drop
printf 'authority main: '
curl -fsS --max-time 5 http://127.0.0.1:18333/cursor-lab/index.json | jq -r '.refs["refs/heads/main"]'
printf 'raw local main: '
git --git-dir="$CURSOR_LAB/cache-a.git" rev-parse refs/heads/main
jq '{applied,entries,refs}' "$CURSOR_LAB/cache-a.git/cursor-state.json"
```

`publish` conditionally appends the already uploaded `op-a`. `wake --drop` deliberately performs no
replay; it models lost best-effort delivery without pretending to implement a production transport.
Expect the authority to name A while raw local Git and the applied marker still name the base. The
notification's absence has not authorized the stale state.

## Read through the freshness guard

```bash
"$CURSOR" read "$CURSOR_LAB" cache-a
jq '{applied,entries,refs}' "$CURSOR_LAB/cache-a.git/cursor-state.json"
printf 'local content: '
git --git-dir="$CURSOR_LAB/cache-a.git" show refs/heads/main:story.txt
"$CURSOR" read "$CURSOR_LAB" cache-a
git --git-dir="$CURSOR_LAB/cache-a.git" fsck --no-dangling
```

The first `read` must check the index, catch up through A, verify the actual refs, and only then print
its `served` result with the captured generation, main OID, object-store request count, bytes, and
elapsed milliseconds. The state should now have two applied entries and `main` at A; Git should show
`change a`. The second read should report an unchanged-index response and no replay download. It
still verifies local refs before serving: a cached timestamp or old marker is not enough.

The exact elapsed time varies. Request and byte counters describe this tiny run and let you compare
work; they are not throughput measurements.

## Stop the authority and compare the two read paths

```bash
"$COURSE/lab/lab.sh" stop "$CURSOR_LAB"
printf 'raw local main while authority is down: '
git --git-dir="$CURSOR_LAB/cache-a.git" rev-parse refs/heads/main
read_status=0
"$CURSOR" read "$CURSOR_LAB" cache-a >"$CURSOR_LAB/offline.out" 2>"$CURSOR_LAB/offline.err" || read_status=$?
printf 'guarded read exit: %s\n' "$read_status"
cat "$CURSOR_LAB/offline.err"
if grep -q 'served' "$CURSOR_LAB/offline.out"; then
  echo 'ERROR: unavailable authority produced a served result'
else
  echo 'No served result while authority was unavailable'
fi
```

Raw Git should still return A because the local cache remains readable. The guarded read should fail
nonzero within the helper's roughly ten-second overall bound and print no `served` result. That is an
availability cost chosen by the freshness contract, not evidence that the local objects vanished.

## Clean up or stop here

```bash
"$COURSE/lab/lab.sh" clean "$CURSOR_LAB"
unset COURSE CURSOR_LAB CURSOR read_status
```

At the 20-minute cap, run cleanup even if an earlier observation differed. It removes only the
launcher's marked temporary root and its supplied helper. The interpretation below connects the
evidence to the consistency decision.


## Interpretation and optional worked solution

Read after the learner task above.

## What the evidence means

The dropped wake-up left `cache-a.git` at the base entry even though the authoritative index had
accepted A. That is the competing outcome a notification-only design cannot distinguish: silence can
mean no update, a lost hint, or a delayed hint. Raw Git served exactly what it had and therefore read
the old main tip.

The first guarded read resolved the ambiguity by consulting the index. It captured the published
prefix through A, verified the referenced record and pack, moved the ref under its expected-old
condition, persisted applied count 2, checked the resulting refs, and then served `change a`. The
marker did not run ahead of Git. The second read used the index's unchanged response to avoid replay,
but still compared actual local refs with its fully applied cached state before serving.

Stopping the store separated data presence from read admission. Raw Git still found A, proving the
cache was intact. The guarded path failed within its deadline and emitted no `served` result because
it could not establish which index version was authoritative. Serving the cache anyway would weaken
the stated freshness rule precisely during the failure that makes the check valuable.

## The systems decision

Use hints for latency and authority checks for correctness:

```text
hint delivered -> eager replay ----\
                                  +-> guarded read verifies captured prefix -> serve
hint lost -------------------------/
authority unavailable -----------------------------------------------> fail
```

Holding one local lock across check, catch-up, ref verification, and inspection prevents this
process's reader from interleaving with this process's replay. It does not make the lock a shared
publication authority. Other replicas coordinate through the conditional object-store index, and a
client that bypasses the guard can still see stale or transitional local state.

The decision trades read availability for bounded freshness. A product could deliberately offer a
separate stale-read mode, but it would need a visible contract rather than silently falling back.
The captured-version wording also matters: a publisher can append after the read's index GET, so the
experiment establishes a complete observed prefix, not linearizability at the later response instant.

This local run uses one SeaweedFS process and explicit CLI wake-up calls. It demonstrates a lost hint,
conditional index observation, bounded failure, Git replay, and local serialization. It does not
model UDP delivery, independent hosts, network partitions, cloud durability, or production latency.

## Optional depth

Cursor's [Replication section](https://cursor.com/blog/git-at-any-scale#replication) describes
notifications that prompt replicas to inspect a WAL index and conditional reads that avoid needless
downloads. Compare that claim with the two distinct roles measured here. No written response is
required.
