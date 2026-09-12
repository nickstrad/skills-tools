# Inspect the SQLite build capabilities

slug: inspect-build-capabilities
category: lab-file
difficulty: beginner
tags: sqlite-cli, file-format, observability, fts5
prerequisites: build-sqlite-lab
safety: ddl
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 10
revision: 3

## Overview
Probe the exact SQLite runtime that will execute the course, including dbstat, raw pages, bytecode inspection and FTS5. A version string or installed package name does not establish which optional modules are compiled into this process. Treat missing capabilities as a deployment prerequisite to resolve before the dependent experiment.

## Syntax breakdown
### In plain terms

SQLite is a library that can be built with different optional features. Two programs on the same host may use different SQLite libraries even when they open the same file. We record metadata and actually execute each required feature; a successful inventory query alone is not a capability test.

### What you are learning

- **Runtime evidence:** Test the process that will perform the operation.
- **Build versus file contract:** A compatible file format does not guarantee an identical extension set.
- **Introspection boundary:** Virtual-machine instructions describe execution machinery, not a measured performance profile.

### Piece by piece

- **CREATE TABLE IF NOT EXISTS and INSERT OR REPLACE** establish a harmless named baseline page so this probe works in a fresh isolated lab too.
- **sqlite_version()** returns the linked library version. The course is validated on 3.53.4.
- **pragma_compile_options** lists build flags; **LIKE** filters DBSTAT, DBPAGE, FTS5 and THREADSAFE. **pragma_module_list** lists registered virtual-table modules, which still need real probes.
- **.bail off** keeps the CLI running after a missing-capability error so all diagnostics are visible. It does not convert the error into a passed prerequisite.
- **dbstat** reports B-tree page records; a nonzero count proves that module can inspect this file.
- **CREATE VIRTUAL TABLE temp.dbpage_probe USING sqlite_dbpage** makes a connection-local raw-page interface. **pgno=1 and length(data)** verify a real page, whose byte length must match the database geometry.
- **bytecode('SELECT 1')** invokes the optional bytecode virtual table and returns opcode rows ordered by instruction address. Ordinary EXPLAIN alone would not prove that optional module exists.
- **fts5(body) and MATCH 'capability'** create a temporary full-text table, insert text and require one search result. A substitute LIKE query would bypass the capability being tested.
- **.help backup/recover** checks the CLI command surface, not whether a future backup or salvage will work.
- **sqlite_compileoption_used('ENABLE_DBSTAT_VTAB')** in the challenge compares a named build flag with the successful operation; it complements rather than replaces the probe.

## Setup
```sql
CREATE TABLE IF NOT EXISTS capability_baseline(id INTEGER PRIMARY KEY);
INSERT OR REPLACE INTO capability_baseline VALUES (1);
```

## Run
```sql
.bail off
.headers on
.mode box
SELECT sqlite_version() AS sqlite_version;
SELECT compile_options FROM pragma_compile_options WHERE compile_options LIKE '%DBSTAT%' OR compile_options LIKE '%DBPAGE%' OR compile_options LIKE '%FTS5%' OR compile_options LIKE '%THREADSAFE%' ORDER BY compile_options;
SELECT name FROM pragma_module_list WHERE name IN ('dbstat', 'sqlite_dbpage', 'fts5') ORDER BY name;
SELECT count(*) AS dbstat_probe_rows FROM dbstat;
CREATE VIRTUAL TABLE temp.dbpage_probe USING sqlite_dbpage;
SELECT pgno, length(data) AS page_bytes FROM dbpage_probe WHERE pgno=1;
SELECT opcode FROM bytecode('SELECT 1') ORDER BY addr;
CREATE VIRTUAL TABLE temp.fts_probe USING fts5(body);
INSERT INTO fts_probe(body) VALUES ('capability probe');
SELECT count(*) AS fts_matches FROM fts_probe WHERE fts_probe MATCH 'capability';
.help backup
.help recover
```

## Expected result
The course runtime reports SQLite 3.53.4 or newer, nonzero dbstat rows, raw page 1 with the correct byte length, bytecode opcode rows, and fts_matches=1. Help lists .backup and .recover. A missing module is an unmet prerequisite, not an alternative successful result; use the repository bootstrap's explicit feature configuration before continuing.

## Systems lens
An embedded database becomes part of your application's deployed binary contract. PostgreSQL's client/server version split becomes a different question here: which library and extensions did this process link? Capture that evidence when investigating a bug that appears on only one machine.

## Optional variation
Run SELECT sqlite_compileoption_used('ENABLE_DBSTAT_VTAB'); and compare it with the compile-options list and the real dbstat probe.
