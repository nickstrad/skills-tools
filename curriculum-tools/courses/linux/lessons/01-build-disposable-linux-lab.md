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
- **export NAME=VALUE** places a value in this shell's child environment. **export LC_ALL=C** sets the byte-oriented locale for child commands; the challenge uses the same form for LINUX_LAB before a full rerun. The printed `locale=C` is the control value to compare across terminals.
- **readlink -f** resolves the lab to an absolute path; `lab_path` identifies the exact failure domain. **rmdir PATH** removes one empty directory only, so the challenge uses it only after the variation lab has no contents.
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
**Predict.** Which output should change if you set LINUX_LAB to a new absolute path, and which version labels should stay the same?

**Inspect and explain.** Compare the original run with the variation and confirm that both lab paths are absolute and explain why version strings do not prove behavior is identical.

**Vary.** In the same shell, run export LINUX_LAB=$HOME/linux-systems-lab-variation, then rerun the complete lesson block; after it reports its labels, use rmdir on LINUX_LAB only if the new directory is empty.

**Hint.** The export must precede the multiline lesson block so every command inherits it. Do not reuse a directory holding another experiment.

**Apply.** When filing a service incident, record the kernel release, image identity, and writable scratch path you would preserve.
