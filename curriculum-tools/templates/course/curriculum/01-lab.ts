import { code, type Module } from "../../../src/types.ts";

// Implement only after the future-courses/<id>/course.md route is agreed and a batch is requested.
// Supply the smallest owned environment needed for this lesson's mechanism.
export const LAB: Module = {
  category: "lab-setup",
  title: "Build a disposable {{name}} lab",
  lessons: [
    {
      slug: "build-lab",
      title: "Build a disposable {{name}} lab you can break",
      difficulty: "beginner",
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 10,
      reading: code`
Cite the chapter of the course's canonical book that covers this lesson (number, exact title,
section), or say it is not covered. One line. Delete this field if there is no book.`,
      overview: code`
Create the scratch environment every later experiment assumes: a directory you can delete, a
known {{tool}} version, and a way to open two sessions against the same data.`,
      syntaxBreakdown: code`
### In plain terms
Two to five sentences for a reader who knows basic SQL and a shell but nothing about {{tool}}
internals: what question this experiment answers, what will happen in front of them, and why it
matters. Define each technical term the first time it appears.

### What you are learning
- One concept per bullet, with one or two sentences saying what it means.

### Visual model
Replace this with a labeled terminal diagram of the mechanism, before setup and commands.
Lean toward diagrams for ownership, timelines, transitions, queues, and storage layouts.
Use an indented Markdown code block so it remains readable without ANSI color:

    learner terminal --> owned process --> private lab files

Connect the labels to what the learner will observe. The shared renderer displays this content;
do not build a course-specific UI.

### Piece by piece
- **{{tool}} --version** (shell program and flag)
  Prints the runtime version to compare with the validated minimum; probe required capabilities
  separately when version alone is insufficient.
- **export TUTOR_LAB=...** (shell variable)
  Sets the owned lab path. Explain exact cleanup targets; never remove unrelated learner files.`,
      code: code`
export TUTOR_LAB=$HOME/{{id}}-lab
mkdir -p "$TUTOR_LAB"
{{tool}} --version`,
      expectedResult: code`
Say exactly what success looks like (a version string, a file that now exists, a row count) so the
learner can tell a working setup from a broken one.`,
      systemsLens: code`
Name the systems idea this makes concrete. Every lesson must earn its place by teaching something
about how storage, concurrency, durability, replication, or query execution really works.`,
      challenge: code`
Offer one optional variation; it must not block completion of the core lesson.`,
    },
  ],
};
