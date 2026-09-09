# Systems work knowledge store

Read this index before designing, authoring, validating or changing systemscoach courses. It stores
reusable findings across projects so later work starts from measured evidence rather than repeating
discovery. The repository-wide [knowledge index](../../../docs/knowledge/README.md) remains the home
for shared tutor, shell and VM guidance; link it instead of copying it here.

## Start here

| Note | When to use it |
| --- | --- |
| [Object-store and Git labs](object-store-git-labs.md) | Selecting SeaweedFS launch mode, checking conditional publication, validating Git fixtures and cleaning a local lab. |
| [Systemscoach engine and installation](../../../docs/knowledge/systemscoach.md) | CLI/progress behavior, discovery, shell availability and installation. |
| [VM resources and cleanup](../../../docs/knowledge/vm-resource-cleanup.md) | Before allocations and at task completion; preserve learner labs and progress. |
| [Shell experiment pitfalls](../../../docs/knowledge/shell-lesson-gotchas.md) | Writing supplied shell commands, handling expected errors and coordinating processes. |

## Update after completed work

For every completed systems task or lesson batch, update the relevant note and this index if a new
topic is needed. If no new reusable finding emerged, say so briefly in the task's validation record.
Record what happened, why it matters and how future authors should apply it. Include:

- Date, exact tool/version/configuration, and a link to concise measured evidence.
- The failure or misleading assumption, the tested correction and what remains unverified.
- Ownership/cleanup consequences, retained evidence location and expiry when applicable.

Keep source claims, proposed mechanisms and measured results distinct. Put source-specific research
in `projects/<topic>/docs/sources.md`, per-batch evidence in `projects/<topic>/validation/`, and the
cross-course lesson learned here. Link those records without duplicating logs, packs or databases.
Update superseded advice in place, preserve its provenance and explain which configuration changed.
Temporary handoffs are for unfinished work and are removed when their durable findings are saved.
