import { code } from "../../../src/types.ts";

/** Reusable operational reminder for the lab's unbounded WAL archive. */
export const ARCHIVE_PRUNING_REMINDER = code`
### Small-disk archive check

The lab's archived WAL is intentionally never deleted by PostgreSQL, so check it periodically:

    df -h "$PGLAB"
    du -sh "$PGLAB/archive"

Only prune after you have a base backup you can restore from, and only when no standby or other
recovery process still needs older WAL. A replication slot can also make **$PGLAB/primary/pg_wal**
grow, although it does not by itself make an archived copy safe to delete. In this course, the
backup created by module 08 is **$PGLAB/backup1**. Preview the files that would be removed, using
that backup's START WAL file as the cutoff:

    start_file=$(sed -n 's/^START WAL LOCATION:.*(file \([^)]*\)).*/\1/p' "$PGLAB/backup1/backup_label")
    pg_archivecleanup -n "$PGLAB/archive" "$start_file"

If **start_file** is empty, stop: the backup label was not found. If the preview names only WAL
files older than the backup (and you have checked standbys or other restore consumers), perform the
cleanup and measure the result:

    pg_archivecleanup "$PGLAB/archive" "$start_file"
    du -sh "$PGLAB/archive"

The **-n** preview is the safety check; **pg_archivecleanup** keeps the cutoff file and newer files.
Never run it against **$PGLAB/primary/pg_wal**, and do not guess a cutoff when **backup1** does not
exist. Keep a separate, tested backup if the archive is part of your real recovery plan.`;
