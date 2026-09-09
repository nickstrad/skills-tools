# Cursor Git batch 1 handoff

2026-09-09: agenda approved; lessons 1–3 requested alongside course discovery and Bash setup.
Design: docs/batch-1-design.md. Primary owns all project files, README and final integration.
CLI/shell implementation will be delegated with explicit ownership; backend validation stays primary.
All lessons remain unavailable until real validation. Existing unrelated tree edits must be preserved.
Progress hash baseline: /tmp/cursor-batch1-progress-before.json (remove after final comparison).
Preflight: ~16 GB disk free, 6.8 GiB RAM available; learner /labs/pglab running. No new lab allocated yet.

Checkpoint: Sol CLI discovery/Bash implementation reviewed; one action-classification bug corrected
and tests pass. Sol lesson 1 supplied and run on two removed fixtures; primary review complete.
Primary authored lessons 2–3 and bounded shell plumbing. Pinned SeaweedFS installed under
/root/.local/share/systemscoach/tools/seaweedfs-4.46; archive removed. Real same-ETag races produced
200/412 and winner-only history. Switched mini to server mode because mini starts admin listeners
even with UI disabled; server mode's eight listeners verified loopback. Restart persistence still
under investigation: current tracked tool exec session 46702, owns its unique root and cleanup trap.
New user request: dedicated systems knowledge store added at systems-projects/docs/knowledge; skill
and local AGENTS require reading/updating it. Lessons remain unavailable pending rendered-command
validation, restart check, independent-branch retry, final resource/progress audit and publication.
