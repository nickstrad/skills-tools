#!/usr/bin/env python3
"""Withhold an application response, reconnect, then demonstrate an unsafe repeat."""
import argparse
import os
import signal
import sys
import uuid

sys.dont_write_bytecode = True
from retry import Psql, SqlFailure, event


def submit_without_response(env, schema, mode):
    """The caller receives no outcome in either mode; service scheduling stays internal."""
    request = Psql(env)
    try:
        request.sql('begin;')
        request.sql(f'update {schema}.account set balance=balance+10 where id=1;')
        if mode == 'after-commit':
            request.sql('commit;')
        # Deliberate injection at the service -> caller boundary. In before-commit mode,
        # closing the connection ends the unfinished transaction without committing it.
    finally:
        request.close()
    return None


def experiment(mode):
    env = os.environ.copy()
    for key, value in dict(PGHOST='/tmp', PGPORT='5440', PGUSER='postgres', PGDATABASE='lab').items():
        env.setdefault(key, value)
    env.update(PGCONNECT_TIMEOUT='3', PGOPTIONS='-c statement_timeout=5000 -c lock_timeout=3000',
               PGAPPNAME='pe-unknown-outcome', LC_ALL='C')
    schema = 'pe_unknown_' + uuid.uuid4().hex
    admin = Psql(env)
    created = False
    try:
        admin.sql(f'create schema {schema};')
        created = True
        admin.sql(f'create table {schema}.account (id integer primary key, balance integer not null);')
        admin.sql(f'insert into {schema}.account values (1,100);')
        event(fixture=schema, initial_balance=100)
        response = submit_without_response(env, schema, mode)
        assert response is None
        event(observer='caller', response='missing', outcome='UNKNOWN', automatic_retry=False)
        # Fresh connections establish committed visibility after the original request closed.
        inspector = Psql(env)
        try:
            first = int(inspector.sql(f'select balance from {schema}.account where id=1;'))
            event(observer='reconnected inspector', balance=first,
                  first_effect_committed=(first == 110))
            assert first == (110 if mode == 'after-commit' else 100)
        finally:
            inspector.close()
        # This is an explicitly unsafe teaching action, not the client's recovery policy.
        event(action='deliberate unsafe repeat', requested_increment=10)
        repeated = Psql(env)
        try:
            repeated.sql('begin;')
            repeated.sql(f'update {schema}.account set balance=balance+10 where id=1;')
            repeated.sql('commit;')
        finally:
            repeated.close()
        final = int(admin.sql(f'select balance from {schema}.account where id=1;'))
        event(observer='independent final query', balance=final,
              applied_increments=(final-100)//10, submitted_requests=2)
        assert final == first + 10
        event(injection=mode, boundary='application response; no database crash or packet loss')
        return 0
    finally:
        try:
            if created:
                admin.sql(f'drop schema {schema} cascade;')
                assert admin.sql(f"select count(*) from pg_namespace where nspname='{schema}';") == '0'
                event(cleanup='schema removed', schema=schema)
        finally:
            admin.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['after-commit', 'before-commit'], default='after-commit')
    args = parser.parse_args()
    try:
        return experiment(args.mode)
    except (SqlFailure, RuntimeError, TimeoutError, OSError) as error:
        print(f'STOP: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    sys.exit(main())
