import { describe, expect, it } from "vitest";
import { classesCanMiss, classesNeeded, attendancePct } from "./attendance";
import { buildPlan } from "./planner";
import { defaultSettings, type Task } from "./store";

describe("attendance", () => {
  it("percentage = attended / conducted × 100", () => expect(attendancePct(30, 40)).toBe(75));
  it("needed classes uses ceil((pT − A)/(1 − p))", () =>
    expect(classesNeeded(20, 32, 0.75)).toBe(16));
  it("needed is 0 when target met", () => expect(classesNeeded(30, 40, 0.75)).toBe(0));
  it("can miss floor(A/p − T)", () => expect(classesCanMiss(30, 34, 0.75)).toBe(6));
  it("100% target with an absence is impossible", () => expect(classesNeeded(9, 10, 1)).toBeNull());
});

describe("planner", () => {
  const quiz: Task = {
    id: "q",
    title: "Quiz",
    subject: "DS",
    type: "quiz",
    date: "2026-01-05",
    done: false,
  };
  it("keeps completed sessions and never overlaps", () => {
    const done: Task = {
      id: "s",
      title: "Study",
      subject: "DS",
      type: "study",
      date: "2025-12-30",
      durationMin: 45,
      done: true,
      planned: true,
      forTaskId: "q",
    };
    const missed: Task = { ...done, id: "m", done: false };
    const r = buildPlan([quiz, done, missed], [], defaultSettings, "2026-01-01");
    expect(r.tasks.find((t) => t.id === "s")).toBeTruthy();
    expect(r.tasks.find((t) => t.id === "m")).toBeFalsy();
    const byDay: Record<string, string[]> = {};
    r.tasks
      .filter((t) => t.planned && !t.done)
      .forEach((t) => (byDay[t.date] ??= []).push(t.time!));
    Object.values(byDay).forEach((times) => expect(new Set(times).size).toBe(times.length));
    expect(r.tasks.every((t) => !t.planned || t.date < "2026-01-05")).toBe(true);
  });
});
