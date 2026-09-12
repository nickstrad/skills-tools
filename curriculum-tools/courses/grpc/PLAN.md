# gRPC and Protocol Buffers: short CLI practice

Implemented and validated: all six lessons passed in course order and individually. Latest user
instruction (2026-09-05): 30–90 minutes, focused practice for work, direct instructions, no
mental-model guesses or required reflection. The earlier twelve-lesson plan is superseded. Six
experiments total 65 minutes, excluding one-time tool installation. No quizzes, required notes,
capstone or application-building task.

## Fixed experiments

1. `message-to-bytes` (10m): protoc encode → hex inspection → decode with original and renamed
   fields. Expected: same numeric tag preserves the value. Lens: representation versus transport.
2. `absent-versus-zero` (8m): protoc encodes absent, implicit-zero and optional-zero fields; wc/cmp
   and decoding expose presence. Expected: only optional zero retains presence. Lens: defaults and
   partial-update intent.
3. `read-an-evolved-message` (10m): decode new fields with an old schema and compile a reserved-tag
   collision. Expected: unknown numeric fields and a compiler rejection. Lens: schema evolution.
4. `discover-and-call` (12m): generate supplied Go stubs; grpcurl list/describe/Add, then disable
   reflection and call with -proto. A legacy field name still works with its original numeric tag.
   Expected: schema discovery failure is distinct from RPC failure. Lens: API contract boundaries.
5. `status-metadata-and-streams` (10m): invalid Add, request metadata, finite Watch and a stream
   that fails after two messages. Expected: InvalidArgument, echoed caller, sequences, Unavailable.
   Lens: payload versus context, partial progress versus completed RPC.
6. `timeout-and-retry` (15m): Add applies before its reply exceeds a client deadline; Get checks
   actual effects; repeat with/without request IDs. Expected: two effects versus one. Lens:
   ambiguous outcomes and application deduplication. A supplied walkthrough, not an incident quiz.

Lessons 1–3 use only files; 4–5 focus on gRPC; 6 combines messages and RPC failure behavior. Each
recreates its own state. A 37-minute route is 1, 4 and 6. The learner knows shell and Go; service
source is supplied. Optional references never interrupt practice. A completion is recorded only on
request. No independent synthesis assignment is required by the user's scope.

## Lab and acceptance

Linux x86-64; pinned Go/protoc/grpcurl releases and code-generation plugins. Verify release hashes.
Budget 1.5 GB peak tools/downloads/caches, under 5 MB per experiment. Preflight: 17 GB disk and 6.9
GiB memory available. Keep at least 2 GB disk free and twice peak footprint available. Use one
loopback server on an OS-assigned port. Per-experiment mktemp directory, owned child PID, readiness
check, EXIT trap, stop/reap child then remove files. No shared ports, pkill or database writes. Keep
installed tools for practice, remove author scratch/progress copies after validation. Run all six
via Bash-mode tools/validate.ts and individually; inspect expected output, build/check, smoke-test
isolated progress and install the wrapper. Recheck host PostgreSQL outside the sandbox: its
process/socket namespace is not observable inside the sandbox. Never infer deletion authority.

Tags: protobuf, wire-format, field-presence, schema-evolution, code-generation, grpc, reflection,
metadata, status-codes, streaming, deadlines, retries, idempotency.

## Sources and limits

Primary sources checked 2026-09-05: [protobuf overview](https://protobuf.dev/overview/),
[encoding](https://protobuf.dev/programming-guides/encoding/),
[proto3](https://protobuf.dev/programming-guides/proto3/),
[presence](https://protobuf.dev/programming-guides/field_presence/),
[gRPC concepts](https://grpc.io/docs/what-is-grpc/core-concepts/),
[deadlines](https://grpc.io/docs/guides/deadlines/),
[cancellation](https://grpc.io/docs/guides/cancellation/),
[grpcurl](https://github.com/fullstorydev/grpcurl).

Proto3 fixtures keep scope small; Editions has different defaults. grpcurl JSON is a CLI
representation, not JSON transmitted as the protobuf payload. No speed/size benchmarks or
canonical-byte guarantees. Manual retry is not automatic grpcurl policy. In-memory request-ID
deduplication lasts one server lifetime; it does not prove durable exactly-once execution. Defer
TLS, HTTP/2 internals, flow control, client/bidirectional streaming and load balancing. Plaintext
binds only loopback. The saved ZGateway article motivates service-boundary practice as our teaching
interpretation; this does not reproduce its architecture or performance.
