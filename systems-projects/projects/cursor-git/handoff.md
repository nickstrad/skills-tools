# Cursor Git final batch handoff

2026-09-09: user requested final five lessons. Design is docs/batch-2-design.md. Primary owns
teaching/integration/evidence; Sol will own lab/cursor/*.go only. All 4–8 remain unavailable until
real validation. Prior batch is preserved. No new lab allocated; pinned SeaweedFS is installed.
Preflight ~16 GB free, 6.8 GiB RAM; learner PostgreSQL live. Progress baseline stored outside repo
at /tmp/cursor-final-progress-before.json and removed after final comparison. Preserve concurrent
learner progress changes if observed; never roll back a learner receipt to satisfy a hash check.
