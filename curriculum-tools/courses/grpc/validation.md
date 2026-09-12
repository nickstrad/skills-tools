# Acceptance: six short gRPC/protobuf experiments

Validated 2026-09-05 on Linux x86-64 with Go 1.26.8, protoc 36.1, grpcurl 1.9.4, protoc-gen-go
1.36.12, protoc-gen-go-grpc 1.5.1, grpc-go 1.80.0 and protobuf-go 1.36.12.

## Result

All **6/6** experiments passed in course order and **6/6** passed individually in fresh labs. The
semantic acceptance driver checks actual message bytes, values, statuses and stream sequences. The
standard harness's no-timeout summary alone was not used as proof of correctness.

| Lesson | Observed evidence                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `08 96 01 12 02 68 69`; schema decodes count 150 and label hi; renamed schema gives total 150; raw decode interprets hi as nested `13: 105`                                                   |
| 2      | Absent and implicit zero each 0 bytes; optional zero 2 bytes (`18 00`) and `limit: 0`; cmp succeeds                                                                                           |
| 3      | Old schema retains count 7 and displays unknown tags `2: "new"`, `3: 0`; current schema names them; reserved-tag reuse fails compilation                                                      |
| 4      | Generated request/client/server declarations; discovered Counter; values 2, 3, 4; reflection-disabled list fails but explicit-proto calls work; current schema rejects legacy JSON field name |
| 5      | InvalidArgument; caller terminal then anonymous on the next call; stream sequences 1,2,3 and then 1,2 followed by Unavailable                                                                 |
| 6      | Two DeadlineExceeded outcomes; first trial counter values 1,2,2; ID-based trial values 1,1,1 with deduplicated true; conflicting amount returns AlreadyExists                                 |

[accepted-output.txt](validation/accepted-output.txt) retains one small full run, including real
errors, ports and handler logs. [acceptance.json](validation/acceptance.json) records the final
lesson/fixture source SHA256 hashes, isolated CLI status, and unchanged original progress hashes.
The per-lesson repeats were checked against the same semantic assertions and are summarized there.
No optional runnable challenge is shipped; there are no unvalidated challenge branches.

## Tutor and build checks

- `deno task build grpc`: six generated lessons, 65 estimated minutes, backward prerequisites.
- `deno task check` passed across the tutor and course sources during integration. A later final
  invocation encountered formatting changes in concurrently edited PostgreSQL guide/tool files;
  those files belong to unrelated work and were left intact. The final gRPC-only format, lint and
  type checks pass.
- An isolated progress database initialized with six todo and zero done/skipped/stale lessons.
- Module display, all six pretty views and stream search rendered through the real CLI.
- Existing Linux, SQLite and PostgreSQL progress hashes stayed unchanged. PostgreSQL's hash was
  `395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`.
- Installed wrapper: `/root/.codex/skills/grpc-tutor/SKILL.md`. It uses direct walkthroughs and
  explicit-only completion, following the user's course-specific request.

Reproduce from curriculum-tools (a normal host shell is needed for loopback sockets):

```sh
/root/.deno/bin/deno task build grpc
python3 courses/grpc/lab/validate.py
/root/.deno/bin/deno task check
```

## Corrections found during real execution

The first file-only run corrected an assumption that decode_raw would display hi as a string;
without a schema those bytes also form a nested message. The first RPC pass corrected the grpcurl
error check from “unknown field” to the observed “no known field named increment.” The final
curriculum and accepted runs contain both corrections.

Initial RPC execution in the restricted sandbox failed at socket creation, before serving any
request. Retrying on the host resolved that environment limitation. It was not recorded as a
protocol result. The host learner PostgreSQL query returned `lab|/labs/pglab/primary`; no cluster
was started, stopped or altered for this course.

## Resource lifecycle

Every lesson creates a unique directory and optionally a loopback server at an OS-assigned port. Its
exit trap stops and reaps the owned child and removes the directory. Whole-course and isolated runs
left zero owned server processes and no per-lesson directories. The acceptance driver's copied
progress and outer scratch directory were removed as well.

Reusable tools/caches occupy about 694 MB; the counter binary about 16 MB. They stay installed for
learner practice. Download archives were removed after checksum verification and extraction. Only a
small text log and JSON source/evidence manifest are retained as acceptance evidence, not database
images or live lab state. These can remain as provenance until this course revision is replaced.
Final filesystem headroom is about 16 GB; the initial budget was 1.5 GB peak.

## Later resource retirement — 2026-09-12

Nick requested pruning after finishing with this course. The ignored `.tools/`, `lab/bin/` and
`lab/generated/` directories were removed after checking that no process executable or working
directory was using them and that they contained no tracked files. This reclaimed 796,069,888
allocated bytes. Curriculum, schemas, service source, the pinned installer, progress and these
historical validation records remain. The prior runs are not a claim that tools are still installed;
run `lab/install.sh` from this course before executing the experiments again.
