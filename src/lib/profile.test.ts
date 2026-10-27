import { describe, expect, it } from "vitest";
import { firstNameFromMeta } from "./profile";
describe("firstNameFromMeta", () => {
  it("uses given_name, then full_name, then name", () => {
    expect(firstNameFromMeta({ given_name: "axel", full_name: "Axel Jp" })).toBe("Axel");
    expect(firstNameFromMeta({ full_name: "Priya Sharma" })).toBe("Priya");
    expect(firstNameFromMeta({ name: "ravi k" })).toBe("Ravi");
    expect(firstNameFromMeta({ full_name: "ARYAN SINGH" })).toBe("Aryan");
  });
  it("returns null when missing or odd, never from email", () => {
    expect(firstNameFromMeta({ email: "x@y.com" })).toBeNull();
    expect(firstNameFromMeta(null)).toBeNull();
    expect(firstNameFromMeta({ name: "  " })).toBeNull();
    expect(firstNameFromMeta({ name: "a".repeat(40) })).toBeNull();
  });
});
