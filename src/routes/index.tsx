import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import { AlertTriangle, Plus, ScanLine, Sparkles, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, TaskDialog, TaskRow } from "@/components/task-bits";
import { attendancePct, classesNeeded } from "@/lib/attendance";
import { actions, today, useStore } from "@/lib/store";
import { RecoveryPlan } from "@/components/ai-bits";
import { slotOccursOn } from "@/lib/timetable";
import { useFirstName } from "@/lib/profile";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "MUeRA — Your AI Academic Companion" },
      {
        name: "description",
        content:
          "Your student dashboard: today's classes, deadlines, attendance and study sessions in one place.",
      },
      { property: "og:title", content: "MUeRA — Your AI Academic Companion" },
      { property: "og:description", content: "Plan smarter. Learn easier. Stay ahead." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const s = useStore();
  const firstName = useFirstName();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const t0 = today();
  const week = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const classes = s.timetable
    .filter((c) => slotOccursOn(c, t0))
    .sort((a, b) => a.start.localeCompare(b.start));
  const deadlines = s.tasks
    .filter((t) => ["assignment", "quiz", "exam"].includes(t.type) && !t.done && t.date >= t0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const dueToday = s.tasks.filter((t) => t.date === t0 && t.type !== "study");
  const dueWeek = s.tasks.filter(
    (t) => t.date > t0 && t.date <= week && !t.done && t.type !== "study",
  );
  const sessions = s.tasks
    .filter((t) => t.type === "study" && t.date === t0)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const urgent = deadlines.filter((t) => t.date <= format(addDays(new Date(), 2), "yyyy-MM-dd"));
  const p = s.settings.threshold / 100;
  const lowAtt = s.subjects.filter(
    (x) => (attendancePct(x.attended, x.conducted) ?? 100) < s.settings.threshold,
  );
  const done = s.tasks.filter((t) => t.done).length;

  return (
    <div className="space-y-6">
      <section className="bg-hero relative overflow-hidden rounded-3xl p-6 text-primary-foreground shadow-soft md:p-8">
        <p className="text-sm opacity-80">{format(new Date(), "EEEE, d MMMM")}</p>
        <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">
          Hey {firstName ?? "there"}, let's stay ahead.
        </h1>
        <p className="mt-2 max-w-lg text-sm opacity-90">
          {deadlines.length} upcoming deadline{deadlines.length === 1 ? "" : "s"} · {classes.length}{" "}
          class{classes.length === 1 ? "" : "es"} today · {sessions.filter((x) => !x.done).length}{" "}
          study session(s) planned
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/scan">
              <ScanLine className="h-4 w-4" /> Upload College Document
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/planner">
              <Sparkles className="h-4 w-4" /> Plan My Day
            </Link>
          </Button>
          <TaskDialog
            trigger={
              <Button
                variant="outline"
                className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Plus className="h-4 w-4" /> Add task
              </Button>
            }
          />
        </div>
      </section>

      {!s.subjects.length && !s.tasks.length && !s.timetable.length && (
        <Card title="Getting started">
          <p className="text-sm">
            Add subjects and classes in{" "}
            <Link to="/attendance" className="font-semibold text-primary">
              Attendance
            </Link>{" "}
            or{" "}
            <Link to="/scan" className="font-semibold text-primary">
              scan your timetable
            </Link>
            , then add deadlines with Add task.
          </p>
          <Button variant="outline" size="sm" onClick={() => actions.loadDemo()}>
            Load demo data
          </Button>
        </Card>
      )}

      <RecoveryPlan />

      {(urgent.length > 0 || lowAtt.length > 0) && (
        <section className="card-surface space-y-2 border-warning p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="h-4 w-4 text-warning" /> Notifications
          </h2>
          {urgent.map((t) => (
            <p key={t.id} className="text-sm">
              ⏰ <b>{t.title}</b> ({t.subject}) is due{" "}
              {t.date === t0 ? "today" : format(new Date(t.date + "T00:00"), "EEE d MMM")}.
            </p>
          ))}
          {lowAtt.map((x) => (
            <p key={x.id} className="text-sm">
              📉 {x.name} attendance is below {s.settings.threshold}% — attend the next{" "}
              {classesNeeded(x.attended, x.conducted, p) ?? "?"} classes in a row.
            </p>
          ))}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Today's classes" link="/attendance">
          {classes.length ? (
            classes.map((c) => (
              <div
                key={c.id}
                className="flex justify-between rounded-xl bg-muted px-3 py-2 text-sm"
              >
                <span className="font-semibold">{c.subject}</span>
                <span className="text-muted-foreground">
                  {c.start}–{c.end}
                  {c.room ? ` · ${c.room}` : ""}
                </span>
              </div>
            ))
          ) : (
            <Empty>No classes today.</Empty>
          )}
        </Card>
        <Card title="Today's study sessions" link="/planner">
          {sessions.length ? (
            sessions.map((t) => <TaskRow key={t.id} t={t} compact />)
          ) : (
            <Empty>No sessions yet — tap Plan My Day.</Empty>
          )}
        </Card>
        <Card title="Attendance" link="/attendance">
          {s.subjects.length ? (
            s.subjects.map((x) => {
              const pct = attendancePct(x.attended, x.conducted);
              const ok = pct == null || pct >= s.settings.threshold;
              return (
                <div key={x.id}>
                  <div className="flex justify-between text-sm">
                    <span>{x.name}</span>
                    <span
                      className={
                        ok ? "font-semibold text-success" : "font-semibold text-destructive"
                      }
                    >
                      {pct == null ? "—" : `${pct.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${ok ? "bg-success" : "bg-destructive"}`}
                      style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <Empty>Add subjects in Attendance.</Empty>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upcoming assignments, quizzes & exams" link="/calendar">
          {deadlines.length ? (
            deadlines.slice(0, 6).map((t) => <TaskRow key={t.id} t={t} />)
          ) : (
            <Empty>Nothing upcoming. 🎉</Empty>
          )}
        </Card>
        <div className="space-y-6">
          <Card
            title={`Due today (${dueToday.filter((x) => x.done).length}/${dueToday.length} done)`}
          >
            {dueToday.length ? (
              dueToday.map((t) => <TaskRow key={t.id} t={t} compact />)
            ) : (
              <Empty>Nothing due today.</Empty>
            )}
          </Card>
          <Card title={`This week · ${dueWeek.length} pending · ${done} completed overall`}>
            {dueWeek.length ? (
              dueWeek.map((t) => <TaskRow key={t.id} t={t} compact />)
            ) : (
              <Empty>Nothing else this week.</Empty>
            )}
          </Card>
        </div>
      </div>

      <form
        className="card-surface flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) nav({ to: "/assistant", search: { q: q.trim() } });
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask MUeRA: What should I study today?"
        />
        <Button type="submit" aria-label="Ask">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function Card({
  title,
  link,
  children,
}: {
  title: string;
  link?: "/attendance" | "/planner" | "/calendar";
  children: React.ReactNode;
}) {
  return (
    <section className="card-surface space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{title}</h2>
        {link && (
          <Link to={link} className="text-xs font-semibold text-primary">
            Open →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
