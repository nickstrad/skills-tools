# Lessons 20–21 author prototype validation

Prototype behavior was checked 2026-09-10 against PostgreSQL 16 in one owned, private Unix-socket
cluster under a unique `/tmp/pg-essentials-validation-20-21-*` root. The cluster used 16 MB shared
buffers, no TCP listener, no archive and no replica. Its peak allocated size was 39 MB. It was
stopped and its entire root removed by the validation script's exit trap.

The SQL was manually transcribed from the draft core and optional blocks and run with
`ON_ERROR_STOP=1`; it is behavior evidence rather than exact-source acceptance. Primary integration
will import the built source and establish that correspondence. The compact transcript is
`author-20-21.log`; `author-20-21-source.sha256` records which draft was current after that run, but
the hash alone does not prove correspondence to manually copied SQL.

## Measured outcomes

- Lesson 20 core used `Index Only Scan` in all three phases with 100 actual rows. `Heap Fetches`
  were 0 after the baseline vacuum, 200 after the committed 100-row update, and 0 after the second
  vacuum.
- Lesson 20 variation returned 100 rows through `Bitmap Heap Scan` plus `Bitmap Index Scan`; the
  omitted payload forced heap access.
- Lesson 21 core sorted 20,000 rows both times. At 64 kB, `external merge` used 15,584 kB of disk
  and reported `temp read=7774 written=8165`. At 32 MB, `quicksort` used 16,550 kB of memory with no
  temporary-buffer line.
- Lesson 21 variation held `work_mem` at 64 kB. It used `top-N heapsort` with 65 kB reported memory,
  returned 20 rows, and consumed 20,000 rows from its sequential-scan child.

There were no SQL errors, invalid psql commands, timeouts or server failures. After validation no
matching owned root or postmaster remained, and `/tmp` had about 16 GB free. The learner cluster and
both learner/reference progress databases were not targets of this prototype.

The final prototype root was `/tmp/pg-essentials-validation-20-21-mb2B75`; an existence check after
the trap confirmed it had been removed.
