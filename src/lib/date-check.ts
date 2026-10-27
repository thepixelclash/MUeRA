const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Weekday of a YYYY-MM-DD date (UTC math, no timezone drift). */
export function weekdayName(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : DAYS[d.getUTCDay()];
}

/**
 * True when the notice names weekdays that do not include the weekday of the date the AI
 * resolved, and the notice does not contain that exact date. Used to ask the user to confirm
 * instead of trusting a wrong "next Friday" style guess.
 */
export function weekdayMismatch(noticeText: string, date: string): boolean {
  const wd = weekdayName(date);
  if (!wd) return false;
  if (noticeText.includes(date)) return false;
  const lower = noticeText.toLowerCase();
  const named = DAYS.filter((d) => new RegExp(`\\b${d}\\b`).test(lower));
  return named.length > 0 && !named.includes(wd);
}

/**
 * Reason to ask the user to double-check an AI-resolved date, based only on the source text
 * (never on a weekday the AI claims). Returns null when nothing looks off.
 */
export function dateReviewReason(noticeText: string, date: string): string | null {
  if (weekdayMismatch(noticeText, date)) {
    return `the notice names a different weekday than ${weekdayName(date)} ${date}`;
  }
  const lower = noticeText.toLowerCase();
  const next = DAYS.find((d) => new RegExp(`\\bnext\\s+${d}\\b`).test(lower));
  if (next && !noticeText.includes(date)) {
    return `"next ${next}" can mean the coming ${next} or the one after; resolved to ${weekdayName(date)} ${date}`;
  }
  return null;
}
