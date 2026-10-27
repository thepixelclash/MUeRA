import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { ai } from "@/lib/client";
import { attendancePct, classesNeeded } from "@/lib/attendance";
import { getState, today } from "@/lib/store";

/** Loading / error-with-retry line shared by every AI feature. */
export function AiStatus({
  busy,
  error,
  onRetry,
}: {
  busy?: string;
  error?: string;
  onRetry?: () => void;
}) {
  if (busy)
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {busy}
      </p>
    );
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-lg bg-warning/20 p-2 text-sm"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{error}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-3 w-3" /> Retry
        </Button>
      )}
    </div>
  );
}

/** Exact numbers calculated in code; AI only turns them into advice. */
export function recoveryFacts() {
  const s = getState();
  const t0 = today();
  const p = s.settings.threshold / 100;
  const low = s.subjects.filter(
    (x) => (attendancePct(x.attended, x.conducted) ?? 100) < s.settings.threshold,
  );
  const overdue = s.tasks.filter(
    (t) => !t.done && t.type !== "study" && t.type !== "class" && t.date < t0,
  );
  const missed = s.tasks.filter((t) => !t.done && t.planned && t.date < t0);
  const lines = [
    `Today: ${t0}. Attendance target ${s.settings.threshold}%.`,
    ...low.map(
      (x) =>
        `Low attendance: ${x.name} ${x.attended}/${x.conducted} = ${attendancePct(x.attended, x.conducted)!.toFixed(1)}%; must attend next ${classesNeeded(x.attended, x.conducted, p) ?? "many"} classes in a row.`,
    ),
    ...overdue.map(
      (t) => `Missed deadline: ${t.title} (${t.subject}, ${t.type}) was due ${t.date}.`,
    ),
    missed.length ? `Missed study sessions: ${missed.length}.` : "",
    "Upcoming deadlines: " +
      (s.tasks
        .filter((t) => !t.done && t.date >= t0 && t.type !== "study")
        .slice(0, 10)
        .map((t) => `${t.title} ${t.date}`)
        .join("; ") || "none"),
    "Weekly classes: " +
      (s.timetable
        .map(
          (c) =>
            `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][c.day]} ${c.start} ${c.subject}`,
        )
        .slice(0, 40)
        .join("; ") || "none"),
  ].filter(Boolean);
  return {
    needed: low.length > 0 || overdue.length > 0 || missed.length > 0,
    text: lines.join("\n"),
  };
}

export function RecoveryPlan() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState("");
  const facts = recoveryFacts();
  if (!facts.needed) return null;
  const run = async () => {
    setError("");
    setBusy("MUeRA is preparing your catch-up plan…");
    const r = await ai("recovery", "Make my catch-up plan.", recoveryFacts().text);
    setBusy("");
    if (r.error) setError(r.error);
    else setPlan(r.text ?? "");
  };
  return (
    <section className="card-surface space-y-2 border-warning p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4 text-primary" /> Recovery plan
        </h2>
        <Button size="sm" disabled={!!busy} onClick={run}>
          {plan ? "Make a new plan" : "Get a catch-up plan (1 AI request)"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        You're below target or have missed work. Only these figures are sent to the AI:{" "}
        {facts.text.split("\n").length} short lines about attendance and deadlines.
      </p>
      <AiStatus busy={busy} error={error} onRetry={run} />
      {plan && <p className="whitespace-pre-wrap text-sm">{plan}</p>}
    </section>
  );
}
