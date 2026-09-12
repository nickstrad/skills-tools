package roadmap

import (
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"time"
)

// trackOrder sorts topics by section (main, workshop, branch) and then by position; it is the
// order of the snapshot array and of the view.
const trackOrder = `ORDER BY CASE track WHEN 'main' THEN 0 WHEN 'workshop' THEN 1 ELSE 2 END, position`

const topicColumns = `id,slug,title,track,status,tool,goals,diagram,course_id,plan_path,notes`

// Import loads a snapshot file into the database. It refuses a database that already holds topics
// unless replace is true, in which case the existing topics (and their follow-ups, by cascade) are
// dropped first. Positions are assigned densely per track from the array order. It returns the
// number of topics imported.
func (s Store) Import(file string, replace bool) (int, error) {
	snapshot, err := ReadSnapshot(file)
	if err != nil {
		return 0, err
	}
	count := 0
	err = s.withTx(func(tx *sql.Tx) error {
		var existing int
		if err := tx.QueryRow("SELECT count(*) FROM roadmap_topics").Scan(&existing); err != nil {
			return err
		}
		if existing > 0 {
			if !replace {
				return fmt.Errorf("%s: %w", s.Path, ErrNotEmpty)
			}
			if _, err := tx.Exec("DELETE FROM roadmap_followups"); err != nil {
				return err
			}
			if _, err := tx.Exec("DELETE FROM roadmap_topics"); err != nil {
				return err
			}
		}
		positions := map[string]int{}
		for _, t := range snapshot.Topics {
			positions[t.Track]++
			if err := insertTopic(tx, t, positions[t.Track]); err != nil {
				return err
			}
			count++
		}
		if err := setMeta(tx, metaPreamble, snapshot.Preamble); err != nil {
			return err
		}
		return markChanged(tx)
	})
	if err != nil {
		return 0, err
	}
	return count, nil
}

// insertTopic writes one topic and its follow-ups at the given position within its track.
func insertTopic(tx *sql.Tx, t Topic, position int) error {
	res, err := tx.Exec(
		`INSERT INTO roadmap_topics(slug,title,track,position,status,tool,goals,diagram,course_id,plan_path,notes)
		 VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
		t.Slug, t.Title, t.Track, position, t.Status, t.Tool, t.Goals, t.Diagram, t.Course, t.Plan, t.Notes)
	if err != nil {
		return fmt.Errorf("topic %q: %w", t.Slug, err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	for i, f := range t.Followups {
		chosen := 0
		if f.Chosen {
			chosen = 1
		}
		if _, err := tx.Exec(
			"INSERT INTO roadmap_followups(topic_id,position,title,description,chosen) VALUES(?,?,?,?,?)",
			id, i+1, f.Title, f.Description, chosen); err != nil {
			return fmt.Errorf("topic %q follow-up %d: %w", t.Slug, i+1, err)
		}
	}
	return nil
}

// Export writes the database content to file as a roadmap snapshot and records the export time.
//
// The published file's modification time is set to that same instant: StaleExportNote compares the
// file's mtime with exported_at, and Linux stamps files from a coarse clock that can lag
// time.Now() by several milliseconds, which would otherwise make a freshly exported snapshot look
// stale. Setting both from one value keeps the comparison exact.
func (s Store) Export(file string) error {
	snapshot, err := s.Load()
	if err != nil {
		return err
	}
	stamp := time.Now().UTC()
	if err := WriteSnapshot(file, snapshot); err != nil {
		return err
	}
	if err := os.Chtimes(file, stamp, stamp); err != nil {
		return err
	}
	return s.withTx(func(tx *sql.Tx) error { return setMeta(tx, metaExportedAt, stamp.Format(timeLayout)) })
}

// Load reads the whole roadmap read-only. A missing database yields ErrNoRoadmap and creates
// nothing.
func (s Store) Load() (Snapshot, error) {
	db, err := s.openRead()
	if err != nil {
		return Snapshot{}, err
	}
	defer db.Close()
	preamble, err := getMeta(db, metaPreamble)
	if err != nil {
		return Snapshot{}, err
	}
	topics, err := readTopics(db, "")
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{Format: Format, Preamble: preamble, Topics: topics}, nil
}

// Show reads one topic read-only.
func (s Store) Show(slug string) (Topic, error) {
	db, err := s.openRead()
	if err != nil {
		return Topic{}, err
	}
	defer db.Close()
	return readTopic(db, slug)
}

// readTopics loads topics in snapshot order; slug selects a single topic when non-empty.
func readTopics(q queryer, slug string) ([]Topic, error) {
	query := "SELECT " + topicColumns + " FROM roadmap_topics "
	args := []any{}
	if slug != "" {
		query += "WHERE slug=? "
		args = append(args, slug)
	}
	query += trackOrder
	rows, err := q.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	topics := []Topic{}
	ids := []int64{}
	for rows.Next() {
		var id int64
		var t Topic
		if err := rows.Scan(&id, &t.Slug, &t.Title, &t.Track, &t.Status, &t.Tool, &t.Goals, &t.Diagram, &t.Course, &t.Plan, &t.Notes); err != nil {
			return nil, err
		}
		t.Followups = []Followup{}
		topics = append(topics, t)
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i, id := range ids {
		followups, err := readFollowups(q, id)
		if err != nil {
			return nil, err
		}
		topics[i].Followups = followups
	}
	return topics, nil
}

// readTopic loads one topic by slug, reporting an unknown slug as an error.
func readTopic(q queryer, slug string) (Topic, error) {
	topics, err := readTopics(q, slug)
	if err != nil {
		return Topic{}, err
	}
	if len(topics) == 0 {
		return Topic{}, fmt.Errorf("unknown topic %q", slug)
	}
	return topics[0], nil
}

func readFollowups(q queryer, topicID int64) ([]Followup, error) {
	rows, err := q.Query("SELECT title,description,chosen FROM roadmap_followups WHERE topic_id=? ORDER BY position", topicID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Followup{}
	for rows.Next() {
		var f Followup
		var chosen int
		if err := rows.Scan(&f.Title, &f.Description, &chosen); err != nil {
			return nil, err
		}
		f.Chosen = chosen == 1
		out = append(out, f)
	}
	return out, rows.Err()
}

// Set updates a topic's status, its notes, or both, and returns the updated topic.
func (s Store) Set(slug string, status *string, note *string) (Topic, error) {
	if status == nil && note == nil {
		return Topic{}, errors.New("nothing to set: pass --status or --note")
	}
	if status != nil {
		if err := ValidateStatus(*status); err != nil {
			return Topic{}, err
		}
	}
	return s.mutate(func(tx *sql.Tx) (string, error) {
		id, err := topicID(tx, slug)
		if err != nil {
			return "", err
		}
		if status != nil {
			if _, err := tx.Exec("UPDATE roadmap_topics SET status=?,updated_at=? WHERE id=?", *status, now(), id); err != nil {
				return "", err
			}
		}
		if note != nil {
			if _, err := tx.Exec("UPDATE roadmap_topics SET notes=?,updated_at=? WHERE id=?", *note, now(), id); err != nil {
				return "", err
			}
		}
		return slug, nil
	})
}

// Add inserts a new topic. An empty after appends it to the end of its track; otherwise it is
// placed directly after that topic, which must be in the same track. Positions stay dense.
func (s Store) Add(t Topic, after string) (Topic, error) {
	if err := ValidateSlug(t.Slug); err != nil {
		return Topic{}, err
	}
	if err := ValidateTrack(t.Track); err != nil {
		return Topic{}, err
	}
	if t.Status == "" {
		t.Status = "planned"
	}
	if err := ValidateStatus(t.Status); err != nil {
		return Topic{}, err
	}
	if t.Title == "" {
		return Topic{}, errors.New("a new topic needs --title")
	}
	return s.mutate(func(tx *sql.Tx) (string, error) {
		var exists int
		if err := tx.QueryRow("SELECT count(*) FROM roadmap_topics WHERE slug=?", t.Slug).Scan(&exists); err != nil {
			return "", err
		}
		if exists > 0 {
			return "", fmt.Errorf("topic %q already exists", t.Slug)
		}
		order, err := trackIDs(tx, t.Track)
		if err != nil {
			return "", err
		}
		if err := insertTopic(tx, t, len(order)+1); err != nil {
			return "", err
		}
		if after == "" {
			return t.Slug, nil
		}
		return t.Slug, placeAfter(tx, t.Slug, after)
	})
}

// editable maps the Edit change keys to their columns.
var editable = map[string]string{
	"title":   "title",
	"tool":    "tool",
	"goals":   "goals",
	"diagram": "diagram",
	"course":  "course_id",
	"plan":    "plan_path",
}

// Edit rewrites text fields of a topic. Keys are title, tool, goals, diagram, course and plan; an
// empty value clears the field.
func (s Store) Edit(slug string, changes map[string]string) (Topic, error) {
	if len(changes) == 0 {
		return Topic{}, errors.New("nothing to edit: pass --title, --tool, --goals, --diagram-file, --course or --plan")
	}
	for key := range changes {
		if _, ok := editable[key]; !ok {
			return Topic{}, fmt.Errorf("cannot edit %q: want title, tool, goals, diagram, course or plan", key)
		}
	}
	if title, ok := changes["title"]; ok && title == "" {
		return Topic{}, errors.New("--title cannot be empty")
	}
	return s.mutate(func(tx *sql.Tx) (string, error) {
		id, err := topicID(tx, slug)
		if err != nil {
			return "", err
		}
		// Iterate the fixed key list so the SQL order is deterministic.
		for _, key := range []string{"title", "tool", "goals", "diagram", "course", "plan"} {
			value, ok := changes[key]
			if !ok {
				continue
			}
			if _, err := tx.Exec("UPDATE roadmap_topics SET "+editable[key]+"=?,updated_at=? WHERE id=?", value, now(), id); err != nil {
				return "", err
			}
		}
		return slug, nil
	})
}

// Move repositions a topic within its track: first puts it at position 1, otherwise it lands
// directly after the named topic, which must be in the same track.
func (s Store) Move(slug, after string, first bool) (Topic, error) {
	if first == (after != "") {
		return Topic{}, errors.New("move needs exactly one of --after <slug> or --first")
	}
	return s.mutate(func(tx *sql.Tx) (string, error) {
		if _, err := topicID(tx, slug); err != nil {
			return "", err
		}
		if first {
			return slug, placeAfter(tx, slug, "")
		}
		return slug, placeAfter(tx, slug, after)
	})
}

// Remove deletes a topic (with its follow-ups) and returns the deleted row. The remaining
// positions in its track stay dense.
func (s Store) Remove(slug string) (Topic, error) {
	var removed Topic
	err := s.withTx(func(tx *sql.Tx) error {
		topic, err := readTopic(tx, slug)
		if err != nil {
			return err
		}
		id, err := topicID(tx, slug)
		if err != nil {
			return err
		}
		if _, err := tx.Exec("DELETE FROM roadmap_topics WHERE id=?", id); err != nil {
			return err
		}
		order, err := trackIDs(tx, topic.Track)
		if err != nil {
			return err
		}
		if err := resequence(tx, order); err != nil {
			return err
		}
		removed = topic
		return markChanged(tx)
	})
	if err != nil {
		return Topic{}, err
	}
	return removed, nil
}

// FollowupAdd appends a follow-up to a topic.
func (s Store) FollowupAdd(slug, title, description string) (Topic, error) {
	if title == "" {
		return Topic{}, errors.New("a follow-up needs --title")
	}
	return s.mutate(func(tx *sql.Tx) (string, error) {
		id, err := topicID(tx, slug)
		if err != nil {
			return "", err
		}
		var next int
		if err := tx.QueryRow("SELECT coalesce(max(position),0)+1 FROM roadmap_followups WHERE topic_id=?", id).Scan(&next); err != nil {
			return "", err
		}
		_, err = tx.Exec("INSERT INTO roadmap_followups(topic_id,position,title,description,chosen) VALUES(?,?,?,?,0)", id, next, title, description)
		return slug, err
	})
}

// FollowupChoose marks follow-up n (1-based) of a topic as the chosen project and clears the rest:
// the roadmap proposes a set of optional projects and the learner picks one per topic.
func (s Store) FollowupChoose(slug string, n int) (Topic, error) {
	return s.mutate(func(tx *sql.Tx) (string, error) {
		id, err := followupID(tx, slug, n)
		if err != nil {
			return "", err
		}
		if _, err := tx.Exec("UPDATE roadmap_followups SET chosen=0 WHERE topic_id=(SELECT topic_id FROM roadmap_followups WHERE id=?)", id); err != nil {
			return "", err
		}
		_, err = tx.Exec("UPDATE roadmap_followups SET chosen=1 WHERE id=?", id)
		return slug, err
	})
}

// FollowupRemove deletes follow-up n (1-based) of a topic and closes the gap in the numbering.
func (s Store) FollowupRemove(slug string, n int) (Topic, error) {
	return s.mutate(func(tx *sql.Tx) (string, error) {
		id, err := followupID(tx, slug, n)
		if err != nil {
			return "", err
		}
		topic, err := topicID(tx, slug)
		if err != nil {
			return "", err
		}
		if _, err := tx.Exec("DELETE FROM roadmap_followups WHERE id=?", id); err != nil {
			return "", err
		}
		rows, err := tx.Query("SELECT id FROM roadmap_followups WHERE topic_id=? ORDER BY position", topic)
		if err != nil {
			return "", err
		}
		var ids []int64
		for rows.Next() {
			var fid int64
			if err := rows.Scan(&fid); err != nil {
				rows.Close()
				return "", err
			}
			ids = append(ids, fid)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return "", err
		}
		// Park the rows outside the positive range first: UNIQUE (topic_id, position) would
		// otherwise reject an intermediate collision while the numbers shift down.
		if _, err := tx.Exec("UPDATE roadmap_followups SET position=-id WHERE topic_id=?", topic); err != nil {
			return "", err
		}
		for i, fid := range ids {
			if _, err := tx.Exec("UPDATE roadmap_followups SET position=? WHERE id=?", i+1, fid); err != nil {
				return "", err
			}
		}
		return slug, nil
	})
}

// followupID resolves the 1-based follow-up number of a topic to a row id.
func followupID(tx *sql.Tx, slug string, n int) (int64, error) {
	id, err := topicID(tx, slug)
	if err != nil {
		return 0, err
	}
	var count int
	if err := tx.QueryRow("SELECT count(*) FROM roadmap_followups WHERE topic_id=?", id).Scan(&count); err != nil {
		return 0, err
	}
	if n < 1 || n > count {
		return 0, fmt.Errorf("topic %q has no follow-up %d (it has %d)", slug, n, count)
	}
	var followup int64
	err = tx.QueryRow("SELECT id FROM roadmap_followups WHERE topic_id=? ORDER BY position LIMIT 1 OFFSET ?", id, n-1).Scan(&followup)
	return followup, err
}

// mutate runs one mutating operation inside a transaction, stamps the change and returns the
// affected topic, which every mutating command prints in the show format.
func (s Store) mutate(fn func(*sql.Tx) (string, error)) (Topic, error) {
	var topic Topic
	err := s.withTx(func(tx *sql.Tx) error {
		slug, err := fn(tx)
		if err != nil {
			return err
		}
		if err := markChanged(tx); err != nil {
			return err
		}
		topic, err = readTopic(tx, slug)
		return err
	})
	if err != nil {
		return Topic{}, err
	}
	return topic, nil
}

// trackIDs lists the row ids of one track in position order.
func trackIDs(q queryer, track string) ([]int64, error) {
	rows, err := q.Query("SELECT id FROM roadmap_topics WHERE track=? ORDER BY position", track)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// placeAfter moves slug directly after the topic named by after within the same track; an empty
// after moves it to the front. It rewrites the whole track so positions remain 1..n with no gaps.
func placeAfter(tx *sql.Tx, slug, after string) error {
	if slug == after {
		return fmt.Errorf("cannot place topic %q after itself", slug)
	}
	moved, err := readTopic(tx, slug)
	if err != nil {
		return err
	}
	movedID, err := topicID(tx, slug)
	if err != nil {
		return err
	}
	var anchorID int64
	if after != "" {
		anchor, err := readTopic(tx, after)
		if err != nil {
			return err
		}
		if anchor.Track != moved.Track {
			return fmt.Errorf("topic %q is in track %s, not %s", after, anchor.Track, moved.Track)
		}
		if anchorID, err = topicID(tx, after); err != nil {
			return err
		}
	}
	current, err := trackIDs(tx, moved.Track)
	if err != nil {
		return err
	}
	order := make([]int64, 0, len(current))
	if after == "" {
		order = append(order, movedID)
	}
	for _, id := range current {
		if id == movedID {
			continue
		}
		order = append(order, id)
		if id == anchorID && after != "" {
			order = append(order, movedID)
		}
	}
	return resequence(tx, order)
}

// resequence numbers the given rows 1..n in order. Positions are first parked at -id because
// UNIQUE (track, position) would reject a collision partway through the renumbering.
func resequence(tx *sql.Tx, order []int64) error {
	for _, id := range order {
		if _, err := tx.Exec("UPDATE roadmap_topics SET position=-id WHERE id=?", id); err != nil {
			return err
		}
	}
	for i, id := range order {
		if _, err := tx.Exec("UPDATE roadmap_topics SET position=? WHERE id=?", i+1, id); err != nil {
			return err
		}
	}
	return nil
}

// StaleExportNote returns the note a mutating command appends when the committed snapshot no
// longer matches the database: the file is missing, it is older than the recorded exported_at, or
// the database changed after the last export. The second return value is false when nothing should
// be printed.
func (s Store) StaleExportNote(file string) (string, bool) {
	const note = "Note: run tutor roadmap export to update roadmap.json"
	db, err := s.openRead()
	if err != nil {
		return "", false
	}
	defer db.Close()
	exported, err := getMeta(db, metaExportedAt)
	if err != nil {
		return "", false
	}
	changed, err := getMeta(db, metaChangedAt)
	if err != nil {
		return "", false
	}
	info, statErr := os.Stat(file)
	if statErr != nil {
		if errors.Is(statErr, fs.ErrNotExist) {
			return note, true
		}
		return "", false
	}
	if exported == "" {
		return note, true
	}
	exportedAt, err := time.Parse(timeLayout, exported)
	if err != nil {
		return note, true
	}
	if info.ModTime().UTC().Before(exportedAt) {
		return note, true
	}
	if changedAt, err := time.Parse(timeLayout, changed); err == nil && changedAt.After(exportedAt) {
		return note, true
	}
	return "", false
}
