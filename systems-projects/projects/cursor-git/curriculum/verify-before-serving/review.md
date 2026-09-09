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
