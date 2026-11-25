import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Queryable } from "../src/server/db";
import { ApiError } from "../src/server/errors";
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as logout } from "../src/app/api/auth/logout/route";
import { GET as me } from "../src/app/api/me/route";

const mocks = vi.hoisted(() => ({
  store: null as unknown, signIn: vi.fn(), refresh: vi.fn()
}));
vi.mock("../src/server/db", () => ({ database: () => mocks.store }));
vi.mock("../src/server/auth-provider", () => ({
  authProvider: () => ({ signIn: mocks.signIn, refresh: mocks.refresh })
}));

const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const origin = "https://app.example.invalid";
let db: PGlite;
const providerSession = () => ({
  userId: user, accessToken: "synthetic-access-token", refreshToken: "synthetic-refresh-token",
  expiresAt: Math.floor(Date.now() / 1000) + 3600
});
const query: Queryable["query"] = async <T>(text: string, values: readonly unknown[] = []) =>
  db.query<T>(text, [...values]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);");
  await db.exec(await readFile(new URL("../supabase/migrations/202611250001_initial.sql", import.meta.url), "utf8"));
  mocks.store = {
    query,
    transaction: work => db.transaction(async tx => {
      await tx.exec("set local role apa_app");
      const q: Queryable = { query: async <T>(text: string, values: readonly unknown[] = []) => tx.query<T>(text, [...values]) };
      return work(q);
    })
  } satisfies Database;
  vi.stubEnv("APP_ENV", "development");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("DATABASE_URL", "postgresql://apa_runtime:synthetic@db.example.invalid/postgres");
  vi.stubEnv("SUPABASE_URL", "https://auth.example.invalid");
  vi.stubEnv("SUPABASE_AUTH_KEY", "synthetic-auth-key");
  vi.stubEnv("SUPABASE_ADMIN_KEY", "synthetic-admin-key");
  vi.stubEnv("APP_SESSION_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
});
beforeEach(async () => {
  await db.exec("truncate auth.users cascade; truncate apa_private.rate_limits;");
  await db.query("insert into auth.users values ($1),($2)", [user, other]);
  await db.query(`insert into apa_private.profiles(id,username,full_name,email,role) values
    ($1,'operator.test','Synthetic Operator','operator@example.invalid','operator'),
    ($2,'admin.test','Synthetic Administrator','admin@example.invalid','admin')`, [user, other]);
  mocks.signIn.mockReset().mockResolvedValue(providerSession());
  mocks.refresh.mockReset().mockResolvedValue({ ...providerSession(), refreshToken: "synthetic-rotated-token" });
});
afterAll(async () => { vi.unstubAllEnvs(); await db?.close(); });

function request(path: string, body?: unknown, cookie?: string) {
  return new Request(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, "x-apa-csrf": "1", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}
async function signedIn() {
  const response = await login(request("/api/auth/login", { username: "operator.test", password: "synthetic-password" }));
  expect(response.status).toBe(200);
  const header = response.headers.get("set-cookie")!;
  return { response, header, cookie: header.split(";")[0] };
}

describe("authentication through HTTP handlers", () => {
  it("issues only an opaque secure cookie and stores hashed/encrypted session material", async () => {
    const { response, header, cookie } = await signedIn();
    expect(header).toMatch(/^__Host-apa_session=[A-Za-z0-9_-]{43};/);
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age="]) expect(header).toContain(flag);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = JSON.stringify(await response.json());
    expect(payload).toContain("operator.test");
    expect(payload).not.toContain("token");
    const session = (await db.query<{ token_hash: string; auth_tokens: string }>("select * from apa_private.app_sessions")).rows[0];
    expect(session.token_hash).not.toContain(cookie.split("=")[1]);
    expect(session.auth_tokens).not.toContain("synthetic-access-token");
    expect(session.auth_tokens).not.toContain("synthetic-refresh-token");
    const result = await me(request("/api/me", undefined, cookie));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ profile: { id: user, role: "operator" }, lastMovement: null });
  });
  it("returns the same generic failure for unknown, inactive, blocked and deleted accounts", async () => {
    for (const sql of [
      "update apa_private.profiles set is_active=false where username='operator.test'",
      "update apa_private.profiles set is_active=true,blocked_at=clock_timestamp() where username='operator.test'",
      "update apa_private.profiles set is_active=false,blocked_at=null,deleted_at=clock_timestamp() where username='operator.test'"
    ]) {
      await db.exec(sql);
      const response = await login(request("/api/auth/login", { username: "operator.test", password: "synthetic-password" }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password." } });
    }
    expect((await login(request("/api/auth/login", { username: "missing.test", password: "synthetic-password" }))).status).toBe(401);
    expect((await db.query("select * from apa_private.app_sessions")).rows).toHaveLength(0);
  });
  it("rejects an upstream identity that does not match the resolved account", async () => {
    mocks.signIn.mockResolvedValue({ ...providerSession(), userId: other });
    const response = await login(request("/api/auth/login", { username: "operator.test", password: "synthetic-password" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect((await db.query("select * from apa_private.app_sessions")).rows).toHaveLength(0);
  });
  it("does not leak upstream credential failures or accept client-supplied identity", async () => {
    mocks.signIn.mockRejectedValueOnce(new ApiError(401, "AUTH_REJECTED", "Synthetic upstream detail"));
    const denied = await login(request("/api/auth/login", { username: "operator.test", password: "wrong-synthetic-password" }));
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({ error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password." } });
    const invalid = await login(request("/api/auth/login", { username: "operator.test", password: "synthetic-password", userId: other }));
    expect(invalid.status).toBe(400);
    expect((await db.query("select * from apa_private.app_sessions")).rows).toHaveLength(0);
  });
  it("does not publish a login after a credential-affecting profile change during upstream authentication", async () => {
    mocks.signIn.mockImplementation(async () => {
      await db.query("update apa_private.profiles set role='admin' where id=$1", [user]);
      return providerSession();
    });
    expect((await login(request("/api/auth/login", { username: "operator.test", password: "synthetic-password" }))).status).toBe(401);
    expect((await db.query("select * from apa_private.app_sessions")).rows).toHaveLength(0);
  });
  it("rejects cross-origin login and logout without mutating stored sessions", async () => {
    const { cookie } = await signedIn();
    const before = await db.query("select * from apa_private.app_sessions");
    for (const handler of [login, logout]) {
      const response = await handler(new Request(`${origin}/api/auth/login`, {
        method: "POST", headers: { origin: "https://evil.example.invalid", cookie, "content-type": "application/json" },
        body: JSON.stringify({ username: "operator.test", password: "synthetic-password" })
      }));
      expect(response.status).toBe(403);
    }
    expect((await db.query("select * from apa_private.app_sessions")).rows).toEqual(before.rows);
  });
  it("revokes access on account deactivation and never revives old sessions after reactivation", async () => {
    const { cookie } = await signedIn();
    await db.query("update apa_private.profiles set is_active=false where id=$1", [user]);
    expect((await me(request("/api/me", undefined, cookie))).status).toBe(401);
    await db.query("update apa_private.profiles set is_active=true where id=$1", [user]);
    expect((await me(request("/api/me", undefined, cookie))).status).toBe(401);
    expect((await db.query("select revoked_at from apa_private.app_sessions")).rows[0]).not.toEqual({ revoked_at: null });
  });
  it("refreshes the server-side token pair once for concurrent requests and reveals neither token", async () => {
    const { cookie } = await signedIn();
    await db.exec("update apa_private.app_sessions set auth_expires_at=clock_timestamp()-interval '1 second'");
    const responses = await Promise.all([me(request("/api/me", undefined, cookie)), me(request("/api/me", undefined, cookie))]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    for (const response of responses) expect(JSON.stringify(await response.json())).not.toContain("token");
  });
  it("logs out idempotently, expires the cookie and denies reuse", async () => {
    const { cookie } = await signedIn();
    for (let i = 0; i < 2; i++) {
      const response = await logout(request("/api/auth/logout", {}, cookie));
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    }
    expect((await me(request("/api/me", undefined, cookie))).status).toBe(401);
  });
  it("denies absent, malformed and expired sessions without refreshing them", async () => {
    expect((await me(request("/api/me"))).status).toBe(401);
    expect((await me(request("/api/me", undefined, "__Host-apa_session=invalid"))).status).toBe(401);
    const { cookie } = await signedIn();
    await db.exec("update apa_private.app_sessions set expires_at=clock_timestamp()-interval '1 second'");
    expect((await me(request("/api/me", undefined, cookie))).status).toBe(401);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("preserves a session on transient refresh failure but revokes on definitive rejection", async () => {
    const { cookie } = await signedIn();
    await db.exec("update apa_private.app_sessions set auth_expires_at=clock_timestamp()-interval '1 second'");
    mocks.refresh.mockRejectedValueOnce(new Error("synthetic provider outage"));
    expect((await me(request("/api/me", undefined, cookie))).status).toBe(503);
    expect((await db.query("select revoked_at from apa_private.app_sessions")).rows[0]).toEqual({ revoked_at: null });
    mocks.refresh.mockRejectedValueOnce(new ApiError(401, "AUTH_REJECTED", "Authentication failed."));
    expect((await me(request("/api/me", undefined, cookie))).status).toBe(401);
    expect((await db.query("select revoked_at from apa_private.app_sessions")).rows[0]).not.toEqual({ revoked_at: null });
  });
  it("returns only the current user's last movement, even if another user's is newer", async () => {
    const { cookie } = await signedIn();
    const location = (await db.query<{ id: string }>("insert into apa_private.locations(name) values ('Synthetic location') returning id")).rows[0].id;
    for (const id of [user, other]) await db.query(`insert into apa_private.movements(user_id,location_id,user_name_snapshot,location_name_snapshot,request_id)
      values ($1,$2,$3,'Synthetic location',gen_random_uuid())`, [id, location, id === user ? "Synthetic Operator" : "Synthetic Administrator"]);
    expect(await (await me(request("/api/me", undefined, cookie))).json()).toMatchObject({ lastMovement: { userName: "Synthetic Operator" } });
  });
  it("rate limits repeated attempts across handler invocations", async () => {
    for (let i = 0; i < 5; i++) expect((await login(request("/api/auth/login", { username: "missing.test", password: "synthetic-password" }))).status).toBe(401);
    expect((await login(request("/api/auth/login", { username: "missing.test", password: "synthetic-password" }))).status).toBe(429);
  });
});
