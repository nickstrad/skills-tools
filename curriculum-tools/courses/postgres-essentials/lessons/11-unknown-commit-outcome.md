# A lost response leaves the commit outcome unknown

slug: unknown-commit-outcome
category: concurrency-control
difficulty: intermediate
tags: transactions, retries, unknown-outcome
prerequisites: whole-transaction-retry
safety: ddl
run-in: shell
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Run a supplied client that commits an increment but withholds the application's response from its caller. Reconnect to inspect the surviving write, then deliberately repeat the increment and see two effects. This separates a missing response from the known transaction abort you handled in lesson 10.

## Syntax breakdown
### In plain terms
An acknowledgement is a response telling the caller how an operation finished. If it disappears,
the caller has an unknown outcome: it lacks enough evidence to say committed or aborted. Before
running, predict whether closing a request connection can undo a transaction whose COMMIT already
succeeded.

The supplied service receives PostgreSQL's successful COMMIT response and intentionally withholds
its own response. The simulated caller gets no outcome. You can see more than that caller because
the experiment separately prints a fresh database inspection. This is application response loss;
we are not cutting a network connection during COMMIT or crashing PostgreSQL.

### Mechanism map

```text
One increment request crosses two response boundaries

Caller                 Service connection                 PostgreSQL
  | -- add 10 --------> | -- BEGIN / UPDATE / COMMIT ----> |
  |                     | <--------- COMMIT accepted ----- |
  |   X reply withheld  |                                 | balance 110
  |                     | connection closes               |
  | no outcome          |                                 |
  | UNKNOWN             |                                 |

Fresh inspection: 110. Deliberately repeat add 10: 120.
Missing acknowledgement describes the caller's knowledge, not a rollback.
```

### Terminals and cleanup
Run this lesson in one shell. The supplied client opens its own bounded database connections; keep
the coaching terminal separate from that shell. It uses the learner lab unless the lesson says it
creates a private cluster. On normal exit, check the printed the controller's schema removal record; on Ctrl-C, wait for cleanup
to finish before rerunning. If you reach the fifteen-minute core limit or get stuck, press Ctrl-C
and check that the owned resource is removed before trying again.
### What you are learning
- A known abort, such as lesson 10's 40001, and an unknown outcome need different handling. A
  missing reply alone gives no permission to assume a rollback and repeat a non-idempotent write.
- Non-idempotent means repeating the operation can change the result again. Adding 10 twice
  creates two increments even if the caller meant one logical request.
- A database transaction and the caller's knowledge have separate lifetimes. Disconnecting
  after a successful COMMIT leaves the committed data in place.
- Reconciliation means checking durable evidence to resolve uncertainty. This tiny fixture has
  one writer, so its balance identifies the effect; a shared production balance cannot tell you
  which request contributed. Lesson 12 gives the request its own durable identity.

### Piece by piece
- **cd /root/Software/skills-tools/curriculum-tools** enters the course engine so the relative
  script path resolves. Keep setup and the run in the same shell.
- **python3 courses/postgres-essentials/lab/unknown_outcome.py** runs the supplied bounded
  experiment. It needs no Python packages. Defaults connect through /tmp, port 5440, role postgres,
  database lab; PGHOST, PGPORT, PGUSER and PGDATABASE override them for private validation.
- **BEGIN / UPDATE account SET balance=balance+10 WHERE id=1 / COMMIT** is the service's
  transaction, starting from balance 100. The default mode completes all three and closes that
  connection. Database replies are read inside the service but its caller receives no result.
  Each SQL command has a five-second server limit and an eight-second client response limit;
  unexpected errors or disconnections stop the experiment rather than trigger automatic retry.
- **observer = caller / response = missing / outcome = UNKNOWN** describes only the caller's
  evidence. Both the core and optional mode print this same record. The script does not turn
  UNKNOWN into a claim that PostgreSQL aborted.
- **observer = reconnected inspector / balance / first_effect_committed** comes from a newly
  opened connection after the original connection closed. Balance 110 establishes the first
  committed increment in this single-writer fixture; balance 100 means it did not survive.
- **action = deliberate unsafe repeat** announces a second complete transaction adding 10.
  It is a supplied mistake to inspect, not an automatic recovery rule. A separate final query
  reports balance, applied_increments and submitted_requests; two submissions can leave one or
  two increments depending on the first transaction's outcome.
- **injection / boundary** labels the controlled failure point after the observations.
  **cleanup = schema removed** confirms the uniquely named fixture was dropped and checked
  absent. Connection closure happens before schema removal so an unfinished transaction cannot
  keep cleanup waiting on its own locks.
- **--mode before-commit** changes just the injection point in the optional comparison. The
  service closes after UPDATE without sending COMMIT, so PostgreSQL aborts that open transaction.
  The caller still gets no outcome; the observer can now see a different durable result.

## Caution
Use a shell. The client creates and removes its own unique pe_unknown_* schema in the learner lab, using Python 3 and psql. It deliberately repeats only its own fixture write. Ctrl-C closes its request connections and runs cleanup; check the schema removal record. A STOP or missing cleanup record needs investigation before rerunning.

## Setup
```sh
cd /root/Software/skills-tools/curriculum-tools
```

## Run
```sh
python3 courses/postgres-essentials/lab/unknown_outcome.py
```

## Expected result
The caller reports response = missing, outcome = UNKNOWN and automatic_retry = false. A fresh
connection then reports balance = 110 and first_effect_committed = true. The request connection
has closed, yet the first write remains committed.

The explicitly announced unsafe repeat produces balance = 120, applied_increments = 2 and
submitted_requests = 2. This is the visible duplicate effect of treating a missing reply as a
failed write. The injection label is after-commit. The script exits successfully and prints
cleanup = "schema removed"; the schema name varies.

## Systems lens
Commit and response delivery are separate events. The service knew the database committed, but its caller never received that evidence. A process failure or transport loss around COMMIT can create a similar knowledge gap for the database client; this experiment demonstrates the application response boundary only. Reconnecting is useful for reconciliation, but observing a shared balance would not identify a particular request amid other writers. The safe next step is to resolve the original request by durable identity or use a protocol that makes a repeated submission harmless for the specified effect. Do not feed unknown outcomes into lesson 10's known-abort retry loop. These are committed-state observations on one running server, not a crash-recovery or replica-durability test.

## Optional variation
Optional, outside the core time budget: predict what changes when the original connection closes before COMMIT. Run in the same shell:

```sh
python3 courses/postgres-essentials/lab/unknown_outcome.py --mode before-commit
```

The caller again reports UNKNOWN. The reconnected inspection now sees balance 100 and first_effect_committed = false. The deliberate repeat leaves 110 and one applied increment across two submissions. Both runs lose the caller response, but only one committed the first effect. Both remove their fixtures.
