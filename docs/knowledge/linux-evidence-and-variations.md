# Linux evidence and executable variations

2026-09-04. Use when reviewing Linux lesson claims, challenge commands or incident recovery after
the progressive-course refactor.

## What happened

The course review found plausible experiments whose labels established less than the prose claimed:
two arbitrary CPU workers did not saturate a many-core host, one large descriptor count did not
establish growth, and stopping a listener did not establish restored service. Some delegated
challenge commands referred to files already removed by the lesson. Small proxy experiments passed
while the actual proposed substitutions left old numeric assertions in place.

The command sandbox also denied socket creation and privileged kernel operations that the disposable
host supported outside the sandbox. Treating those denials as course host policy would have hidden
the actual success branches behind unnecessary skips.

## Why it matters

Readable explanations and plausible output are insufficient if the experiment does not exercise the
claimed boundary. A learner should be able to run the supplied variation without reconstructing
deleted setup, and should know exactly which measurements support the conclusion. Course capability
limits and validator permissions are separate.

## How to apply

- Run the actual authored substitutions in the complete lesson. Update matching byte, count, status
  and timing assertions as part of the instructions. Inspect negative labels as well as exit status.
  A miniature proxy is supporting research, not proof that the published exercise works.
- Prefer full reruns with one bounded change. If a challenge requires a live PID or file, state the
  precise insertion point before cleanup and retain all cleanup steps.
- Establish process growth with a gate-controlled before/after measurement. Identify the owner and
  retained objects; unfiltered lsof rows include more than descriptors.
- Use `lsof -a -p PID +L1` to intersect PID and deleted-file selection. Publish the helper's actual
  descriptor number rather than assuming its first file always uses 3.
- Separate useful service, retained resources and teardown. Probe a complete bounded request/reply
  before failure and after intervention; then independently check process, file and listener
  absence. A listening socket can persist while a process is stopped.
- A stopped task cannot check its own elapsed-time deadline. Keep an independent exact-PID watchdog
  that can resume and terminate it, and reap the watchdog too.
- If the command sandbox denies a required socket or kernel action, use the required escalation path
  before concluding the disposable lab lacks the capability. Record true host-policy skips
  separately from successful mechanism validation.
- Preserve the stable lesson slug when strengthening evidence for its existing task. Increment the
  explicit lesson revision; do not raise the course-wide default just to make a partial refactor
  visible.
