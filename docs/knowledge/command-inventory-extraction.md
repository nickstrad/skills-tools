# Deriving a course's command inventory

How lesson 3 of the Linux course (`inventory-required-commands`) got its list. Last updated
2026-09-03.

## What happened

The original list was written by hand. It named four commands the course never runs (`cp`,
`hostname`, `iostat`, `sync`) and missed about two dozen it does (`nproc`, `truncate`, `ln`,
`seq`, `sudo`, `tee`, `id`, `basename`, `rmdir`, `touch`, `lsof`, `ss`, ...). The corrected list
came from parsing every `code` and `setup` field in the built `lessons.json` and collecting the
word at command position.

A plain word grep is not enough. Commands hide in:

- `bash -c '...'` bodies and `trap '...' EXIT` bodies (parse the quoted text as shell);
- `$(...)` and `<(...)` substitutions, including ones nested inside double quotes;
- wrapper prefixes: `sudo -n [-u USER]`, `as_root`, `timeout [-k N] DURATION`, `nice -n N`,
  `taskset -c LIST` (but `taskset -pc` takes a PID, not a command), `ionice -c N` (but
  `ionice -p PID` does not), `unshare ... [--]`, `nsenter ... [--]`, `/usr/bin/time -f FMT -o FILE`,
  `env VAR=x`, `exec [-a NAME]`;
- `$runner python3 ...` where `$runner` expands to a wrapper.

Things that look like commands and are not: `$((a - b))` arithmetic (looks like `$(` plus `(`),
`# Session A (blocks ...)` comments, redirection targets (`1>&2`, `9>>"$FILE"`), `for x in ...`
lists, and user functions defined in the same snippet (`as_root`, `cg_write`, `cleanup_*`).

## Why it matters

Lesson 3 exists so a missing tool is reported as a missing tool, not mistaken for a kernel
behaviour in lesson 40. Its value depends on the list being complete.

## How to apply

- Write a small tokenizer rather than a regex: track command position (start of line, after `;`,
  `|`, `&&`, `||`, `&`, `(`, `then`, `do`, `else`, `!`), skip `VAR=` prefixes and `$var` tokens,
  recurse into quoted shell bodies and `$(...)`, and apply the wrapper rules above.
- Cross-check the result two ways: (1) any word in the code that resolves with `command -v` on the
  host but is not in your set is a candidate you missed; (2) any entry in your set that appears
  only in lesson 3 itself is stale.
- Externals go through `command -v`; tools that need an absolute path (`/usr/bin/time`,
  `/usr/sbin/mkfs.ext4`) get `test -x`; builtins the course relies on can be checked with
  `type -t NAME = builtin` to catch shadowing.
- Repeat the extraction whenever lessons are added; the expected count in `expectedResult`
  (62 for the Linux course) must move with it.
