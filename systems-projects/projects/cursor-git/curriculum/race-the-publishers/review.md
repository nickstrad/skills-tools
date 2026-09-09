## What the evidence means

Both initial proposals were based on generation 0. Only one conditional index write was accepted:
the other received HTTP 412. A fresh GET showed one winner, not both candidates and not whichever
payload happened to upload last. The winner is nondeterministic; the invariant is one accepted
replacement for that observed index token. The barrier merely made the clients overlap.

After the same-branch race, the original loser still required `main` to equal the base commit.
That condition was false. A fresh ETag could permit a different index replacement, but would not
make the original branch operation valid. The `ref-conflict` check preserves the request's meaning.
Blindly substituting a fresh ETag and uploading the old proposed index would also erase the winner's
history. Reconstructing the index from the fresh history is necessary even for a valid retry.

The independent-branch scenario isolated this distinction. The index had changed, but the losing
writer's branch had not. Revalidation passed without changing the expected-old branch value; the
new proposal preserved the accepted entry and appended the second operation. Generation 2, three
entries and the two final branch tips establish that both accepted updates survived.

## The systems decision

Use two levels of validation: shared publication version and application preconditions. A version
conflict says your observation is stale. It does not say whether your intent should be retried,
rejected, or reconsidered by the caller. Optimistic SQL updates, configuration publication and
object manifests all face this distinction.

The object store supplies the serialization point. There is no distributed lock or primary election
in this small client protocol; that does not eliminate coordination from the system. It relies on
the storage service's conditional-write implementation. A few successful races support this lab's
behavior on SeaweedFS 4.46, not a proof of its guarantees across failures or many hosts.

Our adapter verifies a small, trusted fixture and places expected ref values in JSON. It is not a
complete receive-pack implementation: real Git acceptance needs additional object validation and
reference-transaction integration. We use full packs, a small retained index, no arbitrary clients,
and no garbage collection. The publication mechanism is the subject of this batch.

## Batch check-in

You have separated payloads from refs, uploads from publication, and retryable index conflicts
from invalid branch updates. Before the next batch, briefly consider whether the explanations were
clear, whether each session fit 20–25 minutes, and which failure was most useful to inspect. Tell
the coach what to adjust when requesting the next lessons; no written notes or quiz are required.

Lessons 4–6 will distinguish a committed operation from a client's knowledge of it, then build and
recover a replaying replica. They remain planned until requested and validated.
