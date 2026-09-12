package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/harness"
)

// newValidateCmd runs the authored lessons of one course against its configured REPL. The
// command deliberately lives below a course command: the REPL and lesson files are course data,
// while the harness remains reusable by tests and other callers.
func newValidateCmd(cc *courseCtx) *cobra.Command {
	var from, to, timeoutMS int
	var isolated, keep bool
	cmd := &cobra.Command{
		Use:   "validate [--from N] [--to N] [--timeout MS] [--isolated] [--keep] [slug|N ...]",
		Short: "Run lessons against the configured tool",
		Args:  cobra.ArbitraryArgs,
		RunE: func(_ *cobra.Command, selectors []string) error {
			if keep && !isolated {
				return usageErr("--keep requires --isolated")
			}
			c, err := cc.loadCourse()
			if err != nil {
				return err
			}
			if c.Repl == nil {
				return usageErr("courses/%s/course.json has no \"repl\" block", cc.id())
			}
			lessons, err := course.LoadLessons(cc.root, cc.id())
			if err != nil {
				return err
			}
			for _, selector := range selectors {
				if !lessonSelectorExists(lessons, selector) {
					return usageErr("Unknown lesson selector: %s", selector)
				}
			}
			if from < 1 || to < 1 || from > to {
				return usageErr("--from and --to must be positive, with --from <= --to")
			}
			if timeoutMS < 1 {
				return usageErr("--timeout must be a positive number of milliseconds")
			}

			repl := resolveRepl(c.Repl, cc.root)
			opts := harness.Options{
				Repl:    repl,
				Dir:     cc.root,
				Timeout: time.Duration(timeoutMS) * time.Millisecond,
				From:    from,
				To:      to,
				Select:  selectors,
				Log:     func(line string) { fmt.Fprintln(cc.out, line) },
			}
			var evidence string
			if isolated {
				evidence, err = os.MkdirTemp("", "tutor-validation-")
				if err != nil {
					return err
				}
				if !keep {
					defer os.RemoveAll(evidence)
				}
				fmt.Fprintf(cc.out, "Evidence: %s\n", evidence)
				opts.ShellFallback = shellRepl()
				opts.PerLesson = func(lesson course.Lesson) (map[string]string, string, func(), error) {
					work := filepath.Join(evidence, lesson.Slug)
					lab := filepath.Join(work, "sqlite-lab")
					if err := os.MkdirAll(lab, 0o755); err != nil {
						return nil, "", nil, err
					}
					return map[string]string{
						"SQLITE_LAB":      lab,
						"TUTOR_SQLITE_DB": filepath.Join(lab, "lab.db"),
					}, work, nil, nil
				}
			}
			result, err := harness.Validate(lessons, opts)
			if err != nil {
				return err
			}
			fmt.Fprintln(cc.out, harness.Summary(result))
			if result.Failures != 0 {
				return runtimeErr("%d lesson(s) failed validation", result.Failures)
			}
			return nil
		},
	}
	cmd.Flags().IntVar(&from, "from", 1, "first lesson ordinal")
	cmd.Flags().IntVar(&to, "to", 999999, "last lesson ordinal")
	cmd.Flags().IntVar(&timeoutMS, "timeout", 30000, "per-step timeout in milliseconds")
	cmd.Flags().BoolVar(&isolated, "isolated", false, "give each lesson a private temporary lab")
	cmd.Flags().BoolVar(&keep, "keep", false, "keep the isolated evidence directory")
	return cmd
}

func lessonSelectorExists(lessons []course.Lesson, selector string) bool {
	for _, lesson := range lessons {
		if lesson.Slug == selector || fmt.Sprint(lesson.Ordinal) == selector {
			return true
		}
	}
	return false
}

// resolveRepl makes commands in course.json relative to the curriculum root. The old validator
// was normally launched from that directory; resolving the executable keeps the same behavior
// when `tutor --root PATH` is run from elsewhere or when isolated lessons change their cwd.
func resolveRepl(repl *course.Repl, root string) course.Repl {
	out := *repl
	out.Command = append([]string(nil), repl.Command...)
	if len(out.Command) > 0 && !filepath.IsAbs(out.Command[0]) && strings.ContainsRune(out.Command[0], os.PathSeparator) {
		out.Command[0] = filepath.Join(root, out.Command[0])
	}
	return out
}

func shellRepl() *course.Repl {
	return &course.Repl{
		Mode:    "shell",
		Command: []string{"bash", "--noprofile", "--norc"},
		Echo:    "",
		Quit:    "exit",
	}
}
