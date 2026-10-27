import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetLimitersForTests, allowCall, guard, verifyToken } from "./ai-guard";

const okFetch = (id = "u1") =>
  vi.fn(
    async () => new Response(JSON.stringify({ id }), { status: 200 }),
  ) as unknown as typeof fetch;

beforeEach(() => {
  _resetLimitersForTests();
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-placeholder";
  delete process.env.AI_RATE_PER_MINUTE;
});

describe("AI guard", () => {
  it("rejects missing token with 401", async () => {
    const r = await verifyToken(undefined, okFetch());
    expect(r).toMatchObject({ ok: false, status: 401 });
  });
  it("rejects a token Supabase refuses", async () => {
    const f = vi.fn(async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    expect(await verifyToken("bad", f)).toMatchObject({ ok: false, status: 401 });
  });
  it("accepts a valid token and returns the verified user id", async () => {
    expect(await verifyToken("good", okFetch("abc"))).toEqual({ ok: true, userId: "abc" });
  });
  it("503 when Supabase is not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    expect(await verifyToken("t", okFetch())).toMatchObject({ ok: false, status: 503 });
  });
  it("503 when verification network fails", async () => {
    const f = vi.fn(async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    expect(await verifyToken("t", f)).toMatchObject({ ok: false, status: 503 });
  });
  it("rate limits per user", async () => {
    process.env.AI_RATE_PER_MINUTE = "2";
    const f = okFetch("u1");
    expect((await guard("t", f)).ok).toBe(true);
    expect((await guard("t", f)).ok).toBe(true);
    expect(await guard("t", f)).toMatchObject({ ok: false, status: 429 });
    const other = await guard("t", okFetch("u2"));
    expect(other.ok).toBe(true);
  });
  it("sliding window expires", () => {
    const l = { hits: new Map<string, number[]>() };
    expect(allowCall(l, "k", 1, 1000, 0)).toBe(true);
    expect(allowCall(l, "k", 1, 1000, 500)).toBe(false);
    expect(allowCall(l, "k", 1, 1000, 1500)).toBe(true);
  });
});
