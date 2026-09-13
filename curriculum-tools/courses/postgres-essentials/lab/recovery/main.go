// recovery owns the short-lived servers for Essentials lessons 27–31.
// Learner commands run only after private endpoints have been created. No existing
// cluster path or connection is accepted as an argument.
package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"os/signal"
	"os/user"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type lab struct {
	ctx       context.Context
	root, bin string
	uid, gid  int
	env       []string
	logShown  map[string]int
}

func main() {
	lesson := flag.Int("lesson", 0, "lesson number, 27 through 31")
	query := flag.String("query", "SELECT count(*) FROM inventory", "lesson 27 inventory query")
	action := flag.String("action", ":", "lesson 28/30/31 native shell command in the owned fixture")
	target := flag.String("target", "after_bad", "lesson 29 named recovery target")
	flag.Parse()
	if err := run(*lesson, *query, *action, *target); err != nil {
		fmt.Fprintln(os.Stderr, "STOP:", err)
		os.Exit(1)
	}
}

func run(n int, query, action, target string) (err error) {
	if n < 27 || n > 31 || (target != "before_bad" && target != "after_bad") {
		return errors.New("use --lesson 27..31 and --target before_bad or after_bad")
	}
	var disk syscall.Statfs_t
	if err = syscall.Statfs("/tmp", &disk); err != nil {
		return err
	}
	if disk.Bavail*uint64(disk.Bsize) < 3<<30 {
		return errors.New("need 3 GiB free in /tmp before allocation")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	l := &lab{ctx: ctx, uid: os.Getuid(), gid: os.Getgid()}
	for _, e := range os.Environ() {
		key, _, _ := strings.Cut(e, "=")
		if !strings.HasPrefix(key, "PG") && key != "LC_ALL" && key != "BASH_ENV" && key != "ENV" {
			l.env = append(l.env, e)
		}
	}
	l.env = append(l.env, "LC_ALL=C", "PGCONNECT_TIMEOUT=3", "PGOPTIONS=-c statement_timeout=5000 -c lock_timeout=2000")
	if os.Geteuid() == 0 {
		u, e := user.Lookup("postgres")
		if e != nil {
			return e
		}
		l.uid, err = strconv.Atoi(u.Uid)
		if err != nil {
			return err
		}
		l.gid, err = strconv.Atoi(u.Gid)
		if err != nil {
			return err
		}
	}
	bin, err := l.command(false, "pg_config", "--bindir")
	if err != nil {
		return err
	}
	l.bin = strings.TrimSpace(bin)
	v, err := l.command(false, filepath.Join(l.bin, "postgres"), "--version")
	if err != nil {
		return err
	}
	if !strings.Contains(v, " 16.") {
		return fmt.Errorf("PostgreSQL 16 required: %s", v)
	}
	l.root, err = os.MkdirTemp("/tmp", "pe-recovery-")
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, l.cleanup()) }()
	if err = os.Chown(l.root, l.uid, l.gid); err != nil {
		return err
	}
	fmt.Printf("lesson=%d fixture=%s server=%s\n", n, l.root, strings.TrimSpace(v))
	for _, dir := range []string{"socket-primary", "socket-copy", "archive", "safe"} {
		if err = l.mkdir(dir); err != nil {
			return err
		}
	}
	if _, err = l.pg("initdb", "-D", l.path("primary"), "-U", "postgres", "--auth-local=trust", "--auth-host=reject", "--no-locale", "--wal-segsize=1"); err != nil {
		return err
	}
	if err = l.config("primary", false, true); err != nil {
		return err
	}
	if err = l.start("primary"); err != nil {
		return err
	}
	identity, err := l.sql("primary", "SELECT current_setting('data_directory')")
	if err != nil {
		return err
	}
	if identity != l.path("primary") {
		return fmt.Errorf("unexpected primary: %s", identity)
	}
	_, err = l.sql("primary", `CREATE TABLE inventory(id integer PRIMARY KEY, item text NOT NULL, quantity integer NOT NULL);
INSERT INTO inventory VALUES (1,'bolts',10),(2,'nuts',20),(3,'washers',30);
CREATE TABLE operations(id integer PRIMARY KEY, effect text NOT NULL);
INSERT INTO operations VALUES(1,'baseline');`)
	if err != nil {
		return err
	}
	switch n {
	case 27:
		return l.restore(query)
	case 28:
		return l.history(action)
	case 29:
		return l.targeted(target)
	case 30:
		return l.standby(action)
	case 31:
		return l.replay(action)
	}
	return nil
}

func (l *lab) path(s string) string { return filepath.Join(l.root, s) }
func (l *lab) mkdir(s string) error {
	if err := os.MkdirAll(l.path(s), 0700); err != nil {
		return err
	}
	return os.Chown(l.path(s), l.uid, l.gid)
}
func (l *lab) write(s, value string) error {
	if err := os.WriteFile(l.path(s), []byte(value), 0600); err != nil {
		return err
	}
	return os.Chown(l.path(s), l.uid, l.gid)
}
func (l *lab) command(owner bool, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(l.ctx, 25*time.Second)
	defer cancel()
	c := exec.CommandContext(ctx, name, args...)
	c.Env = l.env
	c.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if owner && os.Geteuid() == 0 {
		c.SysProcAttr.Credential = &syscall.Credential{Uid: uint32(l.uid), Gid: uint32(l.gid)}
	}
	// Kill an action shell's children too, so cancellation cannot leave a sleeping
	// child holding output pipes open while teardown waits.
	c.Cancel = func() error { return syscall.Kill(-c.Process.Pid, syscall.SIGKILL) }
	c.WaitDelay = 2 * time.Second
	// Do not inherit subprocess pipes in daemonized postmasters. All server starts
	// use pg_ctl -l, so stdout/stderr close when the launcher exits.
	out, err := c.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("%s: %w: %s", filepath.Base(name), err, strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}
func (l *lab) pg(name string, args ...string) (string, error) {
	return l.command(true, filepath.Join(l.bin, name), args...)
}
func (l *lab) conn(which string) string {
	sock := "socket-primary"
	if which != "primary" {
		sock = "socket-copy"
	}
	return "host=" + l.path(sock) + " port=6547 user=postgres dbname=postgres"
}
func (l *lab) sql(which, sql string) (string, error) {
	return l.pg("psql", "-X", "-Atq", "-v", "ON_ERROR_STOP=1", "-d", l.conn(which), "-c", sql)
}
func (l *lab) config(which string, standby, archive bool) error {
	sock := "socket-primary"
	if which != "primary" {
		sock = "socket-copy"
	}
	cfg := "listen_addresses=''\nport=6547\nunix_socket_directories='" + l.path(sock) + "'\n" +
		"shared_buffers='16MB'\nmax_connections=10\nwal_level=replica\nmax_wal_senders=4\n" +
		"wal_keep_size='16MB'\nmax_replication_slots=4\nmax_wal_size='64MB'\nmin_wal_size='2MB'\n" +
		"checkpoint_timeout='1h'\nautovacuum=off\nlogging_collector=off\nlog_min_messages=log\n" +
		"fsync=on\nfull_page_writes=on\nsynchronous_commit=on\nhot_standby=on\n"
	if archive {
		cfg += "archive_mode=on\narchive_command='test ! -f " + l.path("archive") + "/%f && cp %p " + l.path("archive") + "/%f'\n"
	} else {
		cfg += "archive_mode=off\n"
	}
	if err := l.write(which+"/postgresql.conf", cfg); err != nil {
		return err
	}
	if !standby {
		return l.write(which+"/postgresql.auto.conf", "")
	}
	return nil // preserve pg_basebackup -R's primary_conninfo
}
func (l *lab) start(which string) error {
	out, err := l.pg("pg_ctl", "-D", l.path(which), "-l", l.path(which+".log"), "-w", "-t", "15", "start")
	if err != nil {
		fmt.Println(out)
		l.log(which)
	}
	return err
}
func (l *lab) log(which string) string {
	b, _ := os.ReadFile(l.path(which + ".log"))
	if l.logShown == nil {
		l.logShown = make(map[string]int)
	}
	start := l.logShown[which]
	if start > len(b) {
		start = 0
	}
	for _, line := range strings.Split(string(b[start:]), "\n") {
		if strings.Contains(line, "LOG:  redo") || strings.Contains(line, "LOG:  recovery") || strings.Contains(line, "LOG:  pausing") || strings.Contains(line, "FATAL:") || strings.Contains(line, "PANIC:") || strings.Contains(line, "cp: cannot stat") {
			fmt.Println("server_log:", line)
		}
	}
	l.logShown[which] = len(b)
	return string(b)
}
func (l *lab) backup(wal string) error {
	_, err := l.pg("pg_basebackup", "-d", l.conn("primary"), "-D", l.path("backup"), "-X", wal, "--checkpoint=fast")
	return err
}
func (l *lab) cloneBackup() error {
	_, err := l.command(true, "cp", "-a", l.path("backup"), l.path("copy"))
	return err
}
func (l *lab) poll(label string, f func() bool) error {
	end := time.Now().Add(8 * time.Second)
	for time.Now().Before(end) {
		if l.ctx.Err() != nil {
			return l.ctx.Err()
		}
		if f() {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("deadline waiting for %s", label)
}
func (l *lab) checkSQL(which, query, want string) error {
	got, err := l.sql(which, query)
	if err != nil {
		return err
	}
	fmt.Printf("%s evidence=%s\n", which, got)
	if got != want {
		return fmt.Errorf("expected %q, got %q", want, got)
	}
	return nil
}
func (l *lab) action(action string, extra ...string) error {
	old := l.env
	l.env = append(append([]string{}, l.env...), "PRIMARY="+l.conn("primary"), "REPLICA="+l.conn("copy"), "DEST="+l.path("copy"), "ARCHIVE="+l.path("archive-copy"), "SAFE="+l.path("safe"), "PATH="+l.bin+":/usr/bin:/bin")
	l.env = append(l.env, extra...)
	defer func() { l.env = old }()
	out, err := l.command(true, "bash", "--noprofile", "--norc", "-euc", action)
	fmt.Printf("learner_action_output:\n%s\n", out)
	return err
}

func (l *lab) restore(query string) error {
	// Read-only transactions constrain accidental mutations in the inventory task.
	q := "BEGIN READ ONLY; " + query + "; COMMIT;"
	baseline, err := l.sql("primary", q)
	if err != nil {
		return err
	}
	if err = l.backup("stream"); err != nil {
		return err
	}
	if _, err = l.pg("pg_verifybackup", l.path("backup")); err != nil {
		return err
	}
	fmt.Println("backup_manifest_verified=true")
	if _, err = l.sql("primary", "UPDATE inventory SET quantity=99 WHERE id=2"); err != nil {
		return err
	}
	if err = l.cloneBackup(); err != nil {
		return err
	}
	if err = l.config("copy", false, false); err != nil {
		return err
	}
	if err = l.start("copy"); err != nil {
		return err
	}
	restored, err := l.sql("copy", q)
	if err != nil {
		return err
	}
	later, err := l.sql("primary", q)
	if err != nil {
		return err
	}
	fmt.Printf("baseline_inventory:\n%s\nrestored_inventory:\n%s\nlater_source_inventory:\n%s\n", baseline, restored, later)
	if err = l.checkSQL("copy", "SELECT id,item,quantity FROM inventory ORDER BY id", "1|bolts|10\n2|nuts|20\n3|washers|30"); err != nil {
		return err
	}
	fmt.Printf("baseline_matches_restore=%t distinguishes_later_source=%t\n", baseline == restored, baseline != later)
	if baseline != restored || baseline == later {
		return errors.New("inventory query did not distinguish the changed quantity; include every business column in stable order")
	}
	return nil
}

func (l *lab) archiveWork() error {
	if err := l.backup("none"); err != nil {
		return err
	}
	// Each call completes its own transaction. A multi-statement psql -c string
	// would place both restore points before the shared implicit COMMIT.
	for _, statement := range []string{
		"INSERT INTO operations VALUES(2,'accepted order')",
		"SELECT pg_create_restore_point('before_bad')",
		"INSERT INTO operations VALUES(3,'bad import')",
		"SELECT pg_create_restore_point('after_bad')",
	} {
		if _, err := l.sql("primary", statement); err != nil {
			return err
		}
	}
	segment, err := l.sql("primary", "SELECT pg_walfile_name(pg_current_wal_insert_lsn())")
	if err != nil {
		return err
	}
	if _, err = l.sql("primary", "SELECT pg_switch_wal()"); err != nil {
		return err
	}
	if err = l.poll("completed archive segment", func() bool { _, e := os.Stat(l.path("archive/" + segment)); return e == nil }); err != nil {
		return err
	}
	_, err = l.command(true, "cp", "-a", l.path("archive"), l.path("archive-copy"))
	return err
}
func (l *lab) recoveryConfig(target string) error {
	if err := l.config("copy", false, false); err != nil {
		return err
	}
	if err := l.write("copy/recovery.signal", ""); err != nil {
		return err
	}
	return l.write("copy/postgresql.auto.conf", "restore_command='cp "+l.path("archive-copy")+"/%f %p'\nrecovery_target_name='"+target+"'\nrecovery_target_action='pause'\n")
}
func (l *lab) paused() error {
	return l.poll("recovery target pause", func() bool {
		out, err := l.sql("copy", "SELECT pg_get_wal_replay_pause_state()")
		return err == nil && out == "paused"
	})
}
func (l *lab) history(action string) error {
	if err := l.archiveWork(); err != nil {
		return err
	}
	label, err := os.ReadFile(l.path("backup/backup_label"))
	if err != nil {
		return err
	}
	m := regexp.MustCompile(`START WAL LOCATION: .*\(file ([A-F0-9]{24})\)`).FindSubmatch(label)
	if len(m) != 2 {
		return errors.New("cannot identify required start WAL file from backup_label")
	}
	missing := string(m[1])
	original, err := os.ReadFile(l.path("archive/" + missing))
	if err != nil {
		return err
	}
	if _, err = l.command(true, "cp", l.path("archive-copy/"+missing), l.path("safe/"+missing)); err != nil {
		return err
	}
	if err = os.Remove(l.path("archive-copy/" + missing)); err != nil {
		return err
	}
	if err = l.cloneBackup(); err != nil {
		return err
	}
	if err = l.recoveryConfig("before_bad"); err != nil {
		return err
	}
	fmt.Printf("required_start_segment=%s missing_only_from=archive-copy\n", missing)
	if err = l.start("copy"); err == nil {
		return errors.New("missing required checkpoint WAL unexpectedly started")
	}
	log := l.log("copy")
	if !strings.Contains(log, missing) || !strings.Contains(log, "could not locate required checkpoint record") {
		return errors.New("startup failed for an unrecognized reason")
	}
	fmt.Println("missing_history_failure_verified=true")
	if err = l.action(action, "MISSING="+missing); err != nil {
		return err
	}
	repaired, err := os.ReadFile(l.path("archive-copy/" + missing))
	if err != nil {
		return errors.New("required archive segment is still missing; restore the withheld file")
	}
	if sha256.Sum256(repaired) != sha256.Sum256(original) {
		return errors.New("repaired segment differs from preserved archive")
	}
	if err = l.start("copy"); err != nil {
		return err
	}
	if err = l.paused(); err != nil {
		return err
	}
	if err = l.checkSQL("copy", "SELECT id,effect FROM operations ORDER BY id", "1|baseline\n2|accepted order"); err != nil {
		return err
	}
	unchanged, err := os.ReadFile(l.path("archive/" + missing))
	if err != nil {
		return err
	}
	if sha256.Sum256(unchanged) != sha256.Sum256(original) {
		return errors.New("original archive changed")
	}
	fmt.Println("repaired_recovery=true original_archive_unchanged=true")
	l.log("copy")
	return nil
}
func (l *lab) targeted(target string) error {
	if err := l.archiveWork(); err != nil {
		return err
	}
	if err := l.cloneBackup(); err != nil {
		return err
	}
	if err := l.recoveryConfig(target); err != nil {
		return err
	}
	if err := l.start("copy"); err != nil {
		return err
	}
	if err := l.paused(); err != nil {
		return err
	}
	if err := l.checkSQL("primary", "SELECT id,effect FROM operations ORDER BY id", "1|baseline\n2|accepted order\n3|bad import"); err != nil {
		return err
	}
	log := l.log("copy")
	if !strings.Contains(log, "recovery stopping at restore point \""+target+"\"") {
		return errors.New("missing chosen target in recovery log")
	}
	got, err := l.sql("copy", "SELECT id,effect FROM operations ORDER BY id")
	if err != nil {
		return err
	}
	fmt.Printf("target=%s recovered_history:\n%s\n", target, got)
	if got != "1|baseline\n2|accepted order" {
		return errors.New("chosen point includes bad import; choose the point after useful work and before bad work")
	}
	fmt.Println("accepted_order_preserved=true bad_import_excluded=true recovery_paused=true")
	return nil
}
func (l *lab) startStandby() error {
	if _, err := os.Stat(l.path("copy/standby.signal")); err != nil {
		return errors.New("standby.signal absent; base backup alone has not configured a standby")
	}
	if err := l.config("copy", true, false); err != nil {
		return err
	}
	if err := l.start("copy"); err != nil {
		return err
	}
	if err := l.checkSQL("copy", "SELECT pg_is_in_recovery()", "t"); err != nil {
		return err
	}
	return l.poll("streaming receiver", func() bool {
		v, e := l.sql("copy", "SELECT status FROM pg_stat_wal_receiver")
		return e == nil && v == "streaming"
	})
}
func (l *lab) standby(action string) error {
	if err := l.action(action); err != nil {
		return err
	}
	if err := l.startStandby(); err != nil {
		return err
	}
	if _, err := l.sql("primary", "INSERT INTO operations VALUES(2,'after backup')"); err != nil {
		return err
	}
	if err := l.poll("post-backup marker on standby", func() bool {
		v, e := l.sql("copy", "SELECT effect FROM operations WHERE id=2")
		return e == nil && v == "after backup"
	}); err != nil {
		return err
	}
	fmt.Println("standby_signal=true in_recovery=true receiver=streaming post_backup_marker_visible=true")
	return l.checkSQL("copy", "SELECT id,effect FROM operations ORDER BY id", "1|baseline\n2|after backup")
}
func (l *lab) replay(action string) error {
	_, err := l.pg("pg_basebackup", "-d", l.conn("primary"), "-D", l.path("copy"), "-X", "stream", "-R", "--checkpoint=fast")
	if err != nil {
		return err
	}
	if err = l.startStandby(); err != nil {
		return err
	}
	if _, err = l.sql("copy", "SELECT pg_wal_replay_pause()"); err != nil {
		return err
	}
	if err = l.paused(); err != nil {
		return err
	}
	if _, err = l.sql("primary", "INSERT INTO operations VALUES(2,'while replay paused')"); err != nil {
		return err
	}
	marker, err := l.sql("primary", "SELECT pg_current_wal_flush_lsn()")
	if err != nil {
		return err
	}
	if err = l.poll("received WAL through marker", func() bool {
		v, e := l.sql("copy", "SELECT pg_last_wal_receive_lsn() >= '"+marker+"'::pg_lsn")
		return e == nil && v == "t"
	}); err != nil {
		return err
	}
	evidence := "SELECT pg_get_wal_replay_pause_state(), pg_last_wal_receive_lsn() >= '" + marker + "'::pg_lsn, pg_last_wal_replay_lsn() >= '" + marker + "'::pg_lsn, (SELECT count(*) FROM operations WHERE id=2)"
	fmt.Println("post_commit_marker=" + marker + " columns=pause_state,received_through_marker,replayed_through_marker,visible_marker_rows")
	if err = l.checkSQL("copy", evidence, "paused|t|f|0"); err != nil {
		return err
	}
	positions, err := l.sql("copy", "SELECT pg_last_wal_receive_lsn(),pg_last_wal_replay_lsn(),(SELECT status FROM pg_stat_wal_receiver)")
	if err != nil {
		return err
	}
	fmt.Println("receive_lsn|replay_lsn|receiver_status=" + positions)
	if err = l.action(action); err != nil {
		return err
	}
	if err = l.poll("replay and visible marker", func() bool { v, e := l.sql("copy", evidence); return e == nil && v == "not paused|t|t|1" }); err != nil {
		return err
	}
	return l.checkSQL("copy", evidence, "not paused|t|t|1")
}

func (l *lab) cleanup() error {
	// Cleanup must still run after a cancelled experiment. A failed stop retains
	// the owned tree and identifies it; never delete files beneath a live server.
	l.ctx = context.Background()
	var failures []error
	for _, which := range []string{"copy", "primary"} {
		if _, err := os.Stat(l.path(which + "/postmaster.pid")); err == nil {
			if _, err = l.pg("pg_ctl", "-D", l.path(which), "-m", "fast", "-w", "-t", "15", "stop"); err != nil {
				failures = append(failures, err)
			}
		}
		if _, err := os.Stat(l.path(which + "/PG_VERSION")); err == nil {
			_, status := l.pg("pg_ctl", "-D", l.path(which), "status")
			var exit *exec.ExitError
			if !errors.As(status, &exit) || (exit.ExitCode() != 3 && exit.ExitCode() != 4) {
				failures = append(failures, fmt.Errorf("cannot verify %s stopped: %v", which, status))
			}
		}
	}
	if len(failures) != 0 {
		return fmt.Errorf("cleanup failed; retained %s: %w", l.root, errors.Join(failures...))
	}
	var bytes int64
	if err := filepath.WalkDir(l.root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.Type().IsRegular() {
			i, e := d.Info()
			if e != nil {
				return e
			}
			bytes += i.Size()
		}
		return nil
	}); err != nil {
		return err
	}
	if err := os.RemoveAll(l.root); err != nil {
		return err
	}
	fmt.Printf("cleanup=owned_tree_removed removed=true bytes=%d fixture=%s\n", bytes, l.root)
	if bytes > 500_000_000 {
		return fmt.Errorf("fixture exceeded 500 MB budget: %d", bytes)
	}
	return nil
}
