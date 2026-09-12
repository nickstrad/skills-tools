package route

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	_ "modernc.org/sqlite"

	"skills-tools/tutor/internal/course"
)

func decodeJSON(text string, v interface{}) error {
	return json.Unmarshal([]byte(text), v)
}

// cellsRE matches a full Markdown table row (leading/trailing pipe, allowing surrounding
// whitespace).
var cellsRE = regexp.MustCompile(`^\s*\|.*\|\s*$`)
var separatorCellRE = regexp.MustCompile(`^:?-{2,}:?$`)
var headerSlugColRE = regexp.MustCompile(`(?i)^Lesson\s*/\s*stable\s+slug$`)
var fenceRE = regexp.MustCompile("^\\s*(`{3,}|~{3,})")
var slugInCellRE = regexp.MustCompile("`([^`]+)`")
var slugRE = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var trailingSepRE = regexp.MustCompile(`\s*[/([—–:-]\s*$`)
var courseIDRE = regexp.MustCompile("(?i)course id:\\s*`([^`]+)`")
var courseNameRE = regexp.MustCompile(`(?m)^#\s+(.+)$`)
var planStatusRE = regexp.MustCompile(`(?im)^Status:\s*(proposed|agreed|current|reference)\b`)

// cells splits a table row into trimmed cell strings, or returns nil if the line is not a table
// row (must start and end with "|", allowing surrounding whitespace).
func cells(line string) []string {
	if !cellsRE.MatchString(line) {
		return nil
	}
	trimmed := strings.TrimSpace(line)
	inner := trimmed[1 : len(trimmed)-1]
	parts := strings.Split(inner, "|")
	out := make([]string, len(parts))
	for i, p := range parts {
		out[i] = strings.TrimSpace(p)
	}
	return out
}

func isSeparator(line string) bool {
	row := cells(line)
	if len(row) == 0 {
		return false
	}
	for _, c := range row {
		if !separatorCellRE.MatchString(c) {
			return false
		}
	}
	return true
}

func canonicalHeader(row []string) bool {
	if len(row) < 2 {
		return false
	}
	if row[0] != "#" {
		return false
	}
	return headerSlugColRE.MatchString(row[1])
}

func isFence(line string) bool {
	return fenceRE.MatchString(line)
}

func lineError(line int, message string) error {
	return fmt.Errorf("Canonical route line %d: %s", line, message)
}

// parseCanonical parses only the canonical numbered route table. found reports whether a
// canonical header was present at all (mirrors the Deno `undefined` return).
func parseCanonical(markdown string) (entries []Entry, found bool, err error) {
	lines := strings.Split(markdown, "\n")
	inFence := false
	headerLine := -1
	for i := 0; i < len(lines); i++ {
		if isFence(lines[i]) {
			inFence = !inFence
			continue
		}
		if inFence || !canonicalHeader(cells(lines[i])) {
			continue
		}
		if headerLine >= 0 {
			return nil, false, lineError(i+1, "multiple canonical route tables are not allowed")
		}
		headerLine = i
	}
	if headerLine < 0 {
		return nil, false, nil
	}
	if headerLine+1 >= len(lines) || !isSeparator(lines[headerLine+1]) {
		return nil, false, lineError(headerLine+2, "canonical route needs a separator row after its header")
	}

	var result []Entry
	seenSlugs := map[string]int{}
	inRouteFence := false
	for i := headerLine + 2; i < len(lines); i++ {
		if isFence(lines[i]) {
			inRouteFence = !inRouteFence
			continue
		}
		if inRouteFence {
			continue
		}
		row := cells(lines[i])
		if row == nil {
			if strings.HasPrefix(strings.TrimSpace(lines[i]), "|") {
				return nil, false, lineError(i+1, "route row must end with a pipe")
			}
			break
		}
		if len(row) < 2 {
			return nil, false, lineError(i+1, "route row needs an ordinal and title/slug cell")
		}
		if !isDigits(row[0]) {
			return nil, false, lineError(i+1, fmt.Sprintf("route row has malformed ordinal '%s'", row[0]))
		}
		ordinal, convErr := strconv.Atoi(row[0])
		if convErr != nil || ordinal < 1 {
			return nil, false, lineError(i+1, fmt.Sprintf("route row has malformed ordinal '%s'", row[0]))
		}
		slugMatches := slugInCellRE.FindAllStringSubmatchIndex(row[1], -1)
		if len(slugMatches) != 1 {
			return nil, false, lineError(i+1, fmt.Sprintf("lesson %d needs exactly one stable slug in backticks", ordinal))
		}
		m := slugMatches[0]
		slug := row[1][m[2]:m[3]]
		if !slugRE.MatchString(slug) {
			return nil, false, lineError(i+1, fmt.Sprintf("stable slug '%s' must use lowercase kebab-case", slug))
		}
		titlePart := row[1][:m[0]]
		titlePart = strings.ReplaceAll(titlePart, "**", "")
		titlePart = trailingSepRE.ReplaceAllString(titlePart, "")
		title := strings.TrimSpace(titlePart)
		if title == "" {
			return nil, false, lineError(i+1, fmt.Sprintf("lesson %d has no title before '%s'", ordinal, slug))
		}
		if len(result)+1 != ordinal {
			return nil, false, lineError(i+1, fmt.Sprintf("expected lesson %d, found %d", len(result)+1, ordinal))
		}
		if previous, dup := seenSlugs[slug]; dup {
			return nil, false, lineError(i+1, fmt.Sprintf("duplicate stable slug '%s' (already lesson %d)", slug, previous))
		}
		seenSlugs[slug] = ordinal
		result = append(result, Entry{Ordinal: ordinal, Slug: slug, Title: title})
	}
	if len(result) == 0 {
		return nil, false, lineError(headerLine+1, "canonical route table has no lesson rows")
	}
	return result, true, nil
}

// ParseCanonical parses the canonical numbered route table in markdown. found is false when no
// canonical header is present anywhere in the document (mirroring the Deno `undefined` return);
// entries is nil in that case.
func ParseCanonical(markdown string) ([]Entry, bool, error) {
	return parseCanonical(markdown)
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// PlanFile is a located Markdown plan: a future-course route or an installed course's PLAN.md.
type PlanFile struct {
	Path     string
	Markdown string
	Future   bool
}

func readOptional(path string) (string, bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, err
	}
	return string(data), true, nil
}

func futurePlans(toolRoot string) ([]PlanFile, error) {
	root, err := filepath.Abs(filepath.Join(toolRoot, "..", "future-courses"))
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(root)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var plans []PlanFile
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		path, err := filepath.Abs(filepath.Join(root, e.Name(), "course.md"))
		if err != nil {
			return nil, err
		}
		markdown, ok, err := readOptional(path)
		if err != nil {
			return nil, err
		}
		if ok {
			plans = append(plans, PlanFile{Path: path, Markdown: markdown, Future: true})
		}
	}
	return plans, nil
}

// LocatePlan locates the future plan first and rejects duplicate future identities, even beside a
// course PLAN.md. It returns nil, nil when no plan exists for id.
func LocatePlan(root, id string) (*PlanFile, error) {
	plans, err := futurePlans(root)
	if err != nil {
		return nil, err
	}
	var matches []PlanFile
	for _, p := range plans {
		m := courseIDRE.FindStringSubmatch(p.Markdown)
		if m != nil && m[1] == id {
			matches = append(matches, p)
		}
	}
	if len(matches) > 1 {
		return nil, fmt.Errorf("Multiple future-course plans declare %s", id)
	}
	if len(matches) == 1 {
		found := matches[0]
		return &found, nil
	}
	path, err := filepath.Abs(filepath.Join(root, "courses", id, "PLAN.md"))
	if err != nil {
		return nil, err
	}
	markdown, ok, err := readOptional(path)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}
	return &PlanFile{Path: path, Markdown: markdown, Future: false}, nil
}

// PlanRoute is a canonical route read from a plan file.
type PlanRoute struct {
	Entries  []Entry
	Path     string
	Markdown string
}

// ReadPlan reads the canonical route for id. A future plan must contain the canonical table; old
// installed plans without one return nil, nil (mirroring the Deno `undefined` fallback). Returns
// nil, nil when no plan exists at all.
func ReadPlan(root, id string) (*PlanRoute, error) {
	plan, err := LocatePlan(root, id)
	if err != nil {
		return nil, err
	}
	if plan == nil {
		return nil, nil
	}
	entries, found, err := parseCanonical(plan.Markdown)
	if err != nil {
		return nil, err
	}
	if !found {
		if plan.Future {
			return nil, fmt.Errorf("Future course plan %s has no canonical route table", plan.Path)
		}
		return nil, nil
	}
	return &PlanRoute{Entries: entries, Path: plan.Path, Markdown: plan.Markdown}, nil
}

// ValidateRouteCatalog reports a mismatch between the canonical route and the authored catalog.
// A nil route or an empty catalog is always accepted.
func ValidateRouteCatalog(route []Entry, catalog []course.Lesson) error {
	if route == nil || len(catalog) == 0 {
		return nil
	}
	for _, lesson := range catalog {
		if lesson.Ordinal < 1 || lesson.Ordinal > len(route) {
			return fmt.Errorf(
				"Route/catalog mismatch: authored lesson %d '%s' is beyond the %d-lesson canonical route",
				lesson.Ordinal, lesson.Slug, len(route),
			)
		}
		planned := route[lesson.Ordinal-1]
		if planned.Slug != lesson.Slug {
			return fmt.Errorf(
				"Route/catalog mismatch at lesson %d: plan has '%s', catalog has '%s' (update the canonical plan or preserve the stable identity)",
				lesson.Ordinal, planned.Slug, lesson.Slug,
			)
		}
	}
	return nil
}

// ReadPlanAndCatalog reads the canonical plan and validates it against catalog, falling back to a
// route derived from the catalog itself when no plan exists.
func ReadPlanAndCatalog(root, id string, catalog []course.Lesson) (PlanRoute, error) {
	plan, err := ReadPlan(root, id)
	if err != nil {
		return PlanRoute{}, err
	}
	var entries []Entry
	if plan != nil {
		entries = plan.Entries
	}
	if err := ValidateRouteCatalog(entries, catalog); err != nil {
		return PlanRoute{}, err
	}
	if plan != nil {
		return *plan, nil
	}
	fallback := make([]Entry, 0, len(catalog))
	for _, l := range catalog {
		fallback = append(fallback, Entry{Ordinal: l.Ordinal, Slug: l.Slug, Title: l.Title})
	}
	return PlanRoute{Entries: fallback}, nil
}

// loadCatalog returns the authored lesson catalog for id, or an empty slice when the course has
// no lessons directory at all. A lessons directory that exists but fails to parse is an error.
func loadCatalog(root, id string) ([]course.Lesson, error) {
	dir, err := course.LessonsDir(root, id)
	if err != nil {
		return nil, err
	}
	if _, statErr := os.Stat(dir); os.IsNotExist(statErr) {
		return nil, nil
	} else if statErr != nil {
		return nil, statErr
	}
	return course.LoadLessons(root, id)
}

func courseName(markdown string, hasMarkdown bool, fallback string) string {
	if !hasMarkdown {
		return fallback
	}
	m := courseNameRE.FindStringSubmatch(markdown)
	if m == nil {
		return fallback
	}
	name := strings.TrimSpace(m[1])
	if name == "" {
		return fallback
	}
	return name
}

func planStatus(markdown string) string {
	m := planStatusRE.FindStringSubmatch(markdown)
	if m == nil {
		return "proposed"
	}
	status := strings.ToLower(m[1])
	switch status {
	case "agreed", "current", "reference":
		return status
	default:
		return "proposed"
	}
}

// courseMetadata mirrors the fields of course.json that discovery reads directly, kept separate
// from course.Course so that a metadata.status of "" still defaults correctly per the Deno
// behavior (metadata.status ?? "current").
type courseMetadata struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Tool        string `json:"tool"`
	Status      string `json:"status"`
}

// DiscoverCourses discovers installed courses and future plans without creating or mutating
// learner state.
func DiscoverCourses(root string) ([]CourseDiscovery, error) {
	found := map[string]CourseDiscovery{}

	coursesDir := filepath.Join(root, "courses")
	entries, err := os.ReadDir(coursesDir)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	if err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			courseRoot := filepath.Join(coursesDir, e.Name())
			text, ok, err := readOptional(filepath.Join(courseRoot, "course.json"))
			if err != nil {
				return nil, err
			}
			if !ok {
				continue
			}
			var metadata courseMetadata
			if err := decodeJSON(text, &metadata); err != nil {
				return nil, fmt.Errorf("%s: %w", filepath.Join(courseRoot, "course.json"), err)
			}
			if metadata.ID != e.Name() {
				continue
			}
			catalog, err := loadCatalog(root, e.Name())
			if err != nil {
				return nil, err
			}
			located, err := LocatePlan(root, e.Name())
			if err != nil {
				return nil, err
			}
			plan, err := ReadPlan(root, e.Name())
			if err != nil {
				return nil, err
			}
			var routeEntries []Entry
			if plan != nil {
				routeEntries = plan.Entries
			}
			if err := ValidateRouteCatalog(routeEntries, catalog); err != nil {
				return nil, err
			}
			status := metadata.Status
			if status == "" {
				status = "current"
			}
			total := len(catalog)
			if plan != nil {
				total = len(plan.Entries)
			}
			disc := CourseDiscovery{
				ID:          e.Name(),
				Name:        firstNonEmpty(metadata.Name, e.Name()),
				Description: metadata.Description,
				Tool:        metadata.Tool,
				Status:      status,
				Implemented: true,
				Planned:     false,
				Authored:    len(catalog),
				Available:   len(catalog),
				Total:       total,
			}
			if located != nil {
				disc.PlanPath = located.Path
			}
			found[e.Name()] = disc
		}
	}

	plans, err := futurePlans(root)
	if err != nil {
		return nil, err
	}
	for _, plan := range plans {
		m := courseIDRE.FindStringSubmatch(plan.Markdown)
		if m == nil {
			continue
		}
		id := m[1]
		for _, existing := range found {
			if existing.Planned && existing.ID == id {
				return nil, fmt.Errorf("Multiple future-course plans declare %s", id)
			}
		}
		if existing, ok := found[id]; ok {
			if existing.PlanPath == "" {
				existing.PlanPath = plan.Path
				found[id] = existing
			}
			continue
		}
		entries, foundHeader, err := parseCanonical(plan.Markdown)
		if err != nil {
			return nil, err
		}
		if !foundHeader {
			return nil, fmt.Errorf("Future course plan %s has no canonical route table", plan.Path)
		}
		found[id] = CourseDiscovery{
			ID:          id,
			Name:        courseName(plan.Markdown, true, id),
			Description: "",
			Status:      planStatus(plan.Markdown),
			Implemented: false,
			Planned:     true,
			Authored:    0,
			Available:   0,
			Total:       len(entries),
			PlanPath:    plan.Path,
		}
	}

	result := make([]CourseDiscovery, 0, len(found))
	for _, d := range found {
		result = append(result, d)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result, nil
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// LoadRoute builds the learner-facing route of one course, reading progress read-only if dbPath
// exists and has a progress table. It never creates or modifies a database.
func LoadRoute(root, id, dbPath string) (Route, error) {
	courseRoot := filepath.Join(root, "courses", id)
	metadataText, hasMetadata, err := readOptional(filepath.Join(courseRoot, "course.json"))
	if err != nil {
		return Route{}, err
	}
	var metadata course.Course
	if hasMetadata {
		if err := decodeJSON(metadataText, &metadata); err != nil {
			return Route{}, fmt.Errorf("%s: %w", filepath.Join(courseRoot, "course.json"), err)
		}
	}
	catalog, err := loadCatalog(root, id)
	if err != nil {
		return Route{}, err
	}
	plan, err := ReadPlanAndCatalog(root, id, catalog)
	if err != nil {
		return Route{}, err
	}
	if !hasMetadata && len(plan.Entries) == 0 {
		return Route{}, fmt.Errorf("Unknown course '%s'", id)
	}

	progress := map[string]progressRow{}
	if _, statErr := os.Stat(dbPath); statErr == nil {
		if err := readProgress(dbPath, progress); err != nil {
			return Route{}, err
		}
	} else if !os.IsNotExist(statErr) {
		return Route{}, statErr
	}

	available := map[string]course.Lesson{}
	for _, l := range catalog {
		available[l.Slug] = l
	}

	name := metadata.Name
	if !hasMetadata {
		name = courseName(plan.Markdown, plan.Markdown != "", id)
	}

	lessons := make([]RouteEntry, 0, len(plan.Entries))
	for _, entry := range plan.Entries {
		authored, isAvailable := available[entry.Slug]
		saved, hasSaved := progress[entry.Slug]
		completed := isAvailable && hasSaved && saved.status == "done"
		var stale bool
		if completed {
			stale = !saved.completedRevision.Valid || saved.completedRevision.Int64 != int64(authored.Revision)
		}
		lessons = append(lessons, RouteEntry{
			Ordinal:   entry.Ordinal,
			Slug:      entry.Slug,
			Title:     entry.Title,
			Available: isAvailable,
			Done:      completed && !stale,
			Stale:     stale,
		})
	}

	return Route{ID: id, Name: name, Lessons: lessons}, nil
}

type progressRow struct {
	status            string
	completedRevision sql.NullInt64
}

func readProgress(dbPath string, out map[string]progressRow) error {
	db, err := sql.Open("sqlite", "file:"+dbPath+"?mode=ro")
	if err != nil {
		return err
	}
	defer db.Close()

	var tableName string
	err = db.QueryRow(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='progress'",
	).Scan(&tableName)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}

	rows, err := db.Query(
		"SELECT l.slug,p.status,p.completed_revision FROM lessons l JOIN progress p ON p.lesson_id=l.id WHERE l.active=1",
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var slug, status string
		var completedRevision sql.NullInt64
		if err := rows.Scan(&slug, &status, &completedRevision); err != nil {
			return err
		}
		out[slug] = progressRow{status: status, completedRevision: completedRevision}
	}
	return rows.Err()
}
