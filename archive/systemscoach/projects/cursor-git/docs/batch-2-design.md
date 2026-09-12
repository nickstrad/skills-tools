# Final five lessons: design and implementation contract

2026-09-09: Nick explicitly requested “do the final 5 lessons too.” This authorizes lessons 4–8
on the existing route in one delivery. The subsequent learner-work correction also requires a
retrofit of lessons 1–3. Preserve slugs and progress; follow normal revision rules for changed lessons.
Keep current duration targets unless a concrete overload requires a proposed split.
Primary owns this design, teaching pages, metadata, harness, evidence and knowledge integration.
Bounded Sol implementation owns only `lab/cursor/*.go`, including tests. Primary reviews and
independently validates every important boundary against the real pinned SeaweedFS and Git.

## Learner coding clarification and resume checkpoint

Nick explicitly requires meaningful learner work in **every lesson**, and made this a norm for all
systemscoach courses. The earlier plan that only6/7 need learner edits is superseded. Follow
[the all-eight task plan](learner-work-plan.md): meaningful native command construction or diagnostic
investigation in1–5/8, focused Go decisions in6/7. Supply transport, processes, fixtures and cleanup;
explain unfamiliar syntax and leave the mechanism-bearing task to the learner, with graduated hints
and a separate worked solution. Include attempts and debugging in the existing lesson time budgets.
The protocol experiments below still apply, but their fully supplied draft pages need this retrofit.

Implementation still required: factor the real client's state classification and read-admission
policy into short named functions. Copy the client into an owned learner workspace under LAB;
the starter functions should fail closed until implemented. Build an exercise binary from that
copy so the edit actually controls the real replay/read experiment. Do not substitute a detached
toy function or merely ask the learner to inspect a supplied solution. Use the worked client for
initial fixtures, then run the exercise binary through the same external evidence checks.

Suitable replay edit: classify current ref as expected-old (apply), intended-new for the single
pending entry (resume safely), or other (reject divergence). Suitable read edit: given successful
authority observation and local applied/target state, choose catch-up, serve or fail; an unknown
authority must not admit a stale read. Keep local locking, HTTP and Git plumbing supplied. Review
the actual helper shape before finalizing signatures; ensure the functions are wired into its core.
Test the starter's bounded failure and the worked solution through real lessons before publication.

Nick then requested a clear-context-ready checkpoint. Current source drafts are intentionally
unpublished. Read `handoff.md` for exact saved status, ownership and next actions before resuming.

## Experiments

4. Reconcile unknown outcomes (20 min): prepare/upload op-a with existing scripts. A supplied Go
publisher exits after successful index PUT, before returning its application success reply. Inspect
authority independently and retry the identical operation ID without another entry. Contrast an
uploaded but unpublished op-b on feature, which must be published rather than falsely deduplicated.
Reject operation-ID reuse with different content. No claim to exactly-once transport.
5. Replay published history (25 min): publish op-a, then rebuild an empty bare replica by following
index entries, downloading records/packs, checking SHA256, importing through Git and applying refs.
Inspect actual refs, content and marker count. Withhold packs/a.pack from a disposable fixture; a
new replica may apply base but must stop at missing A without marking it applied. Restore the exact
bytes and resume. Explicit old/new preconditions and source of truth are visible.
6. Interrupted replay (20 min): materialize base, publish A, then exit the replayer after A's ref
transaction but before its marker. Ref is A, applied count is still 1. Retry recognizes the pending
entry's already-installed ref and advances once. A divergent local ref is rejected, not overwritten.
All failures target private cache processes/directories. Process loss, not host power loss.
7. Verify before serving (20 min): materialize base, publish A, deliberately suppress its catch-up
wake-up. Direct Git still reads base. A guarded read consults authority, catches up and returns A;
next read gets an unchanged index response. Stop the owned store: guarded read fails within a bound
even though raw local Git still works. Notifications are explicit CLI hints, not a production UDP
implementation. Read/apply share a local lock; the object store remains publication authority.
8. Evict and rebuild (25 min): accepted A/B, an unpublished orphan and a suppressed reply; remove
ALL local Git directories including source fixture and work packs after saving only expected OIDs
and integrity checks. Rebuild two replicas using solely retained object-store history and the supplied
binary. Compare refs, reachable object IDs/content and native fsck. Compare cold/warm request/byte
counts and time, without a production throughput claim. Withhold a published pack and prove a fresh
rebuild cannot complete; restore from a recovery copy fetched from the authority, then finish.

## Supplied Go CLI contract

Build into the owned lab as `$CURSOR_LAB/cursor`; standard library only, Git subprocesses.
Commands:

```
cursor publish LAB a|b [--lose-reply]
cursor replay LAB NAME [--stop-after-ref=op-a]
cursor read LAB NAME
cursor wake LAB NAME [--drop]
```

Endpoint default `http://127.0.0.1:18333/cursor-lab`; optional `CURSOR_ENDPOINT` supports a loopback
test endpoint. Every invocation has an overall finite deadline (about 10 seconds), including HTTP,
Git and bounded lock acquisition. HTTP response sizes/index counts are bounded to this tiny lab.
Require the canonical owned LAB marker; refuse symlink/out-of-root paths. NAME is a safe simple
slug. Repositories at LAB/NAME.git, state at NAME.git/cursor-state.json, locks at LAB/NAME.lock.
Keep lock outside the repo, so cache loss cannot accidentally replace a live lock inode.

Publisher: use existing a/b.record.json and stored immutable records/packs. Verify semantic record
identity and payload SHA before new publication. Read the latest index and referenced records,
deduplicate by stable `operation` ID only when the original record content matches. Same ID/different
intent is an error. Uploaded object alone is not deduplication evidence. Check expected old refs,
rebuild proposed history from current index, and CAS with its ETag. A bounded CAS retry must repeat
identity and precondition checks. Successful normal publication prints operation/generation. The
failure flag actually exits process with code 86 after PUT success, before application success text.
Retry returns an explicit already-published outcome, preserving index generation/entry cardinality.

Replay: fetch a captured index, then apply only its ordered entries. Fetch/validate each record,
download/verify pack SHA, import with `git index-pack --stdin`, and use Git expected-old updates.
The base record updates two refs; use `update-ref --stdin` transaction, not arbitrary sequential
unprotected writes. Ref fields/OIDs/keys must be validated before Git input. Detect a rewritten
history prefix rather than trusting a count alone. State stores `applied` entry count, accepted
prefix keys, resulting expected refs and a cached complete index/ETag for later conditional reads.
Only persist the new applied marker after all ref effects for that entry succeeded. Atomic file
replacement with sync is appropriate; clarify process-crash scope rather than claiming power-loss
durability. Git objects/refs are the real data, not an alternate JSON-only replica.

Resume: before advancing an entry, actual refs may equal the previous marker state, or (for this
pending entry only) its intended new values after an interrupted apply. Anything else is divergent;
also reject extra/mutated refs unrelated to the pending update. Replay may skip an already-applied
transition but must never infer arbitrary later state from that shortcut. When caught up, verify
actual refs equal the captured index. Warm reads verify local refs even on 304. Missing/corrupt pack,
record, history prefix or local divergence must fail without advancing past that entry.

Read: hold one bounded local exclusive lock across index check, catch-up and Git inspection. Compare
the authoritative index ETag with the cached fully applied index: 304 can use it, 200 captures a new
target. Serve only after the target is installed and actual refs agree. An overlapping later publish
can follow this read's index observation; do not promise “latest at response time.” Report captured
generation/main OID plus object-store requests, bytes and elapsed milliseconds. On error print no
`served` result. Do not let a notification or cached timestamp authorize a read.

Wake: delivered hint invokes replay; `--drop` deliberately omits that invocation. This is supplied
event plumbing and an honest local approximation, with no daemon, gossip or transport guarantees.

## Validation and resource lifecycle

Agent uses temporary Git repositories/httptest for unit checks; no shared SeaweedFS while primary
may be validating. Agent reports source paths and actual unit evidence. Primary runs real-service
experiments serially, checks native Git refs/content/fsck, logs structured marker/HTTP results and
tries corrupt/missing payload, identity reuse, wrong local refs, crash/retry and cached-index cases.
Read/unavailable paths must return bounded failures without false freshness. Run rendered commands
and isolated systemscoach progress/route checks; never mark learner lessons complete.

Reuse pinned tool and owned launcher unchanged. Existing ~16 GB free / 6.8 GiB RAM supports the
2 GiB disk / 1.5 GiB memory budget including compiled helper, store, both rebuilds, retained packs,
temporary recovery object and logs. No large datasets, new dependency downloads or external services.
Every lesson starts cold, provides cleanup at the cap, and leaves no live/stopped lab behind.
Retain small validation/source manifests only; remove reproducible fixtures and temporary handoff.
Update the systems knowledge store and verify learner /labs/pglab plus progress at completion.
