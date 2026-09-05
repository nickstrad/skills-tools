# Disk-growth incident acceptance

Primary validation, 2026-09-05. Current88 is revision4, preserving the stable slug
`abandoned-slot-fills-the-disk`. Current89–92 and the final course audit remain required.

## Executed behavior

Preparation, all seven inspection views, a rejected irrelevant action and the correct remedy were
executed for each of the three actual causes using the current core. Separate trials ran the source
discard/reseed variation, the exact CLI-rendered hint2, and production recovery with no inspection
restarts. Preparation alone is not completion: each accepted trial finished explicit recovery, full
application comparison, later delivery and resource reclamation.

| Trial                              | Original evidence root   | Final rows / balance | Allocated WAL before / after remedy |
| ---------------------------------- | ------------------------ | -------------------- | ----------------------------------- |
| Retained consumer, resume          | `/tmp/pg-owned-nfid6jn4` | 12,301 / 226,990,353 | 23 / 3 MB                           |
| Failed archive, repair             | `/tmp/pg-owned-33jeznps` | 12,301 / 226,990,353 | 22 / 6 MB                           |
| Production, reduce demand          | `/tmp/pg-owned-da_n8992` | 12,601 / 238,196,703 | 22 / 4 MB                           |
| Source discard/reseed variation    | `/tmp/pg-owned-_2khxjw0` | 12,301 / 226,990,353 | 16 / 2 MB                           |
| Production without inspections     | `/tmp/pg-owned-674y93a5` | 12,601 / 238,196,703 | 9 / 4 MB                            |
| Exact rendered discard/reseed hint | `/tmp/pg-owned-_oinj72b` | 12,301 / 226,990,353 | 16 / 2 MB                           |

All final slots were reserved; all archive backlogs were empty. Resume decoded the missing 12,000
operations. Archive repair verified every one of the 12 saved pending file SHA256s. Reduced demand
measured 300 operations instead of 3,000 with smaller actual inserted WAL and lower observed rate.
Both discard trials actually decoded an empty new tail while the receiver still lacked 12,000
operations, then reconstructed its projection from all 12,300 immutable source rows. Every trial
decoded one later operation and verified empty-retry stability.

## Independent audit and source correspondence

`/tmp/pg-disk-incident-audit.py` recomputed every contiguous identity, amount (`3*id`) and full
768-character payload (24 ordered MD5 values) in source-before/source-final inventories. It opened
each independent SQLite receiver read-only and compared every receipt and its derived balance with
that independently checked source. It checked initial receiver contents, recovery branch
obligations, later delivery, saved archive hashes, workload LSN arithmetic/elapsed-rate arithmetic,
old filename reclamation, final slot status and allocation reduction. Results are
`/tmp/pg-disk-incident-audit.json` and `.log`.

The audit found no server ERROR/FATAL/PANIC lines in any of the six trials. The archive case
contained 64 expected archive-command failure messages across its repeated inspection/recovery
lifecycle; the other cases had none. The three deliberately rejected remedies each printed one
expected Python traceback containing "No remedy applied."; successful stage logs contained no
unexpected traceback. Every cluster was independently checked stopped with pg_ctl status3 and no
postmaster.pid before evidence preservation.

`/tmp/pg-disk-incident-render-audit.ts` compared the current built core to its executed core and
compared the current source variation, executed variation and exact rendered hint fence, allowing
only final-newline trimming. It passed. Start offers neutral symptoms and no controller source or
worked recovery result; inspect supplies all evidence/remedy commands; reveal/full preserve the
optional citation, and full includes the source. Citation is intentionally not repeated in start or
inspect. The first audit incorrectly required it there; correcting that audit assumption required no
lesson change.

The exact driver `/tmp/pg-disk-incident-refined-exact.ts` exited0. Its driver log, rendered Markdown
and execution log are `/tmp/pg-disk-incident-refined-exact-driver.log`,
`/tmp/pg-disk-incident-refined-rendered-abandoned-slot-fills-the-disk.md` and
`/tmp/pg-disk-incident-refined-exact-abandoned-slot-fills-the-disk.log`. Earlier superseded
prototypes and old exact-hint logs are not used as acceptance evidence.

## Integration and limits

The scoped builder changed only current88 among 92 built objects; original first-seven objects,
capacity semantics and all seven reading stops are unchanged. Copied-progress refresh preserved all
existing IDs, attempts, progress and first-seven current completions. Latest copy at this check was
`/tmp/pg-observe-progress-ps3cmlto/progress.sqlite`; log `/tmp/pg-disk-incident-progress.log`. Real
learner SHA256 remained `395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`. Thirty
engine/coaching tests passed in `/tmp/pg-disk-incident-tests.log`. Full format/lint/typecheck passed
after correcting handoff Markdown formatting; log `/tmp/pg-disk-incident-check.log`.

Workload intervals measure actual inserted WAL, not allocated directory bytes. Restart-generated WAL
is visible in fresh samples and distinct from the saved incident window. The bounded receiver owns
all application writers; peek/get use the same captured flush bound with an independent
receipt/balance commit in between. This is not a general CDC client. Snapshot reconstruction is
valid for this complete immutable ledger, not deleted event history or arbitrary external effects.
Archive hashes prove local copy agreement, not off-host durability or a tested restore. The short
work windows establish neither production capacity nor a disk-full forecast.

## Resource cleanup

The user made VM cleanup the top priority after runtime validation. Original evidence roots in this
report were moved into hash-verified compressed archives under
`/root/pg-validation-evidence/20260905/`, with original-root mappings and complete inventories in
`/root/pg-cleanup-20260905/compacted.jsonl`. Cleanup is complete; see
[the resource record](07-resource-cleanup.md). Do not assume an old `/tmp` path still exists. Read
required JSON/SQLite members from the archive for the remaining audit; retain no second full image
unnecessarily. Remove these bulky retained images after the final acceptance audit, before marking
the overall goal complete.
