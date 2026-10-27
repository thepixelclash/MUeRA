/**
 * Maps the in-app State to relational Supabase tables and back, and computes the
 * minimal set of writes (upsert changed rows, delete removed rows).
 * The user id is attached from the verified session; RLS enforces it again in the database.
 */
import type { State, Task, Subject, Slot, AttendanceRecord, Doc, ChatMsg } from "./store";

export type Row = Record<string, unknown>;
export type TableName =
  | "subjects"
  | "tasks"
  | "timetable_slots"
  | "attendance_records"
  | "documents"
  | "chat_messages"
  | "user_settings";
export type Rows = Record<TableName, Row[]>;

export const KEY_COLUMNS: Record<TableName, string[]> = {
  subjects: ["id"],
  tasks: ["id"],
  timetable_slots: ["id"],
  attendance_records: ["id"],
  documents: ["id"],
  chat_messages: ["idx"],
  user_settings: [],
};

const n = <T>(v: T | undefined | null) => (v === undefined ? null : v);

export function stateToRows(s: State, userId: string): Rows {
  const u = { user_id: userId };
  return {
    subjects: s.subjects.map((x) => ({
      ...u,
      id: x.id,
      name: x.name,
      difficulty: Math.min(5, Math.max(1, Math.round(x.difficulty) || 3)),
      attended: Math.max(0, Math.floor(Number(x.attended)) || 0),
      conducted: Math.max(0, Math.floor(Number(x.conducted)) || 0),
      kind: n(x.kind),
      demo: !!x.demo,
    })),
    tasks: s.tasks.map((x) => ({
      ...u,
      id: x.id,
      title: x.title,
      subject: x.subject ?? "",
      type: x.type,
      date: x.date,
      time: n(x.time),
      duration_min: n(x.durationMin),
      done: !!x.done,
      reminder_min: n(x.reminderMin),
      notes: n(x.notes),
      for_task_id: n(x.forTaskId),
      planned: !!x.planned,
      priority: n(x.priority),
      demo: !!x.demo,
    })),
    timetable_slots: s.timetable.map((x) => ({
      ...u,
      id: x.id,
      day: x.day,
      subject: x.subject,
      start_time: x.start,
      end_time: x.end,
      room: n(x.room),
      subject_id: n(x.subjectId),
      kind: n(x.kind),
      effective_date: n(x.effectiveDate),
      end_date: n(x.endDate),
      single_date: n(x.singleDate),
      source_file_id: n(x.sourceFileId),
      demo: !!x.demo,
    })),
    attendance_records: s.attendanceRecords.map((x) => ({
      ...u,
      id: x.id,
      slot_id: x.slotId,
      subject_id: x.subjectId,
      date: x.date,
      start_time: x.start,
      end_time: x.end,
      status: x.status,
    })),
    documents: s.docs.map((x) => ({
      ...u,
      id: x.id,
      name: x.name,
      pages: x.pages ?? 0,
      extracted_text: x.text ?? "",
      ai_cache: x.cache ?? {},
      demo: !!x.demo,
      drive_file_id: x.driveFileId ?? null,
      stack: x.stack ?? null,
    })),
    chat_messages: s.chat.map((x, i) => ({
      ...u,
      idx: i,
      role: x.role,
      content: x.content,
      local: !!x.local,
    })),
    user_settings: [
      {
        ...u,
        threshold: s.settings.threshold,
        study_hours_per_day: s.settings.studyHoursPerDay,
        session_min: s.settings.sessionMin,
        study_start: s.settings.studyStart,
        plan_note: s.planNote ?? "",
        ai_calls: s.aiCalls ?? 0,
      },
    ],
  };
}

const z = <T>(v: unknown): T | undefined => (v === null || v === undefined ? undefined : (v as T));

export function rowsToState(r: Partial<Rows>, base: State): State {
  const set = r.user_settings?.[0];
  return {
    ...base,
    subjects: (r.subjects ?? []).map((x): Subject => ({
      id: String(x.id),
      name: String(x.name),
      difficulty: Number(x.difficulty),
      attended: Number(x.attended),
      conducted: Number(x.conducted),
      kind: z(x.kind),
      demo: x.demo ? true : undefined,
    })),
    tasks: (r.tasks ?? []).map((x): Task => ({
      id: String(x.id),
      title: String(x.title),
      subject: String(x.subject ?? ""),
      type: x.type as Task["type"],
      date: String(x.date),
      time: z(x.time),
      durationMin: z(x.duration_min),
      done: !!x.done,
      reminderMin: z(x.reminder_min),
      notes: z(x.notes),
      forTaskId: z(x.for_task_id),
      planned: x.planned ? true : undefined,
      priority: z(x.priority),
      demo: x.demo ? true : undefined,
    })),
    timetable: (r.timetable_slots ?? []).map((x): Slot => ({
      id: String(x.id),
      day: Number(x.day),
      subject: String(x.subject),
      start: String(x.start_time),
      end: String(x.end_time),
      room: z(x.room),
      subjectId: z(x.subject_id),
      kind: z(x.kind),
      effectiveDate: z(x.effective_date),
      endDate: z(x.end_date),
      singleDate: z(x.single_date),
      sourceFileId: z(x.source_file_id),
      demo: x.demo ? true : undefined,
    })),
    attendanceRecords: (r.attendance_records ?? []).map((x): AttendanceRecord => ({
      id: String(x.id),
      slotId: String(x.slot_id),
      subjectId: String(x.subject_id),
      date: String(x.date),
      start: String(x.start_time),
      end: String(x.end_time),
      status: x.status as AttendanceRecord["status"],
    })),
    docs: (r.documents ?? []).map((x): Doc => ({
      id: String(x.id),
      name: String(x.name),
      pages: Number(x.pages),
      text: String(x.extracted_text ?? ""),
      cache: (x.ai_cache ?? {}) as Record<string, string>,
      demo: x.demo ? true : undefined,
      driveFileId: x.drive_file_id ? String(x.drive_file_id) : undefined,
      stack: x.stack ? String(x.stack) : undefined,
    })),
    chat: [...(r.chat_messages ?? [])]
      .sort((a, b) => Number(a.idx) - Number(b.idx))
      .map((x): ChatMsg => ({
        role: x.role as ChatMsg["role"],
        content: String(x.content),
        local: x.local ? true : undefined,
      })),
    settings: set
      ? {
          threshold: Number(set.threshold),
          studyHoursPerDay: Number(set.study_hours_per_day),
          sessionMin: Number(set.session_min),
          studyStart: String(set.study_start),
        }
      : base.settings,
    planNote: set ? String(set.plan_note ?? "") : base.planNote,
    aiCalls: set ? Number(set.ai_calls ?? 0) : base.aiCalls,
  };
}

const rowKey = (t: TableName, row: Row) => KEY_COLUMNS[t].map((k) => String(row[k])).join("|");

export type Plan = {
  upserts: Partial<Record<TableName, Row[]>>;
  deletes: Partial<Record<TableName, string[][]>>; // key-values per row
};

/** Compare previous synced rows with the next rows. Only changed rows are written. */
export function planSync(prev: Rows | null, next: Rows): Plan {
  const plan: Plan = { upserts: {}, deletes: {} };
  (Object.keys(next) as TableName[]).forEach((t) => {
    const before = new Map((prev?.[t] ?? []).map((r) => [rowKey(t, r), JSON.stringify(r)]));
    const nowKeys = new Set<string>();
    const ups: Row[] = [];
    for (const r of next[t]) {
      const k = rowKey(t, r);
      nowKeys.add(k);
      if (before.get(k) !== JSON.stringify(r)) ups.push(r);
    }
    if (ups.length) plan.upserts[t] = ups;
    if (KEY_COLUMNS[t].length) {
      const dels: string[][] = [];
      for (const r of prev?.[t] ?? [])
        if (!nowKeys.has(rowKey(t, r))) dels.push(KEY_COLUMNS[t].map((c) => String(r[c])));
      if (dels.length) plan.deletes[t] = dels;
    }
  });
  return plan;
}

/** Minimal Supabase client surface used here (so tests can pass a fake). */
export type DbClient = {
  from: (t: string) => {
    select: (c: string) => PromiseLike<{ data: Row[] | null; error: unknown }> & {
      eq: (c: string, v: string) => PromiseLike<{ data: Row[] | null; error: unknown }>;
    };
    upsert: (rows: Row[], o: { onConflict: string }) => PromiseLike<{ error: unknown }>;
    delete: () => {
      eq: (
        c: string,
        v: string,
      ) => {
        eq: (c: string, v: string) => PromiseLike<{ error: unknown }>;
        in: (c: string, v: string[]) => PromiseLike<{ error: unknown }>;
      };
    };
  };
};

export const ALL_TABLES: TableName[] = [
  "subjects",
  "tasks",
  "timetable_slots",
  "attendance_records",
  "documents",
  "chat_messages",
  "user_settings",
];

export async function loadRows(db: DbClient, userId: string): Promise<Rows> {
  const out = {} as Rows;
  for (const t of ALL_TABLES) {
    const { data, error } = await db.from(t).select("*").eq("user_id", userId);
    if (error) throw error;
    out[t] = data ?? [];
  }
  return out;
}

export async function applyPlan(db: DbClient, userId: string, plan: Plan): Promise<void> {
  for (const t of ALL_TABLES) {
    const ups = plan.upserts[t];
    if (ups?.length) {
      const conflict = ["user_id", ...KEY_COLUMNS[t]].join(",");
      for (let i = 0; i < ups.length; i += 200) {
        const { error } = await db.from(t).upsert(ups.slice(i, i + 200), { onConflict: conflict });
        if (error) throw error;
      }
    }
    const dels = plan.deletes[t];
    if (dels?.length) {
      const col = KEY_COLUMNS[t][0];
      const { error } = await db
        .from(t)
        .delete()
        .eq("user_id", userId)
        .in(
          col,
          dels.map((k) => k[0]),
        );
      if (error) throw error;
    }
  }
}

export const hasAnyRows = (r: Rows) => ALL_TABLES.some((t) => r[t].length > 0);
