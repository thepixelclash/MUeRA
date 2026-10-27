import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Settings, Subject, Task } from "./store";

const BASE: Record<string, number> = { exam: 360, quiz: 180, assignment: 150 };

export function requiredMinutes(task: Task, difficulty = 3) {
  const base = BASE[task.type] ?? 0;
  return Math.round((base * (0.6 + difficulty * 0.2)) / 15) * 15;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export type PlanResult = { tasks: Task[]; note: string };

/**
 * Deterministic planner. Keeps all completed sessions, drops pending/missed planned sessions,
 * and re-schedules remaining work from `todayStr` onward, highest urgency first.
 */
export function buildPlan(
  all: Task[],
  subjects: Subject[],
  settings: Settings,
  todayStr: string,
  nowMin = 0,
): PlanResult {
  const start = parseISO(todayStr);
  const kept = all.filter((t) => !t.planned || t.done);
  const oldPending = all.filter((t) => t.planned && !t.done);
  const missed = oldPending.filter((t) => t.date < todayStr).length;
  const diff = (s: string) =>
    subjects.find((x) => x.name.toLowerCase() === s.toLowerCase())?.difficulty ?? 3;

  const targets = all
    .filter((t) => BASE[t.type] && !t.done && t.date >= todayStr)
    .map((t) => {
      const doneMin = kept
        .filter((s) => s.forTaskId === t.id && s.done)
        .reduce((a, s) => a + (s.durationMin ?? 0), 0);
      const lastDay =
        t.type === "assignment" ? t.date : format(addDays(parseISO(t.date), -1), "yyyy-MM-dd");
      return {
        t,
        remaining: Math.max(0, requiredMinutes(t, diff(t.subject)) - doneMin),
        lastDay,
        difficulty: diff(t.subject),
      };
    })
    .filter((x) => x.remaining > 0);

  const cap = Math.max(15, settings.studyHoursPerDay * 60);
  const len = Math.max(15, settings.sessionMin);
  const out: Task[] = [];
  const horizon = targets.reduce(
    (m, x) => Math.max(m, differenceInCalendarDays(parseISO(x.lastDay), start)),
    0,
  );

  for (let i = 0; i <= horizon; i++) {
    const day = format(addDays(start, i), "yyyy-MM-dd");
    let used = kept
      .filter((s) => s.planned && s.date === day)
      .reduce((a, s) => a + (s.durationMin ?? 0), 0);
    let clock = toMin(settings.studyStart);
    if (i === 0 && nowMin > clock) clock = Math.ceil(nowMin / 15) * 15;
    if (clock >= 24 * 60) continue;
    while (used + 15 <= cap && clock + 15 <= 24 * 60) {
      const open = targets.filter((x) => x.remaining > 0 && x.lastDay >= day);
      if (!open.length) break;
      open.sort((a, b) => {
        const ua =
          a.remaining / (differenceInCalendarDays(parseISO(a.lastDay), parseISO(day)) + 1) +
          a.difficulty * 5;
        const ub =
          b.remaining / (differenceInCalendarDays(parseISO(b.lastDay), parseISO(day)) + 1) +
          b.difficulty * 5;
        return ub - ua;
      });
      const x = open[0];
      const dur = Math.min(len, x.remaining, cap - used, 24 * 60 - clock);
      out.push({
        id: Math.random().toString(36).slice(2, 10),
        title: `Study: ${x.t.title}`,
        subject: x.t.subject,
        type: "study",
        date: day,
        time: toTime(clock),
        durationMin: dur,
        done: false,
        planned: true,
        forTaskId: x.t.id,
        reminderMin: 10,
      });
      x.remaining -= dur;
      used += dur;
      clock += dur + 10;
    }
  }

  const short = targets.filter((x) => x.remaining > 0);
  const lines = [
    `Planned ${out.length} session(s) for ${targets.length} upcoming deadline(s), max ${settings.studyHoursPerDay} h/day in ${len}-min blocks from ${settings.studyStart}.`,
    missed ? `${missed} missed session(s) were moved into the remaining days.` : "",
    `${kept.filter((t) => t.planned && t.done).length} completed session(s) kept and counted.`,
    ...short.map(
      (x) =>
        `⚠ Not enough time for "${x.t.title}" — ${x.remaining} min short. Add study hours or start earlier.`,
    ),
  ].filter(Boolean);
  return { tasks: [...kept, ...out], note: lines.join("\n") };
}
