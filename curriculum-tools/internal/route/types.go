// Package route parses canonical Markdown routes, discovers courses and merges progress into a
// route view. It never creates or modifies a database.
package route

// Entry is one row of a canonical route table.
type Entry struct {
	Ordinal int    `json:"ordinal"`
	Slug    string `json:"slug"`
	Title   string `json:"title"`
}

// RouteEntry is a route row merged with authored and progress state.
type RouteEntry struct {
	Ordinal   int    `json:"ordinal"`
	Slug      string `json:"slug"`
	Title     string `json:"title"`
	Available bool   `json:"available"`
	Done      bool   `json:"done"`
	Skipped   bool   `json:"skipped"`
	Stale     bool   `json:"stale"`
}

// Route is the learner-facing route of one course.
type Route struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Lessons []RouteEntry `json:"lessons"`
}

// CourseDiscovery describes an installed course or a plan-only future course.
type CourseDiscovery struct {
	ID          string `json:"id"`
	StoredID    string `json:"-"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Tool        string `json:"tool,omitempty"`
	Status      string `json:"status"`
	Implemented bool   `json:"implemented"`
	Planned     bool   `json:"planned"`
	Authored    int    `json:"authored"`
	Available   int    `json:"available"`
	Total       int    `json:"total"`
	PlanPath    string `json:"planPath,omitempty"`
}

// StorageID is the stable identity used for physical paths and progress joins.
func (c CourseDiscovery) StorageID() string {
	if c.StoredID != "" {
		return c.StoredID
	}
	return c.ID
}
