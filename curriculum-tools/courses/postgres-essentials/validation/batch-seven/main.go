// Run from curriculum-tools: go run ./courses/postgres-essentials/validation/batch-seven.
// Exercises the actual Markdown starter and worked commands through the shared CLI.
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
	"time"

	"skills-tools/tutor/internal/course"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func write(path string, data []byte) { must(os.WriteFile(path, data, 0644)) }
func main() {
	smokeOnly := flag.Bool("smoke-only", false, "check rendered lessons and isolated progress without allocating PostgreSQL")
	flag.Parse()
	root, err := os.Getwd()
	must(err)
	if *smokeOnly {
		must(smoke(root))
		return
	}
	courseDir := filepath.Join(root, "courses/postgres-essentials")
	report := filepath.Join(courseDir, "validation")
	work, err := os.MkdirTemp("/tmp", "pe-batch-seven-")
	must(err)
	defer os.RemoveAll(work)
	must(os.Chmod(work, 0755)) // permits the normal-user fixture check below
	clone := filepath.Join(work, "courses/postgres-essentials")
	must(os.MkdirAll(filepath.Join(clone, "lessons"), 0755))
	for _, name := range []string{"PLAN.md", "course.json"} {
		b, e := os.ReadFile(filepath.Join(courseDir, name))
		must(e)
		write(filepath.Join(clone, name), b)
	}
	lessons, err := course.LoadLessons(root, "postgres-essentials")
	must(err)
	files, err := filepath.Glob(filepath.Join(courseDir, "lessons/*.md"))
	must(err)
	for _, file := range files {
		b, e := os.ReadFile(file)
		must(e)
		write(filepath.Join(clone, "lessons", filepath.Base(file)), b)
	}
	manifest := map[string]string{}
	for _, file := range append(files, filepath.Join(courseDir, "lab/recovery/main.go")) {
		b, e := os.ReadFile(file)
		must(e)
		rel, e := filepath.Rel(root, file)
		must(e)
		manifest[rel] = fmt.Sprintf("%x", sha256.Sum256(b))
	}
	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	must(err)
	write(filepath.Join(report, "batch-seven-source.json"), append(manifestBytes, '\n'))
	tutor := filepath.Join(root, ".cache/tutor")
	command := func(label string, wantFailure bool, checks []string, name string, args ...string) string {
		start := time.Now()
		c := exec.Command(name, args...)
		c.Dir = root
		out, e := c.CombinedOutput()
		write(filepath.Join(report, "batch-seven-"+label+".log"), out)
		if (e != nil) != wantFailure {
			panic(fmt.Sprintf("%s unexpected exit %v: %s", label, e, out))
		}
		text := string(out)
		for _, check := range checks {
			if !strings.Contains(text, check) {
				panic(label + " missing evidence: " + check)
			}
		}
		for _, match := range regexp.MustCompile(`fixture=(/tmp/pe-recovery-[0-9]+)`).FindAllStringSubmatch(text, -1) {
			if _, e := os.Stat(match[1]); !os.IsNotExist(e) {
				panic("fixture retained: " + match[1])
			}
		}
		fmt.Printf("%s accepted elapsed=%s\n", label, time.Since(start).Round(time.Millisecond))
		return text
	}
	starterErrors := map[int]string{
		27: "inventory query did not distinguish the changed quantity",
		28: "required archive segment is still missing",
		29: "chosen point includes bad import",
		30: "standby.signal absent",
		31: "deadline waiting for replay and visible marker",
	}
	for _, l := range lessons {
		if l.Ordinal < 27 {
			continue
		}
		command(fmt.Sprintf("starter-%d", l.Ordinal), true, []string{starterErrors[l.Ordinal], "cleanup=owned_tree_removed removed=true", "0/1 lessons completed"}, tutor, "--root", root, "postgres-essentials", "validate", "--isolated", "--timeout", "60000", fmt.Sprint(l.Ordinal))
		section := strings.SplitN(l.ExpectedResult, "### Worked completion", 2)
		if len(section) != 2 {
			panic("missing worked completion")
		}
		code := strings.SplitN(section[1], "```sh\n", 2)
		if len(code) != 2 {
			panic("missing worked shell fence")
		}
		worked := strings.SplitN(code[1], "\n```", 2)[0]
		file := filepath.Join(clone, "lessons", fmt.Sprintf("%02d-%s.md", l.Ordinal, l.Slug))
		b, e := os.ReadFile(file)
		must(e)
		if strings.Count(string(b), l.Code) != 1 {
			panic("ambiguous Run substitution")
		}
		write(file, []byte(strings.Replace(string(b), l.Code, worked, 1)))
	}
	command("worked-sequence", false, []string{
		"baseline_matches_restore=true distinguishes_later_source=true",
		"missing_history_failure_verified=true", "repaired_recovery=true original_archive_unchanged=true",
		"accepted_order_preserved=true bad_import_excluded=true recovery_paused=true",
		"standby_signal=true in_recovery=true receiver=streaming post_backup_marker_visible=true",
		"paused|t|f|0", "not paused|t|t|1", "5/5 lessons completed",
	}, tutor, "--root", work, "postgres-essentials", "validate", "--isolated", "--timeout", "60000", "27", "28", "29", "30", "31")
	fixture := filepath.Join(work, "recovery")
	command("build", false, nil, "go", "build", "-o", fixture, "./courses/postgres-essentials/lab/recovery")
	command("missing-standby-option", true, []string{"standby.signal absent", "cleanup=owned_tree_removed removed=true"}, fixture, "--lesson", "30", "--action", `pg_basebackup -d "$PRIMARY" -D "$DEST" -X stream --checkpoint=fast`)
	command("action-error", true, []string{"intentional action failure", "cleanup=owned_tree_removed removed=true"}, fixture, "--lesson", "30", "--action", `echo 'intentional action failure'; exit 7`)
	if os.Geteuid() == 0 {
		command("normal-user", false, []string{"baseline_matches_restore=true distinguishes_later_source=true", "cleanup=owned_tree_removed removed=true"}, "runuser", "-u", "postgres", "--", fixture, "--lesson", "27", "--query", "SELECT id,item,quantity FROM inventory ORDER BY id")
	}
	// Interrupt after real replication evidence; both active servers must be retired.
	logPath := filepath.Join(report, "batch-seven-interrupt.log")
	f, err := os.Create(logPath)
	must(err)
	c := exec.Command(fixture, "--lesson", "31", "--action", "sleep 20")
	c.Stdout = f
	c.Stderr = f
	must(c.Start())
	deadline := time.Now().Add(30 * time.Second)
	ready := false
	for time.Now().Before(deadline) {
		b, e := os.ReadFile(logPath)
		must(e)
		if strings.Contains(string(b), "receive_lsn|replay_lsn|receiver_status=") {
			ready = true
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	must(c.Process.Signal(os.Interrupt))
	err = c.Wait()
	must(f.Close())
	if !ready || err == nil {
		panic("interrupt did not exercise an active fixture")
	}
	b, err := os.ReadFile(logPath)
	must(err)
	if !strings.Contains(string(b), "cleanup=owned_tree_removed removed=true") {
		panic("interrupt cleanup missing")
	}
	for _, match := range regexp.MustCompile(`fixture=(/tmp/pe-recovery-[0-9]+)`).FindAllStringSubmatch(string(b), -1) {
		if _, e := os.Stat(match[1]); !os.IsNotExist(e) {
			panic("interrupt retained " + match[1])
		}
	}
	fmt.Println("interrupt accepted; all owned fixture paths absent")
	fmt.Println("batch seven real-tool acceptance complete; only small repository logs retained")
}
