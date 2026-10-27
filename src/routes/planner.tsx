import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { AiStatus, RecoveryPlan } from "@/components/ai-bits";
import { ai, parseJSON } from "@/lib/client";
import { getState, uid, type Task } from "@/lib/store";
import { attendancePct } from "@/lib/attendance";
import { PageHeader } from "@/components/app-shell";
import { TaskDialog, TaskRow } from "@/components/task-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { regenerate } from "@/lib/replan";
import { actions, setState, today, useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/planner")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Study Planner — MUeRA" },
      {
        name: "description",
        content:
          "Realistic study sessions built from your deadlines, subject difficulty and available hours. Adapts when plans change.",
      },
      { property: "og:title", content: "Study Planner — MUeRA" },
      { property: "og:description", content: "Plan My Day: what to study next and why." },
    ],
  }),
  component: Planner,
});

function Planner() {
  const s = useStore();
  const t0 = today();
  const sessions = s.tasks
    .filter((t) => t.type === "study")
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  const upcoming = sessions.filter((t) => !t.done && t.date >= t0);
  const missed = sessions.filter((t) => !t.done && t.planned && t.date < t0);
  const next = upcoming[0];
  const why = useMemo(() => {
    if (!next) return "";
    const target = s.tasks.find((t) => t.id === next.forTaskId);
    const diff = s.subjects.find((x) => x.name === next.subject)?.difficulty ?? 3;
    if (!target) return "A study session you planned.";
    const days = Math.round((new Date(target.date).getTime() - new Date(t0).getTime()) / 86400000);
    return `${target.title} (${target.type}) is in ${days} day(s) and ${next.subject} has difficulty ${diff}/5, so it has the highest priority right now.`;
  }, [next, s.tasks, s.subjects, t0]);

  const set = (k: keyof typeof s.settings, v: string) => {
    if (!v) return;
    if (
      k !== "studyStart" &&
      (Number(v) < (k === "sessionMin" ? 15 : 1) || Number(v) > (k === "sessionMin" ? 1440 : 24))
    )
      return;
    setState((st) => ({ settings: { ...st.settings, [k]: k === "studyStart" ? v : Number(v) } }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Study Planner"
        sub="Rule-based plans are free. AI suggestions use 1 request and you review them before saving."
      >
        <Button
          onClick={() => {
            regenerate("Plan regenerated.");
            toast.success("Plan updated");
          }}
        >
          <RefreshCw className="h-4 w-4" /> Regenerate plan
        </Button>
        <TaskDialog
          defaults={{ type: "study", durationMin: 45 }}
          trigger={<Button variant="outline">Add session</Button>}
        />
      </PageHeader>

      <section className="bg-hero rounded-3xl p-6 text-primary-foreground shadow-soft">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Sparkles className="h-5 w-5" /> Plan My Day
        </h2>
        {next ? (
          <>
            <p className="mt-2 text-2xl font-extrabold">{next.title.replace("Study: ", "")}</p>
            <p className="text-sm opacity-90">
              {next.date === t0 ? "Today" : next.date} at {next.time} · {next.durationMin} min ·{" "}
              {next.subject}
            </p>
            <p className="mt-3 max-w-xl text-sm opacity-90">Why: {why}</p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => {
                actions.updateTask(next.id, { done: true });
                regenerate("Session completed — remaining plan recalculated.");
              }}
            >
              Mark done
            </Button>
          </>
        ) : (
          <p className="mt-2 text-sm opacity-90">
            No sessions planned. Add deadlines, then tap Regenerate plan.
          </p>
        )}
      </section>

      <AiPlanSuggest />
      <RecoveryPlan />

      {missed.length > 0 && (
        <div className="card-surface flex flex-wrap items-center justify-between gap-3 border-warning p-4">
          <p className="text-sm">
            You missed {missed.length} session(s). MUeRA can spread them over your remaining days.
          </p>
          <Button
            onClick={() => regenerate(`Recovery: ${missed.length} missed session(s) rescheduled.`)}
          >
            Fix my schedule
          </Button>
        </div>
      )}

      {s.planNote && (
        <section className="card-surface p-4">
          <h3 className="text-sm font-bold">What changed</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{s.planNote}</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card-surface space-y-3 p-4">
          <h3 className="text-sm font-bold">Your preferences</h3>
          <div>
            <Label>Study hours per day</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={s.settings.studyHoursPerDay}
              onChange={(e) => set("studyHoursPerDay", e.target.value)}
            />
          </div>
          <div>
            <Label>Session length (minutes)</Label>
            <Input
              type="number"
              min={15}
              max={1440}
              step={5}
              value={s.settings.sessionMin}
              onChange={(e) => set("sessionMin", e.target.value)}
            />
          </div>
          <div>
            <Label>Start studying at</Label>
            <Input
              type="time"
              value={s.settings.studyStart}
              onChange={(e) => set("studyStart", e.target.value)}
            />
          </div>
          <h3 className="pt-2 text-sm font-bold">Subject difficulty</h3>
          {s.subjects.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{x.name}</span>
              <select
                className="rounded-md border bg-background px-2 py-1"
                value={x.difficulty}
                onChange={(e) =>
                  setState((st) => ({
                    subjects: st.subjects.map((y) =>
                      y.id === x.id ? { ...y, difficulty: Number(e.target.value) } : y,
                    ),
                  }))
                }
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => regenerate("Preferences changed — plan recalculated.")}
          >
            Apply changes
          </Button>
        </section>
        <section className="space-y-2 lg:col-span-2">
          <h3 className="text-sm font-bold">Upcoming sessions ({upcoming.length})</h3>
          {upcoming.length ? (
            upcoming.map((t) => <TaskRow key={t.id} t={t} />)
          ) : (
            <p className="text-sm text-muted-foreground">None yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

type Draft = {
  key: string;
  title: string;
  subject: string;
  date: string;
  time: string;
  durationMin: number;
  why?: string;
};

function planContext() {
  const s = getState();
  const t0 = today();
  return [
    `Today: ${t0}. Now: ${new Date().toTimeString().slice(0, 5)}. Study ${s.settings.studyHoursPerDay} h/day, sessions of ${s.settings.sessionMin} min, starting ${s.settings.studyStart}.`,
    "Deadlines:\n" +
      s.tasks
        .filter((t) => !t.done && t.date >= t0 && ["assignment", "quiz", "exam"].includes(t.type))
        .map((t) => `- ${t.date} ${t.time ?? ""} ${t.type}: ${t.title} [${t.subject}]`)
        .join("\n"),
    "Busy times (personal items):\n" +
      s.tasks
        .filter((t) => !t.done && t.date >= t0 && t.type === "personal" && t.time)
        .map((t) => `- ${t.date} ${t.time} ${t.title}`)
        .join("\n"),
    "Weekly classes (busy):\n" +
      s.timetable.map((c) => `- day ${c.day} ${c.start}-${c.end}`).join("\n"),
    "Subjects:\n" +
      s.subjects
        .map(
          (x) =>
            `- ${x.name}: difficulty ${x.difficulty}/5, attendance ${attendancePct(x.attended, x.conducted)?.toFixed(0) ?? "n/a"}%`,
        )
        .join("\n"),
  ].join("\n\n");
}

function validDraft(d: Draft, t0: string) {
  return (
    !!d.title.trim() &&
    !!d.subject.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
    d.date >= t0 &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time) &&
    Number.isInteger(d.durationMin) &&
    d.durationMin >= 15 &&
    d.durationMin <= 600
  );
}

function AiPlanSuggest() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const t0 = today();
  const run = async () => {
    const s = getState();
    if (
      !s.tasks.some(
        (t) => !t.done && t.date >= t0 && ["assignment", "quiz", "exam"].includes(t.type),
      )
    )
      return setError("Add at least one upcoming assignment, quiz or exam first.");
    setError("");
    setDrafts([]);
    setBusy("MUeRA is drafting a study plan…");
    const r = await ai("plan", "Suggest my study plan.", planContext());
    setBusy("");
    const arr = r.text ? parseJSON<Partial<Draft>[]>(r.text) : null;
    const list = (arr ?? []).map((d) => ({
      key: uid(),
      title: String(d.title ?? ""),
      subject: String(d.subject ?? ""),
      date: String(d.date ?? ""),
      time: String(d.time ?? ""),
      durationMin: Number(d.durationMin) || s.settings.sessionMin,
      why: d.why ? String(d.why) : undefined,
    }));
    if (r.error || !list.length) {
      regenerate("AI plan unavailable — built with the rule-based planner instead.");
      setError(
        `${r.error ?? "The AI didn't return a usable plan."} Your plan was built with the free rule-based planner instead.`,
      );
      return;
    }
    setDrafts(list);
  };
  const upd = (key: string, p: Partial<Draft>) =>
    setDrafts((x) => x.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const accept = () => {
    const ok = drafts.filter((d) => validDraft(d, t0));
    if (!ok.length)
      return toast.error(
        "No valid sessions. Each needs a title, subject, a date from today, a time and 15–600 minutes.",
      );
    const st = getState();
    const fresh: Task[] = ok.map((d) => ({
      id: uid(),
      title: d.title.trim(),
      subject: d.subject.trim(),
      type: "study",
      date: d.date,
      time: d.time,
      durationMin: d.durationMin,
      done: false,
      planned: true,
      notes: d.why,
    }));
    setState(() => ({
      tasks: [...st.tasks.filter((t) => !(t.planned && !t.done)), ...fresh],
      planNote: `AI study plan accepted: ${fresh.length} session(s) saved.${drafts.length - ok.length ? ` ${drafts.length - ok.length} invalid suggestion(s) skipped.` : ""}`,
    }));
    toast.success(`Saved ${fresh.length} study session(s).`);
    setDrafts([]);
  };
  return (
    <section className="card-surface space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4 text-primary" /> AI study plan
        </h2>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={run}>
          Suggest with AI (1 request)
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Uses your deadlines, free time, class times and weak subjects. Nothing is saved until you
        accept.
      </p>
      <AiStatus busy={busy} error={error} onRetry={run} />
      {drafts.length > 0 && (
        <div className="space-y-2">
          {drafts.map((d) => (
            <div
              key={d.key}
              className={`grid grid-cols-2 gap-2 rounded-xl border p-2 md:grid-cols-6 ${validDraft(d, t0) ? "" : "border-warning"}`}
            >
              <Input
                aria-label="Session title"
                className="col-span-2"
                value={d.title}
                onChange={(e) => upd(d.key, { title: e.target.value })}
              />
              <Input
                aria-label="Subject"
                value={d.subject}
                onChange={(e) => upd(d.key, { subject: e.target.value })}
              />
              <Input
                aria-label="Date"
                type="date"
                min={t0}
                value={d.date}
                onChange={(e) => upd(d.key, { date: e.target.value })}
              />
              <Input
                aria-label="Time"
                type="time"
                value={d.time}
                onChange={(e) => upd(d.key, { time: e.target.value })}
              />
              <div className="flex gap-1">
                <Input
                  aria-label="Minutes"
                  type="number"
                  min={15}
                  max={600}
                  value={d.durationMin}
                  onChange={(e) => upd(d.key, { durationMin: Number(e.target.value) })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove suggestion"
                  onClick={() => setDrafts((x) => x.filter((y) => y.key !== d.key))}
                >
                  ✕
                </Button>
              </div>
              {d.why && (
                <p className="col-span-2 text-xs text-muted-foreground md:col-span-6">
                  Why: {d.why}
                </p>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={accept}>Accept & save plan</Button>
            <Button variant="ghost" onClick={() => setDrafts([])}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
