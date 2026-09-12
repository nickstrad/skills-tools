package render

import (
	"fmt"
	"strings"

	"skills-tools/tutor/internal/route"
)

// RenderRoute renders a course's learner-facing route as Markdown. Byte-for-byte port of
// route.ts renderRoute.
func RenderRoute(r route.Route) string {
	completed := 0
	for _, entry := range r.Lessons {
		if entry.Done {
			completed++
		}
	}
	lines := make([]string, 0, len(r.Lessons))
	for _, entry := range r.Lessons {
		mark := ""
		switch {
		case entry.Done:
			mark = "[done] "
		case entry.Stale:
			mark = "[revisit] "
		case entry.Skipped:
			mark = "[skipped] "
		}
		availability := "planned"
		if entry.Available {
			availability = "available"
		}
		lines = append(lines, fmt.Sprintf("%d. %s%s — %s", entry.Ordinal, mark, entry.Title, availability))
	}
	return fmt.Sprintf("# %s — %d lessons, %d done\n\n", r.Name, len(r.Lessons), completed) +
		"[done] marks completion of the current lesson revision; [skipped] lessons are excluded from next selection. Planned lessons are not yet available.\n\n" +
		strings.Join(lines, "\n")
}
