// systemscoach renders project experiments; it never runs lesson commands.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Lesson struct {
	Slug string `json:"slug"`
	Title string `json:"title"`
	Minutes int `json:"minutes"`
	Revision int `json:"revision"`
	Outcome string `json:"outcome"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	Available bool `json:"available"`
}

type Project struct {
	ID string `json:"id"`
	Title string `json:"title"`
	Status string `json:"status"`
	Objective string `json:"objective"`
	Lessons []Lesson `json:"lessons"`
}

type Coach struct { root, state string; out io.Writer }
var slugPattern = regexp.MustCompile(`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`)

const help = `systemscoach topics
systemscoach use TOPIC                  select a project for short commands
systemscoach [TOPIC] route              full agenda, availability and completion
systemscoach [TOPIC] [N] lesson         next unfinished lesson when N is omitted
systemscoach [TOPIC] [N] review         review the same next unfinished lesson
systemscoach [TOPIC] N done             explicitly record completion
systemscoach check TOPIC               validate route and available lesson files

Examples: systemscoach wal-git 1 lesson; systemscoach 1 done; systemscoach wal-git route
Reading never records completion. Use an explicit N to review a completed lesson.
Ask the systemscoach skill to interview you about a topic/write-up, propose an agenda,
and author a small batch after you approve it. The CLI does not generate lessons.
Environment: SYSTEMSCOACH_ROOT (project folder), SYSTEMSCOACH_STATE (isolated progress folder).
`

func decode(path string, value any) error {
	f, err := os.Open(path); if err != nil { return err }; defer f.Close()
	d := json.NewDecoder(f); d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil { return fmt.Errorf("%s: %w", path, err) }
	var extra any
	if err := d.Decode(&extra); err != io.EOF { return fmt.Errorf("%s: unexpected trailing data", path) }
	return nil
}

func (c Coach) load(id string) (Project, error) {
	var p Project
	if !slugPattern.MatchString(id) { return p, errors.New("topic must be a lowercase kebab-case identifier") }
	if err := decode(filepath.Join(c.root, "projects", id, "project.json"), &p); err != nil { return p, err }
	if p.ID != id || strings.TrimSpace(p.Title) == "" || strings.TrimSpace(p.Objective) == "" || (p.Status != "draft" && p.Status != "approved") || len(p.Lessons) == 0 {
		return p, errors.New("project needs matching id, title, objective, draft/approved status and a nonempty route")
	}
	seen := map[string]bool{}
	for i, l := range p.Lessons {
		if !slugPattern.MatchString(l.Slug) || seen[l.Slug] || strings.TrimSpace(l.Title) == "" || strings.TrimSpace(l.Outcome) == "" || l.Revision < 1 || l.Minutes < 15 || l.Minutes > 25 {
			return p, fmt.Errorf("invalid lesson %d: unique slug, title, outcome, revision >= 1 and 15–25 minutes required", i+1)
		}
		for _, dep := range l.Prerequisites { if !seen[dep] { return p, fmt.Errorf("%s: prerequisite %s must occur earlier", l.Slug, dep) } }
		seen[l.Slug] = true
		if l.Available {
			if p.Status != "approved" { return p, errors.New("draft agendas cannot publish available lessons") }
			for _, view := range []string{"lesson", "review"} {
				body, err := os.ReadFile(c.page(id, l.Slug, view))
				if err != nil { return p, err }
				if len(strings.TrimSpace(string(body))) == 0 { return p, fmt.Errorf("%s: empty %s view", l.Slug, view) }
			}
		}
	}
	return p, nil
}

func (c Coach) page(topic, slug, view string) string {
	return filepath.Join(c.root, "projects", topic, "curriculum", slug, view+".md")
}

func (c Coach) receipt(topic string, l Lesson) string {
	return filepath.Join(c.state, "done", topic, l.Slug, strconv.Itoa(l.Revision)+".json")
}

func (c Coach) done(topic string, l Lesson) (bool, error) {
	_, err := os.Stat(c.receipt(topic, l)); if errors.Is(err, os.ErrNotExist) { return false, nil }; return err == nil, err
}

// A receipt is published atomically without replacing an existing completion.
// Different lessons and projects never overwrite a shared progress document.
func writeReceipt(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil { return err }
	f, err := os.CreateTemp(filepath.Dir(path), ".receipt-"); if err != nil { return err }
	defer os.Remove(f.Name())
	if _, err := f.Write(data); err != nil { f.Close(); return err }
	if err := f.Sync(); err != nil { f.Close(); return err }
	if err := f.Close(); err != nil { return err }
	if err := os.Link(f.Name(), path); err != nil && !errors.Is(err, os.ErrExist) { return err }
	return nil
}

func (c Coach) selectTopic(id string) error {
	if _, err := c.load(id); err != nil { return err }
	if err := os.MkdirAll(c.state, 0700); err != nil { return err }
	f, err := os.CreateTemp(c.state, ".active-"); if err != nil { return err }; defer os.Remove(f.Name())
	if _, err = f.WriteString(id+"\n"); err != nil { f.Close(); return err }
	if err := f.Close(); err != nil { return err }
	if err := os.Rename(f.Name(), filepath.Join(c.state, "active")); err != nil { return err }
	fmt.Fprintln(c.out, "Selected", id); return nil
}

func (c Coach) run(args []string) error {
	if len(args) == 1 && (args[0] == "help" || args[0] == "--help" || args[0] == "-h") { fmt.Fprint(c.out, help); return nil }
	if len(args) > 0 {
		switch args[0] {
		case "topics":
			if len(args) != 1 { return errors.New("usage: systemscoach topics") }
			entries, err := os.ReadDir(filepath.Join(c.root, "projects")); if err != nil { return err }
			count := 0
			for _, e := range entries {
				if !e.IsDir() || strings.HasPrefix(e.Name(), ".") { continue }
				p, err := c.load(e.Name()); if err != nil { return err }
				fmt.Fprintf(c.out, "%s — %s (%s)\n", p.ID, p.Title, p.Status); count++
			}
			if count == 0 { fmt.Fprintln(c.out, "No projects yet. Ask the systemscoach skill to interview you about a topic or write-up. Ideas: docs/project-ideas.md") }; return nil
		case "use", "check":
			if len(args) != 2 { return fmt.Errorf("usage: systemscoach %s TOPIC", args[0]) }
			if args[0] == "use" { return c.selectTopic(args[1]) }
			p, err := c.load(args[1]); if err != nil { return err }; fmt.Fprintf(c.out, "%s: valid %s agenda, %d lessons (structure only; see validation records for experiment evidence)\n", p.ID, p.Status, len(p.Lessons)); return nil
		}
	}
	var topic string
	if len(args) > 0 && slugPattern.MatchString(args[0]) && !isAction(args[0]) { topic, args = args[0], args[1:] }
	if topic == "" {
		b, err := os.ReadFile(filepath.Join(c.state, "active")); if errors.Is(err, os.ErrNotExist) { return errors.New("no selected project; use systemscoach TOPIC route or systemscoach use TOPIC") }; if err != nil { return err }; topic = strings.TrimSpace(string(b))
	}
	p, err := c.load(topic); if err != nil { return err }
	if len(args) == 1 && args[0] == "route" {
		fmt.Fprintf(c.out, "# %s — %s agenda\n\n%s\n\n", p.Title, p.Status, p.Objective)
		total := 0
		for i, l := range p.Lessons {
			status := "planned"; if l.Available { status = "available" }
			done, err := c.done(topic, l); if err != nil { return err }; if done { status += ", done" }
			fmt.Fprintf(c.out, "%d. %s — %d min · %s\n   %s\n", i+1, l.Title, l.Minutes, status, l.Outcome); total += l.Minutes
		}
		fmt.Fprintf(c.out, "\n%d lessons · %d minutes estimated total, including setup and cleanup.\n", len(p.Lessons), total); return nil
	}
	n := 0
	if len(args) > 0 { if value, err := strconv.Atoi(args[0]); err == nil { n = value; args = args[1:]; if n < 1 { return errors.New("lesson number must be positive") } } }
	action := "lesson"; if len(args) > 0 { action, args = args[0], args[1:] }
	if len(args) > 0 || !isAction(action) || action == "route" { return errors.New("usage: systemscoach [TOPIC] [N] lesson|review|done") }
	if action == "done" && n == 0 { return errors.New("done requires an explicit lesson number") }
	if p.Status != "approved" { return errors.New("agenda is a draft; agree the learning agenda before authoring or taking lessons") }
	if n == 0 {
		for i, l := range p.Lessons { done, err := c.done(topic, l); if err != nil { return err }; if !done { n = i+1; break } }
		if n == 0 { fmt.Fprintln(c.out, "All lessons in this route are complete. You can review any lesson by number."); return nil }
	}
	if n > len(p.Lessons) { return fmt.Errorf("lesson %d is outside this %d-lesson route", n, len(p.Lessons)) }
	l := p.Lessons[n-1]
	if !l.Available { return fmt.Errorf("lesson %d (%s) is planned, not authored; ask for the next small batch", n, l.Title) }
	if action == "done" {
		b, err := json.Marshal(struct { Topic, Slug string; Revision int; CompletedAt string }{topic, l.Slug, l.Revision, time.Now().UTC().Format(time.RFC3339Nano)}); if err != nil { return err }
		if err := writeReceipt(c.receipt(topic, l), append(b, '\n')); err != nil { return err }
		fmt.Fprintf(c.out, "Completed %s %d: %s\nReview: systemscoach %s %d review\n", topic, n, l.Title, topic, n); return nil
	}
	body, err := os.ReadFile(c.page(topic, l.Slug, action)); if err != nil { return err }
	fmt.Fprintf(c.out, "# %s %d/%d: %s\n\nCore: %d minutes, including setup, reflection and cleanup.\n\n%s\n", p.Title, n, len(p.Lessons), l.Title, l.Minutes, body)
	if action == "lesson" { fmt.Fprintf(c.out, "\nReview: systemscoach %s %d review\n", topic, n) } else { fmt.Fprintf(c.out, "\nWhen you consider it complete: systemscoach %s %d done\n", topic, n) }
	return nil
}

func isAction(s string) bool { return s == "lesson" || s == "review" || s == "done" || s == "route" }

func main() {
	root := os.Getenv("SYSTEMSCOACH_ROOT"); if root == "" { root = "." }
	state := os.Getenv("SYSTEMSCOACH_STATE"); if state == "" { state = filepath.Join(root, ".state") }
	if err := (Coach{root, state, os.Stdout}).run(os.Args[1:]); err != nil { fmt.Fprintln(os.Stderr, "systemscoach:", err); os.Exit(1) }
}
