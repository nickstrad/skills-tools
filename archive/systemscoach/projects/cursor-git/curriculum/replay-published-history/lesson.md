## The question

If the object store holds authoritative history, what must a replica actually do to become useful?
**Replay** follows accepted records in order and applies their effects to a local data structure.
Here that structure is a normal bare Git repository, not another JSON view of the history.

An **applied marker** records how much of that history is already installed locally. Our marker
counts records, including the base record: generation 1 has two entries, so a fully caught-up
replica has `applied: 2`. It may only advance after the referenced objects and ref effects exist.

```text
captured index -> base record -> A record
                      |             |
                 GET/verify pack, import Git objects, apply refs, save marker
                      |             |
                  applied=1     applied=2
```

Budget: 4 minutes concepts, 3 setup, 12 replay/failure/recovery, 6 review/cleanup. The supplied
replayer handles fetch/order/plumbing. Native Git and direct JSON inspection establish its result.

## Predict

If A's record is published but its pack cannot be fetched, should the replica skip it, advance its
marker and try later, or stop at the last fully installed record?

## Start from accepted history

Use one Bash terminal; installation is the same one-time prerequisite as lesson 4. Every lesson
starts fresh, so you can resume without keeping yesterday's lab or shell variables.

```bash
COURSE=/root/Software/skills-tools/systems-projects/projects/cursor-git
CURSOR_LAB=$("$COURSE/lab/lab.sh" start store)
printf 'Disposable lab: %s\n' "$CURSOR_LAB"
"$COURSE/lab/build.sh" "$CURSOR_LAB"
CURSOR="$CURSOR_LAB/cursor"
"$COURSE/lab/seed.sh" "$CURSOR_LAB"
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" a refs/heads/main
"$COURSE/lab/upload.sh" "$CURSOR_LAB" a
"$CURSOR" publish "$CURSOR_LAB" a
S3=http://127.0.0.1:18333/cursor-lab
```

`start store` supplies tiny base/A/B commits; the following calls publish only A. The base record
initializes `main` and `feature`; A changes only `main`. The new replica name `cache-a` below maps to
the owned path `$CURSOR_LAB/cache-a.git` and starts empty.

## Materialize a real Git repository

```bash
"$CURSOR" replay "$CURSOR_LAB" cache-a
jq '{applied, entries, refs}' "$CURSOR_LAB/cache-a.git/cursor-state.json"
git --git-dir="$CURSOR_LAB/cache-a.git" show-ref
git --git-dir="$CURSOR_LAB/cache-a.git" show refs/heads/main:story.txt
git --git-dir="$CURSOR_LAB/cache-a.git" fsck --full
```

Expect two applied records, both accepted entry keys, and main at A's OID. The file content should
be `change a`. `--git-dir` selects the private bare repository; `show REF:path` reads a committed
file without a checkout. `fsck --full` checks object integrity and connectivity. A notice that HEAD
points to an unborn branch may appear because this bare fixture has no selected default branch;
that is distinct from missing/corrupt object errors.

The replayer downloads the record and pack, checks the pack's SHA256, invokes native `index-pack`,
then applies its expected-old ref transaction and saves the marker. Imported bytes alone cannot
justify `applied: 2`; the ref effects must also exist. A local lock prevents cooperating readers
from observing partially applied work. The object store still controls publication order.

## Withhold a required pack

In this disposable store only, delete A's published pack after retrieving an exact recovery copy.
This deliberately violates the surviving-payload assumption. Existing `cache-a` remains a useful
comparison, but the fresh `missing` replica must depend on authority, not copy cache-a's objects.

```bash
curl -fsS --max-time 5 "$S3/packs/a.pack" -o "$CURSOR_LAB/recovery.pack"
sha256sum "$CURSOR_LAB/recovery.pack" "$CURSOR_LAB/a.pack"
curl -sS --max-time 5 -o "$CURSOR_LAB/delete.body" -w 'delete HTTP %{http_code}\n' \
  -X DELETE "$S3/packs/a.pack"
replay_status=0
"$CURSOR" replay "$CURSOR_LAB" missing || replay_status=$?
printf 'incomplete replay exit: %s\n' "$replay_status"
jq '{applied, entries}' "$CURSOR_LAB/missing.git/cursor-state.json"
git --git-dir="$CURSOR_LAB/missing.git" show refs/heads/main:story.txt
```

The hashes should match and deletion should return an HTTP success code. Replay must fail nonzero
on the unavailable A pack. Inspect `applied: 1`, only the base entry, and file content `base`.
It must not claim to be caught up just because it found A's record in the index. Each request is
bounded; unexpected HTTP failures in inspection calls are errors, not an invitation to continue.

## Restore the dependency and resume

```bash
curl -fsS --max-time 5 -X PUT -H 'If-None-Match: *' \
  --data-binary "@$CURSOR_LAB/recovery.pack" "$S3/packs/a.pack"
"$CURSOR" replay "$CURSOR_LAB" missing
jq '.applied, .entries' "$CURSOR_LAB/missing.git/cursor-state.json"
git --git-dir="$CURSOR_LAB/missing.git" show-ref > "$CURSOR_LAB/rebuilt.refs"
git --git-dir="$CURSOR_LAB/cache-a.git" show-ref > "$CURSOR_LAB/expected.refs"
diff -u "$CURSOR_LAB/expected.refs" "$CURSOR_LAB/rebuilt.refs"
```

`If-None-Match: *` restores only an absent key; `--data-binary @FILE` sends the exact saved bytes.
Replay now reaches applied count 2. `diff -u` should print nothing: both Git copies have the same
refs. The complete index/payload history made repair possible; the replica marker alone could not.

## Clean up or stop here

```bash
"$COURSE/lab/lab.sh" clean "$CURSOR_LAB"
unset CURSOR_LAB CURSOR S3 replay_status
```

At the 25-minute cap, this cleanup also removes the deliberately damaged disposable store. Do not
retain an incomplete lab. Recreate the fixture when resuming; interpretation is included below.


## Interpretation and optional worked solution

Read after the learner task above.

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
