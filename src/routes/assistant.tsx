import { createFileRoute } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import { Loader2, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attendancePct, classesCanMiss, classesNeeded } from "@/lib/attendance";
import { ai } from "@/lib/client";
import { AiStatus } from "@/components/ai-bits";
import { runScheduleCommand, type SchedulePending } from "@/lib/schedule-commands";
import { runTaskCommand, type Pending } from "@/lib/task-commands";
import { regenerate } from "@/lib/replan";
import {
  actions,
  getState,
  setState,
  today,
  useStore,
  type ChatMsg,
  type TaskType,
} from "@/lib/store";

export const Route = createFileRoute("/assistant")({
  validateSearch: z.object({ q: z.string().optional() }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "AI Assistant — MUeRA" },
      {
        name: "description",
        content:
          "Ask MUeRA what to study, what's due, and how many classes you need — using your own academic data.",
      },
      { property: "og:title", content: "AI Assistant — MUeRA" },
      { property: "og:description", content: "A study companion that knows your schedule." },
    ],
  }),
  component: Assistant,
});

const SUGGEST = [
  "What should I study today?",
  "What assignments are due this week?",
  "Add task: finish my assignment tomorrow",
  "Mark my maths assignment done",
  "How many classes must I attend to reach 75%?",
  "I missed today's study session. Fix my schedule.",
  "Which topic should I revise first?",
];

let pendingAction: Pending = null;
let pendingSlot: SchedulePending = null;
function taskActionAnswer(q: string): string | null {
  const sched = runScheduleCommand(q, getState(), actions, pendingSlot);
  if (sched) {
    pendingSlot = sched.pending;
    pendingAction = null;
    return sched.reply;
  }
  pendingSlot = null;
  const out = runTaskCommand(q, getState(), today(), actions, pendingAction);
  if (!out) {
    pendingAction = null;
    return null;
  }
  pendingAction = out.pending;
  return out.reply;
}

/** Answers common questions locally — no AI credits. Returns null when AI is needed. */
function localAnswer(q: string): string | null {
  const s = getState();
  const l = q.toLowerCase();
  const t0 = today();
  const week = format(addDays(new Date(), 7), "yyyy-MM-dd");
  if (/attend|classes must|bunk|miss.*class/.test(l)) {
    const p = s.settings.threshold / 100;
    if (!s.subjects.length) return "You haven't added any subjects yet. Add them in Attendance.";
    return (
      s.subjects
        .map((x) => {
          const pct = attendancePct(x.attended, x.conducted);
          if (pct == null) return `• ${x.name}: no classes recorded yet.`;
          const need = classesNeeded(x.attended, x.conducted, p);
          return pct < s.settings.threshold
            ? `• ${x.name}: ${pct.toFixed(1)}% — attend the next ${need ?? "?"} classes in a row to reach ${s.settings.threshold}%.`
            : `• ${x.name}: ${pct.toFixed(1)}% — you can miss up to ${classesCanMiss(x.attended, x.conducted, p)} more.`;
        })
        .join("\n") + "\n\n(Estimates from your records; official records take precedence.)"
    );
  }
  if (/due|deadline|assignments?/.test(l) && /week|today|upcoming|due/.test(l)) {
    const items = s.tasks
      .filter((t) => !t.done && t.type !== "study" && t.date >= t0 && t.date <= week)
      .sort((a, b) => a.date.localeCompare(b.date));
    return items.length
      ? "Due in the next 7 days:\n" +
          items
            .map(
              (t) =>
                `• ${t.title} (${t.subject}) — ${format(new Date(t.date + "T00:00"), "EEE d MMM")}${t.time ? " " + t.time : ""}`,
            )
            .join("\n")
      : "Nothing is due in the next 7 days. 🎉";
  }
  if (/missed|fix my schedule|reschedul/.test(l)) {
    const missed = s.tasks.filter(
      (t) => t.planned && !t.done && (t.date < t0 || (t.date === t0 && /today/.test(l))),
    ).length;
    regenerate("Recovery requested from the assistant.");
    return `Done — I rebuilt your plan. ${missed} pending session(s) were spread over the remaining days. See the Planner for details.`;
  }
  if (/study today|what should i study|study next/.test(l)) {
    const n = s.tasks
      .filter((t) => t.type === "study" && !t.done && t.date >= t0)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    return n
      ? `Next up: ${n.title.replace("Study: ", "")} (${n.subject}) on ${n.date === t0 ? "today" : n.date} at ${n.time} for ${n.durationMin} min. It's prioritised by how soon it's due and how hard the subject is.`
      : "No study sessions are planned. Open the Planner and tap Regenerate plan.";
  }
  return null;
}

function buildContext() {
  const s = getState();
  const t0 = today();
  return [
    `Today: ${t0}. Attendance target: ${s.settings.threshold}%.`,
    "Upcoming items:\n" +
      s.tasks
        .filter((t) => t.date >= t0 && !t.done)
        .slice(0, 40)
        .map((t) => `- ${t.date} ${t.time ?? ""} ${t.type}: ${t.title} [${t.subject}]`)
        .join("\n"),
    "Subjects:\n" +
      s.subjects
        .map(
          (x) => `- ${x.name}: difficulty ${x.difficulty}/5, attended ${x.attended}/${x.conducted}`,
        )
        .join("\n"),
    "Uploaded documents:\n" +
      (s.docs.map((d) => `- ${d.name}: ${(d.cache.summary ?? d.text).slice(0, 1500)}`).join("\n") ||
        "none"),
  ].join("\n\n");
}

function Assistant() {
  const s = useStore();
  const { q } = Route.useSearch();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [failed, setFailed] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const sentQ = useRef(false);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const push = (m: ChatMsg) => setState((st) => ({ chat: [...st.chat, m] }));
    push({ role: "user", content: text });
    setInput("");
    const taskAction = taskActionAnswer(text);
    if (taskAction) return push({ role: "assistant", content: taskAction, local: true });
    const local = localAnswer(text);
    if (local) return push({ role: "assistant", content: local, local: true });
    setBusy(true);
    const history = getState()
      .chat.slice(-6)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    const r = await ai("chat", `Recent chat:\n${history}\n\nStudent: ${text}`, buildContext());
    setBusy(false);
    if (r.error) {
      setFailed(text);
      setState((st) => ({ chat: st.chat.slice(0, -1) }));
      setErr(r.error);
      return;
    }
    setErr("");
    setFailed("");
    push({ role: "assistant", content: r.text ?? "" });
  };

  useEffect(() => {
    if (q && !sentQ.current) {
      sentQ.current = true;
      void send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [s.chat.length, busy]);

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col md:h-[calc(100vh-6rem)]">
      <PageHeader
        title="MUeRA Assistant"
        sub="Ask questions, manage tasks in plain English, and get study help. Task updates and schedule/attendance answers are handled instantly."
      >
        <Button variant="ghost" onClick={() => setState(() => ({ chat: [] }))}>
          <Trash2 className="h-4 w-4" /> Clear
        </Button>
      </PageHeader>
      <div className="card-surface flex-1 space-y-3 overflow-y-auto p-4">
        {!s.chat.length && (
          <div className="flex flex-wrap gap-2">
            {SUGGEST.map((x) => (
              <button
                key={x}
                onClick={() => send(x)}
                className="rounded-full bg-secondary px-3 py-1.5 text-sm text-secondary-foreground"
              >
                {x}
              </button>
            ))}
          </div>
        )}
        {s.chat.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              {m.content}
              {m.local && (
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  answered from your data · no AI used
                </span>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> MUeRA is thinking…
          </p>
        )}
        {!busy && err && (
          <AiStatus
            error={`${err} Your question wasn't lost.`}
            onRetry={() => {
              setErr("");
              void send(failed);
            }}
          />
        )}
        <div ref={end} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask MUeRA or manage tasks: ‘Add task…’"
        />
        <Button type="submit" disabled={busy} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <p className="mt-2 text-center text-xs text-muted-foreground">Powered by Groq</p>
    </div>
  );
}
