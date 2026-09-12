# gRPC and Protocol Buffers: 65 minutes of CLI practice

Six small walkthroughs to make working with protobuf schemas and gRPC services feel familiar.
Commands and expected output are supplied. No quizzes, prediction prompts, required notes or
application-building assignment. Each experiment starts fresh and cleans up automatically.

| Lesson | Practice                                                         | Minutes |
| ------ | ---------------------------------------------------------------- | ------: |
| 1      | Encode bytes, decode them and rename a field                     |      10 |
| 2      | Compare an absent integer with an explicit zero                  |       8 |
| 3      | Read a new message with an old schema; reject reserved-tag reuse |      10 |
| 4      | Generate stubs, discover and call a service, use a local proto   |      12 |
| 5      | Read status codes, attach metadata and consume a stream          |      10 |
| 6      | Time out a write, inspect its effect and retry with a request ID |      15 |

Total: **65 minutes** of practice. For a short first pass, lessons **1, 4 and 6** take about 37
minutes and recreate all their own state. These are estimates, not timed requirements.

## Start

The tools and supplied service are installed separately from lesson time. On this checkout:

```sh
cd /root/Software/skills-tools/curriculum-tools
bin/tutor grpc init
bin/tutor grpc route
bin/tutor grpc 1 lesson
```

Run the displayed setup and experiment in Bash. Read its expected output directly; there is no
answer-submission step. You can also ask the assistant for “gRPC lesson 1” or “the next gRPC
lesson.” Initialization creates the new course catalog but marks nothing complete. Record completion
only when you want to:

```sh
bin/tutor grpc 1 done
bin/tutor grpc route
```

Each experiment's parenthesized block uses an isolated temporary directory. Its exit trap stops and
reaps its server and removes that directory. Output stays in the terminal. Rerun a complete block to
repeat it. Lesson 4's restart intentionally resets the counter. No permanent lab server needs to
remain running between sessions.

## One-time installation or repair

Supported target: Linux x86-64, Bash 5.1+, Python 3, curl and tar. Installation downloads about 100
MB of release archives plus Go dependencies; allow a few minutes and up to 1.5 GB peak disk. The
exact elapsed time depends on the network and compile cache and is separate from the 65-minute
practice path. The authoring run prepares this checkout so the learner can start immediately.

```sh
cd /root/Software/skills-tools/curriculum-tools
bash courses/grpc/lab/install.sh
```

The installer pins Go 1.26.8, protoc 36.1, grpcurl 1.9.4, protoc-gen-go 1.36.12 and
protoc-gen-go-grpc 1.5.1. It checks SHA256 digests for the three release archives; Go module
versions/checksums are recorded in lab/go.mod and lab/go.sum. Tools live under this course's ignored
.tools directory, generated code under lab/generated, and the counter binary under lab/bin. Nothing
is added to your global PATH; the lesson's setup loads its tools into that shell.

If this repository is moved, update the source path in curriculum/common.ts and rebuild; the current
lesson setup deliberately names this shared workspace. Dependency installation needs internet
access. Running the finished lessons does not. A restricted agent sandbox may require permission to
bind local sockets; run learner commands in a normal terminal on the VM.

## What the fixture demonstrates

Protobuf is practiced with files before any server starts. The supplied Go service has Add, Get and
server-streaming Watch methods. grpcurl supplies JSON at the terminal and encodes protobuf for the
RPC. A legacy schema uses a different name for the same numeric field to show how the binary and
JSON contracts differ.

The service listens only on 127.0.0.1 at an OS-assigned port. Its plaintext connection is a local
teaching convenience. x-caller is a label, not authentication. Add deliberately applies its
in-memory effect before delaying a reply. Deduplication remembers request IDs only until the server
stops, rejects the same ID with a different amount, and returns current counter state. It is not a
durable exactly-once protocol or a production service template.

TLS, flow control, client/bidirectional streaming, health checks, load balancing and HTTP/2 frame
inspection are outside this short course. No cloud account, Kubernetes cluster or Docker image is
needed. [PLAN.md](PLAN.md) records the scope and [validation.md](validation.md) records real runs.

## Optional reference

- [Protobuf encoding](https://protobuf.dev/programming-guides/encoding/): field numbers and bytes.
- [Field presence](https://protobuf.dev/programming-guides/field_presence/): absent versus default.
- [Proto3 language guide](https://protobuf.dev/programming-guides/proto3/): schema evolution.
- [gRPC concepts](https://grpc.io/docs/what-is-grpc/core-concepts/): methods, messages and streams.
- [gRPC deadlines](https://grpc.io/docs/guides/deadlines/) and
  [cancellation](https://grpc.io/docs/guides/cancellation/): caller limits and handler cooperation.
- [grpcurl documentation](https://github.com/fullstorydev/grpcurl): CLI discovery and calls.
