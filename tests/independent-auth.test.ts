import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import type { Database, Queryable } from "../src/server/db";
import { ApiError } from "../src/server/errors";
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as logout } from "../src/app/api/auth/logout/route";
import { GET as me } from "../src/app/api/me/route";
import { withSession } from "../src/server/sessions";
import { decryptTokens } from "../src/server/session-crypto";
import { readServerConfig } from "../src/server/config";

const mock = vi.hoisted(() => ({
  store: null as unknown, signIn: vi.fn(), refresh: vi.fn(),
  poolOptions: null as any, commands: [] as string[], clientQuery: vi.fn()
}));
vi.mock("../src/server/db", () => ({ database: () => mock.store }));
vi.mock("../src/server/auth-provider", () => ({
  authProvider: () => ({ signIn: mock.signIn, refresh: mock.refresh })
}));
vi.mock("pg", () => ({
  Pool: class {
    constructor(options: unknown) { mock.poolOptions = options; }
    async connect() {
      return { query: mock.clientQuery, release: () => mock.commands.push("release") };
    }
  }
}));

const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const origin = "https://app.example.invalid";
const key = Buffer.alloc(32, 19);
const provider = () => ({
  userId: a, accessToken: "private-access", refreshToken: "private-refresh",
  expiresAt: Math.floor(Date.now() / 1000) + 3600
});
let db: PGlite;
let store: Database;
const statements: string[] = [];
const query: Queryable["query"] = async <T>(text: string, values: readonly unknown[] = []) => {
  return db.query<T>(text, [...values]);
};
function req(path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
  return new Request(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, "x-apa-csrf": "1", "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}
async function signIn() {
  const response = await login(req("/api/auth/login", { username: "probe.user", password: "synthetic-password" }));
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}
const rows = async () => (await db.query<any>("select * from apa_private.app_sessions order by token_hash")).rows;
const snapshot = async () => JSON.stringify(await rows());

beforeAll(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); }));
  for (const [name, value] of Object.entries({
    APP_ENV: "development", APP_ORIGIN: origin,
    DATABASE_URL: "postgresql://apa_runtime:synthetic@db.example.invalid/postgres",
    SUPABASE_URL: "https://auth.example.invalid", SUPABASE_AUTH_KEY: "synthetic",
    SUPABASE_ADMIN_KEY: "synthetic-admin", APP_SESSION_ENCRYPTION_KEY: key.toString("base64"),
    SESSION_DAYS: "7", VERCEL_ENV: "development", VERCEL: "0", RF007_VERIFIED: "false"
  })) vi.stubEnv(name, value);
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key)");
  await db.exec(readFileSync(new URL("../supabase/migrations/202611250001_initial.sql", import.meta.url), "utf8"));
  store = {
    query: (text, values) => store.transaction(tx => tx.query(text, values)),
    transaction: work => db.transaction(async tx => {
      await tx.exec("set local role apa_app");
      return work({ query: async <T>(text: string, values: readonly unknown[] = []) => {
        statements.push(text);
        return tx.query<T>(text, [...values]);
      } });
    })
  };
});
beforeEach(async () => {
  await db.exec("truncate auth.users cascade; truncate apa_private.rate_limits");
  await db.query("insert into auth.users values ($1),($2)", [a, b]);
  await db.query(`insert into apa_private.profiles(id,username,full_name,email,role) values
    ($1,'probe.user','Synthetic A','a@example.invalid','operator'),
    ($2,'probe.admin','Synthetic B','b@example.invalid','admin')`, [a, b]);
  mock.store = store;
  mock.signIn.mockReset().mockResolvedValue(provider());
  mock.refresh.mockReset().mockResolvedValue({ ...provider(), accessToken: "rotated-access", refreshToken: "rotated-refresh" });
  statements.length = 0;
});
afterAll(async () => { await db.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("S2: every credential-affecting field revokes both devices and prevents revival", async () => {
  const changes = [
    "username='probe.renamed'", "email='renamed@example.invalid'", "role='admin'",
    "is_active=false", "blocked_at=clock_timestamp()", "is_active=false,deleted_at=clock_timestamp()"
  ];
  for (const change of changes) {
    await db.query(`update apa_private.profiles set username='probe.user',email='a@example.invalid',
      role='operator',is_active=true,blocked_at=null,deleted_at=null where id=$1`, [a]);
    await db.exec("truncate apa_private.rate_limits");
    const cookies = [await signIn(), await signIn()];
    const oldVersion = (await db.query<any>("select auth_version from apa_private.profiles where id=$1", [a])).rows[0].auth_version;
    await db.query(`update apa_private.profiles set ${change} where id=$1`, [a]);
    const version = (await db.query<any>("select auth_version from apa_private.profiles where id=$1", [a])).rows[0].auth_version;
    expect(Number(version)).toBe(Number(oldVersion) + 1);
    for (const cookie of cookies) expect((await me(req("/api/me", undefined, cookie))).status).toBe(401);
    expect((await rows()).every(r => r.revoked_at !== null)).toBe(true);
  }
});

it("S2: cosmetic edit preserves sessions, identity and encrypted storage", async () => {
  const cookie = await signIn();
  const before = await snapshot();
  await db.query("update apa_private.profiles set full_name='Synthetic Renamed' where id=$1", [a]);
  expect(await snapshot()).toBe(before);
  const response = await me(req("/api/me", undefined, cookie));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ profile: { id: a, fullName: "Synthetic Renamed", role: "operator" } });
  const [session] = await rows();
  expect(session.token_hash).toBe(createHash("sha256").update(cookie.split("=")[1]).digest("hex"));
  expect(decryptTokens(session.auth_tokens, key)).toEqual({ accessToken: "private-access", refreshToken: "private-refresh" });
});

it("S2: version changes during upstream login never publish stale cookies", async () => {
  mock.signIn.mockImplementation(async () => {
    await db.query("update apa_private.profiles set email='changed@example.invalid' where id=$1", [a]);
    return provider();
  });
  const response = await login(req("/api/auth/login", { username: "probe.user", password: "synthetic-password" }));
  expect(response.status).toBe(401);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await rows()).toEqual([]);
});

it("S2: denial paths preserve persisted sessions and reject ambiguous cookies", async () => {
  const cookie = await signIn();
  const before = await snapshot();
  for (const value of ["", cookie + "; " + cookie, cookie + "x", "__Host-apa_session=%00"]) {
    expect((await me(req("/api/me", undefined, value))).status).toBe(401);
    expect(await snapshot()).toBe(before);
  }
  const deniedHeaders: Record<string, string>[] = [
    { origin: "null" }, { origin: "https://evil.example.invalid" },
    { "x-apa-csrf": "" }, { "sec-fetch-site": "cross-site" }
  ];
  for (const headers of deniedHeaders) {
    expect((await logout(req("/api/auth/logout", {}, cookie, headers))).status).toBe(403);
    expect(await snapshot()).toBe(before);
  }
  expect(mock.refresh).not.toHaveBeenCalled();
});

it("S2: strict credentials and 8KiB streamed-body limit precede authentication", async () => {
  for (const body of [
    { username: "probe.user", password: "x", role: "admin" },
    { username: "probe.user", password: "" }, { username: "probe.user", password: 1 }, [],
    { username: "probe.user", password: "x".repeat(1025) }
  ]) {
    expect((await login(req("/api/auth/login", body))).status).toBe(400);
  }
  const response = await login(new Request(origin + "/api/auth/login", {
    method: "POST", headers: { origin, "x-apa-csrf": "1", "content-type": "application/json" },
    body: " ".repeat(8193)
  }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: { code: "INVALID_INPUT", message: "Request is too large." } });
  expect(mock.signIn).not.toHaveBeenCalled();
  expect(await rows()).toEqual([]);
});

it("S2: refresh locks profile before session and commits permanent revocation before 401", async () => {
  const cookie = await signIn();
  await db.exec("update apa_private.app_sessions set auth_expires_at=clock_timestamp()-interval '1 second'");
  statements.length = 0;
  mock.refresh.mockRejectedValueOnce(new ApiError(401, "AUTH_REJECTED", "private-provider-detail"));
  const response = await me(req("/api/me", undefined, cookie));
  expect(response.status).toBe(401);
  expect(await response.text()).not.toContain("private-provider-detail");
  expect((await rows())[0].revoked_at).not.toBeNull();
  const locks = statements.filter(x => /for share|for update/.test(x));
  expect(locks).toHaveLength(2);
  expect(locks[0]).toContain("profiles");
  expect(locks[1]).toContain("app_sessions");
  expect((await me(req("/api/me", undefined, cookie))).status).toBe(401);
  expect(mock.refresh).toHaveBeenCalledTimes(1);
});

it("S2: transient refresh is retryable without changing persisted session bytes", async () => {
  const cookie = await signIn();
  await db.exec("update apa_private.app_sessions set auth_expires_at=clock_timestamp()-interval '1 second'");
  const before = await snapshot();
  mock.refresh.mockRejectedValueOnce(new ApiError(503, "AUTH_UNAVAILABLE", "private-outage"));
  const unavailable = await me(req("/api/me", undefined, cookie));
  expect(unavailable.status).toBe(503);
  expect(await snapshot()).toBe(before);
  expect((await me(req("/api/me", undefined, cookie))).status).toBe(200);
  expect(decryptTokens((await rows())[0].auth_tokens, key).refreshToken).toBe("rotated-refresh");
});

it("S2: invalid refreshed identity revokes rather than persisting foreign tokens", async () => {
  const cookie = await signIn();
  await db.exec("update apa_private.app_sessions set auth_expires_at=clock_timestamp()-interval '1 second'");
  mock.refresh.mockResolvedValueOnce({ ...provider(), userId: b });
  expect((await me(req("/api/me", undefined, cookie))).status).toBe(401);
  const [session] = await rows();
  expect(session.revoked_at).not.toBeNull();
  expect(decryptTokens(session.auth_tokens, key).accessToken).toBe("private-access");
});

it("S2: an expired application session never reaches refresh", async () => {
  const cookie = await signIn();
  await db.exec("update apa_private.app_sessions set expires_at=clock_timestamp()-interval '1 second',auth_expires_at=clock_timestamp()-interval '1 second'");
  const before = await snapshot();
  expect((await me(req("/api/me", undefined, cookie))).status).toBe(401);
  expect(await snapshot()).toBe(before);
  expect(mock.refresh).not.toHaveBeenCalled();
});

it("S2: corrupted Auth envelopes commit revocation without provider call", async () => {
  const cookie = await signIn();
  await db.exec("update apa_private.app_sessions set auth_tokens='v1.corrupt',auth_expires_at=clock_timestamp()-interval '1 second'");
  expect((await me(req("/api/me", undefined, cookie))).status).toBe(401);
  expect((await rows())[0].revoked_at).not.toBeNull();
  expect(mock.refresh).not.toHaveBeenCalled();
});

it("S2: operator admin guard refuses work with no persisted mutation", async () => {
  const cookie = await signIn();
  const before = await snapshot();
  const work = vi.fn();
  await expect(withSession(req("/api/admin/users", undefined, cookie), work, true)).rejects.toMatchObject({ status: 403 });
  expect(work).not.toHaveBeenCalled();
  expect(await snapshot()).toBe(before);
});

it("S2: own last movement excludes a newer shared movement", async () => {
  const cookie = await signIn();
  const location = (await db.query<any>("insert into apa_private.locations(name) values ('Synthetic Place') returning id")).rows[0].id;
  for (const [id, when] of [[a, "2026-01-01"], [b, "2026-02-01"]]) {
    await db.query(`insert into apa_private.movements(user_id,location_id,user_name_snapshot,location_name_snapshot,request_id,recorded_at)
      values ($1,$2,$3,'Synthetic Place',gen_random_uuid(),$4)`, [id, location, id === a ? "A snapshot" : "B snapshot", when]);
  }
  expect(await (await me(req("/api/me?userId=" + b, undefined, cookie))).json()).toMatchObject({
    profile: { id: a }, lastMovement: { userName: "A snapshot", recordedAt: "2026-01-01T00:00:00.000000Z" }
  });
});

it("S2: logout refuses false success on failed database revocation", async () => {
  const cookie = await signIn();
  const before = await snapshot();
  mock.store = { ...store, query: async () => { throw new Error("private-db-secret"); } };
  const response = await logout(req("/api/auth/logout", {}, cookie));
  expect(response.status).toBe(503);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.text()).not.toContain("private-db-secret");
  expect(await snapshot()).toBe(before);
  mock.store = store;
  expect((await logout(req("/api/auth/logout", {}, cookie))).status).toBe(204);
  expect((await me(req("/api/me", undefined, cookie))).status).toBe(401);
});

it("S2: runtime role cannot mutate history; triggers are invokers", async () => {
  const functions = (await db.query<any>("select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='apa_private'")).rows;
  expect(functions).toHaveLength(3);
  expect(functions.every(x => !x.prosecdef)).toBe(true);
  await store.transaction(async tx => {
    expect((await tx.query<any>("select current_user as role")).rows[0].role).toBe("apa_app");
  });
  for (const operation of ["update apa_private.movements set user_name_snapshot='bad'", "delete from apa_private.movements"]) {
    await expect(store.query(operation)).rejects.toThrow(/permission denied/);
  }
});

it("S1/S2: production remains blocked without external RF007 acceptance", () => {
  expect(() => readServerConfig({ ...process.env, APP_ENV: "production", RF007_VERIFIED: "false" })).toThrow("Production security verification is pending.");
});

it("S1/S2: actual adapter strips URI TLS overrides and sets transaction-local role", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://apa_runtime:synthetic@db.example.invalid/postgres?sslmode=verify-full&ssl=false&sslrootcert=ignored&sslcert=ignored&sslkey=ignored");
  const actual = await vi.importActual<typeof import("../src/server/db")>("../src/server/db");
  mock.clientQuery.mockImplementation(async (text: string) => {
    mock.commands.push(text);
    return { rows: [{ synthetic: true }] };
  });
  await actual.database().query("select 1");
  expect(mock.poolOptions.ssl.rejectUnauthorized).toBe(true);
  expect(new URL(mock.poolOptions.connectionString).search).toBe("");
  expect(mock.commands[0]).toBe("begin");
  expect(mock.commands[1]).toContain("set local role apa_app");
  expect(mock.commands.slice(-2)).toEqual(["commit", "release"]);
  mock.commands.length = 0;
  await expect(actual.database().transaction(async () => { throw new Error("synthetic"); })).rejects.toThrow("synthetic");
  expect(mock.commands.slice(-2)).toEqual(["rollback", "release"]);
});
