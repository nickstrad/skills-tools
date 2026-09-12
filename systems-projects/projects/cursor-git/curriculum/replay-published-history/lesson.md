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
