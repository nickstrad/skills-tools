// Package fsutil holds small filesystem and encoding helpers shared by the roadmap, progress and
// export code: an atomic "publish this file, but never clobber a rival writer" primitive, a strict
// JSON decoder that rejects unknown fields and trailing data, and a helper that copies a SQLite
// database file together with its -wal/-shm siblings.
//
// PublishOnce and DecodeStrict are ports of systems-projects/cmd/systemscoach/main.go's
// writeReceipt and decode: the mechanics (temp file in the same directory, fsync, os.Link,
// DisallowUnknownFields plus a trailing-data check) are unchanged; only the receipt-specific
// names have been generalized.
package fsutil

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

// PublishOnce atomically publishes data as path, but tolerates a rival writer: if path already
// exists (created by this call or any other), PublishOnce leaves it untouched and returns nil.
//
// It writes data to a temporary file in path's directory, fsyncs and closes it, then links it to
// path. os.Link fails with an fs.ErrExist-wrapped error when path already exists; that error is
// swallowed here so the first writer's bytes win and every other caller sees success without
// modifying the file. The temporary file is always removed, whether or not the link succeeded.
// Use PublishOnceStrict when the caller needs to know it lost the race.
func PublishOnce(path string, data []byte) error {
	if err := publish(path, data); err != nil && !errors.Is(err, fs.ErrExist) {
		return err
	}
	return nil
}

// PublishOnceStrict is PublishOnce but reports the race instead of tolerating it: if path already
// exists, it returns an error wrapping fs.ErrExist (checkable with errors.Is(err, fs.ErrExist))
// and leaves the existing file untouched.
func PublishOnceStrict(path string, data []byte) error {
	return publish(path, data)
}

// publish performs the write-temp/fsync/link mechanics shared by PublishOnce and
// PublishOnceStrict. On a link collision it returns an error wrapping fs.ErrExist; callers decide
// whether that is fatal.
func publish(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".fsutil-")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Link(f.Name(), path); err != nil {
		if errors.Is(err, os.ErrExist) {
			return fmt.Errorf("%s: %w", path, fs.ErrExist)
		}
		return err
	}
	return nil
}

// DecodeStrict decodes a single JSON value from r into v, rejecting both unknown object fields
// (via json.Decoder.DisallowUnknownFields) and any trailing data after the value other than
// whitespace. It is a reader-based port of systemscoach's decode, which did the same over an
// opened file.
func DecodeStrict(r io.Reader, v any) error {
	d := json.NewDecoder(r)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return errors.New("unexpected trailing data")
	}
	return nil
}

// CopySQLite copies a SQLite database file src into dstDir, along with its -wal and -shm sidecar
// files when present (a database that has been opened in WAL mode may have pending writes in
// those files, so ignoring them can copy an inconsistent database). It creates dstDir if needed,
// preserves each source file's mode, and returns the destination path of the main database file
// (filepath.Join(dstDir, filepath.Base(src))). It errors if src does not exist.
func CopySQLite(src, dstDir string) (string, error) {
	if err := os.MkdirAll(dstDir, 0o755); err != nil {
		return "", err
	}
	dst := filepath.Join(dstDir, filepath.Base(src))
	if err := copyFile(src, dst); err != nil {
		return "", err
	}
	for _, suffix := range []string{"-wal", "-shm"} {
		s := src + suffix
		if _, err := os.Stat(s); err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			return "", err
		}
		if err := copyFile(s, dst+suffix); err != nil {
			return "", err
		}
	}
	return dst, nil
}

// copyFile copies src to dst, preserving src's file mode.
func copyFile(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	return os.Chmod(dst, info.Mode())
}
