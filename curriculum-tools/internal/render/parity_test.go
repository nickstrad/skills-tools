package render_test

// Parity gate A (plan WP1.4): render every lesson of every course from the Markdown lesson files
// and compare with the Deno engine's golden output. Depends on /root/tutor-migration/golden and is
// skipped when that corpus is absent; removed with the corpus at the end of the migration.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/render"
)

func TestParityGateARenderFromFiles(t *testing.T) {
	golden := "/root/tutor-migration/golden"
	if _, err := os.Stat(golden); err != nil {
		t.Skip("golden corpus not present")
	}
	root, _ := filepath.Abs("../..")
	total := 0
	for _, id := range []string{"grpc", "linux", "postgres", "postgres-essentials", "sqlite"} {
		c, err := course.LoadCourse(root, id)
		if err != nil {
			t.Fatal(err)
		}
		lessons, err := course.LoadLessons(root, id)
		if err != nil {
			t.Fatal(err)
		}
		dbFlag := filepath.Join(golden, id, "db-init", "progress.sqlite")
		for _, l := range lessons {
			base := filepath.Join(golden, id, "lesson-"+strings.TrimSuffix(course.FileName(l.Ordinal, "x"), "-x.md"))
			wantMD, err := os.ReadFile(base + ".md")
			if err != nil {
				t.Fatalf("%s: %v", id, err)
			}
			wantJSON, err := os.ReadFile(base + ".json")
			if err != nil {
				t.Fatal(err)
			}
			var status struct {
				Status string `json:"status"`
				Notes  string `json:"notes"`
			}
			if err := json.Unmarshal(wantJSON, &status); err != nil {
				t.Fatal(err)
			}
			gotMD := render.RenderLesson(c, l, status.Notes, dbFlag) + "\n"
			if gotMD != string(wantMD) {
				t.Errorf("%s lesson %d: Markdown differs from golden", id, l.Ordinal)
				continue
			}
			gotJSON, err := render.LessonJSON(l, status.Status, status.Notes)
			if err != nil {
				t.Fatal(err)
			}
			if string(gotJSON)+"\n" != string(wantJSON) {
				t.Errorf("%s lesson %d: JSON differs from golden", id, l.Ordinal)
			}
			total++
		}
	}
	if total != 250 {
		t.Fatalf("compared %d lessons, want 250", total)
	}
	t.Logf("parity gate A: %d lessons byte-identical (Markdown and JSON)", total)
}
