# Probe an identity-scoped process limit

slug: limit-process-count
category: resource-boundaries
difficulty: intermediate
tags: resource-limits, processes, shell
prerequisites: limit-open-files
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 14
revision: 3

## Overview
RLIMIT_NPROC counts every process owned by one real user ID, so it is only observable for an unprivileged identity. Run a bounded probe as the nobody user when passwordless sudo allows it (or as yourself otherwise), set the limit a few processes above that user's current count, attempt 16 forks, and count how many the kernel refuses with EAGAIN. Root is exempt, and the lesson labels that case instead of pretending.

## Syntax breakdown
### In plain terms

RLIMIT_NPROC is unusual because the kernel accounts processes for a real user ID, not just for one shell. This bounded probe chooses an unprivileged identity where possible, sets a small limit in that probe, and separates a refused fork from a successful child that was later reaped.

### What you are learning

- Per-real-UID accounting can include processes created by other shells of the same identity.
- Root may be exempt from this resource limit, so a root result is a policy observation rather than proof of enforcement.
- Reaping a child removes the parent's waitable record and is required cleanup after a successful fork.

### Piece by piece

- **id nobody** and **sudo -n -u nobody** (identity probes and switch)
  - What they are: id checks whether the account exists; sudo **-n** refuses to prompt and **-u** selects that account.
  - What they do here: they prefer nobody only when a noninteractive switch is allowed.
  - What they give us: probe_user states whose real UID the result belongs to.
- **ps -u USER --no-headers -o pid** (a process listing)
  - What it is: ps filters by user; **--no-headers** removes the column title and **-o pid** prints only identifiers.
  - What it does here: it counts existing processes before choosing a limit.
  - What it gives us: existing_processes makes clear that the configured limit is not a shell-local quota.
- **resource.setrlimit** and **RLIMIT_NPROC** (Python resource API)
  - What they are: setrlimit changes a limit of the Python probe; RLIMIT_NPROC names the process-count resource.
  - What they do here: they set both soft and hard values to the bounded computed limit.
  - What they give us: the limit applies only to fork attempts under that real UID.
- **os.fork**, **BlockingIOError**, and **os.waitpid** (process lifecycle calls)
  - What they are: fork duplicates a process, BlockingIOError represents EAGAIN, and waitpid reaps an exact child.
  - What they do here: at most 16 forks are attempted and each created child sleeps briefly then exits.
  - What they give us: created plus fork_failures must total 16; cleanup is not inferred from an error message.
- **expected_policy** (a labeled interpretation)
  - What it is: the script records the execution identity before judging the result.
  - What it does here: it labels root exemption separately from an unprivileged enforcement observation.
  - What it gives us: enforcement=not-observed under root does not establish that the configured limit is ineffective for a service account.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
probe_user=$(id -un)
runner=
if id nobody >/dev/null 2>&1 && sudo -n -u nobody true 2>/dev/null; then
  probe_user=nobody
  runner="sudo -n -u nobody"
fi
existing=$(ps -u "$probe_user" --no-headers -o pid 2>/dev/null | wc -l)
limit=$((existing + 6))
printf 'probe_user=%s existing_processes=%s nproc_limit=%s\n' "$probe_user" "$existing" "$limit"
probe=$($runner python3 -c 'import os, resource, sys, time
limit = int(sys.argv[1])
resource.setrlimit(resource.RLIMIT_NPROC, (limit, limit))
children = []
failures = 0
for attempt in range(16):
    try:
        pid = os.fork()
    except BlockingIOError:
        failures += 1
        continue
    if pid == 0:
        time.sleep(1)
        os._exit(0)
    children.append(pid)
for pid in children:
    os.waitpid(pid, 0)
print("created=%d fork_failures=%d" % (len(children), failures))' "$limit")
printf '%s\n' "$probe"
created=$(printf '%s\n' "$probe" | sed -n 's/.*created=\([0-9]*\).*/\1/p')
failures=$(printf '%s\n' "$probe" | sed -n 's/.*fork_failures=\([0-9]*\).*/\1/p')
if [ "$probe_user" = root ]; then printf 'expected_policy=root-is-exempt\n'; else printf 'expected_policy=enforced-for-unprivileged-identity\n'; fi
if [ -n "$failures" ] && [ "$failures" -gt 0 ] && [ $((created + failures)) -eq 16 ]; then printf 'enforcement=observed\n'; else printf 'enforcement=not-observed\n'; fi
printf 'cleanup=children_reaped\n'
```

## Expected result
probe_user=nobody on a VM with passwordless sudo (or your own unprivileged user), nproc_limit is that user's existing count plus 6, created is about 5 (the probe itself takes one slot), fork_failures is the rest of the 16 attempts, expected_policy=enforced-for-unprivileged-identity, enforcement=observed, and cleanup=children_reaped. When the probe can only run as root, expected_policy=root-is-exempt and enforcement=not-observed is the correct evidence.

## Systems lens
RLIMIT_NPROC is identity-scoped rather than a universal process count: the kernel compares the whole user's process total against the limit at fork time and exempts privileged identities. The same configured value therefore behaves differently for root and for a service account, which is why diagnosis must record both the policy and the execution identity.

## Optional variation
**Predict:** If another shell already owns processes for probe_user, will the probe start at zero usage? State why.

**Inspect and explain:** Use existing_processes and created to explain why the limit is tied to a real UID rather than a single parent PID.

**Vary:** Copy the full probe into a private run and change only **limit=$((existing + 6))** to **limit=$((existing + 4))**. It still attempts exactly 16 forks and reaps every created child, so it exercises the same real-UID accounting under a smaller headroom.

**Hint:** A process limit can be inherited by a process, while its accounting population can be wider than that process tree.

**Apply:** A multi-worker service fails to fork only after another service account deployment. What UID-scoped evidence and cgroup evidence would you collect before changing either limit?
