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

For a proposal or future course, write `future-courses/<id>/course.md` at the repository root using
`future-courses/TEMPLATE.md`, and add it to that folder's index. State goal, prior knowledge,
distinctive mechanisms, lesson count and time rationale, ordered titles/stable slugs, one experiment
and outcome per lesson, visual teaching plan, sources, exclusions, and implementation status. Use
`docs/learning_path.md` for sequence and overlap. Reuse prior research; look up unresolved facts in
primary sources. Keep planning inexpensive.

Create `course.md` immediately as the persistent working draft, then update research, assumptions,
the outline, learner feedback, decisions, and open questions as the conversation progresses. Do not
wait for approval to save a draft or leave the evolving plan only in conversation memory. Explain
why the researched topics have this grouping, order, lesson boundaries, and count. Present the
proposal and explicitly ask Nick for suggestions. Revise it, then ask for sign-off on the final
outline. Keep status proposed until he explicitly approves; record the date, approved outline
revision, and user direction. Do not infer sign-off from silence or a planning request.
Implementation also needs a batch request, which may accompany approval. Material changes to
approved scope/count/order need renewed sign-off; unchanged batches do not. This design approval is
separate from the retired lesson review step.

A plan does not require finished commands, module stubs, new dependencies, a lab, generated
catalogs, progress data, or a validation suite. Do not scaffold or implement merely because the
learner wants to define the route. Keep one canonical route and link to it from implementation
documents. Existing courses may retain their canonical PLAN.md.

## Implement only the requested batch

1. Read the agreed route and `docs/lesson-batch-workflow.md`. Use current user instructions for
   model/delegation choices. Usually author 3–4 short lessons; do not build the whole future course.
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
`tutor <course> <n> lesson` prints one complete lesson; explicit `<n> done` records completion. Do
not implement course-specific renderers, quiz stages, review steps, or required reading stops. The
existing `pgcoach` entry point remains supported.

The pre-experiment reading carries all essential context: what question is being tested, unfamiliar
terms, why it matters, a terminal diagram, and the purpose of unfamiliar commands. ASCII/ANSI art is
a first-class teaching aid. Lean toward including labeled diagrams for ownership, timelines, state
transitions, queues, page/tree layouts, and log flow. Keep them readable without color and connect
their labels to observed evidence. Put them in `syntaxBreakdown` before setup and commands; an
indented Markdown code block avoids backtick escaping in raw TypeScript templates.

- `overview`: a short statement of the experiment's question and purpose.
- `syntaxBreakdown`: concise Markdown with In plain terms, a Visual model when useful, What you are
  learning, and Piece by piece. Explain unfamiliar flags and evidence without repeating a three-part
  definition for every familiar command.
- `setup` and `code`: exact, rerunnable commands; label Session A/B steps and where waits end.
- `expectedResult`: concrete output/state that proves the point; identify permitted variability.
- `systemsLens`: brief interpretation, implications, limits, and useful prior-course contrast.
- `challenge`, `reading`, and `readingNotes`: optional depth, never unfinished core work.
- `safetyLevel`, `runIn`, `sessions`, `minVersion`, and `estimatedMinutes`: honest metadata.
- `tags`: a small useful vocabulary for topic navigation; no taxonomy quota.
- No required written answers, notes, architecture report, or separate capstone unless requested.

Supply unfamiliar code throughout, normally Go outside the current pgcoach course; pgcoach uses the
learner's recorded Deno/pg preference for new clients. Independence can mean choosing evidence or a
remedy in one short incident, not writing an application. If a lesson exceeds its time budget,
narrow the question or fixture rather than shortening the explanation past usefulness.

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
