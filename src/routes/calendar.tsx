import { createFileRoute } from "@tanstack/react-router";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, FileUp, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { TaskDialog, TaskRow, TypeDot } from "@/components/task-bits";
import { Button } from "@/components/ui/button";
import { useStore, type Task } from "@/lib/store";
import { slotOccursOn } from "@/lib/timetable";
import { ClassSession } from "@/components/class-session";
import { Input } from "@/components/ui/input";
import { TimetableImportDialog } from "@/components/timetable-import";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Academic Calendar — MUeRA" },
      {
        name: "description",
        content:
          "Daily, weekly and monthly view of classes, deadlines, quizzes, exams and study sessions.",
      },
      { property: "og:title", content: "Academic Calendar — MUeRA" },
      {
        property: "og:description",
        content: "See every class, deadline and exam in one calendar.",
      },
    ],
  }),
  component: CalendarPage,
});

type View = "day" | "week" | "month";

function CalendarPage() {
  const s = useStore();
  const [view, setView] = useState<View>("month");
  const [cur, setCur] = useState(new Date());
  const [sel, setSel] = useState(format(new Date(), "yyyy-MM-dd"));

  const itemsOn = (d: Date): Task[] => {
    const key = format(d, "yyyy-MM-dd");
    const classes: Task[] = s.timetable
      .filter((c) => slotOccursOn(c, key))
      .map((c) => ({
        id: `c-${c.id}-${key}`,
        title: c.subject,
        subject: c.subject,
        notes: `${c.kind ?? "theory"} · ${c.start}–${c.end}`,
        type: "class",
        date: key,
        time: c.start,
        done: false,
      }));
    return [...classes, ...s.tasks.filter((t) => t.date === key)].sort((a, b) =>
      (a.time ?? "").localeCompare(b.time ?? ""),
    );
  };
  const step = (n: number) =>
    setCur((c) => (view === "month" ? addMonths(c, n) : addDays(c, n * (view === "week" ? 7 : 1))));

  let days: Date[] = [];
  if (view === "month") {
    let d = startOfWeek(startOfMonth(cur));
    const end = endOfWeek(endOfMonth(cur));
    while (d <= end) {
      days.push(d);
      d = addDays(d, 1);
    }
  } else if (view === "week") {
    const st = startOfWeek(cur);
    days = Array.from({ length: 7 }, (_, i) => addDays(st, i));
  }
  const selDate = view === "day" ? cur : new Date(sel + "T00:00");
  const selItems = itemsOn(selDate);

  return (
    <div>
      <PageHeader
        title="Calendar"
        sub="Classes come from your timetable. Import it from a PDF or tap a day to see details."
      >
        <div className="flex rounded-xl border bg-card p-1">
          {(["day", "week", "month"] as View[]).map((v) => (
            <Button
              key={v}
              variant={view === v ? "default" : "ghost"}
              size="sm"
              onClick={() => setView(v)}
              className="capitalize"
            >
              {v}
            </Button>
          ))}
        </div>
        <TaskDialog
          defaults={{ date: format(selDate, "yyyy-MM-dd") }}
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Add
            </Button>
          }
        />
        <TimetableImportDialog
          trigger={
            <Button variant="outline">
              <FileUp className="h-4 w-4" /> Import timetable
            </Button>
          }
        />
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" onClick={() => step(-1)} aria-label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={() => step(1)} aria-label="Next">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setCur(new Date());
            setSel(format(new Date(), "yyyy-MM-dd"));
          }}
        >
          Today
        </Button>
        <Input
          aria-label="Calendar date"
          className="w-40"
          type="date"
          value={format(cur, "yyyy-MM-dd")}
          onChange={(e) => {
            const value = e.target.value;
            if (value) {
              setCur(new Date(value + "T00:00"));
              setSel(value);
            }
          }}
        />
        <h2 className="text-sm font-bold md:text-lg">
          {view === "day"
            ? format(cur, "EEEE d MMMM yyyy")
            : view === "week"
              ? `Week of ${format(days[0], "d MMM")}`
              : format(cur, "MMMM yyyy")}
        </h2>
      </div>

      {view !== "day" && (
        <div className="card-surface mb-6 grid grid-cols-7 gap-px overflow-hidden p-0">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="bg-muted p-2 text-center text-xs font-semibold text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const items = itemsOn(d);
            return (
              <button
                key={key}
                onClick={() => setSel(key)}
                className={`flex min-w-0 flex-col items-start gap-1 p-1.5 text-left ${view === "week" ? "min-h-48" : "min-h-24"} ${sel === key ? "bg-accent" : "bg-card hover:bg-muted"} ${view === "month" && !isSameMonth(d, cur) ? "opacity-40" : ""}`}
              >
                <span
                  className={`text-xs font-bold ${key === format(new Date(), "yyyy-MM-dd") ? "rounded-full bg-primary px-1.5 text-primary-foreground" : ""}`}
                >
                  {format(d, "d")}
                </span>
                {items.slice(0, view === "week" ? 8 : 3).map((t) => (
                  <span
                    key={t.id}
                    className={`flex w-full items-center gap-1 truncate text-[10px] ${t.done ? "line-through opacity-60" : ""}`}
                  >
                    <TypeDot type={t.type} />
                    <span className="truncate">
                      {t.time ? `${t.time} ` : ""}
                      {t.title}
                    </span>
                  </span>
                ))}
                {items.length > (view === "week" ? 8 : 3) && (
                  <span className="text-[10px] text-muted-foreground">
                    +{items.length - (view === "week" ? 8 : 3)} more
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <h3 className="mb-2 font-bold">{format(selDate, "EEEE d MMMM")}</h3>
      <div className="space-y-2">
        {s.timetable
          .filter((c) => slotOccursOn(c, format(selDate, "yyyy-MM-dd")))
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((c) => (
            <ClassSession key={c.id} slot={c} date={format(selDate, "yyyy-MM-dd")} />
          ))}
        {selItems
          .filter((t) => !t.id.startsWith("c-"))
          .map((t) => (
            <TaskRow key={t.id} t={t} />
          ))}
        {!selItems.length && <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}
      </div>
    </div>
  );
}
