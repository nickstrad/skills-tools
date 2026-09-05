export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

export function coachCommand(ordinal: number, stage: string, db?: string): string {
  return `pgcoach ${ordinal} ${stage}` + (db ? " --db " + shellQuote(db) : "");
}
