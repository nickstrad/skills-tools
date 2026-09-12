// Package render turns course/lesson/route data into the exact Markdown, JSON and terminal
// output strings the CLI prints. Every format is a byte-for-byte port of the Deno engine
// (curriculum-tools/src/main.ts and src/route.ts); see docs/AUTHORING.md and plan.md §3.3.
package render

import (
	"bytes"
	"encoding/json"
	"reflect"
)

// JSON renders v the way Deno's JSON.stringify(v, null, 2) does: two-space indent, no HTML
// escaping and no trailing newline. A nil slice at the top level (e.g. render.JSON([]Topic(nil)))
// is encoded as "[]", matching JSON.stringify([]) rather than encoding/json's default "null" —
// this is the normalization the CLI relies on for empty list/topics/modules/courses results.
// Fields nested inside structs or maps are each helper's own responsibility to normalize (the
// LessonRecord builder in this package already does so for its Tags field).
func JSON(v any) ([]byte, error) {
	if rv := reflect.ValueOf(v); rv.Kind() == reflect.Slice && rv.IsNil() {
		v = reflect.MakeSlice(rv.Type(), 0, 0).Interface()
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	// json.Encoder.Encode always appends a trailing newline; the CLI adds its own with Fprintln.
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}
