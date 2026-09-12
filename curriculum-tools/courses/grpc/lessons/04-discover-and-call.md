# Discover a service and call it with grpcurl

slug: discover-and-call
category: grpc
difficulty: beginner
tags: grpc, reflection, code-generation, schema-evolution
prerequisites: message-to-bytes
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 1

## Overview
gRPC defines callable service methods with typed request and response messages. Generate client/server interfaces from a supplied proto, then use grpcurl to inspect and call a real counter. Repeat without server reflection to practice using a local schema.

## Syntax breakdown
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
```

## Expected result
Generation produces AddRequest, CounterClient and CounterServer declarations (line numbers vary).
The service list contains **practice.Counter**, and describe shows Add, Get and Watch. First Add
returns **value: 2** in JSON. Restarting resets the counter. Listing now fails because reflection
is unsupported, but the legacy-schema call returns **value: 3** and the current-schema call returns
**value: 4**. Using increment with the current schema fails with **no known field named increment**
before the request reaches the handler. JSON uses quoted keys; whitespace can vary.

## Systems lens
Protobuf supplies the message contract and gRPC supplies method invocation. Discovery, binary field compatibility and the JSON accepted by a debugging tool are different boundaries, even when all three use one .proto file.
