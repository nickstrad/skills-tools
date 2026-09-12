# See the difference between absent and zero

slug: absent-versus-zero
category: protobuf
difficulty: beginner
tags: protobuf, field-presence
prerequisites: message-to-bytes
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 8
revision: 1

## Overview
An ordinary proto3 integer defaults to zero without recording whether the caller supplied that zero. An optional integer records presence. Encode both to see the distinction an update API may need between leaving a value alone and setting it to zero.

## Syntax breakdown
### In plain terms
The fixture has an ordinary count and an optional limit. Serialize an empty message, count zero,
and limit zero, then compare their files and decoded output.

### What you are learning
- Implicit presence stores a scalar value without distinguishing an omitted default.
- Explicit presence, selected here with **optional**, distinguishes absence from a supplied zero.
  It enables an API convention; it does not implement update behavior on its own.

### Piece by piece

- **source .../env.sh** loads the installed tools and cleanup helpers. Run the README's one-time
  installation first. **GRPC_COURSE** points to the course directory.
- **( ... )** creates a child shell. **set -euo pipefail** stops on an unexpected error, unset
  variable or failed pipeline without changing your parent shell's settings.
- **new_lab** creates a private temporary directory in **LAB** and registers an exit cleanup.
  The closing parenthesis stops the owned server and removes this experiment's temporary files.
  Rerun the whole block for fresh state.

- **printf ''** supplies empty text; **count: 0** and **limit: 0** supply the two scalar fields.
  **protoc -I ... --encode=wire.Record record.proto** selects the schema and writes binary.
  **>** saves each file and **<** supplies file input for decoding.
- **wc -c** counts bytes; paths vary per run. **cmp** succeeds silently for identical files.
  The following **printf** confirmation is reached only if that comparison succeeds.
- **od -An -tx1** displays bytes in hex without offsets. **--decode=wire.Record** recovers
  fields using the schema. Empty-file decoding would print no fields.

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
  printf '' | protoc -I "$GRPC_COURSE/lab/fixtures/current" --encode=wire.Record record.proto > "$LAB/absent.bin"
  printf 'count: 0\n' | protoc -I "$GRPC_COURSE/lab/fixtures/current" --encode=wire.Record record.proto > "$LAB/implicit.bin"
  printf 'limit: 0\n' | protoc -I "$GRPC_COURSE/lab/fixtures/current" --encode=wire.Record record.proto > "$LAB/optional.bin"
  wc -c "$LAB/absent.bin" "$LAB/implicit.bin" "$LAB/optional.bin"
  cmp "$LAB/absent.bin" "$LAB/implicit.bin"
  printf 'Absent and implicit zero have identical bytes.\n'
  od -An -tx1 "$LAB/optional.bin"
  protoc -I "$GRPC_COURSE/lab/fixtures/current" --decode=wire.Record record.proto < "$LAB/optional.bin"
)
```

## Expected result
Byte counts: 0 for absent.bin, 0 for implicit.bin, 2 for optional.bin (2 total). The comparison succeeds. Optional zero encodes as 18 00 and decodes as limit: 0. Tag 3 and the zero value remain present even though zero is the numeric default.

## Systems lens
Presence is part of an API contract: a default alone may not express whether an update was requested. These are proto3 examples; Protobuf Editions has different defaults.
