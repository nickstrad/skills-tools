import { code, type Module } from "../../../src/types.ts";

// First module of every course: give the learner a disposable environment they fully control,
// then teach the tool habits (timing, multiple sessions, inspecting internals) the experiments need.
export const LAB: Module = {
  category: "lab-setup",
  title: "Build a disposable DuckDB Systems lab",
  lessons: [
    {
      slug: "build-lab",
      title: "Build a disposable DuckDB Systems lab you can break",
      difficulty: "beginner",
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 10,
      overview: code`
Create the scratch environment every later experiment assumes: a directory you can delete, a
known duckdb version, and a way to open two sessions against the same data.`,
      syntaxBreakdown: code`
Describe each command or flag the learner meets for the first time, one sentence each.`,
      code: code`
export TUTOR_LAB=$HOME/duckdb-lab
mkdir -p "$TUTOR_LAB"
duckdb --version`,
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
