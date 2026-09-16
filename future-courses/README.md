# Future courses

Define a course here before implementing it. A plan lets Nick choose and refine upcoming learning
without paying for a complete curriculum, lab, or validation suite up front.

| Course | Plan | Status | Size |
| --- | --- | --- | --- |
| SQLite Essentials | [sqlite/course.md](sqlite/course.md) | Proposed; no essentials lessons implemented | 32 lessons; target ~10 min, core ceiling 15 min |
| Linux Systems v2 | [linux-v2/course.md](linux-v2/course.md) | Proposed; no v2 lessons implemented | 44 lessons; target ~10 min, core ceiling 15 min |
| Practical DuckDB: Data Flows and Improving AI Systems | [duckdb/course.md](duckdb/course.md) | Agreed; first 10 lessons authored | 32 core lessons + 5 optional projects; core target ~10 min, ceiling 15 min |

## Planning contract

Use `<course-id>/course.md`, starting from [TEMPLATE.md](TEMPLATE.md). Keep one canonical ordered
route: goal, assumed knowledge, lesson count and total time, one outcome/experiment per lesson,
stable slugs, a visual teaching plan, a few primary sources, and explicit exclusions. State whether
the plan is proposed, agreed, or partly implemented. A plan is not a runnable course.

### Research, propose, revise, sign off

Create `course.md` at the start as a working draft; do not keep the evolving plan only in chat or
memory. Persist initial research, assumptions, open questions, and the outline as they develop.

1. Research the topic using relevant primary sources and existing notes. Identify the mechanisms
   worth learning, overlap with earlier courses, and what can stay optional.
2. Propose the course in `course.md`. Explain why it has this scope, lesson count, grouping, order,
   and lesson boundaries—not just what the lessons are called. Connect those choices to the
   learner's goals and time budget; distinguish research from unvalidated experiment ideas.
3. Present the outline to Nick and explicitly ask for suggestions: topics to add, remove, deepen,
   shorten, or reorder. Update the same document as feedback arrives, retaining unresolved choices
   so a long conversation or handoff does not lose them.
4. Ask Nick to sign off on the final outlined course. Keep status **proposed** until he explicitly
   approves that outline. Record the approval date and which outline revision was approved in
   `course.md`; silence or a request to research/plan is not approval.

Only implementation waits for final-outline sign-off and a request to implement a batch; one
explicit user message may provide both. Reuse recorded approval rather than asking again for every
unchanged batch. Material changes to approved scope, count, or order need renewed sign-off before
implementing the changed portion. This is design approval, not the retired lesson review step.

Research the decisions that shape scope; reuse existing notes. Do not generate lesson scripts,
placeholder modules, progress databases, installed tools, or validation infrastructure for a
planning-only request. Unknown implementation details can remain short questions for the relevant
batch. Do not invent a tested outcome to make the plan look complete.

On an implementation request, use the agreed plan to author only the requested small batch, usually
3–4 lessons. Link the implemented course's PLAN.md back here for its canonical route; keep runtime
and validation details in that course. Update availability here without duplicating the route.
Keep later planned lessons out of the tutor's available catalog until their Markdown files exist. Existing courses with
canonical PLAN.md files can retain them; link rather than migrate for its own sake.

## Shared learner experience

The generic engine supplies `tutor <course> route`, `tutor <course> <number> lesson`, and
`tutor <course> <number> done`; `tutor <course> lesson` selects the next unfinished lesson. A
plan-only route, such as `tutor sqlite-essentials route`, can show planned rows without creating
progress. A lesson must be implemented before it can be served or completed, and only explicit
`done` records completion. Installed courses share `curriculum-tools/tutor.sqlite`, with course
identities keeping lesson history separate.

The shared renderer and lesson contract are maintained in the
[authoring guide](../curriculum-tools/docs/AUTHORING.md). The implementation sequence, review,
validation, handoff and cleanup rules are maintained in the
[batch workflow](../docs/lesson-batch-workflow.md). Keep diagrams, optional depth and timing
guidance consistent with those authorities rather than duplicating their full policy here.
