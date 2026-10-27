import { useSyncExternalStore } from "react";
import { addDays, format } from "date-fns";
import {
  applyPlan,
  hasAnyRows,
  loadRows,
  planSync,
  rowsToState,
  stateToRows,
  type DbClient,
  type Rows,
} from "./cloud-sync";
import {
  normalizeSubject,
  slotIdentity,
  slotOccursOn,
  validDate,
  validEntry,
  type ClassKind,
  type TimetableDraft,
} from "./timetable";

export type TaskType = "assignment" | "quiz" | "exam" | "class" | "study" | "personal";
export type Task = {
  id: string;
  title: string;
  subject: string;
  type: TaskType;
  date: string; // yyyy-MM-dd
  time?: string; // HH:mm
  durationMin?: number;
  done: boolean;
  reminderMin?: number; // minutes before
  notes?: string;
  forTaskId?: string; // study session target
  planned?: boolean;
  priority?: "low" | "medium" | "high";
  demo?: boolean;
};
export type Subject = {
  id: string;
  name: string;
  difficulty: number; // 1-5
  attended: number;
  conducted: number;
  kind?: ClassKind;
  demo?: boolean;
};
export type Slot = {
  id: string;
  day: number;
  subject: string;
  start: string;
  end: string;
  room?: string;
  demo?: boolean;
  subjectId?: string;
  kind?: ClassKind;
  effectiveDate?: string;
  endDate?: string;
  singleDate?: string;
  sourceFileId?: string;
};
export type AttendanceRecord = {
  id: string;
  slotId: string;
  subjectId: string;
  date: string;
  start: string;
  end: string;
  status: "Present" | "Absent" | "Cancelled";
};
export type Doc = {
  id: string;
  name: string;
  pages: number;
  text: string;
  cache: Record<string, string>;
  demo?: boolean;
  driveFileId?: string;
  stack?: string;
};
export type Settings = {
  threshold: number; // percent
  studyHoursPerDay: number;
  sessionMin: number;
  studyStart: string;
};
export type ChatMsg = { role: "user" | "assistant"; content: string; local?: boolean };
export type State = {
  tasks: Task[];
  subjects: Subject[];
  timetable: Slot[];
  docs: Doc[];
  settings: Settings;
  chat: ChatMsg[];
  planNote: string;
  aiCalls: number;
  attendanceRecords: AttendanceRecord[];
};

let activeUserId: string | null = null;
const KEY = "muera-v1";
const storageKey = () => (activeUserId ? `${KEY}:${activeUserId}` : KEY);
let cloudSaveTimer: ReturnType<typeof setTimeout> | undefined;
let loadingCloud = false;
/** True when the cloud copy could not be loaded: never overwrite it with local data. */
let cloudBlocked = false;

function notify(kind: "error" | "success", message: string, retry?: () => void) {
  void import("sonner")
    .then(({ toast }) =>
      toast[kind](message, retry ? { action: { label: "Retry", onClick: retry } } : undefined),
    )
    .catch(() => {});
}

let lastSynced: Rows | null = null;

let saveChain: Promise<void> = Promise.resolve();
function saveToCloud(): Promise<void> {
  const run = saveChain.then(doSave);
  saveChain = run.catch(() => {});
  return run;
}

async function doSave() {
  const { supabase } = await import("./supabase");
  if (!supabase || !activeUserId || cloudBlocked) return;
  const userId = activeUserId;
  const next = stateToRows(state, userId);
  const plan = planSync(lastSynced, next);
  await applyPlan(supabase as unknown as DbClient, userId, plan);
  lastSynced = next;
}
export const uid = () => Math.random().toString(36).slice(2, 10);
export const today = () => format(new Date(), "yyyy-MM-dd");
const d = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");

export const defaultSettings: Settings = {
  threshold: 75,
  studyHoursPerDay: 2,
  sessionMin: 45,
  studyStart: "18:00",
};
const empty: State = {
  tasks: [],
  subjects: [],
  timetable: [],
  docs: [],
  settings: defaultSettings,
  chat: [],
  planNote: "",
  aiCalls: 0,
  attendanceRecords: [],
};

export function demoData(): Pick<State, "tasks" | "subjects" | "timetable" | "docs"> {
  const subjects: Subject[] = [
    { id: uid(), name: "Data Structures", difficulty: 4, attended: 28, conducted: 36, demo: true },
    { id: uid(), name: "Linear Algebra", difficulty: 5, attended: 30, conducted: 34, demo: true },
    {
      id: uid(),
      name: "Digital Electronics",
      difficulty: 3,
      attended: 22,
      conducted: 32,
      demo: true,
    },
    {
      id: uid(),
      name: "Technical Writing",
      difficulty: 2,
      attended: 18,
      conducted: 20,
      demo: true,
    },
  ];
  const timetable: Slot[] = [];
  const plan: [number, string, string, string, string][] = [
    [1, "Data Structures", "09:00", "10:00", "LH-2"],
    [1, "Linear Algebra", "11:00", "12:00", "LH-4"],
    [2, "Digital Electronics", "10:00", "11:00", "Lab 3"],
    [2, "Technical Writing", "14:00", "15:00", "R-101"],
    [3, "Data Structures", "09:00", "10:00", "LH-2"],
    [3, "Linear Algebra", "12:00", "13:00", "LH-4"],
    [4, "Digital Electronics", "10:00", "12:00", "Lab 3"],
    [5, "Linear Algebra", "09:00", "10:00", "LH-4"],
    [5, "Data Structures", "11:00", "12:00", "LH-2"],
  ];
  plan.forEach(([day, subject, start, end, room]) =>
    timetable.push({ id: uid(), day, subject, start, end, room, demo: true }),
  );
  const tasks: Task[] = [
    {
      id: uid(),
      title: "Quiz 2: Trees & Heaps",
      subject: "Data Structures",
      type: "quiz",
      date: d(3),
      time: "10:00",
      done: false,
      reminderMin: 60,
      demo: true,
    },
    {
      id: uid(),
      title: "Assignment 3: Eigenvalues",
      subject: "Linear Algebra",
      type: "assignment",
      date: d(5),
      time: "23:59",
      done: false,
      reminderMin: 120,
      demo: true,
    },
    {
      id: uid(),
      title: "Mid-sem exam",
      subject: "Digital Electronics",
      type: "exam",
      date: d(9),
      time: "09:30",
      done: false,
      reminderMin: 1440,
      demo: true,
    },
    {
      id: uid(),
      title: "Lab report: K-maps",
      subject: "Digital Electronics",
      type: "assignment",
      date: d(1),
      time: "17:00",
      done: false,
      demo: true,
    },
    {
      id: uid(),
      title: "Essay draft review",
      subject: "Technical Writing",
      type: "personal",
      date: d(0),
      time: "16:00",
      done: true,
      demo: true,
    },
  ];
  const docs: Doc[] = [
    {
      id: uid(),
      name: "Sample — Binary Trees lecture notes",
      pages: 2,
      demo: true,
      text: "Binary Trees. A binary tree is a hierarchical structure where each node has at most two children, called left and right. The topmost node is the root. A node with no children is a leaf. Height of a tree is the number of edges on the longest path from root to a leaf.\nTraversals: In-order (Left, Root, Right) visits a binary search tree in sorted order. Pre-order (Root, Left, Right) is used to copy trees. Post-order (Left, Right, Root) is used to delete trees. Level-order uses a queue.\nBinary Search Tree (BST): for every node, keys in the left subtree are smaller and keys in the right subtree are larger. Search, insert and delete take O(h) time, where h is height; O(log n) when balanced, O(n) in the worst case.\nHeaps: a binary heap is a complete binary tree satisfying the heap property. In a max-heap every parent is greater than or equal to its children. Insert and extract-max take O(log n). Heaps implement priority queues and heapsort (O(n log n)).",
      cache: {
        summary:
          "Summary (sample, pre-generated — no AI credit used)\n\n• A binary tree: each node has at most two children (left/right); top node = root, childless node = leaf.\n• Height = edges on the longest root-to-leaf path.\n• Traversals: in-order (sorted output for BSTs), pre-order (copying), post-order (deleting), level-order (uses a queue).\n• BST rule: left keys smaller, right keys larger. Operations cost O(h): O(log n) balanced, O(n) worst case.\n• Binary heap: complete tree with the heap property; insert/extract in O(log n); used for priority queues and heapsort O(n log n).\n\nKEYWORDS: binary tree traversal, binary search tree, binary heap, heapsort",
        quiz: JSON.stringify([
          {
            q: "Which traversal of a BST outputs keys in sorted order?",
            options: ["Pre-order", "In-order", "Post-order", "Level-order"],
            answer: 1,
            why: "In-order visits Left, Root, Right, which is ascending order in a BST.",
          },
          {
            q: "Worst-case search time in an unbalanced BST?",
            options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
            answer: 2,
            why: "The notes say operations take O(h), and h can be n in the worst case.",
          },
          {
            q: "Level-order traversal uses which structure?",
            options: ["Stack", "Queue", "Heap", "Hash table"],
            answer: 1,
            why: "The notes state level-order uses a queue.",
          },
        ]),
        flashcards: JSON.stringify([
          { front: "Leaf node", back: "A node with no children." },
          { front: "Max-heap property", back: "Every parent is ≥ its children." },
          { front: "Heapsort complexity", back: "O(n log n)" },
        ]),
      },
    },
  ];
  return { tasks, subjects, timetable, docs };
}

let state: State = empty;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  if (hydrated) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
      if (activeUserId && !loadingCloud) {
        if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
        cloudSaveTimer = setTimeout(() => {
          const attempt = () =>
            saveToCloud().catch((e) => {
              console.error("MUeRA cloud save failed", e);
              notify(
                "error",
                "Could not save to the cloud. Your changes are kept on this device.",
                attempt,
              );
            });
          void attempt();
        }, 700);
      }
    } catch {
      /* storage full */
    }
  }
  listeners.forEach((l) => l());
}

export async function activateUser(userId: string) {
  activeUserId = userId;
  hydrated = true;
  loadingCloud = true;
  cloudBlocked = false;
  lastSynced = null;
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...empty, ...parsed, settings: { ...defaultSettings, ...parsed.settings } };
    }
    const { supabase } = await import("./supabase");
    if (supabase) {
      const db = supabase as unknown as DbClient;
      const rows = await loadRows(db, userId);
      if (hasAnyRows(rows)) {
        state = rowsToState(rows, empty);
        lastSynced = stateToRows(state, userId);
      } else {
        // First sign-in with the new tables: keep any older JSON copy (user_data), else local data.
        const { data: legacy, error } = await supabase
          .from("user_data")
          .select("data")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        if (legacy?.data && typeof legacy.data === "object") {
          const old = legacy.data as Partial<State>;
          state = { ...empty, ...old, settings: { ...defaultSettings, ...(old.settings ?? {}) } };
        }
        lastSynced = null;
        await saveToCloud();
      }
    }
    localStorage.setItem(storageKey(), JSON.stringify(state));
  } catch (e) {
    console.error("MUeRA cloud load failed", e);
    cloudBlocked = true;
    notify(
      "error",
      "Could not load your saved data. Changes will not sync until you retry.",
      () => void activateUser(userId),
    );
  } finally {
    loadingCloud = false;
    emit();
  }
}

export function clearActiveUser() {
  activeUserId = null;
  hydrated = false;
  state = { ...empty };
  emit();
}

export function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...empty, ...parsed, settings: { ...defaultSettings, ...parsed.settings } };
      const integer = (v: unknown) => (/^\d+$/.test(String(v)) ? Number(v) : 0);
      state.subjects = state.subjects.map((s) => ({
        ...s,
        attended: integer(s.attended),
        conducted: integer(s.conducted),
      }));
    }
  } catch {
    state = { ...empty };
  }
  emit();
}

/** Export everything the user saved as a JSON string. */
export function exportData() {
  return JSON.stringify(
    { app: "muera", version: 1, exportedAt: new Date().toISOString(), data: state },
    null,
    2,
  );
}
/** Import a previously exported file. Returns an error message or null. */
export function importData(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "This file isn't valid JSON.";
  }
  const d = (parsed as { data?: unknown })?.data ?? parsed;
  if (!d || typeof d !== "object") return "This file doesn't contain MUeRA data.";
  const o = d as Partial<State>;
  const arrays = ["tasks", "subjects", "timetable", "docs", "chat", "attendanceRecords"] as const;
  if (!arrays.some((k) => Array.isArray(o[k]))) return "This file doesn't contain MUeRA data.";
  for (const k of arrays)
    if (o[k] != null && !Array.isArray(o[k])) return `The "${k}" section is damaged.`;
  const integer = (v: unknown) => (/^\d+$/.test(String(v)) ? Number(v) : 0);
  state = {
    ...empty,
    ...o,
    settings: { ...defaultSettings, ...(o.settings ?? {}) },
    aiCalls: integer(o.aiCalls),
    subjects: (o.subjects ?? []).map((x) => ({
      ...x,
      attended: integer(x.attended),
      conducted: integer(x.conducted),
      difficulty: integer(x.difficulty) || 3,
    })),
  } as State;
  emit();
  return null;
}

export function setState(fn: (s: State) => Partial<State>) {
  state = { ...state, ...fn(state) };
  emit();
}
export const getState = () => state;
export const getActiveUserId = () => activeUserId;

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => empty,
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function isDuplicate(
  t: Pick<Task, "title" | "subject" | "date" | "type">,
  list = state.tasks,
) {
  return list.some(
    (x) =>
      x.date === t.date &&
      x.type === t.type &&
      norm(x.subject) === norm(t.subject) &&
      (norm(x.title) === norm(t.title) || x.type !== "personal"),
  );
}

export const actions = {
  addTask(t: Omit<Task, "id" | "done"> & { done?: boolean }) {
    setState((s) => ({ tasks: [...s.tasks, { done: false, ...t, id: uid() }] }));
  },
  updateTask(id: string, patch: Partial<Task>) {
    setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  },
  deleteTask(id: string) {
    setState((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },
  addSlot(slot: Omit<Slot, "id">) {
    setState((s) => ({ timetable: [...s.timetable, { ...slot, id: uid() }] }));
  },
  updateSlot(id: string, patch: Partial<Slot>) {
    setState((s) => ({
      timetable: s.timetable.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  },
  deleteSlot(id: string) {
    setState((s) => ({ timetable: s.timetable.filter((x) => x.id !== id) }));
  },
  ensureSubject(name: string, kind: ClassKind = "theory") {
    if (!name.trim()) return;
    if (state.subjects.some((x) => norm(x.name) === norm(name))) return;
    setState((s) => ({
      subjects: [
        ...s.subjects,
        { id: uid(), name: name.trim(), difficulty: 3, attended: 0, conducted: 0, kind },
      ],
    }));
  },
  clearDemo() {
    setState((s) => ({
      tasks: s.tasks.filter((x) => !x.demo),
      subjects: s.subjects.filter((x) => !x.demo),
      timetable: s.timetable.filter((x) => !x.demo),
      docs: s.docs.filter((x) => !x.demo),
    }));
  },
  loadDemo() {
    actions.clearDemo();
    const dd = demoData();
    setState((s) => ({
      tasks: [...s.tasks, ...dd.tasks],
      subjects: [...s.subjects, ...dd.subjects],
      timetable: [...s.timetable, ...dd.timetable],
      docs: [...s.docs, ...dd.docs],
    }));
  },
  wipeAll() {
    setState(() => ({ ...empty }));
  },
  saveTimetable(
    entries: TimetableDraft[],
    detectedSubjects: { name: string; kind: ClassKind }[],
    effective: string,
    end: string,
    includeLabs: boolean,
    replace: boolean,
    recurring = true,
    sourceFileId?: string,
  ) {
    if (!validDate(effective) || !validDate(end) || end < effective)
      return {
        error: "Enter a valid effective date and semester end date.",
        saved: 0,
        subjectsSaved: 0,
        theorySaved: 0,
        duplicates: 0,
      };
    const valid = entries.filter(validEntry);
    if (!valid.length)
      return {
        error:
          "No valid class sessions to save. Correct the weekday, subject and times, or add a class manually.",
        saved: 0,
        subjectsSaved: 0,
        theorySaved: 0,
        duplicates: 0,
      };
    const subjects = [...state.subjects];
    let subjectsSaved = 0,
      theorySaved = 0,
      saved = 0,
      duplicates = 0;
    const candidates = [
      ...detectedSubjects,
      ...valid.map((d) => ({ name: d.subject, kind: d.kind })),
    ];
    for (const c of candidates) {
      if (!c.name.trim() || (c.kind !== "theory" && !includeLabs)) continue;
      if (subjects.some((s) => normalizeSubject(s.name) === normalizeSubject(c.name))) continue;
      subjects.push({
        id: uid(),
        name: c.name.trim(),
        kind: c.kind,
        attended: 0,
        conducted: 0,
        difficulty: 3,
      });
      subjectsSaved++;
      if (c.kind === "theory") theorySaved++;
    }
    const timetable = replace ? [] : [...state.timetable];
    for (const d of valid) {
      if (d.day == null) continue;
      const day = d.day;
      const match = state.timetable.find((s) => slotIdentity(s) === slotIdentity({ ...d, day }));
      const existing = timetable.find((s) => slotIdentity(s) === slotIdentity({ ...d, day }));
      if (existing) {
        duplicates++;
        continue;
      }
      const subject = subjects.find(
        (s) => normalizeSubject(s.name) === normalizeSubject(d.subject),
      );
      timetable.push({
        id: match?.id ?? uid(),
        subject: d.subject.trim(),
        subjectId: subject?.id,
        kind: d.kind,
        day: d.day,
        start: d.start,
        end: d.end,
        effectiveDate: effective,
        endDate: end,
        ...(!recurring ? { singleDate: effective } : {}),
        ...(sourceFileId ? { sourceFileId } : {}),
      });
      saved++;
    }
    if (!saved && !subjectsSaved)
      return {
        error: "This timetable is already saved. No new subjects or class sessions were added.",
        saved,
        subjectsSaved,
        theorySaved,
        duplicates,
      };
    setState(() => ({ subjects, timetable }));
    return { saved, subjectsSaved, theorySaved, duplicates, error: undefined };
  },
  recordAttendance(slotId: string, date: string, status: AttendanceRecord["status"] | null) {
    const slot = state.timetable.find((s) => s.id === slotId);
    if (!slot || !slotOccursOn(slot, date)) return;
    const subject = state.subjects.find(
      (s) => s.id === slot.subjectId || normalizeSubject(s.name) === normalizeSubject(slot.subject),
    );
    if (!subject) return;
    const previous = state.attendanceRecords.find((r) => r.slotId === slotId && r.date === date);
    const a = (r: AttendanceRecord | undefined) => (r?.status === "Present" ? 1 : 0);
    const c = (r: AttendanceRecord | undefined) => (r && r.status !== "Cancelled" ? 1 : 0);
    const record: AttendanceRecord | undefined = status
      ? {
          id: previous?.id ?? uid(),
          slotId,
          subjectId: subject.id,
          date,
          start: slot.start,
          end: slot.end,
          status,
        }
      : undefined;
    setState((s) => ({
      attendanceRecords: [
        ...s.attendanceRecords.filter((r) => !(r.slotId === slotId && r.date === date)),
        ...(record ? [record] : []),
      ],
      subjects: s.subjects.map((x) =>
        x.id === subject.id
          ? {
              ...x,
              attended: Math.max(0, x.attended - a(previous) + a(record)),
              conducted: Math.max(0, x.conducted - c(previous) + c(record)),
            }
          : x,
      ),
    }));
  },
  correctAttendance(recordId: string, status: AttendanceRecord["status"] | null) {
    const previous = state.attendanceRecords.find((r) => r.id === recordId);
    if (!previous) return;
    setState((s) => ({
      attendanceRecords: status
        ? s.attendanceRecords.map((r) => (r.id === recordId ? { ...r, status } : r))
        : s.attendanceRecords.filter((r) => r.id !== recordId),
      subjects: s.subjects.map((x) =>
        x.id === previous.subjectId
          ? {
              ...x,
              attended: Math.max(
                0,
                x.attended -
                  (previous.status === "Present" ? 1 : 0) +
                  (status === "Present" ? 1 : 0),
              ),
              conducted: Math.max(
                0,
                x.conducted -
                  (previous.status !== "Cancelled" ? 1 : 0) +
                  (status && status !== "Cancelled" ? 1 : 0),
              ),
            }
          : x,
      ),
    }));
  },
};
