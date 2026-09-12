package fsutil_test

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"skills-tools/tutor/internal/fsutil"
)

// TestConcurrentCompletionsAreAtomicAndIndependent ports systemscoach's test of the same name:
// 30 goroutines race to publish distinct payloads to the same path; exactly one file must survive,
// containing one writer's bytes intact, with no temporary files left behind.
func TestConcurrentCompletionsAreAtomicAndIndependent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "receipt.json")

	payloads := make([][]byte, 30)
	for i := range payloads {
		payloads[i] = []byte(fmt.Sprintf(`{"writer":%d}`, i))
	}

	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := fsutil.PublishOnce(path, payloads[i]); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()

	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 {
		names := make([]string, len(files))
		for i, f := range files {
			names[i] = f.Name()
		}
		t.Fatalf("want exactly one surviving file (no temp files retained), got %v", names)
	}
	if files[0].Name() != filepath.Base(path) {
		t.Fatalf("surviving file is %q, want %q", files[0].Name(), filepath.Base(path))
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	matched := false
	for _, p := range payloads {
		if bytes.Equal(got, p) {
			matched = true
			break
		}
	}
	if !matched {
		t.Fatalf("published bytes %q do not match any writer's payload", got)
	}
}

func TestPublishOnceSecondCallerDoesNotModify(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "receipt.json")

	if err := fsutil.PublishOnce(path, []byte("first")); err != nil {
		t.Fatal(err)
	}
	if err := fsutil.PublishOnce(path, []byte("second")); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "first" {
		t.Fatalf("second PublishOnce modified the file: got %q", got)
	}
	files, _ := os.ReadDir(dir)
	if len(files) != 1 {
		t.Fatalf("temporary files retained: %d entries", len(files))
	}
}

func TestPublishOnceStrictReportsExisting(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "receipt.json")

	if err := fsutil.PublishOnceStrict(path, []byte("first")); err != nil {
		t.Fatal(err)
	}
	err := fsutil.PublishOnceStrict(path, []byte("second"))
	if err == nil {
		t.Fatal("want an error when path already exists")
	}
	if !errors.Is(err, fs.ErrExist) {
		t.Fatalf("want an fs.ErrExist-wrapping error, got %v", err)
	}
	got, readErr := os.ReadFile(path)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if string(got) != "first" {
		t.Fatalf("PublishOnceStrict modified the file: got %q", got)
	}
}

// TestFinishedRouteAndMalformedJSON ports the unknown-field/trailing-data assertions from
// systemscoach's test of the same name (the route/finished-lesson assertions belong to the
// packages that own that behavior).
func TestFinishedRouteAndMalformedJSON(t *testing.T) {
	type target struct {
		A int `json:"a"`
	}

	t.Run("unknown field", func(t *testing.T) {
		var v target
		err := fsutil.DecodeStrict(strings.NewReader(`{"a":1,"b":2}`), &v)
		if err == nil {
			t.Fatal("want an error for an unknown field")
		}
		if !strings.Contains(err.Error(), "unknown field") {
			t.Fatalf("error %q does not mention the unknown field", err)
		}
	})

	t.Run("trailing json value", func(t *testing.T) {
		var v target
		err := fsutil.DecodeStrict(strings.NewReader(`{"a":1} {"a":2}`), &v)
		if err == nil {
			t.Fatal("want an error for trailing data")
		}
		if !strings.Contains(err.Error(), "trailing data") {
			t.Fatalf("error %q does not mention trailing data", err)
		}
	})

	t.Run("trailing garbage", func(t *testing.T) {
		var v target
		err := fsutil.DecodeStrict(strings.NewReader(`{"a":1} x`), &v)
		if err == nil {
			t.Fatal("want an error for trailing data")
		}
		if !strings.Contains(err.Error(), "trailing data") {
			t.Fatalf("error %q does not mention trailing data", err)
		}
	})

	t.Run("trailing newline only is accepted", func(t *testing.T) {
		var v target
		if err := fsutil.DecodeStrict(strings.NewReader("{\"a\":1}\n"), &v); err != nil {
			t.Fatalf("trailing newline should be accepted: %v", err)
		}
		if v.A != 1 {
			t.Fatalf("A = %d, want 1", v.A)
		}
	})
}

func TestCopySQLite(t *testing.T) {
	t.Run("copies main file and present siblings", func(t *testing.T) {
		srcDir := t.TempDir()
		dstDir := filepath.Join(t.TempDir(), "nested", "dst")
		src := filepath.Join(srcDir, "progress.sqlite")

		writeMode := func(path, content string, mode os.FileMode) {
			if err := os.WriteFile(path, []byte(content), mode); err != nil {
				t.Fatal(err)
			}
		}
		writeMode(src, "main-db", 0o640)
		writeMode(src+"-wal", "wal-data", 0o640)
		writeMode(src+"-shm", "shm-data", 0o640)

		dst, err := fsutil.CopySQLite(src, dstDir)
		if err != nil {
			t.Fatal(err)
		}
		wantDst := filepath.Join(dstDir, "progress.sqlite")
		if dst != wantDst {
			t.Fatalf("dst = %q, want %q", dst, wantDst)
		}
		for _, tc := range []struct{ suffix, want string }{
			{"", "main-db"},
			{"-wal", "wal-data"},
			{"-shm", "shm-data"},
		} {
			got, err := os.ReadFile(dst + tc.suffix)
			if err != nil {
				t.Fatalf("reading %s%s: %v", dst, tc.suffix, err)
			}
			if string(got) != tc.want {
				t.Fatalf("%s%s = %q, want %q", dst, tc.suffix, got, tc.want)
			}
			info, err := os.Stat(dst + tc.suffix)
			if err != nil {
				t.Fatal(err)
			}
			if info.Mode().Perm() != 0o640 {
				t.Fatalf("%s%s mode = %v, want 0640", dst, tc.suffix, info.Mode().Perm())
			}
		}
	})

	t.Run("only main file copied when siblings absent", func(t *testing.T) {
		srcDir := t.TempDir()
		dstDir := t.TempDir()
		src := filepath.Join(srcDir, "progress.sqlite")
		if err := os.WriteFile(src, []byte("only-main"), 0o644); err != nil {
			t.Fatal(err)
		}

		dst, err := fsutil.CopySQLite(src, dstDir)
		if err != nil {
			t.Fatal(err)
		}
		files, err := os.ReadDir(dstDir)
		if err != nil {
			t.Fatal(err)
		}
		if len(files) != 1 {
			names := make([]string, len(files))
			for i, f := range files {
				names[i] = f.Name()
			}
			t.Fatalf("want only the main file copied, got %v", names)
		}
		got, err := os.ReadFile(dst)
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != "only-main" {
			t.Fatalf("dst content = %q, want %q", got, "only-main")
		}
	})

	t.Run("errors when src is missing", func(t *testing.T) {
		dstDir := t.TempDir()
		_, err := fsutil.CopySQLite(filepath.Join(t.TempDir(), "missing.sqlite"), dstDir)
		if err == nil {
			t.Fatal("want an error when src does not exist")
		}
	})
}
