# Meaningful learner work in every lesson

Updated 2026-09-12 for the Go CLI.

## Preference and scope

On 2026-09-09 Nick rejected lessons that were fully completed for him: merely running prepared code
was not the learning experience he wanted. He explicitly asked to make meaningful learner work a
course-wide authoring norm. The dated decision came from the systemscoach/Cursor Git review, where
it superseded the earlier interpretation that only lessons 6 and 7 needed learner ownership while
4, 5 and 8 could be fully supplied experiments. This is a user preference and authoring
requirement, not a claim derived from a company article.

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

The installed [tutor skill](../../curriculum-tools/skills/tutor/SKILL.md), local AGENTS guidance,
[authoring contract](../../curriculum-tools/docs/AUTHORING.md) and templates carry this rule. At
design time, name each lesson's task, supplied boundary, evidence and attempt budget.
Before publication, validate the starter and worked completion with external evidence and an
appropriate wrong choice/failure. Manually review whether the task teaches the intended mechanism;
`tutor <course> check` validates structure and cannot establish this pedagogical property.

Apply this to new courses and existing-course revisions. Preserve learner work and progress; follow
the normal revision and real-validation rules when changing an available lesson. Existing validation
records remain historical evidence, not proof of a redesigned task's acceptance.

The dated [Cursor Git revision plan](../../archive/systemscoach/projects/cursor-git/docs/learner-work-plan.md)
applied this to a ten-lesson target route (splitting original lessons 5 and 8). That historical
project was the source of the policy; current courses follow the Markdown lesson contract and the
shared tutor workflow. At the 2026-09-09 checkpoint, existing lesson pages had not yet been
retrofitted: lessons 1–3 remained available in their earlier form and 4–8 remained unpublished
drafts.

## Historical policy checkpoint validation, 2026-09-09

This policy change modified guidance and templates, not executable lesson experiments. The recorded
2026-09-09 validation used the then-current systemscoach checks and local link checks; those checks
are historical evidence and were not Go tutor checks. Current structural validation is
`tutor <course> check`, with real experiments run through `tutor <course> validate`. No learner
state or data is changed by either read-only check.
