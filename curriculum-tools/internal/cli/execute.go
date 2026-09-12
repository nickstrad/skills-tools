// Package cli is the tutor command tree: one cobra command per discovered course, plus the
// cross-course commands. Execute builds the whole tree from scratch on every call, so the CLI has
// no process-global state and tests can run it repeatedly with different roots and databases.
//
// Output contract (archive/plans/go-tutor-migration.md §3.3): successful output goes to stdout; every failure prints exactly
// "Error: <message>" on stderr. Two failures append context after a blank line because the learner
// cannot act without it: the number-first grammar error appends the usage text, and an unknown
// course appends the course listing. Exit codes are 0 success, 2 for usage/parse errors, an
// unknown course, a missing lesson and route/courses failures, and 1 for every other runtime
// failure (a missing progress database, an unreadable lesson file, a failed write).
package cli

import (
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"skills-tools/tutor/internal/progress"
	"skills-tools/tutor/internal/render"
	"skills-tools/tutor/internal/route"
)

// Version is printed by `tutor version`. cmd/tutor sets it from the launcher's -ldflags.
var Version = "dev"

// exitError carries an explicit exit code and optional trailing context for one failure.
type exitError struct {
	code  int
	msg   string
	extra string // printed after a blank line, e.g. the usage text or the course listing
}

func (e *exitError) Error() string { return e.msg }

// usageErr is a usage/parse failure: exit 2, no trailing context.
func usageErr(format string, args ...any) error {
	return &exitError{code: 2, msg: fmt.Sprintf(format, args...)}
}

// runtimeErr is a non-usage failure: exit 1.
func runtimeErr(format string, args ...any) error {
	return &exitError{code: 1, msg: fmt.Sprintf(format, args...)}
}

// classify maps an error to its exit code, message and trailing context.
func classify(err error) (int, string, string) {
	var ee *exitError
	if errors.As(err, &ee) {
		return ee.code, ee.msg, ee.extra
	}
	var notFound progress.NotFoundError
	if errors.As(err, &notFound) {
		return 2, err.Error(), ""
	}
	return 1, err.Error(), ""
}

// report prints one failure in the contract's shape and returns its exit code.
func report(stderr io.Writer, err error) int {
	code, msg, extra := classify(err)
	if extra != "" {
		fmt.Fprintf(stderr, "Error: %s\n\n%s\n", msg, extra)
	} else {
		fmt.Fprintf(stderr, "Error: %s\n", msg)
	}
	return code
}

// Execute runs one tutor command line and returns its exit code. args excludes the program name.
func Execute(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		fmt.Fprintln(stdout, usageText())
		return 0
	}

	// The learner grammar and the curriculum root both have to be settled before cobra parses.
	normalized, err := NormalizeArgs(args)
	if err != nil {
		if errors.Is(err, errNumberForm) {
			return report(stderr, &exitError{code: 2, msg: err.Error(), extra: usageText()})
		}
		return report(stderr, usageErr("%s", err.Error()))
	}
	scan, err := scanArgs(normalized)
	if err != nil {
		return report(stderr, usageErr("%s", err.Error()))
	}
	root, err := resolveRoot(scan)
	if err != nil {
		return report(stderr, usageErr("%s", err.Error()))
	}

	discovered, discErr := route.DiscoverCourses(root)
	if discErr != nil {
		// Discovery validates every course's catalog against its canonical plan, so one drifted
		// course would otherwise take the whole CLI down — including the `check` command whose job
		// is to name that exact drift. Fall back to a plain course listing for the command tree;
		// the commands that genuinely need discovery (`courses`, the unknown-course listing)
		// report the discovery failure instead.
		degraded, listErr := degradedDiscovery(root)
		if listErr != nil {
			return report(stderr, usageErr("%s", discErr.Error()))
		}
		discovered = degraded
	}

	if err := route.ValidateNames(discovered); err != nil {
		return report(stderr, usageErr("%s", err.Error()))
	}
	cmd := newRootCmd(root, discovered, stdout, stderr)

	// Cobra would report an unrecognized first token as an unknown command; the learner needs the
	// course listing instead, so intercept it here.
	if len(scan.positions) > 0 {
		first := normalized[scan.positions[0]]
		if !hasSubCommand(cmd, first) {
			if discErr != nil {
				return report(stderr, usageErr("%s", discErr.Error()))
			}
			return report(stderr, &exitError{
				code:  2,
				msg:   fmt.Sprintf("unknown course '%s'", first),
				extra: render.Courses(discovered),
			})
		}
	}

	cmd.SetArgs(normalized)
	if err := cmd.Execute(); err != nil {
		return report(stderr, err)
	}
	return 0
}

// degradedDiscovery lists the installed courses without validating their routes, so the command
// tree can still be built when one course's plan and catalog disagree. Lesson and route counts are
// unknown in this mode; only the course identities matter, because every verb that needs real
// numbers recomputes them itself.
func degradedDiscovery(root string) ([]route.CourseDiscovery, error) {
	return route.DiscoverIdentities(root)
}

// hasSubCommand reports whether name is a registered top-level command (hidden ones included).
func hasSubCommand(root *cobra.Command, name string) bool {
	for _, sub := range root.Commands() {
		if sub.Name() == name || sub.HasAlias(name) {
			return true
		}
	}
	return false
}

// newRootCmd builds the whole tree for one invocation.
func newRootCmd(root string, discovered []route.CourseDiscovery, stdout, stderr io.Writer) *cobra.Command {
	cmd := &cobra.Command{
		Use:           "tutor",
		Short:         "Hands-on systems tutor",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	cmd.SetOut(stdout)
	cmd.SetErr(stderr)
	cmd.PersistentFlags().String("root", "", "curriculum-tools directory (default $TUTOR_ROOT)")
	// Flag parse failures are usage errors; wrap them so they exit 2 rather than 1.
	cmd.SetFlagErrorFunc(func(_ *cobra.Command, err error) error { return usageErr("%s", err.Error()) })
	cmd.SetHelpFunc(func(c *cobra.Command, _ []string) {
		if c == cmd {
			fmt.Fprintln(c.OutOrStdout(), usageText())
			return
		}
		fmt.Fprint(c.OutOrStdout(), c.UsageString())
	})

	// Cross-course commands.
	cmd.AddCommand(newCoursesCmd(root, stdout))
	cmd.AddCommand(newRoadmapCmd(root, stdout))
	cmd.AddCommand(newVersionCmd(stdout))
	cmd.AddCommand(newNewCourseCmd(root, stdout))
	cmd.AddCommand(newInstallCmd(root, stdout))
	cmd.AddCommand(newProgressCmd(root, stdout))

	// One command per discovered course, installed or plan-only.
	for _, disc := range discovered {
		cmd.AddCommand(newCourseCmd(root, disc, stdout))
	}
	return cmd
}

// newVersionCmd prints the version the launcher built this binary from.
func newVersionCmd(stdout io.Writer) *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print the tutor version",
		Args:  exactArgs(0, "tutor version"),
		RunE: func(*cobra.Command, []string) error {
			fmt.Fprintf(stdout, "tutor %s\n", Version)
			return nil
		},
	}
}

// exactArgs builds an argument validator that reports a usage error naming the correct spelling.
func exactArgs(n int, spelling string) cobra.PositionalArgs {
	return func(_ *cobra.Command, args []string) error {
		if len(args) != n {
			return usageErr("usage: %s", spelling)
		}
		return nil
	}
}

// minArgs builds an argument validator requiring at least n arguments.
func minArgs(n int, spelling string) cobra.PositionalArgs {
	return func(_ *cobra.Command, args []string) error {
		if len(args) < n {
			return usageErr("usage: %s", spelling)
		}
		return nil
	}
}

// usageText is the top-level help: the three learner verbs first, then navigation and maintenance,
// then the cross-course commands and the shared flags.
func usageText() string {
	return `Hands-on systems tutor: one engine, one curriculum per tool.

Usage:
  tutor <course> route [--json]                the fixed route, with [done] marks
  tutor <course> [N] lesson [--ansi|--plain]   the next unfinished lesson, or lesson N
  tutor <course> N done [--note TEXT]          record completion

Navigation and progress maintenance:
  tutor <course> next [--topic TEXT] [--json]
  tutor <course> undone N
  tutor <course> N skip [--note TEXT]         skip this lesson (also: skip N)
  tutor <course> note N TEXT...
  tutor <course> list [--todo|--done|--all] [--category NAME] [--topic TEXT] [--limit N] [--json]
  tutor <course> modules [--json]
  tutor <course> topics [--json]
  tutor <course> status [--json]
  tutor <course> search TEXT... [--json]

Course maintenance:
  tutor <course> init [--db PATH]              create or refresh the progress database
  tutor <course> check                         validate the lesson files against the plan

Across courses:
  tutor courses [--json]                       every installed and planned course
  tutor roadmap [--json] [--followups]         the overall learning roadmap
  tutor new-course <id> "<Name>" <tool> "<description>" [minVersion]
  tutor install [--check] [--bin-dir DIR] [--codex-skills DIR] [--claude-skills DIR]
  tutor progress consolidate [--db PATH] [--from-dir DIR] [--backup-dir DIR] [--replace]
  tutor version

Flags:
  --root PATH   curriculum-tools directory (default $TUTOR_ROOT, else the launcher's checkout)
  --db PATH     progress database (default curriculum-tools/tutor.sqlite, shared by every course)
  --json        machine-readable output, on the verbs that support it
  --ansi        force ANSI styling of lesson Markdown
  --plain       disable ANSI styling

--topic matches every word against lesson tags, category and title (e.g. --topic "buffer cache");
'topics' lists the tag vocabulary with progress so related lessons can be found quickly.
The normal flow is 'tutor <course> N lesson', then 'tutor <course> N done'.
Displaying a lesson never marks it done.
A planned course has a route but no lessons yet: only 'route' works on it.`
}

// ansiEnabled decides whether lesson Markdown is styled: --ansi always, --plain never, otherwise
// only when the real process stdout is a terminal (and is the writer being printed to, so tests
// and pipes stay plain).
func ansiEnabled(stdout io.Writer, ansi, plain bool) bool {
	if ansi {
		return true
	}
	if plain {
		return false
	}
	if stdout != io.Writer(os.Stdout) {
		return false
	}
	info, err := os.Stdout.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}
