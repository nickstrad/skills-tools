# Separate the running kernel from userspace

slug: identify-kernel-and-userspace
category: lab-and-shell-discipline
difficulty: beginner
tags: lab, shell, procfs
prerequisites: build-disposable-linux-lab
safety: read-only
run-in: shell
sessions: 1
min-version: 5.1
minutes: 8
revision: 2

## Overview
Compare the release reported by uname with the distribution metadata and with /proc/version. The comparison makes visible that a userspace image can change independently of the kernel providing its system calls.

## Syntax breakdown
### In plain terms

The experiment asks which layer supplied an observation. A container or VM can replace programs and files without replacing the kernel that implements its system calls.

### What you are learning

- procfs is a kernel-generated filesystem view.
- A process executable and distribution metadata belong to userspace.

### Piece by piece

- **uname -r** asks the running kernel for its release; `kernel_uname` is the value later compared.
- **cut -d' ' -f1-3 /proc/version** reads a procfs file and selects its first three space-delimited fields; `proc_version_prefix` should start with Linux.
- **awk -F=** reads **/etc/os-release** using `=` as its field separator; `userspace_id` names the installed userspace distribution.
- **readlink -f /proc/self/exe** resolves the program for the readlink process, while **/proc/$$/exe** resolves this Bash process. `shell_exe` should identify Bash.
- **grep -q** searches quietly; its yes/no label tests whether the kernel release occurs in the kernel-generated version line.

## Run
```sh
printf 'kernel_uname=%s\n' "$(uname -r)"
printf 'proc_version_prefix=%s\n' "$(cut -d' ' -f1-3 /proc/version)"
printf 'userspace_id=%s\n' "$(awk -F= '/^ID=/{gsub(/"/, "", $2); print $2}' /etc/os-release)"
printf 'readlink_self_exe=%s\n' "$(readlink -f /proc/self/exe)"
printf 'shell_exe=%s\n' "$(readlink -f /proc/$$/exe)"
if grep -q "$(uname -r)" /proc/version; then printf 'kernel_release_consistent=yes\n'; else printf 'kernel_release_consistent=no\n'; fi
```

## Expected result
kernel_uname is the current Linux release and kernel_release_consistent=yes. proc_version_prefix begins with Linux and includes the kernel build identity; userspace_id identifies the distribution; shell_exe resolves to a Bash binary.

## Systems lens
The kernel is the syscall provider and procfs publisher, while /etc/os-release belongs to the filesystem image. Containers commonly change userspace while sharing the host kernel, so these identities must be recorded separately.

## Optional variation
**Predict.** Whether changing a userspace package could change userspace_id while leaving kernel_uname unchanged.

**Inspect and explain.** Point to the two lines that come from procfs or uname and the one that comes from /etc; explain which is an image fact.

**Vary.** Run `readlink -f /proc/$$/exe` in a second Bash and compare the path only, not an assumed distribution.

**Hint.** The current shell PID is `$$`; do not inspect another user's process.

**Apply.** Choose which identity you would use to decide whether a production symptom belongs to a kernel rollout or an application-image rollout.
