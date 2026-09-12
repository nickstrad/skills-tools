## The question

If every local Git repository disappears, does the retained object-store history contain enough to
reconstruct a trustworthy serving copy?

The previous lessons treated Git repositories as derived caches. This lesson tests that claim at its
hard boundary: save only expected object IDs and small integrity values, delete **all** local `.git`
directories and working pack files, then rebuild two bare repositories from the authority. A native
`git fsck` and content checks test the result independently of the supplied helper.

```text
local source.git + packs + replicas --evict--> no local Git or pack source
                                             |
object-store index -> records -> packs ------+-> cache-a.git
                                              -> cache-b.git
```

The negative control then removes one published pack from the authority. A fresh replica must stop;
it must not fall back to the original fixture, because that fixture is gone. Exact bytes fetched
from the authority immediately before the fault provide the bounded recovery path.

Budget: 5 minutes setup and publication, 4 eviction, 7 two-replica rebuild and inspection, 5 cold/
warm comparison and missing-pack control, and 4 review/cleanup.

## Predict

Before deleting anything, predict which artifacts are authoritative: the source repository, loose
work packs, operation records, the index, or some combination. What should a fresh replay marker say
if the index names an entry whose pack cannot be fetched?

## Create the final published history

Start cold. Publish A with its reply deliberately lost, reconcile it by retrying the same operation,
then publish B on the independent `feature` ref. Also upload an unindexed object to make an orphan
whose mere presence must not affect replay.

```bash
COURSE=/root/Software/skills-tools/systems-projects/projects/cursor-git
CURSOR_LAB=$("$COURSE/lab/lab.sh" start store)
"$COURSE/lab/build.sh" "$CURSOR_LAB"
CURSOR="$CURSOR_LAB/cursor"
"$COURSE/lab/seed.sh" "$CURSOR_LAB"
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" a refs/heads/main
"$COURSE/lab/upload.sh" "$CURSOR_LAB" a
lost_status=0
"$CURSOR" publish "$CURSOR_LAB" a --lose-reply || lost_status=$?
printf 'lost-reply exit: %s\n' "$lost_status"
"$CURSOR" publish "$CURSOR_LAB" a
"$COURSE/lab/snapshot.sh" "$CURSOR_LAB"
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" b refs/heads/feature
"$COURSE/lab/upload.sh" "$CURSOR_LAB" b
"$CURSOR" publish "$CURSOR_LAB" b
curl -fsS --max-time 5 -X PUT -H 'If-None-Match: *' \
  --data-binary @"$CURSOR_LAB/b.pack" \
  http://127.0.0.1:18333/cursor-lab/packs/unpublished-orphan.pack
"$CURSOR" wake "$CURSOR_LAB" never-created --drop
curl -fsS --max-time 5 http://127.0.0.1:18333/cursor-lab/index.json | jq .
```

The injected lost reply exits 86 after A's successful index PUT. Its identical retry should report
`already-published` without growing the history. B is prepared from the refreshed snapshot and
accepted on `feature`. Expect generation 2 and exactly three indexed records: base, A, and B. The
orphan key exists outside that list, and the dropped wake-up creates no replica.

## Save expectations, then evict every local Git and pack source

```bash
EXPECTED_BASE=$(cat "$CURSOR_LAB/base.oid")
EXPECTED_A=$(cat "$CURSOR_LAB/a.oid")
EXPECTED_B=$(cat "$CURSOR_LAB/b.oid")
curl -fsS --max-time 5 http://127.0.0.1:18333/cursor-lab/index.json \
  | sha256sum | cut -d ' ' -f1 >"$CURSOR_LAB/expected-index.sha256"
find "$CURSOR_LAB" -type d -name '*.git' -prune -print -exec rm -rf -- {} +
find "$CURSOR_LAB" -maxdepth 1 -type f -name '*.pack' -print -delete
if find "$CURSOR_LAB" -type d -name '*.git' -print -quit | grep -q .; then
  echo 'ERROR: a local Git directory survived eviction'
else
  echo 'All local Git directories are gone'
fi
if find "$CURSOR_LAB" -maxdepth 1 -type f -name '*.pack' -print -quit | grep -q .; then
  echo 'ERROR: a working pack survived eviction'
else
  echo 'All working packs are gone'
fi
```

The `find` commands are deliberately rooted at the launcher's owned temporary directory. They remove
`source.git`, any prior cache, and every top-level fixture pack. Only expected OIDs, a checksum, the
helper, and non-Git metadata remain locally. The published bytes remain behind the object-store API.

## Rebuild two replicas from the authority only

```bash
"$CURSOR" replay "$CURSOR_LAB" cache-a | tee "$CURSOR_LAB/cold-a.out"
"$CURSOR" replay "$CURSOR_LAB" cache-b | tee "$CURSOR_LAB/cold-b.out"
for cache in cache-a cache-b; do
  printf '\n%s refs and state\n' "$cache"
  git --git-dir="$CURSOR_LAB/$cache.git" show-ref
  jq '{applied,entries,refs}' "$CURSOR_LAB/$cache.git/cursor-state.json"
  test "$(git --git-dir="$CURSOR_LAB/$cache.git" rev-parse refs/heads/main)" = "$EXPECTED_A"
  test "$(git --git-dir="$CURSOR_LAB/$cache.git" rev-parse refs/heads/feature)" = "$EXPECTED_B"
  test "$(git --git-dir="$CURSOR_LAB/$cache.git" rev-parse "$EXPECTED_BASE^{commit}")" = "$EXPECTED_BASE"
  git --git-dir="$CURSOR_LAB/$cache.git" show refs/heads/main:story.txt
  git --git-dir="$CURSOR_LAB/$cache.git" show refs/heads/feature:story.txt
  git --git-dir="$CURSOR_LAB/$cache.git" fsck --no-dangling
done
"$CURSOR" read "$CURSOR_LAB" cache-a | tee "$CURSOR_LAB/warm-a.out"
```

Each state should have applied count 3, the exact ordered record keys, and the expected final refs.
Both repositories should show `change a` on main, `change b` on feature, retain the reachable base
commit, and pass native fsck. The replay/read output reports requests, bytes, and elapsed milliseconds.
Compare `cold-a.out` with `warm-a.out`: the warm read should use an unchanged index response and
transfer fewer bytes because it does not fetch history again. Tiny local timings vary and support no
production scaling claim.

## Negative control: remove one authoritative pack

Fetch A's published bytes into a temporary recovery file, verify them against the published record,
then delete the server object. This recovery file comes from the authority after eviction; it is not
a hidden copy of `source.git` or a work pack.

```bash
curl -fsS --max-time 5 http://127.0.0.1:18333/cursor-lab/packs/a.pack \
  -o "$CURSOR_LAB/recovery-a.bin"
curl -fsS --max-time 5 http://127.0.0.1:18333/cursor-lab/records/a.json \
  | jq -r .sha256 >"$CURSOR_LAB/recovery-a.sha256"
test "$(sha256sum "$CURSOR_LAB/recovery-a.bin" | cut -d ' ' -f1)" = \
  "$(cat "$CURSOR_LAB/recovery-a.sha256")"
curl -fsS --max-time 5 -X DELETE \
  http://127.0.0.1:18333/cursor-lab/packs/a.pack
broken_status=0
"$CURSOR" replay "$CURSOR_LAB" cache-missing >"$CURSOR_LAB/missing.out" \
  2>"$CURSOR_LAB/missing.err" || broken_status=$?
printf 'missing-pack replay exit: %s\n' "$broken_status"
cat "$CURSOR_LAB/missing.err"
jq '{applied,entries,refs}' "$CURSOR_LAB/cache-missing.git/cursor-state.json"
git --git-dir="$CURSOR_LAB/cache-missing.git" show-ref
```

Expect a nonzero replay at A. The fresh repository may contain the applied base entry, but its marker
must not advance past 1 and its refs must not claim A or B. No source fallback exists.

Restore the exact verified bytes under the same immutable key and resume the same replica:

```bash
curl -fsS --max-time 5 -X PUT -H 'If-None-Match: *' \
  --data-binary @"$CURSOR_LAB/recovery-a.bin" \
  http://127.0.0.1:18333/cursor-lab/packs/a.pack
"$CURSOR" replay "$CURSOR_LAB" cache-missing
jq '{applied,entries,refs}' "$CURSOR_LAB/cache-missing.git/cursor-state.json"
git --git-dir="$CURSOR_LAB/cache-missing.git" fsck --no-dangling
test "$(git --git-dir="$CURSOR_LAB/cache-missing.git" rev-parse refs/heads/main)" = "$EXPECTED_A"
test "$(git --git-dir="$CURSOR_LAB/cache-missing.git" rev-parse refs/heads/feature)" = "$EXPECTED_B"
```

The resumed replica should reach applied count 3, the same refs, and a clean fsck. Recovery succeeded
because the required authoritative bytes were restored, not because replay skipped a dependency.

## Clean up or stop here

```bash
"$COURSE/lab/lab.sh" clean "$CURSOR_LAB"
unset COURSE CURSOR_LAB CURSOR EXPECTED_BASE EXPECTED_A EXPECTED_B lost_status broken_status cache
```

At the 25-minute cap, run cleanup. It stops the owned store and removes all three rebuilt caches,
the temporary recovery object, helper, logs, and store data. The interpretation below connects this
evidence to the final architecture decision.


## Interpretation and optional worked solution

Read after the learner task above.

## What the evidence means

After eviction there was no `source.git`, local replica, or working `.pack` file from which replay
could reconstruct Git. The two successful replicas therefore followed the retained index and its
three referenced records and packs. Their applied counts, identical refs, reachable expected commits,
file contents, and native `git fsck` results provide independent evidence that the application log
was sufficient for this bounded history.

The unindexed orphan did not enter either replica. Replay discovered accepted work through the index,
not by listing every uploaded object. A's lost reply also produced only one logical history entry:
stable operation identity reconciled client uncertainty without turning transport retry into another
Git update. The dropped hint had no bearing on reconstruction because replay checked authority.

Cold replay fetched and verified the history before it could serve. The warm guarded read checked the
same authority but avoided downloading the already applied packs after the unchanged response. The
request, byte, and elapsed counters reveal that shape; their absolute values describe a tiny local
fixture and cannot predict production latency or throughput.

The missing-pack control exposed the architecture's real dependency. `cache-missing` could apply the
base prefix, then stopped at A without advancing its marker or claiming later refs. Restoring the
exact checksum-verified bytes fetched from the authority allowed replay to resume through A and B.
There was no baseline source fallback, so a permanently lost published object would make full-history
reconstruction impossible.

## The systems decision

Local Git repositories can be disposable caches only while the retained authority is complete and
reachable for the recovery target:

```text
complete index + every referenced immutable payload -> deterministic rebuild
missing referenced payload                        -> incomplete prefix; do not serve target
unindexed uploaded payload                        -> orphan; ignore during replay
```

This design makes scale-down cheap in ongoing storage at the serving tier, but cold starts perform
more object-store requests, transfer more bytes, and wait for Git import and verification. Keeping a
warm replica buys latency and availability during authority outages. Eviction saves local resources
while concentrating recovery responsibility in the object store and retained history.

Retention and compaction must therefore follow explicit recovery targets. Deleting an old pack by
age because no warm replica appears to need it can destroy the ability to rebuild from the current
full-history index. A future compacted baseline could shorten replay, but it would need publication,
verification, and deletion rules of its own.

This experiment ran one object-store process and tiny full packs on one VM. It proves the supplied
format can reconstruct these Git refs and objects and that one missing object blocks the required
prefix. It does not demonstrate independent-host durability, object-store disaster recovery,
large-repository performance, production garbage collection, or Cursor's reported scale.

## Project reflection

The course's publication point is the conditional index update. Stable operation IDs reconcile an
unknown reply; ordered replay makes Git a derived copy; applied markers never outrun ref effects; and
guarded reads verify an authoritative captured prefix even when notifications disappear. A brief
mental or spoken explanation of those boundaries is enough. No report or quiz is required.

If you want optional depth, revisit Cursor's **WAL as truth**, **Replication**, and **Compaction**
sections and identify which production mechanisms correspond to the measured local boundaries and
which remain claims outside this lab.
