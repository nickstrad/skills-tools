# Systemscoach builder handoff

Updated 2026-09-09. Initial implementation in progress; not a chosen project's lesson batch.

## User intent and constraints

Create a separate systems-project folder/skill and real CLI with systemscoach [topic] N lesson,
review, done and <topic> route. Interview about a topic/write-up, propose minimum complete agenda,
lock it in, then author only requested small batches. Borrow current 40-lesson PostgreSQL teaching
flow, not old long course scope. Each lesson 15–25 minutes. Distributed-systems thinking through
local services and CLIs, supplied plumbing; learner codes only key logic/structs when worthwhile,
Go first and Deno second. Save all supplied project ideas. No topic is selected yet.

Latest steering: inherit resource/cleanup guidance and useful repository knowledge; keep this
handoff committed/updated throughout and delete after completion. Root handoff.md is unrelated.

## Implemented, not yet fully validated

- systems-projects Go stdlib CLI; project JSON + authored lesson/review Markdown format.
- Explicit topic selection, full draft/approved route, authored availability, per-topic/slug/revision
  completion receipts. Reads do not mutate progress; done requires an explicit number.
- Skill, interview/design, authoring/validation docs, templates, local AGENTS + CLAUDE symlink.
- docs/project-ideas.md preserves all 15 user-supplied examples in condensed Markdown with provenance;
  source claims have not been independently reverified, no services or lessons authored.

## Remaining

1. Add/run meaningful CLI tests (read-only views, multi-topic isolation, completion idempotence,
   revisions/reorder, planned boundary, draft/invalid inputs, concurrent completion).
2. Review/fix CLI and docs; validate skill and links; implement/review safe installer.
3. Install launcher and skill through appropriate permission flow after concrete validation.
4. Update repository documentation indexes with narrow additive edits; record durable findings.
5. Final resource/progress/readiness checks; cleanup owned scratch; commit tested implementation
   and remove this handoff in completion commit.

## Environment and preservation

Initial df: ~16 GB free, ~6.8 GiB memory available. No large fixture allocated. psql read-only check
confirmed database lab, data_directory /labs/pglab/primary, not in recovery. Sandbox pgrep has limited
process visibility. Existing Go is 1.26.8 at curriculum-tools/courses/grpc/.tools/go/bin/go.
Original learner progress SHA256s:
- grpc 2e6f5f10224d9f51cd364b77803df085dbdcfbf57a9a776fd39b356134f65109
- linux e56a2dc1fca2d1d9470567b69154f7f3b14957e7efb1f32b147c597a707ca29d
- postgres-essentials 527d5197e36b67f71bfffebe65ffb6a2bbc201025c8b751c2cc59c6bc8087fca
- postgres 395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6
- sqlite c714b24935a8f888c991474fdc11f536c6470d1703c290b31b428206a4e86ffc

Pre-existing modifications: root README.md; postgres coaching/pilot files and design; docs/README.md,
docs/knowledge/README.md, postgres-coaching-pilot.md, learner-profile.md; untracked grpc course and
knowledge note. Preserve them; do not commit them wholesale. No agents spawned.
