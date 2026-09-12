# Future courses

Define a course here before implementing it. A plan lets Nick choose and refine upcoming learning
without paying for a complete curriculum, lab, or validation suite up front.

| Course | Plan | Status | Size |
| --- | --- | --- | --- |
| SQLite Essentials | [sqlite/course.md](sqlite/course.md) | Proposed; no essentials lessons implemented | 32 lessons; target ~10 min, core ceiling 15 min |
| Linux Systems v2 | [linux-v2/course.md](linux-v2/course.md) | Proposed; no v2 lessons implemented | 44 lessons; target ~10 min, core ceiling 15 min |

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
Keep later planned lessons out of generated catalogs until they exist. Existing courses with
canonical PLAN.md files can retain them; link rather than migrate for its own sake.

## Shared learner experience

The generic engine supplies `tutor <course> <n> lesson` and `tutor <course> <n> done`.
Here `tutor <course>` is the course CLI; an existing name such as `pgcoach` may wrap it. The
unnumbered `tutor <course> lesson` selects the next unfinished lesson. All content, expected results,
interpretation, and cleanup fit in one lesson. Completion is explicit. No review stage, required
written answers, or external-reading checkpoint is part of the normal flow.

`tutor <course> route` lists the full route with `[done]`, available, and planned status. It reads
completion by stable identity and current revision without creating or changing progress. This also
works for plan-only courses: `tutor sqlite-essentials route` reads the Markdown plan now. Each plan
must declare its Course ID and use the numbered title/slug table in the template. Keep one
plan per course ID. A lesson must be implemented before it can be served or completed.

Terminal diagrams are a first-class part of the explanation **before setup and commands**. Lean
toward including them: timelines, state transitions, process ownership, page/tree layouts, queues,
and log flows. Label the diagram and explain what to watch for in the experiment. ASCII art must
work in plain output; ANSI color can enhance it but must not carry meaning alone. Future content
uses the shared Markdown renderer, with diagrams in `syntaxBreakdown`; no bespoke course renderer
or React/Ink UI is required.

Aim for ten minutes of core work and narrow lessons that routinely exceed fifteen. Count context,
setup, experiment, interpretation, and cleanup together; declare one-time installation separately.
Preserve technical depth by choosing a clear question, not by assigning unexplained commands.
Optional depth stays optional. See [authoring guidance](../curriculum-tools/docs/AUTHORING.md) and
[the learner profile](../docs/learner-profile.md).
