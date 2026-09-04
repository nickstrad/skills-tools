# Change 02: resource evidence

Own only `curriculum/05-filesystem-objects.ts` through `08-cpu-and-scheduling.ts` and
`validation/02-resource-evidence.md`. Read OVERPLAN, PLAN, AUTHORING, shell gotchas.

Replace every one-line syntax summary with the three authoring headings and full explanations of
commands, flags, output and Python helpers. Add lesson-specific **Predict**, **Inspect and
explain**, **Vary**, **Hint**, **Apply** challenge sections; supply one runnable bounded
substitution per variation and execute it. Make the decisions about a service's file publication,
hidden space, memory residency and CPU placement concrete. Increment explicit revisions from the
baseline; preserve slugs, order, safety boundaries and course revision.

Keep distinct inode/accounting/bounded-filesystem experiments, explaining their new evidence. Atomic
rename proves visibility, not crash durability. Nice is relative to inherited priority. Global
counters and read timings cannot attribute process causes. Lesson 40 currently writes its own file,
which already populates cache: improve its direct evidence using a bounded per-file residency
observation (e.g. mincore via Python ctypes), retaining timings only as noisy context. Never drop
host caches or claim advisory eviction guaranteed a cold device read. Consult primary documentation
for uncertain mechanisms and cite supporting links in the report.

Do not change privileged reclaim/OOM mechanisms gratuitously; audit their actual high/max counters
and skips. Run privileged experiments serially within your batch. Use a private copy and LINUX_LAB,
build and run all owned lessons and new variations, and report each evidence line against expected
results. Record skips honestly and report any runtime defect to the primary. Copy only owned
modules/report back; do not modify shared artifacts, PLAN or commit. Primary owns final wording and
review.
