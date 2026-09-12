package roadmap_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/progress"
	"skills-tools/tutor/internal/roadmap"
	"skills-tools/tutor/internal/testutil"
)

// sample is a small roadmap covering every row shape: a linked course, a linked plan and a bare
// topic, plus one workshop. There are no branch topics, so that section must be omitted.
func sample() roadmap.Snapshot {
	return roadmap.Snapshot{
		Format:   1,
		Preamble: "Focus: databases and distributed systems.",
		Topics: []roadmap.Topic{
			{Slug: "postgresql", Title: "PostgreSQL", Track: "main", Status: "active", Course: "postgres-essentials",
				Followups: []roadmap.Followup{
					{Title: "Retryable command", Description: "drop a post-commit response", Chosen: true},
					{Title: "Lock watcher", Description: "watch a blocked update"},
				}},
			{Slug: "sqlite", Title: "SQLite", Track: "main", Status: "planned", Plan: "future-courses/sqlite/course.md"},
			{Slug: "docker-internals", Title: "Docker / container internals", Track: "main", Status: "planned"},
			{Slug: "strace", Title: "strace", Track: "workshop", Status: "deferred"},
		},
	}
}

func TestViewLayout(t *testing.T) {
	count := func(id string) roadmap.CourseCount {
		if id == "postgres-essentials" {
			return roadmap.CourseCount{Authored: 26, Total: 40, Done: 13, Known: true}
		}
		return roadmap.CourseCount{}
	}
	want := strings.Join([]string{
		"# Learning roadmap",
		"",
		"Focus: databases and distributed systems.",
		"",
		"## Main path",
		" 1. [active]   PostgreSQL — postgres-essentials: 26/40 authored, 13 done",
		" 2. [planned]  SQLite — plan: future-courses/sqlite/course.md",
		" 3. [planned]  Docker / container internals",
		"",
		"## Supporting workshops",
		" 1. [deferred] strace",
		"",
		"Show a topic: tutor roadmap show <slug>   (goals, diagram, optional Go follow-ups)",
	}, "\n")
	got := roadmap.View(sample(), count, false)
	if got != want {
		t.Fatalf("view mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
	if strings.Contains(got, "Optional branches") {
		t.Fatal("an empty track section was printed")
	}
	if strings.HasSuffix(got, "\n") {
		t.Fatal("the view must not end with a newline; the CLI prints it with Fprintln")
	}
}

func TestViewFollowups(t *testing.T) {
	got := roadmap.View(sample(), nil, true)
	want := []string{
		"   - [x] Retryable command: drop a post-commit response",
		"   - [ ] Lock watcher: watch a blocked update",
	}
	for _, line := range want {
		if !strings.Contains(got, line) {
			t.Fatalf("--followups output is missing %q:\n%s", line, got)
		}
	}
	// An unknown course prints the id without counts rather than inventing zeros.
	if !strings.Contains(got, " 1. [active]   PostgreSQL — postgres-essentials\n") {
		t.Fatalf("row for an unknown course id:\n%s", got)
	}
}

// TestViewCountsFixtureCourse links a topic to a fixture course with a temporary progress
// database and checks the "k/n authored, m done" counts the default counter produces.
func TestViewCountsFixtureCourse(t *testing.T) {
	f := testutil.NewCourse(t, 5)
	f.WritePlan(t, "Planned six / lesson-06", "Planned seven / lesson-07")
	dbPath := filepath.Join(f.CourseDir(), "progress.sqlite")

	counter := roadmap.DefaultCounter(f.Root)
	if got := counter("demo"); got != (roadmap.CourseCount{Authored: 5, Total: 7, Done: 0, Known: true}) {
		t.Fatalf("counts without a progress database = %+v", got)
	}
	if _, err := os.Stat(dbPath); !os.IsNotExist(err) {
		t.Fatalf("the roadmap view created %s", dbPath)
	}

	db, err := progress.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	lessons := make([]course.Lesson, 0, 5)
	for i := 1; i <= 5; i++ {
		lessons = append(lessons, testutil.Lesson(i))
	}
	if _, err := progress.Init(db, lessons); err != nil {
		t.Fatal(err)
	}
	for _, ordinal := range []int{1, 2, 3} {
		if err := progress.Done(db, ordinal, ""); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()

	if got := counter("demo"); got != (roadmap.CourseCount{Authored: 5, Total: 7, Done: 3, Known: true}) {
		t.Fatalf("counts = %+v, want 5/7 authored, 3 done", got)
	}
	if got := counter("no-such-course"); got.Known {
		t.Fatalf("unknown course id reported %+v", got)
	}

	snapshot := roadmap.Snapshot{Format: 1, Preamble: "p", Topics: []roadmap.Topic{
		{Slug: "demo", Title: "Demo", Track: "main", Status: "active", Course: "demo"},
	}}
	line := " 1. [active]   Demo — demo: 5/7 authored, 3 done"
	if got := roadmap.View(snapshot, counter, false); !strings.Contains(got, line) {
		t.Fatalf("view = %q, want a row %q", got, line)
	}
}

func TestShowText(t *testing.T) {
	topic := roadmap.Topic{
		Slug: "postgresql", Title: "PostgreSQL", Track: "main", Status: "active",
		Tool: "A client/server relational database.", Goals: "Build depth in transactions.",
		Diagram: "request -> COMMIT -> reply lost\nretry   -> operation ID -> existing result",
		Course:  "postgres-essentials", Notes: "Continue now.",
		Followups: []roadmap.Followup{
			{Title: "Retryable command", Description: "drop a post-commit response", Chosen: true},
			{Title: "Lock watcher", Description: "watch a blocked update"},
		},
	}
	want := strings.Join([]string{
		"# PostgreSQL",
		"",
		"**Slug:** postgresql | **Track:** main | **Status:** active",
		"",
		"## Tool",
		"A client/server relational database.",
		"",
		"## Goals",
		"Build depth in transactions.",
		"",
		"## Diagram",
		"```text",
		"request -> COMMIT -> reply lost",
		"retry   -> operation ID -> existing result",
		"```",
		"",
		"## Course",
		"postgres-essentials",
		"",
		"## Notes",
		"Continue now.",
		"",
		"## Optional Go follow-ups",
		" 1. [x] Retryable command: drop a post-commit response",
		" 2. [ ] Lock watcher: watch a blocked update",
	}, "\n")
	if got := roadmap.ShowText(topic); got != want {
		t.Fatalf("show mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}

	bare := roadmap.Topic{Slug: "kafka", Title: "Kafka", Track: "branch", Status: "planned", Plan: "future-courses/kafka/course.md"}
	got := roadmap.ShowText(bare)
	if strings.Contains(got, "```") || strings.Contains(got, "## Notes") || strings.Contains(got, "## Course") {
		t.Fatalf("empty fields were printed:\n%s", got)
	}
	if !strings.Contains(got, "## Plan\nfuture-courses/kafka/course.md") {
		t.Fatalf("plan link missing:\n%s", got)
	}
}

// TestShowCommittedTopic renders a real topic end to end, the way `tutor roadmap show` will.
func TestShowCommittedTopic(t *testing.T) {
	s := imported(t)
	topic, err := s.Show("postgresql")
	if err != nil {
		t.Fatal(err)
	}
	out := roadmap.ShowText(topic)
	for _, want := range []string{"# PostgreSQL", "**Status:** active", "## Course\npostgres-essentials", "```text"} {
		if !strings.Contains(out, want) {
			t.Fatalf("show output is missing %q:\n%s", want, out)
		}
	}
	if _, err := s.Show("nope"); err == nil {
		t.Fatal("show accepted an unknown slug")
	}
}
