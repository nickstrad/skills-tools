/** Coaching is keyed by lesson identity; it never stores learner progress. */
export type Guide = {
  /** Short conceptual introduction without the experiment's answer. */
  brief: string;
  predict: string;
  inspect: string;
  explain: string;
  /** A bounded variation with runnable help available in hints. */
  vary: string;
  apply: string;
  hints: [string, string];
  /** Opt-in pilot; other lessons retain their existing flow until batch review. */
  pilot?: {
    question: string;
    minutes: [number, number];
    cap: number;
    readingMinutes?: [number, number];
    /** First from is empty; later from values uniquely locate boundaries in lesson.code. */
    phases: Array<{ from: string; title: string; context: string }>;
    variation: { minutes: [number, number]; intro: string; code: string; expected: string };
  };
};
