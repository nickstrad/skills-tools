// Run from curriculum-tools: go run ./courses/duckdb/validation/batchtwo.
// Real-tool acceptance of the authored script/manual paths and interactive transcripts.
package main

import (
	"crypto/sha256"
	"encoding/json"
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
func write(path, s string) { must(os.WriteFile(path, []byte(s), 0644)) }
func fence(s, lang string) string {
	p := strings.SplitN(s, "```"+lang+"\n", 2)
	if len(p) != 2 {
		panic("missing " + lang + " fence")
	}
	return strings.SplitN(p[1], "\n```", 2)[0]
}
func require(out string, checks ...string) {
	for _, s := range checks {
		if !strings.Contains(out, s) {
			panic("missing evidence: " + s + "\n" + out)
		}
	}
}
func replaceQuery(sql string) string {
	return "cat > \"$DUCK_LAB/query.sql\" <<'ANSWER_SQL'\n" + sql + "\nANSWER_SQL\nsed -i \"s|LAB_PATH|$DUCK_LAB|g\" \"$DUCK_LAB/query.sql\"\n"
}

// Only automate the prompt boundaries. The learner sees and enters the original live transcript.
// Each .quit ends one actual CLI process; the next duck invocation reopens the same file.
func automate(code string) string {
	var b strings.Builder
	inside := false
	for _, line := range strings.Split(code, "\n") {
		if line == `duck "$DUCK_LAB/local.duckdb"` {
			if inside {
				panic("nested prompt")
			}
			inside = true
			b.WriteString(line + " -bail <<DUCK_PROMPT\n")
		} else if line == ".quit" {
			if !inside {
				panic("quit outside prompt")
			}
			inside = false
			b.WriteString(".quit\nDUCK_PROMPT\n")
		} else {
			b.WriteString(strings.ReplaceAll(line, "LAB_PATH", "$DUCK_LAB") + "\n")
		}
	}
	if inside {
		panic("unclosed prompt")
	}
	return b.String()
}

func main() {
	root, err := os.Getwd()
	must(err)
	dir := filepath.Join(root, "courses/duckdb")
	lessons, err := course.LoadLessons(root, "duckdb")
	must(err)
	meta, err := course.LoadCourse(root, "duckdb")
	must(err)
	work, err := os.MkdirTemp("/tmp", "duckdb-batchtwo-")
	must(err)
	defer os.RemoveAll(work)
	var evidence strings.Builder
	run := func(label, name string, args ...string) string {
		cmd := exec.Command("timeout", append([]string{"--kill-after=5s", "90s", name}, args...)...)
		cmd.Dir = root
		out, e := cmd.CombinedOutput()
		s := strings.ReplaceAll(string(out), "\r\n", "\n")
		evidence.WriteString("\n=== " + label + " ===\n" + s)
		// Failure fallback verifies and removes only exact marked fixture paths reported by setup.
		for _, p := range regexp.MustCompile(`/tmp/duckdb-lesson\.[A-Za-z0-9]+`).FindAllString(s, -1) {
			if _, statErr := os.Stat(p); statErr == nil {
				c := exec.Command("bash", filepath.Join(dir, "lab/cleanup.sh"), p)
				cleanup, ce := c.CombinedOutput()
				evidence.Write(cleanup)
				must(ce)
				if e == nil {
					e = fmt.Errorf("successful trial left an owned fixture behind: %s", p)
				}
			}
		}
		write(filepath.Join(dir, "validation/batch-two-results.txt"), evidence.String())
		if e != nil {
			panic(fmt.Sprintf("%s: %v\n%s", label, e, s))
		}
		fmt.Println(label + " executed")
		return s
	}
	checks := map[int]map[string][]string{
		6: {
			"starter": {"101,paid,1200", "before,6100", "live,6300", "saved,6100"},
			"answer":  {"102,paid,2300\n103,pending,800\n104,paid,1700", "before,4000", "live,4200", "saved,4000", "102,2500\n104,1700", "102,2300\n104,1700", "orders.csv: OK"},
			"wrong":   {"102,paid,2300\n104,paid,1700", "live,4200", "saved,4000"},
		},
		7: {
			"starter": {"initial\nNULLS_LAST", "changed\nNULLS_FIRST", "report,beta,NULL\nreport,gamma,1\nreport,alpha,2", "reset_value\nNULLS_LAST", "fresh_value\nNULLS_LAST"},
			"answer":  {"threads,2,GLOBAL", "initial\nNULLS_LAST", "changed\nNULLS_FIRST", "report,gamma,1\nreport,alpha,2\nreport,beta,NULL", "reset_value\nNULLS_LAST", "fresh_value\nNULLS_LAST"},
			"wrong":   {"report,beta,NULL\nreport,gamma,1\nreport,alpha,2"},
		},
		8: {
			"starter": {"001,12.50,13,false", "010,7.25,7,false", "false,5,19"},
			"answer":  {"account_id,VARCHAR", "amount,\"DECIMAL(10,2)\"", "001,12.50,12.50,true", "010,7.25,7.25,true", "011,oops,NULL,false", "012,-1.00,-1.00,false", "013,NULL,NULL,false", "false,3,-1.00", "true,2,19.75", "messy.csv: OK"},
			"wrong":   {"012,-1.00,-1.00,true", "true,3,18.75"},
		},
		9: {
			"starter": {"r1,2\nr2,0\nr3,1", "r2,[]", "output_rows\n3"},
			"answer":  {"r1,2\nr2,0\nr3,1", "r1,e1,search,40\nr1,e2,fetch,60\nr3,e1,search,25", "output_rows\n3", "runs.jsonl: OK"},
			"wrong":   {"r1,e1,search,40\nr3,e1,search,25", "output_rows\n2"},
		},
		10: {
			"starter": {"e3,west\ne4,east", "2,0,100"},
			"answer":  {"e1,40,NULL,", "/batch-v1.csv\ne2,60,NULL,", "/batch-v2.csv\ne4,75,east,", "e1,unknown\ne2,unknown\ne3,west\ne4,east", "4,2,200", "batch-v1.csv: OK", "batch-v2.csv: OK"},
			"wrong":   {"e1,west\ne2,west\ne3,west\ne4,east", "4,2,200"},
		},
	}
	clone := filepath.Join(work, "courses/duckdb")
	must(os.MkdirAll(filepath.Join(clone, "lessons"), 0755))
	for _, name := range []string{"course.json", "PLAN.md"} {
		b, e := os.ReadFile(filepath.Join(dir, name))
		must(e)
		write(filepath.Join(clone, name), string(b))
	}
	for _, l := range lessons {
		if l.Ordinal > 10 {
			break
		}
		var prereqs []string
		for _, p := range l.Prerequisites {
			prereqs = append(prereqs, lessons[p-1].Slug)
		}
		if l.Ordinal < 6 {
			write(filepath.Join(clone, "lessons", fmt.Sprintf("%02d-%s.md", l.Ordinal, l.Slug)), string(course.FormatLessonFile(meta, l, prereqs)))
			continue
		}
		answerCode := l.Code
		answerSQL := fence(l.ExpectedResult, "sql")
		if l.Ordinal == 6 {
			answerCode = strings.Replace(l.Code, "CREATE OR REPLACE TABLE orders AS\nSELECT\n  *\nFROM\n  read_csv('LAB_PATH/orders.csv', header = true);", answerSQL, 1)
		} else if l.Ordinal == 7 {
			answerCode = strings.ReplaceAll(l.Code, "SELECT\n  'report' AS kind,\n  job,\n  priority\nFROM\n  priorities\nORDER BY\n  priority;", answerSQL)
		}
		if l.Ordinal <= 7 && answerCode == l.Code {
			panic(fmt.Sprintf("lesson %d answer edit no longer matches the formatted Run transcript", l.Ordinal))
		}
		for _, mode := range []string{"script", "manual"} {
			for _, variant := range []string{"starter", "answer", "wrong"} {
				setup, e := course.SetupCommands(l.Setup, mode)
				must(e)
				code, sql := l.Code, answerSQL
				if variant != "starter" {
					code = answerCode
				}
				if variant == "wrong" {
					before := code + sql
					switch l.Ordinal {
					case 6:
						code = strings.Replace(code, "WHERE\n  ordered_on = DATE '2026-09-14';", "WHERE\n  ordered_on = DATE '2026-09-14'\n  AND status = 'paid';", 1)
					case 7:
						code = strings.ReplaceAll(code, "\n  priority ASC NULLS LAST;", "\n  priority ASC NULLS FIRST;")
					case 8:
						sql = strings.ReplaceAll(sql, "\n  AND amount >= 0", "")
					case 9:
						sql = strings.ReplaceAll(sql, "unnest(events)", "events[1]")
						sql = strings.ReplaceAll(sql, "AS event\nFROM\n  runs;", "AS event\nFROM\n  runs\nWHERE\n  len(events) > 0;")
					case 10:
						sql = strings.ReplaceAll(sql, "coalesce(region, 'unknown')", "coalesce(region, 'west')")
					}
					if code+sql == before {
						panic(fmt.Sprintf("lesson %d wrong-choice edit no longer matches the formatted SQL", l.Ordinal))
					}
				}
				script := "set -euo pipefail\n" + setup + "\nprintf 'fixture=%s\\n' \"$DUCK_LAB\"\n"
				if l.Ordinal >= 8 && variant != "starter" {
					script += replaceQuery(sql)
				}
				if l.Ordinal <= 7 {
					code = automate(code)
				}
				script += code + "\n"
				if variant == "answer" {
					script += code + "\n"
				} // Same attempt rerun; no fixture reset.
				script += "du -sk \"$DUCK_LAB\"\n" + fence(l.ExpectedResult, "bash") + "\nduck_cleanup\n"
				path := filepath.Join(work, "trial.sh")
				write(path, script)
				out := run(fmt.Sprintf("%02d-%s-%s", l.Ordinal, mode, variant), "bash", path)
				require(out, checks[l.Ordinal][variant]...)
				if strings.Contains(out, "Error:") {
					panic("unexpected SQL error")
				}
				if l.Ordinal == 7 && variant == "answer" && strings.Count(out, "report,gamma,1\nreport,alpha,2\nreport,beta,NULL") != 4 {
					panic("explicit ordering not stable in both defaults and reruns")
				}
			}
		}
		if l.Ordinal <= 7 {
			l.Code = automate(answerCode)
		} else {
			l.Code = replaceQuery(answerSQL) + l.Code
		}
		l.Code += "\n" + fence(l.ExpectedResult, "bash")
		write(filepath.Join(clone, "lessons", fmt.Sprintf("%02d-%s.md", l.Ordinal, l.Slug)), string(course.FormatLessonFile(meta, l, prereqs)))
	}
	tutor := filepath.Join(root, ".cache/tutor")
	// Extra failure boundaries claimed in lesson text: schema loss before projection, and
	// loss of identifier representation when choosing an inappropriate numeric conversion.
	extra := "set -euo pipefail\nsource " + dir + "/lab/session.sh 10 manual\n" + `
duck :memory: -bail -csv -c "SELECT * FROM read_csv('$DUCK_LAB/batch-v*.csv', header=true, filename=true);"
if duck :memory: -bail -csv -c "SELECT region FROM read_csv('$DUCK_LAB/batch-v*.csv', header=true, filename=true);" > "$DUCK_LAB/failure.txt" 2>&1; then
  echo 'Unexpected region without schema union'; exit 1
fi
cat "$DUCK_LAB/failure.txt"
duck_cleanup
` + "source " + dir + "/lab/session.sh 8 manual\n" + `
duck :memory: -bail -csv -c "SELECT account_id, TRY_CAST(account_id AS BIGINT) AS numeric_id FROM read_csv('$DUCK_LAB/messy.csv', header=true) ORDER BY account_id;"
duck_cleanup
`
	write(filepath.Join(work, "extra.sh"), extra)
	extraOut := run("schema-and-identifier-boundaries", "bash", filepath.Join(work, "extra.sh"))
	require(extraOut, "event_id,duration_ms,filename", "e1,40,", "e4,75,", `Binder Error: Referenced column "region" not found`, "account_id,numeric_id\n001,1\n010,10\n011,11\n012,12\n013,13")
	if strings.Count(extraOut, "Error:") != 1 {
		panic("unexpected extra error inventory")
	}
	out := run("shared-worked-sequence-6-10", tutor, "--root", work, "duckdb", "validate", "--isolated", "--from", "6", "--to", "10", "--timeout", "60000", "--db", filepath.Join(work, "sequence.sqlite"))
	require(out, "5/5 lessons completed")
	out = regexp.MustCompile(`(?m)^  \[A\] ?`).ReplaceAllString(out, "")
	for n := 6; n <= 10; n++ {
		require(out, checks[n]["answer"]...)
	}
	out = run("shared-exact-starters-8-10", tutor, "--root", root, "duckdb", "validate", "--isolated", "--from", "8", "--to", "10", "--db", filepath.Join(work, "starters.sqlite"))
	require(out, "3/3 lessons completed")
	manifest := map[string]string{}
	for _, pattern := range []string{"lessons/0[6-9]-*.md", "lessons/10-*.md", "lab/*", "validation/batchtwo/*.go", "course.json"} {
		paths, e := filepath.Glob(filepath.Join(dir, pattern))
		must(e)
		for _, p := range paths {
			b, e := os.ReadFile(p)
			must(e)
			rel, e := filepath.Rel(dir, p)
			must(e)
			manifest[rel] = fmt.Sprintf("%x", sha256.Sum256(b))
		}
	}
	b, e := json.MarshalIndent(manifest, "", "  ")
	must(e)
	write(filepath.Join(dir, "validation/batch-two-manifest.json"), string(b)+"\n")
	fmt.Println("Accepted 30 independent trials, 10 answer reruns, shared sequence and exact 8–10 starters; scratch removed.")
}
