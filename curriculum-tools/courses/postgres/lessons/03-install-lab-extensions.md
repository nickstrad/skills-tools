# Install the introspection extensions the experiments use

slug: install-lab-extensions
category: lab-setup
difficulty: beginner
tags: lab, extensions
prerequisites: shell-and-psql-toolkit
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 5
revision: 2

## Overview
Contrib extensions expose internals that the core catalog hides: raw pages, the buffer cache,
tuple-level bloat, the visibility map, WAL records, and query statistics.

## Syntax breakdown
### In plain terms

PostgreSQL keeps useful internals behind optional packages called extensions. This lesson enables
the small inspection tools used later, then compares what is installed with what the server can
provide. Extensions are installed in the current database, so running this in lab does not make
the functions automatically available in another database.

### What you are learning

- An extension is a packaged set of SQL objects and, sometimes, server code that adds a capability
  without changing the core server.
- Inspection depth: page, tuple, cache, vacuum, WAL, and query-statistics extensions expose
  different layers of the same database.
- Availability versus installation: pg_available_extensions describes files on the server, while
  \\dx shows what this database has enabled.

### Piece by piece

- **CREATE EXTENSION IF NOT EXISTS NAME** (DDL statement)
  - What it is: an SQL command that runs an extension's install script in the current database.
  - What it does here: creates each named extension only if it is not already installed, so the
    setup can be rerun safely. pageinspect reads pages and tuples; pg_buffercache reads shared
    buffers; pgstattuple measures live and dead tuple space; pg_visibility inspects visibility;
    pg_walinspect reads WAL; pg_freespacemap reads free-space data; pg_prewarm warms cache
    pages; pgrowlocks inspects row locks; amcheck checks index structure; pg_stat_statements
    aggregates query statistics; dblink and postgres_fdw provide connection/foreign-table
    helpers.
  - What it gives us: functions and views for later experiments. pg_stat_statements additionally
    needs the lab's shared_preload_libraries setting at server start; the setup already configured
    that requirement.
- **\\dx** (psql extension-list command)
  - What it is: a psql command that asks the server for extensions installed in this database.
  - What it does here: lists the twelve requested extensions plus the built-in plpgsql language.
  - What it gives us: the installed name and version; absence means later functions from that
    extension will not resolve.
- **pg_available_extensions** (system view)
  - What it is: a view of extension control files available to the server installation.
  - What it does here: filters to four names and orders them alphabetically.
  - What it gives us: name identifies the package and installed is true when installed_version is
    not null. test_decoding should be available but false because it is an output plugin for logical
    decoding, not an extension installed with CREATE EXTENSION.

## Run
```sql
create extension if not exists pageinspect;
create extension if not exists pg_buffercache;
create extension if not exists pgstattuple;
create extension if not exists pg_visibility;
create extension if not exists pg_walinspect;
create extension if not exists pg_freespacemap;
create extension if not exists pg_prewarm;
create extension if not exists pgrowlocks;
create extension if not exists amcheck;
create extension if not exists pg_stat_statements;
create extension if not exists dblink;
create extension if not exists postgres_fdw;
\dx
select name, installed_version is not null as installed
from pg_available_extensions
where name in ('pageinspect','pg_walinspect','test_decoding','pg_stat_statements')
order by name;
```

## Expected result
\dx lists twelve extensions plus plpgsql. test_decoding shows installed = false: it is an output
plugin used by replication slots, not something you CREATE EXTENSION.

## Systems lens
These are the equivalent of debug endpoints and heap dumps for a storage engine. The course
prefers looking at the real bytes (pages, WAL records) over trusting summaries, because the
summaries are what you already get from monitoring.
