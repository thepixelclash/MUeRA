import type { Slot } from "./store";

export type ClassKind = "theory" | "lab" | "practical" | "activity";
export type TimetableDraft = {
  key: string;
  subject: string;
  kind: ClassKind;
  day?: number;
  start: string;
  end: string;
  uncertain: boolean;
  source: string;
};
export const THEORY_SUBJECTS = [
  "Digital System & Computer Organization",
  "Foundations of AI and Emerging Technologies",
  "Fundamental of Computer & Web Technologies",
  "Environmental Management",
];
const KNOWN = [
  ...THEORY_SUBJECTS.map((name, i) => ({
    name,
    aliases: [
      ["DSCO", "DS & CO", "DS&CO"],
      ["FAI", "FAIET", "AIET", "FAI & ET"],
      ["FCWT", "FC & WT", "FC&WT"],
      ["EM", "EVS"],
    ][i],
  })),
  { name: "Communicative English", aliases: ["CE"] },
  { name: "Problem Solving and Computational Thinking", aliases: ["PSCT", "PS & CT", "PS&CT"] },
];
export const normalizeSubject = (s: string) =>
  s
    .toLowerCase()
    .replace(/\band\b/g, "&")
    .replace(/[^a-z0-9]/g, "");
export function classifySubject(name: string): ClassKind {
  if (/\blab(?:oratory)?\b/i.test(name)) return "lab";
  if (/practical|communicative english|problem solving/i.test(name)) return "practical";
  if (/break|lunch|library|sports|activity|mentor/i.test(name)) return "activity";
  return "theory";
}
export function canonicalSubject(raw: string, legends: Record<string, string> = {}): string {
  const clean = raw.trim().replace(/\s+/g, " ");
  const lab = /\blab(?:oratory)?\b|\(L\)/i.test(clean);
  const base = clean.replace(/\blab(?:oratory)?\b|\(L\)/gi, "").trim();
  const normalized = normalizeSubject(base.replace(/\bFoundations of Al\b/i, "Foundations of AI"));
  const legend = Object.entries(legends).find(([a]) => normalizeSubject(a) === normalized)?.[1];
  const known = KNOWN.find(
    (s) =>
      normalizeSubject(s.name) === normalized ||
      s.aliases.some((a) => normalizeSubject(a) === normalized),
  );
  return (legend ?? known?.name ?? base) + (lab ? " Lab" : "");
}
const DAYS =
  /\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i;
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const RANGE =
  /(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)\s*[-–—]\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)/gi;
function time(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i);
  if (!m) return "";
  let h = Number(m[1]);
  const minutes = Number(m[2] ?? 0);
  if (m[3]) {
    if (h < 1 || h > 12) return "";
    h = (h % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0);
  }
  if (h > 23 || minutes > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function effectiveDate(text: string): string {
  const line = text.split("\n").find((l) => /effective|w\.?e\.?f|with effect/i.test(l)) ?? "";
  const iso = line.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso && validDate(iso[0])) return iso[0];
  const numeric = line.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (numeric) {
    const d = `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
    return validDate(d) ? d : "";
  }
  const named = line.match(
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  );
  if (!named) return "";
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const d = `${named[3]}-${String(months.indexOf(named[2].toLowerCase()) + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  return validDate(d) ? d : "";
}
export function validEntry(d: Pick<TimetableDraft, "subject" | "day" | "start" | "end">): boolean {
  return (
    !!d.subject.trim() &&
    d.day != null &&
    d.day >= 0 &&
    d.day <= 6 &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(d.start) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(d.end) &&
    d.end > d.start
  );
}
export function extractTimetable(text: string): {
  entries: TimetableDraft[];
  subjects: { name: string; kind: ClassKind }[];
  effective: string;
} {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const legends: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z][A-Z0-9 &./-]{1,18})\s*(?:=|:|\|)\s*(.{8,})$/);
    if (m && !DAYS.test(m[1]) && !/time|day/i.test(m[1]))
      legends[m[1].trim()] = canonicalSubject(m[2]);
  }
  const subjects = new Map<string, { name: string; kind: ClassKind }>();
  const addSubject = (name: string) => {
    if (!name || /^(break|lunch|recess|free|off|—|-|time|day)$/i.test(name)) return;
    subjects.set(normalizeSubject(name), { name, kind: classifySubject(name) });
  };
  Object.values(legends).forEach(addSubject);
  // Names in the document's subject legend are retained even if their grid cell is unreadable.
  for (const item of KNOWN) {
    const normalizedText = normalizeSubject(text);
    if (normalizedText.includes(normalizeSubject(item.name))) {
      const matchingLines = lines.filter((l) =>
        normalizeSubject(l).includes(normalizeSubject(item.name)),
      );
      if (matchingLines.some((l) => !/\blab\b/i.test(l))) addSubject(item.name);
      if (matchingLines.some((l) => /\blab\b/i.test(l))) addSubject(item.name + " Lab");
    }
  }
  let header: { start: string; end: string }[] = [];
  const entries: TimetableDraft[] = [];
  const push = (raw: string, day: number | undefined, start = "", end = "", source = raw) => {
    const subject = canonicalSubject(raw.replace(/\b(?:room|faculty)\s*:.*$/i, ""), legends);
    if (!subject || /^(break|lunch|recess|free|off|—|-)$/i.test(subject)) return;
    addSubject(subject);
    const d = {
      key: `draft-${entries.length}`,
      subject,
      kind: classifySubject(subject),
      day,
      start,
      end,
      source,
      uncertain: false,
    };
    d.uncertain =
      !validEntry(d) ||
      (!KNOWN.some((k) => subject.startsWith(k.name)) && !Object.values(legends).includes(subject));
    entries.push(d);
  };
  let currentDay: number | undefined;
  for (const line of lines) {
    const dayMatch = line.match(DAYS);
    const ranges = [...line.matchAll(RANGE)].map((m) => ({
      raw: m[0],
      start: time(m[1]),
      end: time(m[2]),
    }));
    if (!dayMatch && ranges.length > 1) {
      header = ranges;
      continue;
    }
    if (dayMatch) currentDay = DAY_NAMES.indexOf(dayMatch[1].slice(0, 3).toLowerCase());
    if (currentDay == null) continue;
    if (!dayMatch && !ranges.length) continue;
    const body = line
      .replace(DAYS, "")
      .replace(/^\s*[|:]+/, "")
      .trim();
    if (ranges.length === 1) {
      const raw = body.replace(ranges[0].raw, "").replace(/^[|:\s]+|[|:\s]+$/g, "");
      if (raw) push(raw, currentDay, ranges[0].start, ranges[0].end, line);
    } else {
      const cells = body.split(/\s*\|\s*|\t+|\s{2,}/).filter((c) => c.trim());
      if (header.length && cells.length) {
        cells.forEach((cell, i) =>
          push(cell, currentDay, header[i]?.start ?? "", header[i]?.end ?? "", line),
        );
        if (cells.length !== header.length)
          entries.slice(-cells.length).forEach((e) => {
            e.start = "";
            e.end = "";
            e.uncertain = true;
          });
      } else if (body) push(body, currentDay, "", "", line);
    }
  }
  const unique = entries.filter(
    (d, i) =>
      entries.findIndex(
        (e) =>
          `${normalizeSubject(e.subject)}|${e.day}|${e.start}|${e.end}` ===
          `${normalizeSubject(d.subject)}|${d.day}|${d.start}|${d.end}`,
      ) === i,
  );
  return { entries: unique, subjects: [...subjects.values()], effective: effectiveDate(text) };
}
export function slotOccursOn(slot: Slot, date: string): boolean {
  return (
    validDate(date) &&
    new Date(date + "T00:00").getDay() === slot.day &&
    (!slot.effectiveDate || date >= slot.effectiveDate) &&
    (!slot.endDate || date <= slot.endDate) &&
    (!slot.singleDate || date === slot.singleDate)
  );
}
export function slotIdentity(slot: Pick<Slot, "day" | "start" | "end" | "subject">) {
  return `${normalizeSubject(slot.subject)}|${slot.day}|${slot.start}|${slot.end}`;
}
