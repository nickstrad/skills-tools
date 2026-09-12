package links_test

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"skills-tools/tutor/internal/links"
)

// oldPgtutorPath mirrors the unexported constant in the links package (the launcher location used
// before this checkout existed); tests need the literal to construct fixtures.
const oldPgtutorPath = "/root/tools/pg-systems-tutor/bin/pgtutor"

// newFixtureRepo builds a temporary checkout containing exactly the sources links.Plan needs:
// bin/tutor and the two skill directories curriculum-tools/skills/{curriculum-author,tutor}.
func newFixtureRepo(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()
	mustWriteFile(t, filepath.Join(repo, "bin", "tutor"), "#!/bin/sh\nexec tutor \"$@\"\n")
	mustWriteFile(t, filepath.Join(repo, "curriculum-tools/skills/curriculum-author/SKILL.md"), "curriculum-author skill")
	mustWriteFile(t, filepath.Join(repo, "curriculum-tools/skills/tutor/SKILL.md"), "tutor skill")
	return repo
}

// newFixtureConfig returns a Config pointed at three fresh, non-existent directories under one
// temp root, so tests can assert that nothing outside them is touched.
func newFixtureConfig(t *testing.T, repo string) links.Config {
	t.Helper()
	root := t.TempDir()
	return links.Config{
		Repo:         repo,
		BinDir:       filepath.Join(root, "bin"),
		CodexSkills:  filepath.Join(root, "codex"),
		ClaudeSkills: filepath.Join(root, "claude"),
	}
}

func mustWriteFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func mustMkdirAll(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatal(err)
	}
}

func mustCopyDir(t *testing.T, src, dst string) {
	t.Helper()
	if err := os.MkdirAll(dst, 0o755); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		s := filepath.Join(src, entry.Name())
		d := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			mustCopyDir(t, s, d)
			continue
		}
		data, err := os.ReadFile(s)
		if err != nil {
			t.Fatal(err)
		}
		info, err := entry.Info()
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(d, data, info.Mode()); err != nil {
			t.Fatal(err)
		}
	}
}

// snapshotTree returns a stable description of every regular file, directory and symlink under
// root (relative path, kind, mode/content-hash or link target), for before/after comparison.
func snapshotTree(t *testing.T, root string) string {
	t.Helper()
	var lines []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == root {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		switch {
		case info.Mode()&os.ModeSymlink != 0:
			target, err := os.Readlink(path)
			if err != nil {
				return err
			}
			lines = append(lines, fmt.Sprintf("link %s -> %s", rel, target))
		case d.IsDir():
			lines = append(lines, fmt.Sprintf("dir %s", rel))
		default:
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			lines = append(lines, fmt.Sprintf("file %s mode=%o sha=%x", rel, info.Mode().Perm(), sha256.Sum256(data)))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(lines)
	return strings.Join(lines, "\n")
}

func mustPlanApply(t *testing.T, cfg links.Config) []links.Action {
	t.Helper()
	actions, err := links.Plan(cfg)
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	if err := links.Apply(cfg, actions); err != nil {
		t.Fatalf("Apply: %v", err)
	}
	return actions
}

// TestCheckThenIdempotentInstall ports school-links_test.py's
// test_read_only_check_then_idempotent_install: a fresh --check reports changes and touches
// nothing, install creates every link, a second check is clean, and a second install is a no-op.
func TestCheckThenIdempotentInstall(t *testing.T) {
	repo := newFixtureRepo(t)
	cfg := newFixtureConfig(t, repo)

	changes, _, err := links.Check(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if changes == 0 {
		t.Fatal("want a nonzero change count before install")
	}
	if _, err := os.Stat(cfg.BinDir); !os.IsNotExist(err) {
		t.Fatal("Check must not create any destination directory")
	}

	mustPlanApply(t, cfg)

	changes, lines, err := links.Check(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if changes != 0 {
		t.Fatalf("changes = %d after install, want 0 (%v)", changes, lines)
	}

	// Second install is idempotent (every destination reclassifies as "ok").
	mustPlanApply(t, cfg)

	info, err := os.Lstat(filepath.Join(cfg.BinDir, "tutor"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode()&os.ModeSymlink == 0 {
		t.Fatal("want bin/tutor to be a symlink")
	}
}

// TestConflictPreflightPreservesAllDestinations ports
// test_conflict_preflight_preserves_all_destinations: a differing directory at the very last
// destination must fail Plan before anything else is created, and must itself be untouched.
func TestConflictPreflightPreservesAllDestinations(t *testing.T) {
	repo := newFixtureRepo(t)
	cfg := newFixtureConfig(t, repo)

	conflict := filepath.Join(cfg.ClaudeSkills, "tutor")
	mustWriteFile(t, filepath.Join(conflict, "SKILL.md"), "learner-owned custom skill")

	_, err := links.Plan(cfg)
	if err == nil {
		t.Fatal("want Plan to fail on the differing directory")
	}
	if !strings.Contains(err.Error(), "Refusing to overwrite differing path") {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, statErr := os.Stat(cfg.BinDir); !os.IsNotExist(statErr) {
		t.Fatal("bin dir must not have been created before the conflict was found")
	}
	got, err := os.ReadFile(filepath.Join(conflict, "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "learner-owned custom skill" {
		t.Fatal("conflicting file must be preserved untouched")
	}
}

// TestIdenticalCopyIsLinkedAndRetiredLauncherIsRemoved ports
// test_identical_copy_is_linked_and_obsolete_launcher_is_retired: a byte-identical plain directory
// copy is replaced by a symlink (with no leftover backup directory), and a retired symlink at the
// old pgtutor path is removed.
func TestIdenticalCopyIsLinkedAndRetiredLauncherIsRemoved(t *testing.T) {
	repo := newFixtureRepo(t)
	cfg := newFixtureConfig(t, repo)

	copyDir := filepath.Join(cfg.CodexSkills, "curriculum-author")
	mustCopyDir(t, filepath.Join(repo, "curriculum-tools/skills/curriculum-author"), copyDir)

	legacy := filepath.Join(cfg.BinDir, "pgtutor")
	mustMkdirAll(t, cfg.BinDir)
	if err := os.Symlink(oldPgtutorPath, legacy); err != nil {
		t.Fatal(err)
	}

	mustPlanApply(t, cfg)

	info, err := os.Lstat(copyDir)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode()&os.ModeSymlink == 0 {
		t.Fatal("want the identical copy replaced by a symlink")
	}
	if _, err := os.Lstat(legacy); !os.IsNotExist(err) {
		t.Fatal("want the retired pgtutor launcher removed")
	}
	leftovers, err := filepath.Glob(filepath.Join(cfg.CodexSkills, ".curriculum-author-link-*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(leftovers) != 0 {
		t.Fatalf("leftover backup directories: %v", leftovers)
	}

	changes, lines, err := links.Check(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if changes != 0 {
		t.Fatalf("changes = %d, want 0 (%v)", changes, lines)
	}
}

// TestExtraFilesAndUnrelatedSymlinksArePreserved ports
// test_extra_files_and_unrelated_symlinks_are_preserved: an extra file inside an otherwise
// identical copy makes it "differing", and Plan must refuse without deleting the extra file; an
// unrelated (foreign) symlink elsewhere is reported as an error and left untouched.
func TestExtraFilesAndUnrelatedSymlinksArePreserved(t *testing.T) {
	repo := newFixtureRepo(t)
	cfg := newFixtureConfig(t, repo)

	copyDir := filepath.Join(cfg.CodexSkills, "curriculum-author")
	mustCopyDir(t, filepath.Join(repo, "curriculum-tools/skills/curriculum-author"), copyDir)
	mustWriteFile(t, filepath.Join(copyDir, "custom.txt"), "keep")

	if _, err := links.Plan(cfg); err == nil {
		t.Fatal("want Plan to fail: the copy now differs from the source")
	}
	got, err := os.ReadFile(filepath.Join(copyDir, "custom.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "keep" {
		t.Fatal("extra file must be preserved")
	}

	mustMkdirAll(t, cfg.BinDir)
	foreign := filepath.Join(cfg.BinDir, "tutor")
	elsewhere := filepath.Join(cfg.BinDir, "somewhere-else")
	if err := os.Symlink(elsewhere, foreign); err != nil {
		t.Fatal(err)
	}
	_, err = links.Plan(cfg)
	if err == nil {
		t.Fatal("want Plan to fail on an unrelated symlink")
	}
	if !strings.Contains(err.Error(), "Unrelated symlink") {
		t.Fatalf("unexpected error: %v", err)
	}
	info, err := os.Lstat(foreign)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode()&os.ModeSymlink == 0 {
		t.Fatal("unrelated symlink must be preserved untouched")
	}
}

// TestDanglingRetiredSkillLinkIsRemoved is required beyond the ported Python tests: a dangling
// symlink at a retired skill name is recognized as ours (nothing else could have created a
// dangling link there) and removed.
func TestDanglingRetiredSkillLinkIsRemoved(t *testing.T) {
	repo := newFixtureRepo(t)
	cfg := newFixtureConfig(t, repo)

	mustMkdirAll(t, cfg.CodexSkills)
	dangling := filepath.Join(cfg.CodexSkills, "grpc-tutor")
	if err := os.Symlink(filepath.Join(cfg.CodexSkills, "nonexistent-target"), dangling); err != nil {
		t.Fatal(err)
	}

	mustPlanApply(t, cfg)

	if _, err := os.Lstat(dangling); !os.IsNotExist(err) {
		t.Fatal("want the dangling retired skill link removed")
	}
}

// TestForeignFileNamedPgcoachIsPreserved is required beyond the ported Python tests: a regular
// file (not a symlink) at a retired command name is reported as "keep" and left alone by Apply.
func TestForeignFileNamedPgcoachIsPreserved(t *testing.T) {
	repo := newFixtureRepo(t)
	cfg := newFixtureConfig(t, repo)

	mustMkdirAll(t, cfg.BinDir)
	foreign := filepath.Join(cfg.BinDir, "pgcoach")
	const content = "#!/bin/sh\necho foreign\n"
	mustWriteFile(t, foreign, content)

	actions, err := links.Plan(cfg)
	if err != nil {
		t.Fatal(err)
	}
	var found *links.Action
	for i := range actions {
		if actions[i].Target == foreign {
			found = &actions[i]
		}
	}
	if found == nil {
		t.Fatal("want a plan entry for the foreign pgcoach file")
	}
	if found.Outcome != "keep" {
		t.Fatalf("outcome = %q, want keep", found.Outcome)
	}
	if found.Note != "regular file, not managed" {
		t.Fatalf("note = %q", found.Note)
	}

	if err := links.Apply(cfg, actions); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(foreign)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != content {
		t.Fatal("foreign pgcoach file must be untouched")
	}
}

// TestRetiredSymlinkIntoCheckoutIsRemoved covers the "resolves into cfg.Repo" branch of the
// retired classification directly (distinct from the old-pgtutor-path and dangling branches
// already exercised above).
func TestRetiredSymlinkIntoCheckoutIsRemoved(t *testing.T) {
	repo := newFixtureRepo(t)
	cfg := newFixtureConfig(t, repo)

	mustMkdirAll(t, cfg.BinDir)
	target := filepath.Join(cfg.BinDir, "systemscoach")
	if err := os.Symlink(filepath.Join(repo, "bin", "tutor"), target); err != nil {
		t.Fatal(err)
	}

	mustPlanApply(t, cfg)

	if _, err := os.Lstat(target); !os.IsNotExist(err) {
		t.Fatal("want the retired symlink into the checkout removed")
	}
}

// TestForeignSymlinkAtRetiredNameIsKept: a retired name that is a symlink pointing somewhere that
// is neither into the checkout, nor the old pgtutor path, nor dangling, must be left alone.
func TestForeignSymlinkAtRetiredNameIsKept(t *testing.T) {
	repo := newFixtureRepo(t)
	cfg := newFixtureConfig(t, repo)

	mustMkdirAll(t, cfg.BinDir)
	elsewhere := filepath.Join(cfg.BinDir, "elsewhere-target")
	mustWriteFile(t, elsewhere, "not ours")
	foreign := filepath.Join(cfg.BinDir, "systemscoach")
	if err := os.Symlink(elsewhere, foreign); err != nil {
		t.Fatal(err)
	}

	actions := mustPlanApply(t, cfg)

	if _, err := os.Lstat(foreign); err != nil {
		t.Fatal("foreign symlink at a retired name must be preserved")
	}
	found := false
	for _, a := range actions {
		if a.Target == foreign {
			found = true
			if a.Outcome != "keep" {
				t.Fatalf("outcome = %q, want keep", a.Outcome)
			}
			if !strings.Contains(a.Note, "not managed") {
				t.Fatalf("note = %q", a.Note)
			}
		}
	}
	if !found {
		t.Fatal("want a plan entry for the foreign retired-name symlink")
	}
}

// TestCheckReportsChangesCountAndLines exercises Check's line format and change count directly:
// "create"/"replace identical copy"/"remove" count as changes, "ok"/"keep" do not.
func TestCheckReportsChangesCountAndLines(t *testing.T) {
	repo := newFixtureRepo(t)
	cfg := newFixtureConfig(t, repo)

	changes, lines, err := links.Check(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) == 0 {
		t.Fatal("want at least one reported line")
	}
	wantChanges := 0
	createLine := fmt.Sprintf("create: %s -> %s", filepath.Join(cfg.BinDir, "tutor"), filepath.Join(repo, "bin/tutor"))
	sawCreate := false
	for _, l := range lines {
		if !strings.HasPrefix(l, "ok:") && !strings.HasPrefix(l, "keep:") {
			wantChanges++
		}
		if l == createLine {
			sawCreate = true
		}
	}
	if changes != wantChanges {
		t.Fatalf("changes = %d, want %d (lines: %v)", changes, wantChanges, lines)
	}
	if !sawCreate {
		t.Fatalf("want line %q, got %v", createLine, lines)
	}

	mustPlanApply(t, cfg)

	changes, lines, err = links.Check(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if changes != 0 {
		t.Fatalf("changes = %d after install, want 0 (%v)", changes, lines)
	}
	for _, l := range lines {
		if !strings.HasPrefix(l, "ok:") {
			t.Fatalf("want every line to report ok after install, got %q", l)
		}
	}
}

// TestApplyTouchesNothingOutsideTheThreeDirectories snapshots the repo and a sibling directory
// before and after a full install, and asserts neither changed: only BinDir, CodexSkills and
// ClaudeSkills may be written to.
func TestApplyTouchesNothingOutsideTheThreeDirectories(t *testing.T) {
	repo := newFixtureRepo(t)
	cfg := newFixtureConfig(t, repo)

	root := filepath.Dir(cfg.BinDir)
	sibling := filepath.Join(root, "sibling")
	mustWriteFile(t, filepath.Join(sibling, "untouched.txt"), "hello")

	beforeRepo := snapshotTree(t, repo)
	beforeSibling := snapshotTree(t, sibling)

	mustPlanApply(t, cfg)

	if got := snapshotTree(t, repo); got != beforeRepo {
		t.Fatalf("repo contents changed during Apply:\nbefore:\n%s\nafter:\n%s", beforeRepo, got)
	}
	if got := snapshotTree(t, sibling); got != beforeSibling {
		t.Fatalf("sibling directory changed during Apply:\nbefore:\n%s\nafter:\n%s", beforeSibling, got)
	}
}

// TestPlanErrorsOnMissingSource covers the "Missing repository source" preflight message when a
// configured source (here the not-yet-authored tutor skill) does not exist in the repo.
func TestPlanErrorsOnMissingSource(t *testing.T) {
	repo := t.TempDir()
	mustWriteFile(t, filepath.Join(repo, "bin", "tutor"), "launcher")
	mustWriteFile(t, filepath.Join(repo, "curriculum-tools/skills/curriculum-author/SKILL.md"), "author skill")
	// curriculum-tools/skills/tutor is deliberately absent.
	cfg := newFixtureConfig(t, repo)

	_, err := links.Plan(cfg)
	if err == nil {
		t.Fatal("want Plan to fail when a configured source is missing")
	}
	want := "Missing repository source: " + filepath.Join(repo, "curriculum-tools/skills/tutor")
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

// TestDefaultConfig checks the field defaults without touching the filesystem.
func TestDefaultConfig(t *testing.T) {
	cfg := links.DefaultConfig("/some/repo")
	if cfg.Repo != "/some/repo" {
		t.Fatalf("Repo = %q", cfg.Repo)
	}
	if cfg.BinDir != "/usr/local/bin" {
		t.Fatalf("BinDir = %q, want /usr/local/bin", cfg.BinDir)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no home directory available")
	}
	if cfg.CodexSkills != filepath.Join(home, ".codex", "skills") {
		t.Fatalf("CodexSkills = %q", cfg.CodexSkills)
	}
	if cfg.ClaudeSkills != filepath.Join(home, ".claude", "skills") {
		t.Fatalf("ClaudeSkills = %q", cfg.ClaudeSkills)
	}
}
