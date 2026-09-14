package course

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Section names in file order. Setup and Run bodies are fenced blocks; the rest are prose.
const (
	secOverview  = "Overview"
	secSyntax    = "Syntax breakdown"
	secCaution   = "Caution"
	secSetup     = "Setup"
	secRun       = "Run"
	secExpected  = "Expected result"
	secLens      = "Systems lens"
	secChallenge = "Optional variation"
)

var sectionOrder = []string{secOverview, secSyntax, secCaution, secSetup, secRun, secExpected, secLens, secChallenge}
var requiredSections = map[string]bool{secOverview: true, secSyntax: true, secRun: true, secExpected: true, secLens: true}
var fencedSections = map[string]bool{secSetup: true, secRun: true}

var headerKeys = []string{"slug", "category", "difficulty", "tags", "prerequisites", "safety", "run-in", "sessions", "min-version", "minutes", "revision"}

var fileNameRE = regexp.MustCompile(`^(\d+)-(.+)\.md$`)

func trimSpace(s string) string { return strings.TrimSpace(s) }

func leadingBackticks(line string) int {
	n := 0
	for n < len(line) && line[n] == '`' {
		n++
	}
	return n
}

// ParseLessonFile parses one lesson file. name is used in error messages only; the ordinal is not
// derived here (LoadLessons takes it from the filename). The returned slugs are the prerequisite
// slugs from the header, in order.
func ParseLessonFile(name string, data []byte) (Lesson, []string, error) {
	var l Lesson
	fail := func(format string, args ...any) (Lesson, []string, error) {
		return Lesson{}, nil, fmt.Errorf("%s: %s", name, fmt.Sprintf(format, args...))
	}
	if bytes.Contains(data, []byte("\r")) {
		return fail("carriage returns are not allowed (use LF line endings)")
	}
	lines := strings.Split(string(data), "\n")
	if len(lines) == 0 || !strings.HasPrefix(lines[0], "# ") || trimSpace(lines[0][2:]) == "" {
		return fail("line 1 must be '# <title>'")
	}
	l.Title = trimSpace(lines[0][2:])
	l.Tags = []string{}
	l.Prerequisites = []int{}

	i := 1
	for i < len(lines) && trimSpace(lines[i]) == "" {
		i++
	}
	header := map[string]string{}
	for ; i < len(lines) && trimSpace(lines[i]) != ""; i++ {
		key, value, ok := strings.Cut(lines[i], ":")
		if !ok || strings.HasPrefix(lines[i], "#") {
			return fail("header line %d is not 'key: value'", i+1)
		}
		key = trimSpace(key)
		if !in(headerKeys, key) {
			return fail("unknown header key %q", key)
		}
		if _, dup := header[key]; dup {
			return fail("duplicate header key %q", key)
		}
		header[key] = trimSpace(value)
	}
	for _, key := range headerKeys {
		if _, ok := header[key]; !ok && key != "prerequisites" {
			return fail("missing header key %q", key)
		}
	}
	l.Slug = header["slug"]
	l.Category = header["category"]
	l.Difficulty = header["difficulty"]
	l.SafetyLevel = header["safety"]
	l.RunIn = header["run-in"]
	l.MinVersion = header["min-version"]
	l.Tags = splitList(header["tags"])
	prereqs := splitList(header["prerequisites"])
	var err error
	if l.Sessions, err = positiveInt(header["sessions"]); err != nil {
		return fail("header key %q: %v", "sessions", err)
	}
	if l.EstimatedMinutes, err = positiveInt(header["minutes"]); err != nil {
		return fail("header key %q: %v", "minutes", err)
	}
	if l.Revision, err = positiveInt(header["revision"]); err != nil {
		return fail("header key %q: %v", "revision", err)
	}

	// Sections: a heading is a line that is exactly "## <Name>" at fence depth zero.
	bodies := map[string][]string{}
	current := ""
	fenceLen := 0
	for ; i < len(lines); i++ {
		line := lines[i]
		run := leadingBackticks(line)
		if fenceLen > 0 {
			if run >= fenceLen {
				fenceLen = 0
			}
			bodies[current] = append(bodies[current], line)
			continue
		}
		if run >= 3 {
			if current == "" {
				return fail("line %d: text before the first section", i+1)
			}
			fenceLen = run
			bodies[current] = append(bodies[current], line)
			continue
		}
		if strings.HasPrefix(line, "## ") {
			sec := line[3:]
			if !in(sectionOrder, sec) {
				return fail("line %d: unknown section %q", i+1, sec)
			}
			if _, dup := bodies[sec]; dup {
				return fail("line %d: duplicate section %q", i+1, sec)
			}
			current = sec
			bodies[sec] = []string{}
			continue
		}
		if current == "" {
			if trimSpace(line) != "" {
				return fail("line %d: text before the first section", i+1)
			}
			continue
		}
		bodies[current] = append(bodies[current], line)
	}
	if fenceLen > 0 {
		return fail("unclosed code fence in section %q", current)
	}
	for sec := range requiredSections {
		if _, ok := bodies[sec]; !ok {
			return fail("missing required section %q", sec)
		}
	}
	text := map[string]string{}
	for sec, body := range bodies {
		body = trimBlankLines(body)
		if sec == secSetup && HasSetupChoices(strings.Join(body, "\n")) {
			text[sec] = strings.Join(body, "\n")
			if _, err := SetupCommands(text[sec], "script"); err != nil {
				return fail("section %q: %v", sec, err)
			}
			continue
		}
		if fencedSections[sec] {
			content, err := unfence(body)
			if err != nil {
				return fail("section %q: %v", sec, err)
			}
			text[sec] = content
			continue
		}
		text[sec] = strings.TrimRight(strings.Join(body, "\n"), " \t\n")
	}
	l.Overview = text[secOverview]
	l.SyntaxBreakdown = text[secSyntax]
	l.Caution = text[secCaution]
	l.Setup = text[secSetup]
	l.Code = text[secRun]
	l.ExpectedResult = text[secExpected]
	l.SystemsLens = text[secLens]
	l.Challenge = text[secChallenge]
	return l, prereqs, nil
}

func positiveInt(s string) (int, error) {
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("%q is not a positive integer", s)
	}
	return n, nil
}

func splitList(s string) []string {
	out := []string{}
	for _, part := range strings.Split(s, ",") {
		if p := trimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func trimBlankLines(body []string) []string {
	start, end := 0, len(body)
	for start < end && trimSpace(body[start]) == "" {
		start++
	}
	for end > start && trimSpace(body[end-1]) == "" {
		end--
	}
	return body[start:end]
}

// unfence checks that body is exactly one backtick-fenced block and returns its verbatim content.
func unfence(body []string) (string, error) {
	if len(body) < 2 {
		return "", errors.New("body must be exactly one fenced block")
	}
	open := leadingBackticks(body[0])
	if open < 3 {
		return "", errors.New("body must start with a backtick fence line")
	}
	last := body[len(body)-1]
	if leadingBackticks(last) < open || strings.Trim(last, "`") != "" {
		return "", errors.New("body must end with its closing fence line and nothing else")
	}
	return strings.Join(body[1:len(body)-1], "\n"), nil
}

// CodeLanguage is the fence language the renderer prints and the writer uses.
func CodeLanguage(c Course, runIn string) string {
	switch runIn {
	case "shell":
		return "sh"
	case "mixed":
		return "text"
	}
	if in([]string{"psql", "sqlite3", "duckdb"}, c.Tool) {
		return "sql"
	}
	return c.Tool
}

func fenceFor(content string) string {
	longest := 0
	for _, line := range strings.Split(content, "\n") {
		if n := leadingBackticks(line); n > longest {
			longest = n
		}
	}
	n := 3
	if longest+1 > n {
		n = longest + 1
	}
	return strings.Repeat("`", n)
}

// FormatLessonFile writes a lesson in the file grammar; ParseLessonFile(FormatLessonFile(l)) == l.
func FormatLessonFile(c Course, l Lesson, prereqSlugs []string) []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n", l.Title)
	fmt.Fprintf(&b, "slug: %s\n", l.Slug)
	fmt.Fprintf(&b, "category: %s\n", l.Category)
	fmt.Fprintf(&b, "difficulty: %s\n", l.Difficulty)
	fmt.Fprintf(&b, "tags: %s\n", strings.Join(l.Tags, ", "))
	if len(prereqSlugs) > 0 {
		fmt.Fprintf(&b, "prerequisites: %s\n", strings.Join(prereqSlugs, ", "))
	}
	fmt.Fprintf(&b, "safety: %s\n", l.SafetyLevel)
	fmt.Fprintf(&b, "run-in: %s\n", l.RunIn)
	fmt.Fprintf(&b, "sessions: %d\n", l.Sessions)
	fmt.Fprintf(&b, "min-version: %s\n", l.MinVersion)
	fmt.Fprintf(&b, "minutes: %d\n", l.EstimatedMinutes)
	fmt.Fprintf(&b, "revision: %d\n", l.Revision)
	lang := CodeLanguage(c, l.RunIn)
	prose := func(name, body string) {
		if body == "" {
			return
		}
		fmt.Fprintf(&b, "\n## %s\n%s\n", name, body)
	}
	code := func(name, body string) {
		if body == "" {
			return
		}
		f := fenceFor(body)
		fmt.Fprintf(&b, "\n## %s\n%s%s\n%s\n%s\n", name, f, lang, body, f)
	}
	prose(secOverview, l.Overview)
	prose(secSyntax, l.SyntaxBreakdown)
	prose(secCaution, l.Caution)
	if HasSetupChoices(l.Setup) {
		prose(secSetup, l.Setup)
	} else {
		code(secSetup, l.Setup)
	}
	code(secRun, l.Code)
	prose(secExpected, l.ExpectedResult)
	prose(secLens, l.SystemsLens)
	prose(secChallenge, l.Challenge)
	return []byte(b.String())
}

// FileName is the lesson file name for an ordinal and slug: NN-<slug>.md (two-digit minimum).
func FileName(ordinal int, slug string) string {
	return fmt.Sprintf("%02d-%s.md", ordinal, slug)
}

// LessonFiles lists lesson file names in ordinal order. A missing lessons directory yields nil.
func LessonFiles(root, id string) ([]string, error) {
	dir, err := LessonsDir(root, id)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	names := []string{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		names = append(names, e.Name())
	}
	sort.Strings(names)
	return names, nil
}

// LoadLessons parses lessons/*.md, resolves prerequisite slugs to ordinals and validates.
func LoadLessons(root, id string) ([]Lesson, error) {
	dir, err := LessonsDir(root, id)
	if err != nil {
		return nil, err
	}
	names, err := LessonFiles(root, id)
	if err != nil {
		return nil, err
	}
	if names == nil {
		return nil, fmt.Errorf("%s: no lessons directory", dir)
	}
	type parsed struct {
		lesson  Lesson
		prereqs []string
		file    string
	}
	var items []parsed
	for _, name := range names {
		rel := filepath.Join("lessons", name)
		m := fileNameRE.FindStringSubmatch(name)
		if m == nil {
			return nil, fmt.Errorf("%s: lesson file names must be NN-<slug>.md", rel)
		}
		ordinal, err := strconv.Atoi(m[1])
		if err != nil || ordinal < 1 || m[1] != fmt.Sprintf("%02d", ordinal) {
			return nil, fmt.Errorf("%s: ordinal prefix must be a zero-padded positive integer", rel)
		}
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, err
		}
		l, prereqs, err := ParseLessonFile(rel, data)
		if err != nil {
			return nil, err
		}
		if l.Slug != m[2] {
			return nil, fmt.Errorf("%s: header slug %q does not match the file name", rel, l.Slug)
		}
		l.Ordinal = ordinal
		items = append(items, parsed{l, prereqs, rel})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].lesson.Ordinal < items[j].lesson.Ordinal })
	ordinalBySlug := map[string]int{}
	for i, it := range items {
		if it.lesson.Ordinal != i+1 {
			return nil, fmt.Errorf("lessons must have unique slugs and consecutive ordinals 1..%d (found %s)", len(items), it.file)
		}
		if _, dup := ordinalBySlug[it.lesson.Slug]; dup {
			return nil, fmt.Errorf("duplicate slug %s", it.lesson.Slug)
		}
		ordinalBySlug[it.lesson.Slug] = it.lesson.Ordinal
	}
	lessons := make([]Lesson, 0, len(items))
	for _, it := range items {
		l := it.lesson
		l.Prerequisites = []int{}
		for _, slug := range it.prereqs {
			o, ok := ordinalBySlug[slug]
			if !ok {
				return nil, fmt.Errorf("lesson %s requires unknown lesson %s", l.Slug, slug)
			}
			if o >= l.Ordinal {
				return nil, fmt.Errorf("lesson %s requires later lesson %s", l.Slug, slug)
			}
			l.Prerequisites = append(l.Prerequisites, o)
		}
		lessons = append(lessons, l)
	}
	if err := Validate(lessons); err != nil {
		return nil, err
	}
	return lessons, nil
}
