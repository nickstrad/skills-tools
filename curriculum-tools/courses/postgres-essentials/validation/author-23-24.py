#!/usr/bin/env python3
"""Run exact lesson 23–24 source in a disposable PostgreSQL 16 cluster."""

import os
import pwd
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT_PREFIX = "/tmp/pg-essentials-validation-author-23-24-"
PG_BIN = Path("/usr/lib/postgresql/16/bin")
PORT = "6554"


def run(command: list[str], *, env: dict[str, str] | None = None) -> None:
    subprocess.run(command, check=True, env=env, timeout=120)


def main() -> None:
    root = Path(tempfile.mkdtemp(prefix=Path(ROOT_PREFIX).name, dir="/tmp"))
    if not str(root).startswith(ROOT_PREFIX):
        raise RuntimeError(f"refusing unexpected fixture path: {root}")
    data = root / "data"
    socket = root / "socket"
    try:
        data.mkdir()
        socket.mkdir()
        postgres = pwd.getpwnam("postgres")
        for path in (root, data, socket):
            os.chown(path, postgres.pw_uid, postgres.pw_gid)
        run([
            "runuser", "-u", "postgres", "--", str(PG_BIN / "initdb"),
            "-D", str(data), "--no-locale", "--encoding=UTF8", "--auth=trust",
        ])
        run([
            "runuser", "-u", "postgres", "--", str(PG_BIN / "pg_ctl"),
            "-D", str(data), "-l", str(root / "server.log"), "-o",
            f"-k {socket} -p {PORT} -c listen_addresses= -c shared_buffers=16MB -c fsync=on",
            "start",
        ])
        env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
        env.update({
            "PGHOST": str(socket), "PGPORT": PORT,
            "PGUSER": "postgres", "PGDATABASE": "postgres",
        })
        run([
            "/root/.deno/bin/deno", "run", "--allow-env", "--allow-run",
            "courses/postgres-essentials/validation/author-23-24.ts",
        ], env=env)
    finally:
        if (data / "PG_VERSION").exists():
            status = subprocess.run([
                "runuser", "-u", "postgres", "--", str(PG_BIN / "pg_ctl"),
                "-D", str(data), "status",
            ], check=False, timeout=30, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if status.returncode == 0:
                run([
                "runuser", "-u", "postgres", "--", str(PG_BIN / "pg_ctl"),
                "-D", str(data), "stop", "-m", "fast",
                ])
            stopped = subprocess.run([
                "runuser", "-u", "postgres", "--", str(PG_BIN / "pg_ctl"),
                "-D", str(data), "status",
            ], check=False, timeout=30, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if stopped.returncode not in (3, 4) or (data / "postmaster.pid").exists():
                raise RuntimeError(f"cannot prove stopped; refusing to remove fixture: {root}")
        shutil.rmtree(root, ignore_errors=False)
        print(f"cleanup_removed={root}")


if __name__ == "__main__":
    main()
