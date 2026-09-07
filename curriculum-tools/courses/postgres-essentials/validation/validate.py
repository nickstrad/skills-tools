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
import sqlite3

sys.dont_write_bytecode = True

course = Path(__file__).resolve().parents[1]
engine = course.parents[1]
evidence = course / "validation"
reference_progress = engine / "courses/postgres/progress.sqlite"
essentials_progress = course / 'progress.sqlite'
protected = [reference_progress, essentials_progress]
before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}


def history(path):
    with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as db:
        return {table: db.execute(f'SELECT * FROM {table} ORDER BY 1').fetchall()
                for table in ('progress', 'attempts')}


history_before = {str(p): history(p) for p in protected}
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
    sections = {m[1]: m[2] for m in re.finditer(
        r'=== #(\d+) [^\n]+ ===\n(.*?)(?=\n=== #|\Z)', output, re.S)}
    error_inventory = {}
    for n in selected:
        errors = re.findall(r'\[([AB])\]\s+(ERROR:.*)', sections[n])
        wanted = [('B', 'ERROR:  40001')] if n == '9' else []
        assert [(s, ' '.join(e.split())) for s, e in errors] == [
            (s, ' '.join(e.split())) for s, e in wanted], (n, errors)
        assert not re.search(r'FATAL:|PANIC:|invalid command|unrecognized value|Traceback', sections[n])
        error_inventory[n] = errors
    expected = {
        '1': {'a_private': 120, 'b_before_commit': 100, 'b_after_commit': 120,
              'a_aborted': 999, 'b_after_rollback': 120},
        '2': {'rc_before': 100, 'rc_after': 120, 'rr_before': 100, 'rr_after': 100,
              'fresh_after_end': 120},
        '3': {'reader_before': 1000, 'fresh_rows': 0, 'reader_after_delete': 1000,
              'retained_dead': 1000, 'released_dead': 0, 'final_rows': 0},
        '4': {},
        '5': {'a_replacement_written': 110, 'b_replacement_written': 120,
              'after_stale_replacement': 120, 'a_atomic_written': 110,
              'b_atomic_written': 130, 'after_atomic_arithmetic': 130},
        '6': {'a_stale_read': 1, 'b_stale_read': 1, 'stale_remaining': -1,
              'stale_accepted': 2, 'a_locked_read': 1, 'b_locked_read': 0,
              'locked_remaining': 0, 'locked_accepted': 1,
              'a_stale_decision': 'accept', 'b_stale_decision': 'accept',
              'a_locked_decision': 'accept', 'b_locked_decision': 'decline',
              'b_locked_action': 'no write: stock is exhausted'},
        '7': {'a_original_body': 'Draft', 'a_original_version': 1,
              'b_original_body': 'Draft', 'b_original_version': 1,
              'b_current_body': 'A: corrected title', 'b_current_version': 2,
              'final_body': 'A: corrected title + B: reviewed note', 'final_version': 3},
        '8': {'rr_final_on_call': 0},
        '9': {'serializable_final_on_call': 1},
        '10': {},
        '11': {},
    }
    # Read the labelled table column, including second columns and signed numbers.
    lines = [re.sub(r'^\s*\[[AB]\] ?', '', line).strip() for line in output.splitlines()]

    def cell(label):
        for i, line in enumerate(lines[:-2]):
            columns = [c.strip() for c in line.split('|')]
            if label in columns and re.fullmatch(r'[-+ ]+', lines[i + 1]):
                return lines[i + 2].split('|')[columns.index(label)].strip()
        raise AssertionError('Missing output column: ' + label)

    measured = {}
    for n in selected:
        for label, value in expected[n].items():
            actual = cell(label)
            assert actual == str(value), (label, value, actual)
            measured[label] = int(actual) if isinstance(value, int) else actual
    if '4' in selected:
        phases = {}
        for phase in ('loaded', 'deleted', 'vacuumed', 'refilled'):
            row = next((line for line in lines if re.match(phase + r'\s*\|', line)), None)
            assert row, 'Missing phase ' + phase
            phases[phase] = dict(zip(('visible_rows', 'heap_bytes', 'dead_tuple_count', 'free_space'),
                                     map(int, row.split('|')[1:])))
        assert [p['visible_rows'] for p in phases.values()] == [4000, 0, 0, 4000], phases
        assert [p['dead_tuple_count'] for p in phases.values()] == [0, 4000, 0, 0], phases
        assert len({p['heap_bytes'] for p in phases.values()}) == 1, phases
        assert phases['vacuumed']['free_space'] > phases['deleted']['free_space'], phases
        assert phases['refilled']['free_space'] < phases['vacuumed']['free_space'], phases
        assert abs(phases['refilled']['free_space'] - phases['loaded']['free_space']) < 8192, phases
        measured['reuse_phases'] = phases
    if '5' in selected:
        assert 'A read 100 and computed replacement 110' in output
        assert 'B read 100 and computed replacement 120' in output
    if '7' in selected:
        for label in ('a_save_rows=1', 'b_stale_save_rows=0', 'b_merged_save_rows=1'):
            assert label in sections['7'], label
    for n in ('8', '9'):
        if n in selected:
            for label in ('A read 2 doctors; can Alice leave? t',
                          'B read 2 doctors; can Bob leave? t',
                          'A UPDATE ROW_COUNT 1', 'B UPDATE ROW_COUNT 1',
                          'A COMMIT SQLSTATE 00000',
                          'B COMMIT SQLSTATE ' + ('40001' if n == '9' else '00000')):
                assert label in sections[n], (n, label)
            assert re.search(r'Alice\s*\|\s*f', sections[n])
            assert re.search(r'Bob\s*\|\s*' + ('t' if n == '9' else 'f'), sections[n])
    if '10' in selected:
        events = [json.loads(line) for line in lines if line.startswith('{')]
        decisions = [(e['attempt'], e['read'], e['decision']) for e in events if e.get('actor') == 'B' and 'read' in e]
        commits = [(e['attempt'], e['phase'], e['sqlstate'], e['committed']) for e in events if e.get('actor') == 'B' and 'sqlstate' in e]
        assert decisions == [(1, 2, 'leave'), (2, 1, 'stay')], decisions
        assert commits == [(1, 'commit', '40001', False), (2, 'commit', '00000', True)], commits
        final = next(e for e in events if 'final_rows' in e)
        assert final == {'final_rows': ['Alice|f', 'Bob|t'], 'on_call': 1, 'completed': True}, final
        assert any(e.get('cleanup') == 'schema removed' for e in events)
        measured['retry'] = events
    if '11' in selected:
        from check_unknown import check_unknown, check_unknown_events
        event_lines = [re.sub(r'^\s*\[A\] ?', '', line).strip() for line in sections['11'].splitlines()]
        events = [json.loads(line) for line in event_lines if line.startswith('{')]
        measured['unknown_outcome'] = check_unknown_events(events, 'after-commit')
        measured['unknown_variations'] = check_unknown(course, env, next(l for l in catalog if l['ordinal'] == 11))
    measured['expected_errors'] = error_inventory
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
    variation_numbers = [n for n in selected if n in ('7', '8', '9')]
    if variation_numbers:
        variation_output = run(['/root/.deno/bin/deno', 'run', '-A', evidence / 'run.ts',
                                '--variations', *variation_numbers])
        (evidence / (logname + '-variations.log')).write_text(variation_output)
        assert not re.search(r'ERROR:|FATAL:|invalid command|unrecognized value', variation_output), variation_output
        checks = {}
        if '7' in variation_numbers:
            assert 'variation_stale_rows=0' in variation_output, variation_output
            assert re.search(r'A: corrected title \+ B: reviewed note\s*\|\s*3', variation_output)
            checks['7'] = {'stale_rows': 0, 'preserved_version': 3}
        for n, label in (('8', 'rr_serial_final_on_call'), ('9', 'serializable_serial_final_on_call')):
            if n in variation_numbers:
                assert re.search(re.escape(label) + r'\s*\n[^\n]*\n[^\n]*\b1\b', variation_output), variation_output
                assert 'B read 1 doctors; can Bob leave? f' in variation_output, variation_output
                checks[n] = {'second_read': 1, 'second_can_leave': False, 'final_on_call': 1}
        measured['variations'] = checks
    if '10' in selected:
        from check_retry import check_retry
        measured['retry_variations'] = check_retry(course, env, next(l for l in catalog if l['ordinal'] == 10))
    (evidence / (logname + '-source.json')).write_text(json.dumps({
        'catalog_sha256': hashlib.sha256((course / 'lessons.json').read_bytes()).hexdigest(),
        'lessons': {l['slug']: hashlib.sha256(json.dumps(l, sort_keys=True).encode()).hexdigest()
                    for l in catalog if str(l['ordinal']) in selected},
        'support_files': {name: hashlib.sha256((course / name).read_bytes()).hexdigest()
                          for name in (['lab/retry.py'] if {'10', '11'} & set(selected) else []) +
                          (['lab/unknown_outcome.py'] if '11' in selected else [])},
    }, indent=2) + '\n')
    (evidence / (logname + '-outcomes.json')).write_text(json.dumps(measured, indent=2) + '\n')
    leftovers = run([bindir / 'psql', '-X', '-Atqc',
                     "select count(*) from pg_class where relname in "
                     "('pe_visibility','pe_snapshot','pe_history','pe_reuse','pe_atomic_write','pe_stock',"
                     "'pe_edit','pe_on_call_rr','pe_on_call_serial')"])
    assert leftovers.strip() == '0', leftovers
    retry_leftovers = run([bindir / 'psql', '-X', '-Atqc',
                           "select count(*) from pg_namespace where nspname like 'pe_retry_%' or nspname like 'pe_unknown_%'"])
    assert retry_leftovers.strip() == '0', retry_leftovers
    print(output[-2500:], flush=True)
finally:
    if (data / 'postmaster.pid').exists():
        server('pg_ctl', '-D', data, '-m', 'fast', '-w', 'stop')
    # Only delete the unique directory allocated by this invocation, after normal shutdown.
    assert not (data / 'postmaster.pid').exists()
    shutil.rmtree(root)
    after = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
    assert after == before, 'Learner progress changed'
    assert {str(p): history(p) for p in protected} == history_before, 'Learner history changed in WAL'
    (evidence / (logname + '-cleanup.json')).write_text(json.dumps({
        'owned_root': str(root), 'removed': not root.exists(),
        'progress_sha256': after, 'logical_history_unchanged': True,
        'free_bytes': shutil.disk_usage('/tmp').free,
    }, indent=2) + '\n')
    print('Owned cluster removed; both progress databases unchanged.', flush=True)
