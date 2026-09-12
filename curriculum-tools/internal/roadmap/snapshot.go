// Package roadmap owns the learning roadmap: the committed JSON snapshot
// (curriculum-tools/roadmap/roadmap.json), the SQLite tables that hold the editable copy
// (curriculum-tools/tutor.sqlite), and the text the `tutor roadmap` commands print. See
// plan.md §3.5 for the schema, the JSON format and the output contract, both of which are fixed.
//
// The snapshot is the transport format: `tutor roadmap import` loads it into the database, every
// mutating command edits the database, and `tutor roadmap export` writes it back. An export of an
// unmodified import is byte-identical to the committed file.
package roadmap

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"skills-tools/tutor/internal/fsutil"
	"skills-tools/tutor/internal/render"
)

// Format is the only snapshot format version this package reads or writes.
const Format = 1

// Followup is one optional Go project proposed under a topic. Exactly one follow-up per topic may
// be Chosen.
type Followup struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Chosen      bool   `json:"chosen"`
}

// Topic is one roadmap entry. The JSON key order is fixed by plan.md §3.5; Course is an installed
// course id or "", Plan a repository-relative path to a future-course plan or "".
type Topic struct {
	Slug      string     `json:"slug"`
	Title     string     `json:"title"`
	Track     string     `json:"track"`
	Status    string     `json:"status"`
	Tool      string     `json:"tool"`
	Goals     string     `json:"goals"`
	Diagram   string     `json:"diagram"`
	Course    string     `json:"course"`
	Plan      string     `json:"plan"`
	Notes     string     `json:"notes"`
	Followups []Followup `json:"followups"`
}

// Snapshot is the whole roadmap file: the shared preamble plus the topics in track order. Array
// order is the position within a track.
type Snapshot struct {
	Format   int     `json:"format"`
	Preamble string  `json:"preamble"`
	Topics   []Topic `json:"topics"`
}

// Tracks are the roadmap sections, in display order.
var Tracks = []string{"main", "workshop", "branch"}

// Statuses are the accepted topic states.
var Statuses = []string{"planned", "active", "done", "deferred"}

// TrackTitles maps a track to its section heading in the roadmap view.
var TrackTitles = map[string]string{
	"main":     "## Main path",
	"workshop": "## Supporting workshops",
	"branch":   "## Optional branches",
}

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func valid(set []string, v string) bool {
	for _, s := range set {
		if s == v {
			return true
		}
	}
	return false
}

func list(set []string) string {
	out := ""
	for i, s := range set {
		if i > 0 {
			out += "|"
		}
		out += s
	}
	return out
}

// ValidateSlug rejects anything that is not a lower-case hyphenated slug.
func ValidateSlug(slug string) error {
	if !slugPattern.MatchString(slug) {
		return fmt.Errorf("invalid slug %q: use lower-case words joined by hyphens", slug)
	}
	return nil
}

// ValidateTrack rejects a track outside main|workshop|branch.
func ValidateTrack(track string) error {
	if !valid(Tracks, track) {
		return fmt.Errorf("invalid track %q: want %s", track, list(Tracks))
	}
	return nil
}

// ValidateStatus rejects a status outside planned|active|done|deferred.
func ValidateStatus(status string) error {
	if !valid(Statuses, status) {
		return fmt.Errorf("invalid status %q: want %s", status, list(Statuses))
	}
	return nil
}

// Validate checks a snapshot the way the database constraints would: a known format, unique valid
// slugs, and a valid track and status on every topic.
func (s Snapshot) Validate() error {
	if s.Format != Format {
		return fmt.Errorf("unsupported roadmap format %d: want %d", s.Format, Format)
	}
	seen := map[string]bool{}
	for i, t := range s.Topics {
		if err := ValidateSlug(t.Slug); err != nil {
			return fmt.Errorf("topic %d: %w", i+1, err)
		}
		if seen[t.Slug] {
			return fmt.Errorf("topic %d: duplicate slug %q", i+1, t.Slug)
		}
		seen[t.Slug] = true
		if t.Title == "" {
			return fmt.Errorf("topic %q: title is required", t.Slug)
		}
		if err := ValidateTrack(t.Track); err != nil {
			return fmt.Errorf("topic %q: %w", t.Slug, err)
		}
		if err := ValidateStatus(t.Status); err != nil {
			return fmt.Errorf("topic %q: %w", t.Slug, err)
		}
	}
	return nil
}

// ReadSnapshot decodes a roadmap JSON file, rejecting unknown keys and trailing data
// (fsutil.DecodeStrict) and then validating the content.
func ReadSnapshot(path string) (Snapshot, error) {
	f, err := os.Open(path)
	if err != nil {
		return Snapshot{}, err
	}
	defer f.Close()
	var s Snapshot
	if err := fsutil.DecodeStrict(f, &s); err != nil {
		return Snapshot{}, fmt.Errorf("%s: %w", path, err)
	}
	if err := s.Validate(); err != nil {
		return Snapshot{}, fmt.Errorf("%s: %w", path, err)
	}
	for i := range s.Topics {
		if s.Topics[i].Followups == nil {
			s.Topics[i].Followups = []Followup{}
		}
	}
	return s, nil
}

// MarshalSnapshot renders a snapshot exactly as the committed file is written: JSON.stringify-style
// two-space indent, no HTML escaping, one trailing newline. `tutor roadmap --json` prints the same
// structure (without the trailing newline, which Fprintln adds).
func MarshalSnapshot(s Snapshot) ([]byte, error) {
	for i := range s.Topics {
		if s.Topics[i].Followups == nil {
			s.Topics[i].Followups = []Followup{}
		}
	}
	if s.Topics == nil {
		s.Topics = []Topic{}
	}
	data, err := render.JSON(s)
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

// WriteSnapshot publishes a snapshot as path, replacing any existing file. The bytes are written
// to a fresh temporary file in the same directory with fsutil.PublishOnce (write, fsync, link) and
// then renamed over path, so a reader never sees a half-written roadmap. Export replaces the file,
// which is why this renames instead of relying on PublishOnce's no-clobber link.
func WriteSnapshot(path string, s Snapshot) error {
	data, err := MarshalSnapshot(s)
	if err != nil {
		return err
	}
	tmp, err := tempName(path)
	if err != nil {
		return err
	}
	if err := fsutil.PublishOnce(tmp, data); err != nil {
		return err
	}
	defer os.Remove(tmp)
	if err := os.Rename(tmp, path); err != nil {
		return err
	}
	return nil
}

// tempName picks an unused sibling path for the temporary export file. The random suffix keeps
// PublishOnce (which tolerates an existing file) from silently publishing stale bytes.
func tempName(path string) (string, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	name := "." + filepath.Base(path) + ".export-" + hex.EncodeToString(buf[:])
	tmp := filepath.Join(filepath.Dir(path), name)
	if _, err := os.Stat(tmp); err == nil {
		return "", errors.New(tmp + ": temporary export file already exists")
	}
	return tmp, nil
}
