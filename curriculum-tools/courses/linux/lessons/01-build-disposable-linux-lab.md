# Build a disposable Linux lab you can safely own

slug: build-disposable-linux-lab
category: lab-and-shell-discipline
difficulty: beginner
tags: lab, shell
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 3

## Overview
Create the bounded directory that every later experiment owns, then label the Bash, kernel, and OS versions used for the observation. A named failure domain makes cleanup and reproduction possible on a disposable VM.

## Syntax breakdown
### In plain terms

This is preparation, not a kernel-behavior claim. It creates one directory that later commands may change and records enough execution context to compare a rerun with this run.

### What you are learning

- A lab boundary is a directory the experiment owns.
- Kernel, shell, and distribution versions are separate observations.

### Piece by piece

- **LINUX_LAB** is an environment variable. It selects the lab; the empty-value test falls back to the learner-owned default.
- **mkdir -p** is a shell program. The **-p** flag creates missing parents and does not fail when the directory already exists; `lab_writable=yes` means this process can create later artifacts.
- **export NAME=VALUE** places a value in this shell's child environment. **export LC_ALL=C** sets the byte-oriented locale for child commands; the optional comparison uses the same form for LINUX_LAB before a full rerun. The printed `locale=C` is the control value to compare across terminals.
- **readlink -f** resolves the lab to an absolute path; `lab_path` identifies the exact failure domain. **rmdir PATH** removes one empty directory only, so the optional comparison uses it only after the variation lab has no contents.
- **bash --version**, **uname -r**, and **awk** over **/etc/os-release** report shell, running-kernel, and userspace labels. Their text is inventory evidence and can vary between hosts.

## Caution
Use a new directory or a dedicated VM-owned LINUX_LAB. Do not point it at a home directory containing unrelated files.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
export LC_ALL=C
printf 'lab_path=%s\n' "$(readlink -f "$LAB")"
printf 'lab_writable=%s\n' "$(test -w "$LAB" && echo yes || echo no)"
printf 'bash_version=%s\n' "$(bash --version | sed -n '1p')"
printf 'kernel_release=%s\n' "$(uname -r)"
printf 'os_name=%s\n' "$(awk -F= '/^PRETTY_NAME=/{gsub(/"/, "", $2); print $2}' /etc/os-release)"
printf 'locale=%s\n' "$LC_ALL"
```

## Expected result
The output contains an absolute lab_path ending in linux-systems-lab (unless LINUX_LAB was supplied), lab_writable=yes, a Bash 5.1-or-newer version line, a Linux kernel release, an OS name, and locale=C. Only the selected lab directory is created. Run export LC_ALL=C in every terminal you open for this course; the lessons assume it.

## Systems lens
A reproducible experiment starts by naming its failure domain and recording the independent kernel and userspace versions. This is the same discipline used for a service's scratch volume, deployment image, and incident timeline.

## Optional variation
In the same shell, select a separate empty lab, then rerun the complete Run block above:

```sh
export LINUX_LAB="$HOME/linux-systems-lab-variation"
```

The second run should report the new absolute `lab_path`; its Bash, kernel, OS, and locale labels should stay the same. The matching labels record the environment for the comparison, but they do not prove that all behavior is identical. When the variation directory is empty, remove only that directory:

```sh
rmdir "$LINUX_LAB"
```

The export must precede the Run block so every command inherits it. Do not reuse a directory holding another experiment. For an incident record, retain the kernel release, image identity, and writable scratch path together.
