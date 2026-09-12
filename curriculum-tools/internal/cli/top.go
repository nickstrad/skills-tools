// The cross-course commands: `courses`, `new-course` and `install`. `version` lives in execute.go
// beside the variable it prints, and `roadmap` is registered by its own work package.
package cli

import (
	"fmt"
	"io"
	"path/filepath"

	"github.com/spf13/cobra"

	"skills-tools/tutor/internal/links"
	"skills-tools/tutor/internal/render"
	"skills-tools/tutor/internal/route"
	"skills-tools/tutor/internal/scaffold"
)

// newCoursesCmd lists every installed and planned course. It reads no progress database at all, so
// it works on a machine where nothing has been initialized yet.
func newCoursesCmd(root string, stdout io.Writer) *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "courses",
		Short: "List every installed and planned course",
		Args:  exactArgs(0, "tutor courses [--json]"),
		RunE: func(*cobra.Command, []string) error {
			discovered, err := route.DiscoverCourses(root)
			if err != nil {
				return usageErr("%s", err.Error())
			}
			if asJSON {
				data, err := render.JSON(discovered)
				if err != nil {
					return usageErr("%s", err.Error())
				}
				fmt.Fprintln(stdout, string(data))
				return nil
			}
			fmt.Fprintln(stdout, render.Courses(discovered))
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "machine-readable output")
	return cmd
}

// newNewCourseCmd scaffolds courses/<id>/ from templates/course/. The agreed plan is resolved
// before any file is written, so a duplicate future identity leaves nothing behind.
func newNewCourseCmd(root string, stdout io.Writer) *cobra.Command {
	const spelling = `tutor new-course <id> "<Name>" <tool> "<description>" [minVersion]`
	return &cobra.Command{
		Use:   `new-course <id> "<Name>" <tool> "<description>" [minVersion]`,
		Short: "Scaffold a new course directory",
		Args: func(_ *cobra.Command, args []string) error {
			if len(args) < 4 || len(args) > 5 {
				return usageErr("usage: %s", spelling)
			}
			return nil
		},
		RunE: func(_ *cobra.Command, args []string) error {
			vars := scaffold.Vars{ID: args[0], Name: args[1], Tool: args[2], Description: args[3]}
			if len(args) == 5 {
				vars.MinVersion = args[4]
			}
			written, err := scaffold.Course(root, vars)
			if err != nil {
				return err
			}
			fmt.Fprintln(stdout, scaffold.Report(vars.ID, written))
			return nil
		},
	}
}

// newInstallCmd installs the `tutor` launcher and the skill directories, and removes the retired
// links of the tools this CLI replaced. --check reports what would change and exits 1 when
// anything would, so it can gate a machine-state check.
func newInstallCmd(root string, stdout io.Writer) *cobra.Command {
	var (
		checkOnly    bool
		binDir       string
		codexSkills  string
		claudeSkills string
	)
	cmd := &cobra.Command{
		Use:   "install [--check] [--bin-dir DIR] [--codex-skills DIR] [--claude-skills DIR]",
		Short: "Install the tutor launcher and skill links",
		Args:  exactArgs(0, "tutor install [--check] [--bin-dir DIR] [--codex-skills DIR] [--claude-skills DIR]"),
		RunE: func(*cobra.Command, []string) error {
			cfg := links.DefaultConfig(filepath.Dir(root))
			if binDir != "" {
				cfg.BinDir = binDir
			}
			if codexSkills != "" {
				cfg.CodexSkills = codexSkills
			}
			if claudeSkills != "" {
				cfg.ClaudeSkills = claudeSkills
			}
			if checkOnly {
				changes, lines, err := links.Check(cfg)
				if err != nil {
					return err
				}
				for _, line := range lines {
					fmt.Fprintln(stdout, line)
				}
				if changes > 0 {
					return &exitError{code: 1, msg: fmt.Sprintf("%d link(s) would change; run 'tutor install'", changes)}
				}
				return nil
			}
			actions, err := links.Plan(cfg)
			if err != nil {
				return err
			}
			if err := links.Apply(cfg, actions); err != nil {
				return err
			}
			for _, a := range actions {
				fmt.Fprintln(stdout, formatAction(a))
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&checkOnly, "check", false, "report what would change and exit 1 if anything would")
	cmd.Flags().StringVar(&binDir, "bin-dir", "", "command directory (default /usr/local/bin)")
	cmd.Flags().StringVar(&codexSkills, "codex-skills", "", "codex skills directory (default ~/.codex/skills)")
	cmd.Flags().StringVar(&claudeSkills, "claude-skills", "", "claude skills directory (default ~/.claude/skills)")
	return cmd
}

// formatAction renders one applied action in the same shape links.Check reports it, so
// `tutor install` and `tutor install --check` read identically.
func formatAction(a links.Action) string {
	switch a.Outcome {
	case "remove":
		return fmt.Sprintf("remove: %s", a.Target)
	case "keep":
		return fmt.Sprintf("keep: %s (%s)", a.Target, a.Note)
	default:
		return fmt.Sprintf("%s: %s -> %s", a.Outcome, a.Target, a.Source)
	}
}
