\set ON_ERROR_STOP on
\pset pager off
\echo lesson_18_core
set lock_timeout = '3s';
set statement_timeout = '30s';
drop table if exists pe_index_crossover;
create table pe_index_crossover (id int not null, payload text not null) with (autovacuum_enabled = false);
insert into pe_index_crossover select g, repeat('x', 500) from generate_series(1, 100000) g;
create index pe_index_crossover_id_idx on pe_index_crossover (id);
analyze pe_index_crossover;
set random_page_cost = 4;
set seq_page_cost = 1;
set effective_cache_size = '128MB';
\echo phase_narrow_range
explain (analyze, buffers, timing off) select payload from pe_index_crossover where id between 50000 and 50009;
\echo phase_broad_range
explain (analyze, buffers, timing off) select payload from pe_index_crossover where id <= 95000;
drop table pe_index_crossover;
reset random_page_cost;
reset seq_page_cost;
reset effective_cache_size;
reset lock_timeout;
reset statement_timeout;

\echo lesson_18_variation
set lock_timeout = '3s';
set statement_timeout = '30s';
drop table if exists pe_index_crossover;
create table pe_index_crossover (id int not null, payload text not null) with (autovacuum_enabled = false);
insert into pe_index_crossover select g, repeat('x', 500) from generate_series(1, 100000) g;
create index pe_index_crossover_id_idx on pe_index_crossover (id);
analyze pe_index_crossover;
set random_page_cost = 4;
set seq_page_cost = 1;
set effective_cache_size = '128MB';
\echo phase_medium_range
explain (analyze, buffers, timing off) select payload from pe_index_crossover where id <= 20000;
drop table pe_index_crossover;
reset random_page_cost;
reset seq_page_cost;
reset effective_cache_size;
reset lock_timeout;
reset statement_timeout;

\echo lesson_19_core
set lock_timeout = '3s';
set statement_timeout = '30s';
drop table if exists pe_event;
create table pe_event (event_id int primary key, tenant_id int not null, event_time timestamptz not null, payload text not null) with (autovacuum_enabled = false);
insert into pe_event select g, ((g - 1) / 1000) + 1, timestamptz '2026-01-01 00:00:00+00' + g * interval '1 second', repeat('e', 120) from generate_series(1, 100000) g;
analyze pe_event;
create index pe_event_time_tenant_idx on pe_event (event_time, tenant_id);
\echo phase_time_first
explain (analyze, buffers, timing off) select event_id, event_time from pe_event where tenant_id = 1 order by event_time desc limit 10;
drop index pe_event_time_tenant_idx;
create index pe_event_tenant_time_idx on pe_event (tenant_id, event_time);
analyze pe_event;
\echo phase_tenant_first
explain (analyze, buffers, timing off) select event_id, event_time from pe_event where tenant_id = 1 order by event_time desc limit 10;
drop table pe_event;
reset lock_timeout;
reset statement_timeout;

\echo lesson_19_variation
set lock_timeout = '3s';
set statement_timeout = '30s';
drop table if exists pe_event;
create table pe_event (event_id int primary key, tenant_id int not null, event_time timestamptz not null, payload text not null) with (autovacuum_enabled = false);
insert into pe_event select g, ((g - 1) / 1000) + 1, timestamptz '2026-01-01 00:00:00+00' + g * interval '1 second', repeat('e', 120) from generate_series(1, 100000) g;
analyze pe_event;
create index pe_event_time_tenant_idx on pe_event (event_time, tenant_id);
\echo phase_time_first_ascending
explain (analyze, buffers, timing off) select event_id, event_time from pe_event where tenant_id = 100 order by event_time asc limit 10;
drop index pe_event_time_tenant_idx;
create index pe_event_tenant_time_idx on pe_event (tenant_id, event_time);
analyze pe_event;
\echo phase_tenant_first_ascending
explain (analyze, buffers, timing off) select event_id, event_time from pe_event where tenant_id = 100 order by event_time asc limit 10;
drop table pe_event;
reset lock_timeout;
reset statement_timeout;
