# Batch 1 design — approved scope, 2026-09-09

User requested the first three lessons after reviewing the eight-step roadmap. Preserve all slugs,
durations and later planned steps. Primary owns project metadata, this design, handoff, integration
and validation. Follow docs/lesson-batch-workflow.md with bounded Sol delegation.

## Experiments and evidence

1. **objects-before-refs (20 min):** deterministic tiny Git fixture with base and child commit,
   supplied pack plus an initially empty bare replica. Import pack; cat-file finds child while
   show-ref finds no branch. Expected-old update-ref creates branch. Repeat with wrong old OID;
   failure leaves branch unchanged. Explain object reachability versus branch visibility.
2. **publish-the-index (20 min):** local SeaweedFS, immutable pack/JSON record, initial index.
   Upload candidate payloads; inspect HTTP success and unchanged index. This is the deliberate
   stop-before-publication failure. Conditional index PUT publishes it, subsequent GET verifies
   recorded operation and generation. Exercise stale conditional PUT and conditional GET as backend
   acceptance checks. Data survives normal store restart. Upload and publication have separate truth.
3. **race-the-publishers (25 min):** two prepared candidates read the same index ETag, run independent
   curl PUTs concurrently behind a supplied release barrier. Exactly one succeeds; the other returns
   412. Inspect stored index, candidate payloads and expected old/new refs independently. Fresh index
   allows retry for an independent branch; same-branch loser must be rejected, not blindly rebased.
   Supply fixture/coordination and worked retry decisions; no HTTP programming assignment.

Use native Git/curl/jq for visible state. Shell is supplied launch/fixture plumbing; introduce Go
only when core automation is essential. Each lesson can start cold and has a complete owned cleanup
path. Shell strict mode stays inside scripts/subshells. All subprocesses and ports have recorded
ownership; no global kills. At 25 minutes clean up and restart from deterministic fixture later.

## Backend and resources

Candidate SeaweedFS release 4.46, subject to binary/source checks and actual capability trial. One
local store with loopback-only listeners; pin download hash, verify bounded volume allocation and
startup. Use unique /tmp/systems-cursor-git-* roots. Peak cap 2 GB disk / 1.5 GiB RAM includes binary,
download, metadata, volume allocation, two Git copies, packs and evidence. Preflight ~16 GB free,
6.8 GiB RAM available. Preserve learner PostgreSQL and all progress hashes. Install reusable tool
binary outside tracked content; clean all validation roots after evidence inspection.

## Discovery and shell (independent assignment)

Add top-level `systemscoach courses` and `list` aliases for existing `topics`. Bare `systemscoach`
should show courses and actionable route/lesson commands without requiring selection. Listing shows
approved/draft and available/total lesson counts. Keep explicit `systemscoach lesson` selection
semantics and all progress behavior. Reserve new command names. Test empty catalog, multiple
projects, state immutability, bad arity and discovery counts. Scope is systemscoach's own courses;
do not silently merge unrelated tutor catalogs.

Update /root/.bashrc with an idempotent PATH entry for the installed systems-projects launcher.
Verify an actual fresh interactive Bash can run the command from /tmp with a minimal initial PATH;
resolve Go availability without depending on a tool-call-only environment. Preserve unrelated lines.
Owned files for this assignment: systems-projects/cmd/systemscoach/*, bin/systemscoach if necessary,
docs/format.md, skills/systemscoach/SKILL.md and /root/.bashrc. Primary owns README and integration docs.

## Publication acceptance

Read the available lesson pages and their legacy interpretation sources; run every rendered core
code block in real disposable fixtures.
Inspect HTTP status/body/ETag, actual Git OIDs and refs, winner/loser history and restart persistence.
Exercise same-branch conflict and independent-branch retry. Repeat races with reversed candidate
order; bounded sampling is evidence, not a proof of distributed storage guarantees. Test launch
failure and cleanup; ensure no lingering process or directory. Publish only 1–3 after review.
Run CLI tests/vet, route/check and isolated lesson/review/done smoke checks. Record versions, source
hashes, actual runtime/resource use and final learner readiness. Commit coherent owned chunks and
remove temporary handoff at completion.
