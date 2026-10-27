/**
 * Deterministic chat commands for the weekly class timetable (no AI).
 * Add / move / cancel a class slot. Deleting asks for confirmation. Ambiguity gets a question.
 */
import type { Slot, State } from "./store";
import { normalizeSubject, validEntry } from "./timetable";

export type SchedulePending = { kind: "deleteSlot"; slotId: string; label: string } | null;
export type ScheduleApi = {
  addSlot: (s: Omit<Slot, "id">) => void;
  updateSlot: (id: string, p: Partial<Slot>) => void;
  deleteSlot: (id: string) => void;
};
export type ScheduleOutcome = { reply: string; pending: SchedulePending };

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const label = (x: Slot) =>
  `${x.subject} on ${DAYS[x.day][0].toUpperCase()}${DAYS[x.day].slice(1)} ${x.start}-${x.end}`;
const timeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

function toHHMM(raw: string): string | "invalid" | null {
  const m = raw.trim().match(timeRe);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap) {
    if (h < 1 || h > 12) return "invalid";
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  } else if (!m[2]) return "invalid"; // bare number like "10" is ambiguous
  if (h > 23 || min > 59) return "invalid";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Parses "10am", "10am-11am", "10 to 11am", "09:00 to 10:30". Returns [start, end?]. */
export function parseRange(text: string): { start?: string; end?: string; bad?: boolean } {
  const m = text.match(
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  );
  if (m) {
    let a = m[1];
    const b = m[2];
    // "10 to 11am" -> inherit am/pm from the end
    const ap = b.match(/(am|pm)/i)?.[1];
    if (ap && !/(am|pm)/i.test(a)) a = `${a}${ap}`;
    const s = toHHMM(a);
    const e = toHHMM(b);
    if (s === "invalid" || e === "invalid" || !s || !e) return { bad: true };
    return { start: s, end: e };
  }
  const one = text.match(
    /(?:^|\s)(?:at\s+|to\s+)?(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))/i,
  );
  if (one) {
    const s = toHHMM(one[1]);
    if (s === "invalid" || !s) return { bad: true };
    return { start: s };
  }
  return {};
}

function dayOf(text: string): number | null {
  const m = text
    .toLowerCase()
    .match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/);
  return m ? DAYS.indexOf(m[1]) : null;
}

function findSlots(s: State, text: string, day: number | null) {
  const l = normalizeSubject(text);
  return s.timetable.filter((x) => {
    const n = normalizeSubject(x.subject);
    return n && l.includes(n) && (day == null || x.day === day);
  });
}

export function runScheduleCommand(
  q: string,
  s: State,
  api: ScheduleApi,
  pending: SchedulePending,
): ScheduleOutcome | null {
  const text = q.trim();
  const l = text.toLowerCase();

  if (pending) {
    if (/^(yes|y|yep|yeah|confirm|do it|sure|ok(ay)?)\b/.test(l)) {
      if (!s.timetable.some((x) => x.id === pending.slotId))
        return { reply: "That class no longer exists. Nothing was removed.", pending: null };
      api.deleteSlot(pending.slotId);
      return { reply: `Removed ${pending.label} from your timetable.`, pending: null };
    }
    if (/^(no|n|nope|cancel|don'?t|stop)\b/.test(l))
      return { reply: `OK, I kept ${pending.label}.`, pending: null };
  }

  const isClass = /\b(class|lecture|lab|slot|timetable)\b/.test(l);
  if (!isClass) return null;

  const del = l.match(/^(?:please\s+)?(?:delete|remove|cancel|drop)\s+(?:the\s+|my\s+)?(.+)$/);
  if (del) {
    const day = dayOf(del[1]);
    const m = findSlots(s, del[1], day);
    if (m.length === 1)
      return {
        reply: `Remove ${label(m[0])} from your weekly timetable? Reply “yes” to confirm or “no” to keep it.`,
        pending: { kind: "deleteSlot", slotId: m[0].id, label: label(m[0]) },
      };
    if (m.length > 1)
      return {
        reply: `Which one? ${m.map((x) => `“${label(x)}”`).join(", ")}. Add the weekday to your request.`,
        pending: null,
      };
    return {
      reply: "I couldn't find a class in your timetable matching that. Nothing was removed.",
      pending: null,
    };
  }

  const move = text.match(
    /^(?:please\s+)?(?:move|change|reschedule|shift|update|set)\s+(?:the\s+|my\s+)?(.+?)\s+(?:to|from)\s+(.+)$/i,
  );
  if (move) {
    const day = dayOf(move[1]);
    const m = findSlots(s, move[1], day);
    if (m.length === 0)
      return {
        reply:
          "I couldn't find a class in your timetable matching that. I don't invent timetable entries. Nothing was changed.",
        pending: null,
      };
    if (m.length > 1)
      return {
        reply: `Which one? ${m.map((x) => `“${label(x)}”`).join(", ")}. Add the weekday (for example “${m[0].subject} class on ${DAYS[m[0].day]}”).`,
        pending: null,
      };
    const slot = m[0];
    const target = move[2];
    const newDay = dayOf(target);
    const r = parseRange(target);
    if (r.bad)
      return {
        reply:
          "I couldn't read that time. Use a form like “10am”, “10am-11am” or “14:00 to 15:00”.",
        pending: null,
      };
    const patch: Partial<Slot> = {};
    if (newDay != null) patch.day = newDay;
    if (r.start) {
      patch.start = r.start;
      if (r.end) patch.end = r.end;
      else {
        // keep the original length
        const [sh, sm] = slot.start.split(":").map(Number);
        const [eh, em] = slot.end.split(":").map(Number);
        const len = eh * 60 + em - (sh * 60 + sm);
        const [nh, nm] = r.start.split(":").map(Number);
        const endMin = nh * 60 + nm + len;
        if (endMin >= 24 * 60)
          return {
            reply: "That would run past midnight. Give me a start and end time.",
            pending: null,
          };
        patch.end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      }
    }
    if (!Object.keys(patch).length)
      return {
        reply: `What should change for ${label(slot)}? Give a weekday and/or time, for example “move ${slot.subject} class to Friday 2pm-3pm”.`,
        pending: null,
      };
    const next = { ...slot, ...patch };
    if (!validEntry({ subject: next.subject, day: next.day, start: next.start, end: next.end }))
      return {
        reply: "The end time must be after the start time. Nothing was changed.",
        pending: null,
      };
    const clash = s.timetable.find(
      (x) => x.id !== slot.id && x.day === next.day && x.start < next.end && next.start < x.end,
    );
    if (clash)
      return {
        reply: `That overlaps ${label(clash)}. Pick another time, or move that class first. Nothing was changed.`,
        pending: null,
      };
    api.updateSlot(slot.id, patch);
    return {
      reply: `Moved: ${label(next as Slot)} (was ${label(slot)}). This changes your weekly timetable.`,
      pending: null,
    };
  }

  const add = text.match(
    /^(?:please\s+)?(?:add|create|schedule)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:class|lecture|lab)\s+(?:for\s+|of\s+)?(.+?)\s+(?:on|every)\s+(.+)$/i,
  );
  if (add) {
    const day = dayOf(add[2]);
    const r = parseRange(add[2]);
    if (day == null) return { reply: "Which weekday is the class on?", pending: null };
    if (r.bad || !r.start || !r.end)
      return { reply: "I need a start and end time, for example “10am-11am”.", pending: null };
    const subject = add[1].trim().replace(/[.!?]+$/, "");
    const room = add[2].match(/\b(?:in|at room|room)\s+([A-Za-z0-9-]+(?:\s?\d+)?)\s*$/i)?.[1];
    if (!subject || subject.length > 200)
      return { reply: "What is the class subject called?", pending: null };
    if (!validEntry({ subject, day, start: r.start, end: r.end }))
      return {
        reply: "The end time must be after the start time. Nothing was added.",
        pending: null,
      };
    const clash = s.timetable.find((x) => x.day === day && x.start < r.end! && r.start! < x.end);
    if (clash) return { reply: `That overlaps ${label(clash)}. Nothing was added.`, pending: null };
    api.addSlot({ day, subject, start: r.start, end: r.end, ...(room ? { room } : {}) });
    return {
      reply: `Added ${subject} on ${DAYS[day]} ${r.start}-${r.end} to your weekly timetable.`,
      pending: null,
    };
  }
  return null;
}
