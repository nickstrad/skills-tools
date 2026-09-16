CREATE OR REPLACE TEMP TABLE runs AS
SELECT * FROM read_json('LAB_PATH/runs.jsonl', format='newline_delimited');
SELECT run_id, len(events) AS event_count FROM runs ORDER BY run_id;
-- Replace the list projection with unnest(events); keep run_id beside it.
CREATE OR REPLACE TEMP TABLE expanded AS
SELECT run_id, events AS event FROM runs;
SELECT * FROM expanded ORDER BY run_id;
-- After expanding, add a SELECT of run_id, event.event_id, event.tool,
-- event.duration_ms, ordered by run_id and event.event_id.
SELECT count(*) AS output_rows FROM expanded;
