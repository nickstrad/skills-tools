---
name: systemscoach
description: Interview, scope, plan, author in small batches, and coach CLI-first local systems projects inspired by engineering write-ups. Use for systemscoach lesson, done, route, topic selection, or project-building requests. Teach distributed-systems mechanisms through short experiments; use the separate tool tutors for PostgreSQL, SQLite, DuckDB, Redis and other tool-internals courses.
---

# Systemscoach

Repository: `/root/Software/skills-tools`. Project builder and CLI:
`/root/Software/skills-tools/systems-projects` (called `SYSTEMS` below).
If relocated, resolve the checkout from this skill's real path (`../../..`).
Read repository `AGENTS.md` and `docs/README.md` before repository work.
Before systems project work, also read `$SYSTEMS/docs/knowledge/README.md`; it indexes reusable
systems-project findings. Use the repository-wide `docs/knowledge/` index for findings shared with
other curricula and the dedicated systems store for project-builder and systems-course knowledge.

## Learning contract

Nick wants worthwhile systems thinking, not a production clone or a Go exercise collection.
Use the **current PostgreSQL Essentials single-lesson flow** as a teaching reference, never its
lesson count or the old 92-lesson reference's scope. New systems lessons target **10–15 minutes
total** for context, learner work, interpretation and cleanup. Preserve honest existing estimates.
Choose the minimum sequence that makes the chosen mechanism and its important failure concrete.
Teach unfamiliar terms before asking predictions. Supply usable setup and first-class terminal diagrams before commands. Lean toward including
ASCII/ANSI art for state, ownership, timelines, queues and storage layout; keep it readable without
color and connect its labels to observed evidence.
No mandatory written answers, reports, notes, quizzes or progress gates. A brief mental/verbal
postmortem is enough. The saved ideas' one-page postmortem is optional.

**Every systemscoach lesson must leave meaningful work for the learner.** Have them construct or
adapt a mechanism-bearing command, change configuration with a causal effect, implement a small
core decision, or choose and run diagnostic commands to resolve a concrete uncertainty. Merely
launching supplied code, copying a complete solution, predicting or reading output is insufficient.
This is Nick's explicit course-wide preference; apply it to new courses and revisions of existing
ones. Read `$SYSTEMS/docs/knowledge/learner-work.md` for the contract and its provenance.

Explain enough to begin, optionally demonstrate a related case, then state the learner's task,
edit/command boundary and observable success criteria before giving its solution. Supply graduated
hints; put interpretation and any worked solution clearly below the learner task in the same
lesson output, or in an optional reference. No separate review step or forced attempt is required. Keep infrastructure supplied. Meaningful native commands count; not every
lesson needs Go. Budget time for the learner's attempt and debugging inside 10–15 minutes. Shorten
demonstrations first; split a lesson only when its useful work still will not fit.

Use local services and their CLIs for the real data path and observation. Supply launch/configuration,
HTTP/RPC/CLI plumbing, fixtures and cleanup. When code is essential, prefer Go, then Deno with a
concrete reason Go is unsuitable. Learner edits should be core structs, ordering, routing, replay,
state transitions or admission decisions. Offer graduated hints and a worked solution. Do not assign
HTTP boilerplate, generated protobuf code, generic RPC frameworks or shell-script assembly as learning.
Cross-system projects may contain PostgreSQL; that does not switch them to pgcoach's Deno default.

## Select and plan a project

Read `$SYSTEMS/docs/design-workflow.md` and the repository learner profile. For topic inspiration,
read `$SYSTEMS/docs/project-ideas.md`; it preserves the learner's supplied shortlist and preferences,
not verified claims about companies. Do not require the shortlist's suggested sequence.

Start with a short interview. Reuse known preferences; ask only what changes scope. The learner may
name a topic, supply a URL, or request suggestions. Verify the relevant primary write-up and exact API
semantics when designing a real proposal; consult saved research first. Separate source claims,
learner interests, proposed local approximations and validated results. Do not browse every saved URL
just to store the examples. Do not mistake the Cursor example for an approved first course.

Propose the smallest worthwhile agenda, its systems questions, observable failures, final evidence,
local resources, supplied scaffolding and intentional omissions. For inexpensive advance planning, define the route in the repository's
`future-courses/<topic>/course.md` using its template. Do not create lab code, validators or lesson
stubs. The generic `tutor <course-id> route` can display these Markdown plans without implementation.
When implementing an agreed systems project, materialize its route in `projects/<topic>/project.json`
and link its PLAN.md to the planning source. `systemscoach <topic> route` shows that runtime route
with completion and planned/available status; it uses the separate systems project engine. Ask the learner to lock in or revise the concrete agenda. This agreement is part
of the user's requested learning workflow; do not begin the first batch until they agree. Existing
explicit agreement suffices; do not ask again. Store its provenance in PLAN.md and set status approved.

## Author only the requested batch

Read `$SYSTEMS/docs/authoring.md` and `$SYSTEMS/docs/format.md`; use the linked templates. Also read
the available curriculum-author skill and `curriculum-tools/docs/AUTHORING.md` for causal experiments
and validation. This project engine uses authored Markdown in `curriculum/<slug>/` and a JSON route;
it does not use the tutor engine's generated lessons.json or progress.sqlite.

Default to proposing **2–3 lessons per batch**, adapting to the learner's request and mechanism.
Do not expand the approved route or fill future lessons without a request. Keep future steps planned.
Design first: name the learner action, supplied boundary and evidence for each lesson. Before
publication, review that the learner controls the target mechanism or investigation. Validate the
starter and worked completion against real external evidence in owned local fixtures, review evidence
and cleanup, then publish the batch (`available: true`). `systemscoach check <topic>` checks structure only.
Use stable slugs and revisions. Keep a concise temporary HANDOFF.md during multi-turn batch work,
record measured validation durably, and remove the handoff at completion. Respect the repository's
batch/commit workflow where applicable; do not commit unrelated work.
At a batch boundary ask briefly about clarity, time and learning value before the next requested batch.

After each completed systems task or lesson batch, update the appropriate durable knowledge note with
the evidence observed, known limits and final cleanup state, and add or update its entry in
`$SYSTEMS/docs/knowledge/README.md`. Put cross-cutting repository findings in root `docs/knowledge/`
as well when they apply beyond systems projects. Do not replace durable evidence with a temporary
handoff.

## Coach and record progress

Execute `$SYSTEMS/bin/systemscoach` with the learner's requested arguments (or installed systemscoach).

- Bare invocation, `courses`, `list`, or `topics`: discover systems project courses, their agenda
  status, available/total lesson count, and actionable route/lesson commands. No project yet means
  interview, not invent a course.
- `use <topic>`: select topic explicitly for short commands.
- `<topic> route`: complete roadmap, including planned steps and completion.
- `[<topic>] <n> lesson`: complete context, diagram, learner task, hints, evidence, interpretation and cleanup.
- `[<topic>] <n> done`: record completion **only when explicitly requested**.
- `[<topic>] lesson`: first unfinished step; planned steps stop at the authoring boundary.

Reads do not update progress or selection. Never infer completion from command success, reading,
or conversation. Tests must set SYSTEMSCOACH_STATE to a fresh scratch directory. The old review
command is only a compatibility alias for the complete lesson. Existing review.md content is
included below the task; new lessons may keep interpretation in lesson.md. The coach
renders commands; it does not execute experiments. Do not run a learner exercise for them unless asked.
When coaching, help with the next useful step and offer hints before volunteering the full answer;
provide the full answer when requested. Do not silently fill the learner's reserved edits.
