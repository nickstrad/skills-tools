# SQLite Systems (reference course)

This installed course contains the existing 54-lesson SQLite internals route. It remains available
as reference material while the proposed
[SQLite Essentials route](../../../future-courses/sqlite/course.md) is discussed; the proposal has
no authored lessons and does not migrate completion.

Use the shared learner flow:

```sh
cd /root/Software/skills-tools
bin/tutor sqlite route
bin/tutor sqlite 1 lesson
bin/tutor sqlite 1 done
```

Progress is stored by course identity in the shared `../../tutor.sqlite` database. The same CLI
also provides `tutor sqlite check` for the Markdown catalog and `tutor sqlite validate` for isolated
real-tool evidence.

The 54-lesson outline and safety contracts are in [PLAN.md](PLAN.md). Historical implementation
analysis is in [REWORK-PLAN.md](../../../archive/course-history/sqlite/REWORK-PLAN.md), and real
validation evidence is in [VALIDATION.md](VALIDATION.md). Optional source notes never add a learner
stage. For authoring or a future batch, use the repository
[authoring guide](../../../curriculum-tools/docs/AUTHORING.md) and
[batch workflow](../../../docs/lesson-batch-workflow.md).
