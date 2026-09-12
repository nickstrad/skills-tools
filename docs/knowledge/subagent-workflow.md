# Delegating lesson work to subagents

Updated 2026-09-12 for the Go CLI.

The pattern that worked for the PostgreSQL, SQLite and Linux courses. Last updated 2026-09-04,
including acceptance boundaries from the user-directed Luna/high SQLite pass.

## What happened

In the earlier pass, the user asked for Opus subagents to do experiments and mechanical edits so the
primary model's tokens go to specification and verification. The pattern that held up:

1. The primary agent writes a precise spec file (what to change, what must not change, the exact
   verification commands, what to report) and spawns one subagent per module or file.
2. Each subagent works in a private copy of the repository under a bounded temporary directory,
   with its own lab and database, runs `tutor <course> check` and the relevant
   `tutor <course> validate` commands there, and copies the single finished file back into the
   repo. Nothing else in the repo is touched, and the subagent never commits.
3. The subagent reports per-lesson labeled evidence from two harness runs plus the outputs of the
   equivalence checks.
4. The primary agent re-runs the equivalence checks itself, reads the diff of anything semantic, and
   runs the full course once before committing.

An earlier session hit repeated API 529 errors with subagents; retrying later with three agents in
parallel worked without incident.

## Why it matters

Reformatting 500 lines of chained shell is exactly the work a subagent does well, but it is also
where a silent semantic change slips in. The private copy prevents concurrent build and harness
collisions, and the equivalence checks make the primary agent's verification cheap.

## How to apply

- Put the spec in a file and reference it from the prompt; put per-agent specifics (file, ordinals,
  extra semantic fixes) in the prompt itself.
- Equivalence checks for a Markdown lesson edit:

  ```sh
  tutor linux check
  tutor linux list --json > /tmp/linux-lessons.json
  diff --check curriculum-tools/courses/linux/lessons/<FILE>
  ```

  Compare Setup and Run blocks, expected evidence, safety, sessions, slugs and revisions directly;
  do not normalize away a semantic command change. Run `GOPATH=/root/go GOCACHE=/tmp/tutor-go-build
  go test ./...` and `go vet ./...` in `curriculum-tools/` for engine changes.
- Ask subagents to report what they were unsure about. Both real bugs found during the Linux
  reformat (relative `nice`, a stale-file race in a two-session lesson) came from that section.
- Tell subagents which host conditions are expected noise (other agents' CPU workers raising load
  average, for example) so they do not "fix" a lesson around them.
- Assign concrete approaches and acceptance invariants, not merely module topics. Require an early
  checkpoint when an experiment's design changes; final prose can otherwise describe a different
  algorithm from the code an agent eventually submitted.
- Transfer ownership explicitly before the primary edits a shared file. A validation-only followup
  must not rebuild shared generated artifacts or quietly revise the source under review.
- An agent's PASS is a claim to verify. Reject flattened multi-session runs, unavailable tracing
  reported as a successful trace, and status-zero shell scripts without domain evidence.
- Primary review should compare confounding variables, state/marker ordering, transaction error
  scope, failure windows and measurement denominators. Those design questions matter more than
  whether a long draft has all required headings.
- When the user requests primary-owned writing, the primary writes or substantially edits the
  narratives and reviews all submitted code. Do not delegate the final synthesis back to another
  agent and merely forward its conclusions.
