# Primary review and integration evidence

2026-09-04. This report is updated as reviewed changes land. Full-course integration is pending the
three implementation batches.

## Capstones: reviewed and executed

Primary ran
`LINUX_LAB=/tmp/linux-root-capstone-real-20260904 deno run -A
tools/validate.ts linux --from 67 --to 72`
outside the command sandbox, using the disposable host. All six completed with the expected
evidence. The initial sandbox run denied IPv4 socket creation; that is a validator permission
boundary, not evidence that the course host lacks loopback networking.

| Lesson | Measured evidence                                                                                                                          | Actual authored variation                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 67     | Two workers on one CPU accumulated positive ticks; both exited.                                                                            | One worker accumulated 98 ticks in the sample and exited.                                        |
| 68     | RSS 26,684 to 75,848 KiB; delta 49,164; owner absent after stop.                                                                           | One additional 16 MiB block gave delta 16,388 KiB.                                               |
| 69     | Descriptor counts 15 to 51, delta 36; 48 retained lab paths.                                                                               | Closing the initial batch gave counts 3 to 39, with 36 retained paths.                           |
| 70     | Deleted file held 32,768 allocated 512-byte blocks; owner absent after stop.                                                               | Eight-MiB file held 16,384 blocks.                                                               |
| 71     | EADDRINUSE 98; ss/lsof owner found; rebind succeeded.                                                                                      | Listen backlog 4 retained collision and successful rebind evidence.                              |
| 72     | Healthy baseline, timeout with state T and LISTEN, healthy response after CONT; zero graceful status, no listener or files after teardown. | Six retained files still timed out while stopped and recovered after CONT; exact cleanup passed. |

The variations were generated from the actual built code with precisely the substitutions authored
in each challenge and run as Bash scripts with 35-second timeouts. Every variation returned zero and
left its private lab empty. The final service uses a separate exact-PID watchdog so a stopped task
cannot defeat its ordinary deadline.

Primary corrected readiness assertions, published the deleted file's actual descriptor instead of
assuming descriptor 3, intersected lsof owner selectors, and separated useful service recovery from
teardown. CPU and memory values are examples, not fixed targets.

Primary sources used for the causal boundaries:
[process CPU accounting](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html),
[stop and continue signals](https://man7.org/linux/man-pages/man7/signal.7.html), and
[pipe endpoint lifetime](https://man7.org/linux/man-pages/man7/pipe.7.html).

## Checks at the capstone checkpoint

Linux module 12 format, lint, type check and build passed. The repository-wide check reported five
unformatted PostgreSQL/SQLite files. The first full test run had 29 passes and one PostgreSQL
checkpoint fixture failure during concurrent changes; final integration will rerun it. No unrelated
files were edited to address these results.

## Remaining integration work

Review corrected agent deliveries, regenerate all Linux lessons, execute the full course serially
and inspect evidence/cleanup, verify isolated progress migration, update PLAN and durable findings,
then rerun repository checks.
