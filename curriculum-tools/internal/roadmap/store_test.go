package roadmap_test

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/roadmap"

	_ "modernc.org/sqlite" // database/sql driver "sqlite", used to inspect stored positions
)

// snapshotFile is the committed roadmap that `tutor roadmap import` reads by default.
const snapshotFile = "../../roadmap/roadmap.json"

func newStore(t *testing.T) roadmap.Store {
	t.Helper()
	return roadmap.Store{Path: filepath.Join(t.TempDir(), "tutor.sqlite")}
}

// imported returns a store loaded with the committed roadmap.
func imported(t *testing.T) roadmap.Store {
	t.Helper()
	s := newStore(t)
	n, err := s.Import(snapshotFile, false)
	if err != nil {
		t.Fatal(err)
	}
	if n != 19 {
		t.Fatalf("imported %d topics, want 19", n)
	}
	return s
}

func slugs(t *testing.T, s roadmap.Store, track string) []string {
	t.Helper()
	snapshot, err := s.Load()
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, topic := range snapshot.Topics {
		if topic.Track == track {
			out = append(out, topic.Slug)
		}
	}
	return out
}

func TestImportExportRoundTripIsByteIdentical(t *testing.T) {
	s := imported(t)
	out := filepath.Join(t.TempDir(), "roadmap.json")
	if err := s.Export(out); err != nil {
		t.Fatal(err)
	}
	want, err := os.ReadFile(snapshotFile)
	if err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("export differs from %s (got %d bytes, want %d)", snapshotFile, len(got), len(want))
	}
	// No temporary export file is left behind.
	entries, err := os.ReadDir(filepath.Dir(out))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "roadmap.json" {
		t.Fatalf("export directory = %v, want only roadmap.json", entries)
	}
}

func TestImportRefusesNonEmptyDatabaseUnlessReplace(t *testing.T) {
	s := imported(t)
	if _, err := s.Import(snapshotFile, false); !errors.Is(err, roadmap.ErrNotEmpty) {
		t.Fatalf("second import error = %v, want ErrNotEmpty", err)
	}
	n, err := s.Import(snapshotFile, true)
	if err != nil {
		t.Fatalf("import --replace: %v", err)
	}
	if n != 19 {
		t.Fatalf("replace imported %d topics, want 19", n)
	}
	snapshot, err := s.Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Topics) != 19 {
		t.Fatalf("after --replace the database has %d topics, want 19", len(snapshot.Topics))
	}
	if got := len(slugs(t, s, "main")); got != 11 {
		t.Fatalf("main track has %d topics, want 11", got)
	}
}

func TestLoadMissingDatabaseCreatesNothing(t *testing.T) {
	dir := t.TempDir()
	s := roadmap.Store{Path: filepath.Join(dir, "tutor.sqlite")}
	if _, err := s.Load(); !errors.Is(err, roadmap.ErrNoRoadmap) {
		t.Fatalf("Load error = %v, want ErrNoRoadmap", err)
	}
	if _, err := s.Show("postgresql"); !errors.Is(err, roadmap.ErrNoRoadmap) {
		t.Fatalf("Show error = %v, want ErrNoRoadmap", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("read-only roadmap commands created %v", entries)
	}
	if roadmap.ErrNoRoadmap.Error() != "No roadmap yet: run tutor roadmap import" {
		t.Fatalf("ErrNoRoadmap message = %q", roadmap.ErrNoRoadmap)
	}
}

func TestAddMoveRemoveKeepPositionsDense(t *testing.T) {
	s := imported(t)
	topic := roadmap.Topic{Slug: "nats-bench", Title: "NATS benchmarking", Track: "workshop", Tool: "nats bench", Goals: "Measure it."}
	got, err := s.Add(topic, "fio")
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "planned" {
		t.Fatalf("new topic status = %q, want planned", got.Status)
	}
	assertDense(t, s, "workshop")
	if want := []string{"strace", "fio", "nats-bench", "perf", "bpftrace"}; !equal(slugs(t, s, "workshop"), want) {
		t.Fatalf("after add --after fio: %v, want %v", slugs(t, s, "workshop"), want)
	}

	if _, err := s.Add(roadmap.Topic{Slug: "nats-bench", Title: "dup", Track: "workshop"}, ""); err == nil {
		t.Fatal("adding a duplicate slug succeeded")
	}
	if _, err := s.Add(roadmap.Topic{Slug: "tail-latency", Title: "Tail latency", Track: "nowhere"}, ""); err == nil {
		t.Fatal("adding an invalid track succeeded")
	}

	if _, err := s.Move("nats-bench", "", true); err != nil {
		t.Fatal(err)
	}
	assertDense(t, s, "workshop")
	if want := []string{"nats-bench", "strace", "fio", "perf", "bpftrace"}; !equal(slugs(t, s, "workshop"), want) {
		t.Fatalf("after move --first: %v, want %v", slugs(t, s, "workshop"), want)
	}

	if _, err := s.Move("nats-bench", "bpftrace", false); err != nil {
		t.Fatal(err)
	}
	assertDense(t, s, "workshop")
	if want := []string{"strace", "fio", "perf", "bpftrace", "nats-bench"}; !equal(slugs(t, s, "workshop"), want) {
		t.Fatalf("after move --after bpftrace: %v, want %v", slugs(t, s, "workshop"), want)
	}
	if _, err := s.Move("nats-bench", "postgresql", false); err == nil {
		t.Fatal("moving after a topic in another track succeeded")
	}
	if _, err := s.Move("nats-bench", "fio", true); err == nil {
		t.Fatal("move accepted both --after and --first")
	}

	removed, err := s.Remove("fio")
	if err != nil {
		t.Fatal(err)
	}
	if removed.Slug != "fio" || len(removed.Followups) != 2 {
		t.Fatalf("removed topic = %+v, want fio with 2 follow-ups", removed)
	}
	assertDense(t, s, "workshop")
	if want := []string{"strace", "perf", "bpftrace", "nats-bench"}; !equal(slugs(t, s, "workshop"), want) {
		t.Fatalf("after remove: %v, want %v", slugs(t, s, "workshop"), want)
	}
	if _, err := s.Remove("fio"); err == nil {
		t.Fatal("removing an unknown topic succeeded")
	}
	if got := len(slugs(t, s, "main")); got != 11 {
		t.Fatalf("workshop edits changed the main track: %d topics", got)
	}
}

// assertDense checks the invariant the roadmap relies on: positions 1..n with no gaps per track.
func assertDense(t *testing.T, s roadmap.Store, track string) {
	t.Helper()
	positions := readPositions(t, s, track)
	for i, p := range positions {
		if p != i+1 {
			t.Fatalf("track %s positions = %v, want dense 1..%d", track, positions, len(positions))
		}
	}
}

func TestSetStatusAndNote(t *testing.T) {
	s := imported(t)
	bogus := "bogus"
	if _, err := s.Set("postgresql", &bogus, nil); err == nil {
		t.Fatal("set --status bogus was accepted")
	} else if !strings.Contains(err.Error(), "planned|active|done|deferred") {
		t.Fatalf("error = %v, want the list of valid statuses", err)
	}
	done := "done"
	note := "finished the essentials route"
	got, err := s.Set("postgresql", &done, &note)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "done" || got.Notes != note {
		t.Fatalf("set returned %+v", got)
	}
	if _, err := s.Set("postgresql", nil, nil); err == nil {
		t.Fatal("set with no changes was accepted")
	}
	if _, err := s.Set("nope", &done, nil); err == nil {
		t.Fatal("set on an unknown topic was accepted")
	}
}

func TestEditFields(t *testing.T) {
	s := imported(t)
	got, err := s.Edit("sqlite", map[string]string{"title": "SQLite internals", "course": "sqlite-essentials", "plan": "", "diagram": "page -> btree"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "SQLite internals" || got.Course != "sqlite-essentials" || got.Plan != "" || got.Diagram != "page -> btree" {
		t.Fatalf("edit returned %+v", got)
	}
	if _, err := s.Edit("sqlite", map[string]string{"status": "done"}); err == nil {
		t.Fatal("edit accepted an unknown field")
	}
	if _, err := s.Edit("sqlite", nil); err == nil {
		t.Fatal("edit with no changes was accepted")
	}
}

func TestFollowups(t *testing.T) {
	s := imported(t)
	topic, err := s.FollowupAdd("etcd", "Lease keeper", "hold a lease across a restart")
	if err != nil {
		t.Fatal(err)
	}
	if len(topic.Followups) != 4 || topic.Followups[3].Title != "Lease keeper" {
		t.Fatalf("follow-ups after add = %+v", topic.Followups)
	}
	if _, err := s.FollowupAdd("etcd", "", "no title"); err == nil {
		t.Fatal("a follow-up without a title was accepted")
	}

	topic, err = s.FollowupChoose("etcd", 2)
	if err != nil {
		t.Fatal(err)
	}
	assertChosen(t, topic, 2)
	topic, err = s.FollowupChoose("etcd", 4)
	if err != nil {
		t.Fatal(err)
	}
	assertChosen(t, topic, 4)
	if _, err := s.FollowupChoose("etcd", 9); err == nil {
		t.Fatal("choosing a follow-up out of range succeeded")
	}
	if _, err := s.FollowupChoose("etcd", 0); err == nil {
		t.Fatal("choosing follow-up 0 succeeded")
	}

	topic, err = s.FollowupRemove("etcd", 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(topic.Followups) != 3 {
		t.Fatalf("follow-ups after remove = %d, want 3", len(topic.Followups))
	}
	assertChosen(t, topic, 3) // the chosen one moved from 4 to 3
	if topic.Followups[2].Title != "Lease keeper" {
		t.Fatalf("follow-up order after remove = %+v", topic.Followups)
	}
}

// assertChosen checks that exactly the nth follow-up (1-based) is marked chosen.
func assertChosen(t *testing.T, topic roadmap.Topic, n int) {
	t.Helper()
	for i, f := range topic.Followups {
		if want := i+1 == n; f.Chosen != want {
			t.Fatalf("follow-up %d chosen = %v, want %v (expected only %d chosen)", i+1, f.Chosen, want, n)
		}
	}
}

func TestStaleExportNote(t *testing.T) {
	s := imported(t)
	file := filepath.Join(t.TempDir(), "roadmap.json")
	if _, ok := s.StaleExportNote(file); !ok {
		t.Fatal("a missing snapshot file should ask for an export")
	}
	if err := s.Export(file); err != nil {
		t.Fatal(err)
	}
	if note, ok := s.StaleExportNote(file); ok {
		t.Fatalf("a freshly exported snapshot is not stale, got %q", note)
	}
	active := "active"
	if _, err := s.Set("sqlite", &active, nil); err != nil {
		t.Fatal(err)
	}
	note, ok := s.StaleExportNote(file)
	if !ok || note != "Note: run tutor roadmap export to update roadmap.json" {
		t.Fatalf("after a mutation: note=%q ok=%v", note, ok)
	}
	if err := s.Export(file); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.StaleExportNote(file); ok {
		t.Fatal("exporting again should clear the note")
	}
	// Without a roadmap database there is nothing to export.
	empty := roadmap.Store{Path: filepath.Join(t.TempDir(), "tutor.sqlite")}
	if _, ok := empty.StaleExportNote(file); ok {
		t.Fatal("a missing roadmap database should print no export note")
	}
}

func TestExportRewritesAnExistingFile(t *testing.T) {
	s := imported(t)
	file := filepath.Join(t.TempDir(), "roadmap.json")
	if err := os.WriteFile(file, []byte("stale\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := s.Export(file); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(data), "{\n  \"format\": 1,") {
		t.Fatalf("export did not replace the file: %.40q", data)
	}
	reread, err := roadmap.ReadSnapshot(file)
	if err != nil {
		t.Fatal(err)
	}
	if len(reread.Topics) != 19 {
		t.Fatalf("re-read %d topics", len(reread.Topics))
	}
}

// readPositions reads the stored positions of one track directly, checking the table invariant
// rather than the API's output order.
func readPositions(t *testing.T, s roadmap.Store, track string) []int {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+s.Path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	rows, err := db.Query("SELECT position FROM roadmap_topics WHERE track=? ORDER BY position", track)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []int
	for rows.Next() {
		var p int
		if err := rows.Scan(&p); err != nil {
			t.Fatal(err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
