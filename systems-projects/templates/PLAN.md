# Project design

Status: draft. Agreement: not yet requested.

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
Budget 15–25 minutes per lesson including setup, interpretation and cleanup. Estimate one-time
installation separately. Describe the first proposed batch; keep future lessons unimplemented.

## Lab budget and lifecycle

Name versions/capabilities to verify, service count, ports, bounded dataset, peak disk/memory estimate
including images and recovery copies, ownership root, safe stop/resume and final teardown.

## Final evidence and stopping rule

What will the learner observe, break, recover and be able to explain? No written report required.

## Agreement and batch history

Record the user's actual scope agreement before changing status to approved. Link each completed
batch's validation evidence and brief learner feedback. Do not infer agreement from elapsed time.
