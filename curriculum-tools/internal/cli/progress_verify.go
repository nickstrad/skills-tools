package cli

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"reflect"

	"github.com/spf13/cobra"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/progress"
	"skills-tools/tutor/internal/render"
	"skills-tools/tutor/internal/route"
)

// progressVerifyReport is intentionally small: it reports the before snapshot counts and the
// invariants checked after seeding the copied database. before_hash is the source database's
// SHA-256 before any copy or database handle is opened.
type progressVerifyReport struct {
	BeforeHash          string `json:"before_hash"`
	LessonRows          int    `json:"lesson_rows"`
	ProgressRows        int    `json:"progress_rows"`
	AttemptRows         int    `json:"attempt_rows"`
	ProgressUnchanged   bool   `json:"progress_unchanged"`
	AttemptsUnchanged   bool   `json:"attempts_unchanged"`
	IdentitiesPreserved bool   `json:"identities_preserved"`
}

type verifySnapshot struct {
	lessons            []verifyLesson
	otherLessonRows    []verifyRow
	otherPrerequisites []verifyRow
	progress           []verifyRow
	attempts           []verifyRow
}

type verifyLesson struct {
	ID       int64
	CourseID string
	Slug     string
	Ordinal  int
	Active   int
}

type verifyRow struct {
	Values []any
}

// newProgressVerifyCmd verifies identity-preserving seeding on a byte copy of a course's
// database. It is registered by course.go beneath `tutor <course> progress` by the primary agent.
func newProgressVerifyCmd(cc *courseCtx) *cobra.Command {
	return &cobra.Command{
		Use:   "verify",
		Short: "Verify progress survives a refresh on a database copy",
		Args:  exactArgs(0, fmt.Sprintf("tutor %s progress verify", cc.publicName())),
		RunE: func(*cobra.Command, []string) error {
			return runProgressVerify(cc)
		},
	}
}

func runProgressVerify(cc *courseCtx) error {
	lessons, err := course.LoadLessons(cc.root, cc.storedID())
	if err != nil {
		return err
	}
	if _, err := route.ReadPlanAndCatalog(cc.root, cc.storedID(), lessons); err != nil {
		return err
	}
	sourcePath, err := cc.dbPath()
	if err != nil {
		return err
	}
	original, sourceInfo, err := readStableVerifySource(sourcePath)
	if err != nil {
		return err
	}
	digest := sha256.Sum256(original)

	evidence, err := os.MkdirTemp("", "tutor-progress-verify-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(evidence)
	copyPath := filepath.Join(evidence, filepath.Base(sourcePath))
	if err := os.WriteFile(copyPath, original, sourceInfo.Mode().Perm()); err != nil {
		return err
	}
	if err := verifySourceUnchanged(sourcePath, sourceInfo, original); err != nil {
		return err
	}

	before, err := snapshotVerifyDatabase(copyPath, cc.storedID())
	if err != nil {
		return err
	}
	db, err := progress.Open(copyPath)
	if err != nil {
		return err
	}
	_, seedErr := progress.Seed(db, cc.storedID(), lessons)
	closeErr := db.Close()
	if seedErr != nil {
		return seedErr
	}
	if closeErr != nil {
		return closeErr
	}
	after, err := snapshotVerifyDatabase(copyPath, cc.storedID())
	if err != nil {
		return err
	}
	progressUnchanged := equalVerifyRows(before.progress, after.progress)
	attemptsUnchanged := equalVerifyRows(before.attempts, after.attempts)
	identitiesPreserved := verifyIdentities(cc.storedID(), before.lessons, after.lessons) &&
		equalVerifyRows(before.otherLessonRows, after.otherLessonRows) &&
		equalVerifyRows(before.otherPrerequisites, after.otherPrerequisites)
	if err := verifySourceUnchanged(sourcePath, sourceInfo, original); err != nil {
		return err
	}
	report := progressVerifyReport{
		BeforeHash:          hex.EncodeToString(digest[:]),
		LessonRows:          len(before.lessons),
		ProgressRows:        len(before.progress),
		AttemptRows:         len(before.attempts),
		ProgressUnchanged:   progressUnchanged,
		AttemptsUnchanged:   attemptsUnchanged,
		IdentitiesPreserved: identitiesPreserved,
	}
	data, err := render.JSON(report)
	if err != nil {
		return err
	}
	fmt.Fprintln(cc.out, string(data))
	if !progressUnchanged || !attemptsUnchanged || !identitiesPreserved {
		return runtimeErr("progress verification failed")
	}
	return nil
}

var readVerifyFile = os.ReadFile

func rejectVerifySidecars(path string) error {
	for _, suffix := range []string{"-wal", "-journal"} {
		info, err := os.Stat(path + suffix)
		if err == nil && info.Size() > 0 {
			return fmt.Errorf("Close the learner's progress writer before copying: %s", path+suffix)
		}
		if err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

// readStableVerifySource takes a conservative byte snapshot. SQLite writers are expected to leave
// a WAL or rollback journal; the metadata and second byte comparison close the window where a
// writer starts after the first sidecar check.
func readStableVerifySource(path string) ([]byte, os.FileInfo, error) {
	if err := rejectVerifySidecars(path); err != nil {
		return nil, nil, err
	}
	before, err := os.Stat(path)
	if err != nil {
		return nil, nil, err
	}
	data, err := readVerifyFile(path)
	if err != nil {
		return nil, nil, err
	}
	if err := verifySourceUnchanged(path, before, data); err != nil {
		return nil, nil, err
	}
	return data, before, nil
}

func verifySourceUnchanged(path string, before os.FileInfo, expected []byte) error {
	if err := rejectVerifySidecars(path); err != nil {
		return err
	}
	after, err := os.Stat(path)
	if err != nil {
		return err
	}
	if !os.SameFile(before, after) || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		return fmt.Errorf("source database changed during verification")
	}
	current, err := readVerifyFile(path)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(current, expected) {
		return fmt.Errorf("source database changed during verification")
	}
	if err := rejectVerifySidecars(path); err != nil {
		return err
	}
	return nil
}

func snapshotVerifyDatabase(path, courseID string) (verifySnapshot, error) {
	db, err := progress.OpenReadOnly(path)
	if err != nil {
		return verifySnapshot{}, err
	}
	defer db.Close()
	s := verifySnapshot{}
	if err := progress.EnsureReady(db, courseID); err != nil {
		return s, err
	}
	rows, err := db.Query("SELECT id,course_id,slug,ordinal,active FROM lessons ORDER BY id")
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var l verifyLesson
		if err := rows.Scan(&l.ID, &l.CourseID, &l.Slug, &l.Ordinal, &l.Active); err != nil {
			rows.Close()
			return s, err
		}
		s.lessons = append(s.lessons, l)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return s, err
	}
	rows.Close()
	const lessonColumns = `id,course_id,ordinal,slug,title,category,difficulty,tags,overview,
		syntax_breakdown,setup,code,expected_result,systems_lens,challenge,caution,safety_level,
		run_in,sessions,min_version,estimated_minutes,revision,active,updated_at`
	if s.otherLessonRows, err = queryVerifyRows(db, "SELECT "+lessonColumns+" FROM lessons WHERE course_id<>? ORDER BY id", courseID); err != nil {
		return s, err
	}
	if s.otherPrerequisites, err = queryVerifyRows(db, `SELECT lp.lesson_id,lp.prerequisite_id
		FROM lesson_prerequisites lp JOIN lessons l ON l.id=lp.lesson_id
		WHERE l.course_id<>? ORDER BY lp.lesson_id,lp.prerequisite_id`, courseID); err != nil {
		return s, err
	}
	if s.progress, err = queryVerifyRows(db, "SELECT lesson_id,status,completed_revision,completed_at,notes,updated_at FROM progress ORDER BY lesson_id"); err != nil {
		return s, err
	}
	if s.attempts, err = queryVerifyRows(db, "SELECT id,lesson_id,outcome,lesson_revision,attempted_at,notes FROM attempts ORDER BY id"); err != nil {
		return s, err
	}
	return s, nil
}

func queryVerifyRows(db *sql.DB, query string, args ...any) ([]verifyRow, error) {
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := make([]verifyRow, 0)
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(values))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		out = append(out, verifyRow{Values: values})
	}
	return out, rows.Err()
}

func equalVerifyRows(a, b []verifyRow) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if len(a[i].Values) != len(b[i].Values) {
			return false
		}
		for j := range a[i].Values {
			if !reflect.DeepEqual(a[i].Values[j], b[i].Values[j]) {
				return false
			}
		}
	}
	return true
}

func verifyIdentities(courseID string, before, after []verifyLesson) bool {
	ids := make(map[string]int64, len(after))
	for _, lesson := range after {
		if lesson.CourseID == courseID {
			ids[lesson.Slug] = lesson.ID
		}
	}
	for _, lesson := range before {
		if lesson.CourseID == courseID && ids[lesson.Slug] != lesson.ID {
			return false
		}
	}
	return true
}
