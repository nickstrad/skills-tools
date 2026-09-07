#!/usr/bin/env python3
"""A supplied, bounded transaction-retry experiment; Python stdlib and psql only."""
import argparse
import json
import os
import re
import select
import signal
import subprocess
import sys
import time
import uuid


class SqlFailure(Exception):
    def __init__(self, state, output):
        super().__init__(f"SQLSTATE {state}: {output.strip()}")
        self.state = state


class Psql:
    """One persistent connection. A per-command marker captures SQLSTATE immediately."""

    def __init__(self, env):
        self.proc = subprocess.Popen(
            ['psql', '-X', '-qAt', '-P', 'pager=off', '-v', 'ON_ERROR_STOP=0'],
            env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, bufsize=0)
        try:
            self.sql("select 1;")
        except BaseException:
            self.close()
            raise

    def sql(self, statement):
        marker = '__result_' + uuid.uuid4().hex
        self.proc.stdin.write((statement + '\n\\echo ' + marker + ' :SQLSTATE\n').encode())
        output = b''
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if not select.select([self.proc.stdout], [], [], max(0, deadline-time.monotonic()))[0]:
                break
            chunk = os.read(self.proc.stdout.fileno(), 65536)
            if not chunk:
                raise RuntimeError('psql disconnected; outcome is not classified for retry')
            output += chunk
            match = re.search(re.escape(marker.encode()) + rb' ([0-9A-Z]{5})\r?\n', output)
            if match:
                state = match[1].decode()
                body = output[:match.start()].decode()
                if state != '00000':
                    raise SqlFailure(state, body)
                return body.strip()
        raise TimeoutError('client deadline expired; outcome is not classified for retry')

    def close(self):
        if self.proc.poll() is None:
            try:
                self.proc.stdin.write(b'\\q\n')
                self.proc.stdin.close()
                self.proc.wait(timeout=2)
            except (OSError, subprocess.TimeoutExpired):
                self.proc.kill()
                self.proc.wait(timeout=2)
        self.proc.stdout.close()
        if not self.proc.stdin.closed:
            self.proc.stdin.close()


def event(**values):
    print(json.dumps(values, sort_keys=True), flush=True)


def experiment(mode, max_attempts):
    env = os.environ.copy()
    for key, value in dict(PGHOST='/tmp', PGPORT='5440', PGUSER='postgres', PGDATABASE='lab').items():
        env.setdefault(key, value)
    env.update(PGCONNECT_TIMEOUT='3', PGOPTIONS='-c statement_timeout=5000 -c lock_timeout=3000',
               PGAPPNAME='pe-whole-transaction-retry', LC_ALL='C')
    schema = 'pe_retry_' + uuid.uuid4().hex
    admin = Psql(env)
    clients = []
    created = False
    try:
        admin.sql(f'create schema {schema};')
        created = True
        admin.sql(f'create table {schema}.on_call (doctor text primary key, on_call boolean not null);')
        admin.sql(f"insert into {schema}.on_call values ('Alice', true), ('Bob', true);")
        event(fixture=schema, mode=mode, max_attempts=max_attempts)
        a = Psql(env)
        clients.append(a)
        b = Psql(env)
        clients.append(b)
        for client in clients:
            client.sql(f'set search_path to {schema};')
        # This controller schedule forces overlap without sleeps or an application lock protocol.
        if mode == 'conflict':
            a.sql('begin isolation level serializable;')
            count = int(a.sql('select count(*) from on_call where on_call;'))
            assert count == 2
            a.sql("update on_call set on_call=false where doctor='Alice';")
            event(actor='A', read=count, decision='leave', committed=False)

        completed = False
        for attempt in range(1, max_attempts + 1):
            phase = 'begin'
            try:
                b.sql('begin isolation level serializable;')
                phase = 'read'
                count = int(b.sql('select count(*) from on_call where on_call;'))
                decision = 'leave' if count > 1 else 'stay'
                event(actor='B', attempt=attempt, read=count, decision=decision)
                phase = 'write'
                if mode == 'sql-error':
                    # An actual undefined-table error tests the nonretryable branch.
                    b.sql('select * from deliberately_missing_retry_table;')
                if decision == 'leave':
                    b.sql("update on_call set on_call=false where doctor='Bob';")
                if mode == 'conflict' and attempt == 1:
                    a.sql('commit;')
                    event(actor='A', committed=True)
                phase = 'commit'
                b.sql('commit;')
                event(actor='B', attempt=attempt, phase=phase, sqlstate='00000', committed=True)
                completed = True
                break
            except SqlFailure as error:
                event(actor='B', attempt=attempt, phase=phase, sqlstate=error.state, committed=False)
                b.sql('rollback;')
                if error.state != '40001':
                    raise
                if attempt == max_attempts:
                    event(stop='retry budget exhausted', attempts=attempt)
                    break
                # A small bounded delay; the next loop includes BEGIN, read and decision again.
                time.sleep(0.1 * attempt)

        rows = admin.sql(f'select doctor, on_call from {schema}.on_call order by doctor;')
        remaining = int(admin.sql(f'select count(*) from {schema}.on_call where on_call;'))
        event(final_rows=rows.splitlines(), on_call=remaining, completed=completed)
        assert remaining == 1, rows
        return 0 if completed else 2
    finally:
        # Closing the owned connections rolls back any unfinished attempts before fixture removal.
        for client in reversed(clients):
            client.close()
        try:
            if created:
                admin.sql(f'drop schema {schema} cascade;')
                absent = admin.sql(f"select count(*) from pg_namespace where nspname='{schema}';")
                assert absent == '0'
                event(cleanup='schema removed', schema=schema)
        finally:
            admin.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['conflict', 'no-conflict', 'sql-error'], default='conflict')
    parser.add_argument('--max-attempts', type=int, choices=range(1, 4), default=3)
    args = parser.parse_args()
    try:
        return experiment(args.mode, args.max_attempts)
    except (SqlFailure, RuntimeError, TimeoutError, OSError) as error:
        print(f'STOP: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    sys.exit(main())
