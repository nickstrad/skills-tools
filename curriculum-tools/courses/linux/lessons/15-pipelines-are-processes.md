# Expose pipeline members and PIPESTATUS

slug: pipelines-are-processes
category: lifecycle-and-signals
difficulty: beginner
tags: processes, pipes, shell
prerequisites: wait-and-exit-status
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 3

## Overview
Run a two-process pipeline whose left member fails after recording its PID. Inspect both member PIDs and Bash's PIPESTATUS vector to show that a pipeline is concurrent process composition, not one command.

## Syntax breakdown
### In plain terms

A pipeline has two concurrent processes and several status views. The left side fails after producing a record; pipefail makes that upstream failure visible in the pipeline result.

### What you are learning

- A pipe connects one process's stdout to another's stdin.
- PIPESTATUS is per-member evidence and is overwritten by later commands.

### Piece by piece

- **|** creates the kernel pipe. The first **bash -c** exits 7, while **cat** succeeds, so the first pipeline's ordinary `$?` is 0.
- **set -o pipefail** changes Bash's whole-pipeline status to the rightmost nonzero member; **set +o pipefail** restores the initial policy.
- The children write **BASHPID** into exported lab paths. **> /dev/null** discards the first test output; **cat > FILE** captures the second pipeline payload.
- `pipeline_status=$? left_status=${PIPESTATUS[0]} right_status=${PIPESTATUS[1]}` must be one assignment line: it retains both pipeline and member results before any command overwrites them.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
LEFT_PID_FILE=$LAB/pipeline-left-$UID.pid
RIGHT_PID_FILE=$LAB/pipeline-right-$UID.pid
PIPE_OUTPUT=$LAB/pipeline-output-$UID.txt
trap 'rm -f "$LEFT_PID_FILE" "$RIGHT_PID_FILE" "$PIPE_OUTPUT"' EXIT
export LEFT_PID_FILE RIGHT_PID_FILE PIPE_OUTPUT
bash -c 'exit 7' | cat > /dev/null
status_without_pipefail=$?
set -o pipefail
bash -c 'printf "%s\n" "$BASHPID" > "$LEFT_PID_FILE"; printf "left-output\n"; exit 7' |
  bash -c 'printf "%s\n" "$BASHPID" > "$RIGHT_PID_FILE"; cat > "$PIPE_OUTPUT"'
pipeline_status=$? left_status=${PIPESTATUS[0]} right_status=${PIPESTATUS[1]}
set +o pipefail
left_pid=$(cat "$LEFT_PID_FILE")
right_pid=$(cat "$RIGHT_PID_FILE")
printf 'left_pid=%s right_pid=%s\n' "$left_pid" "$right_pid"
printf 'status_without_pipefail=%s\n' "$status_without_pipefail"
printf 'left_status=%s right_status=%s pipeline_status=%s\n' "$left_status" "$right_status" "$pipeline_status"
printf 'pipeline_output=%s\n' "$(cat "$PIPE_OUTPUT")"
if [ "$left_status" -eq 7 ] && [ "$right_status" -eq 0 ] && [ "$pipeline_status" -eq 7 ] && [ "$status_without_pipefail" -eq 0 ]; then printf 'pipeline_members=failed-left-successful-right\n'; else printf 'pipeline_members=unexpected\n'; fi
rm -f "$LEFT_PID_FILE" "$RIGHT_PID_FILE" "$PIPE_OUTPUT"
trap - EXIT
```

## Expected result
left_pid and right_pid are distinct positive PIDs; pipeline_output=left-output; status_without_pipefail=0 because the last member (cat) succeeded; left_status=7 right_status=0 pipeline_status=7 because pipefail reports the last nonzero member; and pipeline_members=failed-left-successful-right.

## Systems lens
Pipelines form a process graph joined by kernel pipes. A supervisor that reports only the final reader's status can hide an upstream failure, just as a distributed pipeline can hide a failed producer behind a healthy sink.

## Optional variation
Rerun the full block with both exit 7 commands changed to exit 3 and both -eq 7 comparisons
changed to -eq 3. Keep the combined status assignment immediately after the pipeline, before
any other command can overwrite `$?` or PIPESTATUS.

The ordinary pipeline status remains0; with pipefail it becomes3, matching the failed left member.
The right member still succeeds and left-output remains in the file because the producer wrote
before exiting. Retaining each stage's status distinguishes that partial production from successful
completion of an ingestion pipeline.
