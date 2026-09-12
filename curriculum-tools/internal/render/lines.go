package render

import (
	"fmt"
	"strconv"
	"strings"

	"skills-tools/tutor/internal/route"
)

// ListItem is one row of `tutor <course> list`.
type ListItem struct {
	Ordinal  int
	Status   string // "todo" | "done" | "skipped"
	Stale    bool
	Category string
	Title    string
	Sessions int
	Tags     []string
}

// List renders the `list` command's line format: "{ordinal:>3}  {status:<7} [{category}]
// {title}{ (N sessions)}{  {tag,tag}}", one line per item joined by "\n". Status prints as
// "stale" when Stale is set (its Status field still carries the underlying "done"). Byte-for-byte
// port of the `list` branch of main.ts run().
func List(items []ListItem) string {
	if len(items) == 0 {
		return "No lessons found."
	}
	lines := make([]string, 0, len(items))
	for _, it := range items {
		status := it.Status
		if it.Stale {
			status = "stale"
		}
		line := fmt.Sprintf("%3d  %-7s [%s] %s", it.Ordinal, status, it.Category, it.Title)
		if it.Sessions > 1 {
			line += fmt.Sprintf(" (%d sessions)", it.Sessions)
		}
		if len(it.Tags) > 0 {
			line += "  {" + strings.Join(it.Tags, ",") + "}"
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

// Topic is one row of `tutor <course> topics`.
type Topic struct {
	Tag     string `json:"tag"`
	First   int    `json:"first"`
	Total   int    `json:"total"`
	Done    int    `json:"done"`
	Lessons []int  `json:"lessons"`
}

// Topics renders the `topics` command's line format: "{tag:<28} {done:>2}/{total:<3} done
// lessons {1,4,9}", one line per topic (already sorted by first ordinal) joined by "\n".
func Topics(topics []Topic) string {
	if len(topics) == 0 {
		return "No topics tagged yet."
	}
	lines := make([]string, 0, len(topics))
	for _, t := range topics {
		lines = append(lines, fmt.Sprintf("%-28s %2d/%-3d done  lessons %s", t.Tag, t.Done, t.Total, joinInts(t.Lessons)))
	}
	return strings.Join(lines, "\n")
}

// Module is one row of `tutor <course> modules`.
type Module struct {
	Category string `json:"category"`
	First    int    `json:"first"`
	Last     int    `json:"last"`
	Total    int    `json:"total"`
	Done     int    `json:"done"`
	Minutes  int    `json:"minutes"`
}

// Modules renders the `modules` command's line format: "{first:>3}-{last:<3} {category:<26}
// {done}/{total} done  ~{minutes} min", one line per module joined by "\n". An empty slice
// renders as "" (the Deno engine printed an empty string here, unlike the other list formats).
func Modules(modules []Module) string {
	lines := make([]string, 0, len(modules))
	for _, m := range modules {
		lines = append(lines, fmt.Sprintf("%3d-%-3d %-26s %d/%d done  ~%d min", m.First, m.Last, m.Category, m.Done, m.Total, m.Minutes))
	}
	return strings.Join(lines, "\n")
}

// Status is the payload of `tutor <course> status`.
type Status struct {
	Course  string `json:"course"`
	Total   int    `json:"total"`
	Done    int    `json:"done"`
	Todo    int    `json:"todo"`
	Skipped int    `json:"skipped"`
	Stale   int    `json:"stale"`
}

// StatusLine renders the `status` command's line format: "{name}: {done}/{total} done; {todo}
// remaining; {skipped} skipped; {stale} stale."
func StatusLine(name string, s Status) string {
	return fmt.Sprintf("%s: %d/%d done; %d remaining; %d skipped; %d stale.", name, s.Done, s.Total, s.Todo, s.Skipped, s.Stale)
}

// SearchItem is one row of `tutor <course> search`.
type SearchItem struct {
	Ordinal  int
	Category string
	Title    string
}

// Search renders the `search` command's line format: "{ordinal:>3}  [{category}] {title}", one
// line per item joined by "\n".
func Search(items []SearchItem) string {
	if len(items) == 0 {
		return "No lessons found."
	}
	lines := make([]string, 0, len(items))
	for _, it := range items {
		lines = append(lines, fmt.Sprintf("%3d  [%s] %s", it.Ordinal, it.Category, it.Title))
	}
	return strings.Join(lines, "\n")
}

// Courses renders the `tutor courses` line format: "{id} — {name} [{status}] ·
// {available}/{total} available\n  tutor {id} route", entries joined by "\n\n".
func Courses(list []route.CourseDiscovery) string {
	if len(list) == 0 {
		return "No courses found."
	}
	entries := make([]string, 0, len(list))
	for _, c := range list {
		entries = append(entries, fmt.Sprintf("%s — %s [%s] · %d/%d available\n  tutor %s route",
			c.ID, c.Name, c.Status, c.Available, c.Total, c.ID))
	}
	return strings.Join(entries, "\n\n")
}

func joinInts(values []int) string {
	parts := make([]string, len(values))
	for i, v := range values {
		parts[i] = strconv.Itoa(v)
	}
	return strings.Join(parts, ",")
}
