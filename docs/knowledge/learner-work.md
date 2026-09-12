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

Supply setup, fixtures, transport, process control and cleanup. Teach unfamiliar concepts and syntax
before the task; a related worked example can precede it. Define its boundary and observable success
criteria. Put optional hints and the exact worked answer below the task under a clear “attempt first”
label, or link a separate reference. The single `lesson` output also contains the causal
interpretation. `review` is only a compatibility alias, not a required step. Give full answers when
requested. No forced quizzes, submissions, progress gates, blank-page boilerplate assignments, or
mandatory Go everywhere. During coaching, do not silently complete the learner's reserved work.

Predictions, reflection and observation still help, but alone do not meet this requirement. Neither
does running a finished client, copying its complete solution, renaming a variable or making an
irrelevant edit. Code exercises must control the real experiment; native command tasks must leave
a relevant choice, construction or adaptation to the learner.

For new lessons, plan the explanation, attempt, small debugging allowance, evidence, interpretation,
and cleanup within 10–15 minutes total. Existing 15–25-minute metadata remains an honest record and
need not be rewritten. Shorten demonstrations and redundant cases first. Add an intermediate lesson
only when the useful task still cannot fit or needs its own conceptual step. Each added lesson must
earn its place with a separate learner action and evidence. There is no fixed coding ratio. Nick had
already requested splitting original Cursor Git lessons 5 and 8 rather than letting them run long;
the current concise policy generalizes that preference without changing existing lesson identities.

## Applying and checking the norm

The installed [skill](../../archive/systemscoach/SKILL.md), local AGENTS guidance,
[design workflow](../../archive/systemscoach/docs/design-workflow.md), [authoring contract](../../archive/systemscoach/docs/authoring.md) and templates carry
this rule. At design time, name each lesson's task, supplied boundary, evidence and attempt budget.
Before publication, validate the starter and worked completion with external evidence and an
appropriate wrong choice/failure. Manually review whether the task teaches the intended mechanism;
`systemscoach check` validates structure and cannot establish this pedagogical property.

Apply this to new courses and existing-course revisions. Preserve learner work and progress; follow
the normal revision and real-validation rules when changing an available lesson. Existing validation
records remain historical evidence, not proof of a redesigned task's acceptance.

The [Cursor Git revision plan](../../archive/systemscoach/projects/cursor-git/docs/learner-work-plan.md) applies this to the
ten-lesson target route (splitting original lessons 5 and 8). The temporary project handoff tracks pending implementation while the batch is open.
At this policy checkpoint, existing lesson pages have not yet been retrofitted; lessons 1–3 remain
available in their earlier form and 4–8 remain unpublished drafts.

## Historical policy checkpoint validation, 2026-09-09

This task changes guidance and templates, not executable lessons or the CLI. Skill validation,
local link checks and `systemscoach check cursor-git` passed, as did `git diff --check`. The installed
skill resolves to the edited repository file, so no reinstall is needed. These checks validate the
policy artifacts and structure, not completion of the lesson retrofit. No backend lab or additional
dependency was allocated; no Cursor lab root or SeaweedFS process remained. About 16 GB disk and
6.8 GiB RAM were available. The learner cluster answered `lab|/labs/pglab/primary|f|1` on port5440;
all seven files in the saved batch-2 progress baseline matched SHA256 and systems state remained
absent. No learner state or data was changed.
