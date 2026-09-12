"""Assert both lost-response outcomes and cleanup after a real service SQL failure."""
import json
import re
import shlex
import subprocess


def check_unknown_events(events, mode):
    caller = next(e for e in events if e.get('observer') == 'caller')
    assert caller == {'observer': 'caller', 'response': 'missing', 'outcome': 'UNKNOWN',
                      'automatic_retry': False}, events
    first = next(e for e in events if e.get('observer') == 'reconnected inspector')
    committed = mode == 'after-commit'
    assert first['balance'] == (110 if committed else 100), events
    assert first['first_effect_committed'] == committed, events
    final = next(e for e in events if e.get('observer') == 'independent final query')
    assert final['balance'] == (120 if committed else 110), events
    assert final['applied_increments'] == (2 if committed else 1), events
    assert final['submitted_requests'] == 2, events
    assert sum(e.get('action') == 'deliberate unsafe repeat' for e in events) == 1
    assert any(e.get('injection') == mode for e in events), events
    assert events[-1].get('cleanup') == 'schema removed', events
    return events


def check_unknown(course, env, lesson):
    commands = re.findall(r'```sh\n(.*?)\n```', lesson['challenge'], re.S)
    assert len(commands) == 1
    result = subprocess.run(shlex.split(commands[0]), cwd=course.parents[1], env=env,
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, (result.stdout, result.stderr)
    events = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
    outcomes = {'before_commit': check_unknown_events(events, 'before-commit')}
    # Inject a real SQL error inside the service's write. The original controller/finally
    # remains in charge; this verifies no blind retry and fixture cleanup on failure.
    probe = r'''
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, 'courses/postgres-essentials/lab')
import unknown_outcome as client
original = client.Psql.sql
calls = []
def fail_write(self, sql):
    if sql.startswith('update '):
        calls.append(sql)
        return original(self, 'select * from pe_deliberately_missing_unknown_table;')
    return original(self, sql)
client.Psql.sql = fail_write
try:
    client.experiment('after-commit')
except client.SqlFailure as error:
    assert error.state == '42P01' and len(calls) == 1
    client.event(expected_error=error.state, write_attempts=len(calls))
else:
    raise AssertionError('SQL failure was swallowed')
'''
    result = subprocess.run(['python3', '-c', probe], cwd=course.parents[1], env=env,
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, (result.stdout, result.stderr)
    errors = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
    assert any(e.get('cleanup') == 'schema removed' for e in errors), errors
    assert not any('observer' in e or 'action' in e for e in errors), errors
    assert errors[-1] == {'expected_error': '42P01', 'write_attempts': 1}, errors
    outcomes['sql_failure'] = errors
    return outcomes
