# Archived learning path (Markdown)

Superseded on 2026-09-12 by `tutor roadmap`. The roadmap now lives in the shared learner
database (`curriculum-tools/tutor.sqlite`) and is edited with the CLI:

```sh
bin/tutor roadmap                    # overview by track with course progress
bin/tutor roadmap show <slug>        # goals, diagram, optional Go follow-ups
bin/tutor roadmap set <slug> --status active
bin/tutor roadmap export             # refresh the committed snapshot
```

The committed snapshot is `curriculum-tools/roadmap/roadmap.json`; `tutor roadmap import`
loads it on a fresh machine.

These two files are kept for their research context only:

- `learning_path.md` — the last Markdown roadmap (topics, tool descriptions, goals, diagrams and
  follow-ups, all imported into the database).
- `learning_path-reference.md` — detailed software choices, measurement rules and earlier
  synthesis proposals that were not carried into the roadmap entries.
