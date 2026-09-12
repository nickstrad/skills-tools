import { code, type Module } from "../../../src/types.ts";
import { caution, failureHelp, rpcHelp, setup, shellHelp } from "./common.ts";

export const RPC: Module = {
  category: "grpc",
  title: "Call and debug a local gRPC service",
  lessons: [
    {
      slug: "discover-and-call",
      title: "Discover a service and call it with grpcurl",
      difficulty: "beginner",
      prerequisites: ["message-to-bytes"],
      tags: ["grpc", "reflection", "code-generation", "schema-evolution"],
      estimatedMinutes: 12,
      overview: "gRPC defines callable service methods with typed request and response messages. " +
        "Generate client/server interfaces from a supplied proto, then use grpcurl to inspect and " +
        "call a real counter. Repeat without server reflection to practice using a local schema.",
      syntaxBreakdown: code`
### In plain terms
A unary RPC sends one request and receives one response. Here Add changes a counter and Get
reads it. Reflection is a server feature that supplies schemas to inspection tools; the service
can still accept calls when reflection is disabled if your client already has the schema.

### What you are learning
- **service Counter** groups methods; **rpc Add(AddRequest) returns (CounterReply)** declares a
  unary method. Protobuf code handles messages; gRPC stubs handle calling and implementing methods.
- grpcurl can obtain schemas from reflection or from local .proto files. A failed list operation
  alone does not establish that the service is down.
- JSON field names belong to the selected client schema. A legacy name can encode the same binary
  tag, while that name is rejected when interpreted using the current schema.

### Piece by piece
` + shellHelp + rpcHelp + failureHelp + code`
- **cat** prints counter.proto. **option go_package** tells the Go generator the generated package.
  The server's Go implementation is supplied; you do not need to write it.
- **protoc -I DIRECTORY** selects the proto directory. **--go_out=DIR** generates message code;
  **--go-grpc_out=DIR** generates gRPC stubs. Their **--go_opt=paths=source_relative** and
  **--go-grpc_opt=paths=source_relative** options keep output next to the source-relative filename.
  The installer put both compiler plugins on the course PATH. Generation here writes only LAB.
- **grep -nE** finds generated declarations: **-n** includes line numbers and **-E** enables the
  alternation in the pattern. A client interface exposes calls; a server interface defines handlers.
- **list** discovers services and **describe practice.Counter** prints its method contract.
- **-reflection=false** is an option to our supplied server. **-import-path DIRECTORY** tells
  grpcurl where to find schemas; **-proto FILE** selects one instead of relying on reflection.
  legacy.proto names tag 1 **increment**; counter.proto calls it **amount**. The type stays int32.
`,
      setup,
      code: code`
(
  set -euo pipefail
  new_lab
  cat "$GRPC_COURSE/lab/proto/counter.proto"
  protoc -I "$GRPC_COURSE/lab/proto" --go_out="$LAB" --go_opt=paths=source_relative --go-grpc_out="$LAB" --go-grpc_opt=paths=source_relative counter.proto
  grep -nE 'type (AddRequest|CounterClient|CounterServer)' "$LAB/counter.pb.go" "$LAB/counter_grpc.pb.go"
  start_server
  grpcurl -plaintext "$ADDR" list
  grpcurl -plaintext "$ADDR" describe practice.Counter
  grpcurl -plaintext -d '{"amount":2}' "$ADDR" practice.Counter/Add
  start_server -reflection=false
  expect_failure 'does not support' grpcurl -plaintext "$ADDR" list
  grpcurl -plaintext -import-path "$GRPC_COURSE/lab/proto" -proto legacy.proto -d '{"increment":3}' "$ADDR" practice.Counter/Add
  grpcurl -plaintext -import-path "$GRPC_COURSE/lab/proto" -proto counter.proto -d '{"amount":1}' "$ADDR" practice.Counter/Add
  expect_failure 'no known field named increment' grpcurl -plaintext -import-path "$GRPC_COURSE/lab/proto" -proto counter.proto -d '{"increment":1}' "$ADDR" practice.Counter/Add
)
`,
      expectedResult: code`
Generation produces AddRequest, CounterClient and CounterServer declarations (line numbers vary).
The service list contains **practice.Counter**, and describe shows Add, Get and Watch. First Add
returns **value: 2** in JSON. Restarting resets the counter. Listing now fails because reflection
is unsupported, but the legacy-schema call returns **value: 3** and the current-schema call returns
**value: 4**. Using increment with the current schema fails with **no known field named increment**
before the request reaches the handler. JSON uses quoted keys; whitespace can vary.
`,
      systemsLens: "Protobuf supplies the message contract and gRPC supplies method invocation. " +
        "Discovery, binary field compatibility and the JSON accepted by a debugging tool are " +
        "different boundaries, even when all three use one .proto file.",
      caution,
      safetyLevel: "writes-data",
      runIn: "shell",
    },
    {
      slug: "status-metadata-and-streams",
      title: "Read errors, send metadata and consume a stream",
      difficulty: "beginner",
      prerequisites: ["discover-and-call"],
      tags: ["grpc", "metadata", "status-codes", "streaming"],
      estimatedMinutes: 10,
      overview: "A gRPC call carries a status as well as its response data. Send an invalid " +
        "request, attach caller metadata, and consume a short stream. Then see a stream deliver " +
        "two messages and still finish with an error.",
      syntaxBreakdown: code`
### In plain terms
Metadata is per-call context outside the message body. A server-streaming RPC takes one request
and returns a sequence of messages, followed by a final status. The supplied Watch method can
deliberately fail partway through so you can recognize this in terminal output.

### What you are learning
- InvalidArgument is an application validation failure; changing the request can fix it.
- Metadata and payload fields are separate. Our x-caller header is a display label, not authentication.
- Receiving a message is not proof the entire stream succeeded; inspect the final status too.

### Piece by piece
` + shellHelp + rpcHelp + failureHelp + code`
- Add allows **amount** from 1 to 10. Sending zero deliberately exercises its validation rule.
- **-H 'x-caller: terminal'** attaches a metadata key/value. The fixture echoes it as caller.
  Header names and their meaning are service-specific; this one grants no privileges.
- **-v** asks grpcurl for verbose method/metadata/status details around the Get response; timings
  and HTTP/2-related metadata can vary. This supplements, rather than replaces, the RPC result.
- **Watch** has **returns (stream Tick)** in the schema. **count** bounds output to at most ten
  messages; **failAfter** is the JSON spelling of fail_after and asks the fixture to stop after
  that many messages with Unavailable. Zero/omitted means no deliberate failure.
`,
      setup,
      code: code`
(
  set -euo pipefail
  new_lab
  start_server
  expect_failure InvalidArgument grpcurl -plaintext -d '{"amount":0}' "$ADDR" practice.Counter/Add
  grpcurl -plaintext -H 'x-caller: terminal' -d '{"amount":2}' "$ADDR" practice.Counter/Add
  grpcurl -plaintext -v -d '{}' "$ADDR" practice.Counter/Get
  grpcurl -plaintext -d '{"count":3}' "$ADDR" practice.Counter/Watch
  expect_failure Unavailable grpcurl -plaintext -d '{"count":5,"failAfter":2}' "$ADDR" practice.Counter/Watch
)
`,
      expectedResult: code`
The first call reports **InvalidArgument** and the amount range. The next returns **value: 2** and
**caller: "terminal"**. Get still returns value 2 but caller anonymous because the header applied
only to the preceding RPC. Verbose output includes the resolved method and response metadata.

The successful Watch emits sequence **1, 2, 3** and exits successfully. The failing Watch emits
**1, 2**, then **Unavailable: fixture stopped after partial output**, with a nonzero exit status.
The two delivered messages remain visible; there is no automatic stream rollback or resume.
`,
      systemsLens:
        "A stream has partial progress and a final outcome. Applications decide how to " +
        "handle already-consumed results when the call fails. The same distinction appears in " +
        "downloads and database result streams.",
      caution,
      safetyLevel: "writes-data",
      runIn: "shell",
    },
    {
      slug: "timeout-and-retry",
      title: "Check what happened before retrying a timeout",
      difficulty: "intermediate",
      prerequisites: ["discover-and-call"],
      tags: ["grpc", "deadlines", "retries", "idempotency"],
      estimatedMinutes: 15,
      overview: "The counter can apply a change immediately and delay its reply. Give the client " +
        "a shorter deadline, read the actual counter, and repeat the call. Then repeat with a " +
        "stable request ID to see the service suppress the duplicate effect.",
      syntaxBreakdown: code`
### In plain terms
A deadline bounds how long the caller waits, not whether the server changed anything. The fixture
updates its in-memory counter before waiting to reply. Cancellation stops that wait, but the
increment remains. This walkthrough makes the outcome visible with Get before any retry.

### What you are learning
- DeadlineExceeded leaves the caller uncertain about effects; read the result when the API allows it.
- Repeating a write can apply it twice. A stable request ID can make retries safe when the server
  implements matching deduplication semantics. Merely adding a field does not provide a guarantee.
- The same ID must keep the same operation data. This fixture rejects a conflicting amount.

### Piece by piece
` + shellHelp + rpcHelp + failureHelp + code`
- **-max-time 0.5** bounds the grpcurl call to half a second. **replyDelayMs: 1500** asks this
  fixture to wait 1.5 seconds after applying the effect; it is not a built-in gRPC setting.
- **Get** reads current counter state independently of the failed response. Retrying with only
  **amount** performs another increment because no identity connects the two calls.
- **start_server** resets this disposable server for the second trial. **requestId: "job-42"**
  identifies the operation; keep it unchanged on retry. The fixture records IDs and amounts under
  the same mutex as the counter update. A duplicate skips the effect and delayed reply.
- **cat "$LAB/server.log"** shows actual handler decisions, including duplicate true/false.
  Timestamps vary. AlreadyExists means this fixture saw that ID with a different amount.
`,
      setup,
      code: code`
(
  set -euo pipefail
  new_lab
  start_server
  expect_failure DeadlineExceeded grpcurl -plaintext -max-time 0.5 -d '{"amount":1,"replyDelayMs":1500}' "$ADDR" practice.Counter/Add
  grpcurl -plaintext -d '{}' "$ADDR" practice.Counter/Get
  grpcurl -plaintext -d '{"amount":1}' "$ADDR" practice.Counter/Add
  grpcurl -plaintext -d '{}' "$ADDR" practice.Counter/Get
  cat "$LAB/server.log"
  start_server
  expect_failure DeadlineExceeded grpcurl -plaintext -max-time 0.5 -d '{"amount":1,"requestId":"job-42","replyDelayMs":1500}' "$ADDR" practice.Counter/Add
  grpcurl -plaintext -d '{}' "$ADDR" practice.Counter/Get
  grpcurl -plaintext -d '{"amount":1,"requestId":"job-42"}' "$ADDR" practice.Counter/Add
  expect_failure AlreadyExists grpcurl -plaintext -d '{"amount":2,"requestId":"job-42"}' "$ADDR" practice.Counter/Add
  grpcurl -plaintext -d '{}' "$ADDR" practice.Counter/Get
  cat "$LAB/server.log"
)
`,
      expectedResult: code`
Trial 1: **DeadlineExceeded**, Get **value: 1**, retry **value: 2**, Get **value: 2**. The log
records two effects with empty request IDs and duplicate=false.

Trial 2 starts with a fresh server: **DeadlineExceeded**, Get **value: 1**, retry **value: 1**
with **deduplicated: true**. Reusing job-42 with amount 2 reports **AlreadyExists**. Final Get is
still **value: 1**, and the log contains duplicate=true. Cancellation log timing can vary, but
these counter values and statuses should not. If the first Get is not 1, the delayed request did
not reach the intended effect before timeout; rerun the fresh block on an unloaded machine.
`,
      systemsLens:
        "An RPC timeout does not establish rollback. These are manual retries; grpcurl " +
        "is not automatically retrying for us. This fixture deduplicates only during one running " +
        "server lifetime and returns current counter state. A production API needs explicit " +
        "durability, retention and response-replay semantics for its idempotency contract.",
      caution,
      safetyLevel: "writes-data",
      runIn: "shell",
    },
  ],
};
