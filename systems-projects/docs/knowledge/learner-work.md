# Meaningful learner work in every systemscoach lesson

## Preference and scope

On 2026-09-09 Nick rejected lessons that were fully completed for him: merely running prepared code
was not the learning experience he wanted. He explicitly asked to make meaningful learner work a
norm for systemscoach courses as a whole. This supersedes the earlier Cursor Git interpretation that
only lessons 6 and 7 needed learner ownership while 4, 5 and 8 could be fully supplied experiments.
This is a user preference and authoring requirement, not a claim derived from a company article.

## Authoring and coaching contract

Every lesson reserves a useful task that makes the target mechanism or investigation depend on the
learner's work. Suitable tasks include constructing a guarded Git command, adapting a conditional
HTTP request, changing a consequential setting, implementing a small replay decision, or selecting
diagnostic commands to distinguish plausible causes of a failure. A diagnostic task must have a
concrete uncertainty to resolve; simply running a provided inspection script is insufficient.

Supply setup, fixtures, transport, process control and cleanup. Teach unfamiliar concepts and syntax;
a related worked example can precede the learner's task. Define its boundary and observable success
criteria. Keep the exact solution separate from the default lesson path, with graduated hints and
an accessible worked answer in review or a reference. Give full answers when requested. No forced
quizzes, submissions, progress gates, blank-page boilerplate assignments or mandatory Go everywhere.
During coaching, do not silently complete the learner's reserved work.

Predictions, reflection and observation still help, but alone do not meet this requirement. Neither
does running a finished client, copying its complete solution, renaming a variable or making an
irrelevant edit. Code exercises must control the real experiment; native command tasks must leave
a relevant choice, construction or adaptation to the learner.

Plan the attempt, a small debugging allowance, explanation and cleanup within 15–25 minutes total.
Shorten demonstrations and redundant cases first. Add an intermediate lesson only when the useful
task still cannot fit or needs its own conceptual step. Each added lesson must earn its place with
a separate learner action and evidence. There is no fixed coding ratio. Nick subsequently clarified that he prefers a couple of short
sessions over lessons running long, and explicitly requested splitting original Cursor Git lessons
5 and 8. Honor that ten-lesson target without waiting for an overrun; in future planning, favor a
clean short stopping point over squeezing multiple useful tasks into one session.

## Applying and checking the norm

The installed [skill](../../skills/systemscoach/SKILL.md), local AGENTS guidance,
[design workflow](../design-workflow.md), [authoring contract](../authoring.md) and templates carry
this rule. At design time, name each lesson's task, supplied boundary, evidence and attempt budget.
Before publication, validate the starter and worked completion with external evidence and an
appropriate wrong choice/failure. Manually review whether the task teaches the intended mechanism;
`systemscoach check` validates structure and cannot establish this pedagogical property.

Apply this to new courses and existing-course revisions. Preserve learner work and progress; follow
the normal revision and real-validation rules when changing an available lesson. Existing validation
records remain historical evidence, not proof of a redesigned task's acceptance.

The [Cursor Git revision plan](../../projects/cursor-git/docs/learner-work-plan.md) applies this to the
ten-lesson target route (splitting original lessons 5 and 8). The temporary project handoff tracks pending implementation while the batch is open.
At this policy checkpoint, existing lesson pages have not yet been retrofitted; lessons 1–3 remain
available in their earlier form and 4–8 remain unpublished drafts.

## Policy checkpoint validation, 2026-09-09

This task changes guidance and templates, not executable lessons or the CLI. Skill validation,
local link checks and `systemscoach check cursor-git` passed, as did `git diff --check`. The installed
skill resolves to the edited repository file, so no reinstall is needed. These checks validate the
policy artifacts and structure, not completion of the lesson retrofit. No backend lab or additional
dependency was allocated; no Cursor lab root or SeaweedFS process remained. About 16 GB disk and
6.8 GiB RAM were available. The learner cluster answered `lab|/labs/pglab/primary|f|1` on port5440;
all seven files in the saved batch-2 progress baseline matched SHA256 and systems state remained
absent. No learner state or data was changed.
