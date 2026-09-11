#!/usr/bin/env python3
"""Demonstrate recovery on a fresh owned cluster; never accepts an existing server target."""
import argparse
import json
import os
from pathlib import Path
import pwd
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time


def emit(**record):
    print(json.dumps(record, sort_keys=True), flush=True)


class Connection:
    """One bounded psql conversation, including an intentionally open transaction."""
    def __init__(self, command, env):
        self.process = subprocess.Popen(command, env=env, stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                        start_new_session=True)
        self.sequence = 0
        self.pending = b''

    def sql(self, statement):
        self.sequence += 1
        marker = f'PE_END_{self.sequence}'.encode()
        self.process.stdin.write(statement.encode() + b'\n\\echo ' + marker + b'\n')
        self.process.stdin.flush()
        deadline = time.monotonic() + 10
        output = []
        while time.monotonic() < deadline:
            while b'\n' in self.pending:
                line, self.pending = self.pending.split(b'\n', 1)
                if line.strip() == marker:
                    result = b'\n'.join(output).decode()
                    if 'ERROR:' in result or 'FATAL:' in result:
                        raise RuntimeError(result)
                    return result.strip()
                output.append(line)
            if select.select([self.process.stdout], [], [], max(0, deadline-time.monotonic()))[0]:
                chunk = os.read(self.process.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError(b'\n'.join(output).decode() + '\npsql disconnected')
                self.pending += chunk
        raise TimeoutError('psql response exceeded ten seconds')

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        self.process.stdin.close()
        self.process.stdout.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['crash', 'clean'], default='crash')
    args = parser.parse_args()
    if shutil.disk_usage('/tmp').free < 2 * 1024**3:
        raise RuntimeError('Need at least 2 GiB free before allocating this small fixture')
    bindir = Path(subprocess.check_output(['pg_config', '--bindir'], text=True).strip())
    version = subprocess.check_output([bindir/'postgres', '--version'], text=True)
    if ' 16.' not in version:
        raise RuntimeError('This experiment requires PostgreSQL 16 server binaries')
    owner = pwd.getpwnam('postgres') if os.geteuid() == 0 else pwd.getpwuid(os.geteuid())
    prefix = ['runuser', '-u', owner.pw_name, '--'] if os.geteuid() == 0 else []
    root = Path(tempfile.mkdtemp(prefix='pe-crash-', dir='/tmp'))
    data, sock, log = root/'data', root/'socket', root/'server.log'
    # Ignore inherited connection/configuration variables: every endpoint is owned here.
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env.update(PGHOST=str(sock), PGPORT='6546', PGUSER='postgres', PGDATABASE='postgres',
               PGCONNECT_TIMEOUT='3', LC_ALL='C')
    connections = []

    def run(command, timeout=30):
        result = subprocess.run(list(map(str, command)), env=env, capture_output=True,
                                text=True, timeout=timeout)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        return result.stdout.strip()

    def server(name, *arguments):
        return run(prefix + [bindir/name, *arguments])

    def connect():
        client = Connection([str(bindir/'psql'), '-X', '-Atq', '-v', 'ON_ERROR_STOP=1'], env)
        connections.append(client)
        client.sql("set statement_timeout='5s'; set lock_timeout='3s';")
        return client

    try:
        sock.mkdir()
        if os.geteuid() == 0:
            for path in (root, sock):
                os.chown(path, owner.pw_uid, owner.pw_gid)
        emit(fixture=str(root), mode=args.mode, server=version.strip())
        server('initdb', '-D', data, '-U', 'postgres', '--auth-local=trust',
               '--auth-host=reject', '--no-locale', '--wal-segsize=1')
        with (data/'postgresql.conf').open('a') as conf:
            conf.write("\nlisten_addresses=''\nport=6546\nunix_socket_directories='" + str(sock) +
                       "'\nshared_buffers='16MB'\nmax_connections=10\nfsync=on\n"
                       "synchronous_commit=on\nfull_page_writes=on\ncheckpoint_timeout='1h'\n"
                       "min_wal_size='2MB'\nmax_wal_size='64MB'\nautovacuum=off\n"
                       "logging_collector=off\nlog_checkpoints=on\n")
        server('pg_ctl', '-D', data, '-l', log, '-w', '-t', '15', 'start')
        observer = connect()
        assert observer.sql("select current_setting('data_directory');") == str(data)
        observer.sql("""create table pe_crash_inventory (id int primary key, value int not null);
insert into pe_crash_inventory values (1,100),(2,100),(3,100),(4,0);
checkpoint;""")
        checkpoint = observer.sql('select checkpoint_lsn from pg_control_checkpoint();')
        emit(phase='baseline', checkpoint_lsn=checkpoint, inventory=[[1,100],[2,100],[3,100],[4,0]])
        observer.sql('begin; update pe_crash_inventory set value=110 where id=1; commit;')
        observer.sql('begin; update pe_crash_inventory set value=900 where id=2; rollback;')
        pending = connect()
        private = pending.sql('begin; update pe_crash_inventory set value=700 where id=3; '
                              'select value from pe_crash_inventory where id=3;')
        assert private == '700'
        # This synchronous marker commit flushes WAL preceding it, including the open update.
        observer.sql('update pe_crash_inventory set value=1 where id=4;')
        positions = observer.sql('select pg_current_wal_insert_lsn(), pg_current_wal_flush_lsn();')
        current_checkpoint = observer.sql('select checkpoint_lsn from pg_control_checkpoint();')
        assert current_checkpoint == checkpoint, 'An unexpected checkpoint changed the comparison'
        inventory_sql = ('select json_agg(json_build_array(id,value) order by id) '
                         'from pe_crash_inventory;')
        before = json.loads(observer.sql(inventory_sql))
        expected = [[1,110],[2,100],[3,100],[4,1]]
        assert before == expected
        emit(phase='before_stop', pending_private_value=int(private), committed_inventory=before,
             insert_and_flush_lsn=positions, checkpoint_unchanged=True,
             marker_commit='synchronous: preceding WAL flushed')
        if args.mode == 'clean':
            pending.sql('rollback;')
        for client in connections:
            if args.mode == 'clean':
                client.close()
        stop_mode = 'immediate' if args.mode == 'crash' else 'fast'
        emit(action='stop owned server', stop_mode=stop_mode, data_directory=str(data))
        server('pg_ctl', '-D', data, '-m', stop_mode, '-w', '-t', '15', 'stop')
        for client in connections:
            client.close()
        connections.clear()
        offset = log.stat().st_size
        server('pg_ctl', '-D', data, '-l', log, '-w', '-t', '15', 'start')
        recovered = connect()
        assert recovered.sql("select current_setting('data_directory');") == str(data)
        after = json.loads(recovered.sql(inventory_sql))
        assert after == expected
        restart_log = log.read_text()[offset:]
        recovery_seen = 'database system was interrupted' in restart_log
        redo_seen = 'redo starts at' in restart_log and 'redo done at' in restart_log
        assert recovery_seen == (args.mode == 'crash'), restart_log
        assert redo_seen == (args.mode == 'crash'), restart_log
        for line in restart_log.splitlines():
            if any(word in line for word in ('was interrupted', 'was shut down', 'redo starts at',
                                             'redo done at', 'ready to accept connections')):
                emit(restart_log=line)
        emit(phase='recovered', inventory=after, committed_survived=True, aborted_visible=False,
             interrupted_visible=False, crash_recovery=recovery_seen, redo=redo_seen)
    finally:
        # A second interrupt must not interrupt the narrow stop/remove cleanup section.
        old_int = signal.signal(signal.SIGINT, signal.SIG_IGN)
        old_term = signal.signal(signal.SIGTERM, signal.SIG_IGN)
        try:
            for client in connections:
                client.close()
            if (data/'postmaster.pid').exists():
                server('pg_ctl', '-D', data, '-m', 'fast', '-w', '-t', '15', 'stop')
            assert not (data/'postmaster.pid').exists(), 'Server not stopped; preserve fixture'
            shutil.rmtree(root)
            emit(cleanup='owned cluster removed', path=str(root), removed=not root.exists())
        finally:
            signal.signal(signal.SIGINT, old_int)
            signal.signal(signal.SIGTERM, old_term)


if __name__ == '__main__':
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    try:
        main()
    except KeyboardInterrupt:
        print('Interrupted; inspect the cleanup record above.', file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        print('STOP: ' + str(error), file=sys.stderr)
        sys.exit(1)
