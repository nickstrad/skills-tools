# Repository tooling

Updated 2026-09-12 for the Go CLI.

The repository's course engine is a Go module under `curriculum-tools/`; the root `bin/tutor`
launcher builds a cached `curriculum-tools/.cache/tutor` binary and sets `TUTOR_ROOT`. Course
content is Markdown under `curriculum-tools/courses/<id>/lessons/` and plans are Markdown too.

## What happened

- The launcher is intentionally a small shell exception. It finds Go, builds the CLI with the
  current short git hash, and execs the cached binary. A direct binary needs `TUTOR_ROOT` or an
  explicit `--root`.
- The shared learner database is `curriculum-tools/tutor.sqlite`. Legacy per-course files, when
  retained for recovery, live under `curriculum-tools/.cache/legacy-progress/<course-id>/`.
- Go scratch state should stay outside the checkout when possible. The bounded setup used here is
  `GOPATH=/root/go GOCACHE=/tmp/tutor-go-build`; the launcher cache remains under
  `curriculum-tools/.cache/`.
- Docker checks require a reachable daemon. `scripts/docker/test.sh` builds the lab image with
  `scripts/lab-setup.sh` and runs `scripts/docker/verify.sh`; the image setup checks `time`,
  `e2fsprogs`, `python3`, and `sudo`.

## Why it matters

Running checks against the old engine or an accidental course-local database can validate a path
that learners no longer use. The launcher cache also means a normal `bin/tutor` invocation may
update one ignored file, while read-only course commands do not create the shared database.

## How to apply

From the repository root, use the following bounded checks:

```sh
cd /root/Software/skills-tools/curriculum-tools
GOPATH=/root/go GOCACHE=/tmp/tutor-go-build gofmt -l .
GOPATH=/root/go GOCACHE=/tmp/tutor-go-build go test ./...
GOPATH=/root/go GOCACHE=/tmp/tutor-go-build go vet ./...
GOPATH=/root/go GOCACHE=/tmp/tutor-go-build go test -race ./...
GOPATH=/root/go GOCACHE=/tmp/tutor-go-build go build ./...
```

`gofmt -l` must print nothing. Run `tutor <course> check` after editing a course, and use
`tutor <course> validate` only with an owned lab and isolated progress/database paths. The
`--root` and `--db` flags make those paths explicit; never point validation at the learner's
`/labs/pglab` cluster or live progress file.

For a Docker image check, first run `docker info`, then from the repository root run
`scripts/docker/test.sh`. Remove owned image and lab state after inspecting its evidence. Budget
the peak size of databases, WAL, replicas, logs and evidence before starting a run.
