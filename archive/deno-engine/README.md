# Retired Deno engine

Archived on 2026-09-12 after the Go tutor passed lesson-output, shared-database progress,
race-test and real-tool validation gates. The active source is now Markdown under
`curriculum-tools/courses/<id>/lessons/`; Go reads it directly.

The archived tree mirrors the original repository paths: engine, tests, course TypeScript,
generated catalogs, old installer/export scripts, the one-time Go converter, and historical
PostgreSQL Essentials validation controllers. These controllers are preserved evidence, not
current tooling. Native lesson fixtures under `courses/*/lab/` remain active and unchanged.

The following commit removes this archived source tree from the checkout while preserving it
in Git history. Historical validation records retain their original commands and source hashes;
use this archive to inspect those exact sources rather than recreating their old environments.
