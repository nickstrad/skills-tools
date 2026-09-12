# <Course name>

Status: proposed | agreed | partly implemented. Updated: YYYY-MM-DD.
Course ID: `<id>`. Implementation: none, or a link to the existing course.
Outline revision: <revision>. Final-outline sign-off: pending.

Create this working draft immediately and update it throughout research and discussion. Save
assumptions, suggestions, decisions, and unresolved questions here, not only in conversation memory.

## Goal and scope

What systems mechanism should the learner understand and what decision should they be able to
make? State prior knowledge, what this adds after earlier courses, and what stays out of scope.

## Size and pacing

N lessons, aiming at ten minutes each, with a fifteen-minute core ceiling. Give the total time and
explain why this count fits the mechanisms; do not fill a quota. Count reading, setup, experiment,
interpretation and cleanup. Declare separate one-time prerequisites if known. Timings and proposed
experiments remain estimates until implemented and tried.

## Research and breakdown rationale

Summarize the relevant research and link primary sources or reusable notes. Explain why these
topics belong in the core, how they are grouped and ordered, and why a mechanism gets its own
lesson rather than being combined or deferred. Connect the boundaries to prerequisites, observable
evidence, prior-course overlap, and the learner's time budget. A title list alone is insufficient.

## Route

One bounded causal question per row. Choose stable slugs now; exact commands and validation belong
to implementation batches. Add only enough detail to make the scope concrete.

| # | Lesson / stable slug | Cause and observe | Systems insight |
| --- | --- | --- | --- |
| 1 | <Title> / `<slug>` | <One small experiment and the evidence to inspect> | <Why this earns a lesson> |

## Visual teaching plan

Name the terminal diagrams that will anchor the pre-experiment explanation (for example a process
map, state transition, page layout, or competing-transaction timeline). Lean toward including them.
Place each before setup/commands, connect its labels to observed output, and keep it readable
without color. Author diagrams as ordinary Markdown/code blocks in the shared lesson content;
no course-specific rendering code. A few recurring diagrams can develop across a module.

## Delivery and implementation boundary

Shared interface: `tutor <id> <n> lesson|done`. One complete lesson includes explanation, diagram,
commands, expected evidence, interpretation and cleanup. No separate review step or required
external reading. Planned lessons are not available through the CLI until authored.
`tutor <id> route` reads this plan and shows completion/availability without creating progress.
Implemented courses use the shared `curriculum-tools/tutor.sqlite` database with course-scoped
lesson identities and history. Course tooling is Go 1.26 or newer; lesson experiments use the
native command named by the course.

Describe the first small implementation batch only when needed. Preserve existing reference
courses and progress. Link to reusable fixtures or notes; do not build them during planning.

## Sources and open questions

Link a few primary sources and existing local research that justify the scope. Distinguish
documented behavior, proposed experiments, and validated outcomes. Keep unresolved questions brief.

## Learner feedback and final sign-off

Explicitly ask Nick for suggestions after presenting the proposal: what should be added, removed,
deepened, shortened, or reordered? Record requested changes and revise this outline as discussion
continues, before asking for final sign-off.

- Feedback and decisions: awaiting learner suggestions; retain unresolved choices here.
- Final-outline approval: pending; record date, approved outline revision, and explicit user direction.
- Implementation request: none; approval alone does not request a batch.

Keep status proposed until the final outline is explicitly approved. Creating and revising this
document needs no sign-off; scaffolding and implementation require approval and a batch request.
Seek renewed approval for material outline changes; do not repeat sign-off for unchanged batches.
