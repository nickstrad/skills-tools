"""Real client acceptance for successful, exhausted and nonretryable outcomes."""
import json
import re
import shlex
import subprocess


def check_retry(course, env, lesson):
    # Execute the actual commands displayed in the optional variation, then one SQL-error probe.
    commands = re.findall(r'```sh\n(.*?)\n```', lesson['challenge'], re.S)
    assert len(commands) == 2
    commands.append('python3 courses/postgres-essentials/lab/retry.py --mode sql-error')
    outcomes = {}
    for name, command, status in zip(('no_conflict', 'exhausted', 'nonretryable'), commands, (0, 2, 1)):
        result = subprocess.run(shlex.split(command), cwd=course.parents[1], env=env,
                                capture_output=True, text=True, timeout=30)
        assert result.returncode == status, (name, result.stdout, result.stderr)
        events = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
        decisions = [e for e in events if e.get('actor') == 'B' and 'read' in e]
        commits = [e for e in events if e.get('actor') == 'B' and 'sqlstate' in e]
        assert len(decisions) == len(commits) == 1, (name, events)
        assert decisions[0]['read'] == 2 and decisions[0]['decision'] == 'leave'
        expected_state = {'no_conflict': '00000', 'exhausted': '40001', 'nonretryable': '42P01'}[name]
        assert commits[0]['sqlstate'] == expected_state, events
        if name != 'nonretryable':
            final = next(e for e in events if 'final_rows' in e)
            assert final['on_call'] == 1
            assert final['final_rows'] == (['Alice|t', 'Bob|f'] if name == 'no_conflict' else ['Alice|f', 'Bob|t'])
            assert final['completed'] == (name == 'no_conflict')
        else:
            assert commits[0]['phase'] == 'write' and not commits[0]['committed']
            assert 'STOP: SQLSTATE 42P01' in result.stderr
        assert any(e.get('cleanup') == 'schema removed' for e in events), events
        outcomes[name] = {'exit_status': status, 'events': events}
    return outcomes
