CREATE OR REPLACE TABLE priorities AS
SELECT * FROM (VALUES ('alpha', 2), ('beta', NULL), ('gamma', 1)) t(job, priority);
SELECT * FROM priorities ORDER BY job;
