package cli

// Temporary migration acceptance test (WP9.2). Remove with the golden corpus at WP8.4.
// All writes use t.TempDir; the baseline and golden corpus are read-only inputs.
import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"skills-tools/tutor/internal/fsutil"
	"skills-tools/tutor/internal/progress"
)

func TestParitySharedDatabase(t *testing.T) {
	const work = "/root/tutor-migration"
	if _, err := os.Stat(work + "/golden"); err != nil {
		t.Skip("migration golden corpus absent")
	}
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{"grpc", "linux", "postgres", "postgres-essentials", "sqlite"}
	tmp := t.TempDir()
	dbPath := filepath.Join(tmp, "tutor.sqlite")
	for _, id := range ids {
		if _, err := fsutil.CopySQLite(filepath.Join(work, "baseline", id, "progress.sqlite"), filepath.Join(tmp, "from", id)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := progress.Consolidate(progress.ConsolidateOptions{Target: dbPath, FromDir: filepath.Join(tmp, "from"), BackupDir: filepath.Join(tmp, "backup"), Courses: ids}); err != nil {
		t.Fatal(err)
	}
	run := func(args ...string) []byte {
		t.Helper()
		var out, stderr bytes.Buffer
		if code := Execute(append([]string{"--root", root}, args...), &out, &stderr); code != 0 {
			t.Fatalf("%v: exit %d: %s", args, code, stderr.String())
		}
		return out.Bytes()
	}
	hash := func() [32]byte {
		t.Helper()
		var data []byte
		for _, suffix := range []string{"", "-wal"} {
			b, err := os.ReadFile(dbPath + suffix)
			if err != nil && !os.IsNotExist(err) {
				t.Fatal(err)
			}
			data = append(data, b...)
		}
		return sha256.Sum256(data)
	}
	compared := 0
	compare := func(name string, got []byte, oldDB string) {
		t.Helper()
		want, err := os.ReadFile(filepath.Join(work, "golden", name))
		if err != nil {
			t.Fatal(err)
		}
		got = bytes.ReplaceAll(got, []byte(dbPath), []byte(oldDB))
		if strings.HasSuffix(name, ".json") {
			var a, b any
			if err := json.Unmarshal(want, &a); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(got, &b); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(a, b) {
				t.Errorf("%s differs", name)
			}
		} else if !bytes.Equal(want, got) {
			t.Errorf("%s differs", name)
		}
		compared++
	}
	views := []struct {
		file string
		args []string
	}{
		{"route.txt", []string{"route"}}, {"route.json", []string{"route", "--json"}},
		{"status.json", []string{"status", "--json"}}, {"status.txt", []string{"status"}},
		{"list-all.json", []string{"list", "--all", "--json"}}, {"list.txt", []string{"list"}},
		{"topics.json", []string{"topics", "--json"}}, {"topics.txt", []string{"topics"}},
		{"modules.json", []string{"modules", "--json"}}, {"modules.txt", []string{"modules"}},
		{"search-vacuum.txt", []string{"search", "vacuum"}},
		{"next.md", []string{"lesson", "--plain"}}, {"next.json", []string{"next", "--json"}},
	}
	for _, initialized := range []bool{false, true} {
		if initialized {
			// Refresh all five courses in the same file before comparing any of them.
			for _, id := range ids {
				run(id, "init", "--db", dbPath)
			}
		}
		before := hash()
		for _, id := range ids {
			prefix, variant := id, "db-init"
			if !initialized {
				prefix, variant = id+"/raw", "db"
			}
			oldDB := filepath.Join(work, "golden", id, variant, "progress.sqlite")
			for _, v := range views {
				args := append([]string{id}, v.args...)
				compare(prefix+"/"+v.file, run(append(args, "--db", dbPath)...), oldDB)
			}
			files, err := filepath.Glob(filepath.Join(work, "golden", prefix, "lesson-*.md"))
			if err != nil {
				t.Fatal(err)
			}
			for n := 1; n <= len(files); n++ {
				base := fmt.Sprintf("%s/lesson-%02d", prefix, n)
				compare(base+".md", run(id, fmt.Sprint(n), "lesson", "--plain", "--db", dbPath), oldDB)
				compare(base+".json", run(id, "lesson", fmt.Sprint(n), "--json", "--db", dbPath), oldDB)
			}
		}
		if before != hash() {
			t.Fatal("read verbs changed shared database or WAL")
		}
	}
	compare("courses.txt", run("courses"), "")
	compare("courses.json", run("courses", "--json"), "")
	for _, id := range []string{"sqlite-essentials", "linux-v2"} {
		compare("route-"+id+".txt", run(id, "route", "--db", dbPath), "")
		compare("route-"+id+".json", run(id, "route", "--json", "--db", dbPath), "")
	}
	if compared != 1130 {
		t.Fatalf("compared %d outputs, expected 1130", compared)
	}
	t.Logf("%d outputs match golden with all five courses sharing one file, before and after init; database/WAL unchanged by reads", compared)
}
