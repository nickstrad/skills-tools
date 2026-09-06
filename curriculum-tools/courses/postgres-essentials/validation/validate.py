"""Run the selected exact built experiments in an owned PostgreSQL cluster; always retire it."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import tempfile
import sys

course = Path(__file__).resolve().parents[1]
engine = course.parents[1]
evidence = course / "validation"
reference_progress = engine / "courses/postgres/progress.sqlite"
essentials_progress = course / 'progress.sqlite'
protected = [reference_progress, essentials_progress]
before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
catalog = json.loads((course / 'lessons.json').read_text())
available = [str(l['ordinal']) for l in catalog]
selectors = sys.argv[1:]
assert all(x in available for x in selectors), 'Use only available lesson numbers'
selected = selectors or available
logname = 'lessons-' + '-'.join(selected)
assert shutil.disk_usage('/tmp').free > 2 * 1024**3, 'Less than 2 GB free'
bindir = Path(subprocess.check_output(['pg_config', '--bindir'], text=True).strip())
owner = pwd.getpwnam('postgres') if os.geteuid() == 0 else pwd.getpwuid(os.geteuid())
prefix = ['runuser', '-u', owner.pw_name, '--'] if os.geteuid() == 0 else []
root = Path(tempfile.mkdtemp(prefix='pg-essentials-validation-', dir='/tmp'))
data, sock = root / 'data', root / 'socket'
sock.mkdir()
if os.geteuid() == 0:
    for p in [root, sock]:
        os.chown(p, owner.pw_uid, owner.pw_gid)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST=str(sock), PGPORT='6543', PGUSER='postgres', PGDATABASE='postgres',
           PGCONNECT_TIMEOUT='3', LC_ALL='C')


def run(args, timeout=60):
    result = subprocess.run(list(map(str, args)), env=env, text=True,
                            capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout + result.stderr


def server(name, *args):
    return run(prefix + [bindir / name, *args])


try:
    # Read-only learner identity check; never use that directory in pg_ctl.
    learner = run([bindir / 'psql', '-X', '-h', '/tmp', '-p', '5440', '-U', 'postgres',
                   '-d', 'lab', '-Atqc', "select current_setting('data_directory')"])
    assert learner.strip() == '/labs/pglab/primary', learner
    print('Learner protected:', learner.strip(), flush=True)
    print('Owned validation root:', root, flush=True)
    server('initdb', '-D', data, '-U', 'postgres', '--auth-local=trust',
           '--auth-host=reject', '--no-locale', '--wal-segsize=1')
    with (data / 'postgresql.conf').open('a') as out:
        out.write("\nlisten_addresses=''\nport=6543\nunix_socket_directories='" + str(sock) +
                  "'\nshared_buffers='16MB'\nmax_connections=10\nmin_wal_size='2MB'\n"
                  "max_wal_size='16MB'\nlogging_collector=off\n")
    server('pg_ctl', '-D', data, '-l', root / 'server.log', '-w', 'start')
    actual = run([bindir / 'psql', '-X', '-Atqc', "select current_setting('data_directory')"])
    assert actual.strip() == str(data), actual
    result = subprocess.run(['/root/.deno/bin/deno', 'run', '-A', str(evidence / 'run.ts'),
                             *selectors], cwd=engine, env=env, text=True,
                            capture_output=True, timeout=90)
    output = result.stdout + result.stderr
    (evidence / (logname + '.log')).write_text(output)
    assert result.returncode == 0, output
    assert 'ERROR:' not in output and 'FATAL:' not in output, output
    expected = {
        '1': {'a_private': 120, 'b_before_commit': 100, 'b_after_commit': 120,
              'a_aborted': 999, 'b_after_rollback': 120},
        '2': {'rc_before': 100, 'rc_after': 120, 'rr_before': 100, 'rr_after': 100,
              'fresh_after_end': 120},
        '3': {'reader_before': 1000, 'fresh_rows': 0, 'reader_after_delete': 1000,
              'retained_dead': 1000, 'released_dead': 0, 'final_rows': 0},
    }
    measured = {}
    for n in selected:
        for label, value in expected[n].items():
            match = re.search(re.escape(label) + r'[^\n]*\n\s*\[[AB]\][-\s+]+\n\s*\[[AB]\]\s*(\d+)', output)
            assert match and int(match[1]) == value, (label, value, output)
            measured[label] = int(match[1])
    if '3' in selected:
        assert re.search(r'idle in transaction\s*\|\s*\d+', output), 'Snapshot horizon missing'
        retained = re.search(r'retained_dead[^\n]*\n[^\n]*\n[^\n]*\|\s*([\d.]+)', output)
        released = re.search(r'released_dead[^\n]*\n[^\n]*\n[^\n]*\|\s*([\d.]+)', output)
        assert retained and released and float(released[1]) > float(retained[1])
        measured.update(retained_free=float(retained[1]), released_free=float(released[1]))
    waits = [json.loads(line.removeprefix('WAIT_EVIDENCE ')) for line in output.splitlines()
             if line.startswith('WAIT_EVIDENCE ')]
    for n in ('5', '6'):
        if n in selected:
            assert any(w['lesson'] == int(n) for w in waits), 'Missing actual wait for ' + n
    if waits:
        measured['waits'] = waits
    (evidence / (logname + '-source.json')).write_text(json.dumps({
        'catalog_sha256': hashlib.sha256((course / 'lessons.json').read_bytes()).hexdigest(),
        'lessons': {l['slug']: hashlib.sha256(json.dumps(l, sort_keys=True).encode()).hexdigest()
                    for l in catalog if str(l['ordinal']) in selected},
    }, indent=2) + '\n')
    (evidence / (logname + '-outcomes.json')).write_text(json.dumps(measured, indent=2) + '\n')
    leftovers = run([bindir / 'psql', '-X', '-Atqc',
                     "select count(*) from pg_class where relname in "
                     "('pe_visibility','pe_snapshot','pe_history')"])
    assert leftovers.strip() == '0', leftovers
    print(output[-2500:], flush=True)
finally:
    if (data / 'postmaster.pid').exists():
        server('pg_ctl', '-D', data, '-m', 'fast', '-w', 'stop')
    # Only delete the unique directory allocated by this invocation, after normal shutdown.
    assert not (data / 'postmaster.pid').exists()
    shutil.rmtree(root)
    after = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
    assert after == before, 'Learner progress changed'
    (evidence / (logname + '-cleanup.json')).write_text(json.dumps({
        'owned_root': str(root), 'removed': not root.exists(),
        'progress_sha256': after, 'free_bytes': shutil.disk_usage('/tmp').free,
    }, indent=2) + '\n')
    print('Owned cluster removed; both progress databases unchanged.', flush=True)
