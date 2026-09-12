package cli

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/progress"
)

// TestProgressConsolidate moves a per-course fixture database into tutor.sqlite through the CLI
// and checks that the course verbs then see the copied history under the default path.
func TestProgressConsolidate(t *testing.T) {
	x := newFixture(t)
	legacy := filepath.Join(x.f.Root, "courses", "demo", "progress.sqlite")
	db, err := sql.Open("sqlite", "file:"+legacy+"?_pragma=journal_mode(WAL)")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(progress.LegacySchema); err != nil {
		t.Fatal(err)
	}
	insert := `INSERT INTO lessons(id,ordinal,slug,title,category,difficulty,tags,overview,syntax_breakdown,code,expected_result,systems_lens,safety_level,run_in,min_version,estimated_minutes,revision)
		VALUES(?,?,?,?,'intro','beginner',',demo,','o','s','c','e','l','read-only','shell','5.1',5,1)`
	for i := 1; i <= 3; i++ {
		if _, err := db.Exec(insert, i, i, x.f.Lessons[i-1].Slug, x.f.Lessons[i-1].Title); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec("INSERT INTO progress(lesson_id,status,completed_revision,completed_at,notes) VALUES(2,'done',1,'2026-03-03T00:00:00.000Z','kept')"); err != nil {
		t.Fatal(err)
	}
	db.Close()

	backup := filepath.Join(x.f.Root, ".cache", "legacy-progress", "demo")
	x.check(t, step{name: "consolidate", args: []string{"progress", "consolidate"},
		out: "demo: 3 lessons, 1 progress rows, 0 attempts; legacy files moved to " + backup + "\n" +
			"Consolidated 1 course(s) into {root}/tutor.sqlite\n"})
	if _, err := os.Stat(legacy); !os.IsNotExist(err) {
		t.Fatal("legacy file still in place")
	}
	if _, err := os.Stat(filepath.Join(backup, "progress.sqlite")); err != nil {
		t.Fatal(err)
	}
	out, _, code := x.run("demo", "route")
	if code != 0 || !strings.Contains(out, "2. [done] ") {
		t.Fatalf("route after consolidate (exit %d):\n%s", code, out)
	}
	x.check(t, step{name: "consolidate again", args: []string{"progress", "consolidate"},
		out: "demo: skipped (no legacy database at " + legacy + ")\nConsolidated 0 course(s) into {root}/tutor.sqlite\n"})
	// init refreshes the catalog in place and the copied note survives.
	x.check(t, step{name: "init", args: []string{"demo", "init"}, out: "Initialized 9 Demo Course lessons in {root}/tutor.sqlite\n"})
	out, _, code = x.run("demo", "lesson", "2", "--json")
	if code != 0 || !strings.Contains(out, `"notes": "kept"`) || !strings.Contains(out, `"status": "done"`) {
		t.Fatalf("lesson 2 after init (exit %d):\n%s", code, out)
	}
	x.check(t, step{name: "usage", args: []string{"progress"}, err: "Error: usage: tutor progress consolidate [--db PATH] [--from-dir DIR] [--backup-dir DIR] [--replace]\n", code: 2})
}
