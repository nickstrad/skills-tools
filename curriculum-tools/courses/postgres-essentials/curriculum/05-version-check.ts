import { code, type Module } from "../../../src/types.ts";

export const VERSION_CHECK_VISUAL = `Both editors read the same saved revision

                 version 1, body "Draft"
                    /                 \\
A reads v1 ------------------------- B reads v1
   |                                  |
   | UPDATE ... WHERE version = 1     | UPDATE ... WHERE version = 1
   | rows = 1; saved version becomes 2| rows = 0; stale edit rejected
   v                                  v
"A: corrected title", version 2    reread A's version 2 and reconsider B's edit
                                      |
                                      | merge A's text + reviewed B addition
                                      | UPDATE ... WHERE version = 2
                                      v
                 "A: corrected title + B: reviewed note", version 3

Zero rows is the conflict signal. The stale body is never blindly written.`;

export const VERSION_CHECK: Module = {
  category: "concurrency-control",
  title: "Reject stale edits before reconsidering them",
  lessons: [
    {
      slug: "reject-stale-edit",
      title: "Reject a stale edit with a version check",
      difficulty: "intermediate",
      tags: ["isolation", "optimistic-concurrency", "conflict-detection"],
      prerequisites: ["row-lock-protects-decision"],
      estimatedMinutes: 25,
      sessions: 2,
      safetyLevel: "ddl",
      runIn: "tool",
      revision: 1,
      overview:
        "Let two editors read version 1 of the same document without holding a transaction open. A saves first. B then tries to save from the stale version, detects the conflict from an affected-row count of zero, rereads A's work, and makes a supplied merge decision before saving version 3.",
      reading: 'PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Read Committed")',
      readingNotes:
        "Optional after the experiment: Chapter 2 explains the Read Committed statement views and update coordination beneath these commands. The version column, affected-row check, and merge decision are an application protocol layered on that behavior rather than a PostgreSQL isolation level.",
      syntaxBreakdown: code`
### In plain terms
A version check is optimistic conflict detection: editors work without holding a database lock
while a person reviews text, then prove at save time that the row is still the revision they read.
Before running, predict what B's conditional UPDATE will report after A has advanced version 1 to
version 2.

Zero affected rows is a normal application conflict signal here, not a PostgreSQL transaction
error. B must reread the current body and reconsider its intended change. Merely replacing B's old
version token with the new one would let B overwrite a change it has never reviewed.

### What you are learning
- A version column turns the revision an editor read into a precondition on its later write. Every
  cooperating writer must advance the token, or another writer cannot detect that intervening
  change.
- ROW_COUNT distinguishes the writer that matched and changed one row from a stale writer that
  matched none. Zero can also mean the row was deleted, so the application must reread to classify
  what happened.
- Conflict detection does not decide how to resolve a conflict. After rereading, a person or the
  application's domain logic may merge, replace, or abandon the proposed change.

### Piece by piece
- **SET default_transaction_isolation = 'read committed'** gives both sessions the known isolation
  level used by the experiment. Each standalone statement sees committed data as of that statement.
- **\gset a_ / \gset b_** are psql commands that store the preceding query's one-row result in
  client-side variables. The prefixes create distinct names such as **:a_version**, **:b_version**,
  and **:b_body**, so the two editors' original reads remain distinguishable.
- **:'a_version' / :'b_version'** ask psql to substitute a stored variable as a safely quoted SQL
  literal. Here each original token is 1; the colon substitution happens in psql before PostgreSQL
  receives the UPDATE.
- **WHERE id = 1 AND version = ...** makes the saved revision part of the write's condition. A
  matches version 1 and advances it. B's later statement still expects 1, so it matches no row after
  A commits. UPDATEs still acquire row locks and wait behind concurrent writers when necessary;
  the version predicate decides whether the row still qualifies after that coordination.
- **version = version + 1** advances the token in the same statement as the body change. This
  convention must be used by every writer that participates in the protocol.
- **\echo a_save_rows=:ROW_COUNT / \echo b_stale_save_rows=:ROW_COUNT** print psql's status value
  immediately after each UPDATE. Expect 1 for A and 0 for stale B. Another SQL command would replace
  ROW_COUNT, which is why each label follows its UPDATE directly.
- **\gset b_current_** saves B's fresh reread as **:b_current_body** and
  **:b_current_version**. The next SELECT prints these captured variables so the evidence and
  the supplied merge use the same reviewed body and token.
- **:'b_current_body' || ' + B: reviewed note'** preserves the body B just reread and appends only
  the reviewed addition. Its conditional UPDATE expects the fresh version 2 and advances it to 3.
- **\set original_version 1** in the optional variation creates a psql variable containing the
  original stale token. **:original_version** substitutes its numeric value so the repeated
  conditional UPDATE proves that the old token still cannot match version 3.
- **DROP TABLE pe_edit** removes the lesson fixture after both sessions have finished. No
  transaction remains open while either editor reviews text.
`,
      setup: code`
set default_transaction_isolation = 'read committed';
drop table if exists pe_edit;
create table pe_edit (
  id int primary key,
  body text not null,
  version bigint not null
);
insert into pe_edit values (1, 'Draft', 1);`,
      code: code`
-- Session A: read the document into A's psql variables. This statement finishes immediately.
select body, version from pe_edit where id = 1 \gset a_
select :'a_body' as a_original_body, :a_version as a_original_version;

-- Session B: independently read the same revision into B's psql variables.
set default_transaction_isolation = 'read committed';
select body, version from pe_edit where id = 1 \gset b_
select :'b_body' as b_original_body, :b_version as b_original_version;

-- Session A: save only if version 1 is still current, and advance the token with the edit.
update pe_edit
set body = 'A: corrected title', version = version + 1
where id = 1 and version = :'a_version';
\echo a_save_rows=:ROW_COUNT

-- Session B: submit B's edit with its original token. Do not refresh only the token.
update pe_edit
set body = 'B: standalone rewrite', version = version + 1
where id = 1 and version = :'b_version';
\echo b_stale_save_rows=:ROW_COUNT

-- Session B: zero rows means reread before deciding whether and how to save.
select body, version from pe_edit where id = 1 \gset b_current_
select :'b_current_body' as b_current_body, :b_current_version as b_current_version;
select 'preserve the current body and append the reviewed B note' as b_merge_decision;

-- Session B: save that explicit merge only if the revision just reviewed is still current.
update pe_edit
set body = :'b_current_body' || ' + B: reviewed note',
    version = version + 1
where id = 1 and version = :'b_current_version';
\echo b_merged_save_rows=:ROW_COUNT

-- Session A: inspect the shared final result, then remove the fixture.
select body as final_body, version as final_version from pe_edit where id = 1;
drop table pe_edit;`,
      expectedResult: code`
Both original reads report body = Draft and version = 1. A prints a_save_rows=1. B's first save is
a valid SQL statement, but it prints b_stale_save_rows=0 because version 1 is no longer current;
there is no SQLSTATE 40001 and B: standalone rewrite is never stored.

B's reread reports b_current_body = A: corrected title and b_current_version = 2. After the supplied
merge decision, B prints b_merged_save_rows=1. The final row is exactly
“A: corrected title + B: reviewed note” at final_version = 3. Both editors did their review outside
an open transaction, and the final command drops pe_edit.
`,
      systemsLens:
        "Optimistic concurrency lets work proceed without holding a lock across human or remote think time, then rejects a save whose assumptions are stale. The token is a compact statement of what revision the decision used, much like an HTTP entity tag or compare-and-swap value. PostgreSQL still locks rows while each UPDATE executes; optimistic describes the application protocol, not an absence of database locking. A zero-row result is evidence that the expected row revision did not exist, which can mean an intervening update or deletion. Resolution therefore begins with a fresh read and a fresh domain decision.",
      challenge: code`
Optional variation — prove that the original token remains stale even after the successful merge.
Run this in either session after the core cleanup:

    -- Session A
    drop table if exists pe_edit;
    create table pe_edit (id int primary key, body text not null, version bigint not null);
    insert into pe_edit values
      (1, 'A: corrected title + B: reviewed note', 3);
    \set original_version 1
    update pe_edit
    set body = 'stale retry', version = version + 1
    where id = 1 and version = :original_version;
    \echo variation_stale_rows=:ROW_COUNT
    select body as variation_body, version as variation_version from pe_edit where id = 1;
    drop table pe_edit;

Predict the affected-row count first. Expect variation_stale_rows=0 and the preserved version 3
body. A rejected token does not become valid merely because the editor resubmits it.
`,
    },
  ],
};
