# Chunk 1B: storage decisions, original lessons 8–11

Owner: Terra/high `storage`. Owned files only: curriculum/02-storage.ts, guides/02-storage.ts,
validation/01-storage.md. Build private curriculum-tools copy in /tmp/pg-pivot-storage-work; exclude
learner progress. Do not edit root generated artifacts, registry, shared engine or other source
files. Primary supplies private lab socket/port and scratch database; until then implement and
typecheck. No server restart/global settings. Read AUTHORING, skill, research notes, existing
review. Original first THREE lessons in this module (overall 5–7) must remain object-identical.

Existing changed lessons use revision 4 (some are already revision 3). Preserve slugs of HOT, TOAST
and cache. Retire `free-space-map-and-reuse`; its experiment moves to vacuum module. Move its exact
studyCheckpoint resources to cache and rewrite rationale without numeric lesson refs. Remove
misleading universal assertions. Keep every unfamiliar command explained in syntaxBreakdown.

HOT: identical initial tables and indexes, fillfactor 100 versus70, nonindexed tag updates with same
logical rows. Preserve single-transaction loop as first controlled case. Add separately committed
rounds with psql gexec sending each UPDATE separately (explain transaction boundary). Use fresh
matched tables or reset/rebuild between cases so histories aren't confounded. Measure
pg_stat_user_tables with force flush/fresh reads, HOT/total ratio and relation pages; inspect HOT
flags/chain evidence. Indexed-id update phase must show total updates advance while HOT does not. No
universal zero HOT for fillfactor100, fixed619, or claim only HOT tuples can be pruned. Title uses
reserved page space, not half empty. Explain why transaction shape changes reclamation and why lower
fillfactor isn't universally optimal. No WAL measurement until later module.

TOAST: keep compressible/incompressible values and physical pointer/chunks. Add narrow projection
versus actual payload access with EXPLAIN buffers. Compare update label only (unchanged body) with
replacing body; inspect TOAST state/size/tuple evidence to establish reuse versus replacement,
without promising an unchanged file size proves no write. Supply a clear controlled query and assert
unchanged out-of-line values are normally preserved. Avoid universal split-blob advice.

Cache: preserve hot-read, dirty-page and checkpoint observations; explain shared-buffer reads may be
OS-cache hits. Condition numeric expectations on actual settings/layout, use relationships. Replace
'unused buffers means cache too large' challenge with one controlled working-set variation and an
evidence-based limitation. No global cache dropping/restarts required.

Author Guide entries for exactly three surviving slugs with type ../guides/types.ts. brief teaches
needed definitions without giving prediction away; predict names one controlled contrast; inspect
names output fields; explain requests causal chain; vary is one bounded adaptation; apply poses a
real workload tradeoff. Two hints: conceptual then runnable code/help. Avoid arbitrary coding from
memory and generic copy-pasted prompts. Early learners receive complete experiments at run stage.

Validation: all three lessons independently and sequentially in assigned scratch DB with extensions;
read exact evidence rather than harness timeout count. Validate added variation/hint code. Record
commands, actual counters/relationships, expected errors and deviations in owned validation report.
Report retired slug/checkpoint transfer and preserved first7 check. No commits. Ask primary if an
engine/cluster requirement is discovered rather than changing shared files.
