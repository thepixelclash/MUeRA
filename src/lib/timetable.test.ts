import { beforeEach, describe, expect, it } from "vitest";
import { canonicalSubject, extractTimetable, slotOccursOn, THEORY_SUBJECTS } from "./timetable";
import { actions, getState, type Slot } from "./store";
import { classesNeeded, simulate, attendancePct } from "./attendance";
import { numericDraft } from "./numeric";

export const fixture = `BCA Semester I Section F — effective from 14 September 2026
DSCO: Digital System & Computer Organization
FAIET: Foundations of AI and Emerging Technologies
FCWT: Fundamental of Computer & Web Technologies
EM: Environmental Management
Time | 09:00-10:00 | 10:00-11:00 | 11:00-12:00 | 13:00-14:00
Monday | DSCO | FAIET | FCWT | EM
Tuesday | DSCO Lab | FCWT Lab | CE | PSCT`;

beforeEach(() => actions.wipeAll());
describe("number editing rules", () => {
  it("normalizes 08 to a numeric 8", () => expect(Number(numericDraft("08"))).toBe(8));
  it("allows an empty draft instead of zero", () => expect(numericDraft("")).toBe(""));
  it("allows legitimate zero", () => expect(numericDraft("0")).toBe("0"));
  it.each(["-1", "1.2", "e", "8x"])("rejects invalid integer %s", (input) =>
    expect(numericDraft(input)).toBeNull(),
  );
});
describe("timetable extraction and integration", () => {
  it("extracts all four theory subjects independently", () => {
    const r = extractTimetable(fixture);
    expect(
      r.subjects
        .filter((s) => s.kind === "theory")
        .map((s) => s.name)
        .sort(),
    ).toEqual([...THEORY_SUBJECTS].sort());
    expect(r.entries).toHaveLength(8);
    expect(r.effective).toBe("2026-09-14");
  });
  it("separates labs and practicals", () => {
    const r = extractTimetable(fixture);
    expect(r.entries.slice(4).map((s) => s.kind)).toEqual(["lab", "lab", "practical", "practical"]);
    expect(r.entries[4].subject).toBe("Digital System & Computer Organization Lab");
  });
  it("reliably corrects the OCR AI/Al ambiguity in the known subject name", () => {
    expect(canonicalSubject("Foundations of Al and Emerging Technologies")).toBe(
      THEORY_SUBJECTS[1],
    );
  });
  it("retains partially unreadable sessions without assigning uncertain times", () => {
    const r = extractTimetable(
      fixture.replace("Monday | DSCO | FAIET | FCWT | EM", "Monday | DSCO | FAIET"),
    );
    expect(r.entries.slice(0, 2).every((s) => s.uncertain && s.start === "")).toBe(true);
    expect(r.subjects.filter((s) => s.kind === "theory")).toHaveLength(4);
  });
  it("never reports a successful save for zero sessions", () => {
    const r = actions.saveTimetable([], [], "2026-09-14", "2026-12-31", false, false);
    expect(r.error).toBeTruthy();
    expect(r.saved).toBe(0);
    expect(getState().timetable).toHaveLength(0);
  });
  it("saves valid sessions without silently dropping the partial-extraction outcome", () => {
    const r = extractTimetable(fixture);
    r.entries[0].start = "";
    const saved = actions.saveTimetable(
      r.entries,
      r.subjects,
      r.effective,
      "2026-12-31",
      false,
      false,
    );
    expect(saved.saved).toBe(7);
    expect(getState().subjects).toHaveLength(4);
    expect(r.entries[0].start).toBe("");
  });
  it("creates four attendance subjects and eight distinct weekly slots, not duplicate uploads", () => {
    const r = extractTimetable(fixture);
    const first = actions.saveTimetable(
      r.entries,
      r.subjects,
      r.effective,
      "2026-12-31",
      false,
      false,
    );
    expect(first.theorySaved).toBe(4);
    expect(first.saved).toBe(8);
    expect(
      getState()
        .subjects.map((s) => s.name)
        .sort(),
    ).toEqual([...THEORY_SUBJECTS].sort());
    const second = actions.saveTimetable(
      r.entries,
      r.subjects,
      r.effective,
      "2026-12-31",
      false,
      false,
    );
    expect(second.saved).toBe(0);
    expect(second.error).toBeTruthy();
    expect(getState().subjects).toHaveLength(4);
    expect(getState().timetable).toHaveLength(8);
  });
  it("uses the actual weekday, inclusive effective/end dates and correct times", () => {
    const slot: Slot = {
      id: "x",
      subject: "EM",
      day: 1,
      start: "09:00",
      end: "10:00",
      effectiveDate: "2026-09-14",
      endDate: "2026-09-21",
    };
    expect(slotOccursOn(slot, "2026-09-14")).toBe(true);
    expect(slotOccursOn(slot, "2026-09-21")).toBe(true);
    expect(slotOccursOn(slot, "2026-09-07")).toBe(false);
    expect(slotOccursOn(slot, "2026-09-28")).toBe(false);
    expect(slotOccursOn(slot, "2026-09-15")).toBe(false);
  });
  it("records each session once, corrects statuses and excludes cancelled sessions", () => {
    const r = extractTimetable(fixture);
    r.entries.push({ ...r.entries[0], key: "second", start: "14:00", end: "15:00" });
    actions.saveTimetable(r.entries, r.subjects, r.effective, "2026-12-31", false, false);
    const slots = getState().timetable.filter(
      (s) => s.subject === THEORY_SUBJECTS[0] && s.day === 1,
    );
    expect(getState().subjects[0].conducted).toBe(0);
    actions.recordAttendance(slots[0].id, "2026-09-14", "Present");
    actions.recordAttendance(slots[0].id, "2026-09-14", "Present");
    actions.recordAttendance(slots[1].id, "2026-09-14", "Absent");
    expect(getState().subjects[0].attended).toBe(1);
    expect(getState().subjects[0].conducted).toBe(2);
    expect(getState().subjects[1].conducted).toBe(0);
    expect(getState().attendanceRecords).toHaveLength(2);
    actions.recordAttendance(slots[1].id, "2026-09-14", "Cancelled");
    expect(getState().subjects[0].conducted).toBe(1);
    actions.correctAttendance(getState().attendanceRecords[0].id, "Absent");
    expect(getState().subjects[0].attended).toBe(0);
    actions.correctAttendance(getState().attendanceRecords[0].id, null);
    expect(getState().subjects[0].conducted).toBe(0);
  });
  it("can opt in to lab/practical attendance", () => {
    const r = extractTimetable(fixture);
    actions.saveTimetable(r.entries, r.subjects, r.effective, "2026-12-31", true, false);
    expect(getState().subjects).toHaveLength(8);
  });
});
describe("attendance simulation", () => {
  it("8 out of 11 is 72.7% and needs one consecutive class to reach 75%", () => {
    expect(attendancePct(8, 11)?.toFixed(1)).toBe("72.7");
    expect(classesNeeded(8, 11, 0.75)).toBe(1);
    expect(simulate(8, 11, 1, 0).pct).toBe(75);
  });
  it("simulation never changes real attendance", () => {
    actions.ensureSubject("Environmental Management");
    const before = JSON.stringify(getState());
    simulate(8, 11, 4, 2);
    expect(JSON.stringify(getState())).toBe(before);
  });
  it("handles no conducted classes and impossible 100% targets", () => {
    expect(attendancePct(0, 0)).toBeNull();
    expect(classesNeeded(8, 11, 1)).toBeNull();
    expect(classesNeeded(8, 10, 0.75)).toBe(0);
  });
});
