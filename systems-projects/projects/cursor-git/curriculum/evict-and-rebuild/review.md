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
