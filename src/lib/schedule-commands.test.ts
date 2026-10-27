import { describe, expect, it } from "vitest";
import { parseRange, runScheduleCommand, type SchedulePending } from "./schedule-commands";
import type { Slot, State } from "./store";

function harness(timetable: Slot[]) {
  const s = { timetable } as State;
  let pending: SchedulePending = null;
  const api = {
    addSlot: (x: Omit<Slot, "id">) => s.timetable.push({ id: `n${s.timetable.length}`, ...x }),
    updateSlot: (id: string, p: Partial<Slot>) => {
      s.timetable = s.timetable.map((x) => (x.id === id ? { ...x, ...p } : x));
    },
    deleteSlot: (id: string) => {
      s.timetable = s.timetable.filter((x) => x.id !== id);
    },
  };
  return {
    s,
    run: (q: string) => {
      const o = runScheduleCommand(q, s, api, pending);
      pending = o?.pending ?? null;
      return o?.reply ?? null;
    },
  };
}
const slot = (id: string, subject: string, day: number, start: string, end: string): Slot => ({
  id,
  subject,
  day,
  start,
  end,
});
const base = () => [
  slot("1", "Maths", 1, "09:00", "10:00"),
  slot("2", "Maths", 3, "09:00", "10:00"),
  slot("3", "Physics", 2, "11:00", "12:00"),
];

describe("timetable chat commands", () => {
  it("parses ranges", () => {
    expect(parseRange("10am-11am")).toEqual({ start: "10:00", end: "11:00" });
    expect(parseRange("10 to 11am")).toEqual({ start: "10:00", end: "11:00" });
    expect(parseRange("at 2pm")).toEqual({ start: "14:00" });
    expect(parseRange("at 25:00").bad).toBe(true);
  });
  it("moves a class keeping its length", () => {
    const h = harness(base());
    expect(h.run("move physics class to 2pm")).toMatch(/Moved/);
    expect(h.s.timetable.find((x) => x.id === "3")).toMatchObject({ start: "14:00", end: "15:00" });
  });
  it("asks which class when ambiguous, changes nothing", () => {
    const h = harness(base());
    expect(h.run("move maths class to 2pm")).toMatch(/Which one/);
    expect(h.s.timetable[0].start).toBe("09:00");
  });
  it("moves to another weekday with weekday disambiguation", () => {
    const h = harness(base());
    h.run("move maths class on monday to friday 2pm-3pm");
    expect(h.s.timetable[0]).toMatchObject({ day: 5, start: "14:00", end: "15:00" });
  });
  it("refuses overlaps and bad times", () => {
    const h = harness(base());
    expect(h.run("move physics class to monday 9:30am")).toMatch(/overlaps/);
    expect(h.run("move physics class to 25:00")).toMatch(/couldn't read/);
    expect(h.s.timetable.find((x) => x.id === "3")!.start).toBe("11:00");
  });
  it("does not invent classes", () => {
    const h = harness(base());
    expect(h.run("move chemistry class to 2pm")).toMatch(/don't invent/);
  });
  it("removal asks first", () => {
    const h = harness(base());
    expect(h.run("cancel physics class")).toMatch(/Reply “yes”/);
    expect(h.s.timetable).toHaveLength(3);
    h.run("yes");
    expect(h.s.timetable).toHaveLength(2);
  });
  it("adds a class and rejects overlap", () => {
    const h = harness(base());
    expect(h.run("add class Chemistry on friday 10am-11am in Lab 3")).toMatch(/Added/);
    expect(h.s.timetable.at(-1)).toMatchObject({
      subject: "Chemistry",
      day: 5,
      start: "10:00",
      end: "11:00",
    });
    expect(h.run("add class Biology on friday 10:30am-11:30am")).toMatch(/overlaps/);
  });
  it("ignores non-class messages", () => {
    expect(harness(base()).run("add task finish essay tomorrow")).toBeNull();
  });
});
