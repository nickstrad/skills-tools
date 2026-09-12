## The question

What does a Git replica have after it receives commit data but before a branch moves?

A Git **object** is immutable content addressed by an object ID (OID): blobs hold file contents,
trees describe directories, and commits point to a tree and parent commits. A **pack** bundles those
objects for transport. A **ref** is a small mutable name, such as `refs/heads/main`, whose value is a
commit OID. Git can therefore possess a commit object without any branch making that commit visible
as its current tip.

This lesson uses one invariant: move a branch to a candidate commit only if its current value is the
expected old value. The expected-old check turns the ref move into a compare-and-set operation: a
stale writer must fail instead of overwriting a newer tip.

```text
receive payload                    publish name
a.pack -> object database          refs/heads/main -> commit A
          cat-file: found          show-ref: visible
          show-ref: empty
```

The supplied fixture contains a base commit and two different child commits, A and B. It also
contains a full pack for each commit's reachable history, plus an initially empty bare replica. A
**bare repository** stores Git's database and refs directly, without a checked-out working tree.

## Predict

After importing A's pack, make a quick mental prediction: will `cat-file` find commit A, will
`show-ref` list `main`, or will both observations change together?

Then consider a writer that still expects `main` to equal the base commit after another writer has
already moved it to A. Should that writer be allowed to move `main` to B?

## Run and inspect

Start a fresh owned fixture and load its deterministic OIDs into shell variables. Keep this terminal
open: later blocks use the same variables.

```sh
COURSE=/root/Software/skills-tools/systems-projects/projects/cursor-git
CURSOR_LAB=$("$COURSE/lab/lab.sh" start objects)
BASE_OID=$(cat "$CURSOR_LAB/base.oid")
A_OID=$(cat "$CURSOR_LAB/a.oid")
B_OID=$(cat "$CURSOR_LAB/b.oid")
ZERO_OID=0000000000000000000000000000000000000000
printf 'lab:  %s\nbase: %s\nA:    %s\nB:    %s\n' \
  "$CURSOR_LAB" "$BASE_OID" "$A_OID" "$B_OID"
```

`lab.sh start objects` creates a unique directory under `/tmp`, marks it as owned, and prints that
path. The three `cat` commands read the OIDs created by the fixture. `ZERO_OID` is Git's all-zero
OID; as an expected old value it means “this ref must not exist.” You should see these fixed commit
IDs:

```text
base: e620faabc0b2fa21512bf0be43e53561a0dfe845
A:    af073e00db03de2c46604ea4d9a60d271c7f5adf
B:    36a3830268c2f25ee88bc550182593a1a4111f61
```

Confirm that the replica begins without refs. `show-ref` exits with status 1 when there is nothing
to show, so the `if` prints an explicit observation instead of treating the empty result as an
unexplained failure.

```sh
if git --git-dir="$CURSOR_LAB/replica.git" show-ref; then
  printf 'unexpected: the fresh replica already has a ref\n'
else
  printf 'no refs in the fresh replica\n'
fi
```

`--git-dir` points native Git commands at the bare replica. Import A's pack through standard input.
`index-pack --stdin` verifies the pack and installs its objects in the replica's object database;
the printed `pack` line identifies the installed pack, not a branch.

```sh
git --git-dir="$CURSOR_LAB/replica.git" index-pack --stdin < "$CURSOR_LAB/a.pack"
git --git-dir="$CURSOR_LAB/replica.git" cat-file -t "$A_OID"
git --git-dir="$CURSOR_LAB/replica.git" show -s \
  --format='subject=%s%nparent=%P' "$A_OID"
if git --git-dir="$CURSOR_LAB/replica.git" show-ref; then
  printf 'unexpected: importing a pack created a ref\n'
else
  printf 'objects present; refs still empty\n'
fi
```

`cat-file -t` asks for the object's type; it should print `commit`. `show -s` suppresses the diff,
and `--format` selects the commit subject and parent OID. You should see subject `change a` and the
base OID as its parent. The final check should still report no refs. That is the first boundary:
the payload exists, but no branch exposes it.

Publish A as a new branch with an expected-old check, then inspect the ref.

```sh
git --git-dir="$CURSOR_LAB/replica.git" update-ref \
  refs/heads/main "$A_OID" "$ZERO_OID"
git --git-dir="$CURSOR_LAB/replica.git" show-ref refs/heads/main
```

`update-ref <ref> <new> <old>` changes the ref only if its current value equals `<old>`. Here the
all-zero old value requires `main` to be absent. `show-ref` should now print:

```text
af073e00db03de2c46604ea4d9a60d271c7f5adf refs/heads/main
```

Now install B's payload. Pretend a second writer prepared B while it still believed `main` was the
base commit. The `if` keeps the expected rejection bounded while preserving the shell's existing
options.

```sh
git --git-dir="$CURSOR_LAB/replica.git" index-pack --stdin < "$CURSOR_LAB/b.pack"
git --git-dir="$CURSOR_LAB/replica.git" cat-file -t "$B_OID"
if git --git-dir="$CURSOR_LAB/replica.git" update-ref \
  refs/heads/main "$B_OID" "$BASE_OID"
then
  printf 'unexpected: stale update succeeded\n'
else
  printf 'expected: stale update rejected\n'
fi
git --git-dir="$CURSOR_LAB/replica.git" show-ref refs/heads/main
```

B's `cat-file` result is `commit`, proving its payload is present. The update should report that
`main` is at A but the writer expected the base OID. The last line must still name A. Compare those
two facts: rejecting publication does not remove B's already installed objects, and possessing B's
objects does not make B the branch tip.

## Clean up or stop here

Clean the owned fixture now, including if you reach the 20-minute cap. A later run starts from the
same deterministic commits, so no state needs to be retained.

```sh
"$COURSE/lab/lab.sh" clean "$CURSOR_LAB"
```

The experiment separated two events that a replication design must order: install immutable
payload, then conditionally publish a mutable name. The interpretation below connects that separation to
concurrent writers and object-storage publication.


## Interpretation and optional worked solution

Read after the learner task above.

## What the evidence means

The pack import and ref update changed different namespaces. `index-pack` made A's commit, tree,
blob, and parent available by OID. That is why `cat-file` returned `commit` and `show` could read
`change a`. Yet `show-ref` remained empty because pack contents do not say which mutable branch name
should move.

The successful `update-ref` was the publication event in this small Git-only model. Its all-zero
expected old OID proved that `main` did not already exist. Afterward, `show-ref` mapped `main` to
`af073e00db03de2c46604ea4d9a60d271c7f5adf`, so ordinary branch-based discovery could see A.

The B attempt showed the competing outcome. B was a valid installed commit, but the writer's view
of the ref was stale: it expected the base OID while `main` already held A. Git rejected the update
and left `main` unchanged. If the command had set B without an expected-old value, it could have
silently replaced A and hidden a concurrent update from the branch history.

Installed B is not corruption and need not be deleted immediately. It is an unreachable candidate:
no ref in this replica currently selects it. A later garbage-collection policy may reclaim such
objects, but reclamation is separate from deciding whether an update was accepted.

## The systems decision

Treat payload placement and publication as separate states:

```text
absent -> payload installed -> conditionally published
                   \-> rejected candidate remains unreferenced
```

The invariant is “publish only from the expected branch tip.” Recovery can safely retry a ref move
with the same old and new OIDs: success means it made the intended transition; a rejection means the
caller must inspect the current tip and classify the conflict. Merely changing the expected old OID
and retrying would discard the application-level question of whether B is still valid after A.

This is the same shape as writing data before committing a metadata pointer in a storage engine, or
uploading immutable blobs before conditionally replacing a manifest. The tradeoff is that failures
and losing races can leave unreachable payloads that consume space. In return, readers never need
to treat every successful upload as an accepted update, and concurrent writers cannot silently
overwrite a ref when they use the expected-old guard.

This experiment measured native Git behavior in one process on one machine. It demonstrates object
presence, ref visibility, and Git's per-ref expected-old check. It does not establish durable cloud
storage, a shared publication order across repositories, or atomic visibility for several refs.
The next lesson moves the same payload-before-publication boundary into a local object store and
makes a separate index the authority.

## Optional depth

If you want another 5 minutes, read the **DESCRIPTION** section of `git help update-ref`, through
the explanation of the zero old OID. Connect its three arguments to the successful absent-to-A
transition and the rejected base-to-B transition. This depth is not required by later lessons.

As a quick mental check, explain why `cat-file` could read B after the stale update failed while
`show-ref` still named A. No written answer is required.
