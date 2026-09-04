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
};
