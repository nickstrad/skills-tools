import type { Guide } from "../guides/types.ts";
import type { SelectedLesson } from "./coach.ts";
import { coachCommand, shellQuote } from "./coach_commands.ts";

export const PILOT_FLOW = ["lesson", "review"];
export const REVIEW_BEFORE = "two-sessions-see-different-versions";
export const PILOT_LAST = "snapshot-anatomy";

export function batchReview(): string {
  return `## Stop here — review the coaching before lesson 13 (about 5 minutes)

You have reached the end of the four-lesson pilot, lessons 9–12. Bring this back to our chat before
starting the next batch:

- Did the first view and its diagrams give you enough understanding to run the experiment?
- Can you connect one observed result to the mechanism, and did review add a useful insight?
- Did the work fit 20–30 minutes? What should we shorten or explain differently?

A quick conversation is enough; no written report is needed. Our current direction is roughly
24 further essentials lessons of 20–30 minutes, adjusted using your feedback. The shorter route
has not yet been assembled. We will prepare the next small batch toward that route after this chat;
the broader course remains available for optional depth.`;
}

/** Drop legacy coaching comments, never executable SQL or session-routing labels. */
export function runnable(text: string): string {
  return text.split("\n").filter((line) =>
    !/^\s*--/.test(line) || /^\s*-- Session [A-Z]/.test(line)
  ).join("\n").trim();
}

export function pilotPhases(lesson: SelectedLesson, guide: Guide) {
  const phases = guide.pilot?.phases;
  if (!phases?.length || phases[0].from !== "") throw new Error("pilot needs a first phase");
  const boundaries = [0];
  for (const phase of phases.slice(1)) {
    const at = lesson.code.indexOf(phase.from);
    if (
      !phase.from || at <= boundaries[boundaries.length - 1] ||
      lesson.code.indexOf(phase.from, at + 1) !== -1
    ) {
      throw new Error("Pilot phase does not match this lesson catalog: " + phase.title);
    }
    boundaries.push(at);
  }
  return phases.map((phase, i) => ({
    ...phase,
    code: runnable(lesson.code.slice(boundaries[i], boundaries[i + 1])),
  }));
}

function fence(text: string, language = "sql") {
  return "```" + language + "\n" + text + "\n```";
}

function timing(guide: Guide): string {
  const pilot = guide.pilot!;
  const range = (value: [number, number]) => value.join("–") + " min";
  for (
    const value of [
      pilot.minutes,
      pilot.variation.minutes,
      ...(pilot.readingMinutes ? [pilot.readingMinutes] : []),
    ]
  ) {
    if (value[0] <= 0 || value[1] < value[0]) throw new Error("invalid pilot time estimate");
  }
  return `**Sitting budget:** 20–30 min. **Current unsplit experiment:** about ${
    range(pilot.minutes)
  }.\n` +
    `**Optional variation:** +${range(pilot.variation.minutes)} · ` +
    (pilot.readingMinutes
      ? `**Core reading after this lesson:** +${range(pilot.readingMinutes)}.`
      : "No core reading stop here.") +
    "\nThese experiments still need splitting to fit one sitting. At 30 minutes, wrap up; if stopping early, run ROLLBACK in each psql session. Rerun setup when returning. Estimates include thinking and running.";
}

function terminals(lesson: SelectedLesson): string {
  return `Keep this coaching shell open. Open ${
    lesson.sessions === 1
      ? "one other terminal for psql"
      : "two other terminals for psql, labelled A and B"
  }.
Connect ${lesson.sessions === 1 ? "it" : "both"} to the learner lab with:

${fence("psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off", "sh")}

Run setup once in Session A. ${
    lesson.sessions > 1
      ? "Follow the Session A/B blocks in order; keep each connection open between its blocks."
      : "Use that same psql connection throughout."
  }
The coaching shell prints instructions; SQL goes into psql. This lesson uses the existing lab.`;
}

function readingStop(lesson: SelectedLesson): string {
  const stop = lesson.studyCheckpoint;
  if (!stop) return "";
  return "## Core reading — before the next lesson\n\n" +
    stop.core.map((item) => `- ${item.source} — ${item.locator}`).join("\n") +
    "\n\n" + stop.rationale +
    (stop.optionalDepth?.length
      ? "\n\nOptional depth:\n" +
        stop.optionalDepth.map((item) => `- ${item.source} — ${item.locator}`).join("\n")
      : "");
}

function footer(lesson: SelectedLesson, stage: string, db?: string): string {
  const command = (value: string) => coachCommand(lesson.ordinal, value, db);
  if (["lesson", "review", "run"].includes(stage)) {
    const parts = stage === "review"
      ? ["Reopen experiment: `" + command("lesson") + "` (no need to rerun setup)."]
      : ["Next: `" + command("review") + "`"];
    if (stage === "review") {
      parts.push(
        "When finished: `pgtutor done " + lesson.ordinal +
          (db ? " --db " + shellQuote(db) : "") + "`",
      );
      if (lesson.slug !== PILOT_LAST) {
        parts.push(
          "Next lesson" + (lesson.studyCheckpoint ? " after core reading" : "") +
            ": `" + coachCommand(lesson.ordinal + 1, "lesson", db) + "`",
        );
      }
    }
    parts.push(
      "Optional: `" + command("syntax") + "` · `" + command("vary") + "` · `" + command("full") +
        "`",
    );
    return "---\n\n" + parts.join("\n\n");
  }
  const at = PILOT_FLOW.indexOf(stage);
  const parts: string[] = [];
  if (at > 0) parts.push("Previous: `" + command(PILOT_FLOW[at - 1]) + "`");
  if (at >= 0 && at < PILOT_FLOW.length - 1) {
    parts.push("Next: `" + command(PILOT_FLOW[at + 1]) + "`");
  }
  if (at < 0) {
    parts.push(
      "Return: `" + command(
        stage === "hint1"
          ? "inspect"
          : stage === "hint2"
          ? "vary"
          : stage === "syntax"
          ? "run"
          : "apply",
      ) + "`",
    );
  }
  if (stage === "apply") {
    parts.push("Optional extra experiment: `" + command("vary") + "`");
    parts.push(
      "When you consider this lesson complete: `pgtutor done " + lesson.ordinal +
        (db ? " --db " + shellQuote(db) : "") + "`",
    );
    if (lesson.slug !== PILOT_LAST) {
      parts.push(
        "After completing the lesson" + (lesson.studyCheckpoint ? " and its core reading" : "") +
          ": `" + coachCommand(lesson.ordinal + 1, "start", db) + "`",
      );
    }
  }
  parts.push(
    "Help: `" + command("hint1") + "` · `" + command("hint2") +
      "` · Worked explanation: `" + command("reveal") + "` · Full lesson: `" + command("full") +
      "`",
  );
  return "---\n\n" + parts.join("\n\n");
}

export function renderPilot(
  lesson: SelectedLesson,
  stage: string,
  guide: Guide,
  db?: string,
): string {
  if (stage === "start") stage = "lesson";
  const pilot = guide.pilot!;
  const parts = [
    `# Lesson ${lesson.ordinal}: ${lesson.title}`,
    `**Pilot batch:** lessons 9–12 · **Question:** ${pilot.question}`,
    `**Run in:** psql · **Sessions:** ${lesson.sessions} · **Safety:** ${lesson.safetyLevel} · **PostgreSQL:** ${lesson.minVersion}+`,
  ];
  if (lesson.caution) parts.push("## Caution\n\n" + lesson.caution);
  if (stage === "lesson") {
    parts.push(timing(guide));
    parts.push(
      "## Before you run\n\n" + guide.brief,
      fence(pilot.visual, "text"),
      guide.predict,
      "## Terminals\n\n" + terminals(lesson),
    );
  }
  if (stage === "lesson" || stage === "run") {
    if (lesson.setup) {
      parts.push(
        "## Setup — Session A, once\n\nThis resets only the named experiment tables. Finish any earlier transaction first.\n\n" +
          fence(lesson.setup),
      );
    }
    for (const phase of pilotPhases(lesson, guide)) {
      parts.push("## " + phase.title + "\n\n" + phase.context + "\n\n" + fence(phase.code));
    }
    parts.push(
      "**Before review:** Pick one result that changed and connect it to the diagram or explanation above. A brief mental check is enough; review will help with anything still unclear.",
    );
  } else if (stage === "review") {
    parts.push("## What the result means\n\n" + pilot.review);
    if (lesson.slug !== PILOT_LAST) {
      parts.push(
        "**Quick check:** Does the result make sense now, and did the lesson fit your time budget? If something felt unclear or too long, mention it in our chat; otherwise carry on. We will review the approach together after lesson 12.",
      );
    }
    if (readingStop(lesson)) parts.push(readingStop(lesson));
    if (lesson.slug === PILOT_LAST) parts.push(batchReview());
  } else if (stage === "inspect" || stage === "explain" || stage === "apply") {
    parts.push("## " + stage[0].toUpperCase() + stage.slice(1) + "\n\n" + guide[stage]);
    if (stage !== "apply") {
      parts.push(
        "Use the output from run. You can reopen its instructions with `" +
          coachCommand(lesson.ordinal, "run", db) +
          "`; looking again does not mean rerunning setup.",
      );
    }
    if (stage === "apply") {
      parts.push(
        "That is enough for the core experiment. Optional depth can wait.",
      );
      if (readingStop(lesson)) parts.push(readingStop(lesson));
      parts.push(
        lesson.slug === PILOT_LAST
          ? batchReview()
          : "**Quick flow check:** Was any step unclear, or did this take longer than expected? Mention it in our chat if useful; otherwise carry on. We will review the batch after lesson 12.",
      );
    }
  } else if (stage === "reveal") {
    parts.push(
      "## Compare with your guess\n\n" + lesson.expectedResult,
      "## Why it matters\n\n" + lesson.systemsLens,
    );
    if (lesson.studyCheckpoint) {
      parts.push(
        "This lesson also has a core reading stop, shown at apply after the final question.",
      );
    }
  } else if (stage === "vary") {
    parts.push(
      "## Optional variation\n\n" + pilot.variation.intro,
      fence(pilot.variation.code),
      "## After running, compare\n\n" + pilot.variation.expected,
    );
  } else if (stage === "hint1" || stage === "hint2") {
    parts.push(
      (stage === "hint1" ? "## Core nudge\n\n" : "## Variation help\n\n") +
        guide.hints[stage === "hint1" ? 0 : 1],
    );
  } else if (stage === "syntax") {
    parts.push("## Optional syntax reference\n\n" + lesson.syntaxBreakdown);
  } else if (stage === "full") {
    parts.push(
      timing(guide),
      "## Terminals\n\n" + terminals(lesson),
      "## Overview\n\n" + (lesson.overview ?? guide.brief),
      fence(pilot.visual, "text"),
      "## Syntax reference\n\n" + lesson.syntaxBreakdown,
    );
    if (lesson.reading) parts.push("## Optional reference\n\n" + lesson.reading);
    if (lesson.readingNotes) parts.push(lesson.readingNotes);
    if (lesson.setup) parts.push("## Setup — Session A\n\n" + fence(lesson.setup));
    parts.push(
      "## Run\n\n" + fence(runnable(lesson.code)),
      "## Expected result\n\n" + lesson.expectedResult,
      "## Systems lens\n\n" + lesson.systemsLens,
      "## Optional variation\n\n" + pilot.variation.intro + "\n\n" + fence(pilot.variation.code) +
        "\n\n" + pilot.variation.expected,
    );
    if (readingStop(lesson)) parts.push(readingStop(lesson));
    if (lesson.slug === PILOT_LAST) parts.push(batchReview());
  } else throw new Error("unsupported pilot stage: " + stage);
  parts.push(footer(lesson, stage, db));
  return parts.join("\n\n");
}
