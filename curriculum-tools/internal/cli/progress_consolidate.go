// `tutor progress consolidate`: the one-shot migration from per-course progress.sqlite files to
// the single tutor.sqlite (plan.md Phase 9). The legacy files are moved to a backup directory after
// a verified copy, never deleted.
package cli

import (
	"fmt"
	"io"
	"path/filepath"

	"github.com/spf13/cobra"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/progress"
)

// newProgressCmd builds the `tutor progress` group. Its only member today is `consolidate`.
func newProgressCmd(root string, stdout io.Writer) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "progress",
		Short: "Progress database maintenance",
		Args:  exactArgs(0, "tutor progress consolidate [--db PATH] [--from-dir DIR] [--backup-dir DIR] [--replace]"),
		RunE: func(*cobra.Command, []string) error {
			return usageErr("usage: tutor progress consolidate [--db PATH] [--from-dir DIR] [--backup-dir DIR] [--replace]")
		},
	}
	cmd.AddCommand(newConsolidateCmd(root, stdout))
	return cmd
}

func newConsolidateCmd(root string, stdout io.Writer) *cobra.Command {
	var dbPath, fromDir, backupDir string
	var replace bool
	cmd := &cobra.Command{
		Use:   "consolidate [--db PATH] [--from-dir DIR] [--backup-dir DIR] [--replace]",
		Short: "Move every per-course progress.sqlite into the one tutor.sqlite",
		Args:  exactArgs(0, "tutor progress consolidate [--db PATH] [--from-dir DIR] [--backup-dir DIR] [--replace]"),
		RunE: func(*cobra.Command, []string) error {
			installed, err := course.ListCourses(root)
			if err != nil {
				return err
			}
			ids := make([]string, 0, len(installed))
			for _, c := range installed {
				ids = append(ids, c.ID)
			}
			opts := progress.ConsolidateOptions{
				Target:    progress.DefaultPath(root),
				FromDir:   filepath.Join(root, "courses"),
				BackupDir: filepath.Join(root, ".cache", "legacy-progress"),
				Replace:   replace,
				Courses:   ids,
			}
			for flag, dst := range map[string]*string{"db": &opts.Target, "from-dir": &opts.FromDir, "backup-dir": &opts.BackupDir} {
				value := map[string]string{"db": dbPath, "from-dir": fromDir, "backup-dir": backupDir}[flag]
				if value == "" {
					continue
				}
				abs, err := filepath.Abs(value)
				if err != nil {
					return err
				}
				*dst = abs
			}
			reports, err := progress.Consolidate(opts)
			moved := 0
			for _, r := range reports {
				if r.Skipped != "" {
					fmt.Fprintf(stdout, "%s: skipped (%s)\n", r.Course, r.Skipped)
					continue
				}
				moved++
				fmt.Fprintf(stdout, "%s: %d lessons, %d progress rows, %d attempts; legacy files moved to %s\n",
					r.Course, r.Lessons, r.Progress, r.Attempts, r.Backup)
			}
			if err != nil {
				return err
			}
			fmt.Fprintf(stdout, "Consolidated %d course(s) into %s\n", moved, opts.Target)
			return nil
		},
	}
	cmd.Flags().StringVar(&dbPath, "db", "", "target database (default tutor.sqlite)")
	cmd.Flags().StringVar(&fromDir, "from-dir", "", "directory holding <course>/progress.sqlite (default courses/)")
	cmd.Flags().StringVar(&backupDir, "backup-dir", "", "where the legacy files are moved (default .cache/legacy-progress/)")
	cmd.Flags().BoolVar(&replace, "replace", false, "overwrite a course already present in the target")
	return cmd
}
