#!/usr/bin/env python3
"""Show checkpoint write-back in a disposable PostgreSQL 16 cluster."""
import argparse
import os
import pwd
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from crash import Connection, emit

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--finish", choices=["rollback","commit"], default="rollback")
    args=parser.parse_args()
    if shutil.disk_usage("/tmp").free < 2*1024**3:
        raise RuntimeError("Need at least 2 GiB free before allocating this fixture")
    env={k:v for k,v in os.environ.items() if not k.startswith("PG")}
    bindir=Path(subprocess.check_output(["pg_config","--bindir"],text=True,timeout=10,env=env).strip())
    version=subprocess.check_output([bindir/"postgres","--version"],text=True,timeout=10,env=env).strip()
    if " 16." not in version:
        raise RuntimeError("This experiment requires PostgreSQL 16 server binaries")
    owner=pwd.getpwnam("postgres") if os.geteuid()==0 else pwd.getpwuid(os.geteuid())
    prefix=["runuser","-u",owner.pw_name,"--"] if os.geteuid()==0 else []
    root = Path(tempfile.mkdtemp(prefix="pe-checkpoint-", dir="/tmp"))
    data, sock, log = root / "data", root / "socket", root / "server.log"
    env.update(PGHOST=str(sock),PGPORT="6545",PGUSER="postgres",PGDATABASE="postgres",
               PGCONNECT_TIMEOUT="3",LC_ALL="C")
    clients=[]
    def run(cmd,timeout=30):
        result=subprocess.run(list(map(str,cmd)),env=env,capture_output=True,text=True,timeout=timeout)
        if result.returncode:
            raise RuntimeError((result.stdout + result.stderr).strip())
        return result.stdout.strip()
    def server(name,*args): return run(prefix+[bindir/name,*args])
    def connect():
        c = Connection([str(bindir/"psql"),"-X","-Atq","-v","ON_ERROR_STOP=1"], env)
        clients.append(c)
        c.sql("set statement_timeout='5s'; set lock_timeout='3s';")
        return c
    try:
        sock.mkdir()
        if os.geteuid()==0:
            for path in (root,sock): os.chown(path,owner.pw_uid,owner.pw_gid)
        emit(fixture=str(root),server=version,finish=args.finish)
        server("initdb","-D",data,"-U","postgres","--auth-local=trust","--auth-host=reject","--no-locale")
        with (data/"postgresql.conf").open("a") as f:
            f.write("\nlisten_addresses=''\nport=6545\nunix_socket_directories='"+str(sock)+
                    "'\nshared_buffers='16MB'\nmax_connections=10\nbgwriter_lru_maxpages=0\n"
                    "checkpoint_timeout='1h'\nmax_wal_size='128MB'\nmin_wal_size='32MB'\n"
                    "autovacuum=off\nlogging_collector=off\n")
        server("pg_ctl","-D",data,"-l",log,"-w","-t","15","start")
        observer = connect()
        actual = observer.sql("select current_setting('data_directory');")
        if actual != str(data):
            raise RuntimeError(f"wrong server: {actual}")
        observer.sql("""create extension pg_buffercache;
create table checkpoint_demo(id int primary key,status text not null,payload text not null);
insert into checkpoint_demo select g,'original',repeat(md5(g::text),8) from generate_series(1,12000) g;
checkpoint;""")
        writer=connect()
        own=tuple(map(int,writer.sql("""begin; update checkpoint_demo set status='pending',
payload=repeat('changed-',32); select pg_backend_pid(),count(*),
count(*) filter(where status='pending'),count(*) filter(where payload=repeat('changed-',32))
from checkpoint_demo;""").split("|")))
        pid=own[0]
        visibility="""select count(*),count(*) filter(where status='original'),
count(*) filter(where status='pending') from checkpoint_demo;"""
        dirty="""select count(*) from pg_buffercache b join pg_class c
on pg_relation_filenode(c.oid)=b.relfilenode where c.oid='checkpoint_demo'::regclass
and b.reldatabase=(select oid from pg_database where datname=current_database())
and b.relforknumber=0 and b.isdirty;"""
        outside = tuple(map(int, observer.sql(visibility).split("|")))
        before = int(observer.sql(dirty))
        state=observer.sql(f"select pid||'|'||state from pg_stat_activity where pid={pid};")
        if own[1:]!=(12000,12000,12000) or outside!=(12000,12000,0) or state!=f"{pid}|idle in transaction" or before<=0:
            raise RuntimeError("pre-checkpoint invariants failed")
        emit(phase="before_checkpoint",writer_pid=pid,writer_rows=own[1],writer_pending_rows=own[2],
             observer_rows=outside[0],observer_original_rows=outside[1],relation_dirty_buffers=before,
             writer_state="idle in transaction",data_directory=actual)
        observer.sql("checkpoint;")
        after = int(observer.sql(dirty))
        outside=tuple(map(int,observer.sql(visibility).split("|")))
        own_after=tuple(map(int,writer.sql("""select count(*),count(*) filter(where status='pending'),
count(*) filter(where payload=repeat('changed-',32)) from checkpoint_demo;""").split("|")))
        state=observer.sql(f"select pid||'|'||state from pg_stat_activity where pid={pid};")
        if after>=before or outside!=(12000,12000,0) or own_after!=(12000,12000,12000) or state!=f"{pid}|idle in transaction":
            raise RuntimeError("post-checkpoint invariants failed")
        emit(phase="after_checkpoint",writer_pid=pid,writer_rows=own_after[0],
             writer_pending_rows=own_after[1],observer_rows=outside[0],
             observer_original_rows=outside[1],relation_dirty_buffers=after,
             writer_state="idle in transaction")
        writer.sql(args.finish + ";")
        final = tuple(map(int, observer.sql(visibility).split("|")))
        expected=(12000,0,12000) if args.finish=="commit" else (12000,12000,0)
        if final != expected:
            raise RuntimeError(f"wrong final visibility: {final}")
        emit(phase="final",decision=args.finish,rows=final[0],original_rows=final[1],pending_rows=final[2])
        size=sum(p.stat().st_size for p in root.rglob("*") if p.is_file())
        if size >= 200_000_000:
            raise RuntimeError("fixture exceeded its 200 MB budget")
        emit(fixture_bytes=size,budget_bytes=200_000_000)
    finally:
        old=(signal.signal(signal.SIGINT,signal.SIG_IGN),signal.signal(signal.SIGTERM,signal.SIG_IGN))
        try:
            close_errors = []
            for client in clients:
                try:
                    client.close()
                except Exception as error:
                    close_errors.append(str(error))
            if (data/"postmaster.pid").exists():
                server("pg_ctl","-D",data,"-m","fast","-w","-t","15","stop")
            status = subprocess.run(list(map(str, prefix + [bindir / "pg_ctl", "-D", data, "status"])),
                                    env=env, capture_output=True, text=True, timeout=10)
            if status.returncode not in (3, 4) or (data / "postmaster.pid").exists():
                raise RuntimeError(f"cannot prove server stopped; fixture preserved at {root}")
            shutil.rmtree(root)
            emit(cleanup="owned cluster removed",path=str(root),removed=not root.exists())
            if close_errors:
                raise RuntimeError("client cleanup errors after cluster removal: " + "; ".join(close_errors))
        finally:
            signal.signal(signal.SIGINT, old[0])
            signal.signal(signal.SIGTERM, old[1])

if __name__ == "__main__":
    signal.signal(signal.SIGTERM,lambda _s,_f: (_ for _ in ()).throw(KeyboardInterrupt()))
    try: main()
    except KeyboardInterrupt:
        print("Interrupted; inspect the cleanup record above.", file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        print("STOP: " + str(error), file=sys.stderr)
        sys.exit(1)
