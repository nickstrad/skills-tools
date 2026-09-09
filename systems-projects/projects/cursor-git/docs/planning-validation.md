# Roadmap validation — 2026-09-09

Scope: draft roadmap and primary-source/API review, not lesson implementation or experiment evidence.

- `systemscoach check cursor-git` passes: draft agenda, eight structurally valid planned lessons.
- `systemscoach cursor-git route` renders all eight outcomes, 175 minutes total, all planned.
- `systemscoach topics` discovers the draft. All three commands used `SYSTEMSCOACH_STATE` set to
  a fresh temporary directory; it remained empty and was removed after the checks.
- Git 2.43.0 and Go 1.26.8 were observed. No object-store dependency was installed, no experiment
  executed and no lesson marked available or complete. Exact backend behavior remains a future
  authoring acceptance check, as specified in sources.md.
- Final root filesystem has about 16 GB available (34% used), with about 6.8 GiB available memory.
  No owned service, volume, replica or bulky evidence was allocated or retained. The temporary
  CLI-check directory was removed; only the roadmap documents persist, with no evidence expiry needed.
- Read-only learner readiness returned `lab|/labs/pglab/primary|f|1` from the existing PostgreSQL
  cluster at socket `/tmp`, port 5440. SHA256 values for all five course progress databases and
  PostgreSQL progress WAL/SHM match preflight. Existing unrelated working-tree edits remain intact.

The route is ready for agenda review. This validation does not approve the agenda or establish
the proposed protocol's correctness; real failure/recovery checks precede future lesson publication.
