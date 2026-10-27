/**
 * Server-side guard for the AI endpoint: verifies the caller's Supabase session
 * token and applies a per-user rate limit. No secrets are read here except the
 * public Supabase URL and anon key, which are used only to ask Supabase "who is
 * this token?".
 */

export type GuardResult =
  { ok: true; userId: string } | { ok: false; status: number; error: string };

type Limiter = { hits: Map<string, number[]> };

const WINDOW_MS = 60_000;
export const DEFAULT_PER_MINUTE = 12;
export const DEFAULT_PER_DAY = 200;

const minute: Limiter = { hits: new Map() };
const day: Limiter = { hits: new Map() };

function envOf(name: string): string | undefined {
  const v = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return v && v.trim() ? v.trim() : undefined;
}

/** Sliding-window check. Returns true when the call is allowed (and records it). */
export function allowCall(
  limiter: Limiter,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const arr = (limiter.hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    limiter.hits.set(key, arr);
    return false;
  }
  arr.push(now);
  limiter.hits.set(key, arr);
  if (limiter.hits.size > 5000) {
    for (const [k, v] of limiter.hits)
      if (!v.some((t) => now - t < windowMs)) limiter.hits.delete(k);
  }
  return true;
}

export function rateLimit(userId: string, now = Date.now()): GuardResult {
  const perMin = Number(envOf("AI_RATE_PER_MINUTE")) || DEFAULT_PER_MINUTE;
  const perDay = Number(envOf("AI_RATE_PER_DAY")) || DEFAULT_PER_DAY;
  if (!allowCall(minute, userId, perMin, WINDOW_MS, now))
    return {
      ok: false,
      status: 429,
      error: "Too many AI requests. Please wait a minute and try again.",
    };
  if (!allowCall(day, userId, perDay, 86_400_000, now))
    return { ok: false, status: 429, error: "Daily AI limit reached. Non-AI features still work." };
  return { ok: true, userId };
}

/** Verifies a Supabase access token by asking the Supabase Auth server. */
export async function verifyToken(
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<GuardResult> {
  const url = envOf("SUPABASE_URL") ?? envOf("VITE_SUPABASE_URL");
  const anon = envOf("SUPABASE_ANON_KEY") ?? envOf("VITE_SUPABASE_ANON_KEY");
  if (!url || !anon)
    return { ok: false, status: 503, error: "Server is missing Supabase configuration." };
  if (!token) return { ok: false, status: 401, error: "Please sign in to use AI features." };
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!res.ok)
      return { ok: false, status: 401, error: "Your session expired. Please sign in again." };
    const user = (await res.json()) as { id?: string };
    if (!user?.id)
      return { ok: false, status: 401, error: "Your session expired. Please sign in again." };
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, status: 503, error: "Could not verify your session. Try again." };
  }
}

export async function guard(token: string | undefined, fetchImpl: typeof fetch = fetch) {
  const v = await verifyToken(token, fetchImpl);
  if (!v.ok) return v;
  return rateLimit(v.userId);
}

export function _resetLimitersForTests() {
  minute.hits.clear();
  day.hits.clear();
}
