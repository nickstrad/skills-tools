# SQLite Systems (Legacy reference course)

This installed course contains the existing 54-lesson SQLite internals route. It remains available
as reference material while the proposed
[SQLite Essentials route](../../../future-courses/sqlite/course.md) is discussed; the proposal has
no authored lessons and does not migrate completion.

The public command is `sqlite-legacy`; `sqlite` remains a compatibility alias for the same stored
course and physical path. Use the shared learner flow:

```sh
cd /root/Software/skills-tools
bin/tutor sqlite-legacy route
bin/tutor sqlite-legacy 1 lesson
bin/tutor sqlite-legacy 1 done
bin/tutor sqlite-legacy 2 skip
```

Progress is stored by course identity in the shared `../../tutor.sqlite` database. The same CLI
also provides `tutor sqlite-legacy check` for the Markdown catalog and `tutor sqlite-legacy validate`
for isolated real-tool evidence. A lesson is complete in one view; `skip` is explicit and separate
from `done`, and `undone` restores next-lesson eligibility.

The 54-lesson outline and safety contracts are in [PLAN.md](PLAN.md). Historical implementation
analysis is in [REWORK-PLAN.md](../../../archive/course-history/sqlite/REWORK-PLAN.md), and real
validation evidence is in [VALIDATION.md](VALIDATION.md). Optional source notes never add a learner
stage. For authoring or a future batch, use the repository
[authoring guide](../../../curriculum-tools/docs/AUTHORING.md) and
[batch workflow](../../../docs/lesson-batch-workflow.md).
