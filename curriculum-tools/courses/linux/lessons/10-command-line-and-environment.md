# Distinguish argv from the environment

slug: command-line-and-environment
category: processes-and-identity
difficulty: beginner
tags: processes, procfs
prerequisites: proc-process-identity
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 2

## Overview
Launch a child with a lab-only environment token and inspect its NUL-delimited command line and environment separately. Both are inherited byte vectors, but they answer different debugging questions.

## Syntax breakdown
### In plain terms

The child receives both an argument vector and environment vector. Each is NUL-delimited in procfs, but they carry different kinds of data and should not be used as interchangeable identity.

### What you are learning

- argv selects a program and its arguments.
- Environment values are inherited configuration and can contain secrets.

### Piece by piece

- **env NAME=VALUE bash -c** adds one variable only for the child command. **$!** records its PID.
- **/proc/PID/cmdline** and **environ** contain NUL, not newline, separators; **tr '\0'** makes records printable.
- **grep '^LINUX_TUTOR_TOKEN='** selects the exact environment key, while the cmdline check looks for the executable name.
- The trap uses recorded PID cleanup. Do not copy real secrets into this experiment; the printed token is lab-only.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
TOKEN=linux-tutor-token-$UID
export TOKEN
env LINUX_TUTOR_TOKEN="$TOKEN" bash -c 'sleep 5' &
argv_env_pid=$!
trap 'kill "$argv_env_pid" 2>/dev/null || true; wait "$argv_env_pid" 2>/dev/null || true' EXIT
sleep 0.1
printf 'process_pid=%s\n' "$argv_env_pid"
printf 'cmdline='; tr '\0' ' ' < "/proc/$argv_env_pid/cmdline"; printf '\n'
printf 'environment_token=%s\n' "$(tr '\0' '\n' < "/proc/$argv_env_pid/environ" | grep '^LINUX_TUTOR_TOKEN=')"
if tr '\0' '\n' < "/proc/$argv_env_pid/cmdline" | grep -q 'sleep'; then printf 'argv_contains_program=yes\n'; else printf 'argv_contains_program=no\n'; fi
kill "$argv_env_pid" 2>/dev/null || true
wait "$argv_env_pid" 2>/dev/null || true
trap - EXIT
```

## Expected result
cmdline contains sleep, environment_token=LINUX_TUTOR_TOKEN=linux-tutor-token-<UID>, and argv_contains_program=yes. process_pid varies. Bash may optimize the final sleep and replace its own command line; that is why the experiment checks the observable argv rather than requiring a shell wrapper.

## Systems lens
argv selects how a program interprets its arguments; environ carries inherited configuration and secrets. Treating either as process identity causes misleading diagnoses and accidental credential exposure.

## Optional variation
**Predict.** Before running, where do you predict the lab token and executable name will appear?

**Inspect and explain.** Identify the NUL conversion and explain why printing production environ is risky.

**Vary.** Replace only the lab token suffix with `variation-$UID` and re-run.

**Hint.** Use the existing LINUX_TUTOR_TOKEN name, never a credential.

**Apply.** Decide which safe process attributes belong in an incident ticket and which should be redacted.
