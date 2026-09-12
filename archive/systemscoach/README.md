# Systemscoach archive

Systemscoach was a dependency-free Go standard-library CLI (`systemscoach`, in
`systems-projects/`) that turned a selected engineering write-up into a minimum approved project
agenda and authored it in short lesson batches: an interview and design workflow produced a bounded
Markdown route, an author converted an agreed route into a JSON project plus Markdown lessons, and
the CLI served `route` (the full agenda with planned/available/completed status), `lesson` (the
complete teaching output for a numbered step) and `done` (the only command that wrote a completion
receipt), keyed on topic/slug/revision.

## Why this was retired

Nick asked to retire systemscoach on 2026-09-12. The separate project-builder engine (hand-authored
JSON routes, its own Go CLI, its own progress storage) is superseded by the single Go `tutor` CLI
that serves every course from Markdown lesson files and per-course progress databases. This tree keeps its
documentation, project material and skill as provenance; none of it is active guidance and none of
it is a learner prerequisite.

## File map

| Original path | Archived path |
| --- | --- |
| `systems-projects/README.md` | `archive/systemscoach/README-original.md` |
| `systems-projects/AGENTS.md` | `archive/systemscoach/AGENTS-original.md` |
| `systems-projects/docs/authoring.md` | `archive/systemscoach/docs/authoring.md` |
| `systems-projects/docs/design-workflow.md` | `archive/systemscoach/docs/design-workflow.md` |
| `systems-projects/docs/format.md` | `archive/systemscoach/docs/format.md` |
| `systems-projects/docs/project-ideas.md` | `archive/systemscoach/docs/project-ideas.md` |
| `systems-projects/docs/project-ranking.md` | `archive/systemscoach/docs/project-ranking.md` |
| `systems-projects/docs/knowledge/README.md` | `archive/systemscoach/knowledge/README.md` |
| `systems-projects/docs/knowledge/object-store-git-labs.md` | `archive/systemscoach/knowledge/object-store-git-labs.md` |
| `systems-projects/docs/knowledge/learner-work.md` | `docs/knowledge/learner-work.md` (stays **active**; the learner-work norm it introduced remains in force) |
| `systems-projects/projects/cursor-git/**` | `archive/systemscoach/projects/cursor-git/**` (whole tree, including `lab/cursor/*.go`) |
| `systems-projects/skills/systemscoach/SKILL.md` | `archive/systemscoach/SKILL.md` |
| `systems-projects/templates/*` | `archive/systemscoach/templates/*` |
| `docs/knowledge/systemscoach.md` | `archive/systemscoach/knowledge/systemscoach-engine.md` |

The skill directory (`systems-projects/skills/systemscoach/`) held only `SKILL.md`; no other skill
files needed archiving alongside it.

## Learner's completion record

Copied verbatim from the gitignored `.state/done/cursor-git/objects-before-refs/1.json` before that
state directory was removed with the rest of `systems-projects/`:

```json
{"Topic":"cursor-git","Slug":"objects-before-refs","Revision":1,"CompletedAt":"2026-09-10T01:53:22.80909721Z"}
```

That is: topic `cursor-git`, slug `objects-before-refs`, revision 1, completed
`2026-09-10T01:53:22Z`.

## What is kept for future reference

`projects/cursor-git/lab/cursor/*.go` (the Cursor-Git lab's Go store/model/protocol/main code) is
kept as a Go lab reference for a possible future `tutor` course covering the same object-store/Git
publication mechanism, not as a runnable or maintained lab.

Everything else in this tree — the design workflow, authoring contract, project ideas/ranking,
skill, templates, and the Cursor Git project's plan, curriculum, validation and knowledge notes — is
provenance of how systemscoach worked and what it produced. None of it drives current course
authoring, and none of it is a learner prerequisite or progression gate.
