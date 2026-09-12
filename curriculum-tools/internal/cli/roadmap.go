// The `tutor roadmap` command family: the database-backed learning roadmap of plan.md §3.5. The
// view and `show` read the database read-only; every other subcommand edits it inside one
// transaction, prints the affected topic in the show format and, when the committed snapshot no
// longer matches the database, ends with the note that `export` is due.
package cli

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"skills-tools/tutor/internal/render"
	"skills-tools/tutor/internal/roadmap"
)

// roadmapCtx is the shared state of one roadmap invocation.
type roadmapCtx struct {
	root  string
	out   io.Writer
	store roadmap.Store
	file  string // the committed snapshot, default <root>/roadmap/roadmap.json
}

// classifyRoadmap maps the package's errors onto the CLI contract: a missing roadmap is a runtime
// failure (exit 1) with the fixed message; everything else keeps its text.
func classifyRoadmap(err error) error {
	if errors.Is(err, roadmap.ErrNoRoadmap) {
		return runtimeErr("%s", roadmap.ErrNoRoadmap.Error())
	}
	return err
}

// styled applies the Markdown styler when stdout is a terminal (the same rule as lesson output
// without --ansi/--plain), so the roadmap reads like a lesson in an interactive session.
func (rc *roadmapCtx) styled(text string) string {
	if ansiEnabled(rc.out, false, false) {
		return render.StyleMarkdown(text)
	}
	return text
}

// showTopic prints one topic and, after a mutation, the stale-export note.
func (rc *roadmapCtx) showTopic(t roadmap.Topic, mutated bool) {
	fmt.Fprintln(rc.out, rc.styled(roadmap.ShowText(t)))
	if !mutated {
		return
	}
	if note, ok := rc.store.StaleExportNote(rc.file); ok {
		fmt.Fprintln(rc.out)
		fmt.Fprintln(rc.out, note)
	}
}

// mutate runs one mutating operation and prints its result in the show format.
func (rc *roadmapCtx) mutate(op func() (roadmap.Topic, error)) error {
	t, err := op()
	if err != nil {
		return classifyRoadmap(err)
	}
	rc.showTopic(t, true)
	return nil
}

// readDiagramFile loads --diagram-file, trimming the trailing newline editors add so the diagram
// round-trips through the snapshot unchanged.
func readDiagramFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return strings.TrimRight(string(data), "\n"), nil
}

// newRoadmapCmd builds `tutor roadmap` and its subcommands.
func newRoadmapCmd(root string, stdout io.Writer) *cobra.Command {
	rc := &roadmapCtx{
		root:  root,
		out:   stdout,
		store: roadmap.Store{Path: roadmap.DatabasePath(root)},
		file:  roadmap.SnapshotPath(root),
	}
	var (
		asJSON    bool
		followups bool
	)
	cmd := &cobra.Command{
		Use:   "roadmap",
		Short: "Show or edit the overall learning roadmap",
		Args:  exactArgs(0, "tutor roadmap [--json] [--followups]"),
		RunE: func(*cobra.Command, []string) error {
			s, err := rc.store.Load()
			if err != nil {
				return classifyRoadmap(err)
			}
			if asJSON {
				data, err := roadmap.MarshalSnapshot(s)
				if err != nil {
					return err
				}
				fmt.Fprint(stdout, string(data))
				return nil
			}
			fmt.Fprintln(stdout, rc.styled(roadmap.View(s, roadmap.DefaultCounter(root), followups)))
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "print the roadmap as the snapshot JSON")
	cmd.Flags().BoolVar(&followups, "followups", false, "list the optional Go follow-ups under each topic")
	cmd.AddCommand(
		rc.showCmd(),
		rc.setCmd(),
		rc.addCmd(),
		rc.editCmd(),
		rc.moveCmd(),
		rc.removeCmd(),
		rc.followupCmd(),
		rc.importCmd(),
		rc.exportCmd(),
	)
	return cmd
}

func (rc *roadmapCtx) showCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "show <slug>",
		Short: "Show one topic: goals, diagram, follow-ups",
		Args:  exactArgs(1, "tutor roadmap show <slug>"),
		RunE: func(_ *cobra.Command, args []string) error {
			t, err := rc.store.Show(args[0])
			if err != nil {
				return classifyRoadmap(err)
			}
			rc.showTopic(t, false)
			return nil
		},
	}
}

func (rc *roadmapCtx) setCmd() *cobra.Command {
	var status, note string
	cmd := &cobra.Command{
		Use:   "set <slug> [--status planned|active|done|deferred] [--note TEXT]",
		Short: "Change a topic's status or note",
		Args:  exactArgs(1, "tutor roadmap set <slug> [--status planned|active|done|deferred] [--note TEXT]"),
		RunE: func(c *cobra.Command, args []string) error {
			var statusP, noteP *string
			if c.Flags().Changed("status") {
				if err := roadmap.ValidateStatus(status); err != nil {
					return usageErr("%s", err.Error())
				}
				statusP = &status
			}
			if c.Flags().Changed("note") {
				noteP = &note
			}
			if statusP == nil && noteP == nil {
				return usageErr("nothing to set: pass --status or --note")
			}
			return rc.mutate(func() (roadmap.Topic, error) { return rc.store.Set(args[0], statusP, noteP) })
		},
	}
	cmd.Flags().StringVar(&status, "status", "", "new status")
	cmd.Flags().StringVar(&note, "note", "", "replace the topic's notes (empty clears them)")
	return cmd
}

func (rc *roadmapCtx) addCmd() *cobra.Command {
	const spelling = "tutor roadmap add <slug> --track main|workshop|branch --title T --tool T --goals T [--after <slug>] [--diagram-file PATH]"
	var t roadmap.Topic
	var after, diagramFile string
	cmd := &cobra.Command{
		Use:   "add <slug> --track main|workshop|branch --title T --tool T --goals T [--after <slug>] [--diagram-file PATH]",
		Short: "Add a topic to a track",
		Args:  exactArgs(1, spelling),
		RunE: func(c *cobra.Command, args []string) error {
			t.Slug = args[0]
			if err := roadmap.ValidateSlug(t.Slug); err != nil {
				return usageErr("%s", err.Error())
			}
			for _, name := range []string{"track", "title", "tool", "goals"} {
				if !c.Flags().Changed(name) {
					return usageErr("usage: %s", spelling)
				}
			}
			if err := roadmap.ValidateTrack(t.Track); err != nil {
				return usageErr("%s", err.Error())
			}
			if diagramFile != "" {
				diagram, err := readDiagramFile(diagramFile)
				if err != nil {
					return err
				}
				t.Diagram = diagram
			}
			t.Status = "planned"
			t.Followups = []roadmap.Followup{}
			return rc.mutate(func() (roadmap.Topic, error) { return rc.store.Add(t, after) })
		},
	}
	cmd.Flags().StringVar(&t.Track, "track", "", "main, workshop or branch")
	cmd.Flags().StringVar(&t.Title, "title", "", "topic title")
	cmd.Flags().StringVar(&t.Tool, "tool", "", "one-line description of the tool")
	cmd.Flags().StringVar(&t.Goals, "goals", "", "what the learner should be able to do afterwards")
	cmd.Flags().StringVar(&after, "after", "", "place the topic directly after this slug (default: end of track)")
	cmd.Flags().StringVar(&diagramFile, "diagram-file", "", "plain-text diagram to store with the topic")
	return cmd
}

func (rc *roadmapCtx) editCmd() *cobra.Command {
	const spelling = "tutor roadmap edit <slug> [--title T] [--tool T] [--goals T] [--diagram-file PATH] [--course ID] [--plan PATH]"
	var title, tool, goals, diagramFile, courseID, plan string
	cmd := &cobra.Command{
		Use:   "edit <slug> [--title T] [--tool T] [--goals T] [--diagram-file PATH] [--course ID] [--plan PATH]",
		Short: "Rewrite a topic's text fields or links",
		Args:  exactArgs(1, spelling),
		RunE: func(c *cobra.Command, args []string) error {
			changes := map[string]string{}
			for name, value := range map[string]*string{"title": &title, "tool": &tool, "goals": &goals, "course": &courseID, "plan": &plan} {
				if c.Flags().Changed(name) {
					changes[name] = *value
				}
			}
			if c.Flags().Changed("diagram-file") {
				diagram, err := readDiagramFile(diagramFile)
				if err != nil {
					return err
				}
				changes["diagram"] = diagram
			}
			if len(changes) == 0 {
				return usageErr("nothing to edit: %s", spelling)
			}
			if v, ok := changes["title"]; ok && v == "" {
				return usageErr("--title cannot be empty")
			}
			return rc.mutate(func() (roadmap.Topic, error) { return rc.store.Edit(args[0], changes) })
		},
	}
	cmd.Flags().StringVar(&title, "title", "", "new title")
	cmd.Flags().StringVar(&tool, "tool", "", "new tool description")
	cmd.Flags().StringVar(&goals, "goals", "", "new goals")
	cmd.Flags().StringVar(&diagramFile, "diagram-file", "", "file holding the new diagram")
	cmd.Flags().StringVar(&courseID, "course", "", "linked installed course id (empty unlinks)")
	cmd.Flags().StringVar(&plan, "plan", "", "linked future-course plan path (empty unlinks)")
	return cmd
}

func (rc *roadmapCtx) moveCmd() *cobra.Command {
	const spelling = "tutor roadmap move <slug> --after <slug>|--first"
	var after string
	var first bool
	cmd := &cobra.Command{
		Use:   "move <slug> --after <slug>|--first",
		Short: "Reorder a topic within its track",
		Args:  exactArgs(1, spelling),
		RunE: func(_ *cobra.Command, args []string) error {
			if first == (after != "") {
				return usageErr("usage: %s", spelling)
			}
			return rc.mutate(func() (roadmap.Topic, error) { return rc.store.Move(args[0], after, first) })
		},
	}
	cmd.Flags().StringVar(&after, "after", "", "place the topic directly after this slug")
	cmd.Flags().BoolVar(&first, "first", false, "place the topic first in its track")
	return cmd
}

func (rc *roadmapCtx) removeCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "remove <slug>",
		Short: "Delete a topic and its follow-ups",
		Args:  exactArgs(1, "tutor roadmap remove <slug>"),
		RunE: func(_ *cobra.Command, args []string) error {
			return rc.mutate(func() (roadmap.Topic, error) { return rc.store.Remove(args[0]) })
		},
	}
}

// followupNumber parses the 1-based follow-up number of choose and remove.
func followupNumber(value string) (int, error) {
	n, err := strconv.Atoi(value)
	if err != nil || n < 1 {
		return 0, usageErr("follow-up number must be a positive integer")
	}
	return n, nil
}

func (rc *roadmapCtx) followupCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "followup",
		Short: "Manage a topic's optional Go follow-ups",
		Args:  exactArgs(0, "tutor roadmap followup add <topic> --title T --description T | choose <topic> <n> | remove <topic> <n>"),
		RunE: func(*cobra.Command, []string) error {
			return usageErr("usage: tutor roadmap followup add <topic> --title T --description T | choose <topic> <n> | remove <topic> <n>")
		},
	}
	var title, description string
	add := &cobra.Command{
		Use:   "add <topic> --title T --description T",
		Short: "Add a follow-up project to a topic",
		Args:  exactArgs(1, "tutor roadmap followup add <topic> --title T --description T"),
		RunE: func(c *cobra.Command, args []string) error {
			if !c.Flags().Changed("title") || !c.Flags().Changed("description") {
				return usageErr("usage: tutor roadmap followup add <topic> --title T --description T")
			}
			return rc.mutate(func() (roadmap.Topic, error) { return rc.store.FollowupAdd(args[0], title, description) })
		},
	}
	add.Flags().StringVar(&title, "title", "", "follow-up title")
	add.Flags().StringVar(&description, "description", "", "what to build and what it demonstrates")
	choose := &cobra.Command{
		Use:   "choose <topic> <n>",
		Short: "Mark follow-up n as the chosen project",
		Args:  exactArgs(2, "tutor roadmap followup choose <topic> <n>"),
		RunE: func(_ *cobra.Command, args []string) error {
			n, err := followupNumber(args[1])
			if err != nil {
				return err
			}
			return rc.mutate(func() (roadmap.Topic, error) { return rc.store.FollowupChoose(args[0], n) })
		},
	}
	remove := &cobra.Command{
		Use:   "remove <topic> <n>",
		Short: "Delete follow-up n of a topic",
		Args:  exactArgs(2, "tutor roadmap followup remove <topic> <n>"),
		RunE: func(_ *cobra.Command, args []string) error {
			n, err := followupNumber(args[1])
			if err != nil {
				return err
			}
			return rc.mutate(func() (roadmap.Topic, error) { return rc.store.FollowupRemove(args[0], n) })
		},
	}
	cmd.AddCommand(add, choose, remove)
	return cmd
}

func (rc *roadmapCtx) importCmd() *cobra.Command {
	var file string
	var replace bool
	cmd := &cobra.Command{
		Use:   "import [--file PATH] [--replace]",
		Short: "Load the roadmap snapshot into the database",
		Args:  exactArgs(0, "tutor roadmap import [--file PATH] [--replace]"),
		RunE: func(*cobra.Command, []string) error {
			src := file
			if src == "" {
				src = rc.file
			}
			n, err := rc.store.Import(src, replace)
			if err != nil {
				return err
			}
			fmt.Fprintf(rc.out, "Imported %d topics from %s into %s\n", n, src, rc.store.Path)
			return nil
		},
	}
	cmd.Flags().StringVar(&file, "file", "", "snapshot to import (default roadmap/roadmap.json)")
	cmd.Flags().BoolVar(&replace, "replace", false, "overwrite a database that already has topics")
	return cmd
}

func (rc *roadmapCtx) exportCmd() *cobra.Command {
	var file string
	cmd := &cobra.Command{
		Use:   "export [--file PATH]",
		Short: "Write the database back to the roadmap snapshot",
		Args:  exactArgs(0, "tutor roadmap export [--file PATH]"),
		RunE: func(*cobra.Command, []string) error {
			dst := file
			if dst == "" {
				dst = rc.file
			}
			if err := rc.store.Export(dst); err != nil {
				return classifyRoadmap(err)
			}
			fmt.Fprintf(rc.out, "Exported the roadmap to %s\n", dst)
			return nil
		},
	}
	cmd.Flags().StringVar(&file, "file", "", "destination (default roadmap/roadmap.json)")
	return cmd
}
