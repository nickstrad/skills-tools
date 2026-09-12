import { code, type Module } from "../../../src/types.ts";
import { caution, failureHelp, setup, shellHelp } from "./common.ts";

export const PROTOBUF: Module = {
  category: "protobuf",
  title: "Protocol Buffers without a server",
  lessons: [
    {
      slug: "message-to-bytes",
      title: "Encode, inspect and decode a message",
      difficulty: "beginner",
      tags: ["protobuf", "wire-format"],
      estimatedMinutes: 10,
      overview: "Protocol Buffers defines message shapes in .proto files and encodes values as " +
        "binary data. Write one message to a file, inspect its bytes, and decode it with two field " +
        "names. No network or gRPC server is involved.",
      syntaxBreakdown: code`
### In plain terms
Turn a count and label into seven bytes, then recover the values. The number after a field's
equals sign in the schema is its stable identifier, not its default value.

### What you are learning
- A .proto file describes the message; an encoded file contains values.
- Binary protobuf identifies fields by number. A renamed field with the same number and type
  can read old bytes. Names still matter to generated code and JSON callers.

### Piece by piece
` + shellHelp + code`
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
`,
      setup,
      code: code`
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
`,
      expectedResult: code`
Hex: **08 96 01 12 02 68 69**. Schema-aware decoding prints **count: 150** and **label: "hi"**.
Raw decoding prints **1: 150** and treats field 2 as a nested message, **2 { 13: 105 }** (across
multiple lines). The bytes for hi happen to be valid nested-message bytes too: raw decoding cannot
know which interpretation was intended. The renamed schema prints **total: 150** and **label: "hi"**,
reading the unchanged file with its declared string type.

08 identifies field 1 with an integer wire representation; 96 01 encodes 150. 12 identifies field
2 with a length-delimited representation; 02 says two bytes follow, and 68 69 spells hi. This is
one encoding example, not a claim that all protobuf messages have canonical bytes.
`,
      systemsLens: "A schema is a contract for interpreting bytes. Protobuf works for files or " +
        "messages independently of gRPC; transport is a separate choice.",
      caution,
      safetyLevel: "writes-data",
      runIn: "shell",
    },
    {
      slug: "absent-versus-zero",
      title: "See the difference between absent and zero",
      difficulty: "beginner",
      prerequisites: ["message-to-bytes"],
      tags: ["protobuf", "field-presence"],
      estimatedMinutes: 8,
      overview:
        "An ordinary proto3 integer defaults to zero without recording whether the caller " +
        "supplied that zero. An optional integer records presence. Encode both to see the " +
        "distinction an update API may need between leaving a value alone and setting it to zero.",
      syntaxBreakdown: code`
### In plain terms
The fixture has an ordinary count and an optional limit. Serialize an empty message, count zero,
and limit zero, then compare their files and decoded output.

### What you are learning
- Implicit presence stores a scalar value without distinguishing an omitted default.
- Explicit presence, selected here with **optional**, distinguishes absence from a supplied zero.
  It enables an API convention; it does not implement update behavior on its own.

### Piece by piece
` + shellHelp + code`
- **printf ''** supplies empty text; **count: 0** and **limit: 0** supply the two scalar fields.
  **protoc -I ... --encode=wire.Record record.proto** selects the schema and writes binary.
  **>** saves each file and **<** supplies file input for decoding.
- **wc -c** counts bytes; paths vary per run. **cmp** succeeds silently for identical files.
  The following **printf** confirmation is reached only if that comparison succeeds.
- **od -An -tx1** displays bytes in hex without offsets. **--decode=wire.Record** recovers
  fields using the schema. Empty-file decoding would print no fields.
`,
      setup,
      code: code`
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
`,
      expectedResult: "Byte counts: 0 for absent.bin, 0 for implicit.bin, 2 for optional.bin " +
        "(2 total). The comparison succeeds. Optional zero encodes as 18 00 and decodes as limit: 0. " +
        "Tag 3 and the zero value remain present even though zero is the numeric default.",
      systemsLens: "Presence is part of an API contract: a default alone may not express whether " +
        "an update was requested. These are proto3 examples; Protobuf Editions has different defaults.",
      caution,
      safetyLevel: "writes-data",
      runIn: "shell",
    },
    {
      slug: "read-an-evolved-message",
      title: "Read a new message with an old schema",
      difficulty: "beginner",
      prerequisites: ["message-to-bytes"],
      tags: ["protobuf", "schema-evolution"],
      estimatedMinutes: 10,
      overview: "A deployed reader may have an older schema than its writer. Encode new fields, " +
        "read them using an older schema, and trigger a compiler error by reusing a reserved tag. " +
        "These checks help when reviewing a .proto change.",
      syntaxBreakdown: code`
### In plain terms
The new schema has count, label and limit; the old one knows only count. Decode with both, then
compile a deliberately invalid schema that reuses reserved tag 2.

### What you are learning
- An added field can preserve binary readability, but an old reader cannot act on an unfamiliar
  field. Business semantics still need compatibility review.
- **reserved 2** prevents tag 2 from being reassigned in that message. Reserve removed names too
  to guard name reuse; binary field identity itself is numeric.

### Piece by piece
` + shellHelp + failureHelp + code`
- **cat** shows the old/new schemas. **printf** supplies three values in protobuf text format.
  **protoc -I** selects a schema directory; **--encode=wire.Record** creates binary and
  **--decode=wire.Record** reads it with the independently chosen schema. **>** and **<** connect files.
- **--descriptor_set_out=FILE** asks protoc to compile schema metadata, rather than a message.
  The invalid schema fails first. The helper checks for **reserved** in the compiler error.
`,
      setup,
      code: code`
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
`,
      expectedResult: 'The old schema prints count: 7, 2: "new", and 3: 0. The current schema ' +
        'prints count: 7, label: "new", and limit: 0. The invalid schema reports that replacement ' +
        "uses reserved number 2 and returns nonzero. Numeric unknown fields show successful binary " +
        "parsing; they do not prove compatibility through a JSON intermediary.",
      systemsLens: "Readers and writers upgrade independently. Keep field numbers stable and " +
        "review binary, JSON and application compatibility separately.",
      caution,
      safetyLevel: "writes-data",
      runIn: "shell",
    },
  ],
};
