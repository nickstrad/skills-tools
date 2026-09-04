import { code, type Draft } from "../../../src/types.ts";

export const OPTIMISTIC_EDIT: Draft = {
  slug: "optimistic-concurrency-with-version-columns",
  title: "Detect a stale edit, then decide how to reapply it",
  revision: 4,
  difficulty: "intermediate",
  safetyLevel: "locking",
  runIn: "tool",
  sessions: 2,
  estimatedMinutes: 20,
  prerequisites: ["lost-update-under-read-committed"],
  tags: ["optimistic-concurrency", "lost-update", "read-committed", "retries"],
  reading: 'PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Read Committed")',
  readingNotes: code`
Chapter 2 explains the predicate recheck after a concurrent update. This experiment applies it to
an application version token and makes the client's conflict decision explicit. The earlier lost-
update lesson supplies the pessimistic comparison; the book does not prescribe document merging.`,
  overview: code`
Two editors read the same document without holding database transactions open while they think.
Each save includes the version it read. A stale save affects zero rows, allowing its caller to
re-read and decide whether to merge, reject or replace the edit. The database detects a conflict;
it cannot choose the application's merge policy.`,
  setup: code`
drop table if exists pat_docs;
create table pat_docs(id int primary key,body text not null,version bigint not null default 1);
insert into pat_docs values(1,'draft',1);`,
  syntaxBreakdown: code`
### In plain terms

A version is a number the application increments on every protected change. Each writer compares
its captured number in the UPDATE predicate. PostgreSQL may wait for a competing update, then
recheck that predicate at READ COMMITTED. Zero rows means the save did not happen. Re-reading is
only the start of recovery: the caller must decide how its edit relates to the new document.

### What you are learning

- Optimistic control avoids holding a transaction across user thinking time, but the short save
  itself can still wait for a row lock.
- A version predicate turns an undetected overwrite into an observable rejected save.
- A fresh read plus an explicit merge policy preserves the winning change in this small example.
- This token protects one row's application version, not a multi-row invariant or external resource.

### Piece by piece

- **version bigint NOT NULL DEFAULT 1** stores an explicit application revision. All protected
  writes must increment it, including administrative writes. Reusing an id after deletion without
  preserving token uniqueness introduces a different identity problem.
- **\gset a_, b_, fresh_** captures the actual body and version each client read. **:'a_body'**
  quotes a psql string as a SQL literal, while **:a_version** substitutes its numeric token.
- **BEGIN/COMMIT** hold A's short save open only to reproduce the race. Both initial reads occurred
  in autocommit mode. No database lock protects the human editing interval.
- **UPDATE ... WHERE id=1 AND version=:token RETURNING** checks the captured version and reports
  the saved row. B's first UPDATE waits, then finds that A advanced the version. An empty result is
  a conflict signal; an application must check it rather than assuming a successful SQL command
  means a document was saved.
- **body concatenation with ||** is the deliberate merge policy for append-only edit markers in
  this fixture. B's second save uses freshly read body/version, preserving A's marker. Real prose
  edits, balance changes or permissions require their own policy, not automatic concatenation.
- **Final equality checks** verify both edit markers and version3. A repeated concurrent save can
  conflict again; a production client needs a bounded policy rather than assuming the next save wins.
`,
  code: code`
-- Session A: read without keeping a transaction open during editing.
select body,version from pat_docs where id=1 \gset a_
-- Session B
select body,version from pat_docs where id=1 \gset b_
-- Session A: capture a controlled in-flight save.
begin;
update pat_docs set body=:'a_body'||' | A edit',version=version+1
where id=1 and version=:a_version returning *;
-- Session B (blocks until A ends the short save transaction)
update pat_docs set body=:'b_body'||' | B edit',version=version+1
where id=1 and version=:b_version returning *;
-- Session A
commit;
-- Session B: zero returned rows was a rejected save. Reread, then apply the chosen merge.
select body,version from pat_docs where id=1;
select body,version from pat_docs where id=1 \gset fresh_
update pat_docs set body=:'fresh_body'||' | B edit',version=version+1
where id=1 and version=:fresh_version returning *;
select body='draft | A edit | B edit' as both_edits,version=3 as three_versions from pat_docs;`,
  expectedResult: code`
Both clients capture draft/version1. A returns draft | A edit/version2. After A commits, B's stale
save returns zero rows with no SQL error. The fresh read contains A's edit, and B's explicit merge
then returns draft | A edit | B edit/version3. Both final booleans are true. If the merge had merely
reused B's old body with a fresh token, the version check would pass while A's change was discarded.`,
  systemsLens: code`
Compare-and-swap separates detecting stale state from deciding what to do about it. This local
example resembles conditional writes and ETags: the condition guards a named version, while the
client owns conflict policy. A retry that blindly replaces content after fetching a new token can
still violate user intent. Optimistic control also does not mean lock-free execution: PostgreSQL's
short UPDATE acquires a row lock even though the human editing interval held none.`,
  challenge: code`
Rerun setup and the first race, replacing A's COMMIT with ROLLBACK. Stop after B's first UPDATE;
it should now save its captured edit at version2. Compare that returned row with the committed-
competitor case. Do not run the merge phase after an already successful save.`,
  caution: code`
Use the disposable pat_docs table and finish A's transaction to unblock B. The concatenation policy
is specific to the append-only markers here; do not treat a fresh version token as permission to
silently overwrite another user's edits.`,
};
