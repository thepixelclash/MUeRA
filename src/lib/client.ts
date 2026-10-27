import { askAI } from "./ai.functions";
import { setState } from "./store";

export type Mode =
  | "summary"
  | "notes"
  | "quiz"
  | "flashcards"
  | "extract"
  | "chat"
  | "plan"
  | "recovery"
  | "timetable";

/** Static hosting: the AI runs on a separate endpoint (for example hosting/php-api/ai.php). */
async function callEndpoint(
  url: string,
  mode: Mode,
  prompt: string,
  context: string,
  token?: string,
): Promise<{ text?: string; error?: string; status?: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}`, "X-Session-Token": token } : {}),
    },
    body: JSON.stringify({ mode, prompt: prompt.slice(0, 4000), context: context.slice(0, 30000) }),
  });
  try {
    const j = (await res.json()) as { text?: string; error?: string; status?: number };
    return res.ok ? j : { error: j.error ?? "AI request failed.", status: j.status ?? res.status };
  } catch {
    return { error: "The AI service returned an unreadable answer.", status: res.status || 502 };
  }
}

/** Single reusable AI entry point. Counts calls so the student can see usage. */
export async function ai(
  mode: Mode,
  prompt: string,
  context = "",
): Promise<{ text?: string; error?: string; noCredit?: boolean }> {
  setState((s) => ({ aiCalls: s.aiCalls + 1 }));
  try {
    const { supabase } = await import("./supabase");
    const { data: sess } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const endpoint = import.meta.env.VITE_AI_ENDPOINT as string | undefined;
    const r = endpoint
      ? await callEndpoint(endpoint, mode, prompt, context, sess.session?.access_token)
      : await askAI({
          data: {
            mode,
            prompt: prompt.slice(0, 4000),
            context: context.slice(0, 30000),
            accessToken: sess.session?.access_token,
          },
        });
    if ("status" in r && r.status === 401)
      return { error: "Please sign in again to use AI features." };
    if ("status" in r && r.status === 429) return { error: r.error ?? "Too many AI requests." };
    if ("status" in r && (r.status === 402 || r.status === 403))
      return {
        error:
          "AI credits have run out for now. Everything else in MUeRA still works — try again later.",
        noCredit: true,
      };
    return r;
  } catch {
    return { error: "Could not reach the AI service. Other features still work." };
  }
}

export function parseJSON<T>(text: string): T | null {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

export async function extractPdf(file: File, onProgress?: (p: number) => void) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    pages.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    onProgress?.(i / doc.numPages);
  }
  return pages;
}

export function ytLink(q: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q + " explained")}`;
}
