# Batch 16–21 handoff

Scope: lesson 15 was already authored; implement 16–21 from designs/16-21.md. Primary owns
integration, review, acceptance, progress refresh and cleanup. Sol implementations for 16–17 and
20–21 are handed back; the index agent still owns curriculum/15-index-choice.ts.

Accepted primary standalone core and displayed variations: 16, 17, 20, 21, with per-lesson
source/outcome/cleanup JSON. All private roots from these runs were stopped and removed; both
progress databases and logical history stayed unchanged. Lesson 16 scanned 100/removed9900; 17
repaired estimate1798 to9000 and reverse variation16036 to1000;20 heap fetches0/200/0; 21 external
merge versus quicksort, same20k rows, plus top-N variation at64kB.

Open: lesson18 at80% selectivity still chooses a correlated Index Scan. Index agent is adjusting the
broad range;19 core already shows384 versus4 buffers with backward indexes and Index Cond in both.
Primary must validate18–19 standalone and all21 together after final source integration.

Build succeeds with21 lessons; all37 tests pass. Full check needs formatting of two new author
report files. First15 complete lesson objects equal the pre-batch catalog. Live catalog not yet
refreshed. Existing unrelated dirty work remains intact. Keep only compact evidence, finish
render/refresh checks and resource readiness, then delete this temporary handoff in final commit.
