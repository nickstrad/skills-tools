// Run from curriculum-tools: go run ./courses/duckdb/validation.
// Validate exact lesson starters, displayed answers and consequential wrong choices on real tools.
package main

import (
	"crypto/sha256"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"skills-tools/tutor/internal/course"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func write(path, data string) { must(os.WriteFile(path, []byte(data), 0644)) }
func fence(s, lang string) string {
	parts := strings.SplitN(s, "```"+lang+"\n", 2)
	if len(parts) != 2 {
		panic("missing " + lang + " fence")
	}
	return strings.SplitN(parts[1], "\n```", 2)[0]
}
func replacement(sql string) string {
	return "cat > \"$DUCK_LAB/query.sql\" <<'WORKED_SQL'\n" + sql + "\nWORKED_SQL\nsed -i \"s|LAB_PATH|$DUCK_LAB|g\" \"$DUCK_LAB/query.sql\"\n"
}
func main() {
	from := flag.Int("from", 1, "resume independent trials at this lesson; retain earlier evidence")
	to := flag.Int("to", 5, "last independent lesson to run; shared sequence always covers all five")
	flag.Parse()
	if *from < 1 || *to > 5 || *from > *to {
		panic("invalid lesson range")
	}
	root, err := os.Getwd()
	must(err)
	dir := filepath.Join(root, "courses/duckdb")
	lessons, err := course.LoadLessons(root, "duckdb")
	must(err)
	metadata, err := course.LoadCourse(root, "duckdb")
	must(err)
	work, err := os.MkdirTemp("/tmp", "duckdb-validation-")
	must(err)
	defer os.RemoveAll(work)
	clone := filepath.Join(work, "courses/duckdb")
	must(os.MkdirAll(filepath.Join(clone, "lessons"), 0755))
	for _, name := range []string{"course.json", "PLAN.md"} {
		data, e := os.ReadFile(filepath.Join(dir, name))
		must(e)
		write(filepath.Join(clone, name), string(data))
	}
	var evidence strings.Builder
	if *from > 1 || *to < 5 {
		prior, e := os.ReadFile(filepath.Join(dir, "validation/results.txt"))
		must(e)
		evidence.Write(prior)
		evidence.WriteString("\nResumed after correcting evidence comparisons.\n")
	}
	command := func(label, name string, args ...string) string {
		cmd := exec.Command(name, args...)
		cmd.Dir = root
		out, e := cmd.CombinedOutput()
		out = []byte(strings.ReplaceAll(string(out), "\r\n", "\n"))
		evidence.WriteString("\n=== " + label + " ===\n" + string(out))
		// Even an unexpected shell failure must not leave its private PostgreSQL server behind.
		for _, match := range regexp.MustCompile(`(/tmp/duckdb-lesson\.[A-Za-z0-9]+)`).FindAllStringSubmatch(string(out), -1) {
			if _, statErr := os.Stat(match[1]); !os.IsNotExist(statErr) {
				cleanup := exec.Command("bash", filepath.Join(dir, "lab/cleanup.sh"), match[1])
				cleanupOut, cleanupErr := cleanup.CombinedOutput()
				evidence.Write(cleanupOut)
				must(cleanupErr)
				if e == nil {
					e = fmt.Errorf("lesson omitted its cleanup")
				}
			}
		}
		write(filepath.Join(dir, "validation/results.txt"), evidence.String())
		if e != nil {
			panic(fmt.Sprintf("%s: %v\n%s", label, e, out))
		}
		fmt.Println(label + " executed")
		return string(out)
	}
	contains := func(label, output string, checks ...string) {
		for _, check := range checks {
			if !strings.Contains(output, check) {
				panic(label + " missing: " + check + "\n" + output)
			}
		}
	}
	answers := map[int][]string{
		1: {"102,2300\n104,1700", "2,4000"},
		2: {"2,4000", "local_before_refresh,2,4000", "102,2300\n104,1700\n106,600", "3,4600"},
		3: {"1,Ada\n3,Sam", "source.sqlite: OK"},
		4: {"Mismatch Type Error", "3,oops,NULL,rejected", "4,NULL,NULL,rejected", "5,-50,-50,rejected", "accepted,2,3500", "rejected,3,-50", "5,5", "source.sqlite: OK"},
		5: {"102,2300\n104,1700", "2,4000", "orders.csv: OK"},
	}
	starters := map[int][]string{1: {"999,99900", "1,99900"}, 2: {"5,6900", "local_before_refresh,5,6900", "6,7500"}, 3: {"customer_id,name\n1,Ada\n3,Sam"}, 4: {"rejected,5,", "5,5"}, 5: {"4,6100"}}
	wrongChecks := map[int][]string{1: {"3,4800"}, 2: {"3,4900", "4,5500"}, 3: {"999,Decoy"}, 4: {"accepted,3,3450", "rejected,2,"}, 5: {"3,4800"}}
	for _, l := range lessons {
		if l.Ordinal > 5 {
			continue // This driver retains the first batch's bounded acceptance scope.
		}
		answer := fence(l.ExpectedResult, "sql")
		cleanup := fence(l.ExpectedResult, "bash")
		wrong := answer
		switch l.Ordinal {
		case 1:
			wrong = strings.ReplaceAll(answer, " AND status='paid'", "")
		case 2:
			wrong = strings.ReplaceAll(answer, "AND ordered_on < DATE '2026-09-15' ", "")
		case 3:
			wrong = strings.ReplaceAll(answer, "source.main.customers", "memory.main.customers")
		case 4:
			wrong = strings.ReplaceAll(answer, " AND amount_cents >= 0", "")
		case 5:
			wrong = strings.ReplaceAll(answer, " AND status='paid'", "")
		}
		for _, mode := range []string{"script", "manual"} {
			for _, variant := range []string{"starter", "answer", "wrong"} {
				if l.Ordinal < *from || l.Ordinal > *to {
					continue
				}
				setup, e := course.SetupCommands(l.Setup, mode)
				must(e)
				options := "set -euo pipefail\n"
				if mode == "manual" && l.Ordinal == 4 {
					// The displayed manual scan deliberately exits nonzero before the corrected call.
					// Match interactive Bash here; the error inventory below must still be exactly one.
					options = "set -uo pipefail\n"
				}
				script := options + setup + "\nset -e\nprintf 'fixture=%s\\n' \"$DUCK_LAB\"\n"
				if variant == "answer" {
					script += replacement(answer)
				}
				if variant == "wrong" {
					script += replacement(wrong)
				}
				script += l.Code + "\ndu -sk \"$DUCK_LAB\"\n" + cleanup + "\n"
				path := filepath.Join(work, "trial.sh")
				write(path, script)
				label := fmt.Sprintf("%02d-%s-%s", l.Ordinal, mode, variant)
				out := command(label, "timeout", "--kill-after=10s", "90s", "bash", path)
				checks := starters[l.Ordinal]
				if variant == "answer" {
					checks = answers[l.Ordinal]
				}
				if variant == "wrong" {
					checks = wrongChecks[l.Ordinal]
				}
				contains(label, out, checks...)
				if l.Ordinal != 4 && strings.Contains(out, "Error:") {
					panic(label + " unexpected error")
				}
				if l.Ordinal == 4 && strings.Count(out, "Error:") != 1 {
					panic(label + " unexpected error inventory")
				}
			}
		}
		l.Code = replacement(answer) + l.Code + "\n" + cleanup
		var prereqs []string
		for _, p := range l.Prerequisites {
			prereqs = append(prereqs, lessons[p-1].Slug)
		}
		write(filepath.Join(clone, "lessons", fmt.Sprintf("%02d-%s.md", l.Ordinal, l.Slug)), string(course.FormatLessonFile(metadata, l, prereqs)))
	}
	// The exact starter Setup/Run also executes in the real shared harness, with its EXIT trap.
	tutor := filepath.Join(root, ".cache/tutor")
	out := command("shared-starters", tutor, "--root", root, "duckdb", "validate", "--isolated", "--from", "1", "--to", "5", "--timeout", "60000", "--db", filepath.Join(work, "starter.sqlite"))
	contains("shared-starters", out, "5/5 lessons completed")
	out = command("shared-worked-sequence", tutor, "--root", work, "duckdb", "validate", "--isolated", "--timeout", "60000", "--db", filepath.Join(work, "worked.sqlite"))
	contains("shared-worked-sequence", out, "5/5 lessons completed")
	out = regexp.MustCompile(`(?m)^  \[A\] ?`).ReplaceAllString(out, "")
	for n, checks := range answers {
		contains(fmt.Sprint(n), out, checks...)
	}
	manifest := map[string]string{}
	for _, pattern := range []string{"lessons/0[1-5]-*.md", "lab/*", "validation/main.go", "course.json"} {
		files, e := filepath.Glob(filepath.Join(dir, pattern))
		must(e)
		for _, file := range files {
			data, e := os.ReadFile(file)
			must(e)
			rel, e := filepath.Rel(dir, file)
			must(e)
			manifest[rel] = fmt.Sprintf("%x", sha256.Sum256(data))
		}
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	must(err)
	write(filepath.Join(dir, "validation/source-manifest.json"), string(data)+"\n")
	fmt.Println("All five lessons: both setup choices with starters, worked answers, wrong choices and shared sequence accepted; owned fixtures removed.")
}
