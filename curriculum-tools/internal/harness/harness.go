// Package harness runs lesson commands against a real tool by driving one persistent REPL
// process per session and detecting step completion with echoed markers. It is a port of the
// Deno validator: same step splitting, marker protocol, timeouts and log lines.
package harness

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"skills-tools/tutor/internal/course"
)

// Step is one session's slice of a lesson's code.
type Step struct {
	Session string
	Blocks  bool
	Text    string
}

var sessionHeader = regexp.MustCompile(`(?i)^(?:--|#|//)\s*Session\s+([A-D])\b(.*)$`)
var blocksRE = regexp.MustCompile(`(?i)\(blocks`)

// SplitSteps splits lesson code at "-- Session X", "# Session X" or "// Session X" headers.
// Text before the first header belongs to session A. "(blocks" in a header marks a step that is
// sent without waiting for its marker.
func SplitSteps(code string) []Step {
	var steps []Step
	current := Step{Session: "A"}
	for _, line := range strings.Split(code, "\n") {
		if m := sessionHeader.FindStringSubmatch(line); m != nil {
			if strings.TrimSpace(current.Text) != "" {
				steps = append(steps, current)
			}
			current = Step{Session: strings.ToUpper(m[1]), Blocks: blocksRE.MatchString(m[2])}
			continue
		}
		current.Text += line + "\n"
	}
	if strings.TrimSpace(current.Text) != "" {
		steps = append(steps, current)
	}
	return steps
}

// Options configure Validate.
type Options struct {
	Repl    course.Repl
	Env     map[string]string // overrides Repl.Env, which overrides the process environment
	Dir     string            // working directory for spawned sessions ("" = inherit)
	Timeout time.Duration     // per step; default 30 s
	Log     func(line string)
	From    int      // default 1
	To      int      // default 999999
	Select  []string // slugs or ordinals; empty selects every lesson in range
	// ShellFallback, when set, runs runIn:shell lessons of a tool-mode course in this shell-mode
	// REPL instead of skipping them (isolated validation).
	ShellFallback *course.Repl
	// PerLesson, when set, supplies extra environment and a working directory for one lesson and
	// a cleanup function run after it (isolated labs).
	PerLesson func(l course.Lesson) (env map[string]string, dir string, cleanup func(), err error)
}

// Result counts selected lessons and failures.
type Result struct {
	Selected int
	Failures int
}

// StepResult reports whether a step's marker arrived and, in shell mode, its exit status.
type StepResult struct {
	Completed bool
	Status    *int
}

type waiter struct {
	marker string
	done   chan *int
}

type pending struct {
	step int
	done chan *int
}

// Session is one persistent REPL process.
type Session struct {
	Name       string
	HadFailure bool

	repl    course.Repl
	mode    string
	timeout time.Duration
	log     func(string)
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	exited  chan struct{}
	mu      sync.Mutex
	buffer  strings.Builder
	waiters []*waiter
	pending []pending
	wg      sync.WaitGroup
}

var markerToken = regexp.MustCompile(`__STEP_\d+_DONE__(?:\s+status=-?\d+)?`)

func mergeEnv(base []string, layers ...map[string]string) []string {
	merged := map[string]string{}
	var order []string
	set := func(k, v string) {
		if _, ok := merged[k]; !ok {
			order = append(order, k)
		}
		merged[k] = v
	}
	for _, kv := range base {
		k, v, _ := strings.Cut(kv, "=")
		set(k, v)
	}
	for _, layer := range layers {
		for k, v := range layer {
			set(k, v)
		}
	}
	out := make([]string, 0, len(order))
	for _, k := range order {
		out = append(out, k+"="+merged[k])
	}
	return out
}

// NewSession starts the REPL process and begins pumping its output.
func NewSession(name string, repl course.Repl, env []string, dir string, log func(string), timeout time.Duration) (*Session, error) {
	if len(repl.Command) == 0 {
		return nil, fmt.Errorf("repl command is empty")
	}
	s := &Session{Name: name, repl: repl, mode: repl.Mode, timeout: timeout, log: log, exited: make(chan struct{})}
	if s.mode == "" {
		s.mode = "tool"
	}
	cmd := exec.Command(repl.Command[0], repl.Command[1:]...)
	cmd.Env = env
	cmd.Dir = dir
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start %s: %w", repl.Command[0], err)
	}
	s.cmd, s.stdin = cmd, stdin
	s.wg.Add(2)
	go s.pump(stdout)
	go s.pump(stderr)
	go func() {
		s.wg.Wait()
		cmd.Wait()
		close(s.exited)
	}()
	return s, nil
}

func (s *Session) pump(r io.Reader) {
	defer s.wg.Done()
	reader := bufio.NewReader(r)
	buf := make([]byte, 4096)
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			s.consume(string(buf[:n]))
		}
		if err != nil {
			return
		}
	}
}

func markerStatus(buffer, marker string) *int {
	re := regexp.MustCompile(regexp.QuoteMeta(marker) + `(?:\s+status=(-?\d+))?`)
	m := re.FindStringSubmatch(buffer)
	if m == nil || m[1] == "" {
		return nil
	}
	n, _ := strconv.Atoi(m[1])
	return &n
}

func (s *Session) consume(text string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.buffer.WriteString(text)
	// Remove only the marker token, not its whole line: a command such as `printf observed` may
	// not end with a newline before the marker is printed.
	visible := markerToken.ReplaceAllString(text, "")
	var lines []string
	for _, line := range strings.Split(visible, "\n") {
		if line != "" {
			lines = append(lines, fmt.Sprintf("  [%s] %s", s.Name, line))
		}
	}
	if len(lines) > 0 && s.log != nil {
		s.log(strings.Join(lines, "\n"))
	}
	buffer := s.buffer.String()
	remaining := s.waiters[:0]
	for _, w := range s.waiters {
		if !strings.Contains(buffer, w.marker) {
			remaining = append(remaining, w)
			continue
		}
		var status *int
		if s.mode == "shell" {
			status = markerStatus(buffer, w.marker)
			// A pipe chunk can split the marker line between the marker and its status. Shell
			// mode must wait for the complete status-aware marker.
			if status == nil {
				remaining = append(remaining, w)
				continue
			}
			if *status != 0 {
				s.HadFailure = true
			}
		}
		w.done <- status
	}
	s.waiters = remaining
}

// Send writes a step and its marker echo. With wait=false the step is recorded as pending and
// its marker is awaited at Close.
func (s *Session) Send(text string, wait bool, step int) StepResult {
	marker := fmt.Sprintf("__STEP_%d_DONE__", step)
	w := &waiter{marker: marker, done: make(chan *int, 1)}
	s.mu.Lock()
	s.waiters = append(s.waiters, w)
	s.mu.Unlock()
	var echo string
	if s.mode == "shell" {
		// Bash has no portable REPL echo command. Capture the status before any marker command
		// can overwrite it; tool REPLs continue using their configured echo.
		echo = fmt.Sprintf(`printf '__STEP_%d_DONE__ status=%%s\n' "$?"`, step)
	} else {
		echo = strings.ReplaceAll(s.repl.Echo, "{marker}", marker)
	}
	io.WriteString(s.stdin, text+"\n"+echo+"\n")
	if !wait {
		s.mu.Lock()
		s.pending = append(s.pending, pending{step: step, done: w.done})
		s.mu.Unlock()
		return StepResult{Completed: true}
	}
	select {
	case status := <-w.done:
		return StepResult{Completed: true, Status: status}
	case <-time.After(s.timeout):
		s.mu.Lock()
		for i, x := range s.waiters {
			if x == w {
				s.waiters = append(s.waiters[:i], s.waiters[i+1:]...)
				break
			}
		}
		s.mu.Unlock()
		return StepResult{Completed: false}
	}
}

// Close waits for pending (blocking) steps, sends the quit command and reaps the process.
func (s *Session) Close() {
	s.mu.Lock()
	pend := append([]pending(nil), s.pending...)
	s.mu.Unlock()
	if len(pend) > 0 {
		deadline := time.After(s.timeout)
		completed := true
	wait:
		for _, p := range pend {
			select {
			case <-p.done:
			case <-deadline:
				completed = false
				break wait
			}
		}
		if !completed {
			var steps []string
			for _, p := range pend {
				steps = append(steps, strconv.Itoa(p.step))
			}
			if s.log != nil {
				s.log(fmt.Sprintf("  !! blocking step(s) %s in session %s did not complete", strings.Join(steps, ", "), s.Name))
			}
			s.HadFailure = true
		}
	}
	io.WriteString(s.stdin, s.repl.Quit+"\n")
	s.stdin.Close()
	select {
	case <-s.exited:
	case <-time.After(2 * time.Second):
		s.cmd.Process.Kill()
		<-s.exited
	}
}

// Validate runs the selected lessons and returns counts. Log lines mirror the Deno validator.
func Validate(lessons []course.Lesson, opts Options) (Result, error) {
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	log := opts.Log
	if log == nil {
		log = func(line string) { fmt.Println(line) }
	}
	from, to := opts.From, opts.To
	if from == 0 {
		from = 1
	}
	if to == 0 {
		to = 999999
	}
	mode := opts.Repl.Mode
	if mode == "" {
		mode = "tool"
	}
	var selected []course.Lesson
	for _, l := range lessons {
		if l.Ordinal < from || l.Ordinal > to {
			continue
		}
		if len(opts.Select) > 0 {
			match := false
			for _, sel := range opts.Select {
				if sel == l.Slug || sel == strconv.Itoa(l.Ordinal) {
					match = true
				}
			}
			if !match {
				continue
			}
		}
		selected = append(selected, l)
	}
	result := Result{Selected: len(selected)}
	for _, lesson := range selected {
		log(fmt.Sprintf("\n=== #%d %s [%s, %d session(s)] ===", lesson.Ordinal, lesson.Slug, lesson.RunIn, lesson.Sessions))
		repl := opts.Repl
		if lesson.RunIn == "shell" && mode != "shell" {
			if opts.ShellFallback == nil {
				log("  (shell lesson: run manually; configured REPL is not shell mode)")
				continue
			}
			repl = *opts.ShellFallback
		}
		lessonEnv := map[string]string{}
		dir := opts.Dir
		if opts.PerLesson != nil {
			env, d, cleanup, err := opts.PerLesson(lesson)
			if err != nil {
				return result, err
			}
			lessonEnv = env
			if d != "" {
				dir = d
			}
			if cleanup != nil {
				defer cleanup()
			}
		}
		env := mergeEnv(os.Environ(), repl.Env, opts.Env, lessonEnv)
		sessions := map[string]*Session{}
		var order []string
		var startErr error
		get := func(name string) *Session {
			if s, ok := sessions[name]; ok {
				return s
			}
			s, err := NewSession(name, repl, env, dir, log, timeout)
			if err != nil {
				startErr = err
				return nil
			}
			sessions[name] = s
			order = append(order, name)
			return s
		}
		step := 0
		ok := true
		runStep := func(session, text string, blocks bool) bool {
			step++
			s := get(session)
			if s == nil {
				log(fmt.Sprintf("  !! step %d in session %s could not start: %v", step, session, startErr))
				return false
			}
			r := s.Send(text, !blocks, step)
			if !r.Completed {
				log(fmt.Sprintf("  !! step %d in session %s timed out after %d ms", step, session, timeout.Milliseconds()))
				return false
			}
			if r.Status != nil && *r.Status != 0 {
				log(fmt.Sprintf("  !! step %d in session %s exited with status %d", step, session, *r.Status))
				return false
			}
			return true
		}
		if lesson.Setup != "" {
			log("  -- setup --")
			ok = runStep("A", lesson.Setup, false)
		}
		for _, st := range SplitSteps(lesson.Code) {
			if !ok {
				break
			}
			suffix := ""
			if st.Blocks {
				suffix = " (blocks)"
			}
			log(fmt.Sprintf("  -- Session %s%s --", st.Session, suffix))
			ok = runStep(st.Session, st.Text, st.Blocks)
		}
		for _, name := range order {
			s := sessions[name]
			s.Close()
			if s.HadFailure {
				ok = false
			}
		}
		if !ok {
			result.Failures++
		}
	}
	return result, nil
}

// Summary is the closing line of a validation run.
func Summary(r Result) string {
	return fmt.Sprintf("\n%d/%d lessons completed without timeout", r.Selected-r.Failures, r.Selected)
}
