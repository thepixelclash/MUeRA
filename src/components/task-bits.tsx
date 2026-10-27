import { useState, type ReactNode } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Check, Clock, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actions, isDuplicate, today, type Task, type TaskType } from "@/lib/store";
import { toast } from "sonner";

export const TYPE_LABEL: Record<TaskType, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  exam: "Exam",
  class: "Class",
  study: "Study",
  personal: "Personal",
};
const DOT: Record<TaskType, string> = {
  assignment: "bg-type-assignment",
  quiz: "bg-type-quiz",
  exam: "bg-type-exam",
  class: "bg-type-class",
  study: "bg-type-study",
  personal: "bg-type-personal",
};
export function TypeDot({ type }: { type: TaskType }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[type]}`} />;
}

export function TaskRow({ t, compact }: { t: Task; compact?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border bg-card p-3 ${t.done ? "opacity-60" : ""}`}
    >
      <button
        aria-label={t.done ? "Mark as not done" : "Mark as done"}
        onClick={() => actions.updateTask(t.id, { done: !t.done })}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${t.done ? "border-success bg-success text-success-foreground" : "border-input"}`}
      >
        {t.done && <Check className="h-3.5 w-3.5" />}
      </button>
      <TypeDot type={t.type} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${t.done ? "line-through" : ""}`}>
          {t.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {TYPE_LABEL[t.type]} · {t.subject} · {format(parseISO(t.date), "EEE d MMM")}
          {t.time ? ` · ${t.time}` : ""}
          {t.durationMin ? ` · ${t.durationMin} min` : ""}
        </p>
      </div>
      {!compact && (
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Postpone one day"
            onClick={() =>
              actions.updateTask(t.id, { date: format(addDays(parseISO(t.date), 1), "yyyy-MM-dd") })
            }
          >
            <Clock className="h-4 w-4" />
          </Button>
          <TaskDialog
            task={t}
            trigger={
              <Button size="icon" variant="ghost" aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
            }
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete"
            onClick={() => actions.deleteTask(t.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function TaskFields({ v, set }: { v: Partial<Task>; set: (p: Partial<Task>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label>Title</Label>
        <Input
          value={v.title ?? ""}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="e.g. Quiz 3"
        />
      </div>
      <div>
        <Label>Subject</Label>
        <Input value={v.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} />
      </div>
      <div>
        <Label>Type</Label>
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={v.type}
          onChange={(e) => set({ type: e.target.value as TaskType })}
        >
          {Object.entries(TYPE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Date</Label>
        <Input type="date" value={v.date ?? ""} onChange={(e) => set({ date: e.target.value })} />
      </div>
      <div>
        <Label>Time</Label>
        <Input type="time" value={v.time ?? ""} onChange={(e) => set({ time: e.target.value })} />
      </div>
      <div>
        <Label>Remind me (minutes before)</Label>
        <Input
          type="number"
          min={0}
          value={v.reminderMin ?? ""}
          onChange={(e) =>
            set({ reminderMin: e.target.value === "" ? undefined : Number(e.target.value) })
          }
        />
      </div>
      <div className="sm:col-span-2">
        <Label>Notes</Label>
        <Textarea value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
      </div>
    </div>
  );
}

export function TaskDialog({
  task,
  trigger,
  defaults,
}: {
  task?: Task;
  trigger: ReactNode;
  defaults?: Partial<Task>;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Partial<Task>>(
    task ?? { type: "assignment", date: today(), ...defaults },
  );
  const save = () => {
    if (!v.title?.trim() || !v.date || !v.subject?.trim())
      return toast.error("Title, subject and date are required.");
    if (task) actions.updateTask(task.id, v);
    else {
      const t = v as Task;
      if (isDuplicate(t)) return toast.error("A matching item already exists on that date.");
      actions.addTask({ ...t, title: t.title.trim(), subject: t.subject.trim() });
      actions.ensureSubject(t.subject);
    }
    toast.success("Saved");
    setOpen(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(task ?? { type: "assignment", date: today(), ...defaults });
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit item" : "Add item"}</DialogTitle>
        </DialogHeader>
        <TaskFields v={v} set={(p) => setV((x) => ({ ...x, ...p }))} />
        <Button onClick={save}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
