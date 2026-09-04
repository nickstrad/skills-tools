# Primary review and integration evidence

2026-09-04. Primary completed review of all three Terra/high deliveries, final wording, hard
semantic fixes and integration. All four designs are accepted.

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

Negative checks also replaced the response with incorrect bytes and delayed investigation beyond the
watchdog. Both returned nonzero and left their lab directories empty, confirming that failure is
rejected rather than hidden by cleanup output.

Primary corrected readiness assertions, published the deleted file's actual descriptor instead of
assuming descriptor 3, intersected lsof owner selectors, and separated useful service recovery from
teardown. CPU and memory values are examples, not fixed targets.

Primary sources used for the causal boundaries:
[process CPU accounting](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html),
[stop and continue signals](https://man7.org/linux/man-pages/man7/signal.7.html), and
[pipe endpoint lifetime](https://man7.org/linux/man-pages/man7/pipe.7.html).

## Final integration acceptance

- Final serial host command:
  `LINUX_LAB=/tmp/linux-primary-final-20260904 /root/.deno/bin/deno run -A tools/validate.ts linux`.
  All 72 lessons completed, and primary inspected output against their expected evidence. All
  privileged branches executed; no host-policy skip was counted as a pass. Log:
  `/tmp/linux-primary-final-20260904.log`.
- All 66 pre-capstone authored variations executed in serial, preserving both sessions for lessons
  5, 23 and 57. Log: `/tmp/linux-final-variations-real.log`. The six capstone variations and two
  failure checks above complete the exercise review. The final descriptive three-task label was
  verified separately after the batch.
- The first integration run caught an unmatched shell quote in lesson 40. Primary fixed it, ran the
  lesson individually, then reran all 72 successfully. No lesson failure remains.
- All 72 Bash blocks and all 66 generated variation blocks passed bash -n. Linux build produced 72
  lessons. Repository `deno task check` passed formatting, lint and type checks; `deno task test`
  passed all 30 tests. Earlier concurrent-course failures are superseded by these final results.
- Compared with planning baseline a71e0d6, all 72 slugs and ordinals are unchanged and every changed
  lesson's explicit revision increased exactly once. The course-wide default remains 1.
- Isolated progress was initialized from the baseline, with synthetic completions/notes for 1 and 72
  and a skip for 23, then reseeded with the final build. Both completions became stale while
  preserving their notes; the skip and all three attempt records remained. Modules and pretty 72
  rendered successfully. Database: `/tmp/linux-refactor-progress-20260904.sqlite`. No real learner
  progress was read or changed for this check.
- PLAN now records current prerequisites and a learner decision for each stable lesson. The wrapper
  follows the guided template, supports standalone and topical routes, and infers no completion from
  prior database work. `/root/.codex/skills/linux-tutor` remains the repo symlink.

The private log files are session artifacts; the evidence needed to restart/review is recorded in
these four checked-in reports. Hardware-sensitive counts, timing and scheduler outcomes remain
samples. The course still targets a dedicated Linux VM with the documented tools and privileges.
