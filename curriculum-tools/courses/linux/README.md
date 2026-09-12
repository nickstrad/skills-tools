# Linux Systems (Legacy reference course)

This installed course contains the existing 72-lesson Linux systems route. It remains available as
reference material while the proposed
[Linux Systems v2 route](../../../future-courses/linux-v2/course.md) is discussed; the proposal has
no authored lessons and does not migrate completion.

The public command is `linux-legacy`; `linux` remains a compatibility alias for the same stored
course and physical path. Use the shared learner flow:

```sh
cd /root/Software/skills-tools
bin/tutor linux-legacy route
bin/tutor linux-legacy 1 lesson
bin/tutor linux-legacy 1 done
bin/tutor linux-legacy 2 skip
```

Progress is stored by course identity in the shared `../../tutor.sqlite` database. The same CLI
also provides `tutor linux-legacy check` for the Markdown catalog and `tutor linux-legacy validate`
for isolated real-tool evidence. A lesson is complete in one view; `skip` is explicit and separate
from `done`, and `undone` restores next-lesson eligibility.

The 72-lesson outline and safety contracts are in [PLAN.md](PLAN.md). The historical refactor
proposal is in [OVERPLAN.md](../../../archive/course-history/linux/OVERPLAN.md), and real validation
evidence is in [validation/](validation/). For authoring or a future batch, use the repository
[authoring guide](../../../curriculum-tools/docs/AUTHORING.md) and
[batch workflow](../../../docs/lesson-batch-workflow.md).
