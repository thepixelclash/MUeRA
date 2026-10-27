import { createFileRoute } from "@tanstack/react-router";
import { Check, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { attendancePct, classesCanMiss, classesNeeded, simulate } from "@/lib/attendance";
import {
  actions,
  setState,
  today,
  uid,
  useStore,
  type Subject,
  type AttendanceRecord,
} from "@/lib/store";
import {
  slotOccursOn,
  normalizeSubject,
  slotIdentity,
  validEntry,
  classifySubject,
} from "@/lib/timetable";
import { ClassSession } from "@/components/class-session";
import { toast } from "sonner";
import { RecoveryPlan } from "@/components/ai-bits";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Attendance Tracker — MUeRA" },
      {
        name: "description",
        content:
          "Track attendance subject-wise, see how many classes you need or can miss, and simulate scenarios.",
      },
      { property: "og:title", content: "Attendance Tracker — MUeRA" },
      {
        property: "og:description",
        content: "Know exactly where you stand against your attendance target.",
      },
    ],
  }),
  component: Attendance,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const upd = (id: string, p: Partial<Subject>) =>
  setState((s) => ({ subjects: s.subjects.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

function Attendance() {
  const s = useStore();
  const p = s.settings.threshold / 100;
  const [name, setName] = useState("");
  const [slot, setSlot] = useState({ day: 1, subject: "", start: "09:00", end: "10:00", room: "" });
  const [date, setDate] = useState(today());
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const todays = s.timetable.filter((c) => slotOccursOn(c, date));
  const data = s.subjects.map((x) => ({
    name: x.name
      .split(" ")
      .map((w) => w[0])
      .join(""),
    full: x.name,
    pct: Number((attendancePct(x.attended, x.conducted) ?? 0).toFixed(1)),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        sub="Uses your own records. Official institute records always take precedence."
      >
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-1.5 text-sm">
          Target
          <Input
            aria-label="Attendance target"
            placeholder="75"
            className="h-8 w-20"
            type="number"
            min={1}
            max={100}
            value={s.settings.threshold}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value && n >= 1 && n <= 100)
                setState((st) => ({ settings: { ...st.settings, threshold: n } }));
            }}
          />
          %
        </div>
      </PageHeader>

      <RecoveryPlan />
      {!s.subjects.length && (
        <p className="card-surface p-4 text-sm text-muted-foreground">
          No subjects yet. Add one below, add your weekly classes, or scan your timetable.
        </p>
      )}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold">Date-wise attendance</h2>
          <Input
            aria-label="Attendance date"
            className="w-44"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {todays.map((c) => (
            <ClassSession key={c.id} slot={c} date={date} />
          ))}
        </div>
        {!todays.length && (
          <p className="text-sm text-muted-foreground">No classes scheduled on this date.</p>
        )}
      </section>

      {data.length > 0 && (
        <section className="card-surface h-64 p-4">
          <ResponsiveContainer>
            <BarChart data={data}>
              <XAxis dataKey="name" fontSize={12} />
              <YAxis domain={[0, 100]} fontSize={12} />
              <Tooltip
                formatter={(v) => `${v}%`}
                labelFormatter={(_, pl) => pl?.[0]?.payload?.full ?? ""}
              />
              <ReferenceLine
                y={s.settings.threshold}
                stroke="var(--destructive)"
                strokeDasharray="4 4"
              />
              <Bar dataKey="pct" radius={[8, 8, 0, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.full}
                    fill={d.pct >= s.settings.threshold ? "var(--chart-1)" : "var(--destructive)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {s.subjects.map((x) => (
          <SubjectCard key={x.id} x={x} p={p} threshold={s.settings.threshold} />
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          actions.ensureSubject(name, classifySubject(name));
          setName("");
        }}
      >
        <Input
          placeholder="New subject name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit">
          <Plus className="h-4 w-4" /> Add subject
        </Button>
      </form>

      <section className="card-surface p-4">
        <h2 className="mb-3 text-sm font-bold">Weekly timetable</h2>
        <div className="space-y-1">
          {[...s.timetable]
            .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
            .map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="w-10 font-semibold">{DAYS[c.day]}</span>
                <span className="w-28 text-muted-foreground">
                  {c.start}–{c.end}
                </span>
                <span className="min-w-32 flex-1">
                  {c.subject} · {c.kind ?? "theory"}
                  {c.room ? ` · ${c.room}` : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingSlot(c.id);
                    setSlot({
                      day: c.day,
                      subject: c.subject,
                      start: c.start,
                      end: c.end,
                      room: c.room ?? "",
                    });
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove class"
                  onClick={() =>
                    setState((st) => ({ timetable: st.timetable.filter((y) => y.id !== c.id) }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
        </div>
        <form
          className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validEntry(slot)) return toast.error("Enter a subject and valid start/end times.");
            if (
              s.timetable.some(
                (c) => c.id !== editingSlot && slotIdentity(c) === slotIdentity(slot),
              )
            )
              return toast.error("This class is already in the timetable.");
            actions.ensureSubject(slot.subject, classifySubject(slot.subject));
            setState((st) => {
              const subject = st.subjects.find(
                (x) => normalizeSubject(x.name) === normalizeSubject(slot.subject),
              );
              const entry = {
                ...slot,
                subjectId: subject?.id,
                kind: classifySubject(slot.subject),
              };
              return {
                timetable: editingSlot
                  ? st.timetable.map((c) => (c.id === editingSlot ? { ...c, ...entry } : c))
                  : [...st.timetable, { ...entry, id: uid() }],
              };
            });
            setEditingSlot(null);
            setSlot({ day: 1, subject: "", start: "09:00", end: "10:00", room: "" });
          }}
        >
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={slot.day}
            onChange={(e) => setSlot({ ...slot, day: Number(e.target.value) })}
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <Input
            placeholder="Subject"
            value={slot.subject}
            onChange={(e) => setSlot({ ...slot, subject: e.target.value })}
          />
          <Input
            type="time"
            value={slot.start}
            onChange={(e) => setSlot({ ...slot, start: e.target.value })}
          />
          <Input
            type="time"
            value={slot.end}
            onChange={(e) => setSlot({ ...slot, end: e.target.value })}
          />
          <Input
            placeholder="Room"
            value={slot.room}
            onChange={(e) => setSlot({ ...slot, room: e.target.value })}
          />
          <Button type="submit">{editingSlot ? "Save class" : "Add class"}</Button>
          {editingSlot && (
            <Button variant="ghost" type="button" onClick={() => setEditingSlot(null)}>
              Cancel edit
            </Button>
          )}
        </form>
      </section>

      <p className="text-xs text-muted-foreground">
        Assumptions: every future class is held and counted normally. "Need" = ceil((p×T − A)/(1 −
        p)) consecutive classes; "can miss" = floor(A/p − T). Projections are estimates, not
        official figures, and never a guarantee against debarment.
      </p>
    </div>
  );
}

function SubjectCard({ x, p, threshold }: { x: Subject; p: number; threshold: number }) {
  const state = useStore();
  const history = state.attendanceRecords
    .filter((r) => r.subjectId === x.id)
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const [att, setAtt] = useState(0);
  const [miss, setMiss] = useState(0);
  const pct = attendancePct(x.attended, x.conducted);
  const need = classesNeeded(x.attended, x.conducted, p);
  const can = classesCanMiss(x.attended, x.conducted, p);
  const sim = simulate(x.attended, x.conducted, att, miss);
  const ok = pct == null || pct >= threshold;
  const near = pct != null && ok && can <= 2;
  return (
    <section className="card-surface space-y-3 p-4">
      <div className="flex items-start justify-between">
        <h3 className="font-bold">{x.name}</h3>
        <span className={`text-2xl font-extrabold ${ok ? "text-success" : "text-destructive"}`}>
          {pct == null ? "—" : `${pct.toFixed(1)}%`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Attended</Label>
          <Input
            aria-label={`${x.name} attended`}
            placeholder="Classes attended"
            type="number"
            min={0}
            value={x.attended}
            onChange={(e) => upd(x.id, { attended: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Conducted</Label>
          <Input
            aria-label={`${x.name} conducted`}
            placeholder="Classes conducted"
            type="number"
            min={0}
            value={x.conducted}
            onChange={(e) => upd(x.id, { conducted: Number(e.target.value) })}
          />
        </div>
      </div>
      {x.attended > x.conducted ? (
        <p className="text-sm text-destructive">Attended can't be more than conducted.</p>
      ) : pct == null ? (
        <p className="text-sm text-muted-foreground">No attendance recorded</p>
      ) : !ok ? (
        <p className="rounded-lg bg-destructive/10 p-2 text-sm">
          Your attendance is below {threshold}%.{" "}
          {need == null
            ? "A 100% target can't be reached after an absence."
            : `You need to attend the next ${need} classes consecutively to reach your target.`}
        </p>
      ) : (
        <p className={`rounded-lg p-2 text-sm ${near ? "bg-warning/20" : "bg-success/10"}`}>
          You can miss up to {can} upcoming class(es) and stay at or above {threshold}%.
          {near ? " Your projected attendance may fall below the threshold if you miss more." : ""}
        </p>
      )}
      <div className="rounded-lg bg-muted p-2 text-sm">
        <p className="font-semibold">Simulate (estimate)</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          attend{" "}
          <Input
            aria-label={`${x.name} simulate attend`}
            className="h-8 w-20"
            placeholder="Attend"
            type="number"
            min={0}
            value={att}
            onChange={(e) => setAtt(Number(e.target.value))}
          />
          miss{" "}
          <Input
            aria-label={`${x.name} simulate miss`}
            className="h-8 w-20"
            placeholder="Miss"
            type="number"
            min={0}
            value={miss}
            onChange={(e) => setMiss(Number(e.target.value))}
          />
          → Projected <b>{sim.pct == null ? "—" : `${sim.pct.toFixed(1)}%`}</b> ({sim.attended}/
          {sim.conducted})
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Current: {pct == null ? "No attendance recorded" : `${pct.toFixed(1)}%`} · Target:{" "}
        {threshold}%. Projected = ({x.attended} + {att}) ÷ ({x.conducted} + {att} + {miss}) × 100.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Attendance history ({history.length})
        </summary>
        <div className="mt-2 space-y-2">
          {history.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span>
                {r.date} · {r.start}–{r.end}
              </span>
              <select
                aria-label={`Attendance status ${r.date} ${r.start}`}
                className="rounded-md border bg-background p-1"
                value={r.status}
                onChange={(e) =>
                  actions.correctAttendance(r.id, e.target.value as AttendanceRecord["status"])
                }
              >
                {["Present", "Absent", "Cancelled"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => actions.correctAttendance(r.id, null)}
              >
                Remove record
              </Button>
            </div>
          ))}
          {!history.length && (
            <p className="text-xs text-muted-foreground">
              No date-wise records yet. Existing totals are retained.
            </p>
          )}
        </div>
      </details>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setState((s) => ({ subjects: s.subjects.filter((y) => y.id !== x.id) }))}
      >
        <Trash2 className="h-4 w-4" /> Remove
      </Button>
    </section>
  );
}
