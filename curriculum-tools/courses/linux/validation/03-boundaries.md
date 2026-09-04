# Budgets, sockets and isolation: final primary validation

2026-09-04. Primary reviewed the Terra/high delivery and corrected variations that used cleaned-up
state or stale assertions. Lessons 49–66 passed in the final serial host run; all 18 actual authored
variations passed in the separate serial variation run. Logs:
`/tmp/linux-primary-final-20260904.log` and `/tmp/linux-final-variations-real.log`.

| Lessons | Primary evidence                                                                                        | Published variation evidence                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 49      | Child inherited soft 40; raising within hard ceiling allowed, above it denied; parent limits unchanged. | Soft 32 inherited, same ceiling relationships. Host privilege allowed raising a lowered hard ceiling; labeled accordingly.       |
| 50      | Unprivileged real-UID process budget enforced; children reaped.                                         | With existing+4, three children created and thirteen forks rejected under nobody.                                                |
| 51      | Status 153 and final size 1,048,576 bytes.                                                              | Half-size limit yielded status 153 and 524,288 bytes.                                                                            |
| 52      | CPU limit killed the child; watchdog_timeout=no.                                                        | Two-second CPU limit also triggered before the six-second watchdog.                                                              |
| 53      | Current cgroup2fs and controller/accounting files readable.                                             | cgroup.procs had eight process rows while pids.current was 45 tasks; different accounting units are visible.                     |
| 54      | pids.max boundary observed and cgroup removed.                                                          | pids.max=4: three children, thirteen failures, thirteen max events, group removed.                                               |
| 55–56   | Actual loopback listener; ss/lsof/proc ownership correlated.                                            | Backlog 1 still produced a listener; proc FD listing identified the same socket owner.                                           |
| 57      | ESTAB sample, zero server status and accepted_connection=yes.                                           | Shorter client pause retained successful acceptance; ESTAB remains timing-sensitive.                                             |
| 58–59   | UNIX payload exchange; socket descriptor/inode matched proc TCP row.                                    | Changed unix-pong payload received; formatted hexadecimal port matched the proc lookup.                                          |
| 60      | Eight bounded client outcomes totaled eight; backlog probe complete.                                    | Four clients: two admitted and two timed out/refused, sampled Recv-Q 2. Counts are observations, not kernel-independent targets. |
| 61      | Eight parent/child namespace identities matched.                                                        | Restricting the comparison to mount/network/PID/user yielded four matches.                                                       |
| 62–63   | New PID view with PID 1; private tmpfs absent from outer mount view.                                    | Shorter inner sleep preserved PID evidence; 512 KiB tmpfs preserved inside/outside isolation.                                    |
| 64      | Inner UID 0 with explicit outer mapping.                                                                | Group-ID version printed inner_gid=0 and gid_map range 0→0, length 1 on this root host.                                          |
| 65      | Inner namespace had only loopback, outer had four interfaces.                                           | Leaving loopback down retained one interface and the isolated view.                                                              |
| 66      | nsenter observed target tmpfs/private file; outer view did not; mount count after release 0.            | Changed private payload retained the same visibility and cleanup evidence.                                                       |

Initial sandbox runs denied socket and namespace creation and could not configure the host cgroup
subtree. Those runs were not accepted as mechanism validation; the escalated host runs exercised all
success branches. No policy skip remains in the final host evidence. Runtime code still reports
actual capability limits where appropriate for other disposable lab installations.

Limits, group accounting, endpoint ownership, namespace visibility and creation authority remain
separate concepts. UID/GID zero inside a user namespace is interpreted with its mapping and does not
imply new host authority. LISTEN proves endpoint state; accepted data and useful service require
additional evidence, completed in the final incident.
