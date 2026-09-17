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
criteria. The single `lesson` output also contains the causal interpretation. Give full answers when
requested. No forced quizzes, prediction/reveal prompts, submissions, progress gates, blank-page
boilerplate assignments, or mandatory Go everywhere. For this user-requested legacy-course
access/presentation migration, an existing supplied experiment may remain direct when that is the
clearest way to expose its mechanism; this scoped exception does not change the meaningful-work
norm for new lessons or introduce a replacement framework or attempt-first checkpoint.

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

### Simple lab lifecycle

On 2026-09-14 Nick explicitly generalized the DuckDB setup simplification to every course:
prepare with a simple setup script, do the work being taught, and clean up easily. Apply this
to new lessons and revisions of existing lessons. This is shared authoring guidance, not a
claim that every legacy lesson has already been converted.

Nick refined this later on 2026-09-14: offer **Setup - script** and **Setup - manual** across
courses. Manual setup teaches the software's commands, connections, inspection and settings;
script setup bypasses that practice once familiar. The learner chooses one, then uses the same
Run and cleanup. Both may use helpers for lab folders, fixtures, environment variables and
teardown: manual is not a shell-scaffolding exercise. Apply to new and revised lessons; this
does not claim every existing course has been retrofitted.

On 2026-09-17, Nick clarified that CLI learning should retain the full native command in the
manual setup and Run sections: executable name, flags, database or connection arguments, SQL,
and relevant settings. Do not hide those pieces behind a course function or runner, even when
they repeat. Helpers still own recurring fixture, folder, environment-variable, and cleanup
work. Show adjacent native tools such as `psql` in a SQLite course or `sqlite3` in a DuckDB
course when their commands make an integration boundary easier to learn.

Supply equivalent starting state and evidence for both choices. Explain temporary connections
and preparation that must repeat in Run. Keep the experiment and learner decisions visible
even with script setup. Validate both paths, including intentional errors, reruns and cleanup.
AUTHORING.md supports the two named subsections inside Setup. Generic validation selects the
script path; course validation must also exercise manual setup. If a lesson needs no tool-specific
preparation, say so rather than inventing work.

- Supply one setup command and one cleanup command wherever practical. Hide repeated exports,
  shell functions, fixture provisioning, editable starter-file creation, connection plumbing,
  fingerprints and process teardown in reusable course helpers. Use a sourced Bash helper when
  variables/functions must remain in the learner's shell; explain that once. Keep one-time
  installation separate from recurring lab preparation.
- Print the work-file path and next commands. A learner should immediately know what to edit,
  run, and inspect. Keep the target SQL, commands, configuration choices and evidence visible
  in the lesson; helpers must not complete the learner's task. Setup observations may be printed
  automatically if the lesson explains their commands, meaning and expected evidence.
- Refuse to overwrite an active attempt. Handle partial setup failures, stop only owned
  processes, and make explicit cleanup repeatable. Shell-exit cleanup is a fallback; preserve
  existing traps/options and explain when explicit cleanup is required.
- Validate the displayed workflow against the real tools, including starter, worked answer,
  meaningful wrong choice, rerun behavior and cleanup. Shared lesson content comes from the
  stored catalog: changing Markdown alone does not update `tutor COURSE N lesson`. During an
  authorized rollout, verify refresh on a copy, run `tutor COURSE init`, and compare recorded
  progress and displayed content. Author-only checks continue to use temporary databases.

On 2026-09-14 Nick clarified the boundary for DuckDB: he is new to the tool and wants to
practice the CLI call that runs the SQL he edits. Hide recurring environment setup, but retain
the database argument, SQL input and relevant CLI flags as visible learner commands. Explain
what is supplied, what to edit, what each invocation executes and what survives its exit.
An execution helper such as `duck_run` removes useful practice even when it leaves SQL visible.
This is the learner's explicit calibration, not an inference from his broader systems experience.

DuckDB lessons 1–5 offer both choices: `source .../lab/session.sh N` performs script setup;
adding `manual` prepares infrastructure and leaves the native setup commands to the learner.
Both supply a populated editable `query.sql`, explicit
`duckdb` CLI invocations and `duck_cleanup`. Lessons 1–4 feed session.sql then query.sql to one
process; lesson 2 names its persistent local database and lesson 5 reads query.sql directly.
The one-time course installer provides the pinned real `duckdb` executable, and lessons use it
by its normal name. The
[course README](../../curriculum-tools/courses/duckdb/README.md) documents the commands.

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
