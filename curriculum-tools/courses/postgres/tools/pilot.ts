import type { Guide } from "../guides/types.ts";
import type { SelectedLesson } from "./coach.ts";
import { coachCommand, shellQuote } from "./coach_commands.ts";

export const PILOT_FLOW = ["start", "run", "inspect", "explain", "reveal", "apply"];
export const REVIEW_BEFORE = "two-sessions-see-different-versions";
export const PILOT_LAST = "snapshot-anatomy";

export function batchReview(): string {
  return `## Stop here — review the coaching before lesson 13 (about 5 minutes)

You have reached the end of the four-lesson pilot, lessons 9–12. Bring this back to our chat before
starting the next batch:

- Could pgcoach and your experiment terminals carry the lesson, or where did you need outside help?
- Did each step arrive with enough context, and did comparing results with your guess help?
- Did the time estimates fit an evening? What should we keep, shorten or explain differently?

A quick conversation is enough. We will revise the approach and prepare only the next small batch
after that conversation.`;
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
  if (pilot.cap < pilot.minutes[1]) throw new Error("pilot core exceeds its sitting cap");
  return `**Core:** about ${range(pilot.minutes)} · **Wrap up by:** ${pilot.cap} min.\n` +
    `**Optional variation:** +${range(pilot.variation.minutes)} · ` +
    (pilot.readingMinutes
      ? `**Core reading after this lesson:** +${range(pilot.readingMinutes)}.`
      : "No core reading stop here.") +
    "\nThese are trial estimates for thinking and running, not a speed test. At about 40 minutes, skip optional depth and head toward wrap-up. If one blocker takes 10–15 minutes, use help or stop for the evening.";
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
  const pilot = guide.pilot!;
  const parts = [
    `# Lesson ${lesson.ordinal}: ${lesson.title}`,
    `**Pilot batch:** lessons 9–12 · **Question:** ${pilot.question}`,
    `**Run in:** psql · **Sessions:** ${lesson.sessions} · **Safety:** ${lesson.safetyLevel} · **PostgreSQL:** ${lesson.minVersion}+`,
  ];
  if (lesson.caution) parts.push("## Caution\n\n" + lesson.caution);
  if (stage === "start") {
    parts.push(timing(guide), "## Terminals\n\n" + terminals(lesson));
    parts.push(
      "## Before you run\n\n" + guide.brief,
      "## Make a quick guess\n\n" + guide.predict,
      "Think it through briefly; no typed answer needed. We will compare the result with your guess as we go.",
    );
    parts.push(
      "After lesson 12, stop for a brief conversation about how this flow worked before we prepare the next batch.",
    );
  } else if (stage === "run") {
    parts.push(
      "Use the psql terminal(s) from start. Work through the blocks below in order. Each introduction explains why that block is here.",
    );
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
      "Keep the output in your terminal for the comparisons in inspect. No separate record is needed.\n\nMore syntax detail, if wanted: `" +
        coachCommand(lesson.ordinal, "syntax", db) + "`.",
    );
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
