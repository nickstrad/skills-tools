# Turn nested JSON into rows

slug: flatten-json-records
category: Combining, retaining, and configuring data work
difficulty: beginner
tags: duckdb, data-flows
prerequisites: clean-input-types
safety: writes-data
run-in: shell
sessions: 1
min-version: 1.5.5
minutes: 10
revision: 1

## Overview

Each line in this JSON file describes one tool run containing a list of events. A run row is
not an event row: one run can contain several events or none. You will expand the lists while
keeping each event's parent run ID, then select fields from the resulting structured value.

Run r1 has e1/search/40ms and e2/fetch/60ms; r2 has no events; r3 has e1/search/25ms. The event
ID e1 is reused across runs. The output grain must be **one row per (run_id, event_id)** so a
later analysis can distinguish those two events without attaching them to the wrong run.

```text
r1 [e1, e2] -- unnest --> r1 e1
                         r1 e2
r2 []       -- unnest --> no event row
r3 [e1]     -- unnest --> r3 e1
3 run rows               3 event rows (same count, different meaning)
```

## Syntax breakdown

- **source .../session.sh 9** supplies the JSON file and populated **query.sql**. Open the
  printed starter path, edit and save it before executing Run. No live tools or API calls occur.
- **read_json(..., format='newline_delimited')** reads one JSON object per line. **DESCRIBE**
  exposes **run_id VARCHAR** and **events STRUCT(...)[]**: a list of structs. A struct is a
  value with named fields such as event_id, tool and duration_ms.
- **len(events)** counts a run's list elements before expansion. These lengths are the
  independent input evidence against which to reconcile output rows.
- In a SELECT list, **unnest(events)** emits one row per list element. Scalar columns beside
  it, such as run_id, repeat for each emitted element. An empty or NULL list emits no rows.
  For example **SELECT 'demo' AS parent, unnest([10,20]) AS item** emits demo/10 and demo/20.
- **event.event_id**, **event.tool** and **event.duration_ms** access fields of a struct
  aliased as event. They become usable after expansion; the starter's event is still a list.
- **CREATE OR REPLACE TEMP TABLE** keeps an intermediate result in this process. Retain the
  separate runs table to observe runs without events; they are not failures just because this
  particular event-grain output has no row for them.
- **duckdb :memory: -bail -csv < "$DUCK_LAB/query.sql"** runs saved edits in a fresh temporary
  database and closes afterward. **duck_check_source** verifies the file fingerprint;
  **duck_cleanup** removes the lab.

Spend 3–4 minutes replacing **events AS event** with an expansion in query.sql, retaining run_id,
then add a SELECT of the four fields requested in the starter comment. Order by run_id and
event.event_id. Verify identities and per-run counts, not only the total count: both the
unfinished and finished versions happen to return three rows. Your starter is:

```sql
CREATE OR REPLACE TEMP TABLE runs AS
SELECT
  *
FROM
  read_json('LAB_PATH/runs.jsonl', format = 'newline_delimited');

SELECT
  run_id,
  len(events) AS event_count
FROM
  runs
ORDER BY
  run_id;

CREATE OR REPLACE TEMP TABLE expanded AS
SELECT
  run_id,
  events AS event
FROM
  runs;

SELECT
  *
FROM
  expanded
ORDER BY
  run_id;

-- Add the requested field projection after expanding.
SELECT
  count(*) AS output_rows
FROM
  expanded;
```

## Setup
### Setup - script

Choose one. This prints the JSON and inferred nested type for you. Both options create the
same starter without filling in the expansion.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 9
```

### Setup - manual

Print and inspect the file yourself. **-c** runs the SQL and exits; no staging survives this
inspection connection. Run rereads the file in your query's connection.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 9 manual
cat "$DUCK_LAB/runs.jsonl"
duckdb :memory: -bail -csv -c "DESCRIBE SELECT * FROM read_json('$DUCK_LAB/runs.jsonl', format='newline_delimited');"
```

## Run
```bash
duckdb :memory: -bail -csv < "$DUCK_LAB/query.sql"
duck_check_source
```

## Expected result

Input lengths are r1/2, r2/0, r3/1. The completed projection is r1/e1/search/40,
r1/e2/fetch/60, r3/e1/search/25. All three events keep their parent IDs. There is no r2 event
row, and the source hash is OK. Selecting only the first list element would lose r1/e2,
leaving only two actual events. Dropping run_id would make the two e1 rows ambiguous.

Worked answer:
```sql
CREATE OR REPLACE TEMP TABLE runs AS
SELECT
  *
FROM
  read_json('LAB_PATH/runs.jsonl', format = 'newline_delimited');

SELECT
  run_id,
  len(events) AS event_count
FROM
  runs
ORDER BY
  run_id;

CREATE OR REPLACE TEMP TABLE expanded AS
SELECT
  run_id,
  unnest(events) AS event
FROM
  runs;

SELECT
  run_id,
  event.event_id,
  event.tool,
  event.duration_ms
FROM
  expanded
ORDER BY
  run_id,
  event.event_id;

SELECT
  count(*) AS output_rows
FROM
  expanded;
```

Use the actual path already present in query.sql. Reruns rebuild temporary state from the
same unchanged file. Cleanup:
```bash
duck_cleanup
```

## Systems lens

Expansion changes row grain. A total row count alone can hide lost or misattributed events;
parent IDs and list lengths provide stronger evidence. Keep the run-grain input when later
questions need to include runs with no events. This typed, well-formed fixture does not
establish that arbitrary JSON files share a consistent schema.
