/**
 * Deterministic natural-language task commands (no AI involved).
 * Pure: takes the current state and an API of mutations, returns a reply.
 * Anything ambiguous gets a clarifying question; deletes need a "yes".
 */
import { addDays, format } from "date-fns";
import type { Task, TaskType, State } from "./store";

export type Priority = "low" | "medium" | "high";
export type Pending = { kind: "delete"; taskId: string; title: string } | null;
export type TaskApi = {
  addTask: (t: Omit<Task, "id" | "done"> & { done?: boolean }) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
};
export type Outcome = { reply: string; pending: Pending };

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Returns a date, null when none is mentioned, or "invalid" for an impossible date (e.g. 2026-02-31). */
export function parseDate(text: string, todayStr: string): string | null | "invalid" {
  const t0 = new Date(`${todayStr}T12:00:00`);
  const l = text.toLowerCase();
  const exact = l.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (exact) {
    const d = new Date(`${exact[0]}T12:00:00`);
    return Number.isNaN(d.getTime()) || iso(d) !== exact[0] ? "invalid" : exact[0];
  }
  if (/\btoday\b/.test(l)) return todayStr;
  if (/\btomorrow\b/.test(l)) return iso(addDays(t0, 1));
  const inDays = l.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) return iso(addDays(t0, Number(inDays[1])));
  const wd = l.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (wd) {
    let delta = (DAYS.indexOf(wd[2]) - t0.getDay() + 7) % 7;
    if (!delta) delta = 7;
    if (wd[1]) delta += 7;
    return iso(addDays(t0, delta));
  }
  return null;
}

export function parseTime(text: string): string | null | "invalid" {
  const l = text.toLowerCase();
  const m =
    l.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ||
    l.match(/\bat\s+(\d{1,2}):(\d{2})\b/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3];
  if (ap) {
    if (h < 1 || h > 12) return "invalid";
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return "invalid";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function parseDuration(text: string): number | null {
  const m = text
    .toLowerCase()
    .match(/\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/);
  if (!m) return null;
  const v = Number(m[1]);
  const mins = /^h/.test(m[2]) ? Math.round(v * 60) : Math.round(v);
  return mins >= 1 && mins <= 1440 ? mins : null;
}

export function parsePriority(text: string): Priority | null {
  const m = text
    .toLowerCase()
    .match(/\b(high|medium|low)\s*priority\b|\bpriority\s*(?:to|=|:)?\s*(high|medium|low)\b/);
  return m ? ((m[1] || m[2]) as Priority) : null;
}

const STRIP =
  /\b(today|tomorrow|in\s+\d+\s+days?|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}|(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)|at\s+\d{1,2}:\d{2}|(?:for\s+)?\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?)|(?:high|medium|low)\s*priority|priority\s*(?:to|=|:)?\s*(?:high|medium|low)|with)\b/gi;

const clean = (s: string) =>
  s
    .replace(STRIP, " ")
    .replace(/\b(?:on|for|by|due|at)\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim();

const fmt = (d: string) => format(new Date(`${d}T12:00:00`), "EEEE, d MMM");

function findTasks(s: State, needle: string, onlyOpen = false) {
  const n = needle.toLowerCase().trim();
  if (!n) return [];
  const exact = s.tasks.filter((t) => t.title.toLowerCase() === n && (!onlyOpen || !t.done));
  if (exact.length === 1) return exact;
  return s.tasks.filter(
    (t) =>
      (!onlyOpen || !t.done) &&
      (t.title.toLowerCase().includes(n) ||
        (n.length > 3 && n.includes(t.title.toLowerCase())) ||
        (n.length > 3 && t.subject.toLowerCase() === n)),
  );
}

function pick(s: State, needle: string, verb: string, onlyOpen = false) {
  const m = findTasks(s, needle, onlyOpen);
  if (m.length === 1) return { task: m[0] };
  if (m.length > 1)
    return {
      reply: `I found more than one match: ${m
        .slice(0, 5)
        .map((t) => `“${t.title}”`)
        .join(", ")}. Tell me the exact task title so I ${verb} the right one.`,
    };
  return { reply: `I couldn't find a task matching “${needle}”. Nothing was changed.` };
}

/** "quiz" is a quiz. A bare "test" only counts when it reads as an academic test
 * (qualifier like unit/class/mock, "test on/for ...", or a known subject name in the title);
 * otherwise titles such as "app sync test" stay general tasks. */
function isQuizTitle(lt: string, subjectNames: string[]): boolean {
  if (/\b(quiz|quizzes)\b/.test(lt)) return true;
  if (!/\b(test|tests)\b/.test(lt)) return false;
  if (
    /\b(unit|class|mock|pop|surprise|weekly|chapter|practice|periodic|lab|written|oral|term|entrance|viva|slip)\s+tests?\b/.test(
      lt,
    )
  )
    return true;
  if (/\btests?\s+(on|for|in)\b/.test(lt)) return true;
  return subjectNames.some((n) => n && lt.includes(n));
}

export function runTaskCommand(
  q: string,
  s: State,
  todayStr: string,
  api: TaskApi,
  pending: Pending,
): Outcome | null {
  const text = q.trim();
  const l = text.toLowerCase();

  // Confirmation of a pending destructive action.
  if (pending) {
    if (/^(yes|y|yep|yeah|confirm|do it|sure|ok(ay)?)\b/.test(l)) {
      if (!s.tasks.some((t) => t.id === pending.taskId))
        return { reply: "That task no longer exists. Nothing was deleted.", pending: null };
      api.deleteTask(pending.taskId);
      return { reply: `Deleted “${pending.title}”.`, pending: null };
    }
    if (/^(no|n|nope|cancel|don'?t|stop)\b/.test(l))
      return { reply: `OK, I kept “${pending.title}”.`, pending: null };
  }

  // DELETE (asks first)
  const del = l.match(/^(?:please\s+)?(?:delete|remove|cancel)\s+(?:the\s+)?(?:task\s+)?(.+)$/);
  if (del) {
    const r = pick(s, del[1], "delete");
    if (!r.task) return { reply: r.reply!, pending: null };
    return {
      reply: `Delete “${r.task.title}” (${fmt(r.task.date)})? Reply “yes” to confirm or “no” to keep it.`,
      pending: { kind: "delete", taskId: r.task.id, title: r.task.title },
    };
  }

  // COMPLETE
  const done =
    l.match(
      /^(?:please\s+)?(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)$/,
    ) || l.match(/^(?:please\s+)?(?:complete|finish)\s+(.+)$/);
  if (done) {
    const r = pick(s, done[1].replace(/^task\s+/, ""), "update", true);
    if (!r.task) return { reply: r.reply!, pending: null };
    api.updateTask(r.task.id, { done: true });
    return { reply: `Marked “${r.task.title}” as complete.`, pending: null };
  }

  // SET PRIORITY / DURATION / DEADLINE / EDIT of an existing task
  const setM = text.match(
    /^(?:please\s+)?(?:set|change|update|move|reschedule|edit|rename)\s+(?:the\s+)?(?:(deadline|due date|priority|duration|time|title|name)\s+(?:of|for)\s+)?(.+?)\s+(?:to|=|:|for|by)\s+(.+)$/i,
  );
  if (
    setM &&
    !/^(?:please\s+)?(?:set|change|update)\s+(?:my\s+)?(?:threshold|attendance)/i.test(text)
  ) {
    const field = (setM[1] ?? "").toLowerCase();
    const r = pick(s, setM[2], "change");
    if (!r.task) {
      // not a task edit we understand; let other handlers try
      if (/couldn't find/.test(r.reply!) && !field) return null;
      return { reply: r.reply!, pending: null };
    }
    const value = setM[3];
    const patch: Partial<Task> = {};
    const notes: string[] = [];
    if (field === "title" || field === "name" || /^rename/i.test(text)) {
      const title = value.trim().replace(/[.!?]+$/, "");
      if (!title || title.length > 200)
        return { reply: "That title is empty or too long.", pending: null };
      patch.title = title;
      notes.push(`title “${title}”`);
    } else {
      const d = parseDate(value, todayStr);
      const tm = parseTime(value);
      const du = parseDuration(value);
      const pr =
        parsePriority(value) ??
        (field === "priority"
          ? ((value.match(/\b(high|medium|low)\b/i)?.[1].toLowerCase() as Priority | undefined) ??
            null)
          : null);
      if (d === "invalid")
        return {
          reply:
            "That date doesn't exist. Please give a real date (for example 2026-11-05 or “next Friday”).",
          pending: null,
        };
      if (tm === "invalid")
        return { reply: "I couldn't read that time. Try “6pm” or “18:00”.", pending: null };
      if (d) {
        if (d < todayStr)
          return { reply: `${d} is in the past. Which upcoming date do you mean?`, pending: null };
        patch.date = d;
        notes.push(`date ${fmt(d)}`);
      }
      if (tm) {
        patch.time = tm;
        notes.push(`time ${tm}`);
      }
      if (
        du &&
        (field === "duration" || /\b(for|duration)\b/i.test(text) || r.task.type === "study")
      ) {
        patch.durationMin = du;
        notes.push(`duration ${du} min`);
      }
      if (pr) {
        patch.priority = pr;
        notes.push(`priority ${pr}`);
      }
    }
    if (!Object.keys(patch).length)
      return {
        reply: `What should I change on “${r.task.title}”? Give a date, time, duration or priority, for example “move ${r.task.title} to Friday at 5pm”.`,
        pending: null,
      };
    api.updateTask(r.task.id, patch);
    return { reply: `Updated “${r.task.title}”: ${notes.join(", ")}.`, pending: null };
  }

  // STUDY SESSION
  const study = text.match(
    /^(?:please\s+)?(?:create|add|schedule|plan|book)\s+(?:a\s+|an\s+)?(?:(.+?)\s+)?study session(?:\s+(?:for|on)\s+(.+))?$/i,
  );
  if (study) {
    const rest = `${study[1] ?? ""} ${study[2] ?? ""}`;
    const d = parseDate(rest, todayStr);
    if (d === "invalid")
      return { reply: "That date doesn't exist. Which date do you mean?", pending: null };
    if (!d)
      return {
        reply:
          "Which day should the study session be on? For example “schedule a 45 minute study session for maths tomorrow at 6pm”.",
        pending: null,
      };
    if (d < todayStr)
      return { reply: `${d} is in the past. Which upcoming date do you mean?`, pending: null };
    const tm = parseTime(rest);
    if (tm === "invalid")
      return { reply: "I couldn't read that time. Try “6pm” or “18:00”.", pending: null };
    const subjectName = s.subjects.find((x) =>
      rest.toLowerCase().includes(x.name.toLowerCase()),
    )?.name;
    const topic = clean(rest).replace(/^(?:a|an|the)\s+/i, "");
    const subject = subjectName ?? (topic || "General");
    api.addTask({
      title: `Study: ${subject}`,
      subject,
      type: "study",
      date: d,
      time: tm ?? s.settings.studyStart,
      durationMin: parseDuration(rest) ?? s.settings.sessionMin,
      planned: false,
    });
    return {
      reply: `Created a study session for ${subject} on ${fmt(d)} at ${tm ?? s.settings.studyStart} for ${parseDuration(rest) ?? s.settings.sessionMin} min.`,
      pending: null,
    };
  }

  // ADD
  const add = text.match(
    /^(?:please\s+)?(?:add|create|schedule|remember|remind me to|add a task to|make a task)\s+(.+)$/i,
  );
  if (add) {
    const raw = add[1].trim().replace(/^task\s*[:,-]?\s*/i, "");
    const d = parseDate(raw, todayStr);
    if (d === "invalid")
      return { reply: "That date doesn't exist. Which date do you mean?", pending: null };
    if (d && d < todayStr)
      return { reply: `${d} is in the past. Which upcoming date do you mean?`, pending: null };
    const tm = parseTime(raw);
    if (tm === "invalid")
      return { reply: "I couldn't read that time. Try “6pm” or “18:00”.", pending: null };
    const title = clean(raw);
    if (!title)
      return {
        reply:
          "What should the task be called? Try: “Add task: finish my maths assignment tomorrow.”",
        pending: null,
      };
    if (title.length > 200)
      return { reply: "That title is too long. Please shorten it.", pending: null };
    if (!d)
      return {
        reply: `When is “${title}” due? Say “${text} tomorrow” or give a date like 2026-11-05. I haven't added anything yet.`,
        pending: null,
      };
    const lt = title.toLowerCase();
    const type: TaskType = /\b(exam|exams|midterm|midterms|finals?)\b/.test(lt)
      ? "exam"
      : isQuizTitle(
            lt,
            s.subjects.map((x) => x.name.toLowerCase()),
          )
        ? "quiz"
        : /assignment|homework|submit|project|report/.test(lt)
          ? "assignment"
          : /study|revise|practice|read/.test(lt)
            ? "study"
            : "personal";
    const subject = s.subjects.find((x) => lt.includes(x.name.toLowerCase()))?.name ?? "General";
    const dur = parseDuration(raw);
    const pr = parsePriority(raw);
    api.addTask({
      title,
      subject,
      type,
      date: d,
      done: false,
      ...(tm ? { time: tm } : {}),
      ...(dur
        ? { durationMin: dur }
        : type === "study"
          ? { durationMin: s.settings.sessionMin }
          : {}),
      ...(pr ? { priority: pr } : {}),
      ...(type === "study" ? { planned: false } : {}),
    });
    return {
      reply: `Added “${title}” for ${fmt(d)}${tm ? ` at ${tm}` : ""}${pr ? `, ${pr} priority` : ""}.`,
      pending: null,
    };
  }
  return null;
}
