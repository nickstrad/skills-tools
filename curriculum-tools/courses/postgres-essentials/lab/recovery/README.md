# Recovery and standby fixtures for lessons 27–31

This Go controller owns a new `/tmp/pe-recovery-*` tree for every invocation. Use the complete
lesson through `tutor postgres-essentials N lesson` for the explanation, learner task, worked
completion and expected evidence. From `curriculum-tools/`, the controller is
`go run ./courses/postgres-essentials/lab/recovery --lesson N`.

| Lesson | Learner input | Supplied experiment |
| --- | --- | --- |
| 27 | --query SQL | Execute the query before backup, on the separate restored server, and on the changed source |
| 28 | --action SHELL | Execute a native repair command after a required archive segment is withheld and startup fails |
| 29 | --target before_bad or after_bad | Recover to that named point and compare visible operation history |
| 30 | --action SHELL | Construct a base backup with standby configuration; controller then starts and verifies it |
| 31 | --action SHELL | Diagnose and release a replay pause after WAL receipt is independently established |

The action shell exports explicit private PRIMARY/REPLICA connection strings and DEST/SAFE/ARCHIVE
paths; lesson 28 also supplies MISSING from backup_label. Its PATH starts with the PostgreSQL 16
binary directory. Actions are ordinary user-authored shell code, not a security sandbox: follow the
lesson's bounded task and use the supplied private variables. No existing cluster target is accepted
as a controller option. Connection settings inherited from the calling environment are discarded.

Prerequisites: Go, PostgreSQL 16 server/client tools on PATH (`pg_config --bindir` locates them),
Bash and cp. Root switches child credentials to the postgres OS account; a normal user runs the
servers directly. The controller checks for 3 GiB free disk before allocation. Measured fixtures
are below 90 MB; the conservative budget is 500 MB including primary, backup, recovery and archives.
Only unique owner-only Unix sockets are used; TCP is disabled. Trust authentication is confined to
those sockets. This is a local teaching fixture, not a production backup or replication service.

Each command has a 25-second deadline, pg_ctl startup/shutdown a 15-second wait, connections a
three-second connection timeout and five-second statement timeout, and observation polls an
eight-second deadline. SIGINT/SIGTERM cancels child command groups, then cleanup runs with a fresh
context. It stops copy before primary, verifies each is stopped, and removes the entire owned tree.
If stopping cannot be verified, it retains the tree and reports the exact path instead of deleting
active files. Check `cleanup=owned_tree_removed removed=true` on success or expected task failure.

## Author validation

From `curriculum-tools/`, after building the tutor launcher:

```sh
../bin/tutor postgres-essentials check
go run ./courses/postgres-essentials/validation/batch-seven
go run ./courses/postgres-essentials/validation/batch-seven --smoke-only
```

On this VM, real fixture commands require execution outside the agent filesystem/credential
sandbox so switching to the postgres OS account works. The read-only smoke checks do not.

The real validator reads the actual Markdown starter and labelled worked completion. Each unchanged
starter intentionally fails its stated task. It classifies that exact error, then substitutes only
the worked Run block in a temporary course copy and runs all five through `tutor ... validate
--isolated`. Neither the source lesson nor learner progress is modified. Additional checks cover
omitting -R, action failure, non-root execution and SIGINT with both servers live. All fixtures are
removed immediately; only small logs and source manifests remain. See
[the acceptance report](../../validation/batch-seven.md).
