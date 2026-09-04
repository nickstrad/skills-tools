# Linux refactor restart handoff

Updated 2026-09-04. User authorized the refactor, overall/per-change designs, Terra/high
implementation agents, primary final wording and hard work, and incremental Linux-only commits and
pushes.

## Final state

All four changes in OVERPLAN.md and designs/ are implemented and accepted. Terra/high agents
implemented modules 01–04, 05–08 and 09–11 in private copies; primary reviewed their deliveries,
finished faulty variations and semantic claims, and owns all final code and wording. No agent still
owns Linux files. Primary implemented the six incidents, including real service recovery and failure
cleanup. Stable identity/order remains 72 lessons; explicit revisions increased once, default
stays 1.

Planning checkpoint a71e0d6 and capstone checkpoint a879fbe were committed and pushed. The final
integration checkpoint contains all reviewed foundation/resource/boundary work, PLAN decisions,
built lessons, wrapper routes, validation reports and durable knowledge. Use git log with the Linux
path to locate that checkpoint without depending on a self-referential commit hash in this file.

## Evidence and restart instructions

- `validation/01-foundations.md` through `04-integration.md` record actual primary evidence and
  limitations. Final run: 72/72 primary lessons, 72 authored variations overall, all privileged
  success branches. Two negative service checks reject failure and clean up.
- Repository format/lint/type check and 30 tests pass. Synthetic progress retains statuses, notes
  and attempts with changed completions stale. Real learner progress remains untouched.
- `docs/knowledge/linux-evidence-and-variations.md` (repo root) records reusable review findings.
- Installed `/root/.codex/skills/linux-tutor` is a symlink to the repo wrapper; no reinstall needed.
- There is no remaining required Linux implementation work. If resuming for a new change, read
  docs/README.md, current learning_path/AUTHORING guidance, OVERPLAN and the relevant design first.
  Build artifacts through Deno and increment only changed lesson revisions.

Run Deno from `/root/Software/skills-tools/curriculum-tools` using `/root/.deno/bin/deno`. Give
every validation run a private LINUX_LAB. Socket/mount/cgroup experiments require the host execution
context; sandbox denials do not establish course-host policy. Inspect expected evidence, not merely
harness completion.

Concurrent PostgreSQL/SQLite/roadmap work exists on shared main. Never stage or revert it. Use
explicit Linux paths and inspect the index before each commit. Validation `/tmp` logs are optional
supporting artifacts; the checked-in reports are the durable recovery record.
