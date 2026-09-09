## What the evidence means

The matching downloaded-pack hashes established that bytes existed at the object-store endpoint.
Generation 0 and the base-only index established that the new record had not entered accepted
history. Those observations can both be true. Listing every object and replaying it would incorrectly
include abandoned proposals.

The successful conditional index PUT changed the shared authority to generation 1. A later GET
showed the accepted record and main tip. That GET matters: a script's final message or a successful
pack upload is not evidence that publication occurred. The old ETag then failed with HTTP 412;
conditional replacement evaluated the old token against the index that existed at the write.

This is an **application WAL**, a replayable history defined by our protocol. A Git pack holds Git
objects; it is not a PostgreSQL WAL segment. The JSON record supplies the logical branch update,
while the index determines which records count and their order. Our generation-0 fixture includes
the initial refs and base objects so future reconstruction has a starting point.

## The systems decision

Choose **payload first, authority second, reply last**. Publishing a pointer first could expose an
accepted update whose objects cannot be fetched. Uploading first can leave orphans, but they have
not become accepted work. This ordering favors a recoverable surplus of bytes over a missing
dependency in authoritative state. Database metadata pointing at uploaded files has the same issue.

In today's one-writer run, finishing the conditional publication resolves the interruption. A
changed index requires re-reading and revalidating before retry: lesson 3 makes that distinction
concrete. If a publication reply disappears, client knowledge becomes a separate problem; lesson 4
will reconcile it through stable operation identity. Repeating an old request and seeing 412 alone
does not identify who changed the index.

The protocol depends on the store preserving successful writes and evaluating conditional writes
atomically. This run checks the selected local version's behavior. It does not demonstrate
independent-disk durability, availability during a host failure, or Cursor's production performance.
The full-history JSON index is intentionally tiny and bounded; rewriting it forever would become
a scaling cost. Compaction and retention are separate optional work, not permission to delete old
objects by age during this course.

## Optional connection

Cursor's [Continuity section](https://cursor.com/blog/git-at-any-scale#continuity) describes the
same distinction between uploading a push and publishing it through an index, with additional
Git transaction integration. Our adapter teaches the ordering with supplied pack/ref metadata.
Ask yourself what must survive if the uploading process disappears at each arrow in the diagram.
No written answer is needed.
