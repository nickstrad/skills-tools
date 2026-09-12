# Deriving a course's command inventory

Updated 2026-09-12 for the Go CLI.

The Linux inventory should be derived from the runnable Markdown lesson blocks, not from prose or
an assumed tool list. `tutor <course> list --json` exposes the parsed lesson records, while the
source of truth remains `curriculum-tools/courses/<id>/lessons/*.md` and its `Setup` and `Run`
fences.

## What happened

The original hand-written Linux list named four commands the course never ran (`cp`, `hostname`,
`iostat`, `sync`) and missed about two dozen it did (`nproc`, `truncate`, `ln`, `seq`, `sudo`,
`tee`, `id`, `basename`, `rmdir`, `touch`, `lsof`, `ss`, and others). The corrected list came from
parsing every setup and run block and collecting the word in command position.

A plain word grep is not enough. Commands hide in `bash -c` and `trap` bodies, `$(...)` and
`<(...)` substitutions, and wrapper prefixes such as `sudo`, `timeout`, `nice`, `taskset`, `ionice`,
`unshare`, `nsenter`, `/usr/bin/time`, `env`, and `exec`. A parser must recurse into quoted shell
bodies and apply each wrapper's argument rules. Arithmetic expansions, comments, redirection
targets, loop lists, variables, and functions defined in the same block are not external commands.

## Why it matters

Lesson 3 exists so a missing executable is reported as a missing tool rather than mistaken for a
kernel behavior in a later lesson. Its expected count must move with the actual Markdown route.

## How to apply

1. Read lesson records with `tutor linux list --json`, or parse the fenced `Setup` and `Run` blocks
   directly when source text and quoting are required.
2. Tokenize shell command position after `;`, pipes, `&&`, `||`, `&`, parentheses, `then`, `do`,
   `else`, and `!`; skip assignments and recurse into substitutions and shell strings.
3. Cross-check candidates with `command -v`, `test -x` for required absolute paths, and
   `type -t NAME` for builtins. A command appearing only in the inventory lesson is suspect.
4. Re-run the extraction after lesson edits, then run `tutor linux check` and compare the expected
   inventory count with the generated evidence. Do not edit lesson content as a side effect of the
   inventory check.
