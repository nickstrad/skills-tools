# Restricted resource fencing and commit-order acceptance

Primary acceptance, 2026-09-05. Current86 fencing-tokens-with-a-monotonic-counter is revision4. Its
standalone PostgreSQL16 fixture replaces the value-only UPDATE bypass in the old trigger example
with restricted worker logins and a required-token resource interface. It distinguishes issued claim
takeover, tentative resource acceptance and committed fencing through a real concurrent wait.

## Identity, privileges and protected interface

/tmp/pg-resource-fencing-validate.ts executes source core and variation; scripts/logs are
/tmp/pg-resource-fencing-{core,variation}.{sh,log}. Core root /tmp/pg-owned-cvdhovcz; source
variation /tmp/pg-owned-k5rwaaq0. Each is a fresh private PostgreSQL16.15 Unix-socket cluster.

Trusted setup creates authority_owner/resource_owner as non-login, non-superuser roles and actual
worker_a/worker_b logins without inherited authority, role creation or database creation. Owner
schemas separate claims/issued identities from resource state/history. All setup/grants are one
transaction; PUBLIC function execution and PUBLIC schema creation are revoked before workers
connect. Workers receive schema USAGE and the two interface EXECUTE grants, with no direct table
writes or protected-schema creation. Actual selected session_user/current_user and backend usename
confirm application operations run under the intended restricted logins.

The authority SECURITY DEFINER function conditionally increments the expected claim epoch and
inserts an issued identity bound to session_user in the same transaction. This is a controlled
handoff, not a lease timer or election. The resource SECURITY DEFINER function has three mandatory
arguments, no defaults and explicit null rejection. It verifies resource/token/login against issued
identities, then conditionally updates state only if its stored epoch is no newer than the provided
token. State revision, writer/value and history share one caller transaction. The resource owner can
read issued identities but is actually denied SELECT on current claims, making the two
responsibilities distinct despite colocation in one database.

pg_proc evidence records the correct owners, SECURITY DEFINER, non-STRICT behavior, zero default
arguments and fixed pg_catalog,pg_temp search path. All application relations in both functions are
schema-qualified. Both worker permission records show interface execution true and direct mutation,
schema creation and resource-owner membership false. Actual attempts complement these catalog
checks.

## The point at which the old worker becomes fenced

A receives issued token1 and commits A-initial at resource epoch1/revision1. B's subsequent claim
transaction commits token2 and holderB, but independent resource state is still epoch1/A-initial.
A's token1 then really commits A-after-takeover at revision2. The issuer takeover did not inform the
resource of a new committed fence.

B's actual worker connection executes write_value(token2,'B-first') inside BEGIN and receives
revision3. Its backend is idle in transaction with an XID, while independent full state remains
revision2/epoch1. A's old-token call starts in another actual worker login and waits on B's
transaction ID. Core waiter632475 blocks on632454; variation632983 blocks on632962. Captured
pg_stat_activity shows Lock/transactionid and pg_blocking_pids includes B's exact PID.

Core commits B's held transaction. B-first/epoch2/revision3 and history become visible; A's
conditional UPDATE rechecks eligibility and actually fails55000/resource fenced this token. Its
transaction exits3 with no A-racing history row. The rolled-back-fence variation changes only B's
first transaction decision to ROLLBACK. B's tentative state/history disappear; A's waiting call
instead returns3 and commits A-racing at epoch1/revision3. A fresh B transaction then commits
B-first/epoch2/revision4. Subsequent A calls are rejected only after that committed resource fence.
Both variations preserve the authority claimB/2 and the original issued identities throughout.

## Actual rejected calls and complete final history

Every rejection runs under a worker login, captures verbose SQLSTATE/message and asserts complete
claims/issued/state/history equality before and after:

- Old-token resource calls fail55000, including after normal restart.
- Omitted token fails42883; explicit null token fails22023. No default or STRICT shortcut silently
  fills or ignores the token.
- Unissued999 and B's token2 presented by A fail42501 because issuance is login-bound.
- Value-only and epoch-changing direct UPDATEs, DELETE/TRUNCATE, forged history/issuance INSERTs,
  protected-schema CREATE, SET ROLE resource_owner and SET SESSION AUTHORIZATION worker_b fail42501.
- Repeating an obsolete expected epoch in takeover fails40001 without issuing another token.
- Temporary tables named state and issued cannot redirect the fully qualified resource function; its
  old-token call still fails55000 and the whole attempted shadowing transaction rolls back.
- Even B's direct resource UPDATE after restart fails42501; its current token authorizes the
  interface, not arbitrary table mutation.

B's valid token2 is used again for B-final. Core's four complete history rows are A-initial/1,
A-after-takeover/1, B-first/2 and B-final/2 at revisions1–4. Variation inserts A-racing/1 before
B-first, producing five rows at revisions1–5. The extra committed A write is valid before the
replacement fence; it is not hidden or described as a rejected effect. Final resource state is
B-final/epoch2/writer worker_b with the matching revision; claim is B/2 and issued identities are
exactly1→A and2→B. Full inventories survive a normal server restart and final old-token/direct-write
rejections. Core persistent clients exit0/3; variation clients exit0/0. The server stops and no
waiting client remains. Repeated same-epoch writes are deliberately allowed, distinguishing fencing
from the previous idempotency protocol.

## Exact learner commands and integration

/tmp/pg-resource-fencing-exact.ts renders pgcoach86 hint2 from copied progress
/tmp/pg-observe-progress-ekvdxdi6/progress.sqlite into
/tmp/pg-resource-fencing-rendered-fencing-tokens-with-a-monotonic-counter.md and executes its exact
shell fence. Log /tmp/pg-resource-fencing-exact-fencing-tokens-with-a-monotonic-counter.log; root
/tmp/pg-owned-6tkr6u8y. It reproduces the full rollback variation, including the actual resource
wait, committed A-racing row, later B fence, all18 explicit rejection tests and complete restart
inventory.

/tmp/pg-resource-fencing-audit.py independently checks all three runs' role/function/permission
records, separated claim/resource states, exact backend wait relationship, commit-versus-rollback
outcomes, all18 rejection records, complete accepted history, restart equality and stopped status.
Core server.log has19 errors (18 explicit tests plus its waiting old-token rejection); each
variation has18. The error-message multisets match expected client errors after normalizing only
server-appended SQL cursor positions; no FATAL/PANIC is present. All three servers report pg_ctl
status3/no PID. Built core matches executed source modulo the builder's final-newline trim; exact
rendered hint matches executed source variation. Raw client/error logs and full JSON remain beside
the stopped data directories.

Scoped /tmp/pg-resource-fencing-scoped-build.py builds92 lessons in
/tmp/pg-resource-fencing-build-zyxe0f80 and changes only current86's generated object. The unrelated
storage source already represented in the old artifact is overlaid solely to preserve that existing
content and is not staged. Stable slug/course revision2, all other91 built objects, original first
seven/current completions, capacity semantics and seven reading stops survive. Copied progress
preserves all IDs/history/progress; learner SHA256 remains
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6. Thirty tests and full
format/lint/typecheck pass; logs /tmp/pg-resource-fencing-{tests,check}.log. Specific prompts and
the complete variation are registered in guides/14-patterns.ts.

## Scope and retained evidence

The handoff to B is authorized by this fixture. The counter does not supply election, expiry or a
policy for malicious takeover requests; workers are trusted to request authorized fresh takeovers.
The resource checks issued login-bound identities and its own committed epoch. Authority and
resource are separate privilege domains in one PostgreSQL process, not independent hosts or network
services. Local trust authentication is a fixture convenience; the actual tests establish database
role authorization after role selection, not OS isolation or login authentication. Superusers and
object owners remain trusted. No VM pause, partition, failure detector or power-loss test is
claimed.

Before allocating these clusters, /tmp/pg-fencing-archive-evidence.py preserved only the known
accepted84 roots8070t6ty/flhszqqr/0yptn0r5, data directories. Each was stopped/status3, PostgreSQL16
and clean in pg_controldata. Reopened tar.gz regular-file path/SHA256 inventories matched originals;
stopped state and original hashes were rechecked before removing original data directories. All
roots retain compressed images, cold hash/control manifests, cold-archives.json and original
logs/JSON. This is verified cold-file preservation, not a tested restore. Current85 participant
pairs and current86 data directories remain intact; about80MB remains after the exact86 run. Durable
findings: docs/knowledge/postgres-durable-protocol-evidence.md.
