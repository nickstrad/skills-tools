# Inventory the commands the curriculum needs

slug: inventory-required-commands
category: lab-and-shell-discipline
difficulty: beginner
tags: lab, shell, troubleshooting
prerequisites: build-disposable-linux-lab
safety: read-only
run-in: shell
sessions: 1
min-version: 5.1
minutes: 8
revision: 3

## Overview
Probe the command surface before an incident exercise starts. The list is every external program the 72 lessons invoke, plus two tools probed by absolute path because command -v cannot see them the same way: /usr/bin/time (the bash keyword time would answer instead) and mkfs.ext4 (which lives in /usr/sbin, sometimes off an unprivileged PATH). A zero-missing inventory distinguishes a missing capability from a kernel or application failure.

## Syntax breakdown
### In plain terms

This is capability preparation. It separates a missing measurement command from a later systems result, and it reports the precise missing name instead of treating the inventory as an internals experiment.

### What you are learning

- PATH lookup and absolute-path checks answer different availability questions.
- Shell builtins can be replaced by functions or aliases in an interactive shell.

### Piece by piece

- **for command_name in ...; do** iterates each required external command without executing it.
- **command -v** is a Bash builtin that resolves a command through PATH; redirecting both streams to **/dev/null** keeps each `status=present` line machine-readable.
- **[ -x PATH ]** tests whether the two absolute tool paths are executable, avoiding the Bash `time` keyword and a PATH that lacks **/usr/sbin**.
- **type -t** reports a name's Bash classification; `builtin` is healthy here, while `shadowed-by-...` names an altered shell control plane.
- **$((...))** performs integer arithmetic. The final counts and `inventory_ok` summarize the individual labeled observations.

## Run
```sh
missing=0
required_command_count=0
for command_name in awk basename bash cat chmod cmp cut date dd df du env find findmnt free grep head id ionice ip ln locale ls lsblk lsns lsof mkdir mkfifo mount mv nice nproc nsenter pgrep pmap ps pstree python3 readlink rm rmdir sed seq sleep sort ss stat sudo tail taskset tee timeout touch tr truncate umount uname unshare vmstat wc; do
  required_command_count=$((required_command_count + 1))
  if command -v "$command_name" >/dev/null 2>&1; then
    printf 'command=%s status=present\n' "$command_name"
  else
    printf 'command=%s status=missing\n' "$command_name"
    missing=$((missing + 1))
  fi
done
for tool_path in /usr/bin/time /usr/sbin/mkfs.ext4; do
  required_command_count=$((required_command_count + 1))
  if [ -x "$tool_path" ]; then
    printf 'command=%s status=present\n' "$tool_path"
  else
    printf 'command=%s status=missing\n' "$tool_path"
    missing=$((missing + 1))
  fi
done
shadowed=0
for builtin_name in command echo exec exit export jobs kill printf read set test trap true ulimit umask wait; do
  if [ "$(type -t "$builtin_name")" != builtin ]; then
    printf 'builtin=%s status=shadowed-by-%s\n' "$builtin_name" "$(type -t "$builtin_name" || echo nothing)"
    shadowed=$((shadowed + 1))
  fi
done
printf 'required_command_count=%s\n' "$required_command_count"
printf 'missing_command_count=%s\n' "$missing"
printf 'shadowed_builtin_count=%s\n' "$shadowed"
if [ "$missing" -eq 0 ] && [ "$shadowed" -eq 0 ]; then printf 'inventory_ok=yes\n'; else printf 'inventory_ok=no\n'; fi
```

## Expected result
Every command= line prints status=present, no builtin= line appears, required_command_count=62, missing_command_count=0, shadowed_builtin_count=0, and inventory_ok=yes on the prepared Ubuntu VM. If a tool is absent, its name is explicit rather than being mistaken for a later lesson failure; /usr/bin/time needs the time package and mkfs.ext4 needs e2fsprogs.

## Systems lens
Capability discovery is an observability prerequisite: the same symptom can mean a missing binary, a permission boundary, or a kernel feature. Operators first establish which measurement tools are actually available.

## Optional variation
**Predict.** Whether removing a directory from PATH changes `command -v` results but not the two absolute-path probes.

**Inspect and explain.** Find any `status=missing` or `shadowed-by-` line and explain whether it is installation, PATH, or shell-state evidence.

**Vary.** In a subshell, run `PATH=/bin command -v mkfifo || true`; then rerun the full inventory unchanged.

**Hint.** Use a subshell so the course shell retains its PATH.

**Apply.** Before diagnosing a failed service command, list the binary, permission, and kernel-feature checks you would make first.
