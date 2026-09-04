# Articles and learner insights

A place to save articles, what the learner likes about them, and ideas that may help shape
future lessons. Short notes are welcome: a link and a sentence about why it matters are
enough to start an entry.

The [learner profile](../learner-profile.md) is the canonical experience summary. Certification
references below help calibrate prior knowledge; architecture articles suggest possible deeper
questions. Both can be linked next to relevant projects without becoming mandatory assignments.

## Learner interests

Recorded from the learner's requests on 2026-09-04:

- Strong interest in how object storage can help solve complex engineering problems,
  especially when a design makes familiar PostgreSQL and database principles useful in
  another domain. Cursor's Git storage article below is a motivating example.
- Prefer easily runnable local tools, such as a local S3-compatible object store, to cloud
  services when learning concepts. Keep setup and project scope small; explain any concrete
  reason a cloud-specific experiment would be necessary.
- Look for opportunities to connect internals experiments to architecture decisions and
  real systems, while retaining the repo's guided, experiment-driven approach.

The adopted project-flow and software recommendations live in
[`../learning_path.md`](../learning_path.md). Keep that roadmap authoritative for sequencing
and default tools; article notes supply motivation and optional experiment ideas.

## Index

| Note | Source | Relevant lessons |
| --- | --- | --- |
| [Cursor: Git at any scale](cursor-git-at-any-scale.md) | Vicent Martí, Cursor, 2026-08-18 | Object storage, PostgreSQL WAL and recovery, optimistic concurrency, replica freshness, Git internals |
| [KCNA reference](kcna-reference.md) | Linux Foundation, reviewed 2026-09-04 | Kubernetes/Docker entry point; avoid repeating fundamentals Nick already knows |
| [On building scalable control planes](scalable-control-planes.md) | Zak van der Merwe, All Things Distributed, 2026-08-04 | PostgreSQL/SQLite control-store boundaries, Kubernetes, etcd, worker integration, Firecracker |

## How agents should use these notes

Read relevant entries before proposing a course or substantially revising its lessons.
Treat the learner's stated reaction as preference evidence. Keep source summaries separate
from our interpretations and proposed experiments; never attribute an agent's inference to
the learner or article author.

Use an insight where it clarifies an existing mechanism, supplies a motivating comparison,
or suggests a small synthesis experiment. It does not automatically require a new course,
mandatory reading, production-scale implementation, or a change to working lessons. Follow
the normal authoring rules before implementing any lesson change.

Proposed labs remain unvalidated until exercised against the actual tool. Verify API and
failure assumptions before claiming a guarantee. Prefer local reproductions with explicit
limits on what they establish. Record measured behavior separately from a source's claims.

## Adding an article

Create a descriptive Markdown filename here and add an index row. Start with this outline;
leave sections empty or mark them pending when information is unavailable:

```markdown
# Article title

Source: [Title](URL) — author, publication date if available.
Added: YYYY-MM-DD. Source reviewed: YYYY-MM-DD or pending.

## Why the learner saved it

Their stated reaction, clearly paraphrased or quoted. If unknown, say so.

## Source takeaways

A brief attributed summary, with links to relevant sections. No full article copies.

## Connections and possible local experiments

Our interpretations and proposals, linked to relevant courses or roadmap topics.
For each useful idea: mechanism, bounded experiment, and evidence to inspect.

## Limits and open questions

Unverified claims, prerequisite capabilities, and distinctions the analogy must preserve.
```
