# Lesson 25 hardened-controller validation

Validated PostgreSQL 16.15 core and `--finish commit` runs on 2026-09-11. In both, the JSON records
identified the exact private fixture and data directory, the same writer PID before and after
CHECKPOINT, 12,000 writer-visible pending rows, and 12,000 observer-visible original rows. Relation
dirty buffers changed from 906 to 0. Rollback ended with 12,000 original and zero pending rows;
commit ended with zero original and 12,000 pending rows. Each measured 64,966,600 bytes against the
200,000,000-byte limit and printed an exact removed path.

A timed SIGINT during startup exited 130 through the timeout driver and printed
`{"cleanup":"owned cluster removed",...,"removed":true}`. An injected Connection failure after
server startup also exited nonzero only after printing the same confirmed cleanup record. No
`/tmp/pe-checkpoint-*` directory remained.

Checks passed: Deno format and type check for the module, Python AST parsing, and git diff
whitespace validation.

```text
3c30f598f812b08b275a691b8caae62241182976be092041840add5622e8d810  curriculum/19-checkpoint.ts
3028e570a1347fd0a2c5d4a783cf75b4613d4f130d5d965c003c3b6f334aa12f  lab/checkpoint.py
```
