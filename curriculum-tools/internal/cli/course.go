// The per-course command factory. Every course `route.DiscoverCourses` finds becomes a top-level
// command named after its public name, carrying the learner verbs as subcommands. A plan-only (future)
// course gets `route` and nothing else.
//
// The verbs share one small context value (courseCtx) that owns flag values, database opening and
// lesson output, so each RunE stays a direct transcription of the corresponding branch of the Deno
// engine's run() in src/main.ts.
package cli

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/progress"
	"skills-tools/tutor/internal/render"
	"skills-tools/tutor/internal/route"
)

// jsonVerbs are the verbs that render a machine-readable form. Every other verb rejects --json
// rather than silently ignoring it.
var jsonVerbs = map[string]bool{
	"route": true, "lesson": true, "next": true, "list": true,
	"modules": true, "topics": true, "status": true, "search": true,
}

// courseCtx is the shared state of one course command invocation.
type courseCtx struct {
	root string
	disc route.CourseDiscovery
	out  io.Writer

	db       string // raw --db value as typed, "" when absent; quoted verbatim into lesson footers
	asJSON   bool
	ansi     bool
	plain    bool
	topic    string
	note     string
	category string
	limit    int
	todo     bool
	done     bool
	all      bool
}

// Public commands and stable storage identities are deliberately separate.
func (cc *courseCtx) publicName() string { return cc.disc.ID }
func (cc *courseCtx) storedID() string   { return cc.disc.StorageID() }

// dbPath resolves the progress database location: the --db value (relative to the working
// directory) or the one tutor.sqlite under the curriculum root. It never creates it.
func (cc *courseCtx) dbPath() (string, error) {
	if cc.db == "" {
		return progress.DefaultPath(cc.root), nil
	}
	if filepath.IsAbs(cc.db) {
		return cc.db, nil
	}
	return filepath.Abs(cc.db)
}

// notInitialized is the shared failure for every verb that needs a seeded database.
func notInitialized() error {
	return &exitError{code: 1, msg: progress.ErrNotInitialized.Error()}
}

// openRead opens the progress database read-only for a display verb. A missing file or a database
// without the lessons table is the same actionable failure, and neither creates anything.
func (cc *courseCtx) openRead() (*sql.DB, error) {
	path, err := cc.dbPath()
	if err != nil {
		return nil, err
	}
	db, err := progress.OpenReadOnly(path)
	if errors.Is(err, progress.ErrMissing) {
		return nil, notInitialized()
	}
	if err != nil {
		return nil, err
	}
	if err := progress.EnsureReady(db, cc.storedID()); err != nil {
		db.Close()
		if errors.Is(err, progress.ErrNotInitialized) {
			return nil, notInitialized()
		}
		return nil, err
	}
	return db, nil
}

// openWrite opens the progress database read-write for a progress-recording verb. The file must
// already exist: only `init` creates one, so a typo in --db can never leave an empty database
// behind.
func (cc *courseCtx) openWrite() (*sql.DB, error) {
	path, err := cc.dbPath()
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(path); err != nil {
		return nil, notInitialized()
	}
	db, err := progress.Open(path)
	if err != nil {
		return nil, err
	}
	if err := progress.EnsureReady(db, cc.storedID()); err != nil {
		db.Close()
		if errors.Is(err, progress.ErrNotInitialized) {
			return nil, notInitialized()
		}
		return nil, err
	}
	return db, nil
}

// loadCourse reads courses/<id>/course.json.
func (cc *courseCtx) loadCourse() (course.Course, error) {
	return course.LoadCourse(cc.root, cc.storedID())
}

// print writes one already-rendered block of output.
func (cc *courseCtx) print(text string) { fmt.Fprintln(cc.out, text) }

// printJSON renders v with the engine's JSON shape (two-space indent, no HTML escaping).
func (cc *courseCtx) printJSON(v any) error {
	data, err := render.JSON(v)
	if err != nil {
		return err
	}
	cc.print(string(data))
	return nil
}

// outputLesson prints one lesson row as JSON or as (optionally styled) Markdown.
func (cc *courseCtx) outputLesson(row progress.Row, asJSON bool) error {
	if asJSON {
		data, err := render.LessonJSON(row.Lesson, row.DisplayStatus(), row.Notes)
		if err != nil {
			return err
		}
		cc.print(string(data))
		return nil
	}
	c, err := cc.loadCourse()
	if err != nil {
		return err
	}
	markdown := render.RenderLesson(c, row.Lesson, row.Notes, cc.db)
	if ansiEnabled(cc.out, cc.ansi, cc.plain) {
		markdown = render.StyleMarkdown(markdown)
	}
	cc.print(markdown)
	return nil
}

// requireOrdinal parses a lesson number argument.
func requireOrdinal(value string) (int, error) {
	n, err := strconv.Atoi(value)
	if err != nil || n < 1 || !ordinalRE.MatchString(value) {
		return 0, usageErr("lesson number must be a positive integer")
	}
	return n, nil
}

// newCourseCmd builds the command tree for one discovered course.
func newCourseCmd(root string, disc route.CourseDiscovery, stdout io.Writer) *cobra.Command {
	cc := &courseCtx{root: root, disc: disc, out: stdout}

	cmd := &cobra.Command{
		Use:   disc.ID,
		Short: disc.Name,
		RunE: func(c *cobra.Command, _ []string) error {
			fmt.Fprintln(stdout, courseHelp(disc))
			return nil
		},
	}
	if disc.ID != disc.StorageID() {
		cmd.Aliases = []string{disc.StorageID()}
	}
	cmd.SetHelpFunc(func(c *cobra.Command, _ []string) {
		if c == cmd {
			fmt.Fprintln(stdout, courseHelp(disc))
			return
		}
		fmt.Fprint(c.OutOrStdout(), c.UsageString())
	})
	cmd.PersistentFlags().StringVar(&cc.db, "db", "", "progress database path")
	cmd.PersistentFlags().BoolVar(&cc.asJSON, "json", false, "machine-readable output")
	cmd.PersistentFlags().BoolVar(&cc.ansi, "ansi", false, "force ANSI styling")
	cmd.PersistentFlags().BoolVar(&cc.plain, "plain", false, "disable ANSI styling")
	cmd.PersistentPreRunE = func(c *cobra.Command, _ []string) error {
		if cc.ansi && cc.plain {
			return usageErr("--ansi and --plain cannot be used together")
		}
		if c == cmd {
			return nil
		}
		if cc.asJSON && !jsonVerbs[c.Name()] {
			return usageErr("--json is not supported by %s", c.Name())
		}
		return nil
	}

	cmd.AddCommand(newRouteCmd(cc))

	if !disc.Implemented {
		// A plan-only course has a route and nothing to run yet.
		cmd.Args = func(_ *cobra.Command, args []string) error {
			if len(args) > 0 {
				return usageErr("course '%s' is planned, not implemented; only route is available", disc.ID)
			}
			return nil
		}
		return cmd
	}

	cmd.Args = func(_ *cobra.Command, args []string) error {
		if len(args) > 0 {
			return usageErr("unknown command '%s' for course %s", args[0], disc.ID)
		}
		return nil
	}
	cmd.AddCommand(
		newLessonCmd(cc),
		newNextCmd(cc),
		newDoneCmd(cc, "done", "done", "Record a lesson as complete"),
		newDoneCmd(cc, "skip", "skipped", "Record a lesson as skipped"),
		newUndoneCmd(cc),
		newNoteCmd(cc),
		newListCmd(cc),
		newModulesCmd(cc),
		newTopicsCmd(cc),
		newStatusCmd(cc),
		newSearchCmd(cc),
		newInitCmd(cc),
		newCheckCmd(cc),
		newValidateCmd(cc),
	)
	progressCmd := &cobra.Command{Use: "progress", Short: "Verify progress preservation on a copy"}
	progressCmd.AddCommand(newProgressVerifyCmd(cc))
	cmd.AddCommand(progressCmd)
	return cmd
}

// courseHelp is the help text printed by `tutor <course>` with no verb.
func courseHelp(disc route.CourseDiscovery) string {
	id := disc.ID
	if !disc.Implemented {
		return fmt.Sprintf(`%s — %s [%s]

This course is planned, not implemented: it has an agreed route but no lessons yet.

  tutor %s route [--json]    the planned route (%d lessons)`, id, disc.Name, disc.Status, id, disc.Total)
	}
	return fmt.Sprintf(`%s — %s [%s] · %d/%d lessons available

Learner flow:
  tutor %s route [--json]                      the fixed route, with [done] marks
  tutor %s [N] lesson [--ansi|--plain]         the next unfinished lesson, or lesson N
  tutor %s N done [--note TEXT]                record completion

Navigation and progress maintenance:
  tutor %s next [--topic TEXT] [--json]
  tutor %s undone N
  tutor %s skip N [--note TEXT]
  tutor %s note N TEXT...
  tutor %s list [--todo|--done|--all] [--category NAME] [--topic TEXT] [--limit N] [--json]
  tutor %s modules [--json]
  tutor %s topics [--json]
  tutor %s status [--json]
  tutor %s search TEXT... [--json]

Course maintenance:
  tutor %s init [--db PATH]                    create or refresh the progress database
  tutor %s check                               validate the lesson files against the plan
  tutor %s validate [--isolated] [slug|N ...]    run experiments; optionally isolate evidence files
  tutor %s progress verify                     check a refresh on a database copy

Flags:
  --db PATH     progress database (default tutor.sqlite)
  --json        machine-readable output, on the verbs that support it
  --ansi        force ANSI styling of lesson Markdown
  --plain       disable ANSI styling

Displaying a lesson never marks it done.`,
		id, disc.Name, disc.Status, disc.Available, disc.Total,
		id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id)
}

// newRouteCmd: the fixed route merged with progress, read-only and database-optional.
func newRouteCmd(cc *courseCtx) *cobra.Command {
	return &cobra.Command{
		Use:   "route",
		Short: "Show the fixed route and what is done",
		Args:  exactArgs(0, fmt.Sprintf("tutor %s route [--json]", cc.publicName())),
		RunE: func(*cobra.Command, []string) error {
			path, err := cc.dbPath()
			if err != nil {
				return usageErr("%s", err.Error())
			}
			r, err := route.LoadRoute(cc.root, cc.storedID(), path)
			if err != nil {
				return usageErr("%s", err.Error())
			}
			if cc.asJSON {
				data, err := render.JSON(r)
				if err != nil {
					return usageErr("%s", err.Error())
				}
				cc.print(string(data))
				return nil
			}
			text := render.RenderRoute(r)
			if cc.ansi {
				text = render.StyleMarkdown(text)
			}
			cc.print(text)
			return nil
		},
	}
}

// nextTopicJSON and friends are the small JSON payloads of the "nothing to serve" outcomes; their
// field order is the key order the Deno engine printed.
type completeJSON struct {
	Complete bool `json:"complete"`
}

type topicNoMatchJSON struct {
	Topic   string `json:"topic"`
	Matched int    `json:"matched"`
}

type topicCompleteJSON struct {
	Topic    string `json:"topic"`
	Matched  int    `json:"matched"`
	Complete bool   `json:"complete"`
}

// serveNext prints the next unfinished lesson, or the matching "nothing left" message.
func (cc *courseCtx) serveNext(db *sql.DB, asJSON bool) error {
	row, matched, complete, err := progress.Next(db, cc.storedID(), cc.topic)
	if err != nil {
		return err
	}
	if cc.topic != "" && matched == 0 {
		if asJSON {
			return cc.printJSON(topicNoMatchJSON{Topic: cc.topic, Matched: 0})
		}
		cc.print(fmt.Sprintf("No lessons match topic '%s'. Run 'tutor %s topics' to see the vocabulary, or 'search'.", cc.topic, cc.publicName()))
		return nil
	}
	if complete {
		if cc.topic != "" {
			if asJSON {
				return cc.printJSON(topicCompleteJSON{Topic: cc.topic, Matched: matched, Complete: true})
			}
			cc.print(fmt.Sprintf("All %d lessons matching topic '%s' are complete.", matched, cc.topic))
			return nil
		}
		if asJSON {
			return cc.printJSON(completeJSON{Complete: true})
		}
		cc.print("All active lessons are complete.")
		return nil
	}
	return cc.outputLesson(row, asJSON)
}

// newLessonCmd: `lesson [N]` — the learner's main verb. Without a number it serves the next
// unfinished lesson (optionally within a topic); with one it serves exactly that lesson.
func newLessonCmd(cc *courseCtx) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "lesson [N]",
		Short: "Show the next unfinished lesson, or lesson N",
		Args: func(_ *cobra.Command, args []string) error {
			if len(args) > 1 {
				return usageErr("usage: tutor %s [N] lesson [--topic TEXT] [--ansi|--plain]", cc.publicName())
			}
			return nil
		},
		RunE: func(_ *cobra.Command, args []string) error {
			if len(args) == 1 && cc.topic != "" {
				return usageErr("%s", errTopicWithNumber.Error())
			}
			db, err := cc.openRead()
			if err != nil {
				return err
			}
			defer db.Close()
			if len(args) == 0 {
				return cc.serveNext(db, cc.asJSON)
			}
			ordinal, err := requireOrdinal(args[0])
			if err != nil {
				return err
			}
			row, err := progress.Get(db, cc.storedID(), ordinal)
			if err != nil {
				return err
			}
			return cc.outputLesson(row, cc.asJSON)
		},
	}
	cmd.Flags().StringVar(&cc.topic, "topic", "", "serve the next lesson matching these words")
	return cmd
}

// newNextCmd: the next unfinished lesson, the same selection as `lesson` with no number.
func newNextCmd(cc *courseCtx) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "next",
		Short: "Show the next unfinished lesson",
		Args:  exactArgs(0, fmt.Sprintf("tutor %s next [--topic TEXT] [--json]", cc.publicName())),
		RunE: func(*cobra.Command, []string) error {
			db, err := cc.openRead()
			if err != nil {
				return err
			}
			defer db.Close()
			return cc.serveNext(db, cc.asJSON)
		},
	}
	cmd.Flags().StringVar(&cc.topic, "topic", "", "restrict to lessons matching these words")
	return cmd
}

// newDoneCmd builds `done` and `skip`, which differ only in the status they record.
func newDoneCmd(cc *courseCtx, verb, status, short string) *cobra.Command {
	cmd := &cobra.Command{
		Use:   verb + " N",
		Short: short,
		Args:  exactArgs(1, fmt.Sprintf("tutor %s N %s [--note TEXT]", cc.publicName(), verb)),
	}
	cmd.Flags().StringVar(&cc.note, "note", "", "note to store with the progress row")
	cmd.RunE = func(_ *cobra.Command, args []string) error {
		ordinal, err := requireOrdinal(args[0])
		if err != nil {
			return err
		}
		db, err := cc.openWrite()
		if err != nil {
			return err
		}
		defer db.Close()
		if verb == "done" {
			err = progress.Done(db, cc.storedID(), ordinal, cc.note)
		} else {
			err = progress.Skip(db, cc.storedID(), ordinal, cc.note)
		}
		if err != nil {
			return err
		}
		cc.print(fmt.Sprintf("Lesson %d marked %s.", ordinal, status))
		return nil
	}
	return cmd
}

// newUndoneCmd returns a lesson to the todo state.
func newUndoneCmd(cc *courseCtx) *cobra.Command {
	return &cobra.Command{
		Use:   "undone N",
		Short: "Return a lesson to the todo state",
		Args:  exactArgs(1, fmt.Sprintf("tutor %s undone N", cc.publicName())),
		RunE: func(_ *cobra.Command, args []string) error {
			ordinal, err := requireOrdinal(args[0])
			if err != nil {
				return err
			}
			db, err := cc.openWrite()
			if err != nil {
				return err
			}
			defer db.Close()
			if err := progress.Undone(db, cc.storedID(), ordinal); err != nil {
				return err
			}
			cc.print(fmt.Sprintf("Lesson %d marked todo.", ordinal))
			return nil
		},
	}
}

// newNoteCmd saves the learner's own note on a lesson; the note is the rest of the command line.
func newNoteCmd(cc *courseCtx) *cobra.Command {
	return &cobra.Command{
		Use:   "note N TEXT...",
		Short: "Save a note on a lesson",
		Args:  minArgs(2, fmt.Sprintf("tutor %s note N TEXT...", cc.publicName())),
		RunE: func(_ *cobra.Command, args []string) error {
			ordinal, err := requireOrdinal(args[0])
			if err != nil {
				return err
			}
			text := strings.TrimSpace(strings.Join(args[1:], " "))
			if text == "" {
				return runtimeErr("note text is required")
			}
			db, err := cc.openWrite()
			if err != nil {
				return err
			}
			defer db.Close()
			if err := progress.Note(db, cc.storedID(), ordinal, text); err != nil {
				return err
			}
			cc.print(fmt.Sprintf("Note saved for lesson %d.", ordinal))
			return nil
		},
	}
}

// newListCmd lists the catalog with progress, filtered by status, category and topic.
func newListCmd(cc *courseCtx) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "list",
		Short: "List lessons with their progress",
		Args:  exactArgs(0, fmt.Sprintf("tutor %s list [--todo|--done|--all] [--category NAME] [--topic TEXT] [--limit N] [--json]", cc.publicName())),
		RunE: func(*cobra.Command, []string) error {
			if cc.limit < 0 {
				return usageErr("--limit must be a positive integer")
			}
			db, err := cc.openRead()
			if err != nil {
				return err
			}
			defer db.Close()
			rows, err := progress.List(db, cc.storedID(), progress.ListFilter{
				Todo: cc.todo, Done: cc.done, All: cc.all,
				Category: cc.category, Topic: cc.topic, Limit: cc.limit,
			})
			if err != nil {
				return err
			}
			if cc.asJSON {
				records := make([]render.LessonRecord, 0, len(rows))
				for _, row := range rows {
					records = append(records, render.BuildLessonRecord(row.Lesson, row.DisplayStatus(), row.Notes))
				}
				return cc.printJSON(records)
			}
			items := make([]render.ListItem, 0, len(rows))
			for _, row := range rows {
				items = append(items, render.ListItem{
					Ordinal: row.Ordinal, Status: row.Status, Stale: row.Stale,
					Category: row.Category, Title: row.Title, Sessions: row.Sessions, Tags: row.Tags,
				})
			}
			cc.print(render.List(items))
			return nil
		},
	}
	cmd.Flags().BoolVar(&cc.todo, "todo", false, "only unfinished lessons")
	cmd.Flags().BoolVar(&cc.done, "done", false, "only lessons completed at the current revision")
	cmd.Flags().BoolVar(&cc.all, "all", false, "every lesson (the default)")
	cmd.Flags().StringVar(&cc.category, "category", "", "restrict to one module category")
	cmd.Flags().StringVar(&cc.topic, "topic", "", "restrict to lessons matching these words")
	cmd.Flags().IntVar(&cc.limit, "limit", 0, "maximum rows (default 1000)")
	return cmd
}

// newModulesCmd summarizes progress per category.
func newModulesCmd(cc *courseCtx) *cobra.Command {
	return &cobra.Command{
		Use:   "modules",
		Short: "Summarize progress per module category",
		Args:  exactArgs(0, fmt.Sprintf("tutor %s modules [--json]", cc.publicName())),
		RunE: func(*cobra.Command, []string) error {
			db, err := cc.openRead()
			if err != nil {
				return err
			}
			defer db.Close()
			mods, err := progress.Modules(db, cc.storedID())
			if err != nil {
				return err
			}
			out := make([]render.Module, 0, len(mods))
			for _, m := range mods {
				out = append(out, render.Module{
					Category: m.Category, First: m.First, Last: m.Last,
					Total: m.Total, Done: m.Done, Minutes: m.Minutes,
				})
			}
			if cc.asJSON {
				return cc.printJSON(out)
			}
			cc.print(render.Modules(out))
			return nil
		},
	}
}

// newTopicsCmd lists the tag vocabulary with progress.
func newTopicsCmd(cc *courseCtx) *cobra.Command {
	return &cobra.Command{
		Use:   "topics",
		Short: "List the tag vocabulary with progress",
		Args:  exactArgs(0, fmt.Sprintf("tutor %s topics [--json]", cc.publicName())),
		RunE: func(*cobra.Command, []string) error {
			db, err := cc.openRead()
			if err != nil {
				return err
			}
			defer db.Close()
			topics, err := progress.Topics(db, cc.storedID())
			if err != nil {
				return err
			}
			out := make([]render.Topic, 0, len(topics))
			for _, t := range topics {
				out = append(out, render.Topic{
					Tag: t.Tag, First: t.First, Total: t.Total, Done: t.Done, Lessons: t.Lessons,
				})
			}
			if cc.asJSON {
				return cc.printJSON(out)
			}
			cc.print(render.Topics(out))
			return nil
		},
	}
}

// newStatusCmd prints the course-wide completion summary.
func newStatusCmd(cc *courseCtx) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show the course-wide completion summary",
		Args:  exactArgs(0, fmt.Sprintf("tutor %s status [--json]", cc.publicName())),
		RunE: func(*cobra.Command, []string) error {
			db, err := cc.openRead()
			if err != nil {
				return err
			}
			defer db.Close()
			s, err := progress.GetStatus(db, cc.storedID())
			if err != nil {
				return err
			}
			c, err := cc.loadCourse()
			if err != nil {
				return err
			}
			payload := render.Status{
				Course: c.PublicName(), Total: s.Total, Done: s.Done,
				Todo: s.Todo, Skipped: s.Skipped, Stale: s.Stale,
			}
			if cc.asJSON {
				return cc.printJSON(payload)
			}
			cc.print(render.StatusLine(c.Name, payload))
			return nil
		},
	}
}

// newSearchCmd finds lessons whose text contains every term.
func newSearchCmd(cc *courseCtx) *cobra.Command {
	return &cobra.Command{
		Use:   "search TEXT...",
		Short: "Find lessons containing every term",
		Args:  minArgs(1, fmt.Sprintf("tutor %s search TEXT... [--json]", cc.publicName())),
		RunE: func(_ *cobra.Command, args []string) error {
			terms := strings.Fields(strings.Join(args, " "))
			if len(terms) == 0 {
				return runtimeErr("search text is required")
			}
			db, err := cc.openRead()
			if err != nil {
				return err
			}
			defer db.Close()
			rows, err := progress.Search(db, cc.storedID(), terms)
			if err != nil {
				return err
			}
			if cc.asJSON {
				records := make([]render.LessonRecord, 0, len(rows))
				for _, row := range rows {
					records = append(records, render.BuildLessonRecord(row.Lesson, row.DisplayStatus(), row.Notes))
				}
				return cc.printJSON(records)
			}
			items := make([]render.SearchItem, 0, len(rows))
			for _, row := range rows {
				items = append(items, render.SearchItem{Ordinal: row.Ordinal, Category: row.Category, Title: row.Title})
			}
			cc.print(render.Search(items))
			return nil
		},
	}
}

// newInitCmd creates or refreshes the progress database from the lesson files. The canonical plan
// is validated first, so a catalog that has drifted from the agreed route aborts before any lesson
// row is replaced.
func newInitCmd(cc *courseCtx) *cobra.Command {
	return &cobra.Command{
		Use:   "init",
		Short: "Create or refresh the progress database",
		Args:  exactArgs(0, fmt.Sprintf("tutor %s init [--db PATH]", cc.publicName())),
		RunE: func(*cobra.Command, []string) error {
			c, err := cc.loadCourse()
			if err != nil {
				return err
			}
			lessons, err := course.LoadLessons(cc.root, cc.storedID())
			if err != nil {
				return err
			}
			if _, err := route.ReadPlanAndCatalog(cc.root, cc.storedID(), lessons); err != nil {
				return err
			}
			path, err := cc.dbPath()
			if err != nil {
				return err
			}
			db, err := progress.Open(path)
			if err != nil {
				return err
			}
			defer db.Close()
			count, err := progress.Init(db, cc.storedID(), lessons)
			if err != nil {
				return err
			}
			cc.print(fmt.Sprintf("Initialized %d %s lessons in %s", count, c.Name, path))
			return nil
		},
	}
}

// newCheckCmd validates the lesson files and their alignment with the canonical plan. It touches
// no database, so it is safe to run at any time.
func newCheckCmd(cc *courseCtx) *cobra.Command {
	return &cobra.Command{
		Use:   "check",
		Short: "Validate the lesson files against the canonical plan",
		Args:  exactArgs(0, fmt.Sprintf("tutor %s check", cc.publicName())),
		RunE: func(*cobra.Command, []string) error {
			lessons, err := course.LoadLessons(cc.root, cc.storedID())
			if err != nil {
				return err
			}
			if _, err := route.ReadPlanAndCatalog(cc.root, cc.storedID(), lessons); err != nil {
				return err
			}
			cc.print(fmt.Sprintf("%s: %d lessons OK", cc.publicName(), len(lessons)))
			return nil
		},
	}
}
