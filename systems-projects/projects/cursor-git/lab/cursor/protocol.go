package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func fetchIndex(ctx context.Context, s *store, etag string) (Index, string, int, error) {
	b, e, c, err := s.get(ctx, "index.json", etag)
	if err != nil {
		return Index{}, "", c, err
	}
	if c == 304 {
		return Index{}, etag, c, nil
	}
	var x Index
	if err = decodeStrict(b, &x); err != nil {
		return x, "", c, err
	}
	if err = validateIndex(x); err != nil {
		return x, "", c, err
	}
	if e == "" {
		return x, "", c, errors.New("index response has no ETag")
	}
	return x, e, c, nil
}
func fetchRecord(ctx context.Context, s *store, key string) (Record, error) {
	b, _, _, e := s.get(ctx, key, "")
	if e != nil {
		return Record{}, e
	}
	var r Record
	if e = decodeStrict(b, &r); e != nil {
		return r, e
	}
	return r, validateRecord(r)
}
func history(ctx context.Context, s *store, x Index) ([]Record, map[string]string, error) {
	refs := map[string]string{}
	rs := make([]Record, 0, len(x.Entries))
	for _, k := range x.Entries {
		r, e := fetchRecord(ctx, s, k)
		if e != nil {
			return nil, nil, e
		}
		for _, u := range r.Updates {
			cur := refs[u.Ref]
			if cur == "" {
				cur = "0000000000000000000000000000000000000000"
			}
			if cur != u.Old {
				return nil, nil, fmt.Errorf("history precondition for %s: expected %s, got %s", u.Ref, u.Old, cur)
			}
			refs[u.Ref] = u.New
		}
		rs = append(rs, r)
	}
	if !sameRefs(refs, x.Refs) {
		return nil, nil, errors.New("index refs do not equal replayed history")
	}
	return rs, refs, nil
}

func publish(ctx context.Context, lab, name string, lose bool, s *store) error {
	b, e := os.ReadFile(filepath.Join(lab, name+".record.json"))
	if e != nil {
		return e
	}
	var want Record
	if e = decodeStrict(b, &want); e != nil {
		return e
	}
	if e = validateRecord(want); e != nil {
		return e
	}
	pack, e := os.ReadFile(filepath.Join(lab, name+".pack"))
	if e != nil {
		return e
	}
	if sha(pack) != want.SHA256 {
		return errors.New("local pack SHA does not match record")
	}
	remotePack, _, _, e := s.get(ctx, want.Pack, "")
	if e != nil {
		return e
	}
	if sha(remotePack) != want.SHA256 {
		return errors.New("stored pack SHA does not match record")
	}
	remoteRecord, e := fetchRecord(ctx, s, "records/"+name+".json")
	if e != nil {
		return e
	}
	if !semanticEqual(remoteRecord, want) {
		return errors.New("stored immutable record differs from local intent")
	}
	for attempt := 0; attempt < 4; attempt++ {
		x, etag, _, e := fetchIndex(ctx, s, "")
		if e != nil {
			return e
		}
		rs, refs, e := history(ctx, s, x)
		if e != nil {
			return e
		}
		for _, r := range rs {
			if r.Operation == want.Operation {
				if !semanticEqual(r, want) {
					return errors.New("operation ID reused with different intent")
				}
				fmt.Printf("already-published operation=%s generation=%d entries=%d\n", want.Operation, x.Generation, len(x.Entries))
				return nil
			}
		}
		for _, u := range want.Updates {
			cur := refs[u.Ref]
			if cur == "" {
				cur = "0000000000000000000000000000000000000000"
			}
			if cur != u.Old {
				return fmt.Errorf("publish precondition for %s: expected %s, got %s", u.Ref, u.Old, cur)
			}
			refs[u.Ref] = u.New
		}
		next := Index{Generation: x.Generation + 1, Entries: append(append([]string{}, x.Entries...), "records/"+name+".json"), Refs: refs}
		body, _ := json.Marshal(next)
		_, status, e := s.put(ctx, "index.json", etag, body)
		if status == 412 {
			continue
		}
		if e != nil {
			return e
		}
		if lose {
			return errLoseReply
		}
		fmt.Printf("published operation=%s generation=%d entries=%d\n", want.Operation, next.Generation, len(next.Entries))
		return nil
	}
	return errors.New("publication CAS retries exhausted")
}

func loadState(repo string) (State, error) {
	b, e := os.ReadFile(filepath.Join(repo, "cursor-state.json"))
	if os.IsNotExist(e) {
		return State{Refs: map[string]string{}}, nil
	}
	if e != nil {
		return State{}, e
	}
	var st State
	e = decodeStrict(b, &st)
	return st, e
}
func saveState(repo string, st State) error {
	b, e := json.MarshalIndent(st, "", "  ")
	if e != nil {
		return e
	}
	b = append(b, '\n')
	tmp := filepath.Join(repo, ".cursor-state.tmp")
	f, e := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	ok := false
	defer func() {
		f.Close()
		if !ok {
			os.Remove(tmp)
		}
	}()
	if _, e = f.Write(b); e != nil {
		return e
	}
	if e = f.Sync(); e != nil {
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	if e = os.Rename(tmp, filepath.Join(repo, "cursor-state.json")); e != nil {
		return e
	}
	ok = true
	return nil
}

func replay(ctx context.Context, lab, name, stop string, s *store, captured *struct {
	Index Index
	ETag  string
}) (State, error) {
	if e := validName(name); e != nil {
		return State{}, e
	}
	repo := filepath.Join(lab, name+".git")
	if e := ensureRepo(ctx, repo); e != nil {
		return State{}, e
	}
	st, e := loadState(repo)
	if e != nil {
		return st, e
	}
	var x Index
	var etag string
	if captured != nil {
		x, etag = captured.Index, captured.ETag
	} else {
		x, etag, _, e = fetchIndex(ctx, s, "")
		if e != nil {
			return st, e
		}
	}
	if st.Applied < 0 || st.Applied > len(x.Entries) || len(st.Entries) != st.Applied {
		return st, errors.New("invalid applied marker")
	}
	for i := range st.Entries {
		if st.Entries[i] != x.Entries[i] {
			return st, errors.New("published history prefix was rewritten")
		}
	}
	actual, e := actualRefs(ctx, repo)
	if e != nil {
		return st, e
	}
	if !sameRefs(actual, st.Refs) {
		if st.Applied >= len(x.Entries) {
			return st, errors.New("local refs diverge from applied marker")
		}
		r, e := fetchRecord(ctx, s, x.Entries[st.Applied])
		if e != nil {
			return st, e
		}
		pending := copyRefs(st.Refs)
		if e = advanceRefs(pending, r); e != nil {
			return st, e
		}
		if !sameRefs(actual, pending) {
			return st, errors.New("local refs are neither marker state nor pending transition")
		}
		st.Applied++
		st.Entries = append(st.Entries, x.Entries[st.Applied-1])
		st.Refs = pending
		if e = saveState(repo, st); e != nil {
			return st, e
		}
	}
	for st.Applied < len(x.Entries) {
		key := x.Entries[st.Applied]
		r, e := fetchRecord(ctx, s, key)
		if e != nil {
			return st, e
		}
		next := copyRefs(st.Refs)
		if e = advanceRefs(next, r); e != nil {
			return st, e
		}
		pack, _, _, e := s.get(ctx, r.Pack, "")
		if e != nil {
			return st, e
		}
		if sha(pack) != r.SHA256 {
			return st, errors.New("pack SHA mismatch")
		}
		if _, e = git(ctx, repo, pack, "index-pack", "--stdin", "--fix-thin"); e != nil {
			return st, e
		}
		if e = applyUpdates(ctx, repo, append([]Update{}, r.Updates...)); e != nil {
			return st, e
		}
		if stop == r.Operation {
			return st, errStopAfterRef
		}
		st.Applied++
		st.Entries = append(st.Entries, key)
		st.Refs = next
		if e = saveState(repo, st); e != nil {
			return st, e
		}
	}
	actual, e = actualRefs(ctx, repo)
	if e != nil || !sameRefs(actual, x.Refs) {
		if e != nil {
			return st, e
		}
		return st, errors.New("caught-up refs differ from captured index")
	}
	st.Index = x
	st.ETag = etag
	st.Refs = copyRefs(x.Refs)
	if e = saveState(repo, st); e != nil {
		return st, e
	}
	fmt.Printf("replayed generation=%d applied=%d main=%s\n", x.Generation, st.Applied, x.Refs["refs/heads/main"])
	return st, nil
}
func copyRefs(m map[string]string) map[string]string {
	n := map[string]string{}
	for k, v := range m {
		n[k] = v
	}
	return n
}
func advanceRefs(m map[string]string, r Record) error {
	for _, u := range r.Updates {
		cur := m[u.Ref]
		if cur == "" {
			cur = "0000000000000000000000000000000000000000"
		}
		if cur != u.Old {
			return fmt.Errorf("record precondition for %s", u.Ref)
		}
		m[u.Ref] = u.New
	}
	return nil
}

func read(ctx context.Context, lab, name string, s *store) error {
	start := time.Now()
	repo := filepath.Join(lab, name+".git")
	st, e := loadState(repo)
	if e != nil {
		return e
	}
	x, etag, status, e := fetchIndex(ctx, s, st.ETag)
	if e != nil {
		return e
	}
	if status == 304 {
		x = st.Index
		if st.Applied != len(x.Entries) || len(st.Entries) != len(x.Entries) {
			return errors.New("304 received without a fully applied cached index")
		}
		for i := range st.Entries {
			if st.Entries[i] != x.Entries[i] {
				return errors.New("cached index prefix mismatch")
			}
		}
	} else {
		st, e = replay(ctx, lab, name, "", s, &struct {
			Index Index
			ETag  string
		}{x, etag})
		if e != nil {
			return e
		}
		x = st.Index
	}
	actual, e := actualRefs(ctx, repo)
	if e != nil {
		return e
	}
	if !sameRefs(actual, x.Refs) {
		return errors.New("local refs do not match captured index")
	}
	fmt.Printf("served generation=%d main=%s requests=%d bytes=%d index_status=%d elapsed_ms=%d\n", x.Generation, x.Refs["refs/heads/main"], s.requests, s.bytes, s.indexStatus, time.Since(start).Milliseconds())
	return nil
}
