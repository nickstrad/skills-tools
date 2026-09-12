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
