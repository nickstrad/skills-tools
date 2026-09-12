// Operations behind the course verbs: get, next, done, skip, undone, note, list, topics, modules,
// status and search. Every query is a port of the corresponding statement in src/main.ts
// (LESSON_SELECT, topicFilter and the "next"/"done"/"list"/"topics"/"modules"/"status"/"search"
// branches of run()) with one added predicate, l.course_id=?, so consolidated learner history
// keeps behaving identically under the Go CLI.
package progress

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"skills-tools/tutor/internal/course"
)

// lessonSelect is LESSON_SELECT from src/main.ts; l.* now begins with course_id.
const lessonSelect = `SELECT l.*, COALESCE(p.status,'todo') AS status, p.notes AS notes,
  CASE WHEN p.status='done' AND p.completed_revision<>l.revision THEN 1 ELSE 0 END AS stale
FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id`

// unfinishedPredicate matches a lesson with no completed-and-current progress row.
const unfinishedPredicate = `(p.lesson_id IS NULL OR p.status='todo' OR (p.status='done' AND p.completed_revision<>l.revision))`

// Row is one lesson joined with its progress, the shape every read verb hands to the renderer.
type Row struct {
	ID       int64
	CourseID string
	course.Lesson
	Status string // raw p.status, COALESCE 'todo': "todo" | "done" | "skipped"
	Notes  string // "" when NULL
	Stale  bool
}

// DisplayStatus is "stale" when the completion predates the lesson's current revision, else Status.
func (r Row) DisplayStatus() string {
	if r.Stale {
		return "stale"
	}
	return r.Status
}

// NotFoundError is returned by Get (and every verb that resolves an ordinal through it) when no
// active lesson has that ordinal.
type NotFoundError struct{ Ordinal int }

func (e NotFoundError) Error() string { return fmt.Sprintf("lesson %d not found", e.Ordinal) }

// ListFilter selects the rows List returns. The zero value is --all semantics (Limit 0 -> 1000).
type ListFilter struct {
	Todo, Done, All bool
	Category, Topic string
	Limit           int
}

// Topic summarizes one tag across the active catalog.
type Topic struct {
	Tag         string
	First       int
	Total, Done int
	Lessons     []int
}

// Module summarizes one category across the active catalog.
type Module struct {
	Category    string
	First, Last int
	Total, Done int
	Minutes     int
}

// Status is the course-wide completion summary.
type Status struct {
	Total, Done, Todo, Skipped, Stale int
}

// decodeTags splits the ",a,b," column format into ["a","b"], dropping the empty edge entries
// (equivalent to the Deno tagsOf: row.tags.split(",").filter(Boolean)).
func decodeTags(s string) []string {
	out := []string{}
	for _, t := range strings.Split(s, ",") {
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

type scanner interface {
	Scan(dest ...any) error
}

// scanRow reads one lessonSelect row (all lesson columns in schema order, then status, notes,
// stale) into a Row. Prerequisites is left nil: no view built on Row needs it.
func scanRow(s scanner) (Row, error) {
	var (
		id                                                                                      int64
		courseID                                                                                string
		ordinal                                                                                 int
		slug, title, category, difficulty, tags                                                 string
		overview, syntaxBreakdown, setup, code, expectedResult, systemsLens, challenge, caution string
		safetyLevel, runIn                                                                      string
		sessions                                                                                int
		minVersion                                                                              string
		estimatedMinutes, revision, active                                                      int
		updatedAt                                                                               string
		status                                                                                  string
		notes                                                                                   sql.NullString
		stale                                                                                   int
	)
	if err := s.Scan(
		&id, &courseID, &ordinal, &slug, &title, &category, &difficulty, &tags,
		&overview, &syntaxBreakdown, &setup, &code, &expectedResult, &systemsLens, &challenge, &caution,
		&safetyLevel, &runIn, &sessions, &minVersion, &estimatedMinutes, &revision, &active, &updatedAt,
		&status, &notes, &stale,
	); err != nil {
		return Row{}, err
	}
	return Row{
		ID:       id,
		CourseID: courseID,
		Lesson: course.Lesson{
			Ordinal:          ordinal,
			Slug:             slug,
			Title:            title,
			Category:         category,
			Difficulty:       difficulty,
			Tags:             decodeTags(tags),
			Overview:         overview,
			SyntaxBreakdown:  syntaxBreakdown,
			Setup:            setup,
			Code:             code,
			ExpectedResult:   expectedResult,
			SystemsLens:      systemsLens,
			Challenge:        challenge,
			Caution:          caution,
			SafetyLevel:      safetyLevel,
			RunIn:            runIn,
			Sessions:         sessions,
			MinVersion:       minVersion,
			EstimatedMinutes: estimatedMinutes,
			Revision:         revision,
		},
		Status: status,
		Notes:  notes.String,
		Stale:  stale != 0,
	}, nil
}

func scanRows(rows *sql.Rows) ([]Row, error) {
	defer rows.Close()
	out := []Row{}
	for rows.Next() {
		r, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// topicFilter builds the SQL fragment matching every whitespace-separated lowercased word of topic
// against lower(tags || ' ' || category || ' ' || title). A blank topic is an error.
func topicFilter(topic string) (string, []any, error) {
	words := strings.Fields(strings.ToLower(topic))
	if len(words) == 0 {
		return "", nil, errors.New("--topic requires at least one word")
	}
	const haystack = "lower(l.tags || ' ' || l.category || ' ' || l.title)"
	conds := make([]string, len(words))
	args := make([]any, len(words))
	for i, w := range words {
		conds[i] = haystack + " LIKE ?"
		args[i] = "%" + w + "%"
	}
	return strings.Join(conds, " AND "), args, nil
}

// Get returns the course's active lesson at ordinal, or NotFoundError if none exists.
func Get(db *sql.DB, courseID string, ordinal int) (Row, error) {
	r, err := scanRow(db.QueryRow(lessonSelect+" WHERE l.course_id=? AND l.ordinal=? AND l.active=1", courseID, ordinal))
	if errors.Is(err, sql.ErrNoRows) {
		return Row{}, NotFoundError{ordinal}
	}
	if err != nil {
		return Row{}, err
	}
	return r, nil
}

// Next returns the next unfinished lesson, optionally restricted to a topic.
//
// topic == "": found -> (row, 0, false, nil); nothing left -> (Row{}, 0, true, nil).
// topic != "": no lesson matches at all -> (Row{}, 0, false, nil) with matched 0;
//
//	all matching lessons finished -> (Row{}, matched, true, nil); else (row, matched, false, nil).
func Next(db *sql.DB, courseID, topic string) (Row, int, bool, error) {
	if topic == "" {
		r, err := scanRow(db.QueryRow(lessonSelect+" WHERE l.course_id=? AND l.active=1 AND "+unfinishedPredicate+" ORDER BY l.ordinal LIMIT 1", courseID))
		if errors.Is(err, sql.ErrNoRows) {
			return Row{}, 0, true, nil
		}
		if err != nil {
			return Row{}, 0, false, err
		}
		return r, 0, false, nil
	}
	cond, args, err := topicFilter(topic)
	if err != nil {
		return Row{}, 0, false, err
	}
	args = append([]any{courseID}, args...)
	var matched int
	if err := db.QueryRow("SELECT count(*) FROM lessons l WHERE l.course_id=? AND l.active=1 AND "+cond, args...).Scan(&matched); err != nil {
		return Row{}, 0, false, err
	}
	if matched == 0 {
		return Row{}, 0, false, nil
	}
	r, err := scanRow(db.QueryRow(lessonSelect+" WHERE l.course_id=? AND l.active=1 AND "+unfinishedPredicate+" AND "+cond+" ORDER BY l.ordinal LIMIT 1", args...))
	if errors.Is(err, sql.ErrNoRows) {
		return Row{}, matched, true, nil
	}
	if err != nil {
		return Row{}, 0, false, err
	}
	return r, matched, false, nil
}

// setStatus is the shared body of Done and Skip: one BEGIN IMMEDIATE transaction that upserts
// progress (keeping the existing note when note is "") and inserts the matching attempts row.
func setStatus(db *sql.DB, courseID string, ordinal int, status, note string) error {
	lesson, err := Get(db, courseID, ordinal)
	if err != nil {
		return err
	}
	var revision any
	var completedAt any
	if status == "done" {
		revision = lesson.Revision
		completedAt = time.Now().UTC().Format("2006-01-02T15:04:05.000Z07:00")
	}
	tx, err := db.BeginTx(context.Background(), nil) // BEGIN IMMEDIATE via the DSN's _txlock
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO progress(lesson_id,status,completed_revision,completed_at,notes)
    VALUES(?,?,?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET status=excluded.status,
    completed_revision=excluded.completed_revision,completed_at=excluded.completed_at,
    notes=CASE WHEN excluded.notes='' THEN progress.notes ELSE excluded.notes END,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
		lesson.ID, status, revision, completedAt, note); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO attempts(lesson_id,outcome,lesson_revision,notes) VALUES(?,?,?,?)`,
		lesson.ID, "manual", lesson.Revision, note); err != nil {
		return err
	}
	return tx.Commit()
}

// Done marks a lesson done at its current revision. note == "" keeps the existing note.
func Done(db *sql.DB, courseID string, ordinal int, note string) error {
	return setStatus(db, courseID, ordinal, "done", note)
}

// Skip marks a lesson skipped. note == "" keeps the existing note.
func Skip(db *sql.DB, courseID string, ordinal int, note string) error {
	return setStatus(db, courseID, ordinal, "skipped", note)
}

// Undone resets a lesson to todo, clearing completion metadata but keeping notes.
func Undone(db *sql.DB, courseID string, ordinal int) error {
	lesson, err := Get(db, courseID, ordinal)
	if err != nil {
		return err
	}
	_, err = db.Exec(`UPDATE progress SET status='todo', completed_revision=NULL, completed_at=NULL,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lesson_id=?`, lesson.ID)
	return err
}

// Note saves free text against a lesson without changing its status (it upserts status='todo' only
// on insert; an existing row's status is untouched). An empty (after trimming) text is an error.
func Note(db *sql.DB, courseID string, ordinal int, text string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return errors.New("note text is required")
	}
	lesson, err := Get(db, courseID, ordinal)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO progress(lesson_id,status,notes) VALUES(?,'todo',?)
    ON CONFLICT(lesson_id) DO UPDATE SET notes=excluded.notes,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`, lesson.ID, text)
	return err
}

// List returns active lessons matching f, ordered by ordinal. The zero ListFilter is --all.
func List(db *sql.DB, courseID string, f ListFilter) ([]Row, error) {
	var set []string
	if f.Todo {
		set = append(set, "--todo")
	}
	if f.Done {
		set = append(set, "--done")
	}
	if f.All {
		set = append(set, "--all")
	}
	if len(set) > 1 {
		return nil, fmt.Errorf("choose one of %s", strings.Join(set, ", "))
	}
	filters := []string{"l.course_id=?", "l.active=1"}
	args := []any{courseID}
	switch {
	case f.Done:
		filters = append(filters, "p.status='done' AND p.completed_revision=l.revision")
	case f.Todo:
		filters = append(filters, unfinishedPredicate)
	}
	if f.Category != "" {
		filters = append(filters, "l.category=?")
		args = append(args, f.Category)
	}
	if f.Topic != "" {
		cond, topicArgs, err := topicFilter(f.Topic)
		if err != nil {
			return nil, err
		}
		filters = append(filters, cond)
		args = append(args, topicArgs...)
	}
	limit := f.Limit
	if limit == 0 {
		limit = 1000
	}
	args = append(args, limit)
	rows, err := db.Query(lessonSelect+" WHERE "+strings.Join(filters, " AND ")+" ORDER BY l.ordinal LIMIT ?", args...)
	if err != nil {
		return nil, err
	}
	return scanRows(rows)
}

// Topics summarizes every tag across the active catalog, sorted by the ordinal it first appears at.
func Topics(db *sql.DB, courseID string) ([]Topic, error) {
	rows, err := db.Query(`SELECT l.ordinal, l.tags,
    (p.status='done' AND p.completed_revision=l.revision) AS finished
    FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id WHERE l.course_id=? AND l.active=1
    ORDER BY l.ordinal`, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type acc struct {
		first, total, done int
		lessons            []int
	}
	order := []string{}
	byTag := map[string]*acc{}
	for rows.Next() {
		var ordinal int
		var tags string
		var finished sql.NullInt64 // NULL when the lesson has no progress row, like the JS null
		if err := rows.Scan(&ordinal, &tags, &finished); err != nil {
			return nil, err
		}
		for _, tag := range decodeTags(tags) {
			a, ok := byTag[tag]
			if !ok {
				a = &acc{first: ordinal}
				byTag[tag] = a
				order = append(order, tag)
			}
			a.total++
			if finished.Valid && finished.Int64 != 0 {
				a.done++
			}
			a.lessons = append(a.lessons, ordinal)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]Topic, len(order))
	for i, tag := range order {
		a := byTag[tag]
		out[i] = Topic{Tag: tag, First: a.first, Total: a.total, Done: a.done, Lessons: a.lessons}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].First < out[j].First })
	return out, nil
}

// Modules summarizes every category across the active catalog, ordered by its first ordinal.
func Modules(db *sql.DB, courseID string) ([]Module, error) {
	rows, err := db.Query(`SELECT l.category, min(l.ordinal) first, max(l.ordinal) last,
    count(*) total, count(*) FILTER (WHERE p.status='done' AND p.completed_revision=l.revision) done,
    sum(l.estimated_minutes) minutes
    FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id WHERE l.course_id=? AND l.active=1
    GROUP BY l.category ORDER BY first`, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Module{}
	for rows.Next() {
		var m Module
		if err := rows.Scan(&m.Category, &m.First, &m.Last, &m.Total, &m.Done, &m.Minutes); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetStatus is the course-wide completion summary. Named GetStatus, not Status: Go does not allow
// a function and a type to share one package-level identifier, and the type name is fixed by the
// spec (used as the JSON/rendering shape), so the function took the name Get already establishes
// as this package's "look one thing up" verb.
func GetStatus(db *sql.DB, courseID string) (Status, error) {
	var s Status
	err := db.QueryRow(`SELECT count(*) total,
    count(*) FILTER (WHERE p.status='done' AND p.completed_revision=l.revision) done,
    count(*) FILTER (WHERE p.status='skipped') skipped,
    count(*) FILTER (WHERE p.status='done' AND p.completed_revision<>l.revision) stale
    FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id WHERE l.course_id=? AND l.active=1`, courseID).
		Scan(&s.Total, &s.Done, &s.Skipped, &s.Stale)
	if err != nil {
		return Status{}, err
	}
	s.Todo = s.Total - s.Done - s.Skipped
	return s, nil
}

// Search matches lessons whose title, overview, systems lens, code, category, slug or tags contain
// every term (case-insensitive, SQLite LIKE semantics). An empty term list is an error.
func Search(db *sql.DB, courseID string, terms []string) ([]Row, error) {
	words := make([]string, 0, len(terms))
	for _, t := range terms {
		if t != "" {
			words = append(words, t)
		}
	}
	if len(words) == 0 {
		return nil, errors.New("search text is required")
	}
	const haystack = "(l.title || ' ' || l.overview || ' ' || l.systems_lens || ' ' || l.code || ' ' || l.category || ' ' || l.slug || ' ' || l.tags)"
	conds := make([]string, len(words))
	args := []any{courseID}
	for i, w := range words {
		conds[i] = haystack + " LIKE ?"
		args = append(args, "%"+w+"%")
	}
	rows, err := db.Query(lessonSelect+" WHERE l.course_id=? AND l.active=1 AND "+strings.Join(conds, " AND ")+" ORDER BY l.ordinal", args...)
	if err != nil {
		return nil, err
	}
	return scanRows(rows)
}
