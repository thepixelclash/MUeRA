import { afterEach, describe, expect, it } from "vitest";
import { runAI } from "./ai.server";

const keys = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "LOVABLE_API_KEY"];
afterEach(() => keys.forEach((k) => delete process.env[k]));

describe("AI error handling", () => {
  it("says not configured (503) when no provider credentials exist, never fakes an answer", async () => {
    keys.forEach((k) => delete process.env[k]);
    const r = await runAI("chat", "hello", "");
    expect(r).toMatchObject({ status: 503 });
    expect(JSON.stringify(r)).toMatch(/not configured/i);
  });
  it("partial custom config is treated as not configured", async () => {
    process.env.AI_API_KEY = "x";
    const r = await runAI("chat", "hello", "");
    expect(r).toMatchObject({ status: 503 });
  });
});
