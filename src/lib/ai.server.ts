import { streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLovableAiGatewayProvider } from "./ai/gateway-helpers";

const SYSTEM: Record<string, string> = {
  summary:
    "You are MUeRA, a study assistant. Summarize ONLY the provided document text in simple language with short bullet points grouped by topic, then exam-oriented key points, key definitions and formulas found in the text. Never invent facts or page numbers. End with one line: 'KEYWORDS: k1, k2, k3, k4' (topics from the text).",
  notes:
    "You are MUeRA. From ONLY the provided text, write short revision notes: chapter/topic-wise explanations, definitions, facts and formulas. Plain text with bullets. Do not invent facts.",
  quiz: 'Create 5 multiple-choice questions ONLY from the provided text. Reply with ONLY a JSON array: [{"q":"...","options":["a","b","c","d"],"answer":0,"why":"..."}]. No markdown.',
  flashcards:
    'Create 8 flashcards ONLY from the provided text. Reply with ONLY a JSON array: [{"front":"...","back":"..."}]. No markdown.',
  extract:
    'Extract academic events from this college notice/timetable text. Reply with ONLY a JSON array: [{"title":"...","subject":"...","type":"assignment|quiz|exam|class|personal","date":"YYYY-MM-DD or empty if unknown","time":"HH:mm or empty","notes":"location/instructions","uncertain":true|false}]. Use the provided current date to resolve relative dates. Never guess silently: set uncertain=true when unsure.',
  plan: 'You are MUeRA\'s study planner. Using ONLY the deadlines, free time, subject difficulty and attendance given, propose realistic study sessions from today until the deadlines. Respect the daily study hours, session length and start time; never schedule in the past or after a deadline; prioritise near deadlines and weak/difficult subjects. Reply with ONLY a JSON array: [{"title":"Study: ...","subject":"...","date":"YYYY-MM-DD","time":"HH:mm","durationMin":45,"why":"short reason"}]. No markdown.',
  recovery:
    "You are MUeRA. The student is behind (low attendance and/or missed deadlines/sessions). Using ONLY the data provided (the exact numbers are already calculated — do not recalculate them), write a short, encouraging catch-up plan: day-by-day steps for the next 7 days, which classes to attend, what to study, and suggest contacting the teacher for missed deadlines. Plain text bullets, under 200 words. Never guarantee safety from debarment.",
  timetable:
    'Extract the weekly class timetable from this text. Reply with ONLY a JSON array: [{"subject":"full subject name","kind":"theory|lab|practical|activity","day":1,"start":"HH:mm","end":"HH:mm","uncertain":true|false}] where day is 0=Sunday..6=Saturday. Expand abbreviations using any legend in the text. Skip breaks/lunch. Use 24-hour times. Set uncertain=true when the day or time is unclear; never invent classes.',
  chat: "You are MUeRA, a friendly, concise academic companion for a college student. Use ONLY the student data in context for facts about their schedule, attendance and documents; if something is missing, say so. Never claim to have read a document that is not in context. Never guarantee safety from debarment. Keep answers short and practical.",
};

export async function runAI(mode: string, prompt: string, context: string) {
  // Provider is configured with server-only environment variables.
  // Any OpenAI-compatible API works (set AI_BASE_URL, AI_API_KEY, AI_MODEL).
  // LOVABLE_API_KEY keeps working when the app runs inside Lovable.
  const customKey = process.env.AI_API_KEY?.trim();
  const customBase = process.env.AI_BASE_URL?.trim();
  const customModel = process.env.AI_MODEL?.trim();
  const lovableKey = process.env.LOVABLE_API_KEY?.trim();
  if (!(customKey && customBase && customModel) && !lovableKey)
    return { error: "AI is not configured on the server.", status: 503 };
  const useCustom = Boolean(customKey && customBase && customModel);
  const provider = useCustom
    ? createOpenAICompatible({
        name: "custom",
        baseURL: customBase!.replace(/\/+$/, ""),
        headers: { Authorization: `Bearer ${customKey}` },
      })
    : createLovableAiGatewayProvider(lovableKey!, undefined, {
        baseURL: "https://ai.gateway.lovable.dev/v1",
      });
  try {
    const result = streamText({
      model: provider(useCustom ? customModel! : "openai/gpt-6-astra"),
      system: SYSTEM[mode] ?? SYSTEM.chat,
      prompt: `${context ? `CONTEXT:\n${context.slice(0, 24000)}\n\n` : ""}${prompt}`,
      ...(useCustom ? {} : { providerOptions: { lovable: { reasoningEffort: "low" } } }),
      maxRetries: 0,
    });
    const text = await result.text;
    if (!text.trim()) return { error: "The AI returned no answer for this request.", status: 502 };
    return { text };
  } catch (e) {
    const err = e as { statusCode?: number; message?: string; responseBody?: string };
    const status = err.statusCode ?? 500;
    let msg = err.message ?? "AI request failed.";
    try {
      const b = JSON.parse(err.responseBody ?? "");
      msg = b?.error?.message ?? b?.message ?? msg;
    } catch {
      /* ignore */
    }
    if (status === 402)
      msg = "AI credits are used up for this workspace. Non-AI features still work.";
    if (status === 429) msg = "Too many AI requests right now. Please wait a minute and try again.";
    return { error: msg, status };
  }
}
