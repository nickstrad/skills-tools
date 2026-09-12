# Check what happened before retrying a timeout

slug: timeout-and-retry
category: grpc
difficulty: intermediate
tags: grpc, deadlines, retries, idempotency
prerequisites: discover-and-call
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 15
revision: 1

## Overview
The counter can apply a change immediately and delay its reply. Give the client a shorter deadline, read the actual counter, and repeat the call. Then repeat with a stable request ID to see the service suppress the duplicate effect.

## Syntax breakdown
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

- **-max-time 0.5** bounds the grpcurl call to half a second. **replyDelayMs: 1500** asks this
  fixture to wait 1.5 seconds after applying the effect; it is not a built-in gRPC setting.
- **Get** reads current counter state independently of the failed response. Retrying with only
  **amount** performs another increment because no identity connects the two calls.
- **start_server** resets this disposable server for the second trial. **requestId: "job-42"**
  identifies the operation; keep it unchanged on retry. The fixture records IDs and amounts under
  the same mutex as the counter update. A duplicate skips the effect and delayed reply.
- **cat "$LAB/server.log"** shows actual handler decisions, including duplicate true/false.
  Timestamps vary. AlreadyExists means this fixture saw that ID with a different amount.

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
```

## Expected result
Trial 1: **DeadlineExceeded**, Get **value: 1**, retry **value: 2**, Get **value: 2**. The log
records two effects with empty request IDs and duplicate=false.

Trial 2 starts with a fresh server: **DeadlineExceeded**, Get **value: 1**, retry **value: 1**
with **deduplicated: true**. Reusing job-42 with amount 2 reports **AlreadyExists**. Final Get is
still **value: 1**, and the log contains duplicate=true. Cancellation log timing can vary, but
these counter values and statuses should not. If the first Get is not 1, the delayed request did
not reach the intended effect before timeout; rerun the fresh block on an unloaded machine.

## Systems lens
An RPC timeout does not establish rollback. These are manual retries; grpcurl is not automatically retrying for us. This fixture deduplicates only during one running server lifetime and returns current counter state. A production API needs explicit durability, retention and response-replay semantics for its idempotency contract.
