"""Exercise failure cleanup after real writes and open connections in the crash controller."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys

course = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pe_crash', course/'lab/crash.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original_emit = module.emit
outcomes = {}
for error in (KeyboardInterrupt, RuntimeError):
    def fail_after_writes(**record):
        original_emit(**record)
        if record.get('phase') == 'before_stop':
            raise error('author-only injection after real writes')
    module.emit = fail_after_writes
    output = io.StringIO()
    saved_args = sys.argv
    try:
        sys.argv = [str(course/'lab/crash.py')]
        with contextlib.redirect_stdout(output):
            try:
                module.main()
            except error:
                pass
            else:
                raise AssertionError('Failure injection did not execute')
    finally:
        sys.argv = saved_args
    records = [json.loads(line) for line in output.getvalue().splitlines()]
    cleanup = records[-1]
    assert cleanup['cleanup'] == 'owned cluster removed' and cleanup['removed']
    assert not Path(cleanup['path']).exists()
    assert any(r.get('pending_private_value') == 700 for r in records)
    outcomes[error.__name__] = {'failure_after_real_open_update': True, 'cleanup': cleanup}
module.emit = original_emit
outcomes['source_sha256'] = hashlib.sha256((course/'lab/crash.py').read_bytes()).hexdigest()
(course/'validation/batch-six-crash-cleanup.json').write_text(json.dumps(outcomes, indent=2)+'\n')
print(json.dumps(outcomes, indent=2))
