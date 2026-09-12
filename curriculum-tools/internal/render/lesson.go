package render

import (
	"fmt"
	"strings"

	"skills-tools/tutor/internal/course"
)

// LessonRecord is the ordered, omitempty JSON shape of one lesson (port of main.ts cleanLesson).
// Field order is significant: it is the exact key order printed by `lesson --json` and by every
// command that emits an array of lessons (list --json, search --json, next --json).
type LessonRecord struct {
	Ordinal          int      `json:"ordinal"`
	Slug             string   `json:"slug"`
	Title            string   `json:"title"`
	Category         string   `json:"category"`
	Difficulty       string   `json:"difficulty"`
	Tags             []string `json:"tags"`
	Status           string   `json:"status"`
	Sessions         int      `json:"sessions"`
	RunIn            string   `json:"runIn"`
	SafetyLevel      string   `json:"safetyLevel"`
	MinVersion       string   `json:"minVersion"`
	EstimatedMinutes int      `json:"estimatedMinutes"`
	Overview         string   `json:"overview"`
	SyntaxBreakdown  string   `json:"syntaxBreakdown"`
	Caution          string   `json:"caution,omitempty"`
	Setup            string   `json:"setup,omitempty"`
	Code             string   `json:"code"`
	ExpectedResult   string   `json:"expectedResult"`
	SystemsLens      string   `json:"systemsLens"`
	Challenge        string   `json:"challenge,omitempty"`
	Notes            string   `json:"notes,omitempty"`
}

// BuildLessonRecord assembles the ordered JSON view of a lesson. status is the already-resolved
// value ("todo"|"done"|"skipped"|"stale"); notes is the learner's saved note, if any.
func BuildLessonRecord(l course.Lesson, status, notes string) LessonRecord {
	tags := l.Tags
	if tags == nil {
		tags = []string{}
	}
	return LessonRecord{
		Ordinal:          l.Ordinal,
		Slug:             l.Slug,
		Title:            l.Title,
		Category:         l.Category,
		Difficulty:       l.Difficulty,
		Tags:             tags,
		Status:           status,
		Sessions:         l.Sessions,
		RunIn:            l.RunIn,
		SafetyLevel:      l.SafetyLevel,
		MinVersion:       l.MinVersion,
		EstimatedMinutes: l.EstimatedMinutes,
		Overview:         l.Overview,
		SyntaxBreakdown:  l.SyntaxBreakdown,
		Caution:          l.Caution,
		Setup:            l.Setup,
		Code:             l.Code,
		ExpectedResult:   l.ExpectedResult,
		SystemsLens:      l.SystemsLens,
		Challenge:        l.Challenge,
		Notes:            notes,
	}
}

// LessonJSON renders one lesson as JSON in the exact key order the Deno engine used (ordinal,
// slug, title, category, difficulty, tags, status, sessions, runIn, safetyLevel, minVersion,
// estimatedMinutes, overview, syntaxBreakdown, caution?, setup?, code, expectedResult,
// systemsLens, challenge?, notes?), two-space indent, no trailing newline.
func LessonJSON(l course.Lesson, status, notes string) ([]byte, error) {
	return JSON(BuildLessonRecord(l, status, notes))
}

func fence(lang, body string) string {
	return "```" + lang + "\n" + body + "\n```"
}

// quoteDBFlag renders the " --db '<path>'" suffix appended to the "done" hint in RenderLesson.
// raw is the --db flag exactly as the user typed it; empty when the flag was not given.
func quoteDBFlag(raw string) string {
	if raw == "" {
		return ""
	}
	return " --db '" + strings.ReplaceAll(raw, "'", `'\''`) + "'"
}

// RenderLesson renders a lesson as Markdown: a title, a metadata block (two trailing spaces per
// line so each is a Markdown hard break), then one "## " section per field. dbFlag is the raw
// --db value as typed by the user ("" when absent); it is quoted into the trailing "done" hint.
// This is a byte-for-byte port of main.ts renderLesson/cleanLesson/fence.
func RenderLesson(c course.Course, l course.Lesson, notes, dbFlag string) string {
	var runIn string
	switch l.RunIn {
	case "tool":
		runIn = c.Tool
	case "shell":
		runIn = "shell"
	default: // "mixed"
		runIn = c.Tool + " + shell"
	}
	sessions := ""
	if l.Sessions > 1 {
		sessions = fmt.Sprintf(", %d %s sessions", l.Sessions, c.Tool)
	}
	lang := course.CodeLanguage(c, l.RunIn)

	meta := []string{
		fmt.Sprintf("**Meta:** %s | %s | ~%d min | run in %s%s | %s",
			l.Category, l.Difficulty, l.EstimatedMinutes, runIn, sessions, l.SafetyLevel),
	}
	if len(l.Tags) > 0 {
		meta = append(meta, "**Topics:** "+strings.Join(l.Tags, ", "))
	}
	meta = append(meta, fmt.Sprintf("Lesson ID: %d", l.Ordinal))

	parts := []string{
		fmt.Sprintf("# Lesson %d: %s", l.Ordinal, l.Title),
		strings.Join(meta, "  \n"),
	}
	section := func(name, body string) {
		parts = append(parts, fmt.Sprintf("## %s\n%s", name, body))
	}
	section("Overview", l.Overview)
	section("Syntax breakdown", l.SyntaxBreakdown)
	if l.Caution != "" {
		section("Caution", l.Caution)
	}
	if l.Setup != "" {
		section("Setup", fence(lang, l.Setup))
	}
	section("Run", fence(lang, l.Code))
	section("Expected result", l.ExpectedResult)
	section("Systems lens", l.SystemsLens)
	if l.Challenge != "" {
		section("Optional variation", l.Challenge)
	}
	if notes != "" {
		section("Your note", notes)
	}
	parts = append(parts, fmt.Sprintf("When you consider it complete: `tutor %s %d done%s`.", c.PublicName(), l.Ordinal, quoteDBFlag(dbFlag)))
	return strings.Join(parts, "\n\n")
}
