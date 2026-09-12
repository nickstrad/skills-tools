package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func git(ctx context.Context, repo string, input []byte, args ...string) ([]byte, error) {
	a := append([]string{"--git-dir=" + repo}, args...)
	c := exec.CommandContext(ctx, "git", a...)
	c.Env = append(os.Environ(), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null")
	c.Stdin = bytes.NewReader(input)
	var out, er bytes.Buffer
	c.Stdout = &out
	c.Stderr = &er
	if err := c.Run(); err != nil {
		return nil, fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(er.String()))
	}
	return out.Bytes(), nil
}
func ensureRepo(ctx context.Context, repo string) error {
	_, e := os.Stat(repo)
	if e == nil {
		return nil
	}
	if !os.IsNotExist(e) {
		return e
	}
	if e := os.MkdirAll(repo, 0755); e != nil {
		return e
	}
	_, e = git(ctx, repo, nil, "init", "--bare")
	return e
}
func actualRefs(ctx context.Context, repo string) (map[string]string, error) {
	out, e := git(ctx, repo, nil, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads")
	if e != nil {
		return nil, e
	}
	m := map[string]string{}
	for _, ln := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if ln == "" {
			continue
		}
		p := strings.Fields(ln)
		if len(p) != 2 {
			return nil, errors.New("unexpected git ref output")
		}
		m[p[0]] = p[1]
	}
	return m, nil
}
func sameRefs(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}
func applyUpdates(ctx context.Context, repo string, ups []Update) error {
	sort.Slice(ups, func(i, j int) bool { return ups[i].Ref < ups[j].Ref })
	var b strings.Builder
	b.WriteString("start\n")
	for _, u := range ups {
		fmt.Fprintf(&b, "update %s %s %s\n", u.Ref, u.New, u.Old)
	}
	b.WriteString("prepare\ncommit\n")
	_, e := git(ctx, repo, []byte(b.String()), "update-ref", "--stdin")
	return e
}
func withLock(ctx context.Context, lab, name string, fn func() error) error {
	if e := validName(name); e != nil {
		return e
	}
	p := filepath.Join(lab, name+".lock")
	for {
		f, e := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e == nil {
			f.Close()
			defer os.Remove(p)
			return fn()
		}
		if !os.IsExist(e) {
			return e
		}
		select {
		case <-ctx.Done():
			return errors.New("timed out acquiring replica lock")
		case <-time.After(25 * time.Millisecond):
		}
	}
}
