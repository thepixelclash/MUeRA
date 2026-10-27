import { describe, expect, it } from "vitest";
import { runTaskCommand, parseDate, parseTime, parseDuration, type Pending } from "./task-commands";
import type { State, Task } from "./store";

const TODAY = "2026-10-26"; // Monday
const base = (tasks: Task[] = []): State => ({
  tasks,
  subjects: [{ id: "s1", name: "Maths", difficulty: 3, attended: 1, conducted: 2 }],
  timetable: [],
  docs: [],
  settings: { threshold: 75, studyHoursPerDay: 2, sessionMin: 45, studyStart: "18:00" },
  chat: [],
  planNote: "",
  aiCalls: 0,
  attendanceRecords: [],
});
const t = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id,
  title,
  subject: "General",
  type: "assignment",
  date: "2026-10-30",
  done: false,
  ...extra,
});
function harness(tasks: Task[] = []) {
  const s = base(tasks);
  const api = {
    addTask: (x: Omit<Task, "id" | "done"> & { done?: boolean }) =>
      s.tasks.push({ id: `n${s.tasks.length}`, done: false, ...x }),
    updateTask: (id: string, p: Partial<Task>) => {
      s.tasks = s.tasks.map((x) => (x.id === id ? { ...x, ...p } : x));
    },
    deleteTask: (id: string) => {
      s.tasks = s.tasks.filter((x) => x.id !== id);
    },
  };
  let pending: Pending = null;
  const run = (q: string) => {
    const o = runTaskCommand(q, s, TODAY, api, pending);
    pending = o?.pending ?? null;
    return o?.reply ?? null;
  };
  return { s, run };
}

describe("parsers", () => {
  it("dates", () => {
    expect(parseDate("tomorrow", TODAY)).toBe("2026-10-27");
    expect(parseDate("next friday", TODAY)).toBe("2026-11-06");
    expect(parseDate("on 2026-02-31", TODAY)).toBe("invalid");
    expect(parseDate("whenever", TODAY)).toBeNull();
  });
  it("times and durations", () => {
    expect(parseTime("at 6pm")).toBe("18:00");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("at 25:00")).toBe("invalid");
    expect(parseDuration("for 90 minutes")).toBe(90);
    expect(parseDuration("2 hours")).toBe(120);
  });
});

describe("task CRUD commands", () => {
  it("adds a task with date, time, priority", () => {
    const h = harness();
    expect(h.run("add finish physics report tomorrow at 5pm high priority")).toMatch(/Added/);
    expect(h.s.tasks[0]).toMatchObject({
      date: "2026-10-27",
      time: "17:00",
      priority: "high",
      type: "assignment",
    });
  });
  it("infers task type from whole words only", () => {
    const h = harness();
    h.run("add maths quiz tomorrow");
    h.run("add buy the latest notebook tomorrow");
    h.run("add contest registration tomorrow");
    h.run("add physics midterm tomorrow");
    h.run("add call mom tomorrow");
    h.run("add MUeRA live sync test tomorrow");
    h.run("add unit test tomorrow");
    h.run("add Maths test tomorrow");
    h.run("add test on chapter 3 tomorrow");
    expect(h.s.tasks.map((x) => x.type)).toEqual([
      "quiz",
      "personal",
      "personal",
      "exam",
      "personal",
      "personal",
      "quiz",
      "quiz",
      "quiz",
    ]);
  });
  it("asks for a date instead of guessing, adds nothing", () => {
    const h = harness();
    expect(h.run("add finish physics report")).toMatch(/When is/);
    expect(h.s.tasks).toHaveLength(0);
  });
  it("rejects impossible and past dates", () => {
    const h = harness();
    expect(h.run("add essay on 2026-02-31")).toMatch(/doesn't exist/);
    expect(h.run("add essay on 2026-01-05")).toMatch(/past/);
    expect(h.s.tasks).toHaveLength(0);
  });
  it("edits deadline, priority and duration", () => {
    const h = harness([t("1", "Lab report")]);
    expect(h.run("move lab report to friday at 4pm")).toMatch(/Updated/);
    expect(h.s.tasks[0]).toMatchObject({ date: "2026-10-30", time: "16:00" });
    h.run("set priority of lab report to high");
    expect(h.s.tasks[0].priority).toBe("high");
    h.run("set duration of lab report to 90 minutes");
    expect(h.s.tasks[0].durationMin).toBe(90);
  });
  it("asks which task when ambiguous and changes nothing", () => {
    const h = harness([t("1", "Lab report A"), t("2", "Lab report B")]);
    expect(h.run("mark lab report as done")).toMatch(/more than one/);
    expect(h.s.tasks.every((x) => !x.done)).toBe(true);
  });
  it("completes a unique task", () => {
    const h = harness([t("1", "Lab report")]);
    h.run("mark lab report as done");
    expect(h.s.tasks[0].done).toBe(true);
  });
  it("delete needs confirmation; no keeps it, yes deletes", () => {
    const h = harness([t("1", "Lab report")]);
    expect(h.run("delete lab report")).toMatch(/Reply “yes”/);
    expect(h.s.tasks).toHaveLength(1);
    h.run("no");
    expect(h.s.tasks).toHaveLength(1);
    h.run("delete lab report");
    h.run("yes");
    expect(h.s.tasks).toHaveLength(0);
  });
  it("unknown task: reports and deletes nothing", () => {
    const h = harness([t("1", "Lab report")]);
    expect(h.run("delete chemistry")).toMatch(/couldn't find/);
    expect(h.s.tasks).toHaveLength(1);
  });
  it("creates a study session with defaults from settings", () => {
    const h = harness();
    expect(h.run("schedule a 45 minute study session for maths tomorrow at 6pm")).toMatch(
      /Created/,
    );
    expect(h.s.tasks[0]).toMatchObject({
      type: "study",
      subject: "Maths",
      date: "2026-10-27",
      time: "18:00",
      durationMin: 45,
    });
  });
  it("study session without a day asks which day", () => {
    const h = harness();
    expect(h.run("schedule a study session")).toMatch(/Which day/);
    expect(h.s.tasks).toHaveLength(0);
  });
  it("does not treat questions as commands", () => {
    expect(harness().run("What should I study today?")).toBeNull();
  });
});
