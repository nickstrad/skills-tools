# Short gRPC and Protocol Buffers course

## What happened

The learner requested work-relevant CLI practice, then explicitly capped the whole course at
30–90 minutes and excluded mental-model guesses and extra reflection. The resulting
[course](../../curriculum-tools/courses/grpc/README.md) is six supplied walkthroughs totaling
65 minutes: three protobuf-only file experiments, two gRPC usage experiments, and one combined
timeout/retry experiment. Lessons 1, 4 and 6 are a 37-minute quick route. One-time tool installation
is separate and was performed during authoring. These preferences govern this course; they do not
silently change PostgreSQL coaching or other curricula.

## Why it matters

- `protoc --decode_raw` does not know whether length-delimited data is a string or an embedded
  message. The bytes for `hi` decode as `2 { 13: 105 }`, while the schema-aware decoder prints
  `label: "hi"`. Keep that measured output; do not “correct” it to a string in expectedResult.
- With protoc 36.1, an omitted proto3 int32 and an explicitly supplied implicit zero both encode
  to zero bytes. An optional int32 at field 3 with value zero encodes to `18 00` and decodes with
  presence intact. Schema syntax matters: this is not a claim about Editions defaults.
- grpcurl 1.9.4 reports a JSON/schema mismatch as `no known field named increment`, not
  `unknown field`. The local helper verifies actual failures and their text. Reflection-disabled
  calls still work with `-proto`; schema discovery failure is distinct from service unavailability.
- grpcurl can print two valid streamed messages before reporting Unavailable. Acceptance checks
  assert the exact sequence and final status, not only the count of printed messages.
- The supplied counter applies its effect before delaying the reply; cancellation stops waiting
  but does not undo it. Get independently verifies state. Request-ID deduplication is in-memory,
  bounded to one service lifetime, rejects a conflicting amount and returns current counter state.
  It is intentionally not a durable exactly-once or original-response-replay implementation.
- The shell sandbox rejects socket creation and hides host processes. That is an environment
  boundary, not a failed gRPC mechanism or evidence that the learner's host PostgreSQL is down.
  Validate RPC lessons outside that sandbox. A read-only host query confirmed `/labs/pglab/primary`.

## How to apply

Edit only curriculum TypeScript, then build `grpc` and run the normal Deno check. The service,
schemas, pinned module checksums and installation script live in `courses/grpc/lab/`. Tools and
compiled output are ignored. At Nick’s request, the local toolchain, caches, binary and generated
stubs were pruned on 2026-09-12 (796,069,888 allocated bytes); use the pinned installer before
running experiments again. Source, validation evidence and progress remain intact. All lessons run without network
downloads after installation; they listen only on loopback and use OS-assigned ports.

`python3 courses/grpc/lab/validate.py` from curriculum-tools drives the standard tutor harness,
checks each actual learning outcome, repeats every lesson independently, smoke-tests isolated
progress, checks original progress hashes and rejects leaked owned servers or temporary labs.
It retains one small full output log and a source-hash acceptance manifest. It deletes its copied
progress and scratch directories. Run it outside socket-restricted sandboxes. Final evidence is
in [validation.md](../../curriculum-tools/courses/grpc/validation.md).

The wrapper skill supplies exact commands and expected output together without prediction gating.
Do not replace that with the generic wrapper coaching template; the user's instruction is the
reason for the difference. Preserve explicit-only progress recording.

## Shared Go dependency after pruning

The original systemscoach launcher and shell profile had borrowed Go from the gRPC `.tools/`
directory. Pruning exposed that dependency. Go 1.26.8 was installed separately at `/usr/local/go`
from the same digest-verified release, with `/usr/local/bin/go` and `gofmt` links. Systemscoach now
uses the shared installation and discards only inherited cache paths belonging to the retired
gRPC tools. The shell profile was updated likewise. The 759 MiB course-local reclamation is gross:
the shared Go runtime remains needed by systemscoach. No gRPC experiment tools were reinstalled.
