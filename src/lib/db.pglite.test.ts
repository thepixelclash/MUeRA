// @vitest-environment node
// Runs the real SQL migrations on a real Postgres engine (PGlite, WASM build of Postgres).
// Supabase's auth schema is stubbed (auth.users, auth.uid(), roles) because PGlite has no Supabase.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const A = "00000000-0000-0000-0000-0000000000a1";
const B = "00000000-0000-0000-0000-0000000000b2";
let db: PGlite;

async function as(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    user ? JSON.stringify({ sub: user, role: "authenticated" }) : "{}",
  ]);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(coalesce(current_setting('request.jwt.claims', true),'{}')::jsonb ->> 'sub','')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  // The full schema, twice, to prove the migration is idempotent (re-runnable).
  const schema = readFileSync("supabase/schema.sql", "utf8");
  await db.exec(schema);
  await db.exec(schema);
});

const tables = [
  "subjects",
  "tasks",
  "timetable_slots",
  "attendance_records",
  "documents",
  "chat_messages",
  "user_settings",
  "user_data",
];

describe("real Postgres: schema and RLS", () => {
  it("RLS is enabled on every user-owned table with 4 policies each", async () => {
    for (const t of tables) {
      const r = await db.query(
        `select relrowsecurity from pg_class where oid = 'public.${t}'::regclass`,
      );
      expect((r.rows[0] as { relrowsecurity: boolean }).relrowsecurity, t).toBe(true);
      const p = await db.query(
        `select count(distinct cmd) c from pg_policies where schemaname='public' and tablename=$1`,
        [t],
      );
      expect(Number((p.rows[0] as { c: number }).c), t).toBeGreaterThanOrEqual(4);
    }
  });
  it("user A can insert/read/update/delete own rows", async () => {
    await as(
      A,
      `insert into tasks(user_id,id,title,type,date,priority) values ('${A}','t1','Essay','assignment','2026-11-01','high')`,
    );
    await as(
      A,
      `insert into chat_messages(user_id,idx,role,content) values ('${A}',0,'user','hi')`,
    );
    await as(A, `insert into user_settings(user_id) values ('${A}')`);
    expect((await as(A, `select * from tasks`)).rows).toHaveLength(1);
    await as(A, `update tasks set done = true where id='t1'`);
    expect(((await as(A, `select done from tasks`)).rows[0] as { done: boolean }).done).toBe(true);
  });
  it("user B sees none of A's data in any table", async () => {
    for (const t of tables) expect((await as(B, `select * from ${t}`)).rows, t).toHaveLength(0);
  });
  it("B cannot update or delete A's rows", async () => {
    const u = await as(B, `update tasks set title='hacked' where id='t1'`);
    expect(u.affectedRows).toBe(0);
    const d = await as(B, `delete from tasks where id='t1'`);
    expect(d.affectedRows).toBe(0);
    expect(((await as(A, `select title from tasks`)).rows[0] as { title: string }).title).toBe(
      "Essay",
    );
  });
  it("B cannot insert a row claiming A's user id", async () => {
    await expect(
      as(
        B,
        `insert into tasks(user_id,id,title,type,date) values ('${A}','x','forged','quiz','2026-11-01')`,
      ),
    ).rejects.toThrow();
    await expect(
      as(B, `update tasks set user_id='${B}' where id='t1'`).then((r) => {
        if (r.affectedRows) throw new Error("moved");
      }),
    ).resolves.toBeUndefined();
  });
  it("anonymous (not signed in) gets nothing and cannot write", async () => {
    await expect(as(null, `select * from tasks`)).rejects.toThrow();
    await expect(
      as(
        null,
        `insert into tasks(user_id,id,title,type,date) values ('${A}','y','a','quiz','2026-11-01')`,
      ),
    ).rejects.toThrow();
  });
  it("constraints reject invalid data", async () => {
    await expect(
      as(
        A,
        `insert into tasks(user_id,id,title,type,date) values ('${A}','bad1','x','nope','2026-11-01')`,
      ),
    ).rejects.toThrow();
    await expect(
      as(
        A,
        `insert into tasks(user_id,id,title,type,date) values ('${A}','bad2','x','quiz','not-a-date')`,
      ),
    ).rejects.toThrow();
    await expect(
      as(
        A,
        `insert into tasks(user_id,id,title,type,date,priority) values ('${A}','bad3','x','quiz','2026-11-01','urgent')`,
      ),
    ).rejects.toThrow();
    await expect(
      as(A, `insert into user_data(user_id,data) values ('${A}','[]')`),
    ).rejects.toThrow();
  });
  it("updated_at trigger fires and sign-out data persists (rows survive role change)", async () => {
    const r = await db.query(`select updated_at > created_at as moved from tasks where id='t1'`);
    expect((r.rows[0] as { moved: boolean }).moved).toBe(true);
    expect((await as(A, `select * from tasks`)).rows).toHaveLength(1);
  });
  it("deleting the auth user cascades their data only", async () => {
    await as(
      B,
      `insert into tasks(user_id,id,title,type,date) values ('${B}','b1','B task','quiz','2026-11-01')`,
    );
    await db.exec(`delete from auth.users where id='${B}'`);
    expect(((await db.query(`select count(*)::int c from tasks`)).rows[0] as { c: number }).c).toBe(
      1,
    );
  });
  it("legacy user_data table survives alongside the new tables (migration keeps old data)", async () => {
    await as(A, `insert into user_data(user_id,data) values ('${A}','{"tasks":[]}')`);
    expect((await as(A, `select * from user_data`)).rows).toHaveLength(1);
  });
});
