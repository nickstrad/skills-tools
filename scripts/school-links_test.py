#!/usr/bin/env python3
"""Verify installation preflight and copy preservation using disposable destinations."""

import importlib.util
import io
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("school_links", Path(__file__).with_name("school-links.py"))
school = importlib.util.module_from_spec(spec)
spec.loader.exec_module(school)


class SchoolLinksTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="school-links-test-")
        self.root = Path(self.temp.name)
        self.args = [
            "--bin-dir", str(self.root / "bin"),
            "--codex-skills", str(self.root / "codex"),
            "--claude-skills", str(self.root / "claude"),
        ]

    def tearDown(self):
        self.temp.cleanup()

    def run_links(self, flag):
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return school.main([flag, *self.args])

    def test_read_only_check_then_idempotent_install(self):
        self.assertEqual(self.run_links("--check"), 1)
        self.assertEqual(list(self.root.iterdir()), [])
        self.assertEqual(self.run_links("--install"), 0)
        self.assertEqual(self.run_links("--check"), 0)
        self.assertEqual(self.run_links("--install"), 0)
        for name in ("tutor", "pgcoach", "systemscoach"):
            self.assertTrue((self.root / "bin" / name).is_symlink())
        self.assertFalse((self.root / "bin/pgtutor").exists())

    def test_conflict_preflight_preserves_all_destinations(self):
        conflict = self.root / "claude/systemscoach"
        conflict.mkdir(parents=True)
        (conflict / "SKILL.md").write_text("learner-owned custom skill")
        self.assertEqual(self.run_links("--install"), 2)
        self.assertFalse((self.root / "bin").exists())
        self.assertEqual((conflict / "SKILL.md").read_text(), "learner-owned custom skill")

    def test_identical_copy_is_linked_and_obsolete_launcher_is_retired(self):
        copy = self.root / "codex/grpc-tutor"
        shutil.copytree(school.ROOT / school.SKILLS["grpc-tutor"], copy)
        legacy = self.root / "bin/pgtutor"
        legacy.parent.mkdir()
        legacy.symlink_to(school.OLD_PGTUTOR)
        self.assertEqual(self.run_links("--install"), 0)
        self.assertTrue(copy.is_symlink())
        self.assertFalse(legacy.is_symlink())
        self.assertEqual(list(copy.parent.glob(".grpc-tutor-link-*")), [])
        self.assertEqual(self.run_links("--check"), 0)

    def test_extra_files_and_unrelated_symlinks_are_preserved(self):
        copy = self.root / "codex/grpc-tutor"
        shutil.copytree(school.ROOT / school.SKILLS["grpc-tutor"], copy)
        (copy / "custom.txt").write_text("keep")
        self.assertEqual(self.run_links("--install"), 2)
        self.assertTrue((copy / "custom.txt").exists())
        target = self.root / "unrelated"
        target.symlink_to(self.root / "missing")
        with self.assertRaises(ValueError):
            school.classify(school.ROOT / "bin/tutor", target)
        self.assertTrue(target.is_symlink())


if __name__ == "__main__":
    unittest.main()
