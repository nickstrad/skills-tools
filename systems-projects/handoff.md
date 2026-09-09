# Systemscoach builder handoff

Updated 2026-09-09. Implementation and installation complete; final audit/cleanup remains. Not a chosen project's lesson batch.

## User intent and constraints

Create a separate systems-project folder/skill and real CLI with systemscoach [topic] N lesson,
review, done and <topic> route. Interview about a topic/write-up, propose minimum complete agenda,
lock it in, then author only requested small batches. Borrow current 40-lesson PostgreSQL teaching
flow, not old long course scope. Each lesson 15–25 minutes. Distributed-systems thinking through
local services and CLIs, supplied plumbing; learner codes only key logic/structs when worthwhile,
Go first and Deno second. Save all supplied project ideas. No topic is selected yet.

Latest steering: inherit resource/cleanup guidance and useful repository knowledge; keep this
handoff committed/updated throughout and delete after completion. Root handoff.md is unrelated.

## Completed checkpoints

- Initial builder and handoff committed as 524e4a1.
- Go stdlib CLI, full draft/approved routes, explicit selection, lesson/review rendering and
  isolated stable completion receipts implemented. No topic selected or lessons authored.
- Skill, design/authoring/format docs, templates, all 15 condensed project examples, local
  AGENTS/CLAUDE inheritance and selective knowledge pointers complete.
- go test -race ./... and go vet ./... passed, including read-only views, explicit completion,
  multi-topic isolation, revisions/reorder, planned/draft boundaries, concurrent writes and
  installer collision/idempotence. Skill validator passed; all local Markdown links resolve.
- Safe installer approved and run: /usr/local/bin/systemscoach and
  /root/.codex/skills/systemscoach link to this checkout.
- Additive links written to root README, docs/README and knowledge index; only our additions
  must be staged from /tmp/systemscoach-index.patch, preserving unrelated edits in those files.
- Durable docs/knowledge/systemscoach.md prepared; final resource subsection still pending.

## Remaining

1. Smoke installed launcher from outside checkout and installed skill.
2. Final disk/memory, read-only learner DB readiness and progress hash checks; remove owned
   /tmp/systemscoach-index.patch after its staged-only index additions are committed.
3. Record final validation/resource state in knowledge note.
4. Commit tested checkpoint, then remove this handoff and commit completion. Preserve root handoff.

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
