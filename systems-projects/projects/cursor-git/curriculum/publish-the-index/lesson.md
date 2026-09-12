## The question

When may a writer say its update is accepted? Git objects can exist without a branch pointing at
them. Across machines, we need another explicit boundary: a shared **publication index**, a small
object that names the accepted operations in order. An **operation record** describes a branch's
expected old commit and intended new commit, plus the pack containing its objects.

Today you will upload a pack and its record, deliberately stop before publishing, and inspect what
other readers can discover. This is the failure window where a writer could disappear. Then you
will publish the index and inspect the difference. Budget: 4 minutes concepts, 3 setup, 8 experiment,
5 review/cleanup. One terminal is enough; use a second terminal to keep this lesson visible.

```text
PUT pack + record          PUT index pointing to record        reply success
       |                                |                          |
bytes exist                 update becomes authoritative       client knows
       ^
stop here first: uploaded, but not published
```

An **ETag** is the object store's opaque comparison token for an object version. `If-Match` asks
the store to replace the index only if it still has the token we read. This compare-and-swap
(CAS) operation makes our read-modify-write conditional. An ETag is not our pack checksum.

## Predict

If the pack upload succeeds but the index never changes, should a fresh reader find the update by
listing the bucket, or by following the index? Make a quick mental guess about which values will
change below.

## Start a fresh owned lab

If this is your first object-store lesson, run the supplied installer once. It checks a pinned
SeaweedFS 4.46 download and installs it under your local data directory; allow 10–20 minutes for
installation on a slow connection, separately from lesson time. On this VM it is already installed.

```bash
COURSE=/root/Software/skills-tools/systems-projects/projects/cursor-git
"$COURSE/lab/install.sh"
CURSOR_LAB=$("$COURSE/lab/lab.sh" start store)
printf 'Your disposable lab: %s\n' "$CURSOR_LAB"
"$COURSE/lab/seed.sh" "$CURSOR_LAB"
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" a refs/heads/main
S3=http://127.0.0.1:18333/cursor-lab
jq . "$CURSOR_LAB/a.record.json"
```

`start store` launches only the local lab and creates tiny deterministic Git objects. `seed.sh`
uploads the base state: generation 0, one base record, and two branch tips at the same base commit.
`candidate.sh` supplies the JSON plumbing for operation `op-a`; it checks the old branch tip against
the saved index and verifies the new commit exists in the Git fixture. It does not publish anything.
This adapter is a deliberately small model, not Git's network push handler or a prepared Git ref
transaction. `jq .` prints JSON readably. Inspect `updates`, `pack`, and `sha256` in the record.

The printed path belongs to this session. If startup reports occupied ports, clean your earlier
lab using its printed path; do not stop another user's service. If a command unexpectedly fails,
use the cleanup block and start afresh rather than continuing with partial state.

## Upload, then stop before publication

These are real S3-compatible requests. `--data-binary @FILE` sends exact file bytes; `-X PUT` creates
or replaces an object. `If-None-Match: *` permits creation only while the key is absent. This keeps
our payload keys immutable. `-sS` suppresses the progress meter but displays transport errors,
`--max-time 5` bounds a request, `-o` saves its body, and `-w` prints its HTTP status.

```bash
curl -sS --max-time 5 -o "$CURSOR_LAB/pack.body" -w 'pack HTTP %{http_code}\n' \
  -X PUT -H 'If-None-Match: *' --data-binary "@$CURSOR_LAB/a.pack" "$S3/packs/a.pack"
curl -sS --max-time 5 -o "$CURSOR_LAB/record.body" -w 'record HTTP %{http_code}\n' \
  -X PUT -H 'If-None-Match: *' --data-binary "@$CURSOR_LAB/a.record.json" "$S3/records/a.json"

curl -fsS --max-time 5 "$S3/packs/a.pack" -o "$CURSOR_LAB/downloaded.pack"
sha256sum "$CURSOR_LAB/a.pack" "$CURSOR_LAB/downloaded.pack"
curl -fsS --max-time 5 "$S3/index.json" | jq '{generation, entries, refs}'
```

Both uploads should return `200`; the two SHA256 values should match. `-f` makes the download/GET
fail on an HTTP error. The index should still have generation 0 and only `records/base.json`.
We have now stopped at the exact before-publication failure boundary. There is no background
publisher that will finish the work for us. The new payload is an **orphan** relative to the index:
stored bytes that an accepted-history reader does not yet follow.

Take a moment here: which observation proves payload existence, and which proves non-publication?

## Publish the index

The proposed index contains the base history plus `records/a.json` and the new main tip. Inspect it
before sending. The saved ETag includes the required quotes; `cat` reads it without inventing a
version. `-D` saves response headers for inspection.

```bash
jq . "$CURSOR_LAB/a.index.json"
ETAG=$(cat "$CURSOR_LAB/a.etag")
curl -sS --max-time 5 -D "$CURSOR_LAB/publish.headers" \
  -o "$CURSOR_LAB/publish.body" -w 'publish HTTP %{http_code}\n' \
  -X PUT -H "If-Match: $ETAG" --data-binary "@$CURSOR_LAB/a.index.json" "$S3/index.json"
curl -fsS --max-time 5 "$S3/index.json" | jq '{generation, entries, refs}'
```

Expect `200`, generation 1, a second entry naming `records/a.json`, and a changed main tip. Those
are observations of the authority, not a helper's claim that it succeeded. Upload success alone was
insufficient; this conditional index replacement is our publication point. The lab's acceptance
reply belongs after it. Replica catch-up is a separate later step.

Try that same publication with the old ETag once more:

```bash
curl -sS --max-time 5 -o "$CURSOR_LAB/stale.body" -w 'old token HTTP %{http_code}\n' \
  -X PUT -H "If-Match: $ETAG" --data-binary "@$CURSOR_LAB/a.index.json" "$S3/index.json"
cat "$CURSOR_LAB/stale.body"
curl -fsS --max-time 5 "$S3/index.json" | jq '.generation, .entries'
```

Expect `412 PreconditionFailed` and the same generation/history. `curl` can exit successfully while
reporting an HTTP `412` because these calls deliberately omit `-f`; the printed HTTP code and saved
error body are the evidence. An unexpected `000` is a transport failure, not a conditional conflict.

## Clean up or stop here

```bash
"$COURSE/lab/lab.sh" clean "$CURSOR_LAB"
unset CURSOR_LAB ETAG S3
```

Cleanup stops the recorded process and removes this lab's data, payloads and logs; shutdown can take
about 20 seconds. At the time cap, use the same block even if you stopped before publication. Resume
later by starting a fresh fixture. Do not retain an idle server between lessons.

The interpretation below connects the two distinct boundaries; no written response is required.


## Interpretation and optional worked solution

Read after the learner task above.

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
