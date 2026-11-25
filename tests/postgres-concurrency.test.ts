import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Queryable } from "../src/server/db";
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as capture } from "../src/app/api/movements/route";

const mocks = vi.hoisted(() => ({ store: null as unknown, signIn: vi.fn(), refresh: vi.fn() }));
vi.mock("../src/server/db", () => ({ database: () => mocks.store }));
vi.mock("../src/server/auth-provider", () => ({
  authProvider: () => ({ signIn: mocks.signIn, refresh: mocks.refresh })
}));

const socket = process.env.APA_TEST_PG_SOCKET;
const port = Number(process.env.APA_TEST_PG_PORT || 55479);
const origin = "https://app.example.invalid";
const user = "00000000-0000-4000-8000-000000000001";
const location = "00000000-0000-4000-9000-000000000001";
const qr = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const dbName = `apa_concurrency_${randomBytes(6).toString("hex")}`;
let owner: Pool;
let admin: Pool;
let application: Pool;
let hold: { match: string; entered: () => void; resume: Promise<void> } | undefined;
let backends: Set<number>;

function gate(match: string) {
  let entered!: () => void;
  let release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  hold = { match, entered, resume };
  return { reached, release };
}

function request(body: object, cookie?: string) {
  return new Request(`${origin}/api/movements`, {
    method: "POST",
    headers: {
      origin, "x-apa-csrf": "1", "content-type": "application/json",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

async function signedIn() {
  const response = await login(new Request(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { origin, "x-apa-csrf": "1", "content-type": "application/json" },
    body: JSON.stringify({ username: "operator.test", password: "synthetic-password" })
  }));
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}

async function countMovements() {
  return Number((await admin.query<{ count: string }>(
    "select count(*) from apa_private.movements"
  )).rows[0].count);
}

// Observe blocking in PostgreSQL, not a timer-based guess that another handler ran.
async function expectBlocked(sql: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await admin.query<{ blocked: boolean }>(
      `select exists(select 1 from pg_stat_activity
       where datname=current_database() and query like $1
       and cardinality(pg_blocking_pids(pid)) > 0) as blocked`,
      [`%${sql}%`]
    );
    if (result.rows[0].blocked) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`PostgreSQL did not report a blocked ${sql} query.`);
}

describe.skipIf(!socket)("M02/M04 with independent PostgreSQL connections", () => {
  beforeAll(async () => {
    // Opt in only to an explicitly selected local UNIX socket. Never use PGHOST.
    if (!socket!.startsWith("/") || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Valid local PostgreSQL UNIX socket and port required.");
    }
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("APP_ORIGIN", origin);
    vi.stubEnv("DATABASE_URL", "postgresql://synthetic:synthetic@db.example.invalid/postgres");
    vi.stubEnv("SUPABASE_URL", "https://auth.example.invalid");
    vi.stubEnv("SUPABASE_AUTH_KEY", "synthetic");
    vi.stubEnv("SUPABASE_ADMIN_KEY", "synthetic");
    vi.stubEnv("APP_SESSION_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    owner = new Pool({ host: socket, port, user: "apa_test", database: "postgres", max: 2 });
    await owner.query(`create database "${dbName}"`);
    admin = new Pool({ host: socket, port, user: "apa_test", database: dbName, max: 3 });
    application = new Pool({ host: socket, port, user: "apa_test", database: dbName, max: 4 });
    await admin.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end $$`);
    await admin.query("create schema auth; create table auth.users(id uuid primary key)");
    await admin.query(await readFile(new URL("../supabase/migrations/202611250001_initial.sql", import.meta.url), "utf8"));
    mocks.store = {
      transaction: async <T>(work: (tx: Queryable) => Promise<T>): Promise<T> => {
        const client = await application.connect();
        backends.add((await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid);
        try {
          await client.query("begin");
          await client.query("set local role apa_app");
          await client.query("set local lock_timeout='3s'");
          const value = await work({ query: async <R>(text: string, values: readonly unknown[] = []) => {
            const result = await client.query(text, [...values]);
            if (hold?.match && text.includes(hold.match)) {
              const current = hold;
              hold = undefined;
              current.entered();
              await current.resume;
            }
            return { rows: result.rows as R[] };
          } });
          await client.query("commit");
          return value;
        } catch (error) {
          await client.query("rollback");
          throw error;
        } finally { client.release(); }
      },
      query: async <R>(text: string, values?: readonly unknown[]) =>
        (mocks.store as Database).transaction(tx => tx.query<R>(text, values))
    } satisfies Database;
  });

  beforeEach(async () => {
    await admin.query(`truncate apa_private.movements, apa_private.app_sessions,
      apa_private.rate_limits, apa_private.profiles, apa_private.locations, auth.users cascade`);
    await admin.query("insert into auth.users(id) values ($1)", [user]);
    await admin.query(`insert into apa_private.profiles(id,username,full_name,email,role)
      values ($1,'operator.test','Synthetic Operator','operator@example.invalid','operator')`, [user]);
    await admin.query("insert into apa_private.locations(id,name,qr_token) values ($1,'Initial Location',$2)", [location, qr]);
    await admin.query(
      "insert into apa_private.locations(id,name,qr_token) values ($1,'Other Location',$2)",
      ["00000000-0000-4000-9000-000000000002", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]
    );
    mocks.signIn.mockReset().mockResolvedValue({
      userId: user, accessToken: "synthetic-access", refreshToken: "synthetic-refresh",
      expiresAt: Math.floor(Date.now() / 1000) + 3600
    });
    mocks.refresh.mockReset();
    hold = undefined;
    backends = new Set();
  });

  afterAll(async () => {
    hold = undefined;
    await application?.end();
    await admin?.end();
    if (owner) {
      await owner.query(`drop database if exists "${dbName}" with (force)`);
      await owner.end();
    }
    vi.unstubAllEnvs();
  });

  it("M02: concurrent sessions commit one movement and replay its original snapshot", async () => {
    const firstCookie = await signedIn();
    const secondCookie = await signedIn();
    const body = { qrPayload: `APA-TRANSIT:LOC:${qr}`, requestId: "11111111-1111-4111-8111-111111111111" };
    const barrier = gate("from apa_private.locations");
    const first = capture(request(body, firstCookie));
    try {
      await barrier.reached;
      const second = capture(request(body, secondCookie));
      await expectBlocked("pg_advisory_xact_lock");
      barrier.release();
      const [created, replayed] = await Promise.all([first, second]);
      expect(created.status).toBe(201);
      expect(replayed.status).toBe(200);
      const original = await created.json();
      expect(await replayed.json()).toEqual(original);
      expect(backends.size).toBeGreaterThanOrEqual(2);
      expect(await countMovements()).toBe(1);
      // The first HTTP response can be lost; retrying must still return the winner.
      const retry = await capture(request(body, firstCookie));
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(original);
      const conflict = await capture(request({
        ...body, qrPayload: "APA-TRANSIT:LOC:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      }, secondCookie));
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({ error: { code: "REQUEST_ID_CONFLICT" } });
      expect(await countMovements()).toBe(1);
    } finally { barrier.release(); }
  });

  it("M04: location deactivation waits for a capture, then rejects new captures", async () => {
    const cookie = await signedIn();
    const barrier = gate("from apa_private.locations");
    const first = capture(request({
      qrPayload: `APA-TRANSIT:LOC:${qr}`, requestId: "22222222-2222-4222-8222-222222222222"
    }, cookie));
    try {
      await barrier.reached;
      const deactivation = admin.query(
        "update apa_private.locations set name='Renamed Location',is_active=false where id=$1", [location]
      );
      await expectBlocked("update apa_private.locations");
      barrier.release();
      const response = await first;
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ locationName: "Initial Location" });
      await deactivation;
      const snapshot = await admin.query<{ location_name_snapshot: string }>(
        "select location_name_snapshot from apa_private.movements"
      );
      expect(snapshot.rows).toEqual([{ location_name_snapshot: "Initial Location" }]);
      const denied = await capture(request({
        qrPayload: `APA-TRANSIT:LOC:${qr}`, requestId: "33333333-3333-4333-8333-333333333333"
      }, cookie));
      expect(denied.status).toBe(409);
      expect(await countMovements()).toBe(1);
    } finally { barrier.release(); }
  });

  it("M04: account deactivation waits for capture and revokes future requests", async () => {
    const cookie = await signedIn();
    const barrier = gate("from apa_private.locations");
    const first = capture(request({
      qrPayload: `APA-TRANSIT:LOC:${qr}`, requestId: "44444444-4444-4444-8444-444444444444"
    }, cookie));
    try {
      await barrier.reached;
      const deactivation = admin.query("update apa_private.profiles set is_active=false where id=$1", [user]);
      await expectBlocked("update apa_private.profiles");
      barrier.release();
      expect((await first).status).toBe(201);
      await deactivation;
      const denied = await capture(request({
        qrPayload: `APA-TRANSIT:LOC:${qr}`, requestId: "55555555-5555-4555-8555-555555555555"
      }, cookie));
      expect(denied.status).toBe(401);
      expect(await countMovements()).toBe(1);
    } finally { barrier.release(); }
  });

  it("M04: a location deactivated first blocks a concurrent new capture", async () => {
    const cookie = await signedIn();
    const editor = await admin.connect();
    try {
      await editor.query("begin");
      await editor.query("update apa_private.locations set is_active=false where id=$1", [location]);
      const pending = capture(request({
        qrPayload: `APA-TRANSIT:LOC:${qr}`, requestId: "66666666-6666-4666-8666-666666666666"
      }, cookie));
      await expectBlocked("from apa_private.locations");
      await editor.query("commit");
      const denied = await pending;
      expect(denied.status).toBe(409);
      expect(await denied.json()).toMatchObject({ error: { code: "LOCATION_INACTIVE" } });
      expect(await countMovements()).toBe(0);
    } finally {
      await editor.query("rollback");
      editor.release();
    }
  });

  it("M04: a profile deactivated first blocks a concurrent capture and revokes the session", async () => {
    const cookie = await signedIn();
    const editor = await admin.connect();
    try {
      await editor.query("begin");
      await editor.query("update apa_private.profiles set is_active=false where id=$1", [user]);
      const pending = capture(request({
        qrPayload: `APA-TRANSIT:LOC:${qr}`, requestId: "77777777-7777-4777-8777-777777777777"
      }, cookie));
      await expectBlocked("from apa_private.profiles");
      await editor.query("commit");
      const denied = await pending;
      expect(denied.status).toBe(401);
      expect(await countMovements()).toBe(0);
      const revoked = await admin.query<{ revoked: boolean }>(
        "select revoked_at is not null as revoked from apa_private.app_sessions where user_id=$1", [user]
      );
      expect(revoked.rows.every(row => row.revoked)).toBe(true);
    } finally {
      await editor.query("rollback");
      editor.release();
    }
  });
});
