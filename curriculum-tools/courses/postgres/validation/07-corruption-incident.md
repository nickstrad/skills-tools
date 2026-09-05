# Corruption diagnosis and restored operation boundary

Primary acceptance, 2026-09-05. Current89 retains `corrupt-a-page-and-detect-it` at revision4. It
replaces in-place destructive salvage with staged diagnosis and a separate verified restore.
Current90–92 and the final course integration/audit remain unfinished.

## Actual runtime outcomes

| Trial                                     | Original root            | Restored boundary | Accepted loss                     | After new operation511  |
| ----------------------------------------- | ------------------------ | ----------------- | --------------------------------- | ----------------------- |
| Current source core, all inspection views | `/tmp/pg-owned-qd84u6li` | 500 complete rows | IDs501–510, full records retained | 501 rows, amount880,327 |
| Current source variation                  | `/tmp/pg-owned-704ucg1b` | 510 complete rows | None                              | 511 rows, amount915,712 |
| Exact CLI-rendered hint2                  | `/tmp/pg-owned-aj_4dn12` | 510 complete rows | None                              | 511 rows, amount915,712 |

All510 source operations committed before the incident. The core's complete cold backup was taken
after500; the variation moved only that boundary after the ten later commits. No later archived WAL
was supplied. Missing core operations were reported, not replayed from the diagnostic inventory. The
later write used511, avoiding reuse of a previously accepted identity absent from the restore.

Preparation preserved the24-byte header and changed exactly one known payload byte in block3 of the
stopped fixture's heap file. An actual heap-reading aggregate failed with SQLSTATEXX001, page
verification failure and an invalid-page error naming block3. Offline pg_checksums found one bad
checksum. Clean source, backup and both restored scans found zero. The original page and complete
file hashes remain in evidence. No pg_surgery or zero_damaged_pages was used.

Each backup had983 regular files. Full source/backup hashes agreed at copying and remained unchanged
during recovery. A separately copied whole cluster actually started, returned every expected domain
row, committed the later operation and passed a final stopped checksum scan. The damaged source file
remained unchanged. File preservation and database restore are separate verified steps; neither
startup nor a row count substituted for complete application agreement.

## Independent audit and correspondence

`/tmp/pg-corruption-audit.py` recomputed all accepted/backup/restored/lost/final identities, amounts
and512-character payloads. It checked all983 backup hashes against restored-copy evidence,
reconstructed the original full relation using the saved page and matched its pre-damage SHA256.
Page images differed by exactly one byte with identical headers. Results:
`/tmp/pg-corruption-audit.json` and `.log`.

Every source log has one expected invalid-page ERROR and no other ERROR/FATAL/PANIC; restored logs
have none. A deliberately rejected salvage action raised one expected assertion before mutation. All
data/backup/restored directories independently returned pg_ctl status3 with no PID. Core exercised
all six inspection selectors. Preparation alone was not counted as recovery.

`/tmp/pg-corruption-render-audit.ts` passed built/core/variation/exact-fence correspondence and
start/inspect/reveal/full checks. Initial coaching withholds construction and missing identities;
inspect supplies runnable evidence/restore/cleanup commands; reveal/full preserve the Chapter11
Fault Tolerance citation; full includes the controller. Scripts/logs:
`/tmp/pg-corruption-{core,variation}.sh` and `.log`; driver `/tmp/pg-corruption-validate.ts`. Exact
driver/render/log: `/tmp/pg-corruption-exact.ts`,
`/tmp/pg-corruption-rendered-corrupt-a-page-and-detect-it.md`,
`/tmp/pg-corruption-exact-corrupt-a-page-and-detect-it.log`.

## Integration and cleanup

Scoped `/tmp/pg-corruption-build.py` changed only89 among92 objects and automatically removed its
snapshot. First-seven objects and seven reading stops are unchanged; course revision remains2.
Copied progress preserves IDs/history/progress and first-seven completions. Latest copy:
`/tmp/pg-observe-progress-jbx6d_t4/progress.sqlite`; log `/tmp/pg-corruption-progress.log`. Real
learner SHA256 remains `395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`. Thirty
tests pass (`/tmp/pg-corruption-tests.log`); full format/lint/typecheck evidence is
`/tmp/pg-corruption-check.log`.

`/tmp/pg-corruption-preserve.py` compressed the three accepted roots, reopened every archive to
compare complete inventories, rechecked original hashes/stopped state, and executed the lesson's
actual cleanup action. It exited0; no raw fixture remains. Archives/manifests under
`/root/pg-validation-evidence/20260905/` total about49MB, with the additional root/hash map at
`/tmp/pg-corruption-compacted.jsonl`. Retain only through the final course audit, then remove with
the earlier evidence. Prototype b77raydq was superseded by metric labels and an explicit8KB
block-size guard; it is not acceptance evidence. Its small forensic archive remains and its raw data
was also removed with the supplied cleanup. Free disk remains about16GB; learner lab/progress were
untouched.

## Limits

The failure identifies an unreadable page, not a real hardware cause. Checksums cannot reconstruct
missing accepted work. A cold backup covers the complete stopped state; this does not demonstrate
online/PITR recovery or independent-host durability. Copy time and startup/full-inventory time are
separate and exclude diagnosis; neither is production RTO. The core actually shows a readable, clean
restored database missing acknowledged operations, which the learner must report explicitly.
