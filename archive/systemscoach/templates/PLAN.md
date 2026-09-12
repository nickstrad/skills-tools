# Project design

Status: approved for implementation. Agreement: <date and user direction>.

The proposed route was first agreed in `future-courses/<topic>/course.md`. This file and
`project.json` are implementation artifacts, not the planning draft.

## Question and scope

Name the systems question, invariant and why it is worth an at-home experiment.
Link the source digest and distinguish company claims from this lab's approximations.
Name the one or two mechanisms in the core; list omissions and optional extensions.

## Topology and ownership

Draw the local components, durable truth, derived state, ordering/publication point and recovery path.
List native CLIs, supplied plumbing and any learner-owned structs/functions. Justify necessary code
and use Go first, Deno second. State actual failure boundaries and what a single host cannot establish.

## Agenda

The complete numbered route is in project.json: `systemscoach <topic> route`.
Explain dependency choices and the smallest sequence that supports the final evidence.
Target 10–15 minutes for each new lesson, including explanation, learner attempt, evidence,
interpretation, and cleanup. Preserve older estimates when adapting an existing project. Estimate
one-time installation separately. Describe the first requested batch; keep future lessons
unimplemented.

For every lesson, record the concrete learner-owned task, supplied scaffolding, evidence and time
for the attempt. A finished helper invocation, prediction or reading alone is insufficient.

| Lesson | Learner constructs, changes or investigates | Supplied boundary | Observable evidence | Target minutes |
| --- | --- | --- | --- | --- |

Shorten demonstrations before adding lessons. Split only when meaningful work still exceeds the
time budget or needs a separate conceptual step; explain any proposed route expansion.

## Lab budget and lifecycle

Name versions/capabilities to verify, service count, ports, bounded dataset, peak disk/memory estimate
including images and recovery copies, ownership root, safe stop/resume and final teardown.

## Final evidence and stopping rule

What will the learner observe, break, recover and be able to explain? No written report required.

## Agreement and batch history

Record the user's actual scope agreement and link the prior future-course plan. Link each completed
batch's validation evidence and optional learner feedback. Do not infer agreement from elapsed time.
