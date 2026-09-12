// Package links is a Go port of scripts/school-links.py: it plans and applies the symlinks that
// make this checkout's launcher and skills visible as `tutor`, `curriculum-author` and `tutor`
// (the skill) under /usr/local/bin, ~/.codex/skills and ~/.claude/skills, and it removes the
// handful of retired links left over from earlier tool names once they are safely identifiable as
// ours (pointing into this checkout, at the old pgtutor path, or dangling).
//
// The three phases mirror the Python script exactly: Plan preflights every destination and refuses
// to touch anything ambiguous (an unrelated symlink, a differing file or directory, a missing
// repository source) before any mutation happens; Apply performs the create/replace/remove
// operations planned, rechecking each destination's classification immediately before mutating it
// so a concurrent change is never silently clobbered; Check is a read-only report used by
// `tutor install --check`.
package links

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// oldPgtutorPath is the launcher location used before this checkout existed; a symlink still
// pointing there is retired regardless of where this checkout now lives.
const oldPgtutorPath = "/root/tools/pg-systems-tutor/bin/pgtutor"

// commandSource is one entry of the Python COMMANDS map, kept as an ordered slice so Plan and
// Check produce a stable, deterministic order.
type commandSource struct{ Name, Rel string }

// skillSource is one entry of the Python SKILLS map, installed under both skill directories.
type skillSource struct{ Name, Rel string }

// commandSources are installed into Config.BinDir. Only "tutor" survives from the Python
// COMMANDS map; pgcoach and systemscoach became retired names (see retiredCommands).
var commandSources = []commandSource{
	{Name: "tutor", Rel: "bin/tutor"},
}

// skillSources are installed into both Config.CodexSkills and Config.ClaudeSkills.
var skillSources = []skillSource{
	{Name: "curriculum-author", Rel: "curriculum-tools/skills/curriculum-author"},
	{Name: "tutor", Rel: "curriculum-tools/skills/tutor"},
}

// retiredCommands are old command names that once lived in Config.BinDir.
var retiredCommands = []string{"pgcoach", "systemscoach", "pgtutor"}

// retiredSkills are old skill names that once lived in both skill directories.
var retiredSkills = []string{
	"postgres-tutor", "sqlite-tutor", "linux-tutor", "grpc-tutor", "systemscoach", "pg-systems-tutor",
}

// Config names the checkout root and the three destination directories link installation touches.
type Config struct {
	Repo         string // checkout root, parent of curriculum-tools
	BinDir       string // default /usr/local/bin
	CodexSkills  string // default ~/.codex/skills
	ClaudeSkills string // default ~/.claude/skills
}

// DefaultConfig returns the Config used on the real machine for the checkout rooted at repo.
func DefaultConfig(repo string) Config {
	home, err := os.UserHomeDir()
	if err != nil {
		home = ""
	}
	return Config{
		Repo:         repo,
		BinDir:       "/usr/local/bin",
		CodexSkills:  filepath.Join(home, ".codex", "skills"),
		ClaudeSkills: filepath.Join(home, ".claude", "skills"),
	}
}

// Action is one planned or reported change to a single destination path.
type Action struct {
	Target  string // absolute destination path
	Source  string // absolute repository source; "" for a removal
	Kind    string // "command" | "skill" | "retired"
	Outcome string // "ok" | "create" | "replace identical copy" | "remove" | "keep"
	Note    string // why a retired entry is kept, or (unused here) error text
}

// Plan preflights every destination Config names and returns the action to take for each one,
// without mutating anything. It returns an error naming the first refused target using the same
// messages as the Python script:
//
//	"Missing repository source: <p>"
//	"Unrelated symlink: <t> -> <link>"
//	"Refusing to overwrite differing path: <t>"
//
// A retired target that is absent is simply omitted from the result; a retired target that exists
// but is not recognizably ours never errors, it is reported with outcome "keep".
func Plan(cfg Config) ([]Action, error) {
	var actions []Action

	for _, name := range retiredCommands {
		a, present, err := planRetired(cfg, filepath.Join(cfg.BinDir, name))
		if err != nil {
			return nil, err
		}
		if present {
			actions = append(actions, a)
		}
	}
	for _, c := range commandSources {
		a, err := planLink(filepath.Join(cfg.Repo, c.Rel), filepath.Join(cfg.BinDir, c.Name), "command")
		if err != nil {
			return nil, err
		}
		actions = append(actions, a)
	}

	for _, dir := range []string{cfg.CodexSkills, cfg.ClaudeSkills} {
		for _, name := range retiredSkills {
			a, present, err := planRetired(cfg, filepath.Join(dir, name))
			if err != nil {
				return nil, err
			}
			if present {
				actions = append(actions, a)
			}
		}
		for _, s := range skillSources {
			a, err := planLink(filepath.Join(cfg.Repo, s.Rel), filepath.Join(dir, s.Name), "skill")
			if err != nil {
				return nil, err
			}
			actions = append(actions, a)
		}
	}

	return actions, nil
}

// planLink classifies a single managed (non-retired) destination: source and target are both
// absolute paths. It is the Go port of the Python script's classify(), and is also used by
// installLink to recheck a destination's classification immediately before mutating it.
func planLink(source, target, kind string) (Action, error) {
	sourceInfo, err := os.Stat(source)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Action{}, fmt.Errorf("Missing repository source: %s", source)
		}
		return Action{}, err
	}

	targetInfo, err := os.Lstat(target)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Action{Target: target, Source: source, Kind: kind, Outcome: "create"}, nil
		}
		return Action{}, err
	}

	if targetInfo.Mode()&os.ModeSymlink != 0 {
		link, err := os.Readlink(target)
		if err != nil {
			return Action{}, err
		}
		if resolvePath(target) == resolvePath(source) {
			return Action{Target: target, Source: source, Kind: kind, Outcome: "ok"}, nil
		}
		return Action{}, fmt.Errorf("Unrelated symlink: %s -> %s", target, link)
	}

	if targetInfo.IsDir() && sourceInfo.IsDir() {
		targetInv, err := inventory(target)
		if err != nil {
			return Action{}, err
		}
		sourceInv, err := inventory(source)
		if err != nil {
			return Action{}, err
		}
		if inventoryEqual(targetInv, sourceInv) {
			return Action{Target: target, Source: source, Kind: kind, Outcome: "replace identical copy"}, nil
		}
	}
	return Action{}, fmt.Errorf("Refusing to overwrite differing path: %s", target)
}

// planRetired classifies a single retired-name destination. present is false when the target does
// not exist at all, in which case it must be omitted from the plan entirely.
func planRetired(cfg Config, target string) (a Action, present bool, err error) {
	info, err := os.Lstat(target)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Action{}, false, nil
		}
		return Action{}, false, err
	}

	if info.Mode()&os.ModeSymlink == 0 {
		return Action{Target: target, Kind: "retired", Outcome: "keep", Note: "regular file, not managed"}, true, nil
	}

	link, err := os.Readlink(target)
	if err != nil {
		return Action{}, false, err
	}
	resolved := link
	if !filepath.IsAbs(resolved) {
		resolved = filepath.Join(filepath.Dir(target), resolved)
	}
	resolved = filepath.Clean(resolved)

	repoClean := filepath.Clean(cfg.Repo)
	intoRepo := resolved == repoClean || strings.HasPrefix(resolved, repoClean+string(filepath.Separator))
	isOldPgtutor := resolved == filepath.Clean(oldPgtutorPath)

	_, statErr := os.Stat(target)
	dangling := statErr != nil && errors.Is(statErr, fs.ErrNotExist)

	if intoRepo || isOldPgtutor || dangling {
		return Action{Target: target, Kind: "retired", Outcome: "remove"}, true, nil
	}
	return Action{
		Target: target, Kind: "retired", Outcome: "keep",
		Note: fmt.Sprintf("symlink to %s, not managed", link),
	}, true, nil
}

// Apply performs the create/replace/remove operations named by actions (as returned by Plan). It
// rechecks each destination's classification immediately before mutating it; if that recheck finds
// a different state than planned, it returns an error rather than mutating ("Destination changed
// during installation: <t>"), or propagates the same error Plan would have returned for the new
// state (e.g. the destination is now an unrelated symlink).
func Apply(cfg Config, actions []Action) error {
	for _, a := range actions {
		if a.Kind == "retired" {
			if a.Outcome != "remove" {
				continue
			}
			if err := removeRetired(cfg, a); err != nil {
				return err
			}
			continue
		}
		if err := installLink(a); err != nil {
			return err
		}
	}
	return nil
}

// installLink performs one create/replace/ok action, after rechecking its classification.
func installLink(a Action) error {
	current, err := planLink(a.Source, a.Target, a.Kind)
	if err != nil {
		return err
	}
	if current.Outcome != a.Outcome {
		return fmt.Errorf("Destination changed during installation: %s", a.Target)
	}
	if a.Outcome == "ok" {
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(a.Target), 0o755); err != nil {
		return err
	}

	if a.Outcome == "replace identical copy" {
		backupRoot, err := os.MkdirTemp(filepath.Dir(a.Target), "."+filepath.Base(a.Target)+"-link-")
		if err != nil {
			return err
		}
		backup := filepath.Join(backupRoot, filepath.Base(a.Target))
		if err := os.Rename(a.Target, backup); err != nil {
			return err
		}
		if err := os.Symlink(a.Source, a.Target); err != nil {
			_ = os.Rename(backup, a.Target)
			_ = os.Remove(backupRoot)
			return err
		}
		// The source already contains every verified byte; no duplicate backup is needed.
		return os.RemoveAll(backupRoot)
	}

	return os.Symlink(a.Source, a.Target)
}

// removeRetired removes one retired symlink after rechecking that it is still classified "remove".
func removeRetired(cfg Config, a Action) error {
	current, _, err := planRetired(cfg, a.Target)
	if err != nil {
		return err
	}
	if current.Outcome != "remove" {
		return fmt.Errorf("Destination changed during installation: %s", a.Target)
	}
	// Remove only the symlink itself, never the file or directory it (possibly) points at.
	return os.Remove(a.Target)
}

// Check runs Plan and renders it as the read-only report used by `tutor install --check`: one
// line per target, and a count of everything that is not already satisfied ("ok" or "keep").
func Check(cfg Config) (changes int, lines []string, err error) {
	actions, err := Plan(cfg)
	if err != nil {
		return 0, nil, err
	}
	lines = make([]string, 0, len(actions))
	for _, a := range actions {
		switch a.Outcome {
		case "remove":
			lines = append(lines, fmt.Sprintf("remove: %s", a.Target))
			changes++
		case "keep":
			lines = append(lines, fmt.Sprintf("keep: %s (%s)", a.Target, a.Note))
		default: // "ok", "create", "replace identical copy"
			lines = append(lines, fmt.Sprintf("%s: %s -> %s", a.Outcome, a.Target, a.Source))
			if a.Outcome != "ok" {
				changes++
			}
		}
	}
	return changes, lines, nil
}

// resolvePath mirrors Python's pathlib Path.resolve(strict=False): it returns path's fully
// resolved, absolute form, following every symlink that exists; any path component beyond that
// (e.g. the final segment of a dangling symlink) is appended literally rather than erroring.
func resolvePath(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		return resolved
	}
	dir := filepath.Dir(abs)
	if dir == abs {
		return abs
	}
	return filepath.Join(resolvePath(dir), filepath.Base(abs))
}

// invEntry is one entry of a directory inventory, mirroring the Python inventory() tuple shapes:
// ("link", target), ("dir", subtree) or ("file", bytes, mode).
type invEntry struct {
	kind string
	link string
	dir  map[string]invEntry
	data []byte
	mode os.FileMode
}

// inventory recursively describes root's contents without following symlinks or discarding any
// entry, matching the Python inventory() function exactly.
func inventory(root string) (map[string]invEntry, error) {
	items, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	result := make(map[string]invEntry, len(items))
	for _, item := range items {
		path := filepath.Join(root, item.Name())
		info, err := os.Lstat(path)
		if err != nil {
			return nil, err
		}
		switch {
		case info.Mode()&os.ModeSymlink != 0:
			link, err := os.Readlink(path)
			if err != nil {
				return nil, err
			}
			result[item.Name()] = invEntry{kind: "link", link: link}
		case info.IsDir():
			sub, err := inventory(path)
			if err != nil {
				return nil, err
			}
			result[item.Name()] = invEntry{kind: "dir", dir: sub}
		case info.Mode().IsRegular():
			data, err := os.ReadFile(path)
			if err != nil {
				return nil, err
			}
			result[item.Name()] = invEntry{kind: "file", data: data, mode: info.Mode() & 0o777}
		default:
			return nil, fmt.Errorf("Unsupported entry: %s", path)
		}
	}
	return result, nil
}

// inventoryEqual compares two inventories the way Python dict equality does: same keys, and for
// each key the same tagged shape recursively.
func inventoryEqual(a, b map[string]invEntry) bool {
	if len(a) != len(b) {
		return false
	}
	for name, ea := range a {
		eb, ok := b[name]
		if !ok || ea.kind != eb.kind {
			return false
		}
		switch ea.kind {
		case "link":
			if ea.link != eb.link {
				return false
			}
		case "file":
			if ea.mode != eb.mode || !bytes.Equal(ea.data, eb.data) {
				return false
			}
		case "dir":
			if !inventoryEqual(ea.dir, eb.dir) {
				return false
			}
		}
	}
	return true
}
