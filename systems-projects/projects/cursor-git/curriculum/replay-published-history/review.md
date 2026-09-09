## What the evidence means

The complete replica had actual Git refs and readable committed content, not only a successful
replayer message. Applied count 2 named the base and A entries that those effects represented.
Native fsck checked connectivity/integrity; comparing expected refs remains necessary because a
repository can be internally valid while pointing to the wrong commit.

When A's pack was missing, the new replica installed base and then stopped. Its marker stayed at
one record and main still read `base`. Advancing past A would have converted an unavailable
dependency into a false claim of successful application. Repeating GETs or ignoring a missing object
cannot supply the data it references.

Restoring the exact bytes let the same replica continue from its accepted prefix. It ended with
the same refs as the healthy cache. The log order and expected-old branch values are part of this
reconstruction contract; bucket listing order and arbitrary records are not substitutes.

## The systems decision

Treat the local marker as a claim backed by installed effects. Store objects, then update refs,
then advance progress. A missing/corrupt dependency stops the claim. This is the same issue faced by
change-stream consumers that acknowledge an offset before applying its event.

This course retains immutable records and full packs, checks SHA256 before import, and refuses a
history prefix that no longer matches the replica. It does not implement compaction, restore-point
retention, schema migration or silent repair of corrupted authority. The missing-pack experiment
demonstrates a limitation as well as recovery: local copies are disposable only while the required
authority and payloads survive.

The supplied replayer is the worked implementation. If you inspect it, find where the marker is
written relative to the Git ref transaction. That ordering creates a remaining crash window in
which effects can exist before progress records them. Lesson 6 investigates that exact boundary.
