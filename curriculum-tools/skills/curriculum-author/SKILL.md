---
name: curriculum-author
description: Plan or incrementally author hands-on systems courses in the tutor engine. Use for future course proposals, lesson/module creation or revision, real-tool validation, and course wrapper installation. Planning alone does not implement a course.
---

# Curriculum author

The engine is `/root/Software/skills-tools/curriculum-tools` (TUTOR). Read the repository
`docs/README.md`, relevant knowledge entries, learner profile, and `$TUTOR/docs/AUTHORING.md`. The
learner studies around work and children: aim for about ten minutes per new lesson, with a
fifteen-minute core ceiling including context, setup, experiment, interpretation, and cleanup. Keep
unfamiliar mechanisms well explained. Existing reference courses are not a default size.

## Plan before implementing

Use [`future-courses/README.md`](../../../future-courses/README.md) for the planning contract:
create `course.md` immediately, retain research/feedback/decisions there, invite suggestions, and
record explicit final-outline sign-off. Planning does not scaffold a course, create progress or
allocate validation infrastructure. Implementation requires that sign-off plus a batch request;
material scope/count/order changes need renewed sign-off. Keep one canonical route and link to it.

## Implement only the requested batch

1. Read the agreed route and `docs/lesson-batch-workflow.md`. Use the current user's explicit
   model/delegation choice; historical plan assignments do not bind the current batch. Usually
   author 3–4 short lessons; do not build the whole future course.
2. Scaffold only if implementation is requested and the course does not exist:
   `cd $TUTOR && deno task new-course <id> "<Name>" <tool> "<description>" <minVersion>`. Keep
   availability distinct from the planned route.
3. Edit `courses/<id>/curriculum/*.ts` as typed Draft objects using the raw `code` tag. Register
   modules in `curriculum/mod.ts`; prerequisites use earlier slugs. Preserve learner experiments for
   metadata-only edits. Never hand-edit generated `lessons.json` or learner progress.
4. Build the changed course and run relevant structural checks. Validate each new or changed
   experiment against the real tool in an owned lab; check actual outcomes, not only process exit.
   Run independently and in sequence where state could leak. Use `docs/VALIDATION.md` and the
   course-specific findings. Delegate bounded files only when authorized; review the resulting
   evidence yourself.
5. Smoke-test the shared `tutor <id> <n> lesson|done` flow with an explicit temporary `--db PATH`.
   Showing content never completes it. Preserve stable identities; bump revisions only for material
   lesson changes and check progress migration on a copy when necessary.
6. Install or synchronize the course wrapper skill if required. Record non-obvious findings in
   `docs/knowledge/` and its index, update authored availability, and report validation limits.
   Clean all owned labs/evidence and verify learner readiness before finishing.

Read `docs/knowledge/vm-resource-cleanup.md` before allocating labs. Account for peak backup,
replica, archive, and evidence copies, preserve `/labs/pglab` and unrelated work, and retire owned
resources after validation. Historical scratch paths are not instructions to rebuild old labs.

## Shared lesson design

Every lesson causes a phenomenon and observes it. The generic CLI owns presentation:
`tutor <course> route` lists status, `<n> lesson` prints one complete lesson, and explicit
`<n> done` records completion. Follow the complete lesson contract in
[`docs/AUTHORING.md`](../../docs/AUTHORING.md): context and a plain-text-readable mechanism map
before commands, exact setup/action, expected evidence, interpretation, cleanup and honest safety
metadata. Do not implement course-specific renderers, quiz/review stages or required external
reading. Existing source metadata is compatibility data, not a learner gate.

## Validation pitfalls to retain

- The generic harness detects timeouts, not all SQL failures. Read output, classify intentional
  errors, and compare data outcomes with expectedResult.
- A lesson must recreate its own state or explicitly name a prerequisite that does so.
- Real two-session experiments must keep separate live connections and deterministic ordering.
- Crash/restart/replication lessons require serial owned fixtures and reliable teardown.
- Feature-probe the actual runtime and any language binding; version text alone may not establish
  required optional extensions.
- Distinguish process failure from power loss, plans from measured work, and engine counters from
  physical device behavior. Do not claim a stronger guarantee than the experiment establishes.
