import { describe, expect, it } from "vitest";
import { dateReviewReason, weekdayMismatch, weekdayName } from "./date-check";

describe("date check", () => {
  it("computes weekdays", () => {
    expect(weekdayName("2026-10-26")).toBe("monday");
    expect(weekdayName("2026-10-30")).toBe("friday");
    expect(weekdayName("nope")).toBeNull();
  });
  it("flags a date whose weekday contradicts the notice", () => {
    expect(weekdayMismatch("Submit the report by next Friday.", "2026-10-28")).toBe(true);
  });
  it("accepts a matching weekday or an explicit date", () => {
    expect(weekdayMismatch("Submit the report by next Friday.", "2026-10-30")).toBe(false);
    expect(weekdayMismatch("Quiz on Friday 2026-10-28", "2026-10-28")).toBe(false);
    expect(weekdayMismatch("Quiz in Room 12 on 31 Oct", "2026-10-31")).toBe(false);
  });
  it("keeps next-weekday notices reviewable even when the weekday matches", () => {
    expect(dateReviewReason("Report due next Friday", "2026-10-30")).toMatch(/next friday/i);
    expect(dateReviewReason("Report due next Friday", "2026-10-28")).toMatch(/different weekday/);
    expect(dateReviewReason("Quiz on Friday", "2026-10-30")).toBeNull();
  });
});
