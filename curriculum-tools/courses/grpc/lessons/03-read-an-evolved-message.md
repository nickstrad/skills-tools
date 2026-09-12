# Read a new message with an old schema

slug: read-an-evolved-message
category: protobuf
difficulty: beginner
tags: protobuf, schema-evolution
prerequisites: message-to-bytes
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 1

## Overview
A deployed reader may have an older schema than its writer. Encode new fields, read them using an older schema, and trigger a compiler error by reusing a reserved tag. These checks help when reviewing a .proto change.

## Syntax breakdown
### In plain terms
The new schema has count, label and limit; the old one knows only count. Decode with both, then
compile a deliberately invalid schema that reuses reserved tag 2.

### What you are learning
- An added field can preserve binary readability, but an old reader cannot act on an unfamiliar
  field. Business semantics still need compatibility review.
- **reserved 2** prevents tag 2 from being reassigned in that message. Reserve removed names too
  to guard name reuse; binary field identity itself is numeric.

### Piece by piece

- **source .../env.sh** loads the installed tools and cleanup helpers. Run the README's one-time
  installation first. **GRPC_COURSE** points to the course directory.
- **( ... )** creates a child shell. **set -euo pipefail** stops on an unexpected error, unset
  variable or failed pipeline without changing your parent shell's settings.
- **new_lab** creates a private temporary directory in **LAB** and registers an exit cleanup.
  The closing parenthesis stops the owned server and removes this experiment's temporary files.
  Rerun the whole block for fresh state.

- **expect_failure TEXT COMMAND...** runs the command, displays output and exit status, and checks
  that it failed with the named text. An unexpected success or different error stops the experiment.
  This helper lets deliberate errors coexist with **set -e**.

- **cat** shows the old/new schemas. **printf** supplies three values in protobuf text format.
  **protoc -I** selects a schema directory; **--encode=wire.Record** creates binary and
  **--decode=wire.Record** reads it with the independently chosen schema. **>** and **<** connect files.
- **--descriptor_set_out=FILE** asks protoc to compile schema metadata, rather than a message.
  The invalid schema fails first. The helper checks for **reserved** in the compiler error.

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
  cat "$GRPC_COURSE/lab/fixtures/old/record.proto" "$GRPC_COURSE/lab/fixtures/current/record.proto"
  printf 'count: 7 label: "new" limit: 0\n' |
    protoc -I "$GRPC_COURSE/lab/fixtures/current" --encode=wire.Record record.proto > "$LAB/new.bin"
  protoc -I "$GRPC_COURSE/lab/fixtures/old" --decode=wire.Record record.proto < "$LAB/new.bin"
  protoc -I "$GRPC_COURSE/lab/fixtures/current" --decode=wire.Record record.proto < "$LAB/new.bin"
  cat "$GRPC_COURSE/lab/fixtures/reserved/record.proto"
  expect_failure reserved protoc -I "$GRPC_COURSE/lab/fixtures/reserved" --descriptor_set_out="$LAB/invalid.pb" record.proto
)
```

## Expected result
The old schema prints count: 7, 2: "new", and 3: 0. The current schema prints count: 7, label: "new", and limit: 0. The invalid schema reports that replacement uses reserved number 2 and returns nonzero. Numeric unknown fields show successful binary parsing; they do not prove compatibility through a JSON intermediary.

## Systems lens
Readers and writers upgrade independently. Keep field numbers stable and review binary, JSON and application compatibility separately.
