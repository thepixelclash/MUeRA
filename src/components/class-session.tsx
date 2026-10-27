import { Button } from "./ui/button";
import { actions, useStore, type AttendanceRecord, type Slot } from "@/lib/store";
import { normalizeSubject } from "@/lib/timetable";

export function ClassSession({ slot, date }: { slot: Slot; date: string }) {
  const s = useStore();
  const record = s.attendanceRecords.find((r) => r.slotId === slot.id && r.date === date);
  const subject = s.subjects.find(
    (x) => x.id === slot.subjectId || normalizeSubject(x.name) === normalizeSubject(slot.subject),
  );
  return (
    <div className="space-y-2 rounded-lg border bg-muted p-3 text-sm">
      <p className="font-semibold break-words">{slot.subject}</p>
      <p className="text-xs text-muted-foreground">
        Timetable · {slot.kind ?? "theory"} · {slot.start}–{slot.end}
        {slot.room ? ` · ${slot.room}` : ""}
      </p>
      {subject ? (
        <div className="flex flex-wrap items-center gap-1">
          {(["Present", "Absent", "Cancelled"] as AttendanceRecord["status"][]).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={record?.status === status ? "default" : "outline"}
              aria-pressed={record?.status === status}
              onClick={() => actions.recordAttendance(slot.id, date, status)}
            >
              {status}
            </Button>
          ))}
          {record && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => actions.recordAttendance(slot.id, date, null)}
            >
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{record?.status ?? "Not recorded"}</span>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => actions.ensureSubject(slot.subject, slot.kind)}
        >
          Enable attendance for this subject
        </Button>
      )}
    </div>
  );
}
