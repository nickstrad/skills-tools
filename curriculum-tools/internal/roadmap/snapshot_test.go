package roadmap_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/roadmap"
)

func writeTemp(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "roadmap.json")
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestReadSnapshotCommittedFile(t *testing.T) {
	s, err := roadmap.ReadSnapshot(snapshotFile)
	if err != nil {
		t.Fatal(err)
	}
	if s.Format != 1 || len(s.Topics) != 19 {
		t.Fatalf("format=%d topics=%d, want 1 and 19", s.Format, len(s.Topics))
	}
	tracks := map[string]int{}
	followups := 0
	for _, topic := range s.Topics {
		tracks[topic.Track]++
		followups += len(topic.Followups)
	}
	if tracks["main"] != 11 || tracks["workshop"] != 4 || tracks["branch"] != 4 {
		t.Fatalf("tracks = %v, want 11 main, 4 workshop, 4 branch", tracks)
	}
	if followups != 49 {
		t.Fatalf("follow-ups = %d, want 49", followups)
	}
	// The default paths the CLI passes must address this same file and its database sibling.
	if got := roadmap.SnapshotPath(".." + string(filepath.Separator) + ".."); filepath.Clean(got) != filepath.Clean(snapshotFile) {
		t.Fatalf("SnapshotPath = %q, want %q", got, snapshotFile)
	}
	if got := roadmap.DatabasePath("/root/curriculum-tools"); got != "/root/curriculum-tools/tutor.sqlite" {
		t.Fatalf("DatabasePath = %q", got)
	}
}

func TestReadSnapshotRejectsBadInput(t *testing.T) {
	cases := map[string]string{
		"unknown key":      `{"format":1,"preamble":"p","topics":[],"extra":1}`,
		"trailing data":    `{"format":1,"preamble":"p","topics":[]} {}`,
		"wrong format":     `{"format":2,"preamble":"p","topics":[]}`,
		"invalid track":    `{"format":1,"preamble":"p","topics":[{"slug":"a","title":"A","track":"side","status":"planned","tool":"","goals":"","diagram":"","course":"","plan":"","notes":"","followups":[]}]}`,
		"invalid status":   `{"format":1,"preamble":"p","topics":[{"slug":"a","title":"A","track":"main","status":"soon","tool":"","goals":"","diagram":"","course":"","plan":"","notes":"","followups":[]}]}`,
		"invalid slug":     `{"format":1,"preamble":"p","topics":[{"slug":"Not Ok","title":"A","track":"main","status":"planned","tool":"","goals":"","diagram":"","course":"","plan":"","notes":"","followups":[]}]}`,
		"duplicate slug":   `{"format":1,"preamble":"p","topics":[{"slug":"a","title":"A","track":"main","status":"planned","tool":"","goals":"","diagram":"","course":"","plan":"","notes":"","followups":[]},{"slug":"a","title":"B","track":"main","status":"planned","tool":"","goals":"","diagram":"","course":"","plan":"","notes":"","followups":[]}]}`,
		"missing title":    `{"format":1,"preamble":"p","topics":[{"slug":"a","title":"","track":"main","status":"planned","tool":"","goals":"","diagram":"","course":"","plan":"","notes":"","followups":[]}]}`,
		"not an object":    `[]`,
		"truncated object": `{"format":1,`,
	}
	for name, body := range cases {
		if _, err := roadmap.ReadSnapshot(writeTemp(t, body)); err == nil {
			t.Errorf("%s: ReadSnapshot accepted %s", name, body)
		}
	}
	if _, err := roadmap.ReadSnapshot(filepath.Join(t.TempDir(), "absent.json")); err == nil {
		t.Error("ReadSnapshot accepted a missing file")
	}
}

func TestMarshalSnapshotShape(t *testing.T) {
	data, err := roadmap.MarshalSnapshot(roadmap.Snapshot{Format: 1, Preamble: "a < b & c", Topics: []roadmap.Topic{
		{Slug: "a", Title: "A", Track: "main", Status: "planned"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	got := string(data)
	want := "{\n  \"format\": 1,\n  \"preamble\": \"a < b & c\",\n  \"topics\": [\n    {\n      \"slug\": \"a\",\n"
	if !strings.HasPrefix(got, want) {
		t.Fatalf("snapshot JSON = %q, want the two-space unescaped form", got)
	}
	if !strings.Contains(got, "\"followups\": []") {
		t.Fatalf("a topic without follow-ups must encode [] not null:\n%s", got)
	}
	if !strings.HasSuffix(got, "}\n") {
		t.Fatalf("snapshot JSON must end with one newline: %q", got[len(got)-5:])
	}
	empty, err := roadmap.MarshalSnapshot(roadmap.Snapshot{Format: 1})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(empty), "\"topics\": []") {
		t.Fatalf("an empty roadmap must encode topics as []:\n%s", empty)
	}
}
