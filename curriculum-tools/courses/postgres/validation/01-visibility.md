# Visibility and reclamation validation

Validated on 2026-09-04 with PostgreSQL 16.15 in the private `pivot_visibility` database over the
assigned Unix socket. The learner cluster on port 5440 was not used. The private copy built 94
lessons after its temporary, integration-only replacement of the retired index prerequisite.

## Changed lessons

- `xmin-horizon-blocks-cleanup` ran individually. Its baseline retained ten logical rows and vacuum
  removed ten dead tuples, leaving `baseline_dead = 0` and 66.33% free space. In the pinned case,
  `mvcc-horizon-reader` reported `backend_xmin = 959`; VACUUM reported the same removable cutoff,
  retained 1,000 dead tuples, and `pgstattuple` reported `pinned_dead = 1000`. After B committed,
  VACUUM removed 1,000 tuples, `released_dead = 0`, ten rows remained, and the 68 allocated pages
  had 98.63% reusable free space.
- `vacuum-reclaims-in-place` ran individually. The 1,379-page table retained its page count after
  VACUUM; verbose output removed 20,010 tuples, `pgstattuple` reported zero dead tuples and 74.83%
  free space, and 10,000 additional rows fit without growing the file. In a later sequence run,
  `n_dead_tup` still displayed 60,000 after cleanup, confirming that this estimate must not be the
  completion proof.
- `autovacuum-triggers` ran individually. The table-local threshold was 50 with scale factor zero.
  Three independently committed 1,000-row batches first appeared as `n_dead_tup = 3000`; in the
  bounded poll, `autovacuum_count` advanced from 0 to 1 and `n_dead_tup` fell to zero. In the module
  sequence it advanced from 1 to 2 after the same backlog. The initial immediate statistics read was
  zero in both runs, which is expected collector lag and is documented in the lesson.

## Module sequence and variations

`tools/validate.ts postgres --from 18 --to 21` completed the consolidated vacuum sequence. The
preserved rewrite lesson observed a granted `AccessShareLock` and an ungranted
`AccessExclusiveLock`, then changed the relation file from `base/16514/16907` to `base/16514/16911`
while shrinking from 1,379 to 345 pages. The preserved visibility-map lesson observed `all_visible`
345, then 145 after scattered updates with 2,854 heap fetches, then 345 and zero heap fetches after
VACUUM.

The reclamation variation is the second no-write verbose VACUUM and uses the core's self-contained
setup. The horizon variation changes B to `begin;` without a read; it uses the same generated,
independently committed churn and is bounded to the core table. The autovacuum variation sets only
`vac_t`'s cost delay, reruns the same three batches, and resets the setting. These commands are
runnable in the isolated lab; a live progress row remains intentionally optional because short
workers can finish between samples.

## Integration note

Retired slugs are `dead-tuples-accumulate` and `long-transaction-bloats-everyone`. The retained
checkpoint now belongs to `autovacuum-triggers`. `index-bloat-from-churn` in the unowned
`12-indexes.ts` still referenced `dead-tuples-accumulate` in the shared worktree; the primary was
notified to replace it with `vacuum-reclaims-in-place`. The private validation copy made that one
temporary prerequisite replacement so the course could build.
