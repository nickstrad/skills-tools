# PostgreSQL Essentials batch 27–31 — resumable event log

**Temporary file: keep this event log current through the batch. Delete state.md after this batch
of work is done.** Also remove the course's temporary handoff.md at completion, per repository
workflow. Do not treat a context reset as a new task or repeat accepted experiments unnecessarily.

## Current objective and instructions

User requested: “do next batch of 5 postgres-essentials lessons.” The agreed 40-lesson route has
26 existing lessons, so this batch is exactly **27–31**. Primary agent does all work; no subagents
have been used or authorized. User asked who was doing the work and was told this explicitly.

Repository: /root/Software/skills-tools. Read AGENTS.md and docs/README.md. Applied curriculum-author
and tutor skills; read docs/lesson-batch-workflow.md, curriculum-tools/docs/AUTHORING.md,
docs/knowledge/learner-work.md, learner profile, articles index and resource guidance. Go is required
for new tooling. New lessons reserve meaningful learner work, supply a worked completion, and fit
12–15 minutes including cleanup. No progress is marked complete by authoring.

Existing unrelated dirty files at task start (preserve; never stage them with this batch):

- curriculum-tools/tutor.sqlite
- docs/knowledge/postgres-lab.md
- analysis.md (untracked)

Learner PostgreSQL: /labs/pglab/primary, socket /tmp, port 5440, database lab, user postgres. It runs
as pglab.service; do not stop/restart it for authoring. Initial postmaster PID 1331865; a learner
client was connected. Read-only identity checks succeeded. Progress baseline SHA256:
65809427c05348e0484e6a7b57d81607eab52ba360264d4e7330f961ee3ffd99.

## Event log — 2026-09-13 UTC

1. Read required guidance and historical disk report, then verified current resources: about
   9.9 GiB free disk, 7 GiB available memory, inodes 8% used. Scoped fixtures budgeted below 500 MB
   each and run serially. Controller requires 3 GiB free before allocating; preserve 2 GiB headroom.
2. Confirmed fixed route slugs: restore-and-verify, recovery-needs-history, targeted-recovery,
   build-a-standby, received-is-not-replayed. Read PostgreSQL 16 official archiving, pg_basebackup,
   pg_verifybackup, standby and recovery-function documentation. Sources linked in batch design.
3. Created designs/27-31.md and course handoff.md. Committed design as **ae0ef95**
   (`Design PostgreSQL Essentials recovery and replication batch 27–31`). This is the only batch
   commit so far. All subsequent implementation remains unstaged/uncommitted at this checkpoint.
4. Implemented **curriculum-tools/courses/postgres-essentials/lab/recovery/main.go**. Self-contained
   Go controller creates only fresh /tmp/pe-recovery-* trees, uses explicit private Unix sockets,
   PostgreSQL 16, small 1 MB WAL segments, normal durability, and postgres OS credentials when root.
   Supports --lesson, --query (27), --action (28/30/31), and --target (29). Native learner choices
   affect the real experiment. No existing target path is accepted. Child process groups are
   cancelled on SIGINT/SIGTERM/deadline; cleanup uses an uncancelled context, stops both servers,
   verifies stopped status and removes the owned tree. Failure to verify stop retains the tree.
5. First sandbox run could not chown to postgres (`invalid argument`); it cleaned its empty root.
   Real fixtures must run with sandbox_permissions=require_escalated. `go run` is already approved.
6. Independently ran successful restore (27), missing-history repair (28), standby (30), replay (31).
   Initial lesson-28 validation caught an actual transaction-order bug: several statements in one
   psql -c argument share an implicit transaction, so restore points preceded the intended COMMIT.
   Fixed archiveWork to execute each INSERT and pg_create_restore_point in separate calls.
   Revalidation recovered exactly baseline + accepted order. Save this finding in durable docs.
7. Authored all five **lessons/27-...md through 31-...md**, revision 1, shell sessions=1, 12–15
   minutes, diagrams before commands, learner task + attempt budget, safe incomplete Run starter,
   worked completion in Expected result, expected failures and cleanup. Existing 1–26 untouched.
8. Created **validation/batch-seven/main.go**, a Go acceptance driver. It reads actual Markdown
   through the course parser, runs each starter through `tutor validate --isolated` and expects
   its specific failure, then makes a temporary course copy replacing only Run with the exact
   displayed worked completion, and runs all five through the generic CLI. It also checks a backup
   lacking -R, explicit action failure, non-root execution, and SIGINT with both servers live.
9. Full real acceptance driver **passed** on PostgreSQL 16.15. Command (from curriculum-tools):
   `go run ./courses/postgres-essentials/validation/batch-seven` with escalation.
   Starters accepted: 27 ~5.9s, 28 ~4.8s, 29 ~5.4s, 30 ~2.2s, 31 ~12.2s.
   Worked sequence: **5/5**, ~21.3s. Missing -R, action failure, postgres normal-user invocation,
   and SIGINT cleanup all accepted. All emitted owned fixture paths verified absent afterward.
   Driver's temporary /tmp/pe-batch-seven-* root also removed by defer.
10. Decisive evidence in **validation/batch-seven-worked-sequence.log**:
    27 baseline/restored rows 1|bolts|10,2|nuts|20,3|washers|30; later source quantity 99 for id=2.
    28 missing named starting segment causes required-checkpoint failure; copied repair reaches
    before_bad with ids 1,2 and original archive hash unchanged.
    29 source ids 1,2,3; chosen before_bad recovered ids 1,2 and actual target-pause log.
    30 standby.signal + in_recovery + streaming receiver + post-backup row visible.
    31 paused|t|f|0 becomes not paused|t|t|1 after resume; raw receive/replay LSNs corroborate.
    Largest measured removed fixture ~87.3 MB, below 500 MB budget.
11. `bin/tutor postgres-essentials check` passed **31 lessons OK**.
    `go test ./...` from curriculum-tools passed every package. Golden files describe historical
    fixed fixtures and do not need availability edits.
12. `bin/tutor postgres-essentials progress verify` passed on a disposable copy. Stored result:
    **validation/batch-seven-progress.json** — 261 prior lesson rows across courses, 39 progress
    rows, 40 attempts; progress_unchanged, attempts_unchanged, identities_preserved all true;
    baseline hash unchanged. Real learner database has not been refreshed or written by this task.
13. User requested this state.md event log for a possible context clear, explicitly to be deleted
    when the batch is done. Created now; continue the original batch rather than ending here.
14. Committed state.md as **fbca066**. Added the `--smoke-only` mode to the validation driver;
    complete plain/JSON rendering of 27–31 matched source, diagrams precede setup, route boundary
    is 31 available/32 planned in isolated state, and skip/done/undone affected only temporary DB.
    Read-only output preserved temporary DB bytes. Scratch was retired.
15. Updated authored availability to 31 in PLAN/README/docs/profile; new fixture README and durable
    findings added. Explained harmless archive probes in 28/29 (prose only; commands unchanged).
    Keep original runtime acceptance source manifest and add final hashes after prose review.
16. Final live checks so far: 9.9 GiB disk and 7 GiB memory available; only learner postmaster
    1331865 remains, read-only identity is /labs/pglab/primary|f|1. All owned labs retired.
    Remaining: acceptance report/final source manifest, final check/diff audit, scoped commits,
    remove handoff.md and state.md. Live catalog adoption is documented as the learner's `init`
    command; AUTHORING.md's no-live-refresh authoring rule has been followed.
17. Final acceptance report, fixture README and final source manifest written. Final smoke rerun
    after prose changes passed; new Go packages compile, whitespace check passes, learner hash
    unchanged. No pe-recovery or pe-batch-seven roots remain. Runtime logs total about 48 KiB
    allocated; retain them with force-add because global ignore rules exclude logs.
18. User asked whether /update-knowledge-store has relevant findings. Searched with kb, added and
    read-verified **data/psql-command-transactions.md** (5 chunks), and corrected the obsolete
    **data/pgcoach-course-authoring.md** in place through kb edit (4 reindexed/embedded chunks).
    It now documents Go tutor, Markdown sources, shared course-scoped progress, isolated author
    validation and catalog adoption. No knowledge-repository commit was made or requested.
    Temporary drafts/editor in /tmp are owned by this task and can now be deleted.
19. Implementation/evidence committed as **c7a985d** (`Author and validate PostgreSQL Essentials
    lessons 27–31`). KB drafts/editor were removed after read verification. Remaining dirty
    authored-availability/docs changes belong to this batch; original tutor.sqlite,
    postgres-lab.md and analysis.md remain unrelated.
20. User requested the state.md approach for every future batch and a final knowledge-store
    reflection before deletion. Updated docs/lesson-batch-workflow.md and AGENTS.md to require
    a root chronological event log, current remaining-work summary, continued state across context
    resets, final reflection and warranted kb updates, then removal at completion. It replaces new
    per-course handoff.md files. Overlapping batches must preserve each other's active state.

## Evidence and gotchas

- validation/batch-seven-source.json hashes all lesson sources plus the Go fixture at acceptance.
  If lesson text changes, update its hash manifest; rerun experiments only for behavior changes.
- Acceptance .log files exist but are ignored by Git globally; explicitly `git add -f` only the
  relevant small batch-seven logs when committing evidence. Build log is empty; omit it if desired.
- Controller log filtering prints each new relevant record once. Missing 00000002.history and a
  lookahead WAL file can appear during successful archive recovery. Explain this in lesson/docs;
  these probes are different from the required checkpoint segment gap. Never remove backup_label
  in response to generic PostgreSQL hints.
- Source Run blocks intentionally fail until learner edits them. Generic validator runs worked
  completions via a temporary source copy; do not report the starters as successful experiments.
- No optional variations have been added. Wrong choices are covered by starter and negative cases.
- No current goal tool was created (user requested a task, not a tracked goal).

## Remaining work

1. Review and commit the new workflow/AGENTS instructions with this event update. No experiment
   rerun is needed for these documentation-only edits; verify whitespace and CLAUDE.md symlink.
2. Commit the authored availability and durable course docs already complete in the working tree.
   Preserve unrelated tutor.sqlite, postgres-lab.md and analysis.md. All real tests and resource
   cleanup have passed; retain only the small committed evidence. Refresh only the final read-only
   progress/resource snapshot if needed after this interruption, not the experiments.
3. Final knowledge-store reflection: the verified psql gotcha and outdated authoring entry were
   already added/corrected and read-verified in event 18. The new batch policy belongs in the
   repository workflow/AGENTS source; no duplicate knowledge-store policy entry is needed.
4. Remove the old course handoff.md and **this state.md** once this checklist is complete; commit
   final docs/removals. The user's requested deletion is conditional on finished work, not context
   clearing. There are no other active batches recorded here.
5. Final response: workflow updated; batch 27–31 authored/validated/cleaned; knowledge-store updates
   recorded; use `tutor postgres-essentials init` then `tutor postgres-essentials 27 lesson` to adopt
   the new catalog. AUTHORING.md's no-live-refresh authoring rule was followed.
