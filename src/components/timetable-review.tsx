import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { actions } from "@/lib/store";
import { normalizeSubject, validEntry, type ClassKind, type TimetableDraft } from "@/lib/timetable";

export function TimetableReview({
  result,
  sourceFileId,
  saveBlocked,
}: {
  sourceFileId?: string;
  saveBlocked?: boolean;
  result: {
    entries: TimetableDraft[];
    subjects: { name: string; kind: ClassKind }[];
    effective: string;
  };
}) {
  const [entries, setEntries] = useState(result.entries);
  const [subjects, setSubjects] = useState(result.subjects);
  const [effective, setEffective] = useState(result.effective);
  const [end, setEnd] = useState("");
  const [labs, setLabs] = useState(false);
  const [replace, setReplace] = useState(false);
  const [recurring, setRecurring] = useState(true);
  const [message, setMessage] = useState("");
  const update = (key: string, patch: Partial<TimetableDraft>) =>
    setEntries((items) => items.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const kinds: ClassKind[] = ["theory", "lab", "practical", "activity"];
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold">Review timetable</h2>
      <p className="text-sm">
        {subjects.filter((s) => s.kind === "theory").length} theory subjects detected ·{" "}
        {entries.length} weekly class sessions detected
      </p>
      <div className="space-y-2">
        {subjects.map((s, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <Input
              aria-label={`Detected subject ${i + 1}`}
              className="min-w-48 flex-1"
              value={s.name}
              onChange={(e) => {
                const name = e.target.value;
                setSubjects((all) => all.map((v, j) => (j === i ? { ...v, name } : v)));
                setEntries((all) =>
                  all.map((d) =>
                    normalizeSubject(d.subject) === normalizeSubject(s.name)
                      ? { ...d, subject: name }
                      : d,
                  ),
                );
              }}
            />
            <select
              aria-label={`Subject classification ${i + 1}`}
              className="rounded-md border bg-background p-2 text-sm"
              value={s.kind}
              onChange={(e) => {
                const kind = e.target.value as ClassKind;
                setSubjects((all) => all.map((v, j) => (j === i ? { ...v, kind } : v)));
                setEntries((all) =>
                  all.map((d) =>
                    normalizeSubject(d.subject) === normalizeSubject(s.name) ? { ...d, kind } : d,
                  ),
                );
              }}
            >
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <Button
              aria-label="Remove detected subject"
              size="icon"
              variant="ghost"
              onClick={() => setSubjects((all) => all.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="effective">Effective from</Label>
          <Input
            id="effective"
            type="date"
            value={effective}
            onChange={(e) => setEffective(e.target.value)}
          />
        </div>
        {recurring && (
          <div>
            <Label htmlFor="semester-end">Semester end date</Label>
            <Input
              id="semester-end"
              type="date"
              min={effective}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
          />
          Repeat weekly
        </label>
        <label className="flex gap-2">
          <input type="checkbox" checked={labs} onChange={(e) => setLabs(e.target.checked)} />
          Create lab/practical attendance subjects
        </label>
        <label className="flex gap-2">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Replace existing timetable
        </label>
      </div>
      {entries.map((d, i) => (
        <div className="card-surface space-y-2 p-3" key={d.key}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Class {i + 1} ·{" "}
              {d.uncertain || !validEntry(d)
                ? "Please check the subject, weekday and times"
                : "Ready for confirmation"}
            </p>
            <Button
              size="icon"
              aria-label="Remove extracted class"
              variant="ghost"
              onClick={() => setEntries((all) => all.filter((x) => x.key !== d.key))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Input
            aria-label={`Class subject ${i + 1}`}
            value={d.subject}
            placeholder="Subject"
            onChange={(e) => update(d.key, { subject: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select
              aria-label={`Class weekday ${i + 1}`}
              className="min-w-0 rounded-md border bg-background p-2 text-sm"
              value={d.day ?? ""}
              onChange={(e) =>
                update(d.key, { day: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            >
              <option value="">Weekday</option>
              {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                (v, j) => (
                  <option key={v} value={j}>
                    {v}
                  </option>
                ),
              )}
            </select>
            <Input
              aria-label={`Class start ${i + 1}`}
              type="time"
              value={d.start}
              onChange={(e) => update(d.key, { start: e.target.value })}
            />
            <Input
              aria-label={`Class end ${i + 1}`}
              type="time"
              value={d.end}
              onChange={(e) => update(d.key, { end: e.target.value })}
            />
            <select
              aria-label={`Class classification ${i + 1}`}
              className="min-w-0 rounded-md border bg-background p-2 text-sm"
              value={d.kind}
              onChange={(e) => update(d.key, { kind: e.target.value as ClassKind })}
            >
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>
          {d.source && (
            <details className="text-xs text-muted-foreground">
              <summary>Original text</summary>
              {d.source}
            </details>
          )}
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          setEntries((all) => [
            ...all,
            {
              key: crypto.randomUUID(),
              subject: "",
              kind: "theory",
              start: "",
              end: "",
              uncertain: true,
              source: "",
            },
          ])
        }
      >
        <Plus className="h-4 w-4" />
        Add timetable class
      </Button>
      <div className="space-y-2">
        <Button
          disabled={saveBlocked}
          onClick={() => {
            const incomplete = entries.filter((d) => !validEntry(d));
            if (
              !recurring &&
              entries.some((d) => d.day !== new Date(effective + "T00:00").getDay())
            ) {
              setMessage(
                "For a one-day schedule, each class weekday must match the effective date.",
              );
              return;
            }
            if (
              replace &&
              !confirm(
                "Replace the entire current weekly timetable? Attendance history will be kept.",
              )
            )
              return;
            const r = actions.saveTimetable(
              entries,
              subjects,
              effective,
              recurring ? end : effective,
              labs,
              replace,
              recurring,
              sourceFileId,
            );
            setMessage(
              r.error ??
                `${subjects.filter((s) => s.kind === "theory").length} theory subjects detected, ${r.theorySaved} new theory subjects saved, ${r.subjectsSaved} new attendance subjects saved, and ${r.saved} weekly class sessions saved${r.duplicates ? `; ${r.duplicates} duplicates skipped` : ""}.${incomplete.length ? ` ${incomplete.length} incomplete sessions were not saved and remain here for correction.` : ""}`,
            );
          }}
        >
          Confirm timetable
        </Button>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
