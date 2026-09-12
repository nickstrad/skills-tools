#!/usr/bin/env python3
"""Author acceptance: real tutor harness, learning outcomes, isolated progress, cleanup."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

COURSE = Path(__file__).resolve().parent.parent
TUTOR = COURSE.parent.parent
DENO = os.environ.get("DENO_BIN", "/root/.deno/bin/deno")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def progress_hashes():
    return {str(p): digest(p) for p in TUTOR.glob("courses/*/progress.sqlite")}


def run(args, env):
    result = subprocess.run(args, cwd=TUTOR, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)
    if result.returncode:
        raise RuntimeError(result.stdout)
    return result.stdout


def verify(number, output):
    required = {
        1: ["08 96 01 12 02 68 69", "count: 150", "13: 105", "total: 150"],
        2: ["Absent and implicit zero have identical bytes.", "18 00", "limit: 0"],
        3: ['2: "new"', "3: 0", 'label: "new"', "uses reserved number 2", "Exit status: 1"],
        4: ["type AddRequest", "type CounterClient", "type CounterServer",
            "server does not support the reflection API", "no known field named increment"],
        5: ["Code: InvalidArgument", '"caller": "terminal"', '"caller": "anonymous"',
            "Response headers received:", "Code: Unavailable"],
        6: ["Code: DeadlineExceeded", '"deduplicated": true', "Code: AlreadyExists",
            'request_id="job-42" duplicate=true'],
    }[number]
    for text in required:
        assert text in output, (number, "missing", text, output)
    if number == 2:
        for size, name in [(0, "absent"), (0, "implicit"), (2, "optional")]:
            assert re.search(rf"\[A\] {size} .*?/{name}\.bin", output), output
    if number in (4, 5, 6):
        observed = [int(v) for v in re.findall(r'"value": (\d+)', output)]
        assert observed == {4: [2, 3, 4], 5: [2, 2], 6: [1, 2, 2, 1, 1, 1]}[number], observed
    if number == 5:
        assert re.findall(r'"sequence": (\d+)', output) == ["1", "2", "3", "1", "2"]
    if number == 6:
        assert output.count("Code: DeadlineExceeded") == 2
    assert "!! step" not in output


def main():
    before = progress_hashes()
    with tempfile.TemporaryDirectory(prefix="grpc-course-validation.") as work:
        env = dict(os.environ, GRPC_SCRATCH=work)
        command = [DENO, "run", "-A", "tools/validate.ts", "grpc"]
        whole = run(command, env)
        sections = re.split(r"(?m)^=== #(\d+) .*? ===\n", whole)
        for index in range(1, len(sections), 2):
            verify(int(sections[index]), sections[index + 1])
        assert "6/6 lessons completed without timeout" in whole
        assert not list(Path(work).glob("grpc-practice.*")), "whole-run scratch leaked"
        for number in range(1, 7):
            output = run(command + [str(number)], env)
            verify(number, output)
            assert "1/1 lessons completed without timeout" in output
            assert not list(Path(work).glob("grpc-practice.*")), "isolated scratch leaked"
            print(f"Lesson {number}: whole-course and isolated evidence passed", flush=True)
        db = str(Path(work) / "progress.sqlite")
        cli = [str(TUTOR / "bin/tutor"), "grpc"]
        run(cli + ["init", "--db", db], env)
        modules = run(cli + ["modules", "--db", db], env)
        assert "protobuf" in modules and "grpc" in modules, modules
        for number in range(1, 7):
            rendered = run(cli + ["pretty", str(number), "--db", db], env)
            assert "Expected" in rendered and "source /root/Software" in rendered
        status = run(cli + ["status", "--json", "--db", db], env)
        run(cli + ["search", "stream", "--db", db], env)
        for proc in Path("/proc").glob("[0-9]*/cmdline"):
            try:
                argv = proc.read_bytes().split(b"\0")
            except (OSError, ProcessLookupError):
                continue
            assert argv[0] != str(COURSE / "lab/bin/counter").encode(), "counter process leaked"
        assert progress_hashes() == before, "existing progress changed"
        evidence = COURSE / "validation"
        evidence.mkdir(exist_ok=True)
        (evidence / "accepted-output.txt").write_text(whole)
        tracked_inputs = list((COURSE / "curriculum").glob("*.ts"))
        tracked_inputs += [COURSE / "course.json", COURSE / "lessons.json"]
        tracked_inputs += [p for p in (COURSE / "lab").rglob("*") if p.is_file()
                           and not {"bin", "generated", "__pycache__"}.intersection(p.relative_to(COURSE / "lab").parts)]
        report = {"whole_course": "6/6", "isolated": "6/6", "minutes": 65,
                  "existing_progress_unchanged": before, "isolated_status": json.loads(status),
                  "scratch_removed": True, "owned_servers_remaining": 0,
                  "sources_sha256": {str(p.relative_to(COURSE)): digest(p) for p in sorted(tracked_inputs)}}
        (evidence / "acceptance.json").write_text(json.dumps(report, indent=2) + "\n")
    print("CLI smoke passed; existing progress unchanged; owned labs and servers cleaned.")


if __name__ == "__main__":
    main()
