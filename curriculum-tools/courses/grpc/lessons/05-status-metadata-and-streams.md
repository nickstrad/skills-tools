# Read errors, send metadata and consume a stream

slug: status-metadata-and-streams
category: grpc
difficulty: beginner
tags: grpc, metadata, status-codes, streaming
prerequisites: discover-and-call
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 1

## Overview
A gRPC call carries a status as well as its response data. Send an invalid request, attach caller metadata, and consume a short stream. Then see a stream deliver two messages and still finish with an error.

## Syntax breakdown
### In plain terms
Metadata is per-call context outside the message body. A server-streaming RPC takes one request
and returns a sequence of messages, followed by a final status. The supplied Watch method can
deliberately fail partway through so you can recognize this in terminal output.

### What you are learning
- InvalidArgument is an application validation failure; changing the request can fix it.
- Metadata and payload fields are separate. Our x-caller header is a display label, not authentication.
- Receiving a message is not proof the entire stream succeeded; inspect the final status too.

### Piece by piece

- **source .../env.sh** loads the installed tools and cleanup helpers. Run the README's one-time
  installation first. **GRPC_COURSE** points to the course directory.
- **( ... )** creates a child shell. **set -euo pipefail** stops on an unexpected error, unset
  variable or failed pipeline without changing your parent shell's settings.
- **new_lab** creates a private temporary directory in **LAB** and registers an exit cleanup.
  The closing parenthesis stops the owned server and removes this experiment's temporary files.
  Rerun the whole block for fresh state.

- **start_server** starts the supplied counter on an available loopback port, checks it with an
  actual RPC and puts its address in **ADDR**. **stop_server** stops and reaps that child.
  Starting again gives a fresh counter. Logs are in **LAB/server.log** during the block.
- **grpcurl** calls gRPC from a terminal. **-plaintext** disables TLS for this loopback-only lab;
  do not copy that setting to a remote service. **-d** supplies JSON that grpcurl converts into
  protobuf bytes. The last arguments are the address and service/method; **{}** is an empty message.
  This CLI's JSON is not JSON transmitted as the protobuf payload.

- **expect_failure TEXT COMMAND...** runs the command, displays output and exit status, and checks
  that it failed with the named text. An unexpected success or different error stops the experiment.
  This helper lets deliberate errors coexist with **set -e**.

- Add allows **amount** from 1 to 10. Sending zero deliberately exercises its validation rule.
- **-H 'x-caller: terminal'** attaches a metadata key/value. The fixture echoes it as caller.
  Header names and their meaning are service-specific; this one grants no privileges.
- **-v** asks grpcurl for verbose method/metadata/status details around the Get response; timings
  and HTTP/2-related metadata can vary. This supplements, rather than replaces, the RPC result.
- **Watch** has **returns (stream Tick)** in the schema. **count** bounds output to at most ten
  messages; **failAfter** is the JSON spelling of fail_after and asks the fixture to stop after
  that many messages with Unavailable. Zero/omitted means no deliberate failure.

## Caution
Use the supplied loopback lab. Each complete block cleans its temporary files and stops its server on exit; inspect output inside the block or rerun it. Existing databases and learner progress are not changed.

## Setup
```sh
source /root/Software/skills-tools/curriculum-tools/courses/grpc/lab/env.sh
```

## Run
```sh
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
```

## Expected result
The first call reports **InvalidArgument** and the amount range. The next returns **value: 2** and
**caller: "terminal"**. Get still returns value 2 but caller anonymous because the header applied
only to the preceding RPC. Verbose output includes the resolved method and response metadata.

The successful Watch emits sequence **1, 2, 3** and exits successfully. The failing Watch emits
**1, 2**, then **Unavailable: fixture stopped after partial output**, with a nonzero exit status.
The two delivered messages remain visible; there is no automatic stream rollback or resume.

## Systems lens
A stream has partial progress and a final outcome. Applications decide how to handle already-consumed results when the call fails. The same distinction appears in downloads and database result streams.
