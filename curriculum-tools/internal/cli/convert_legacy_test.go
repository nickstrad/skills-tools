package cli

// TestConvertedLessonsMatchLegacyCatalog is deleted in WP8.1 together with the legacy
// courses/<id>/lessons.json catalogs it reads: it exists only to prove that the one-time
// conversion to Markdown lesson files (via ConvertLegacy) was lossless, by comparing every
// decoded legacy lesson against course.LoadLessons's parse of the converted Markdown files.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/testutil"
)

var legacyCourseIDs = []string{"grpc", "linux", "postgres", "postgres-essentials", "sqlite"}

// repoRoot returns the curriculum-tools directory two levels above this test file
// (internal/cli/convert_legacy_test.go -> curriculum-tools).
func repoRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Join(wd, "..", "..")
}

func TestConvertedLessonsMatchLegacyCatalog(t *testing.T) {
	root := repoRoot(t)
	for _, id := range legacyCourseIDs {
		id := id
		t.Run(id, func(t *testing.T) {
			legacyFile := filepath.Join(root, "courses", id, "lessons.json")
			data, err := os.ReadFile(legacyFile)
			if err != nil {
				t.Fatalf("read %s: %v", legacyFile, err)
			}
			legacy, err := decodeLessonsStrict(data)
			if err != nil {
				t.Fatalf("decode %s: %v", legacyFile, err)
			}
			got, err := course.LoadLessons(root, id)
			if err != nil {
				t.Fatalf("LoadLessons(%s): %v", id, err)
			}
			if len(got) != len(legacy) {
				t.Fatalf("%s: got %d converted lessons, legacy catalog has %d", id, len(got), len(legacy))
			}
			for i := range legacy {
				if !reflect.DeepEqual(got[i], legacy[i]) {
					t.Errorf("%s lesson %d (%s): converted lesson does not match legacy catalog\n got:  %+v\nlegacy: %+v",
						id, legacy[i].Ordinal, legacy[i].Slug, got[i], legacy[i])
				}
			}
		})
	}
}

func writeJSONFile(t *testing.T, path string, v any) {
	t.Helper()
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestConvertLegacyRefusesWhenLessonsDirExists(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "courses", "demo")
	if err := os.MkdirAll(filepath.Join(dir, "lessons"), 0o755); err != nil {
		t.Fatal(err)
	}
	// A minimal lessons.json is present too, so the only reason ConvertLegacy can fail is the
	// pre-existing lessons/ directory.
	writeJSONFile(t, filepath.Join(dir, "lessons.json"), []course.Lesson{})

	if n, err := ConvertLegacy(root, "demo"); err == nil {
		t.Fatalf("ConvertLegacy: want error because lessons/ already exists, got n=%d, err=nil", n)
	}
}

func TestConvertLegacyWritesExpectedFileNames(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "courses", "demo")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	c := course.Course{
		ID: "demo", Name: "Demo Course", Description: "A synthetic course", Tool: "bash",
		MinVersion: "5.1", Revision: 1,
	}
	writeJSONFile(t, filepath.Join(dir, "course.json"), c)

	l1 := testutil.Lesson(1)
	l2 := testutil.Lesson(2) // Prerequisites: []int{1}, an ordinal per the legacy format
	writeJSONFile(t, filepath.Join(dir, "lessons.json"), []course.Lesson{l1, l2})

	n, err := ConvertLegacy(root, "demo")
	if err != nil {
		t.Fatalf("ConvertLegacy: %v", err)
	}
	if n != 2 {
		t.Fatalf("ConvertLegacy: got n=%d, want 2", n)
	}

	names, err := course.LessonFiles(root, "demo")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{course.FileName(1, l1.Slug), course.FileName(2, l2.Slug)}
	if !reflect.DeepEqual(names, want) {
		t.Fatalf("LessonFiles: got %v, want %v", names, want)
	}

	got, err := course.LoadLessons(root, "demo")
	if err != nil {
		t.Fatalf("LoadLessons: %v", err)
	}
	want2 := []course.Lesson{l1, l2}
	if !reflect.DeepEqual(got, want2) {
		t.Fatalf("LoadLessons round trip mismatch:\n got:  %+v\nwant: %+v", got, want2)
	}
}
