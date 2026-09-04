# Foundations validation — 2026-09-04

Private copy: `/tmp/linux-foundations-20260904`. Private lab: `/tmp/linux-foundations-lab`. No
shared course source, generated artifact, documentation, progress database, or other course was
changed while validating this unit.

## Final primary acceptance

Primary reviewed the delivered code and wording, corrected variation assertions and finite FIFO
cleanup, then executed all 24 primary lessons again in the final 72-lesson host run and all 24
published variations in the 66-variation host run. Logs are `/tmp/linux-primary-final-20260904.log`
and `/tmp/linux-final-variations-real.log`. The final FIFO run proved EOF after the last writer
closed; the pipe variation transferred 4,194,304 bytes. The two-thread variation produced three
tasks; its descriptive label was also updated to say three. Variation 1 used an equivalent private
`/tmp` lab instead of creating a second directory under the learner's home. All private lab contents
were removed. The initial evidence below remains useful; it is superseded by this final review where
wording or assertions changed.

## Commands run

```sh
export PATH=/root/.deno/bin:$PATH
deno fmt courses/linux/curriculum/01-lab-and-shell.ts \
  courses/linux/curriculum/02-processes.ts \
  courses/linux/curriculum/03-lifecycle-and-signals.ts \
  courses/linux/curriculum/04-file-descriptors-and-pipes.ts
deno task build linux
deno fmt --check courses/linux/curriculum/01-lab-and-shell.ts \
  courses/linux/curriculum/02-processes.ts \
  courses/linux/curriculum/03-lifecycle-and-signals.ts \
  courses/linux/curriculum/04-file-descriptors-and-pipes.ts
deno lint courses/linux/curriculum/01-lab-and-shell.ts \
  courses/linux/curriculum/02-processes.ts \
  courses/linux/curriculum/03-lifecycle-and-signals.ts \
  courses/linux/curriculum/04-file-descriptors-and-pipes.ts
deno check courses/linux/curriculum/01-lab-and-shell.ts \
  courses/linux/curriculum/02-processes.ts \
  courses/linux/curriculum/03-lifecycle-and-signals.ts \
  courses/linux/curriculum/04-file-descriptors-and-pipes.ts
LINUX_LAB=/tmp/linux-foundations-lab deno run -A tools/validate.ts linux --from 1 --to 24
```

Build wrote 72 lessons. Formatting, lint, and type checks passed. The serial shell run completed
`24/24 lessons completed without timeout`; the private lab was empty afterwards.

## Per-lesson evidence

| Lessons | Evidence read from the serial run                                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–3     | `lab_writable=yes`; `kernel_release=6.8.0-138-generic`; `kernel_release_consistent=yes`; `required_command_count=62`; `missing_command_count=0`; `inventory_ok=yes`.                                  |
| 4–6     | `stable_order=A,B,a,b,`; `cleanup=order_file_absent:yes`; FIFO A received `linux-tutor-0`; trap child was `gone` and PID file `absent`.                                                               |
| 7–9     | `child_ppid=79` equaled `shell_bashpid=79`; tree root and child appeared in both views; `proc_pid=ps_pid=pgrep_pid=91`, with a numeric start tick.                                                    |
| 10–12   | `environment_token=LINUX_TUTOR_TOKEN=linux-tutor-token-0`; state sequence `S`, `T`, `S`; `thread_entry_count=4` with matching TGID.                                                                   |
| 13–15   | `foreground_ms=254`, `background_return_ms=3`, `background_total_ms=256`; exit values 0 and 7; pipeline values `left_status=7 right_status=0 pipeline_status=7`. Timings are samples, not guarantees. |
| 16–18   | TERM receipt and status 0 in 3 ms; forced status 137 in 6 ms; `zombie_state=Z` and orphan parent changed from 185 to 1. The timing and reaper PID are observations.                                   |
| 19–21   | Standard-stream links named the three private files; separate and duplicate output labels matched; parent and child FD 9 named the same private log.                                                  |
| 22      | `producer_state=S`, `producer_blocked=yes`, two zero statuses, `produced_bytes=8388608`, `backpressure_released=yes`. This is buffer pressure while FD 7 holds endpoints open.                        |
| 23      | B printed `first_writer_closed_final_writer_open`; A received the message, waited, then after B printed `final_writer_closed`, A printed `session_a_eof_status=1` and `eof_after_final_writer=yes`.   |
| 24      | `subshell_limit=32`, `last_descriptor_opened=31`, `descriptor_error=Too many open files`, `descriptor_boundary=observed`, and `parent_limit_unchanged=yes`.                                           |

The only negative-text grep hits were the inventory's positive `command=timeout status=present` and
lesson 24's expected `descriptor_error=Too many open files`.

## Challenge variation evidence

The runnable substitutions were executed in the same private lab after the core run. They retained
the bounded paths, exact-PID cleanup, and finite polling used by the lessons. Evidence was:

| Lessons | Variation and result                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4     | A second `LINUX_LAB` path was writable; a second Bash resolved to `/usr/bin/bash`; `PATH=/bin command -v mkfifo` found `/bin/mkfifo`; C sort again printed `A,B,a,b,`.                                                                                                          |
| 5–6     | A distinct FIFO payload was received before A returned; changing the trap child to a one-second sleep still left the recorded child gone and PID file absent.                                                                                                                   |
| 7–12    | Shorter child sleeps retained direct PPID and state transitions; the changed argv label appeared in cmdline; the changed environment token appeared in environ; two Python workers yielded leader plus two tasks.                                                               |
| 13–18   | 100 ms foreground/background samples retained the return-versus-join relation; status 9 was preserved; a changed pipeline failure was captured in PIPESTATUS; signal and zombie variations retained their labeled status relationships.                                         |
| 19–24   | Changed stream payloads and inherited-FD text retained their wiring checks; matched 64-block pipe endpoints produced 4194304 bytes; changed FIFO payload still reached EOF only after the final close; a 24-FD subshell failed earlier while its parent limit stayed unchanged. |

## Semantic diffs and uncertainty

- Every lesson now renders all three required syntax headings and a specific Predict, Inspect and
  explain, Vary, Hint, Apply challenge. Preparation lessons describe inventory/version output as
  preparation rather than an internals demonstration.
- All 24 changed lessons have explicit revisions. The seven lessons whose built baseline was 2 are
  now 3; the other changed lessons are explicitly 2. Course revision and slugs/order are unchanged.
- Lesson 22 now says **no draining consumer**, not no reader, and explicitly names FD 7 as the open
  endpoint that makes the block a finite-buffer observation.
- Lesson 23 retains `fifo-process-coordination` but now distinguishes final-writer EOF from the
  rendezvous in lesson 5. Its two finite polls and two writer descriptors reproduced under the
  harness.
- Process states, process trees, thread counts, timing, and the orphan's replacement PPID remain
  samples. The expected results state relationships rather than treating those values as fixed
  guarantees.
