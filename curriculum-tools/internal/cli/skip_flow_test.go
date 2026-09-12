package cli

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"skills-tools/tutor/internal/route"
)

func TestSkipRouteAndNext(t *testing.T) {
	x := newFixture(t)
	run := func(args ...string) string {
		t.Helper()
		out, stderr, code := x.run(append(args, "--db", x.db)...)
		if code != 0 {
			t.Fatalf("%v: %d %s", args, code, stderr)
		}
		return out
	}
	run("demo", "init")
	run("demo", "1", "skip", "--note", "a note with 'quotes'")
	run("demo", "done", "2")
	before, err := os.ReadFile(x.db)
	if err != nil {
		t.Fatal(err)
	}
	for _, flag := range []string{"--plain", "--ansi"} {
		out := run("demo", "route", flag)
		if !strings.Contains(out, "[skipped]") || !strings.Contains(out, "[done]") || !strings.Contains(out, "1 done") {
			t.Fatalf("%s route missing distinct states: %s", flag, out)
		}
	}
	var r route.Route
	if err := json.Unmarshal([]byte(run("demo", "route", "--json")), &r); err != nil {
		t.Fatal(err)
	}
	if !r.Lessons[0].Skipped || r.Lessons[0].Done || r.Lessons[0].Stale || !r.Lessons[1].Done || r.Lessons[9].Skipped {
		t.Fatalf("route states: %+v", r.Lessons)
	}
	var status struct{ Done, Skipped, Todo int }
	if err := json.Unmarshal([]byte(run("demo", "status", "--json")), &status); err != nil {
		t.Fatal(err)
	}
	if status.Done != 1 || status.Skipped != 1 || status.Todo != 7 {
		t.Fatalf("counts: %+v", status)
	}
	var next struct{ Ordinal int }
	if err := json.Unmarshal([]byte(run("demo", "lesson", "--json")), &next); err != nil {
		t.Fatal(err)
	}
	if next.Ordinal != 3 {
		t.Fatalf("next = %d", next.Ordinal)
	}
	for _, number := range []string{"1", "2"} {
		if out := run("demo", number, "lesson", "--plain"); !strings.Contains(out, "# Lesson "+number+":") {
			t.Fatalf("explicit access failed: %s", out)
		}
	}
	after, err := os.ReadFile(x.db)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("display mutated progress")
	}
	run("demo", "undone", "1")
	if err := json.Unmarshal([]byte(run("demo", "lesson", "--json")), &next); err != nil {
		t.Fatal(err)
	}
	if next.Ordinal != 1 {
		t.Fatalf("undone failed to restore next: %d", next.Ordinal)
	}
	run("demo", "skip", "1")
	if err := json.Unmarshal([]byte(run("demo", "lesson", "--json")), &next); err != nil {
		t.Fatal(err)
	}
	if next.Ordinal != 3 {
		t.Fatalf("verb-first skip failed: %d", next.Ordinal)
	}
}
