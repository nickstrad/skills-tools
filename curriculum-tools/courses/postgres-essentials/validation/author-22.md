# Lesson 22 author validation

## Summary

Validated the exact `JOIN_MEMORY` setup/code and the SQL fence extracted from its displayed
variation on PostgreSQL 16 in the private cluster recorded by `author-22-cleanup.json`.

- Core, 64 kB with multiplier 1: Hash Join returned 50,000 rows; Hash used 256 batches and the plan
  reported `temp read=1769 written=1769`.
- Core, 16 MB with multiplier 1: Hash Join returned 50,000 rows; Hash used one batch and the plan
  reported no temporary blocks.
- Variation, 64 kB with multiplier 8: Hash Join returned 50,000 rows; Hash used 32 batches and the
  plan reported `temp read=1548 written=1548`.
- No unexpected PostgreSQL errors occurred. The owned server stopped normally and its complete
  `/tmp/pg-essentials-validation-22-*` root was removed. Learner servers and progress were not used.

Source hashes are in `author-22-source.json`; structured measurements are in
`author-22-outcomes.json`; the complete psql transcript is `author-22.log`. The validation runner
rejects missing phases, unexpected errors, unequal join rows, a non-spilling small plan, a spilling
large plan, or a multiplier variation that does not reduce the batch count.
