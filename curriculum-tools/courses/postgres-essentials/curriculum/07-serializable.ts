import { code, type Module } from "../../../src/types.ts";

export const SERIALIZABLE_VISUAL = `Serializable: same overlap, different outcome

A: read 2 -- update Alice off ------------------------> COMMIT succeeds
B: read 2 -------- update Bob off --------------------> COMMIT fails 40001
                   disjoint row                          final count 1

PostgreSQL rejects one participant because both decisions cannot fit any serial order.`;

export const SERIALIZABLE: Module = {
  category: "concurrency-control",
  title: "Use Serializable for a cross-row invariant",
  lessons: [
    {
      slug: "serializable-protects-invariant",
      title: "Make the conflicting decision fail under Serializable",
      difficulty: "intermediate",
      tags: ["isolation", "serializable", "concurrency-control"],
      prerequisites: ["multi-row-write-skew"],
      estimatedMinutes: 25,
      sessions: 2,
      safetyLevel: "ddl",
      runIn: "tool",
      revision: 1,
      overview:
        "Repeat the same on-call schedule at Serializable: both transactions read two doctors and update different rows before A commits. PostgreSQL detects that the two decisions cannot both belong to any serial execution, so B's COMMIT returns SQLSTATE 40001 and the final rule remains true.",
      reading: 'PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Serializable")',
      readingNotes:
        "Optional after the experiment: the section explains PostgreSQL Serializable Snapshot Isolation and serialization anomalies. This controlled schedule makes its application consequence concrete; full-transaction retry behavior is added in the next lesson.",
      caution:
        "The 40001 is deliberate only at B's final COMMIT in this supplied schedule. Run both reads and both disjoint updates before A COMMIT, then immediately run B COMMIT. If any other statement errors, ROLLBACK both sessions and restart from setup.",
      syntaxBreakdown: code`
### In plain terms
Serializable asks PostgreSQL to allow only outcomes equivalent to transactions running one at a
time. The transactions may still overlap physically. When their observed facts and writes form an
impossible serial order, PostgreSQL aborts one participant instead of publishing a broken rule.

Before running, predict which evidence changes from the Repeatable Read experiment: the two reads,
the two UPDATE results, a COMMIT outcome, or the final row count.

### What you are learning
- Serializable can detect a dependency through reads of a shared set even when transactions write
  different rows and never wait on the same row lock.
- SQLSTATE 40001 means the transaction's result was not committed. If policy chooses to retry, the
  retry starts at a fresh BEGIN and repeats its reads, decision, writes, and COMMIT.
- This schedule makes B the victim at COMMIT, but applications must not assume a fixed victim or
  error location for every concurrent schedule.

### Piece by piece
- **SET default_transaction_isolation = 'serializable'** makes each later BEGIN use Serializable.
  PostgreSQL tracks read-write dependencies while still giving each transaction a stable snapshot.
- **SELECT count(*) FILTER (WHERE on_call)** and **count(*) > 1** measure the same rule as the prior
  lesson. **\gset** stores the labelled count and boolean in psql variables, and **\if / \endif** executes the
  supplied write only when the snapshot says leaving is valid.
- **UPDATE ... Alice / Bob** changes disjoint rows. The immediate **\echo ... :ROW_COUNT**
  captures one changed row for each write. These writes are still provisional: the serialization
  failure is raised when B later tries to commit.
- **\set VERBOSITY sqlstate** tells psql to print only the five-character SQLSTATE for the deliberate
  error. **COMMIT** is itself part of the operation that can fail. **\echo ... :SQLSTATE** runs
  immediately afterward, before another SQL command can replace psql's SQLSTATE variable.
- **40001** is the standard serialization-failure code. It proves B did not commit; it does not say
  the SQL syntax was invalid or that PostgreSQL lost B's update.
- **ROLLBACK** explicitly leaves B ready for later work if its client still has transaction state.
  PostgreSQL has already ended this failed commit, so psql may report that no transaction is in
  progress; that warning is harmless. **\set VERBOSITY default** restores normal error detail.
- **RESET default_transaction_isolation** restores each session's configured default. The final
  SELECT uses A after its successful commit and proves one doctor remains before DROP TABLE removes
  the fixture.
`,
      setup: code`
set default_transaction_isolation = 'serializable';
drop table if exists pe_on_call_serial;
create table pe_on_call_serial (
  doctor text primary key,
  on_call boolean not null
);
insert into pe_on_call_serial values ('Alice', true), ('Bob', true);`,
      code: code`
-- Session A: begin and decide from a Serializable snapshot containing both doctors.
begin;
select count(*) filter (where on_call) as count,
       count(*) filter (where on_call) > 1 as can_leave
from pe_on_call_serial
\gset a_
\echo A read :a_count doctors; can Alice leave? :a_can_leave

-- Session B: establish its snapshot before either transaction writes.
set default_transaction_isolation = 'serializable';
begin;
select count(*) filter (where on_call) as count,
       count(*) filter (where on_call) > 1 as can_leave
from pe_on_call_serial
\gset b_
\echo B read :b_count doctors; can Bob leave? :b_can_leave

-- Session A: make A's disjoint write but keep A open.
\if :a_can_leave
update pe_on_call_serial set on_call = false where doctor = 'Alice';
\echo A UPDATE ROW_COUNT :ROW_COUNT
\endif

-- Session B: make B's disjoint write before A commits.
\if :b_can_leave
update pe_on_call_serial set on_call = false where doctor = 'Bob';
\echo B UPDATE ROW_COUNT :ROW_COUNT
\endif

-- Session A: commit first; this supplied schedule makes A the survivor.
commit;
\echo A COMMIT SQLSTATE :SQLSTATE

-- Session B: capture the deliberate serialization failure before SQLSTATE changes.
\set VERBOSITY sqlstate
commit;
\echo B COMMIT SQLSTATE :SQLSTATE
rollback;
\set VERBOSITY default
reset default_transaction_isolation;

-- Session A: observe the surviving row and invariant, then clean up.
select doctor, on_call from pe_on_call_serial order by doctor;
select count(*) filter (where on_call) as serializable_final_on_call from pe_on_call_serial;
reset default_transaction_isolation;
drop table pe_on_call_serial;`,
      expectedResult: code`
Both read echoes report a count of 2 and can_leave = t. Both immediate UPDATE row-count echoes print
1. A's immediate COMMIT echo prints SQLSTATE 00000. B's COMMIT then prints ERROR: 40001, and its immediate labelled echo prints
“B COMMIT SQLSTATE 40001”. B's attempted change was rolled back.

The final rows show Alice = f and Bob = t, with serializable_final_on_call = 1. The supplied ordering determines
that observed victim and error point. In other valid Serializable schedules PostgreSQL can abort a
different participant, and a serialization failure can surface during a statement or at COMMIT;
client code must treat either as an aborted transaction. If its policy retries, it retries the
complete transaction from a fresh BEGIN.

B's explicit ROLLBACK may print a warning that no transaction is in progress because the failed
COMMIT already ended it. No other ERROR is expected. The table is dropped after the observation.
`,
      systemsLens:
        "Serializable rejects executions whose dependency graph cannot be ordered as a serial history. It protects this rule because every participant checks the rule inside a Serializable transaction and the rule holds in each serial execution; it does not magically enforce arbitrary business invariants or constrain writers that bypass the protocol. Detection replaces a silent anomaly with an explicit abort. Policy may decline, surface, or retry it; a chosen retry starts the whole transaction again so fresh reads can change the action, and must account for work outside the database separately.",
      challenge: code`
Run a serial schedule where no abort is necessary. Recreate pe_on_call_serial with Alice and Bob on
call by running this complete block in Session A:

    -- Session A
    set default_transaction_isolation = 'serializable';
    drop table if exists pe_on_call_serial;
    create table pe_on_call_serial (doctor text primary key, on_call boolean not null);
    insert into pe_on_call_serial values ('Alice', true), ('Bob', true);
    begin;
    select count(*) filter (where on_call) as count,
           count(*) filter (where on_call) > 1 as can_leave
    from pe_on_call_serial
    \gset a_serial_
    \echo A read :a_serial_count doctors; can Alice leave? :a_serial_can_leave
    \if :a_serial_can_leave
    update pe_on_call_serial set on_call = false where doctor = 'Alice';
    \endif
    commit;

Only after A finishes, run this complete transaction in Session B:

    -- Session B
    set default_transaction_isolation = 'serializable';
    begin;
    select count(*) filter (where on_call) as count,
           count(*) filter (where on_call) > 1 as can_leave
    from pe_on_call_serial
    \gset b_serial_
    \echo B read :b_serial_count doctors; can Bob leave? :b_serial_can_leave
    \if :b_serial_can_leave
    update pe_on_call_serial set on_call = false where doctor = 'Bob';
    \endif
    commit;
    select count(*) filter (where on_call) as serializable_serial_final_on_call
    from pe_on_call_serial;
    reset default_transaction_isolation;

    -- Session A: clean up after B has observed the result.
    reset default_transaction_isolation;
    drop table pe_on_call_serial;

B should read 1, print f, decline the update, and commit normally. The final count stays 1 with no
40001. The final Session A commands restore its default and drop the fixture.
`,
    },
  ],
};
