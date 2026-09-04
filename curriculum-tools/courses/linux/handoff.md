# Linux refactor restart handoff

Updated 2026-09-04. User authorized a deep, justified Linux refactor, Terra/high implementation
agents, primary final wording and difficult work, and incremental Linux-only commits/pushes. Read
OVERPLAN.md and designs/ before resuming.

## State

- Planning checkpoint pushed as a71e0d6. Root capstones and guided wrapper reviewed; six real
  experiments and all six authored variations pass. This commit contains only that finalized
  implementation unit and its generated artifact.
- Modules 01–04 were delivered but sent back for prediction wording, exact variation assertions and
  EOF cleanup fixes. Modules 05–08 were sent back for variations that referenced already-cleaned
  state and insufficient actual validation. Modules 09–11 are correcting sandbox-driven socket skips
  and validating real branches.
- Agents own those source files until corrected delivery. Do not commit their current working
  versions yet. Designs record owned files; agents use private copies.
- Installed `/root/.codex/skills/linux-tutor` remains a repo symlink.
- Concurrent PostgreSQL/SQLite work includes new commits on main. Never stage or revert those files.
  Explicit Linux paths only; inspect the index before committing.

## Next actions

1. Review corrected Terra/high deliveries and actual variation evidence.
2. Build all Linux sources and run full course serially on the disposable host; socket/mount/cgroup
   experiments require an escalated validation command.
3. Update PLAN and durable knowledge, test isolated progress reseeding, then run scoped and
   repository checks. Commit/push finalized units with this handoff.

## Validation

See validation/04-integration.md for the capstone evidence and current cross-course check failures.
Deno is `/root/.deno/bin/deno`. Run from `/root/Software/skills-tools/curriculum-tools`. Give every
run its own LINUX_LAB; never seed real progress. Harness completion alone does not prove expected
output.
