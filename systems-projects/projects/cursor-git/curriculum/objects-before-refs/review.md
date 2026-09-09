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
