package progress

import (
	"context"
	"database/sql"
	"strings"

	"skills-tools/tutor/internal/course"
)

const upsertLesson = `
    INSERT INTO lessons(id,ordinal,slug,title,category,difficulty,tags,
      overview,syntax_breakdown,setup,code,expected_result,systems_lens,challenge,caution,
      safety_level,run_in,sessions,min_version,estimated_minutes,revision)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET ordinal=excluded.ordinal,slug=excluded.slug,title=excluded.title,
      category=excluded.category,difficulty=excluded.difficulty,tags=excluded.tags,
      overview=excluded.overview,
      syntax_breakdown=excluded.syntax_breakdown,setup=excluded.setup,code=excluded.code,
      expected_result=excluded.expected_result,systems_lens=excluded.systems_lens,
      challenge=excluded.challenge,caution=excluded.caution,safety_level=excluded.safety_level,
      run_in=excluded.run_in,sessions=excluded.sessions,min_version=excluded.min_version,
      estimated_minutes=excluded.estimated_minutes,revision=excluded.revision,active=1,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`

// TagsColumn encodes tags as ",a,b," (a lone "," for none), the column format of the Deno engine.
func TagsColumn(tags []string) string {
	return "," + strings.Join(tags, ",") + ","
}

// Seed upserts the catalog into an initialized database, following lesson identity by slug so
// progress and attempts survive reordering, removal and reinsertion. It returns the lesson count.
//
// Algorithm (identical to the Deno seed): read existing id/ordinal/slug; park every row inactive at
// ordinal offset+id; upsert each lesson by its previous id (or a fresh id); rebuild prerequisites;
// re-park retired rows at len(lessons)+1, +2, ... in id order.
func Seed(db *sql.DB, lessons []course.Lesson) (int, error) {
	tx, err := db.BeginTx(context.Background(), nil) // BEGIN IMMEDIATE via the DSN's _txlock
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	rows, err := tx.Query("SELECT id,ordinal,slug FROM lessons")
	if err != nil {
		return 0, err
	}
	idBySlug := map[string]int64{}
	var nextID int64
	maxOrdinal := len(lessons)
	for rows.Next() {
		var id int64
		var ordinal int
		var slug string
		if err := rows.Scan(&id, &ordinal, &slug); err != nil {
			rows.Close()
			return 0, err
		}
		idBySlug[slug] = id
		if id > nextID {
			nextID = id
		}
		if ordinal > maxOrdinal {
			maxOrdinal = ordinal
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	offset := maxOrdinal + 1
	if _, err := tx.Exec("UPDATE lessons SET active=0,ordinal=?+id", offset); err != nil {
		return 0, err
	}
	idByOrdinal := map[int]int64{}
	for _, x := range lessons {
		id, ok := idBySlug[x.Slug]
		if !ok {
			nextID++
			id = nextID
		}
		idByOrdinal[x.Ordinal] = id
		if _, err := tx.Exec(upsertLesson,
			id, x.Ordinal, x.Slug, x.Title, x.Category, x.Difficulty, TagsColumn(x.Tags),
			x.Overview, x.SyntaxBreakdown, x.Setup, x.Code, x.ExpectedResult, x.SystemsLens,
			x.Challenge, x.Caution, x.SafetyLevel, x.RunIn, x.Sessions, x.MinVersion,
			x.EstimatedMinutes, x.Revision); err != nil {
			return 0, err
		}
	}
	if _, err := tx.Exec("DELETE FROM lesson_prerequisites"); err != nil {
		return 0, err
	}
	for _, x := range lessons {
		for _, p := range x.Prerequisites {
			if _, err := tx.Exec("INSERT INTO lesson_prerequisites(lesson_id,prerequisite_id) VALUES(?,?)",
				idByOrdinal[x.Ordinal], idByOrdinal[p]); err != nil {
				return 0, err
			}
		}
	}
	retiredRows, err := tx.Query("SELECT id FROM lessons WHERE active=0 ORDER BY id")
	if err != nil {
		return 0, err
	}
	var retired []int64
	for retiredRows.Next() {
		var id int64
		if err := retiredRows.Scan(&id); err != nil {
			retiredRows.Close()
			return 0, err
		}
		retired = append(retired, id)
	}
	retiredRows.Close()
	if err := retiredRows.Err(); err != nil {
		return 0, err
	}
	for i, id := range retired {
		if _, err := tx.Exec("UPDATE lessons SET ordinal=? WHERE id=?", len(lessons)+i+1, id); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return len(lessons), nil
}

// Init ensures the schema and seeds the catalog: the `tutor <course> init` operation.
func Init(db *sql.DB, lessons []course.Lesson) (int, error) {
	if err := EnsureSchema(db); err != nil {
		return 0, err
	}
	return Seed(db, lessons)
}
