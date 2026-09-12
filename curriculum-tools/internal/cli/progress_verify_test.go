package cli

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/progress"
	"skills-tools/tutor/internal/route"
	"skills-tools/tutor/internal/testutil"
)

func TestProgressVerifyPreservesReorderedCourseAndOtherCourse(t *testing.T) {
	f := testutil.NewCourse(t, 3)
	f.WritePlan(t)
	writeSecondCourse(t, f, f.Lessons)
	dbPath := filepath.Join(t.TempDir(), "tutor.sqlite")
	db, err := progress.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := progress.Init(db, "demo", f.Lessons); err != nil {
		t.Fatal(err)
	}
	if _, err := progress.Init(db, "other", f.Lessons); err != nil {
		t.Fatal(err)
	}
	if err := progress.Done(db, "demo", 2, "kept"); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	removeSidecars(t, dbPath)

	// Reorder the named course while keeping the same stable slugs. The plan follows the new order,
	// so verify checks both route validity and identity preservation before seeding the copy.
	reordered := []course.Lesson{f.Lessons[2], f.Lessons[0], f.Lessons[1]}
	for i := range reordered {
		_ = os.Remove(filepath.Join(f.CourseDir(), "lessons", course.FileName(reordered[i].Ordinal, reordered[i].Slug)))
		reordered[i].Ordinal = i + 1
		reordered[i].Prerequisites = nil
	}
	for _, lesson := range reordered {
		f.WriteLesson(t, lesson, nil)
	}
	var entries []string
	for _, lesson := range reordered {
		entries = append(entries, lesson.Title+" / "+lesson.Slug)
	}
	if err := os.WriteFile(filepath.Join(f.CourseDir(), "PLAN.md"), []byte(testutil.CanonicalPlan(f.Course.Name, f.Course.ID, entries)), 0o644); err != nil {
		t.Fatal(err)
	}

	original, err := os.ReadFile(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	cc := &courseCtx{root: f.Root, disc: route.CourseDiscovery{ID: "demo"}, db: dbPath}
	var out bytes.Buffer
	cc.out = &out
	cmd := newProgressVerifyCmd(cc)
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	var got progressVerifyReport
	if err := json.Unmarshal(out.Bytes(), &got); err != nil {
		t.Fatalf("verify output is not JSON: %q: %v", out.String(), err)
	}
	wantHash := sha256.Sum256(original)
	if got.BeforeHash != hex.EncodeToString(wantHash[:]) {
		t.Fatalf("before_hash = %q, want source hash", got.BeforeHash)
	}
	if got.LessonRows != 6 || got.ProgressRows != 1 || got.AttemptRows != 1 ||
		!got.ProgressUnchanged || !got.AttemptsUnchanged || !got.IdentitiesPreserved {
		t.Fatalf("unexpected verify report: %+v", got)
	}
	after, err := os.ReadFile(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(original, after) {
		t.Fatal("verify changed the source database")
	}
}

func TestProgressVerifyRejectsNonemptySidecar(t *testing.T) {
	for _, suffix := range []string{"-wal", "-journal"} {
		t.Run(suffix, func(t *testing.T) {
			f := testutil.NewCourse(t, 1)
			f.WritePlan(t)
			dbPath := filepath.Join(t.TempDir(), "tutor.sqlite")
			db, err := progress.Open(dbPath)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := progress.Init(db, "demo", f.Lessons); err != nil {
				t.Fatal(err)
			}
			if err := db.Close(); err != nil {
				t.Fatal(err)
			}
			removeSidecars(t, dbPath)
			if err := os.WriteFile(dbPath+suffix, []byte("pending"), 0o600); err != nil {
				t.Fatal(err)
			}
			cc := &courseCtx{root: f.Root, disc: route.CourseDiscovery{ID: "demo"}, db: dbPath}
			cc.out = &bytes.Buffer{}
			err = runProgressVerify(cc)
			if err == nil || !strings.Contains(err.Error(), "Close the learner's progress writer before copying") {
				t.Fatalf("verify error = %v, want sidecar refusal", err)
			}
		})
	}
}

func TestProgressVerifyRejectsSourceMutationDuringCopy(t *testing.T) {
	f := testutil.NewCourse(t, 1)
	f.WritePlan(t)
	dbPath := filepath.Join(t.TempDir(), "tutor.sqlite")
	db, err := progress.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := progress.Init(db, "demo", f.Lessons); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	removeSidecars(t, dbPath)

	originalReader := readVerifyFile
	defer func() { readVerifyFile = originalReader }()
	reads := 0
	readVerifyFile = func(path string) ([]byte, error) {
		data, err := os.ReadFile(path)
		reads++
		if err == nil && reads == 1 {
			if writeErr := os.WriteFile(path, append(append([]byte(nil), data...), 0), 0o600); writeErr != nil {
				return nil, writeErr
			}
		}
		return data, err
	}
	cc := &courseCtx{root: f.Root, disc: route.CourseDiscovery{ID: "demo"}, db: dbPath, out: &bytes.Buffer{}}
	err = runProgressVerify(cc)
	if err == nil || err.Error() != "source database changed during verification" {
		t.Fatalf("verify error = %v, want concurrent source mutation refusal", err)
	}
}

func TestEqualVerifyRowsPreservesSQLTypes(t *testing.T) {
	integer := []verifyRow{{Values: []any{int64(1), nil, []byte("x")}}}
	text := []verifyRow{{Values: []any{"1", nil, []byte("x")}}}
	if equalVerifyRows(integer, text) {
		t.Fatal("integer and text SQL values compared equal")
	}
	if !equalVerifyRows(integer, []verifyRow{{Values: []any{int64(1), nil, []byte("x")}}}) {
		t.Fatal("identical typed SQL rows compared unequal")
	}
}

func writeSecondCourse(t *testing.T, f *testutil.Fixture, lessons []course.Lesson) {
	t.Helper()
	c := f.Course
	c.ID = "other"
	c.Name = "Other Course"
	dir := filepath.Join(f.Root, "courses", c.ID)
	if err := os.MkdirAll(filepath.Join(dir, "lessons"), 0o755); err != nil {
		t.Fatal(err)
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "course.json"), append(data, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
	var entries []string
	for _, lesson := range lessons {
		entries = append(entries, lesson.Title+" / "+lesson.Slug)
		if err := os.WriteFile(filepath.Join(dir, "lessons", course.FileName(lesson.Ordinal, lesson.Slug)), course.FormatLessonFile(c, lesson, nil), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "PLAN.md"), []byte(testutil.CanonicalPlan(c.Name, c.ID, entries)), 0o644); err != nil {
		t.Fatal(err)
	}
}

func removeSidecars(t *testing.T, dbPath string) {
	t.Helper()
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		if err := os.Remove(dbPath + suffix); err != nil && !errors.Is(err, os.ErrNotExist) {
			t.Fatal(err)
		}
	}
}
