package main

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func fixture(t *testing.T) (Coach, *bytes.Buffer) {
	t.Helper()
	root := t.TempDir()
	out := &bytes.Buffer{}
	c := Coach{root, filepath.Join(root, "progress"), out}
	for _, id := range []string{"alpha", "beta"} {
		p := Project{ID: id, Title: id + " experiment", Status: "approved", Objective: "Observe a failure boundary", Lessons: []Lesson{
			{Slug: "first", Title: "First", Minutes: 20, Revision: 1, Outcome: "See the first effect", Available: true},
			{Slug: "second", Title: "Second", Minutes: 20, Revision: 1, Outcome: "See the second effect", Prerequisites: []string{"first"}, Available: false},
		}}
		saveProject(t, c, p)
		for _, view := range []string{"lesson", "review"} {
			path := c.page(id, "first", view)
			if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte(id+" "+view+" body\n```sh\nprintf 'inspect me\\n'\n```\n"), 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
	return c, out
}
func saveProject(t *testing.T, c Coach, p Project) {
	t.Helper()
	b, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(c.root, "projects", p.ID, "project.json")
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, b, 0600); err != nil {
		t.Fatal(err)
	}
}
func call(t *testing.T, c Coach, args ...string) {
	t.Helper()
	if err := c.run(args); err != nil {
		t.Fatal(err)
	}
}
func rejected(t *testing.T, c Coach, args ...string) {
	t.Helper()
	if err := c.run(args); err == nil {
		t.Fatalf("accepted invalid command: %v", args)
	}
}

func TestReadOnlyViewsAndExplicitCompletion(t *testing.T) {
	c, out := fixture(t)
	for _, args := range [][]string{{"topics"}, {"alpha", "route"}, {"alpha", "1", "lesson"}, {"alpha", "1", "review"}, {"check", "alpha"}} {
		call(t, c, args...)
	}
	if _, err := os.Stat(c.state); !os.IsNotExist(err) {
		t.Fatal("reads created progress state")
	}
	if !strings.Contains(out.String(), "printf 'inspect me\\n'") {
		t.Fatal("rendered commands changed")
	}
	rejected(t, c, "alpha", "done")
	call(t, c, "alpha", "1", "done")
	p, _ := c.load("alpha")
	path := c.receipt("alpha", p.Lessons[0])
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	call(t, c, "alpha", "1", "done")
	call(t, c, "alpha", "1", "review")
	after, _ := os.ReadFile(path)
	if !bytes.Equal(before, after) {
		t.Fatal("repeat done or review rewrote receipt")
	}
	if done, _ := c.done("beta", p.Lessons[0]); done {
		t.Fatal("completion leaked into second topic")
	}
	out.Reset()
	call(t, c, "alpha", "route")
	if !strings.Contains(out.String(), "available, done") || !strings.Contains(out.String(), "planned") {
		t.Fatal(out.String())
	}
}

func TestSelectionAndBatchBoundary(t *testing.T) {
	c, out := fixture(t)
	rejected(t, c, "1", "lesson")
	call(t, c, "use", "alpha")
	call(t, c, "1", "lesson")
	call(t, c, "1", "done")
	err := c.run([]string{"lesson"})
	if err == nil || !strings.Contains(err.Error(), "planned, not authored") {
		t.Fatalf("lost batch boundary: %v", err)
	}
	rejected(t, c, "2", "done")
	// Explicit beta does not change the selected topic.
	out.Reset()
	call(t, c, "beta", "lesson")
	if !strings.Contains(out.String(), "beta lesson body") {
		t.Fatal(out.String())
	}
	active, _ := os.ReadFile(filepath.Join(c.state, "active"))
	if string(active) != "alpha\n" {
		t.Fatal("read switched active topic")
	}
	call(t, c, "use", "beta")
	out.Reset()
	call(t, c, "lesson")
	if !strings.Contains(out.String(), "beta lesson body") {
		t.Fatal(out.String())
	}
}

func TestIdentitySurvivesReorderAndRevisionRequiresNewCompletion(t *testing.T) {
	c, _ := fixture(t)
	call(t, c, "alpha", "1", "done")
	p, _ := c.load("alpha")
	p.Lessons[1].Prerequisites = nil
	p.Lessons[0], p.Lessons[1] = p.Lessons[1], p.Lessons[0]
	saveProject(t, c, p)
	if done, _ := c.done("alpha", p.Lessons[0]); done {
		t.Fatal("completion followed ordinal")
	}
	if done, _ := c.done("alpha", p.Lessons[1]); !done {
		t.Fatal("completion lost stable identity")
	}
	p.Lessons[1].Revision = 2
	saveProject(t, c, p)
	if done, _ := c.done("alpha", p.Lessons[1]); done {
		t.Fatal("new revision inherited completion")
	}
	call(t, c, "alpha", "2", "done")
	for _, revision := range []int{1, 2} {
		l := p.Lessons[1]
		l.Revision = revision
		if done, _ := c.done("alpha", l); !done {
			t.Fatal("revision history lost")
		}
	}
}

func TestDraftAndInvalidRoutes(t *testing.T) {
	c, _ := fixture(t)
	p, _ := c.load("alpha")
	p.Status = "draft"
	p.Lessons[0].Available = false
	saveProject(t, c, p)
	call(t, c, "alpha", "route")
	rejected(t, c, "alpha", "1", "lesson")
	rejected(t, c, "alpha", "1", "done")
	p.Lessons[0].Available = true
	saveProject(t, c, p)
	rejected(t, c, "check", "alpha")
	p.Status = "approved"
	p.Lessons[1].Prerequisites = []string{"second"}
	saveProject(t, c, p)
	rejected(t, c, "check", "alpha")
	p.Lessons[1].Prerequisites = nil
	p.Lessons[1].Slug = "first"
	saveProject(t, c, p)
	rejected(t, c, "check", "alpha")
	p.Lessons[1].Slug = "second"
	p.Lessons[0].Minutes = 30
	saveProject(t, c, p)
	rejected(t, c, "check", "alpha")
	p.Lessons[0].Minutes = 20
	saveProject(t, c, p)
	if err := os.Remove(c.page("alpha", "first", "review")); err != nil {
		t.Fatal(err)
	}
	rejected(t, c, "check", "alpha")
}

func TestInvalidCommandsAndNoProjects(t *testing.T) {
	c, out := fixture(t)
	for _, args := range [][]string{{"use"}, {"topics", "extra"}, {"alpha", "0", "lesson"}, {"alpha", "-1", "done"}, {"alpha", "3", "lesson"}, {"alpha", "1", "oops"}, {"alpha", "1", "lesson", "extra"}, {"use", "../alpha"}, {"alpha", "--db", "file"}} {
		rejected(t, c, args...)
	}
	empty := Coach{t.TempDir(), t.TempDir(), out}
	if err := os.Mkdir(filepath.Join(empty.root, "projects"), 0700); err != nil {
		t.Fatal(err)
	}
	out.Reset()
	call(t, empty, "topics")
	if !strings.Contains(out.String(), "No projects yet") {
		t.Fatal(out.String())
	}
}

func TestConcurrentCompletionsAreAtomicAndIndependent(t *testing.T) {
	c, _ := fixture(t)
	p, _ := c.load("alpha")
	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			topic := "alpha"
			if i%2 == 0 {
				topic = "beta"
			}
			if err := writeReceipt(c.receipt(topic, p.Lessons[0]), []byte(`{"complete":true}`)); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	for _, topic := range []string{"alpha", "beta"} {
		path := c.receipt(topic, p.Lessons[0])
		var value map[string]bool
		if err := decode(path, &value); err != nil {
			t.Fatal(err)
		}
		if !value["complete"] {
			t.Fatal("partial receipt")
		}
		files, _ := os.ReadDir(filepath.Dir(path))
		if len(files) != 1 {
			t.Fatal("temporary receipts retained")
		}
	}
}

func TestFinishedRouteAndMalformedJSON(t *testing.T) {
	c, out := fixture(t)
	p, _ := c.load("alpha")
	p.Lessons = p.Lessons[:1]
	saveProject(t, c, p)
	call(t, c, "alpha", "1", "done")
	out.Reset()
	call(t, c, "alpha", "lesson")
	if !strings.Contains(out.String(), "All lessons") {
		t.Fatal(out.String())
	}
	path := filepath.Join(c.root, "projects", "alpha", "project.json")
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString(" {}")
	f.Close()
	rejected(t, c, "check", "alpha")
}

func TestInstallerPreservesExistingPaths(t *testing.T) {
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	tmp := t.TempDir()
	bin, skills := filepath.Join(tmp, "bin"), filepath.Join(tmp, "skills")
	install := func() error {
		cmd := exec.Command(filepath.Join(root, "install.sh"), bin, skills)
		return cmd.Run()
	}
	if err := install(); err != nil {
		t.Fatal(err)
	}
	if err := install(); err != nil {
		t.Fatal("repeat installation:", err)
	}
	for path, want := range map[string]string{
		filepath.Join(bin, "systemscoach"):    filepath.Join(root, "bin", "systemscoach"),
		filepath.Join(skills, "systemscoach"): filepath.Join(root, "skills", "systemscoach"),
	} {
		got, err := filepath.EvalSymlinks(path)
		if err != nil || got != want {
			t.Fatalf("link %s: %s, %v", path, got, err)
		}
	}
	// Collision preflight must run before creating even the other destination.
	bin, skills = filepath.Join(tmp, "other-bin"), filepath.Join(tmp, "other-skills")
	if err := os.MkdirAll(skills, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(skills, "systemscoach")
	if err := os.WriteFile(path, []byte("unrelated"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := install(); err == nil {
		t.Fatal("installer overwrote existing skill")
	}
	data, _ := os.ReadFile(path)
	if string(data) != "unrelated" {
		t.Fatal("existing skill changed")
	}
	if _, err := os.Stat(bin); !os.IsNotExist(err) {
		t.Fatal("partial install after collision")
	}
}
