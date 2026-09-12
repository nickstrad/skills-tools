"""Check catalog refresh on a SQLite backup before optionally applying it to the learner catalog."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile

course = Path(__file__).resolve().parents[1]
engine = course.parents[1]
progress = course / 'progress.sqlite'
reference = engine / 'courses/postgres/progress.sqlite'


def history(path):
    with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as db:
        return {name: db.execute(f'SELECT * FROM {name} ORDER BY 1').fetchall()
                for name in ('progress', 'attempts')}


def fingerprints(path):
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (path, Path(str(path)+'-wal')) if p.exists()}


def run(args):
    result = subprocess.run(args, cwd=engine, text=True, capture_output=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout


def inspect(path, available):
    with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as db:
        assert db.execute('SELECT count(*) FROM lessons WHERE active=1').fetchone()[0] == available
    before = history(path)
    hashes = fingerprints(path)
    launcher = str(engine / 'courses/postgres/bin/pgcoach')
    for ordinal in range(1, available+1):
        for stage in ('lesson', 'start', 'review', 'run', 'full', 'syntax'):
            rendered = run([launcher, str(ordinal), stage, '--db', str(path)])
            assert f'# Lesson {ordinal}:' in rendered
            assert '## Expected result' in rendered
            assert '## Systems lens' in rendered
            assert '### Mechanism map' in rendered
    assert history(path) == before, 'Rendering changed history'
    assert fingerprints(path) == hashes, 'Rendering wrote the catalog'
    next_view = run([launcher, '--db', str(path)])
    return next_view.splitlines()[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--report', default='batch-four-progress.json',
                        help='Report basename under the validation directory')
    args = parser.parse_args()
    before = history(progress)
    original_hashes = fingerprints(progress)
    ref_history, ref_hashes = history(reference), fingerprints(reference)
    catalog = json.loads((course/'lessons.json').read_text())
    with tempfile.TemporaryDirectory(prefix='pe-batch-refresh-') as scratch:
        copied = Path(scratch)/'progress.sqlite'
        with sqlite3.connect(f'file:{progress}?mode=ro', uri=True) as source:
            with sqlite3.connect(copied) as target:
                source.backup(target)
        assert history(copied) == before
        run([str(engine/'bin/tutor'), 'postgres-essentials', 'init', '--db', str(copied)])
        assert history(copied) == before, 'Copied refresh changed learner history'
        next_lesson = inspect(copied, len(catalog))
    assert history(progress) == before and fingerprints(progress) == original_hashes
    if args.apply:
        run([str(engine/'bin/tutor'), 'postgres-essentials', 'init'])
        assert history(progress) == before, 'Catalog refresh changed learner history'
        assert inspect(progress, len(catalog)) == next_lesson
    assert history(reference) == ref_history and fingerprints(reference) == ref_hashes
    report = {'available': len(catalog), 'copied_refresh_and_views': 'passed',
              'live_refresh': args.apply, 'logical_history_unchanged': True,
              'copied_history_matches_before': True,
              'copied_history_after_refresh_unchanged': True,
              'progress_rows': len(before['progress']), 'attempt_rows': len(before['attempts']),
              'next_view': next_lesson, 'temporary_copy_removed': not Path(scratch).exists(),
              'reference_history_unchanged': True,
              'reference_fingerprints_unchanged': ref_hashes}
    report_path = Path(args.report)
    if not report_path.is_absolute():
        assert report_path.name == args.report and args.report.endswith('.json')
        report_path = course/'validation'/report_path
    assert report_path.suffix == '.json'
    report_path.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
