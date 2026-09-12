package roadmap

import (
	"fmt"
	"path/filepath"
	"strings"

	"skills-tools/tutor/internal/route"
)

// CourseCount is the progress summary of a linked course. Known is false when the course id does
// not resolve to an installed course or a plan, in which case the view prints no counts.
type CourseCount struct {
	Authored int
	Total    int
	Done     int
	Known    bool
}

// Counter reports the progress summary of a linked course id. The CLI supplies DefaultCounter;
// tests supply a stub so no real learner database is opened.
type Counter func(courseID string) CourseCount

// DefaultCounter counts lessons with route.LoadRoute against the course's default progress
// database (courses/<id>/progress.sqlite). LoadRoute opens that database read-only and never
// creates it, so a course that was never initialized simply reports 0 done.
func DefaultCounter(root string) Counter {
	return func(courseID string) CourseCount {
		if courseID == "" {
			return CourseCount{}
		}
		db := filepath.Join(root, "courses", courseID, "progress.sqlite")
		r, err := route.LoadRoute(root, courseID, db)
		if err != nil {
			return CourseCount{}
		}
		count := CourseCount{Total: len(r.Lessons), Known: true}
		for _, l := range r.Lessons {
			if l.Available {
				count.Authored++
			}
			if l.Done {
				count.Done++
			}
		}
		return count
	}
}

// View renders the `tutor roadmap` overview of plan.md §3.5: the heading, the preamble, one
// section per non-empty track with numbered rows, and the footer. With followups, each topic's
// optional Go projects are listed underneath. The returned string has no trailing newline.
func View(s Snapshot, count Counter, followups bool) string {
	var b strings.Builder
	b.WriteString("# Learning roadmap\n")
	if s.Preamble != "" {
		b.WriteString("\n" + s.Preamble + "\n")
	}
	for _, track := range Tracks {
		topics := topicsIn(s, track)
		if len(topics) == 0 {
			continue
		}
		b.WriteString("\n" + TrackTitles[track] + "\n")
		for i, t := range topics {
			b.WriteString(topicRow(i+1, t, count) + "\n")
			if followups {
				for _, f := range t.Followups {
					b.WriteString(followupBullet(f) + "\n")
				}
			}
		}
	}
	b.WriteString("\nShow a topic: tutor roadmap show <slug>   (goals, diagram, optional Go follow-ups)")
	return b.String()
}

// topicsIn returns the topics of one track in snapshot order.
func topicsIn(s Snapshot, track string) []Topic {
	var out []Topic
	for _, t := range s.Topics {
		if t.Track == track {
			out = append(out, t)
		}
	}
	return out
}

// topicRow formats one roadmap line: the position, the status padded so the titles align, the
// title, and the linked course (with counts) or plan path.
func topicRow(n int, t Topic, count Counter) string {
	return strings.TrimRight(fmt.Sprintf("%2d. %-10s %s", n, "["+t.Status+"]", t.Title+courseInfo(t, count)), " ")
}

// courseInfo is the " — …" suffix of a roadmap row: a linked course shows its authored/total and
// done counts, a linked plan shows its path, and an unlinked topic shows nothing.
func courseInfo(t Topic, count Counter) string {
	if t.Course != "" {
		c := CourseCount{}
		if count != nil {
			c = count(t.Course)
		}
		if !c.Known {
			return " — " + t.Course
		}
		return fmt.Sprintf(" — %s: %d/%d authored, %d done", t.Course, c.Authored, c.Total, c.Done)
	}
	if t.Plan != "" {
		return " — plan: " + t.Plan
	}
	return ""
}

// followupBullet formats one optional project under a topic; [x] marks the chosen one.
func followupBullet(f Followup) string {
	mark := " "
	if f.Chosen {
		mark = "x"
	}
	line := fmt.Sprintf("   - [%s] %s", mark, f.Title)
	if f.Description != "" {
		line += ": " + f.Description
	}
	return line
}

// ShowText renders one topic for `tutor roadmap show <slug>`, which every mutating command also
// prints. The diagram sits inside a ```text fence so the Markdown styler leaves it alone. The
// returned string has no trailing newline.
func ShowText(t Topic) string {
	var b strings.Builder
	b.WriteString("# " + t.Title + "\n\n")
	fmt.Fprintf(&b, "**Slug:** %s | **Track:** %s | **Status:** %s\n", t.Slug, t.Track, t.Status)
	if t.Tool != "" {
		b.WriteString("\n## Tool\n" + t.Tool + "\n")
	}
	if t.Goals != "" {
		b.WriteString("\n## Goals\n" + t.Goals + "\n")
	}
	if t.Diagram != "" {
		b.WriteString("\n## Diagram\n```text\n" + t.Diagram + "\n```\n")
	}
	switch {
	case t.Course != "":
		b.WriteString("\n## Course\n" + t.Course + "\n")
	case t.Plan != "":
		b.WriteString("\n## Plan\n" + t.Plan + "\n")
	}
	if t.Notes != "" {
		b.WriteString("\n## Notes\n" + t.Notes + "\n")
	}
	if len(t.Followups) > 0 {
		b.WriteString("\n## Optional Go follow-ups\n")
		for i, f := range t.Followups {
			mark := " "
			if f.Chosen {
				mark = "x"
			}
			line := fmt.Sprintf("%2d. [%s] %s", i+1, mark, f.Title)
			if f.Description != "" {
				line += ": " + f.Description
			}
			b.WriteString(line + "\n")
		}
	}
	return strings.TrimRight(b.String(), "\n")
}
