# Encode, inspect and decode a message

slug: message-to-bytes
category: protobuf
difficulty: beginner
tags: protobuf, wire-format
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 1

## Overview
Protocol Buffers defines message shapes in .proto files and encodes values as binary data. Write one message to a file, inspect its bytes, and decode it with two field names. No network or gRPC server is involved.

## Syntax breakdown
### In plain terms
Turn a count and label into seven bytes, then recover the values. The number after a field's
equals sign in the schema is its stable identifier, not its default value.

### What you are learning
- A .proto file describes the message; an encoded file contains values.
- Binary protobuf identifies fields by number. A renamed field with the same number and type
  can read old bytes. Names still matter to generated code and JSON callers.

### Piece by piece

- **source .../env.sh** loads the installed tools and cleanup helpers. Run the README's one-time
  installation first. **GRPC_COURSE** points to the course directory.
- **( ... )** creates a child shell. **set -euo pipefail** stops on an unexpected error, unset
  variable or failed pipeline without changing your parent shell's settings.
- **new_lab** creates a private temporary directory in **LAB** and registers an exit cleanup.
  The closing parenthesis stops the owned server and removes this experiment's temporary files.
  Rerun the whole block for fresh state.

- **cat** prints the schema. **syntax = "proto3"** selects the schema language, **package wire**
  qualifies the type name, and **message Record** groups fields. **int32** is an integer, **string**
  is text, and **optional** records explicit presence (lesson 2). The numbers 1, 2 and 3 are tags.
- **printf** supplies protobuf text format. A pipe feeds it to **protoc**, the compiler, which
  can also encode/decode messages. **-I DIRECTORY** selects where it finds **record.proto**.
  **--encode=wire.Record** writes binary stdout; **>** saves it to a file.
- **od -An -tx1** displays bytes: **-An** hides offsets and **-tx1** prints hexadecimal bytes.
- **--decode=wire.Record** reads binary using the named schema; **<** supplies file input.
  **--decode_raw** prints numeric tags without a schema. It cannot recover names or always
  distinguish types that share a wire representation.

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
  cat "$GRPC_COURSE/lab/fixtures/current/record.proto"
  printf 'count: 150 label: "hi"\n' |
    protoc -I "$GRPC_COURSE/lab/fixtures/current" --encode=wire.Record record.proto > "$LAB/message.bin"
  od -An -tx1 "$LAB/message.bin"
  protoc -I "$GRPC_COURSE/lab/fixtures/current" --decode=wire.Record record.proto < "$LAB/message.bin"
  protoc --decode_raw < "$LAB/message.bin"
  protoc -I "$GRPC_COURSE/lab/fixtures/renamed" --decode=wire.Record record.proto < "$LAB/message.bin"
)
```

## Expected result
Hex: **08 96 01 12 02 68 69**. Schema-aware decoding prints **count: 150** and **label: "hi"**.
Raw decoding prints **1: 150** and treats field 2 as a nested message, **2 { 13: 105 }** (across
multiple lines). The bytes for hi happen to be valid nested-message bytes too: raw decoding cannot
know which interpretation was intended. The renamed schema prints **total: 150** and **label: "hi"**,
reading the unchanged file with its declared string type.

08 identifies field 1 with an integer wire representation; 96 01 encodes 150. 12 identifies field
2 with a length-delimited representation; 02 says two bytes follow, and 68 69 spells hi. This is
one encoding example, not a claim that all protobuf messages have canonical bytes.

## Systems lens
A schema is a contract for interpreting bytes. Protobuf works for files or messages independently of gRPC; transport is a separate choice.
