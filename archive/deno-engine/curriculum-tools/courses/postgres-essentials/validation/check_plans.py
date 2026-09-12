"""Assert measured plan behavior from the exact learner-facing text plans.

The Session runner preserves text EXPLAIN output. Read complete plan result tables, reject
missing nodes, and compare row/buffer relationships rather than costs or elapsed times.
"""
import re


def plans(section):
    text = re.sub(r'^\s*\[A\] ?', '', section, flags=re.M)
    tables = re.findall(r'^\s*QUERY PLAN\s*\n\s*-+\s*\n(.*?)^\s*\(\d+ rows?\)',
                        text, re.M | re.S)
    assert tables, 'No complete EXPLAIN result table'
    result = []
    for table in tables:
        nodes = []
        for line in table.splitlines():
            match = re.search(r'^\s*(?:->\s*)?(.*?)\s+\(cost=[^)]*rows=(\d+) width=\d+\)'
                              r'(?:\s+\(actual (?:time=[\d.]+\.\.[\d.]+ )?rows=(\d+) loops=(\d+)\))?', line)
            if match:
                nodes.append({'node': match[1], 'estimate': int(match[2]),
                              'actual': int(match[3]) if match[3] else None,
                              'loops': int(match[4]) if match[4] else None})
        assert nodes, table
        # The first execution Buffers line is inclusive of child nodes. Do not sum the tree,
        # and do not accidentally read the separate Planning: buffer accounting.
        execution = table.split('Planning:')[0]
        buffer = re.search(r'Buffers: shared ([^\n]+)', execution)
        accesses = sum(int(x) for x in re.findall(r'(?:hit|read)=(\d+)', buffer[1])) if buffer else 0
        result.append({'nodes': nodes, 'shared_accesses': accesses,
                       'heap_fetches': [int(x) for x in re.findall(r'Heap Fetches: (\d+)', table)],
                       'removed': [int(x) for x in re.findall(r'Rows Removed by Filter: (\d+)', table)],
                       'sorts': re.findall(r'Sort Method: ([^\n]+)', table),
                       'temp_io': [int(x) for part in re.findall(r'temp ([^\n]+)', table)
                                   for x in re.findall(r'(?:read|written)=(\d+)', part)],
                       'text': table.strip()})
    return result


def node(plan, name):
    matches = [n for n in plan['nodes'] if n['node'].startswith(name)]
    assert len(matches) == 1, (name, plan)
    return matches[0]


def measured(plan):
    """Compact evidence keeps semantic fields; the accompanying log retains complete text."""
    return {key: value for key, value in plan.items() if key != 'text'}


def check_plans(sections):
    checks = {}
    for number, section in sections.items():
        if not 16 <= int(number) <= 21:
            continue
        pp = plans(section)
        if number == '16':
            assert len(pp) == 3, pp
            assert all(n['actual'] is None for n in pp[0]['nodes'])
            assert not pp[0]['shared_accesses']
            for plan in pp[1:]:
                assert node(plan, 'Aggregate')['actual'] == 1
                assert node(plan, 'Seq Scan')['actual'] == 100
                assert node(plan, 'Seq Scan')['loops'] == 1
                assert plan['removed'] == [9900] and plan['shared_accesses'] > 0
        elif number == '17':
            assert len(pp) == 2, pp
            stale, fresh = [node(plan, 'Seq Scan') for plan in pp]
            assert stale['actual'] == fresh['actual'] == 9000
            assert stale['estimate'] < stale['actual'] / 3, stale
            assert abs(fresh['estimate'] - 9000) < 900, fresh
            assert all(plan['removed'] == [1000] for plan in pp)
        elif number == '18':
            assert len(pp) == 2, pp
            assert node(pp[0], 'Index Scan')['actual'] == 10
            assert node(pp[1], 'Seq Scan')['actual'] == 95000
            assert pp[1]['removed'] == [5000]
            assert 0 < pp[0]['shared_accesses'] < pp[1]['shared_accesses']
        elif number == '19':
            assert len(pp) == 2, pp
            for plan in pp:
                assert node(plan, 'Limit')['actual'] == 10
                assert node(plan, 'Index Scan Backward')['actual'] == 10
                assert not plan['sorts']
                assert 'Index Cond:' in plan['text']
            assert 'pe_event_time_tenant_idx' in pp[0]['text']
            assert 'pe_event_tenant_time_idx' in pp[1]['text']
            assert pp[0]['shared_accesses'] > pp[1]['shared_accesses'] * 5 > 0
        elif number == '20':
            assert len(pp) == 3, pp
            for plan in pp:
                assert node(plan, 'Index Only Scan')['actual'] == 100
                assert node(plan, 'Index Only Scan')['loops'] == 1
            assert pp[0]['heap_fetches'] == pp[2]['heap_fetches'] == [0]
            assert len(pp[1]['heap_fetches']) == 1 and pp[1]['heap_fetches'][0] > 0
        elif number == '21':
            assert len(pp) == 2, pp
            for plan in pp:
                assert node(plan, 'Sort')['actual'] == 20000
                assert node(plan, 'Seq Scan')['actual'] == 20000
                assert node(plan, 'Sort')['loops'] == 1
            assert pp[0]['sorts'][0].startswith('external merge')
            assert pp[0]['temp_io'] and all(x > 0 for x in pp[0]['temp_io'])
            assert re.search(r'temp read=\d+ written=\d+', pp[0]['text'])
            assert pp[1]['sorts'][0].startswith('quicksort') and not pp[1]['temp_io']
        else:
            raise AssertionError('No query-work acceptance for lesson ' + number)
        checks[number] = [measured(plan) for plan in pp]
    return checks


def check_plan_variations(sections):
    checks = {}
    for number, section in sections.items():
        if not 16 <= int(number) <= 21:
            continue
        pp = plans(section)
        if number == '16':
            assert len(pp) == 1
            assert node(pp[0], 'Aggregate')['actual'] == 1
            assert node(pp[0], 'Seq Scan')['actual'] == 1000
            assert pp[0]['removed'] == [9000]
        elif number == '17':
            assert len(pp) == 2
            stale, fresh = [node(plan, 'Seq Scan') for plan in pp]
            assert stale['actual'] == fresh['actual'] == 1000
            assert stale['estimate'] > 3000 and abs(fresh['estimate'] - 1000) < 100
        elif number == '18':
            assert len(pp) == 1 and pp[0]['nodes'][0]['actual'] == 20000
            assert pp[0]['shared_accesses'] > 0
        elif number == '19':
            assert len(pp) == 2
            for plan in pp:
                assert node(plan, 'Limit')['actual'] == 10
                assert node(plan, 'Index Scan')['actual'] == 10
                assert 'Backward' not in node(plan, 'Index Scan')['node']
                assert not plan['sorts']
            assert pp[0]['shared_accesses'] > pp[1]['shared_accesses'] * 5 > 0
        elif number == '20':
            assert len(pp) == 1
            assert pp[0]['nodes'][0]['actual'] == 100
            assert not any(n['node'].startswith('Index Only Scan') for n in pp[0]['nodes'])
            assert any(n['node'].startswith(('Index Scan', 'Bitmap Heap Scan', 'Seq Scan'))
                       for n in pp[0]['nodes'])
        elif number == '21':
            assert len(pp) == 1
            assert node(pp[0], 'Limit')['actual'] == node(pp[0], 'Sort')['actual'] == 20
            assert node(pp[0], 'Seq Scan')['actual'] == 20000
            assert pp[0]['sorts'][0].startswith('top-N heapsort')
            assert not pp[0]['temp_io']
        else:
            raise AssertionError('No variation acceptance for lesson ' + number)
        checks[number] = [measured(plan) for plan in pp]
    return checks
