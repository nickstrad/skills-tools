package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/roadmap"
)

// roadmapFixture adds a three-topic snapshot to the standard fixture: a main topic linked to the
// fixture course, a plan-only main topic, and a workshop topic with two follow-ups.
func roadmapFixture(t *testing.T) *fixture {
	t.Helper()
	x := newFixture(t)
	s := roadmap.Snapshot{
		Format:   1,
		Preamble: "Preamble paragraph.",
		Topics: []roadmap.Topic{
			{Slug: "alpha", Title: "Alpha", Track: "main", Status: "active", Tool: "Tool A", Goals: "Goals A",
				Diagram: "a -> b", Course: "demo", Followups: []roadmap.Followup{
					{Title: "Project one", Description: "first idea"},
					{Title: "Project two", Description: "second idea"},
				}},
			{Slug: "beta", Title: "Beta", Track: "main", Status: "planned", Tool: "Tool B", Goals: "Goals B",
				Plan: "future-courses/beta/course.md", Followups: []roadmap.Followup{}},
			{Slug: "gamma", Title: "Gamma", Track: "workshop", Status: "planned", Tool: "Tool C", Goals: "Goals C",
				Notes: "a note", Followups: []roadmap.Followup{}},
		},
	}
	data, err := roadmap.MarshalSnapshot(s)
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(x.f.Root, "roadmap")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "roadmap.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
	return x
}

func TestRoadmapCommands(t *testing.T) {
	x := roadmapFixture(t)
	dbPath := filepath.Join(x.f.Root, "tutor.sqlite")
	snapshot := filepath.Join(x.f.Root, "roadmap", "roadmap.json")
	const note = "\nNote: run tutor roadmap export to update roadmap.json\n"

	// Reads before import fail with the fixed message and create nothing.
	x.check(t, step{name: "view before import", args: []string{"roadmap"}, err: "Error: No roadmap yet: run tutor roadmap import\n", code: 1})
	x.check(t, step{name: "show before import", args: []string{"roadmap", "show", "alpha"}, err: "Error: No roadmap yet: run tutor roadmap import\n", code: 1})
	if _, err := os.Stat(dbPath); !os.IsNotExist(err) {
		t.Fatalf("a read created %s", dbPath)
	}

	x.check(t, step{name: "import", args: []string{"roadmap", "import"},
		out: "Imported 3 topics from {root}/roadmap/roadmap.json into {root}/tutor.sqlite\n"})
	x.check(t, step{name: "import twice", args: []string{"roadmap", "import"},
		err: "Error: {root}/tutor.sqlite: roadmap database already has topics: pass --replace to overwrite it\n", code: 1})
	x.check(t, step{name: "import replace", args: []string{"roadmap", "import", "--replace"},
		out: "Imported 3 topics from {root}/roadmap/roadmap.json into {root}/tutor.sqlite\n"})

	// --json is the snapshot itself, byte for byte.
	want, err := os.ReadFile(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	x.check(t, step{name: "json", args: []string{"roadmap", "--json"}, out: string(want)})

	// The view counts the linked course from its default progress database, which does not exist
	// yet: every authored lesson counts, nothing is done.
	view := `# Learning roadmap

Preamble paragraph.

## Main path
 1. [active]   Alpha — demo: 9/10 authored, 0 done
 2. [planned]  Beta — plan: future-courses/beta/course.md

## Supporting workshops
 1. [planned]  Gamma

Show a topic: tutor roadmap show <slug>   (goals, diagram, optional Go follow-ups)
`
	x.check(t, step{name: "view", args: []string{"roadmap"}, out: view})
	x.check(t, step{name: "view followups", args: []string{"roadmap", "--followups"}, out: strings.Replace(view,
		" 1. [active]   Alpha — demo: 9/10 authored, 0 done\n",
		" 1. [active]   Alpha — demo: 9/10 authored, 0 done\n   - [ ] Project one: first idea\n   - [ ] Project two: second idea\n", 1)})

	// Progress in the linked course's default database shows up in the counts.
	x.check(t, step{name: "init demo", args: []string{"demo", "init"}, out: "Initialized 9 Demo Course lessons in {root}/tutor.sqlite\n"})
	x.check(t, step{name: "done demo 1", args: []string{"demo", "1", "done"}, out: "Lesson 1 marked done.\n"})
	x.check(t, step{name: "view with progress", args: []string{"roadmap"}, out: strings.Replace(view, "9/10 authored, 0 done", "9/10 authored, 1 done", 1)})

	show := `# Alpha

**Slug:** alpha | **Track:** main | **Status:** active

## Tool
Tool A

## Goals
Goals A

## Diagram
` + "```text\na -> b\n```" + `

## Course
demo

## Optional Go follow-ups
 1. [ ] Project one: first idea
 2. [ ] Project two: second idea
`
	x.check(t, step{name: "show", args: []string{"roadmap", "show", "alpha"}, out: show})
	x.check(t, step{name: "show unknown", args: []string{"roadmap", "show", "nope"}, err: "Error: unknown topic \"nope\"\n", code: 1})

	// Mutations print the topic and, until an export, the stale note.
	x.check(t, step{name: "set status", args: []string{"roadmap", "set", "alpha", "--status", "done"},
		out: strings.Replace(show, "**Status:** active", "**Status:** done", 1) + note})
	x.check(t, step{name: "set bogus", args: []string{"roadmap", "set", "alpha", "--status", "bogus"},
		err: "Error: invalid status \"bogus\": want planned|active|done|deferred\n", code: 2})
	x.check(t, step{name: "set nothing", args: []string{"roadmap", "set", "alpha"},
		err: "Error: nothing to set: pass --status or --note\n", code: 2})
	x.check(t, step{name: "export", args: []string{"roadmap", "export"}, out: "Exported the roadmap to {root}/roadmap/roadmap.json\n"})
	exported, err := os.ReadFile(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(exported), `"status": "done"`) {
		t.Fatalf("export did not write the new status:\n%s", exported)
	}
	x.check(t, step{name: "json after export", args: []string{"roadmap", "--json"}, out: string(exported)})

	// After an export the note is silent until the next change.
	x.check(t, step{name: "choose followup", args: []string{"roadmap", "followup", "choose", "alpha", "2"},
		out: strings.NewReplacer("**Status:** active", "**Status:** done", " 2. [ ] Project two", " 2. [x] Project two").Replace(show) + note})
	x.check(t, step{name: "choose out of range", args: []string{"roadmap", "followup", "choose", "alpha", "9"},
		err: "Error: topic \"alpha\" has no follow-up 9 (it has 2)\n", code: 1})
	x.check(t, step{name: "choose bad number", args: []string{"roadmap", "followup", "choose", "alpha", "x"},
		err: "Error: follow-up number must be a positive integer\n", code: 2})

	// Structural edits: positions stay dense and in order.
	x.check(t, step{name: "add", args: []string{"roadmap", "add", "delta", "--track", "main", "--title", "Delta", "--tool", "Tool D", "--goals", "Goals D", "--after", "alpha"},
		out: "# Delta\n\n**Slug:** delta | **Track:** main | **Status:** planned\n\n## Tool\nTool D\n\n## Goals\nGoals D\n" + note})
	x.check(t, step{name: "add missing flags", args: []string{"roadmap", "add", "epsilon", "--track", "main"},
		err: "Error: usage: tutor roadmap add <slug> --track main|workshop|branch --title T --tool T --goals T [--after <slug>] [--diagram-file PATH]\n", code: 2})
	x.check(t, step{name: "add bad track", args: []string{"roadmap", "add", "epsilon", "--track", "side", "--title", "E", "--tool", "t", "--goals", "g"},
		err: "Error: invalid track \"side\": want main|workshop|branch\n", code: 2})
	x.check(t, step{name: "move first", args: []string{"roadmap", "move", "beta", "--first"},
		out: "# Beta\n\n**Slug:** beta | **Track:** main | **Status:** planned\n\n## Tool\nTool B\n\n## Goals\nGoals B\n\n## Plan\nfuture-courses/beta/course.md\n" + note})
	x.check(t, step{name: "move needs one of", args: []string{"roadmap", "move", "beta"},
		err: "Error: usage: tutor roadmap move <slug> --after <slug>|--first\n", code: 2})
	x.check(t, step{name: "edit", args: []string{"roadmap", "edit", "gamma", "--title", "Gamma Prime", "--course", "demo"},
		out: "# Gamma Prime\n\n**Slug:** gamma | **Track:** workshop | **Status:** planned\n\n## Tool\nTool C\n\n## Goals\nGoals C\n\n## Course\ndemo\n\n## Notes\na note\n" + note})
	x.check(t, step{name: "followup add", args: []string{"roadmap", "followup", "add", "gamma", "--title", "P", "--description", "d"},
		out: "# Gamma Prime\n\n**Slug:** gamma | **Track:** workshop | **Status:** planned\n\n## Tool\nTool C\n\n## Goals\nGoals C\n\n## Course\ndemo\n\n## Notes\na note\n\n## Optional Go follow-ups\n 1. [ ] P: d\n" + note})
	x.check(t, step{name: "followup remove", args: []string{"roadmap", "followup", "remove", "gamma", "1"},
		out: "# Gamma Prime\n\n**Slug:** gamma | **Track:** workshop | **Status:** planned\n\n## Tool\nTool C\n\n## Goals\nGoals C\n\n## Course\ndemo\n\n## Notes\na note\n" + note})
	x.check(t, step{name: "remove", args: []string{"roadmap", "remove", "gamma"},
		out: "# Gamma Prime\n\n**Slug:** gamma | **Track:** workshop | **Status:** planned\n\n## Tool\nTool C\n\n## Goals\nGoals C\n\n## Course\ndemo\n\n## Notes\na note\n" + note})

	out, _, code := x.run("roadmap", "--json")
	if code != 0 {
		t.Fatalf("roadmap --json exit %d", code)
	}
	var order []string
	for _, line := range strings.Split(out, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), `"slug": `) {
			order = append(order, strings.Trim(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), `"slug": `)), `",`))
		}
	}
	if got := strings.Join(order, ","); got != "beta,alpha,delta" {
		t.Fatalf("topic order = %s, want beta,alpha,delta", got)
	}

	// A diagram file is stored without its trailing newline.
	diagram := filepath.Join(t.TempDir(), "d.txt")
	if err := os.WriteFile(diagram, []byte("x -> y\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	out, errOut, code := x.run("roadmap", "edit", "delta", "--diagram-file", diagram)
	if code != 0 {
		t.Fatalf("edit --diagram-file: %s", errOut)
	}
	if !strings.Contains(out, "## Diagram\n```text\nx -> y\n```\n") {
		t.Fatalf("diagram not shown:\n%s", out)
	}
}
