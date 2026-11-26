import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Queryable } from "../src/server/db";
import { POST as login } from "../src/app/api/auth/login/route";
import { GET as me } from "../src/app/api/me/route";
import { GET as listUsers } from "../src/app/api/admin/users/route";
import { PATCH as editUser } from "../src/app/api/admin/users/[id]/route";

const mocks = vi.hoisted(() => ({ store: null as unknown, signIn: vi.fn(), refresh: vi.fn(), adminUpdateUser: vi.fn(), adminCreateUser: vi.fn(), adminDeleteUser: vi.fn() }));
vi.mock("../src/server/db", () => ({ database: () => mocks.store }));
vi.mock("../src/server/auth-provider", () => ({
  authProvider: () => ({ 
    signIn: mocks.signIn, 
    refresh: mocks.refresh,
    adminUpdateUser: mocks.adminUpdateUser,
    adminCreateUser: mocks.adminCreateUser,
    adminDeleteUser: mocks.adminDeleteUser
  })
}));
const origin = "https://app.example.invalid";
const admin = "00000000-0000-4000-8000-000000000001";
const operator = "00000000-0000-4000-8000-000000000002";
const location = "00000000-0000-4000-8000-000000000003";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);");
  await db.exec(await readFile(new URL("../supabase/migrations/202611250001_initial.sql", import.meta.url), "utf8"));
  mocks.store = {
    query: <T>(text: string, values: readonly unknown[] = []) => db.query<T>(text, [...values]),
    transaction: async <T>(work: (q: Queryable) => Promise<T>) => db.transaction(async tx => {
      await tx.query("set local role apa_app");
      return work({ query: <R>(text: string, values: readonly unknown[] = []) => tx.query<R>(text, [...values]) });
    })
  } satisfies Database;
  for (const [key, value] of Object.entries({
    APP_ENV: "development", APP_ORIGIN: origin,
    DATABASE_URL: "postgresql://apa_runtime:synthetic@db.example.invalid/postgres",
    SUPABASE_URL: "https://auth.example.invalid", SUPABASE_AUTH_KEY: "synthetic",
    SUPABASE_ADMIN_KEY: "synthetic", APP_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64")
  })) vi.stubEnv(key, value);
});
afterAll(async () => { vi.unstubAllEnvs(); await db?.close(); });
beforeEach(async () => {
  await db.exec("truncate apa_private.audit_events, apa_private.movements, apa_private.app_sessions, apa_private.rate_limits, apa_private.profiles, apa_private.locations, auth.users cascade");
  for (const [id, username, role] of [[admin, "admin.test", "admin"], [operator, "operator.test", "operator"]]) {
    await db.query("insert into auth.users(id) values ($1)", [id]);
    await db.query(`insert into apa_private.profiles(id,username,full_name,email,role)
      values ($1,$2,'Synthetic Person',$3,$4)`, [id, username, `${username}@example.invalid`, role]);
  }
  await db.query("insert into apa_private.locations(id,name) values ($1,'Synthetic Location')", [location]);
  mocks.signIn.mockReset().mockImplementation(async (email: string) => ({
    userId: email.startsWith("admin") ? admin : operator,
    accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: Math.floor(Date.now() / 1000) + 3600
  }));
  mocks.refresh.mockReset();
  mocks.adminUpdateUser.mockReset().mockResolvedValue(undefined);
  mocks.adminCreateUser.mockReset().mockResolvedValue("new-auth-user-id");
  mocks.adminDeleteUser.mockReset().mockResolvedValue(undefined);
});
function req(path: string, method = "GET", cookie?: string, body?: unknown, csrf = true) {
  return new Request(`${origin}${path}`, {
    method, headers: { origin, "content-type": "application/json",
      ...(csrf ? { "x-apa-csrf": "1" } : {}), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}
async function signIn(username = "admin.test") {
  const response = await login(req("/api/auth/login", "POST", undefined, { username, password: "synthetic-password" }));
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("account administration foundation", () => {
  it("lists accounts only for an active admin without exposing internal auth fields", async () => {
    const adminCookie = await signIn();
    const operatorCookie = await signIn("operator.test");
    const response = await listUsers(req("/api/admin/users", "GET", adminCookie));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json();
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ username: "admin.test", fullName: "Synthetic Person", role: "admin", isActive: true });
    expect(JSON.stringify(result)).not.toMatch(/auth_version|auth_tokens|password|refreshToken/);
    expect((await listUsers(req("/api/admin/users", "GET", operatorCookie))).status).toBe(403);
    expect((await listUsers(req("/api/admin/users"))).status).toBe(401);
  });

  it("renames a user without revoking sessions or changing historical snapshots", async () => {
    const adminCookie = await signIn();
    const operatorCookie = await signIn("operator.test");
    await db.query(`insert into apa_private.movements(user_id,location_id,user_name_snapshot,location_name_snapshot,request_id)
      values ($1,$2,'Synthetic Person','Synthetic Location','11111111-1111-4111-8111-111111111111')`, [operator, location]);
    const result = await editUser(req(`/api/admin/users/${operator}`, "PATCH", adminCookie,
      { fullName: " Renamed Operator " }), params(operator));
    expect(result.status).toBe(200);
    expect((await result.json()).fullName).toBe("Renamed Operator");
    expect((await me(req("/api/me", "GET", operatorCookie)).then(r => r.json())).profile.fullName).toBe("Renamed Operator");
    expect(((await db.query<{ user_name_snapshot: string }>("select user_name_snapshot from apa_private.movements")).rows[0].user_name_snapshot)).toBe("Synthetic Person");
    expect((await db.query("select action from apa_private.audit_events where target_id=$1", [operator])).rows).toHaveLength(1);
  });

  it("rejects unauthorized and invalid edits without mutation", async () => {
    const adminCookie = await signIn();
    const operatorCookie = await signIn("operator.test");
    const path = `/api/admin/users/${operator}`;
    expect((await editUser(req(path, "PATCH", operatorCookie, { fullName: "Changed" }), params(operator))).status).toBe(403);
    expect((await editUser(req(path, "PATCH", adminCookie, { fullName: "Changed" }, false), params(operator))).status).toBe(403);
    // Valid email, password, role changes are now accepted (but require Auth reconciliation)
    expect((await editUser(req(path, "PATCH", adminCookie, { fullName: "" }), params(operator))).status).toBe(400);
    expect((await editUser(req("/api/admin/users/bad", "PATCH", adminCookie, { fullName: "Changed" }), params("bad"))).status).toBe(400);
    expect((await db.query<{ full_name: string }>("select full_name from apa_private.profiles where id=$1", [operator])).rows[0].full_name).toBe("Synthetic Person");
  });

  it("prevents deactivating the last active admin", async () => {
    const adminCookie = await signIn();
    expect((await editUser(req(`/api/admin/users/${admin}`, "PATCH", adminCookie, { isActive: false }), params(admin))).status).toBe(409);
    expect((await db.query<{ is_active: boolean }>("select is_active from apa_private.profiles where id=$1", [admin])).rows[0].is_active).toBe(true);
  });

  it("allows deactivating when another admin remains active", async () => {
    const secondAdmin = "00000000-0000-4000-8000-000000000004";
    await db.query("insert into auth.users(id) values ($1)", [secondAdmin]);
    await db.query(`insert into apa_private.profiles(id,username,full_name,email,role)
      values ($1,'second.admin','Second Admin','second@example.invalid','admin')`, [secondAdmin]);
    const adminCookie = await signIn();
    expect((await editUser(req(`/api/admin/users/${admin}`, "PATCH", adminCookie, { isActive: false }), params(admin))).status).toBe(200);
    expect((await db.query<{ is_active: boolean }>("select is_active from apa_private.profiles where id=$1", [admin])).rows[0].is_active).toBe(false);
  });

  it("changes email with Auth reconciliation", async () => {
    const adminCookie = await signIn();
    const newEmail = "newemail@example.invalid";
    const result = await editUser(req(`/api/admin/users/${operator}`, "PATCH", adminCookie, { email: newEmail }), params(operator));
    expect(result.status).toBe(200);
    const user = await result.json();
    expect(user.email).toBe(newEmail);
    expect(user.isBlocked).toBe(false);
    expect(mocks.adminUpdateUser).toHaveBeenCalledWith(operator, { email: newEmail });
    expect((await db.query<{ email: string }>("select email from apa_private.profiles where id=$1", [operator])).rows[0].email).toBe(newEmail);
  });

  it("changes password with Auth reconciliation and revokes sessions", async () => {
    const adminCookie = await signIn();
    const operatorCookie = await signIn("operator.test");
    const newPassword = "newpassword123";
    const result = await editUser(req(`/api/admin/users/${operator}`, "PATCH", adminCookie, { password: newPassword }), params(operator));
    expect(result.status).toBe(200);
    expect(mocks.adminUpdateUser).toHaveBeenCalledWith(operator, { password: newPassword });
    // Verify sessions were revoked
    const { rows: sessions } = await db.query("select * from apa_private.app_sessions where user_id=$1 and revoked_at is null", [operator]);
    expect(sessions.length).toBe(0);
  });

  it("changes role and revokes sessions", async () => {
    const adminCookie = await signIn();
    const result = await editUser(req(`/api/admin/users/${operator}`, "PATCH", adminCookie, { role: "admin" }), params(operator));
    expect(result.status).toBe(200);
    const user = await result.json();
    expect(user.role).toBe("admin");
    // Verify sessions were revoked
    const { rows: sessions } = await db.query("select * from apa_private.app_sessions where user_id=$1 and revoked_at is null", [operator]);
    expect(sessions.length).toBe(0);
  });

  it("reverts block if Auth email update fails", async () => {
    const adminCookie = await signIn();
    mocks.adminUpdateUser.mockRejectedValueOnce(new Error("Auth failed"));
    const result = await editUser(req(`/api/admin/users/${operator}`, "PATCH", adminCookie, { email: "new@example.invalid" }), params(operator));
    expect(result.status).toBe(503);
    // Verify user is not blocked
    const { rows } = await db.query<{ blocked_at: Date | null }>("select blocked_at from apa_private.profiles where id=$1", [operator]);
    expect(rows[0].blocked_at).toBeNull();
  });
});
