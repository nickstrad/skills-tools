# Rewind and chosen-history rejoin acceptance

Primary acceptance, 2026-09-05. Current76 rewind-the-old-primary is revision4. Each script creates a
fresh owned pair, deliberately diverges their acknowledged work, preserves the old evidence and
executes actual pg_rewind into an explicitly chosen history.

## Live evidence

Core: /tmp/pg-rewind-workload-core.log, root /tmp/pg-owned-q8jhfat8. Source variation:
/tmp/pg-rewind-workload-variation.log, root /tmp/pg-owned-pb5xn_go. Driver:
/tmp/pg-rewind-workload-validate.ts; scripts /tmp/pg-rewind-workload-{core,variation}.sh.

Common receipt0 is copied through a verified basebackup and real replay marker. Actual transport
disconnect precedes promotion. Both writable histories share a system identifier; old source uses
timeline1 and chosen promoted source timeline2. Core inventories are old IDs0,1 and chosen IDs0,100.
Variation acknowledges three old-only IDs1,2,3. Complete independent inventories, all client
acknowledgements, identities and timeline history are saved before target changes.

The old writer is set NOLOGIN, has zero existing app sessions, drops its inactive original slot and
stops cleanly. A direct endpoint insert fails connecting. Checksums were enabled at initdb,
full_page_writes is on and wal_keep_size32MB retains target WAL through the small divergence. The
cold archive is reopened and all982 regular-file hashes match the stopped target. Core archive
is4,377,531 bytes; variation4,377,582 bytes. This is preserved physical evidence, not a separately
tested full restore.

Dry run and actual rewind both report divergence0/A00090 on timeline1 and common checkpoint0/900060.
Each reports6MB to copy from25MB source data and6,872kB progress. Dry run even prints Done; a full
target regular-file rehash proves unchanged contents. The actual -R run creates standby.signal.
Copied auto.conf is retained, then explicit private target socket, dedicated replication user,
owned_rejoined slot and pinned recovery timeline2 replace obsolete/copied endpoint settings.

After startup the original target directory has the matching system identifier and recovery=true.
Its receiver streams timeline2 from the chosen source; the corresponding sender uses owned_repl. The
new slot is active/reserved. A real marker gates exact IDs0,100 on both nodes. An app INSERT through
the old endpoint fails25006/read-only. Source receipt200 then acknowledges and streams; the later
marker gates exact final IDs0,100,200 and correct notes on both nodes. Discarded IDs1 (variation1–3)
remain explicitly listed alongside their saved inventory and physical archive.

## Integration and limits

Exact copied-catalog hint2: /tmp/pg-rewind-workload-rendered-rewind-the-old-primary.md. Output:
/tmp/pg-rewind-workload-exact-rewind-the-old-primary.log; root /tmp/pg-owned-9ecu9kjz. It reproduces
the three-old-acknowledgement variation,982 verified files,4,377,939-byte archive and all rejoin,
read-only and later-receipt assertions. All three roots have no server PID files and no remaining
source replication slots; logs and cold archives remain for inspection.

Thirty tests pass; full formatting/lint/typecheck passes. Logs:
/tmp/pg-rewind-workload-{tests,check}.log. Isolated builder /tmp/pg-rewind-workload-scoped-build.py
proves only current76 changes among93 generated lessons. First seven and capacity are preserved,
with seven reading stops. Fresh copied catalog /tmp/pg-observe-progress-wh7av505/progress.sqlite
preserves IDs, progress and attempts; learner hash
remains395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Checkpoint timeline can remain1 while the receiver actively streams2; the receiver and explicit
history/configuration establish which branch is being followed. The copied source catalog can
restore app_writer LOGIN, so recovery's actual read-only rejection matters. Rewind does not elect
authority or reconcile omitted business obligations. No speed ratio, missing-WAL archive recovery or
independently restored cold backup is claimed. Local exclusion assumes the driver owns every writer
and no supervisor restarts the stopped node.

Next: current77 controlled failback, with cascading as optional executed depth and cleanup required.
Logical processing, chunks6–7 and the final audit remain unfinished.
