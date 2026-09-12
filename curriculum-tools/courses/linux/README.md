# Linux Systems (reference course)

This installed course contains the existing 72-lesson Linux systems route. It remains available as
reference material while the proposed
[Linux Systems v2 route](../../../future-courses/linux-v2/course.md) is discussed; the proposal has
no authored lessons and does not migrate completion.

Use the shared learner flow:

```sh
cd /root/Software/skills-tools
bin/tutor linux route
bin/tutor linux 1 lesson
bin/tutor linux 1 done
```

Progress is stored by course identity in the shared `../../tutor.sqlite` database. The same CLI
also provides `tutor linux check` for the Markdown catalog and `tutor linux validate` for isolated
real-tool evidence.

The 72-lesson outline and safety contracts are in [PLAN.md](PLAN.md). The historical refactor
proposal is in [OVERPLAN.md](../../../archive/course-history/linux/OVERPLAN.md), and real validation
evidence is in [validation/](validation/). For authoring or a future batch, use the repository
[authoring guide](../../../curriculum-tools/docs/AUTHORING.md) and
[batch workflow](../../../docs/lesson-batch-workflow.md).
