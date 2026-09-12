#!/usr/bin/env python3
"""Check or install this checkout's launchers and canonical skills for both agents."""

import argparse
from pathlib import Path
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SKILLS = {
    "curriculum-author": "curriculum-tools/skills/curriculum-author",
    "postgres-tutor": "curriculum-tools/courses/postgres/skill/postgres-tutor",
    "sqlite-tutor": "curriculum-tools/courses/sqlite/skill/sqlite-tutor",
    "linux-tutor": "curriculum-tools/courses/linux/skill/linux-tutor",
    "grpc-tutor": "curriculum-tools/courses/grpc/skill/grpc-tutor",
    "systemscoach": "systems-projects/skills/systemscoach",
}
COMMANDS = {
    "tutor": "bin/tutor",
    "pgcoach": "bin/pgcoach",
    "systemscoach": "systems-projects/bin/systemscoach",
}
OLD_PGTUTOR = Path("/root/tools/pg-systems-tutor/bin/pgtutor")


def inventory(root):
    """Compare every entry without following symlinks or discarding extra files."""
    result = {}
    for item in root.iterdir():
        if item.is_symlink():
            result[item.name] = ("link", str(item.readlink()))
        elif item.is_dir():
            result[item.name] = ("dir", inventory(item))
        elif item.is_file():
            result[item.name] = ("file", item.read_bytes(), item.stat().st_mode & 0o777)
        else:
            raise ValueError(f"Unsupported entry: {item}")
    return result


def classify(source, target):
    if not source.exists():
        raise ValueError(f"Missing repository source: {source}")
    if target.is_symlink():
        if target.resolve() == source.resolve():
            return "ok"
        raise ValueError(f"Unrelated symlink: {target} -> {target.readlink()}")
    if not target.exists():
        return "create"
    if target.is_dir() and source.is_dir() and inventory(target) == inventory(source):
        return "replace identical copy"
    raise ValueError(f"Refusing to overwrite differing path: {target}")


def install_link(source, target, action):
    # Recheck immediately before mutating; a concurrent edit must not be silently removed.
    if classify(source, target) != action:
        raise ValueError(f"Destination changed during installation: {target}")
    if action == "ok":
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    if action == "replace identical copy":
        backup_root = Path(tempfile.mkdtemp(prefix=f".{target.name}-link-", dir=target.parent))
        backup = backup_root / target.name
        target.rename(backup)
        try:
            target.symlink_to(source, target_is_directory=True)
        except BaseException:
            backup.rename(target)
            backup_root.rmdir()
            raise
        # The source already contains every verified byte. No duplicate backup is needed.
        shutil.rmtree(backup_root)
    else:
        target.symlink_to(source, target_is_directory=source.is_dir())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="read-only audit (default)")
    mode.add_argument("--install", action="store_true", help="create or synchronize known links")
    parser.add_argument("--bin-dir", type=Path, default=Path("/usr/local/bin"))
    parser.add_argument("--codex-skills", type=Path, default=Path.home() / ".codex/skills")
    parser.add_argument("--claude-skills", type=Path, default=Path.home() / ".claude/skills")
    args = parser.parse_args(argv)
    pairs = [(ROOT / rel, args.bin_dir / name) for name, rel in COMMANDS.items()]
    for directory in (args.codex_skills, args.claude_skills):
        pairs.extend((ROOT / rel, directory / name) for name, rel in SKILLS.items())
    # Preflight all destinations before any mutation, including conflicts in the last skill.
    pending = []
    try:
        retired = args.bin_dir / "pgtutor"
        remove_retired = retired.is_symlink() and retired.readlink() == OLD_PGTUTOR
        if remove_retired:
            print(f"remove obsolete link: {retired}")
        elif retired.exists() or retired.is_symlink():
            print(f"leave unrelated retired command: {retired}")
        for source, target in pairs:
            action = classify(source, target)
            pending.append((source, target, action))
            print(f"{action}: {target}")
        if args.install:
            for source, target, action in pending:
                install_link(source, target, action)
            if remove_retired:
                if not retired.is_symlink() or retired.readlink() != OLD_PGTUTOR:
                    raise ValueError(f"Retired launcher changed during installation: {retired}")
                retired.unlink()  # Remove only the launcher, never the referenced course or data.
            print("All school links point to this checkout.")
            return 0
        return int(remove_retired or any(action != "ok" for _, _, action in pending))
    except (OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
