import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Queryable } from "../src/server/db";
import { POST as login } from "../src/app/api/auth/login/route";
import { GET as list, POST as create } from "../src/app/api/admin/locations/route";
import { PATCH as edit } from "../src/app/api/admin/locations/[id]/route";
import { GET as download } from "../src/app/api/admin/locations/[id]/qr/route";
import { POST as capture, GET as history } from "../src/app/api/movements/route";
import QRCode from "qrcode";

const mocks = vi.hoisted(() => ({ store: null as unknown, signIn: vi.fn(), refresh: vi.fn() }));
vi.mock("../src/server/db", () => ({ database: () => mocks.store }));
vi.mock("../src/server/auth-provider", () => ({
  authProvider: () => ({ signIn: mocks.signIn, refresh: mocks.refresh })
}));

const origin = "https://app.example.invalid";
const admin = "00000000-0000-4000-8000-000000000001";
const operator = "00000000-0000-4000-8000-000000000002";
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
    SUPABASE_URL: "https://auth.example.invalid", SUPABASE_AUTH_KEY: "synthetic-auth-key",
    SUPABASE_ADMIN_KEY: "synthetic-admin-key",
    APP_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64")
  })) vi.stubEnv(key, value);
});
afterAll(async () => { vi.unstubAllEnvs(); await db?.close(); });
beforeEach(async () => {
  await db.exec("truncate apa_private.movements, apa_private.app_sessions, apa_private.rate_limits, apa_private.profiles, apa_private.locations, auth.users cascade");
  for (const [id, username, role] of [[admin, "admin.test", "admin"], [operator, "operator.test", "operator"]]) {
    await db.query("insert into auth.users(id) values ($1)", [id]);
    await db.query("insert into apa_private.profiles(id,username,full_name,email,role) values ($1,$2,'Synthetic Person',$3,$4)",
      [id, username, `${username}@example.invalid`, role]);
  }
  mocks.signIn.mockReset().mockImplementation(async (email: string) => ({
    userId: email.startsWith("admin") ? admin : operator,
    accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: Math.floor(Date.now() / 1000) + 3600
  }));
  mocks.refresh.mockReset();
});
function req(path: string, method = "GET", cookie?: string, body?: unknown, csrf = true) {
  return new Request(`${origin}${path}`, {
    method, headers: {
      origin, ...(csrf ? { "x-apa-csrf": "1" } : {}), "content-type": "application/json",
      ...(cookie ? { cookie } : {})
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}
async function signIn(username = "admin.test") {
  const response = await login(req("/api/auth/login", "POST", undefined, { username, password: "synthetic-password" }));
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("admin location HTTP contract", () => {
  it("denies operators, absent sessions and invalid mutation origin before changing locations", async () => {
    const cookie = await signIn("operator.test");
    expect((await list(req("/api/admin/locations", "GET", cookie))).status).toBe(403);
    expect((await create(req("/api/admin/locations", "POST", cookie, { name: "Synthetic Room" }))).status).toBe(403);
    expect((await create(req("/api/admin/locations", "POST", undefined, { name: "Synthetic Room" }))).status).toBe(401);
    const adminCookie = await signIn();
    const created = await create(req("/api/admin/locations", "POST", adminCookie, { name: "Synthetic Room" }));
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect((await edit(req(`/api/admin/locations/${id}`, "PATCH", cookie, { isActive: false }), params(id))).status).toBe(403);
    expect((await download(req(`/api/admin/locations/${id}/qr`, "GET", cookie), params(id))).status).toBe(403);
    expect((await create(req("/api/admin/locations", "POST", adminCookie, { name: "Synthetic Room" }, false))).status).toBe(403);
    expect((await db.query("select id from apa_private.locations")).rows).toHaveLength(1);
  });

  it("creates a stable QR, edits its name and activation without losing history", async () => {
    const cookie = await signIn();
    const created = await create(req("/api/admin/locations", "POST", cookie, { name: " Oficina de becados " }));
    expect(created.status).toBe(201);
    const location = await created.json();
    expect(location).toMatchObject({ id: expect.any(String), name: "Oficina de becados", isActive: true });
    const token = (await db.query<{ qr_token: string }>("select qr_token from apa_private.locations where id=$1", [location.id])).rows[0].qr_token;
    const png = await download(req(`/api/admin/locations/${location.id}/qr`, "GET", cookie), params(location.id));
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toContain("image/png");
    expect(png.headers.get("cache-control")).toBe("no-store");
    const originalPng = Buffer.from(await png.arrayBuffer());
    expect(originalPng.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(originalPng.equals(await QRCode.toBuffer(`APA-TRANSIT:LOC:${token}`, {
      type: "png", errorCorrectionLevel: "M", margin: 4, width: 512
    }))).toBe(true);
    const updated = await edit(req(`/api/admin/locations/${location.id}`, "PATCH", cookie, { name: "Recepción" }), params(location.id));
    expect(updated.status).toBe(200);
    expect((await updated.json()).name).toBe("Recepción");
    expect((await list(req("/api/admin/locations", "GET", cookie)).then(r => r.json())).items).toHaveLength(1);
    const after = await download(req(`/api/admin/locations/${location.id}/qr`, "GET", cookie), params(location.id));
    expect(Buffer.from(await after.arrayBuffer()).equals(originalPng)).toBe(true);
    expect((await db.query<{ qr_token: string }>("select qr_token from apa_private.locations where id=$1", [location.id])).rows[0].qr_token).toBe(token);
    expect((await edit(req(`/api/admin/locations/${location.id}`, "PATCH", cookie, { isActive: false }), params(location.id))).status).toBe(200);
    const operatorCookie = await signIn("operator.test");
    const payload = `APA-TRANSIT:LOC:${token}`;
    const rejected = await capture(req("/api/movements", "POST", operatorCookie, {
      qrPayload: payload, requestId: "11111111-1111-4111-8111-111111111111"
    }));
    expect(rejected.status).toBe(409);
    expect((await db.query("select id from apa_private.movements")).rows).toHaveLength(0);
    expect((await edit(req(`/api/admin/locations/${location.id}`, "PATCH", cookie, { isActive: true }), params(location.id))).status).toBe(200);
    const captured = await capture(req("/api/movements", "POST", operatorCookie, {
      qrPayload: payload, requestId: "22222222-2222-4222-8222-222222222222"
    }));
    expect(captured.status).toBe(201);
    expect((await captured.json()).locationName).toBe("Recepción");
    expect((await history(req("/api/movements", "GET", operatorCookie)).then(r => r.json())).items).toHaveLength(1);
    expect((await db.query("select action from apa_private.audit_events where target_id=$1", [location.id])).rows).toHaveLength(4);
  });

  it("rejects malformed IDs and inputs without mutations", async () => {
    const cookie = await signIn();
    expect((await create(req("/api/admin/locations", "POST", cookie, { name: "" }))).status).toBe(400);
    expect((await create(req("/api/admin/locations", "POST", cookie, { name: "Room", qrToken: "injected" }))).status).toBe(400);
    expect((await edit(req("/api/admin/locations/bad", "PATCH", cookie, { name: "Changed" }), params("bad"))).status).toBe(400);
    expect((await download(req("/api/admin/locations/bad/qr", "GET", cookie), params("bad"))).status).toBe(400);
    expect((await db.query("select id from apa_private.locations")).rows).toHaveLength(0);
  });

  it("does not expose a location to a revoked admin or mutate on denied requests", async () => {
    const cookie = await signIn();
    const created = await create(req("/api/admin/locations", "POST", cookie, { name: "Synthetic Location" }));
    const { id } = await created.json();
    const before = (await db.query("select name,is_active from apa_private.locations where id=$1", [id])).rows[0];
    const wrongOrigin = new Request(`${origin}/api/admin/locations/${id}`, {
      method: "PATCH", headers: { origin: "https://other.example.invalid", "x-apa-csrf": "1",
        cookie, "content-type": "application/json" }, body: JSON.stringify({ isActive: false })
    });
    expect((await edit(wrongOrigin, params(id))).status).toBe(403);
    expect((await edit(req(`/api/admin/locations/${id}`, "PATCH", cookie, { isActive: false }, false), params(id))).status).toBe(403);
    expect((await db.query("select name,is_active from apa_private.locations where id=$1", [id])).rows[0]).toEqual(before);
    expect((await db.query("select action from apa_private.audit_events where target_id=$1", [id])).rows).toHaveLength(1);
    await db.query("update apa_private.profiles set is_active=false where id=$1", [admin]);
    expect((await list(req("/api/admin/locations", "GET", cookie))).status).toBe(401);
    expect((await download(req(`/api/admin/locations/${id}/qr`, "GET", cookie), params(id))).status).toBe(401);
  });
});
