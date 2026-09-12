package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const maxBody = 4 << 20
const maxEntries = 64

var slugRE = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)
var oidRE = regexp.MustCompile(`^[0-9a-f]{40,64}$`)
var keyRE = regexp.MustCompile(`^(records|packs)/[a-z0-9][a-z0-9.-]{0,63}$`)
var refRE = regexp.MustCompile(`^refs/heads/[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$`)

type Update struct {
	Ref string `json:"ref"`
	Old string `json:"old"`
	New string `json:"new"`
}
type Record struct {
	Repository string   `json:"repository"`
	Operation  string   `json:"operation"`
	Pack       string   `json:"pack"`
	SHA256     string   `json:"sha256"`
	Updates    []Update `json:"updates"`
}
type Index struct {
	Generation int               `json:"generation"`
	Entries    []string          `json:"entries"`
	Refs       map[string]string `json:"refs"`
}
type State struct {
	Applied int               `json:"applied"`
	Entries []string          `json:"entries"`
	Refs    map[string]string `json:"refs"`
	Index   Index             `json:"index"`
	ETag    string            `json:"etag"`
}

func ownedLab(input string) (string, error) {
	fi, err := os.Lstat(input)
	if err != nil {
		return "", err
	}
	if fi.Mode()&os.ModeSymlink != 0 || !fi.IsDir() {
		return "", errors.New("LAB must be a real directory, not a symlink")
	}
	real, err := filepath.EvalSymlinks(input)
	if err != nil {
		return "", err
	}
	real, err = filepath.Abs(real)
	if err != nil {
		return "", err
	}
	if filepath.Dir(real) != "/tmp" || !strings.HasPrefix(filepath.Base(real), "systems-cursor-git-") {
		return "", errors.New("LAB is outside the owned /tmp root")
	}
	b, err := os.ReadFile(filepath.Join(real, ".cursor-git-owned"))
	if err != nil {
		return "", errors.New("LAB ownership marker missing")
	}
	if strings.TrimSpace(string(b)) != real {
		return "", errors.New("LAB ownership marker does not match canonical path")
	}
	return real, nil
}
func validName(s string) error {
	if !slugRE.MatchString(s) {
		return fmt.Errorf("invalid replica name %q", s)
	}
	return nil
}
func decodeStrict[T any](b []byte, dst *T) error {
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if err := d.Decode(dst); err != nil {
		return err
	}
	if d.More() {
		return errors.New("trailing JSON")
	}
	return nil
}
func validOID(s string) bool { return oidRE.MatchString(s) }
func validateRecord(r Record) error {
	if r.Repository != "tiny" || !slugRE.MatchString(r.Operation) || !keyRE.MatchString(r.Pack) || len(r.SHA256) != 64 {
		return errors.New("invalid record identity or pack")
	}
	if _, err := hex.DecodeString(r.SHA256); err != nil {
		return errors.New("invalid record sha256")
	}
	if len(r.Updates) < 1 || len(r.Updates) > 8 {
		return errors.New("invalid update count")
	}
	seen := map[string]bool{}
	for _, u := range r.Updates {
		if !refRE.MatchString(u.Ref) || !validOID(u.Old) || !validOID(u.New) || seen[u.Ref] {
			return errors.New("invalid record ref update")
		}
		seen[u.Ref] = true
	}
	return nil
}
func validateIndex(x Index) error {
	if x.Generation < 0 || len(x.Entries) < 1 || len(x.Entries) > maxEntries || len(x.Refs) > 16 {
		return errors.New("invalid index bounds")
	}
	seen := map[string]bool{}
	for _, k := range x.Entries {
		if !keyRE.MatchString(k) || !strings.HasPrefix(k, "records/") || seen[k] {
			return errors.New("invalid index entry")
		}
		seen[k] = true
	}
	for r, o := range x.Refs {
		if !refRE.MatchString(r) || !validOID(o) {
			return errors.New("invalid index ref")
		}
	}
	return nil
}
func semanticEqual(a, b Record) bool {
	aa, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return bytes.Equal(aa, bb)
}
func sha(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
