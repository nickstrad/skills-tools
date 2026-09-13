package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"skills-tools/tutor/internal/course"
)

func smoke(root string) error {
	work, err := os.MkdirTemp("/tmp", "pe-batch-seven-smoke-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(work)
	db := filepath.Join(work, "progress.sqlite")
	tutor := filepath.Join(root, ".cache/tutor")
	call := func(args ...string) (string, error) {
		args = append([]string{"--root", root, "postgres-essentials"}, args...)
		args = append(args, "--db", db)
		out, e := exec.Command(tutor, args...).CombinedOutput()
		if e != nil {
			return "", fmt.Errorf("%v: %w: %s", args, e, out)
		}
		return string(out), nil
	}
	if _, err = call("init"); err != nil {
		return err
	}
	before, err := os.ReadFile(db)
	if err != nil {
		return err
	}
	lessons, err := course.LoadLessons(root, "postgres-essentials")
	if err != nil {
		return err
	}
	var summary strings.Builder
	for _, l := range lessons {
		if l.Ordinal < 27 {
			continue
		}
		plain, e := call(fmt.Sprint(l.Ordinal), "lesson", "--plain")
		if e != nil {
			return e
		}
		// Inspect the actual emitted view, including the exact starter and worked
		// completion, and ensure the mechanism precedes setup commands.
		for _, part := range []string{l.Title, l.Code, l.ExpectedResult, l.SystemsLens, "Mechanism map", "Your task", "cleanup=owned_tree_removed"} {
			if !strings.Contains(plain, part) {
				return fmt.Errorf("lesson %d omitted rendered content %q", l.Ordinal, part)
			}
		}
		if strings.Index(plain, "Mechanism map") > strings.Index(plain, l.Setup) {
			return fmt.Errorf("lesson %d diagram follows setup", l.Ordinal)
		}
		out, e := call(fmt.Sprint(l.Ordinal), "lesson", "--json")
		if e != nil {
			return e
		}
		var actual course.Lesson
		if e = json.Unmarshal([]byte(out), &actual); e != nil {
			return e
		}
		if actual.Code != l.Code || actual.Setup != l.Setup || actual.ExpectedResult != l.ExpectedResult {
			return fmt.Errorf("lesson %d JSON/source mismatch", l.Ordinal)
		}
		fmt.Fprintf(&summary, "lesson %d: complete plain/JSON render matches source; diagram before setup; %d bytes\n", l.Ordinal, len(plain))
	}
	route, e := call("route")
	if e != nil {
		return e
	}
	for _, line := range []string{"31. Received WAL is not yet visible data — available", "32. Give a replica read a bounded freshness guarantee — planned"} {
		if !strings.Contains(route, line) {
			return fmt.Errorf("route missing %q", line)
		}
	}
	after, e := os.ReadFile(db)
	if e != nil {
		return e
	}
	if sha256.Sum256(before) != sha256.Sum256(after) {
		return fmt.Errorf("display mutated isolated progress")
	}
	for _, args := range [][]string{{"27", "skip"}, {"28", "done"}, {"undone", "27"}} {
		if _, e = call(args...); e != nil {
			return e
		}
	}
	status, e := call("status", "--json")
	if e != nil {
		return e
	}
	var s struct{ Total, Done, Skipped int }
	if e = json.Unmarshal([]byte(status), &s); e != nil {
		return e
	}
	if s.Total != 31 || s.Done != 1 || s.Skipped != 0 {
		return fmt.Errorf("unexpected isolated status: %s", status)
	}
	fmt.Fprintln(&summary, "route: 31 available / 40 planned total; next unauthored boundary 32")
	fmt.Fprintln(&summary, "read-only render/route preserves isolated DB bytes; explicit skip/done/undone works only in temporary DB")
	fmt.Fprintln(&summary, "isolated progress and rendered scratch retired; learner database never opened by smoke checks")
	path := filepath.Join(root, "courses/postgres-essentials/validation/batch-seven-smoke.log")
	if e = os.WriteFile(path, []byte(summary.String()), 0644); e != nil {
		return e
	}
	// Preserve runtime acceptance hashes separately; this manifest covers final
	// prose and the smoke validator as well as the unchanged experiment controller.
	manifest := map[string]string{}
	files, e := filepath.Glob(filepath.Join(root, "courses/postgres-essentials/lessons/*.md"))
	if e != nil {
		return e
	}
	for _, rel := range []string{"lab/recovery/main.go", "validation/batch-seven/main.go", "validation/batch-seven/smoke.go"} {
		files = append(files, filepath.Join(root, "courses/postgres-essentials", rel))
	}
	for _, file := range files {
		b, e := os.ReadFile(file)
		if e != nil {
			return e
		}
		rel, e := filepath.Rel(root, file)
		if e != nil {
			return e
		}
		manifest[rel] = fmt.Sprintf("%x", sha256.Sum256(b))
	}
	encoded, e := json.MarshalIndent(manifest, "", "  ")
	if e != nil {
		return e
	}
	if e = os.WriteFile(filepath.Join(root, "courses/postgres-essentials/validation/batch-seven-final-source.json"), append(encoded, '\n'), 0644); e != nil {
		return e
	}
	fmt.Print(summary.String())
	return nil
}
