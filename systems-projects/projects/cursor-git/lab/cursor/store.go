package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

type store struct {
	base        string
	client      *http.Client
	requests    int
	bytes       int64
	indexStatus int
}

func newStore() *store {
	base := os.Getenv("CURSOR_ENDPOINT")
	if base == "" {
		base = "http://127.0.0.1:18333/cursor-lab"
	}
	return &store{base: strings.TrimRight(base, "/"), client: &http.Client{}}
}
func (s *store) check() error {
	u, e := url.Parse(s.base)
	if e != nil {
		return e
	}
	host := u.Hostname()
	ip := net.ParseIP(host)
	if u.Scheme != "http" || ip == nil || !ip.IsLoopback() {
		return errors.New("CURSOR_ENDPOINT must be a loopback HTTP URL")
	}
	return nil
}
func (s *store) request(ctx context.Context, method, key, etag string, body []byte) ([]byte, string, int, error) {
	if err := s.check(); err != nil {
		return nil, "", 0, err
	}
	req, e := http.NewRequestWithContext(ctx, method, s.base+"/"+key, bytes.NewReader(body))
	if e != nil {
		return nil, "", 0, e
	}
	if method == http.MethodGet && etag != "" {
		req.Header.Set("If-None-Match", etag)
	}
	if method == http.MethodPut {
		if etag == "*" {
			req.Header.Set("If-None-Match", "*")
		} else {
			req.Header.Set("If-Match", etag)
		}
	}
	resp, e := s.client.Do(req)
	if e != nil {
		return nil, "", 0, e
	}
	defer resp.Body.Close()
	s.requests++
	if key == "index.json" {
		s.indexStatus = resp.StatusCode
	}
	b, e := io.ReadAll(io.LimitReader(resp.Body, maxBody+1))
	s.bytes += int64(len(b))
	if e != nil {
		return nil, "", resp.StatusCode, e
	}
	if len(b) > maxBody {
		return nil, "", resp.StatusCode, errors.New("object exceeds size bound")
	}
	return b, resp.Header.Get("ETag"), resp.StatusCode, nil
}
func (s *store) get(ctx context.Context, key, etag string) ([]byte, string, int, error) {
	b, e, c, err := s.request(ctx, http.MethodGet, key, etag, nil)
	if err == nil && c != 200 && c != 304 {
		err = fmt.Errorf("GET %s: HTTP %d", key, c)
	}
	return b, e, c, err
}
func (s *store) put(ctx context.Context, key, etag string, b []byte) (string, int, error) {
	body, e, c, err := s.request(ctx, http.MethodPut, key, etag, b)
	_ = body
	if err == nil && c != 200 {
		err = fmt.Errorf("PUT %s: HTTP %d", key, c)
	}
	return e, c, err
}
