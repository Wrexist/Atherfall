// Database rules, checked on a real Postgres (PGlite, in-process). Every
// migration in supabase/migrations is applied to a fresh database with small
// stand-ins for Supabase's auth and realtime schemas. Run with: bun test ./tests
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = join(import.meta.dir, "../supabase/migrations");
const NAMES = ["Sela", "Rowan", "Mira", "Kess", "Oda", "Tamsin", "Ash", "Bram"] as const;
type Name = (typeof NAMES)[number];
const U = Object.fromEntries(
  NAMES.map((n, i) => [n, `00000000-0000-0000-0000-00000000000${i + 1}`]),
) as Record<Name, string>;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    create schema realtime;
    create table realtime.messages (id int);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable
      as $$ select current_setting('request.topic', true) $$;
    grant usage on schema public, auth, realtime to authenticated, anon;
    grant select, insert on realtime.messages to authenticated;
    create publication supabase_realtime;
    -- Like Supabase: new tables are granted to the API roles at creation;
    -- a migration's own revokes come after.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `);
  for (const f of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  for (const n of NAMES) {
    await db.exec(`insert into auth.users values ('${U[n]}', '{"display_name":"${n}"}')`);
  }
}, 60_000);

/** Run SQL as a signed-in player (or signed out, with ""), on a realtime topic. */
async function as(who: Name | "", sql: string, topic = "") {
  await db.exec(`set role authenticated;
    select set_config('request.uid', '${who ? U[who] : ""}', false);
    select set_config('request.topic', '${topic}', false);`);
  try {
    return await db.query<Record<string, unknown>>(sql);
  } finally {
    await db.exec("reset role");
  }
}

async function attempt(who: Name | "", sql: string, topic = "") {
  try {
    return { ok: true as const, rows: (await as(who, sql, topic)).rows };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

describe("cloud saves", () => {
  const upload = (who: Name, level: number, base: number, at = "2020-01-01T00:00:00Z") =>
    attempt(
      who,
      `select public.upload_save('{"level":${level}}'::jsonb, 2, ${level}, '${at}', ${base}) as r`,
    ).then((x) => (x.ok ? x.rows[0]!["r"] : x.error));
  const level = async () =>
    (
      await db.query<{ level: number }>(
        `select level from public.saves where user_id = '${U.Sela}'`,
      )
    ).rows[0]?.level;

  test("uploads build on the revision the device saw; stale ones are refused", async () => {
    expect(Number(await upload("Sela", 3, 0, "2030-01-01T00:00:00Z"))).toBe(1);
    // An older clock doesn't matter: only the revision does.
    expect(Number(await upload("Sela", 4, 1, "2019-01-01T00:00:00Z"))).toBe(2);
    expect(await upload("Sela", 2, 1)).toBeNull();
    expect(await level()).toBe(4);
  });

  test("saves can only be written through upload_save", async () => {
    const update = await attempt(
      "Sela",
      `update public.saves set level = 9 where user_id = '${U.Sela}'`,
    );
    const insert = await attempt(
      "Rowan",
      `insert into public.saves (user_id, data, version, level, saved_at) values ('${U.Rowan}', '{}', 2, 1, now())`,
    );
    expect(await level()).toBe(4); // refused, or matched no rows
    expect(insert.ok).toBe(false);
    void update;
  });

  test("players read only their own save; signed-out users can't upload", async () => {
    await upload("Rowan", 1, 0);
    const rows = (await as("Rowan", "select user_id from public.saves")).rows;
    expect(rows.map((r) => r["user_id"])).toEqual([U.Rowan]);
    expect((await attempt("", `select public.upload_save('{}'::jsonb, 2, 1, now(), 0)`)).ok).toBe(
      false,
    );
  });
});

describe("parties", () => {
  const invite = async (from: Name, to: Name) => {
    const r = await attempt(from, `select public.invite_to_party('${U[to]}') as id`);
    return r.ok ? { ok: true as const, id: String(r.rows[0]!["id"]) } : r;
  };
  const accept = (who: Name, id: string) => attempt(who, `select public.accept_invite('${id}')`);
  const partyOf = async (who: Name) =>
    (
      await db.query<{ party_id: string }>(
        `select party_id from public.party_members where user_id = '${U[who]}'`,
      )
    ).rows[0]?.party_id;
  const count = async (pid: string) =>
    (
      await db.query<{ n: number }>(
        `select count(*)::int as n from public.party_members where party_id = '${pid}'`,
      )
    ).rows[0]!.n;
  let pid = "";

  test("an invite makes a party; only the invitee sees it; accepting joins", async () => {
    const i = await invite("Sela", "Rowan");
    expect(i.ok).toBe(true);
    pid = (await partyOf("Sela"))!;
    expect((await as("Rowan", "select * from public.party_invites")).rows.length).toBe(1);
    expect((await as("Mira", "select * from public.party_invites")).rows.length).toBe(0);
    expect((await accept("Rowan", i.ok ? i.id : "")).ok).toBe(true);
    expect(await count(pid)).toBe(2);
    expect((await as("Mira", "select * from public.party_members")).rows.length).toBe(0);
  });

  test("four is the limit", async () => {
    const mira = await invite("Rowan", "Mira"); // any member can invite
    const kess = await invite("Sela", "Kess");
    const oda = await invite("Sela", "Oda");
    await accept("Mira", mira.ok ? mira.id : "");
    await accept("Kess", kess.ok ? kess.id : "");
    expect(await count(pid)).toBe(4);
    const late = await accept("Oda", oda.ok ? oda.id : "");
    expect(late.ok ? "" : late.error).toMatch(/full/);
    expect((await invite("Sela", "Tamsin")).ok).toBe(false);
  });

  test("no inviting yourself, players in a party, or players who switched invites off", async () => {
    expect((await invite("Oda", "Oda")).ok).toBe(false);
    expect((await invite("Oda", "Rowan")).ok).toBe(false);
    await as("Tamsin", `update public.profiles set party_invites = false where id = '${U.Tamsin}'`);
    const r = await invite("Oda", "Tamsin");
    expect(r.ok ? "" : r.error).toMatch(/isn't taking/);
  });

  test("no joining or inviting by writing the tables directly", async () => {
    const join = await attempt(
      "Oda",
      `insert into public.party_members (user_id, party_id) values ('${U.Oda}', '${pid}')`,
    );
    const forged = await attempt(
      "Oda",
      `insert into public.party_invites (party_id, from_user, to_user) values ('${pid}', '${U.Sela}', '${U.Oda}')`,
    );
    expect(join.ok).toBe(false);
    expect(forged.ok).toBe(false);
    expect(await count(pid)).toBe(4);
  });

  test("the party channel is for members only", async () => {
    const send = (who: Name) =>
      attempt(who, "insert into realtime.messages (id) values (1)", `party:${pid}`);
    expect((await send("Mira")).ok).toBe(true);
    expect((await send("Oda")).ok).toBe(false);
  });

  test("only the leader removes members; leadership passes on; the last one out ends it", async () => {
    expect((await attempt("Rowan", `select public.remove_member('${U.Kess}')`)).ok).toBe(false);
    await as("Sela", `select public.remove_member('${U.Kess}')`);
    expect(await count(pid)).toBe(3);
    await as("Sela", "select public.leave_party()");
    const leader = (
      await db.query<{ leader: string }>(`select leader from public.parties where id = '${pid}'`)
    ).rows[0]?.leader;
    expect(leader).toBe(U.Rowan);
    await as("Rowan", "select public.leave_party()");
    await as("Mira", "select public.leave_party()");
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::int as n from public.parties where id = '${pid}'`,
        )
      ).rows[0]!.n,
    ).toBe(0);
  });

  test("no invite spam: one live invite each, a cooldown after a no, 5 a minute", async () => {
    const first = await invite("Oda", "Rowan");
    const dup = await invite("Oda", "Rowan");
    expect(first.ok).toBe(true);
    expect(dup.ok ? "" : dup.error).toMatch(/Already/);
    await as("Rowan", `select public.decline_invite('${first.ok ? first.id : ""}')`);
    const pester = await invite("Oda", "Rowan");
    expect(pester.ok ? "" : pester.error).toMatch(/said no/);
    let sent = 1;
    for (const who of ["Mira", "Kess", "Sela", "Ash", "Bram"] as const) {
      if ((await invite("Oda", who)).ok) sent++;
    }
    expect(sent).toBe(5);
  });

  test("expired invites can't be accepted; signed-out users can't invite", async () => {
    await db.exec(
      `update public.party_invites set expires_at = now() - interval '1 second' where to_user = '${U.Mira}'`,
    );
    const id = (
      await db.query<{ id: string }>(
        `select id from public.party_invites where to_user = '${U.Mira}' limit 1`,
      )
    ).rows[0]!.id;
    const r = await accept("Mira", id);
    expect(r.ok ? "" : r.error).toMatch(/expired/);
    expect((await attempt("", `select public.invite_to_party('${U.Rowan}')`)).ok).toBe(false);
  });
});
