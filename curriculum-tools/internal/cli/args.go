// Argument pre-processing that must happen before cobra sees the command line.
//
// Two things cannot be expressed inside the cobra tree. The learner grammar allows the lesson
// number in front of the verb (`tutor demo 3 lesson`), which cobra would read as an unknown
// subcommand "3"; and the curriculum root has to be known before the tree exists at all, because
// the per-course commands are registered from what `route.DiscoverCourses` finds under it. Both
// are therefore resolved here, from the raw argument slice, by a scanner that understands which
// flags take a value so that only real positional tokens are considered.
package cli

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// valuedFlags are the long flags that consume the following token as their value. Any other
// "--flag" token is a boolean switch. Keeping this list here (rather than asking cobra) is what
// lets NormalizeArgs stay a pure function over the raw arguments.
var valuedFlags = map[string]bool{
	"--db":            true,
	"--topic":         true,
	"--note":          true,
	"--category":      true,
	"--limit":         true,
	"--root":          true,
	"--bin-dir":       true,
	"--codex-skills":  true,
	"--claude-skills": true,
	"--file":          true,
	"--diagram-file":  true,
	"--status":        true,
	"--track":         true,
	"--title":         true,
	"--tool":          true,
	"--goals":         true,
	"--after":         true,
	"--course":        true,
	"--plan":          true,
	"--description":   true,
	"--from":          true,
	"--to":            true,
	"--timeout":       true,
	"--from-dir":      true,
	"--backup-dir":    true,
}

var ordinalRE = regexp.MustCompile(`^[1-9]\d*$`)

// errNumberForm is the grammar error for a lesson number that is not followed by exactly one of
// the three verbs that accept one. It is a usage error: the CLI appends the usage text to it.
var errNumberForm = errors.New("use tutor <course> NUMBER lesson|done|skip")

// errTopicWithNumber rejects `tutor <course> N lesson --topic X`: --topic picks the next matching
// lesson, so it is meaningless next to an explicit number.
var errTopicWithNumber = errors.New("--topic selects the next lesson and cannot be combined with NUMBER")

// argScan is the result of walking the raw arguments once: where the positional tokens are, and
// which flags were given (with their values, for the valued ones).
type argScan struct {
	positions []int             // indexes into the argument slice that hold positional tokens
	values    map[string]string // flag name -> value ("" for a boolean switch)
}

func (s argScan) has(flag string) bool { _, ok := s.values[flag]; return ok }

// isFlagToken reports whether a token is a flag rather than a positional argument. "-" alone is a
// positional (a conventional stdin placeholder); anything else starting with "-" is a flag.
func isFlagToken(tok string) bool { return len(tok) > 1 && strings.HasPrefix(tok, "-") }

// scanArgs walks args once, recording positional indexes and flag values. A valued flag with no
// value (end of line, or another flag next) is an error, matching the Deno engine's parseArgs.
func scanArgs(args []string) (argScan, error) {
	scan := argScan{values: map[string]string{}}
	for i := 0; i < len(args); i++ {
		tok := args[i]
		if !isFlagToken(tok) {
			scan.positions = append(scan.positions, i)
			continue
		}
		name, inline, hasInline := strings.Cut(tok, "=")
		if hasInline {
			scan.values[name] = inline
			continue
		}
		if valuedFlags[name] {
			if i+1 >= len(args) || strings.HasPrefix(args[i+1], "--") {
				return argScan{}, fmt.Errorf("%s requires a value", name)
			}
			i++
			scan.values[name] = args[i]
			continue
		}
		scan.values[name] = ""
	}
	return scan, nil
}

// NormalizeArgs rewrites the learner's number-first spelling into the form the cobra tree
// understands, leaving every other command line untouched. It is pure: it reads no environment
// and touches no file.
//
//	[demo 3 lesson]            -> [demo lesson 3]
//	[demo 3 done --note hi]    -> [demo done 3 --note hi]
//	[demo --db x 3 lesson]     -> [demo --db x lesson 3]   (flags keep their positions)
//	[demo lesson 3]            -> unchanged
//	[demo 3] / [demo 3 route]  -> errNumberForm
//	[demo 3 lesson --topic t]  -> errTopicWithNumber
//
// Only the second and third positional tokens are inspected, so flags may appear anywhere,
// including the value token of a valued flag that happens to look like a number or a verb.
func NormalizeArgs(args []string) ([]string, error) {
	scan, err := scanArgs(args)
	if err != nil {
		return nil, err
	}
	if len(scan.positions) < 2 {
		return args, nil
	}
	number := args[scan.positions[1]]
	if !ordinalRE.MatchString(number) {
		return args, nil
	}
	if len(scan.positions) != 3 {
		return nil, errNumberForm
	}
	verb := args[scan.positions[2]]
	if verb != "lesson" && verb != "done" && verb != "skip" {
		return nil, errNumberForm
	}
	if scan.has("--topic") {
		return nil, errTopicWithNumber
	}
	out := append([]string(nil), args...)
	out[scan.positions[1]] = verb
	out[scan.positions[2]] = number
	return out, nil
}

// errNoRoot is returned when no curriculum-tools directory can be found.
var errNoRoot = errors.New("tutor: cannot locate curriculum-tools; set TUTOR_ROOT")

// resolveRoot finds the curriculum-tools directory: the --root flag, else $TUTOR_ROOT, else the
// grandparent of the running executable when it contains a courses/ directory (this is the
// `bin/tutor` launcher case, where the binary lives in <root>/.cache/tutor).
func resolveRoot(scan argScan) (string, error) {
	if v := scan.values["--root"]; v != "" {
		abs, err := filepath.Abs(v)
		if err != nil {
			return "", err
		}
		return abs, nil
	}
	if v := os.Getenv("TUTOR_ROOT"); v != "" {
		abs, err := filepath.Abs(v)
		if err != nil {
			return "", err
		}
		return abs, nil
	}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(filepath.Dir(exe))
		if info, err := os.Stat(filepath.Join(dir, "courses")); err == nil && info.IsDir() {
			return dir, nil
		}
	}
	return "", errNoRoot
}
