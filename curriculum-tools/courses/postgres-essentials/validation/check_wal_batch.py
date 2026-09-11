"""Check the memory/WAL/recovery batch's observed outcomes, not harness completion alone."""
import json
from pathlib import Path
import re
from check_plans import plans, node


def clean(section):
    return re.sub(r'^\s*\[A\] ?', '', section, flags=re.M)


def cell(section, label):
    lines = clean(section).splitlines()
    for i, line in enumerate(lines[:-2]):
        columns = [c.strip() for c in line.split('|')]
        if label in columns and re.fullmatch(r'[-+ ]+', lines[i+1]):
            return lines[i+2].split('|')[columns.index(label)].strip()
    raise AssertionError('Missing column: ' + label)


def check_batch(sections, variations=False):
    result = {}
    for n, section in sections.items():
        if not 22 <= int(n) <= 26:
            continue
        text = clean(section)
        assert not re.search(r'ERROR:|FATAL:|PANIC:|STOP:|Traceback|invalid command', text), text
        if n == '22':
            pp = plans(section)
            assert len(pp) == (1 if variations else 2), pp
            records = []
            for p in pp:
                assert node(p, 'Hash Join')['actual'] == 50000
                batches = re.findall(r'Buckets: \d+\s+Batches: (\d+)', p['text'])
                assert len(batches) == 1
                records.append({'joined_rows': 50000, 'batches': int(batches[0]),
                                'temp_io': p['temp_io']})
            if variations:
                assert 1 < records[0]['batches'] < 256 and records[0]['temp_io']
            else:
                assert records[0]['batches'] > 1 and records[0]['temp_io']
                assert records[1]['batches'] == 1 and not records[1]['temp_io']
            result[n] = records
        elif n == '23':
            if variations:
                count = int(cell(section, 'visible_rows'))
                wal = int(cell(section, 'wal_bytes_generated'))
                assert count == 0 and wal > 0
                result[n] = {'visible_rows': count, 'wal_bytes_generated': wal}
            else:
                assert cell(section, 'flush_reached_saved_write') == 't'
                assert cell(section, 'synchronous_rows') == cell(section, 'asynchronous_rows') == '1'
                # The sample is descriptive; asynchronous commits can already be flushed.
                result[n] = {'flush_reached_saved_write': True, 'synchronous_rows': 1,
                             'asynchronous_rows': 1}
        elif n == '24':
            if variations:
                count = int(cell(section, 'useful_rows'))
                wal = int(cell(section, 'ten_transaction_wal_bytes'))
                assert count == 200 and wal > 0
                result[n] = {'useful_rows': count, 'ten_transaction_wal_bytes': wal}
            else:
                assert cell(section, 'autocommit_rows') == cell(section, 'batched_rows') == '200'
                assert cell(section, 'checksums_equal') == 't'
                single = int(cell(section, 'autocommit_wal_bytes'))
                batch = int(cell(section, 'batched_wal_bytes'))
                assert single > batch > 0
                result[n] = {'useful_rows_each': 200, 'checksums_equal': True,
                             'autocommit_wal_bytes': single, 'batched_wal_bytes': batch}
        elif n == '26':
            events = [json.loads(line) for line in text.splitlines() if line.startswith('{')]
            before = next(e for e in events if e.get('phase') == 'before_stop')
            after = next(e for e in events if e.get('phase') == 'recovered')
            cleanup = next(e for e in events if e.get('cleanup'))
            assert before['pending_private_value'] == 700 and before['checkpoint_unchanged']
            assert before['wal_after_checkpoint']
            assert before['committed_inventory'] == after['inventory'] == [[1,110],[2,100],[3,100],[4,1]]
            assert after['redo'] is (not variations) and after['crash_recovery'] is (not variations)
            assert cleanup['removed'] and not Path(cleanup['path']).exists()
            logs = '\n'.join(e['restart_log'] for e in events if 'restart_log' in e)
            if variations:
                assert 'was shut down' in logs and 'redo starts at' not in logs
            else:
                assert all(s in logs for s in ['was interrupted', 'redo starts at', 'redo done at'])
            result[n] = {'before': before, 'after': after, 'cleanup': cleanup}
        else:
            events = [json.loads(line) for line in text.splitlines() if line.startswith('{')]
            before = next(e for e in events if e.get('phase') == 'before_checkpoint')
            after = next(e for e in events if e.get('phase') == 'after_checkpoint')
            final = next(e for e in events if e.get('phase') == 'final')
            cleanup = next(e for e in events if e.get('cleanup'))
            assert before['writer_pid'] == after['writer_pid']
            assert before['writer_state'] == after['writer_state'] == 'idle in transaction'
            assert before['relation_dirty_buffers'] > after['relation_dirty_buffers'] >= 0
            for record in (before, after):
                assert record['writer_rows'] == record['writer_pending_rows'] == 12000
                assert record['observer_rows'] == record['observer_original_rows'] == 12000
            assert final['decision'] == ('commit' if variations else 'rollback')
            assert final['rows'] == 12000
            assert final['pending_rows'] == (12000 if variations else 0)
            assert final['original_rows'] == (0 if variations else 12000)
            assert cleanup['removed'] and not Path(cleanup['path']).exists()
            result[n] = {'before': before, 'after': after, 'final': final, 'cleanup': cleanup}
    return result
