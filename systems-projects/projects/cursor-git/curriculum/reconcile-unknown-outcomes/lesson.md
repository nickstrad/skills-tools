## The question

A timeout or a disconnected writer tells you something about the conversation, not necessarily
about the operation. The store might have accepted an update just before the writer disappeared.
Retrying with a new identity could create a second logical update; assuming every timeout means
failure could discard accepted work.

An **operation ID** is a stable name for the original intent. Our immutable record ties that name
to the pack and exact old/new branch values. **Reconciliation** means consulting accepted history
to discover whether that same intent already committed. Merely finding uploaded bytes is insufficient.

```text
upload op-a -> conditional index PUT succeeds -> writer exits -> no success reply
                           |
                    authority includes op-a
                           |
retry same op-a -> look in accepted history -> return its existing outcome
```

Budget: 4 minutes concepts, 3 setup, 8 experiment, 5 review/cleanup. The supplied Go client now
automates publication checks that you acted out with curl. It keeps HTTP and retry plumbing out of
the lesson; Git, JSON and direct object-store requests still expose the actual state.

## Predict

If the writer exits before replying, which evidence could distinguish “uploaded only” from
“published, reply missing”? Should a retry count uploaded records, or accepted operation identities?

## Prepare one operation

Use one Bash experiment terminal. All later blocks share its variables; no previous lab state is
required. SeaweedFS is already installed on this VM; on a fresh installation run the course's
`lab/install.sh` once before the lesson clock, allowing 10–20 minutes for dependencies.

```bash
COURSE=/root/Software/skills-tools/systems-projects/projects/cursor-git
CURSOR_LAB=$("$COURSE/lab/lab.sh" start store)
printf 'Disposable lab: %s\n' "$CURSOR_LAB"
"$COURSE/lab/build.sh" "$CURSOR_LAB"
CURSOR="$CURSOR_LAB/cursor"
"$COURSE/lab/seed.sh" "$CURSOR_LAB"
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" a refs/heads/main
"$COURSE/lab/upload.sh" "$CURSOR_LAB" a
S3=http://127.0.0.1:18333/cursor-lab
jq '{operation,updates,pack}' "$CURSOR_LAB/a.record.json"
```

`build.sh` compiles the supplied standard-library Go client inside the disposable lab. `CURSOR`
names that executable, not the editor. Setup seeds the base and uploads `op-a` without publication.
The `jq` selection shows the stable operation identity and its bound intent.

## Lose the success reply

The failure hook performs the real conditional index PUT, then exits the publisher process before
it returns application success. It is deterministic process loss at that boundary, not a simulated
failure of the object-store write. Capture its expected nonzero exit without changing shell options.

```bash
publish_status=0
"$CURSOR" publish "$CURSOR_LAB" a --lose-reply || publish_status=$?
printf 'publisher exit: %s\n' "$publish_status"
curl -fsS --max-time 5 "$S3/index.json" | jq '.generation, .entries'
curl -fsS --max-time 5 "$S3/records/a.json" | jq '.operation, .updates'
```

Expect exit **86**. Independently inspect generation 1 and `records/a.json` in accepted history,
then `op-a` in that record. The helper's exit alone does not prove publication; these GETs do.
`curl -f` makes unexpected HTTP errors fail, `-sS` keeps failures visible without a progress meter,
and `--max-time 5` bounds each inspection request.

## Retry the same intent

```bash
"$CURSOR" publish "$CURSOR_LAB" a
curl -fsS --max-time 5 "$S3/index.json" | jq '{generation, entries, count:(.entries|length)}'
```

The client should report `already-published`. Expect generation **1**, still exactly **2** entries:
base plus A. It reads the latest accepted index and compares the referenced operation's identity
and content. An existing object at `records/a.json` would not, by itself, justify this answer.
Reusing `op-a` for different old/new values is rejected rather than treated as a successful retry.

## Contrast with an uploaded orphan

Prepare B on the independent `feature` branch. Its payload is stored, but no publisher has attempted
to add it to accepted history yet.

```bash
"$COURSE/lab/snapshot.sh" "$CURSOR_LAB"
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" b refs/heads/feature
"$COURSE/lab/upload.sh" "$CURSOR_LAB" b
curl -fsS --max-time 5 "$S3/index.json" | jq '.entries'
"$CURSOR" publish "$CURSOR_LAB" b
curl -fsS --max-time 5 "$S3/index.json" | jq '{generation, entries, refs}'
```

Before the call, accepted history contains no B. The client must perform a new conditional
publication: afterward expect generation **2**, base/A/B entries, and the updated feature tip.
This distinguishes recovery of an existing outcome from completing a previously unpublished intent.

## Clean up or stop here

```bash
"$COURSE/lab/lab.sh" clean "$CURSOR_LAB"
unset CURSOR_LAB CURSOR S3 publish_status
```

At 20 minutes, use the same cleanup regardless of which operation you reached. It stops only the
recorded store and removes the binary, objects and logs. Resume from a fresh deterministic fixture.
The interpretation below distinguishes the committed outcome from the caller's knowledge of it.
No written response is required.


## Interpretation and optional worked solution

Read after the learner task above.

## What the evidence means

The publisher's exit left the caller without an application success reply, yet a fresh index GET
contained A. The authoritative outcome and the observed request outcome were different facts.
Retrying `op-a` returned its existing result without changing generation or entry count. This is
idempotent handling of one logical operation, not proof of exactly-once message delivery.

B provided the negative control: its immutable object existed, but its operation was absent from
accepted history. Returning “already done” at that point would have lost the update. The client
instead revalidated the original branch precondition and published B through CAS. The new index
preserved A and added B.

The identity check is tied to intent. Matching only a short ID while ignoring its content could
mistake a different requested update for a retry. Our client compares the stored record fields;
it rejects the same operation ID with different content. The retained tiny history lets it search
all accepted records. A larger system needs a deliberate deduplication-retention contract.

## The systems decision

Separate “the operation failed” from “the caller could not determine the result.” Stable identity
and an authoritative lookup turn an unknown outcome into a recoverable conversation. The same
decision appears in payment requests, job submission and database transactions with lost replies.
The caller must preserve identity across retries instead of generating a fresh request each time.

This lab exits a real process after successful publication. It does not drop a network packet or
prove behavior under an object-store outage. If authority cannot be read, the client must report
uncertainty or failure rather than guess. If the original branch precondition no longer holds and
the operation was never accepted, reconciliation cannot make that operation valid.

The worked logic is in `lab/cursor/`: inspect the publisher's identity lookup, original-ref check
and conditional replacement if you want to connect the CLI to Go. No coding is required. The next
lesson makes accepted history useful by materializing a real Git repository from it.
