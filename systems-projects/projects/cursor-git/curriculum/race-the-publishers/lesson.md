## The question

Two writers can both read the same index and prepare valid changes. A **lost update** happens when
one blindly overwrites the other's publication. Compare-and-swap prevents that overwrite, but a
failed CAS does not automatically mean the operation itself is still valid.

There are two comparisons: the **index ETag** asks whether any publication has intervened; the
**expected old branch tip** asks whether this particular branch still has the state the operation
was based on. A retry can refresh the former while still failing the latter.

```text
                   both read generation 0 / ETag E0
                    /                         \
           A: main base -> A            B: main base -> B
           upload pack/record           upload pack/record
                    \                         /
                    conditional PUT index, If-Match E0
                           one shared authority
```

Budget: 4 minutes concepts, 3 setup, 8 race/conflict, 6 independent-branch retry, 4 review/cleanup.
Two supplied HTTP client processes create the concurrency; one experiment terminal is sufficient.
The supplied barrier lets both clients reach the starting line before either sends its request.

## Predict

Can both proposals be valid when prepared, yet only one be publishable? After the loser refreshes
the index, is changing its ETag enough to make `main: base -> loser` safe?

## Prepare two writers

If needed, run `lab/install.sh` as in lesson 2 before your lesson clock; it is already installed on
this VM. Every scenario below has a fresh owned root; no previous lesson state is needed.

```bash
COURSE=/root/Software/skills-tools/systems-projects/projects/cursor-git
CURSOR_LAB=$("$COURSE/lab/lab.sh" start store)
printf 'Your disposable lab: %s\n' "$CURSOR_LAB"
"$COURSE/lab/seed.sh" "$CURSOR_LAB"
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" a refs/heads/main
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" b refs/heads/main
"$COURSE/lab/upload.sh" "$CURSOR_LAB" a
"$COURSE/lab/upload.sh" "$CURSOR_LAB" b
cat "$CURSOR_LAB/a.etag" "$CURSOR_LAB/b.etag"
jq '.updates' "$CURSOR_LAB/a.record.json" "$CURSOR_LAB/b.record.json"
```

`seed.sh` supplies generation 0 with base content and refs. Each `candidate.sh` checks the branch
against the same saved snapshot and builds a proposed index. `upload.sh` repeats lesson 2's real
immutable PUTs without publishing. Compare both ETags (identical), old tips (identical), and new tips
(different). The immutable objects can coexist even though the two same-branch updates cannot both
be accepted as originally proposed.

## Release the race and inspect the authority

```bash
"$COURSE/lab/race.sh" "$CURSOR_LAB"
if [ "$(cat "$CURSOR_LAB/a.status")" = 200 ]; then
  WINNER=a; LOSER=b
else
  WINNER=b; LOSER=a
fi
printf 'Winner: %s; loser: %s\n' "$WINNER" "$LOSER"
cat "$CURSOR_LAB/$LOSER.publish.body"
"$COURSE/lab/snapshot.sh" "$CURSOR_LAB"
jq --arg key "records/$WINNER.json" '.entries | index($key)' "$CURSOR_LAB/snapshot.json"
jq --arg key "records/$LOSER.json" '.entries | index($key)' "$CURSOR_LAB/snapshot.json"
```

Expect one HTTP `200` and one `412`; either writer may win. Stop if the helper reports other statuses.
`race.sh` runs two independent `curl` clients, each with its own saved `If-Match` ETag and proposed
index, then waits for both. Its local barrier coordinates when to start; it does not serialize the
object store's writes. The actual conditional PUT inside each client is the same as lesson 2.
Response bodies and headers stay in this lab for inspection.

`snapshot.sh` performs a fresh GET and saves the response body plus ETag. Generation should be 1,
and the entries should contain the base plus exactly one winner. The two `jq` queries search the
entries: expect position `1` for the winner and `null` for the loser. `--arg` passes a shell value
as a JSON string. This checks actual published history independently of the helper's status summary.

## Retry the original losing operation

The saved snapshot now has a fresh ETag. Our original operation still expects the base commit;
we do not rewrite its expected-old value to whatever happens to be current.

```bash
retry_status=0
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" "$LOSER" refs/heads/main || retry_status=$?
printf 'retry preparation exit: %s\n' "$retry_status"
curl -fsS --max-time 5 http://127.0.0.1:18333/cursor-lab/index.json | jq '.generation, .entries'
```

Expect exit `3` and a `ref-conflict` message naming different expected/current tips. No second
publication occurs. The shell records this expected failure without changing its error settings.
A new operation based on the current branch could be designed later, but silently changing the old
tip of this request would accept different semantics.

## Change one condition: independent branches

Clean this scenario, then prepare A on `main` and B on `feature`. Both refs initially point at the
base commit. Predict whether a losing writer can now preserve its original expected-old value.

```bash
"$COURSE/lab/lab.sh" clean "$CURSOR_LAB"
CURSOR_LAB=$("$COURSE/lab/lab.sh" start store)
"$COURSE/lab/seed.sh" "$CURSOR_LAB"
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" a refs/heads/main
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" b refs/heads/feature
"$COURSE/lab/upload.sh" "$CURSOR_LAB" a
"$COURSE/lab/upload.sh" "$CURSOR_LAB" b
"$COURSE/lab/race.sh" "$CURSOR_LAB"
if [ "$(cat "$CURSOR_LAB/a.status")" = 200 ]; then
  LOSER=b; REF=refs/heads/feature
else
  LOSER=a; REF=refs/heads/main
fi
"$COURSE/lab/snapshot.sh" "$CURSOR_LAB"
"$COURSE/lab/candidate.sh" "$CURSOR_LAB" "$LOSER" "$REF"
jq . "$CURSOR_LAB/$LOSER.index.json"
curl -sS --max-time 5 -o "$CURSOR_LAB/retry.body" -w 'retry HTTP %{http_code}\n' \
  -X PUT -H "If-Match: $(cat "$CURSOR_LAB/$LOSER.etag")" \
  --data-binary "@$CURSOR_LAB/$LOSER.index.json" http://127.0.0.1:18333/cursor-lab/index.json
"$COURSE/lab/snapshot.sh" "$CURSOR_LAB"
```

Now preparation succeeds because the losing operation's branch still points to the base. The
rebuilt index preserves the winner's entry and appends the loser. This single retry returns `200`;
expect generation 2, three entries (base and both operations), and both branch changes. A continuing
stream of writers could conflict again; a production retry loop would remain conditional and bounded.
`-H` adds the precondition header, `--data-binary @FILE` sends the exact index, `-o` saves the response,
and `-w` prints its HTTP code. HTTP `000` means a transport failure, not a CAS loser.

## Clean up or stop here

```bash
"$COURSE/lab/lab.sh" clean "$CURSOR_LAB"
unset CURSOR_LAB WINNER LOSER REF retry_status
```

At the 25-minute cap, clean whichever scenario is active; shutdown can take about 20 seconds.
Each scenario restarts from a deterministic fixture. Do not leave a stopped store or copied payloads
for the next lesson. The interpretation and optional batch check-in follow below.
