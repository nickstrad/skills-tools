# Legacy reading archive

This directory preserves the retired `reading`, `readingNotes`, and
`studyCheckpoint` metadata by stable course and lesson identity.

`catalog/<course>.json` contains source-catalog records captured from the
declared source revision. Each `lessons` object is keyed by the lesson's stable
slug and retains only the retired fields plus its original ordinal and slug.

The SQLite migration writes database-specific copies below `databases/`. That
directory is ignored because a learner database may contain private state. A
database export retains the raw `study_checkpoint` JSON text and the two text
columns exactly as stored, together with the row's id, ordinal, course, and
slug. The migration writes those records before dropping the columns; if the
transaction rolls back, the source database remains readable and the archive
is still safe to retain or remove.

## Schema migration and recovery

Use `tutor <course> migrate` to archive and remove the old columns without seeding or refreshing
lesson content. For an isolated audit, pass both `--db /path/to/copy.sqlite` and
`--archive /path/to/temporary/archive`. Ordinary `init` also upgrades old schemas, then performs
its usual catalog refresh; use `migrate` when existing catalog rows must stay unchanged.

Source exports were pinned to commit `df6211c`. The exporter in
[`scripts/export-legacy-reading.ts`](../../scripts/export-legacy-reading.ts) resolves a full commit
identity and refuses to overwrite a differing export. It cannot silently replace preserved values
with empty records after the active fields have been removed.

For an audit or recovery on a database copy, import `readLegacyArchive` and
`restoreLegacyReading` from
[`curriculum-tools/src/legacy_reading.ts`](../../curriculum-tools/src/legacy_reading.ts), open that
copy with `DatabaseSync`, and restore the matching database export. Restoration validates archive
columns and lesson identities and rolls back on failure. It recreates only the legacy columns that
existed in that export, preserving other lesson fields and progress. Future normal initialization
will remove them again. Do not put learner database exports or full progress backups in Git.
