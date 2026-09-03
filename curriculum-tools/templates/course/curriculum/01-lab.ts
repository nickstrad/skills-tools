import { code, type Module } from "../../../src/types.ts";

// First module of every course: give the learner a disposable environment they fully control,
// then teach the tool habits (timing, multiple sessions, inspecting internals) the experiments need.
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

### Piece by piece
- **{{tool}} --version** (shell program and flag)
  - What it is: the program the course runs experiments in, asked only to print its version.
  - What it does here: proves the binary on PATH is the one the lessons were validated on.
  - What it gives us: a version string to compare with the course's minVersion before going on.
- **export TUTOR_LAB=...** (shell variable)
  - What it is: an environment variable every later lesson uses to find the lab directory.
  - What it does here: fixes the location once so no lesson hard-codes a path.
  - What it gives us: a directory that can be deleted to reset the whole course.`,
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
Offer one prediction to make or variation to try before moving on.`,
    },
  ],
};
