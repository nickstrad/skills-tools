# Request intervention incident acceptance

Primary acceptance, 2026-09-05. Current91 retains `runaway-query-and-cancel` at revision4. Its
replacement is an independent request-budget investigation with exact actor identities, actual CPU
and wait evidence, a chosen policy and complete transaction/session/data outcomes. Current92 and the
whole-course integration/audit remain required.

## Runtime evidence

| Trial                             | Original root            | Request policy / boundary        | Request response seconds |
| --------------------------------- | ------------------------ | -------------------------------- | ------------------------ |
| Source core; all five inspections | `/tmp/pg-owned-7fdrbqh1` | cancel / explicit transaction    | 0.269                    |
| Source variation                  | `/tmp/pg-owned-r9xzwcwg` | cancel / autocommit              | 0.201                    |
| Exact rendered hint2              | `/tmp/pg-owned-brjd_6c8` | cancel / autocommit              | 0.171                    |
| Termination comparison            | `/tmp/pg-owned-e5l4j8ld` | terminate / explicit transaction | 0.177                    |
| Termination comparison            | `/tmp/pg-owned-9u59t5ai` | terminate / autocommit           | 0.169                    |

Each survey observed a real incomplete request after2.08–2.12s. Its lock wait names the exact idle
holder, whose row lock matches pgrowlocks. The independent computation accumulated1.85–1.98s of
backend CPU time over the sampled interval. The active state or null wait event was not treated as
CPU proof. Survey cleanup terminated all three owned backends and stopped the server before offline
inspection. The later apply phase created different application identities and fresh backends; it
did not signal historical survey PIDs or retroactively remedy the survey request.

Every applied policy met the supplied2s dispatch-to-response budget. Cancellation returned57014 with
the user-request diagnostic and preserved the request connection. Core's next command got25P02 until
rollback, and tentative note2 disappeared. Autocommit's next command succeeded with00000 and its
previously committed note2 remained with the exact payload. Termination returned57P01 and the
request backend disappeared; the same committed-data boundary held. The holder and computation were
still untouched immediately after the request intervention.

Separate later comparisons proved that cancelling the idle holder left its same session, transaction
and row lock alive; cancelling the computation returned57014 and allowed the same connection after
rollback; terminating the holder returned57P01, removed its backend and lock, and rolled back
tentative balance999. Every final balance is100. Complete notes are exactly baseline1 for explicit
transactions, or baseline1 plus committed2 for autocommit. Note3 never commits.

`/tmp/pg-cancel-audit.py` independently checked every saved identity, dependency, full domain
inventory, CPU/deadline measurement, response, signal target, surviving actor and process exit. All
actual server ERROR/FATAL lines were classified: each cancellation trial has four administrative
terminations and two user-request cancellations, plus one25P02 for explicit core. Each termination
trial has five administrative terminations and one user-request cancellation. No other server error,
automatic timeout or forced client kill occurred. A deliberately invalid action was rejected before
mutation. Every pg_ctl status returned3 and all registered client processes were absent.

Survey's idle holder psql exits0 after receiving quit without reading a further server response; its
backend termination is independently established by activity absence. The other survey clients
exit2. During successful application, the terminated holder/request clients exit2; surviving request
and computation clients exit0 after their response checks. Exit codes alone do not establish server
or transaction state.

## Source, rendering and integration

Runtime drivers are `/tmp/pg-cancel-validate.ts`, `pg-cancel-exact.ts` and
`pg-cancel-termination.ts`. Executed shell scripts and logs share the corresponding core, variation
and termination prefixes. Exact output is `/tmp/pg-cancel-exact-runaway-query-and-cancel.log`; its
rendered hint is `/tmp/pg-cancel-rendered-runaway-query-and-cancel.md`.

`/tmp/pg-cancel-render-audit.ts` checked built/source/core/variation/exact command correspondence,
neutral start, runnable inspection/action/cleanup, complete source and the preserved outside-book
citation with Chapter15 background. `/tmp/pg-cancel-build.py` changed only91 among92 and removed its
scoped snapshot. First7 objects, capacity semantics, copied IDs/history/progress and seven reading
stops are unchanged. Current copy is `/tmp/pg-observe-progress-t7bgbky6/progress.sqlite`; real
learner SHA256 remains `395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`. Thirty
tests pass and full format/lint/type checks pass in `/tmp/pg-cancel-{tests,check}.log`.

## Resources and limits

`/tmp/pg-cancel-preserve.py` fully hashed all five stopped accepted roots, reopened the archives and
compared every regular file, then rechecked originals/stopped state and executed the supplied
cleanup command. About160MB of raw accepted state was removed;24,382,136 compressed bytes remain
under `/root/pg-validation-evidence/20260905/` pending the final course audit. Additional mapping:
`/tmp/pg-cancel-compacted.jsonl`. Prototypes vifxmo39/gw3zhlis retain only verified small forensic
records; their databases were removed. No author server/client or cleanup driver remains running.
Free disk remains about16GB and the learner's port5440 lab/progress are preserved.

The2s budget is a local experiment contract, not an application-generated timeout response or
production SLO. CPU measurements are Linux process tick deltas on this shared VM. Survey cleanup,
applied policy and later comparisons are separate measured boundaries. The fixture never tests
arbitrary backend targeting or claims that termination reverses committed work. Reclaim the retained
bulky audit inputs after whole-course acceptance, before declaring the overall goal complete.
