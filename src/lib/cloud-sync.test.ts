import { describe, expect, it } from "vitest";
import {
  applyPlan,
  loadRows,
  planSync,
  rowsToState,
  stateToRows,
  type DbClient,
  type Row,
} from "./cloud-sync";
import type { State } from "./store";

const mk = (): State => ({
  tasks: [
    {
      id: "t1",
      title: "Essay",
      subject: "Eng",
      type: "assignment",
      date: "2026-11-01",
      done: false,
      priority: "high",
      durationMin: 30,
    },
  ],
  subjects: [{ id: "s1", name: "Eng", difficulty: 4, attended: 3, conducted: 4 }],
  timetable: [{ id: "x1", day: 1, subject: "Eng", start: "09:00", end: "10:00" }],
  docs: [{ id: "d1", name: "Notes", pages: 1, text: "hello", cache: { summary: "s" } }],
  settings: { threshold: 80, studyHoursPerDay: 3, sessionMin: 30, studyStart: "17:00" },
  chat: [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ],
  planNote: "note",
  aiCalls: 2,
  attendanceRecords: [
    {
      id: "a1",
      slotId: "x1",
      subjectId: "s1",
      date: "2026-10-20",
      start: "09:00",
      end: "10:00",
      status: "Present",
    },
  ],
});

/** In-memory fake that mimics what RLS enforces: a caller only sees/changes rows of its own user. */
function fakeDb(store: Map<string, Row[]>, callerId: string): DbClient {
  const rows = (t: string) => store.get(t) ?? [];
  return {
    from: (t: string) =>
      ({
        select: () => {
          const res = { data: rows(t).filter((r) => r.user_id === callerId), error: null };
          return Object.assign(Promise.resolve(res), {
            eq: (_c: string, v: string) =>
              Promise.resolve({
                data: rows(t).filter((r) => r.user_id === callerId && r.user_id === v),
                error: null,
              }),
          });
        },
        upsert: (inc: Row[]) => {
          if (inc.some((r) => r.user_id !== callerId))
            return Promise.resolve({ error: new Error("RLS violation") });
          const cur = rows(t);
          for (const r of inc) {
            const k = r.user_id + "|" + (r.id ?? r.idx ?? "");
            const i = cur.findIndex((c) => c.user_id + "|" + (c.id ?? c.idx ?? "") === k);
            if (i >= 0) cur[i] = { ...r };
            else cur.push({ ...r });
          }
          store.set(t, cur);
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          eq: (_c: string, uid: string) => ({
            eq: () => Promise.resolve({ error: null }),
            in: (col: string, keys: string[]) => {
              store.set(
                t,
                rows(t).filter(
                  (r) =>
                    !(r.user_id === callerId && uid === callerId && keys.includes(String(r[col]))),
                ),
              );
              return Promise.resolve({ error: null });
            },
          }),
        }),
      }) as never,
  };
}

describe("relational mapping", () => {
  it("round-trips state through rows without loss", () => {
    const s = mk();
    const back = rowsToState(stateToRows(s, "u1"), { ...s, tasks: [] });
    expect(back).toEqual(s);
  });
  it("only writes changed rows and deletes removed ones", () => {
    const s = mk();
    const prev = stateToRows(s, "u1");
    const s2 = { ...s, tasks: [{ ...s.tasks[0], done: true }], subjects: [] };
    const plan = planSync(prev, stateToRows(s2, "u1"));
    expect(plan.upserts.tasks).toHaveLength(1);
    expect(plan.upserts.documents).toBeUndefined();
    expect(plan.deletes.subjects).toEqual([["s1"]]);
  });
  it("persists across sessions: save then load returns the same data", async () => {
    const store = new Map<string, Row[]>();
    const db = fakeDb(store, "u1");
    await applyPlan(db, "u1", planSync(null, stateToRows(mk(), "u1")));
    const loaded = rowsToState(await loadRows(db, "u1"), { ...mk(), tasks: [] });
    expect(loaded).toEqual(mk());
  });
  it("update and delete reach the database", async () => {
    const store = new Map<string, Row[]>();
    const db = fakeDb(store, "u1");
    const s = mk();
    const r1 = stateToRows(s, "u1");
    await applyPlan(db, "u1", planSync(null, r1));
    const s2 = { ...s, tasks: [], chat: [s.chat[0]] };
    await applyPlan(db, "u1", planSync(r1, stateToRows(s2, "u1")));
    expect(store.get("tasks")).toHaveLength(0);
    expect(store.get("chat_messages")).toHaveLength(1);
  });
  it("logic-level isolation (fake mirrors RLS; real RLS test is pending a live project)", async () => {
    const store = new Map<string, Row[]>();
    await applyPlan(fakeDb(store, "u1"), "u1", planSync(null, stateToRows(mk(), "u1")));
    const other = await loadRows(fakeDb(store, "u2"), "u2");
    expect(other.tasks).toHaveLength(0);
    await expect(
      applyPlan(fakeDb(store, "u2"), "u1", planSync(null, stateToRows(mk(), "u1"))),
    ).rejects.toThrow();
  });
});

describe("source file references", () => {
  it("round-trips timetable slot sourceFileId and document driveFileId", () => {
    const base = mk();
    const st: State = {
      ...base,
      timetable: [
        { id: "s1", day: 1, subject: "Math", start: "09:00", end: "10:00", sourceFileId: "drv1" },
      ],
      docs: [{ id: "d1", name: "n.pdf", pages: 1, text: "t", cache: {}, driveFileId: "drv2" }],
    };
    const rows = stateToRows(st, "u1");
    expect(rows.timetable_slots[0].source_file_id).toBe("drv1");
    expect(rows.documents[0].drive_file_id).toBe("drv2");
    const back = rowsToState(rows, base);
    expect(back.timetable[0].sourceFileId).toBe("drv1");
    expect(back.docs[0].driveFileId).toBe("drv2");
  });
});
