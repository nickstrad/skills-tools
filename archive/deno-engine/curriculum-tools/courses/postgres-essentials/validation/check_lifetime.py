"""Inspect the labelled transaction and wait evidence; never infer success from harness exit."""
import json
import re


def labelled_state(section, label):
    values = re.findall(re.escape(label) + r'\s+([0-9A-Z]{5})\b', section)
    assert len(values) == 1, (label, values, section)
    return values[0]


def column(section, label):
    lines = [re.sub(r'^\s*\[[AB]\] ?', '', line).strip() for line in section.splitlines()]
    for i, line in enumerate(lines[:-2]):
        fields = [field.strip() for field in line.split('|')]
        if label in fields and re.fullmatch(r'[-+ ]+', lines[i + 1]):
            return lines[i + 2].split('|')[fields.index(label)].strip()
    raise AssertionError('Missing column ' + label)


def check_lifetime(sections, selected, cell):
    results = {}
    if '13' in selected:
        section = sections['13']
        assert cell('waiting_name', '13') == 'pe_blocker_b', section
        assert cell('blocker_name', '13') == 'pe_blocker_a', section
        assert cell('wait_event_type', '13') == 'Lock', section
        assert cell('waiting_pid', '13') == cell('b_pid', '13'), section
        assert cell('blocker_pid', '13') == cell('a_pid', '13'), section
        assert cell('waiting_pid', '13') != cell('blocker_pid', '13'), section
        assert cell('xact_start', '13') and cell('blocker_xact_age', '13') != '00:00:00', section
        results['13'] = {label: cell(label, '13') for label in
                         ('waiting_pid', 'blocker_pid', 'wait_event_type', 'wait_event',
                          'blocker_state', 'xact_start', 'blocker_xact_age', 'final_balance')}
    if '14' in selected:
        section = sections['14']
        states = {actor: labelled_state(section, actor.lower() + '_second_update_sqlstate')
                  for actor in ('A', 'B')}
        assert sorted(states.values()) == ['00000', '40P01'], states
        victim = next(actor for actor, state in states.items() if state == '40P01')
        assert re.search(r'\[' + victim + r'\]\s+ERROR:\s+deadlock detected', section), section
        for actor in ('a', 'b'):
            assert labelled_state(section, actor + '_finish_sqlstate') == '00000', section
        expected_values, total = ('{1,1}', '2') if victim == 'A' else ('{10,10}', '20')
        assert cell('final_values', '14') == expected_values, section
        assert cell('total_committed_increment', '14') == total, section
        results['14'] = {'second_update_states': states, 'victim': victim,
                         'final_values': expected_values, 'total_committed_increment': int(total)}
    if '15' in selected:
        section = sections['15']
        states = {label: labelled_state(section, label) for label in
                  ('lock_update_sqlstate', 'after_lock_timeout_sqlstate',
                   'sleep_sqlstate', 'after_statement_timeout_sqlstate')}
        assert list(states.values()) == ['55P03', '25P02', '57014', '25P02'], states
        assert cell('final_balance', '15') == '100', section
        results['15'] = {'states': states, 'final_balance': 100}
    return results


def check_lifetime_variations(sections, output):
    checks = {}
    waits = [json.loads(line.removeprefix('WAIT_EVIDENCE ')) for line in output.splitlines()
             if line.startswith('WAIT_EVIDENCE ')]
    for n in ('13', '14'):
        if n in sections:
            assert any(w['lesson'] == int(n) for w in waits), (n, waits)
    if '13' in sections:
        assert column(sections['13'], 'rollback_holder_balance') == '120', sections['13']
        checks['13'] = {'holder_rolled_back': True, 'final_balance': 120, 'actual_wait': True}
    if '14' in sections:
        section = sections['14']
        assert labelled_state(section, 'b_first_sqlstate') == '00000', section
        assert labelled_state(section, 'b_second_sqlstate') == '00000', section
        assert column(section, 'ordered_final_values') == '{11,11}', section
        checks['14'] = {'final_values': '{11,11}', 'both_committed': True, 'actual_wait': True}
    if '15' in sections:
        section = sections['15']
        assert labelled_state(section, 'autocommit_sleep_sqlstate') == '57014', section
        assert labelled_state(section, 'autocommit_next_sqlstate') == '00000', section
        assert column(section, 'connection_reusable') == '1', section
        checks['15'] = {'sleep_sqlstate': '57014', 'next_sqlstate': '00000', 'connection_reusable': 1}
    return checks
