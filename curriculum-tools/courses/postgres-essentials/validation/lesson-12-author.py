"""Validate lesson 12 in one owned PostgreSQL 16 cluster and always remove it."""
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import tempfile

assert shutil.disk_usage('/tmp').free > 2 * 1024**3
course = Path(__file__).resolve().parents[1]
engine = course.parents[1]
bindir = Path(subprocess.check_output(['pg_config', '--bindir'], text=True).strip())
owner = pwd.getpwnam('postgres')
prefix = ['runuser', '-u', owner.pw_name, '--'] if os.geteuid() == 0 else []
root = Path(tempfile.mkdtemp(prefix='pg-essentials-l12-', dir='/tmp'))
data, sock = root / 'data', root / 'socket'
sock.mkdir()
if os.geteuid() == 0:
    for path in (root, sock):
        os.chown(path, owner.pw_uid, owner.pw_gid)
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST=str(sock), PGPORT='6562', PGUSER='postgres', PGDATABASE='postgres',
           PGCONNECT_TIMEOUT='3', LC_ALL='C')


def run(args, timeout=60):
    result = subprocess.run([str(x) for x in args], cwd=engine, env=env, text=True,
                            capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout + result.stderr


def server(name, *args):
    return run(prefix + [bindir / name, *args])


try:
    learner = run([bindir / 'psql', '-X', '-h', '/tmp', '-p', '5440', '-U', 'postgres',
                   '-d', 'lab', '-Atqc', "select current_setting('data_directory')"])
    assert learner.strip() == '/labs/pglab/primary'
    server('initdb', '-D', data, '-U', 'postgres', '--auth-local=trust',
           '--auth-host=reject', '--no-locale', '--wal-segsize=1')
    with (data / 'postgresql.conf').open('a') as conf:
        conf.write("\nlisten_addresses=''\nport=6562\nunix_socket_directories='" + str(sock) +
                   "'\nshared_buffers='16MB'\nmax_connections=10\nmin_wal_size='2MB'\nmax_wal_size='16MB'\n")
    server('pg_ctl', '-D', data, '-l', root / 'server.log', '-w', 'start')
    command = ['/root/.deno/bin/deno', 'run', '-A',
               course / 'validation/lesson-12-author.ts']
    core = run(command, 90)
    variation = run(command + ['--variation'], 90)
    core_plain = re.sub(r'^  \[[AB]\] ?', '', core, flags=re.M)
    variation_plain = re.sub(r'^  \[[AB]\] ?', '', variation, flags=re.M)
    assert 'WAIT_EVIDENCE' in core and 'transactionid' in core
    assert 'a_inserted=1' in core and 'b_inserted=0' in core
    assert 'replay_inserted=0' in core
    assert 'MATCH: return stored receipt' in core
    assert 'REJECT: request key reused with different payload' in core
    assert re.search(r'request_rows\s*\|\s*credited_total.*?\n[-+| ]+\n\s*1\s*\|\s*40', core_plain, re.S)
    assert 'WAIT_EVIDENCE' in variation and 'transactionid' in variation
    assert 'b_inserted=1' in variation
    assert re.search(r'request_rows\s*\|\s*credited_total.*?\n[-+| ]+\n\s*1\s*\|\s*40', variation_plain, re.S)
    assert not re.search(r'ERROR:|FATAL:|PANIC:', core + variation)
    print(core)
    print(variation)
finally:
    if (data / 'postmaster.pid').exists():
        server('pg_ctl', '-D', data, '-m', 'fast', '-w', 'stop')
    assert not (data / 'postmaster.pid').exists()
    shutil.rmtree(root)
    print(f'CLEANUP owned_root={root} removed={not root.exists()}')
