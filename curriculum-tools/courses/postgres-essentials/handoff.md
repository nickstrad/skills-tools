# Current batch: PostgreSQL Essentials 22–26

Design: designs/22-26.md. Design commit f3cd51a. User explicitly requested this handoff be kept
current during the pass, and reusable environment findings be added to /root/Raw/knowledge.

## Ownership and state

- Primary: integration, lesson26 curriculum/20-crash-replay.ts and lab/crash.py, validation, docs,
  catalog refresh, commits and this file.
- Sol join: lesson22 curriculum/17-join-memory.ts and validation/author-22*. Delivered and
  validated; primary requested small syntax coverage and failure-cleanup hardening.
- Sol wal: lessons23–24 curriculum/18-wal.ts and validation/author-23-24*. In progress.
- Sol checkpoint: lesson25 curriculum/19-checkpoint.ts, lab/checkpoint.py and author-25*. In
  progress.

## Evidence so far

Lesson22 core: 50,000 join rows in both plans, 256 batches with 64kB, 1 batch/no temp with16MB;
multiplier8 variation32 batches. Author fixture removed. Primary reviewed lesson content. Lesson26
first core run: real interrupted/redo start/redo done log plus recovered inventory
[[1,110],[2,100],[3,100],[4,1]], uncommitted private700 invisible; private root removed.
Clean-shutdown comparison underway. Final source-linked acceptance still pending. Learner server
responds at /tmp:5440 and confirms /labs/pglab/primary, PostgreSQL16.15. Sandbox socket access and
chown require escalation; approved helper commands run outside sandbox. Resource preflight16GB free
/6.8GiB RAM available; combined fixtures<700MB. Preserve learner lab.

## Remaining

Review incoming modules/helpers, integrate visuals and shell cleanup wording, build26 lessons,
update availability/tests/docs/installed skill, validate exact built core/variation commands, test
shell cleanup failure paths, run required Deno checks, compare old21 lesson objects, check
copied/live catalog refresh preserving progress, final cleanup/readiness, durable findings, chunked
commits and handoff removal at completion per repository workflow.

Unrelated initial dirty files: root README.md, reference postgres designs/09-coach-pilot-batches.md,
guides/{pilot-mvcc,pilot-storage,types}.ts, tools/{coach,pilot,pilot_test}.ts,
docs/{README,learner-profile}.md, docs/knowledge/{README,postgres-coaching-pilot}.md, untracked grpc
course and docs/knowledge/grpc-course.md. Preserve these; stage only owned hunks.
