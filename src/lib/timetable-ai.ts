import { ai, parseJSON } from "./client";
import {
  canonicalSubject,
  classifySubject,
  extractTimetable,
  type ClassKind,
  type TimetableDraft,
} from "./timetable";

export type TimetableResult = {
  entries: TimetableDraft[];
  subjects: { name: string; kind: ClassKind }[];
  effective: string;
};

/**
 * One AI request: turn timetable text into reviewable weekly class entries.
 * Shared by the Scanner and the Calendar timetable import. Ambiguous days/times
 * come back flagged for review; nothing is saved here.
 */
export async function aiExtractTimetable(
  text: string,
): Promise<{ result?: TimetableResult; error?: string }> {
  const r = await ai("timetable", "Extract the weekly timetable.", text);
  if (r.error) return { error: r.error };
  const arr = parseJSON<
    {
      subject?: string;
      kind?: string;
      day?: number;
      start?: string;
      end?: string;
      uncertain?: boolean;
    }[]
  >(r.text ?? "");
  if (!arr?.length)
    return {
      error: "AI found no classes. Try Quick extract, a clearer file, or add classes manually.",
    };
  const kinds: ClassKind[] = ["theory", "lab", "practical", "activity"];
  const tm = (v?: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v ?? "") ? v! : "");
  const entries: TimetableDraft[] = arr
    .filter((e) => e.subject?.trim())
    .map((e) => {
      const subject = canonicalSubject(String(e.subject));
      const day = Number.isInteger(e.day) && e.day! >= 0 && e.day! <= 6 ? e.day : undefined;
      const start = tm(e.start),
        end = tm(e.end);
      return {
        key: Math.random().toString(36),
        subject,
        kind: kinds.includes(e.kind as ClassKind)
          ? (e.kind as ClassKind)
          : classifySubject(subject),
        day,
        start,
        end,
        uncertain: !!e.uncertain || day == null || !start || !end || end <= start,
        source: "AI",
      };
    });
  const local = extractTimetable(text);
  const subjects = [
    ...new Map(
      entries.map((e) => [e.subject.toLowerCase(), { name: e.subject, kind: e.kind }]),
    ).values(),
  ];
  return { result: { entries, subjects, effective: local.effective } };
}
