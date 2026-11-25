import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Queryable } from "../src/server/db";
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as capture } from "../src/app/api/movements/route";
import { GET as history } from "../src/app/api/movements/route";

const mocks = vi.hoisted(() => ({
  store: null as unknown, signIn: vi.fn(), refresh: vi.fn()
}));
vi.mock("../src/server/db", () => ({ database: () => mocks.store }));
vi.mock("../src/server/auth-provider", () => ({
  authProvider: () => ({ signIn: mocks.signIn, refresh: mocks.refresh })
}));

const user = "00000000-0000-4000-8000-000000000001";
const otherUser = "00000000-0000-4000-8000-000000000002";
const locationId = "00000000-0000-4000-9000-000000000001";
const qrToken = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
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
    transaction: async work => {
      return db.transaction(async tx => {
        await tx.query("set local role apa_app");
        const q: Queryable = {
          query: async <T>(text: string, values: readonly unknown[] = []) => {
            return tx.query<T>(text, [...values]);
          }
        };
        return work(q);
      });
    }
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
  await db.exec("truncate apa_private.movements, apa_private.app_sessions cascade; truncate apa_private.rate_limits cascade; truncate apa_private.profiles cascade; truncate apa_private.locations cascade; truncate auth.users cascade;");
  await db.query("insert into auth.users values ($1)", [user]);
  await db.query(`insert into apa_private.profiles(id,username,full_name,email,role) values
    ($1,'operator.test','Synthetic Operator','operator@example.invalid','operator')`, [user]);
  await db.query(`insert into apa_private.locations(id,name,qr_token) values
    ($1,'Recepción Principal',$2)`, [locationId, qrToken]);
  mocks.signIn.mockReset().mockResolvedValue(providerSession());
  mocks.refresh.mockReset().mockResolvedValue({ ...providerSession(), refreshToken: "synthetic-rotated-token" });
});
afterAll(async () => { vi.unstubAllEnvs(); await db?.close(); });

function request(path: string, body?: unknown, cookie?: string, method: "GET" | "POST" = "POST") {
  return new Request(`${origin}${path}`, {
    method,
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

describe("movement capture", () => {
  it("creates a movement with server-derived identity, location and time", async () => {
    const { cookie } = await signedIn();
    const requestId = "11111111-1111-4111-8111-111111111111";
    const qrPayload = `APA-TRANSIT:LOC:${qrToken}`;

    const response = await capture(request("/api/movements", { qrPayload, requestId }, cookie));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      id: expect.any(String),
      locationId,
      locationName: "Recepción Principal",
      userName: "Synthetic Operator",
      recordedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    });
    expect(body.requestId).toBe(requestId);

    const stored = (await db.query<{ request_id: string; user_id: string; location_id: string }>(
      "select request_id, user_id, location_id from apa_private.movements"
    )).rows[0];
    expect(stored.request_id).toBe(requestId);
    expect(stored.user_id).toBe(user);
    expect(stored.location_id).toBe(locationId);
  });

  it("returns the original movement on duplicate request_id (idempotency)", async () => {
    const { cookie } = await signedIn();
    const requestId = "22222222-2222-4222-8222-222222222222";
    const qrPayload = `APA-TRANSIT:LOC:${qrToken}`;

    const first = await capture(request("/api/movements", { qrPayload, requestId }, cookie));
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const second = await capture(request("/api/movements", { qrPayload, requestId }, cookie));
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    expect(firstBody.id).toBe(secondBody.id);
    expect(firstBody.recordedAt).toBe(secondBody.recordedAt);

    const count = (await db.query<{ count: number }>("select count(*) from apa_private.movements")).rows[0];
    expect(count.count).toBe(1);
  });

  it("returns the original snapshot after a location is deactivated", async () => {
    const { cookie } = await signedIn();
    const body = { qrPayload: `APA-TRANSIT:LOC:${qrToken}`, requestId: "22222222-2222-4222-8222-222222222223" };
    const first = await capture(request("/api/movements", body, cookie));
    expect(first.status).toBe(201);
    await db.exec("update apa_private.locations set name='Renamed', is_active=false");
    const again = await capture(request("/api/movements", body, cookie));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(await first.json());
    expect((await db.query<{ count: number }>("select count(*) from apa_private.movements")).rows[0].count).toBe(1);
  });

  it("serializes the idempotency key before reading or inserting the movement", async () => {
    const { cookie } = await signedIn();
    const queries: string[] = [];
    const store = mocks.store as Database;
    const original = store.transaction;
    store.transaction = async work => original(async tx => work({
      query: async <T>(text: string, values: readonly unknown[] = []) => {
        queries.push(text);
        return tx.query<T>(text, values);
      }
    }));
    try {
      const response = await capture(request("/api/movements", {
        qrPayload: `APA-TRANSIT:LOC:${qrToken}`,
        requestId: "22222222-2222-4222-8222-222222222224"
      }, cookie));
      expect(response.status).toBe(201);
      const lock = queries.findIndex(sql => sql.includes("pg_advisory_xact_lock"));
      const firstMovementRead = queries.findIndex(sql => sql.includes("from apa_private.movements"));
      expect(lock).toBeGreaterThan(-1);
      expect(firstMovementRead).toBeGreaterThan(lock);
      expect(queries.some(sql => sql.includes("from apa_private.locations") && sql.includes("for share"))).toBe(true);
    } finally { store.transaction = original; }
  });

  it("rejects duplicate request_id with different location (conflict)", async () => {
    const { cookie } = await signedIn();
    const requestId = "33333333-3333-4333-8333-333333333333";
    const otherLocationId = "00000000-0000-4000-9000-000000000002";
    const otherQrToken = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    await db.query(`insert into apa_private.locations(id,name,qr_token) values
      ($1,'Otra Ubicación',$2)`, [otherLocationId, otherQrToken]);

    const first = await capture(request("/api/movements", {
      qrPayload: `APA-TRANSIT:LOC:${qrToken}`, requestId
    }, cookie));
    expect(first.status).toBe(201);

    const second = await capture(request("/api/movements", {
      qrPayload: `APA-TRANSIT:LOC:${otherQrToken}`, requestId
    }, cookie));
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      error: { code: "REQUEST_ID_CONFLICT" }
    });
  });

  it("rejects inactive location", async () => {
    const { cookie } = await signedIn();
    const requestId = "44444444-4444-4444-8444-444444444444";
    await db.exec("update apa_private.locations set is_active=false");

    const response = await capture(request("/api/movements", {
      qrPayload: `APA-TRANSIT:LOC:${qrToken}`, requestId
    }, cookie));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "LOCATION_INACTIVE" }
    });
  });

  it("rejects malformed QR payload", async () => {
    const { cookie } = await signedIn();
    const requestId = "55555555-5555-4555-8555-555555555555";

    const response = await capture(request("/api/movements", {
      qrPayload: "INVALID-QR", requestId
    }, cookie));

    expect(response.status).toBe(400);
  });

  it("rejects unknown QR tokens without creating a movement", async () => {
    const { cookie } = await signedIn();
    const response = await capture(request("/api/movements", {
      qrPayload: "APA-TRANSIT:LOC:cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      requestId: "55555555-5555-4555-8555-555555555556"
    }, cookie));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "LOCATION_NOT_FOUND" } });
    expect((await db.query<{ count: number }>("select count(*) from apa_private.movements")).rows[0].count).toBe(0);
  });

  it("rejects a cross-origin capture without changing data", async () => {
    const { cookie } = await signedIn();
    const attempted = request("/api/movements", {
      qrPayload: `APA-TRANSIT:LOC:${qrToken}`,
      requestId: "55555555-5555-4555-8555-555555555557"
    }, cookie);
    attempted.headers.set("origin", "https://untrusted.example.invalid");
    const response = await capture(attempted);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "ORIGIN_DENIED" } });
    expect((await db.query<{ count: number }>("select count(*) from apa_private.movements")).rows[0].count).toBe(0);
  });

  it("limits new captures per session without writing the rejected movement", async () => {
    const { cookie } = await signedIn();
    for (let i = 0; i < 120; i++) {
      const response = await capture(request("/api/movements", {
        qrPayload: `APA-TRANSIT:LOC:${qrToken}`, requestId: crypto.randomUUID()
      }, cookie));
      expect(response.status).toBe(201);
    }
    const before = (await db.query<{ count: number }>("select count(*) from apa_private.movements")).rows[0].count;
    const rejected = await capture(request("/api/movements", {
      qrPayload: `APA-TRANSIT:LOC:${qrToken}`, requestId: crypto.randomUUID()
    }, cookie));
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect((await db.query<{ count: number }>("select count(*) from apa_private.movements")).rows[0].count).toBe(before);
  });

  it("counts rejected scans against the per-session limit without persisting movements", async () => {
    const { cookie } = await signedIn();
    const unknown = "APA-TRANSIT:LOC:cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    for (let i = 0; i < 120; i++) {
      const response = await capture(request("/api/movements", {
        qrPayload: i % 2 ? unknown : "INVALID-QR", requestId: crypto.randomUUID()
      }, cookie));
      expect(response.status).toBe(i % 2 ? 404 : 400);
    }
    const rejected = await capture(request("/api/movements", {
      qrPayload: unknown, requestId: crypto.randomUUID()
    }, cookie));
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect((await db.query<{ count: number }>("select count(*) from apa_private.movements")).rows[0].count).toBe(0);
    const secondSession = await signedIn();
    const allowed = await capture(request("/api/movements", {
      qrPayload: `APA-TRANSIT:LOC:${qrToken}`, requestId: crypto.randomUUID()
    }, secondSession.cookie));
    expect(allowed.status).toBe(201);
    expect((await db.query<{ count: number }>("select count(*) from apa_private.movements")).rows[0].count).toBe(1);
  });

  it("requires authentication", async () => {
    const requestId = "66666666-6666-4666-8666-666666666666";

    const response = await capture(request("/api/movements", {
      qrPayload: `APA-TRANSIT:LOC:${qrToken}`, requestId
    }));

    expect(response.status).toBe(401);
  });
});

describe("movement history", () => {
  it("shows another active user's movements with their original snapshots", async () => {
    const { cookie } = await signedIn();
    await db.query("insert into auth.users values ($1)", [otherUser]);
    await db.query(`insert into apa_private.profiles(id,username,full_name,email,role)
      values ($1,'other.test','Other Operator','other@example.invalid','operator')`, [otherUser]);
    await db.query(`insert into apa_private.movements(user_id,location_id,user_name_snapshot,location_name_snapshot,request_id)
      values ($1,$2,'Other Operator','Recepción Principal',$3)`, [
      otherUser, locationId, "77777777-7777-4777-8777-777777777777"
    ]);
    const response = await history(request("/api/movements", undefined, cookie, "GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [{ userName: "Other Operator", locationName: "Recepción Principal" }], nextCursor: null
    });
  });

  it("paginates ties on recorded_at without skipping or repeating rows", async () => {
    const { cookie } = await signedIn();
    const timestamp = "2026-11-25T12:00:00Z";
    for (let index = 1; index <= 52; index++) {
      const suffix = index.toString(16).padStart(12, "0");
      await db.query(`insert into apa_private.movements(id,user_id,location_id,user_name_snapshot,location_name_snapshot,request_id,recorded_at)
        values ($1,$2,$3,'Synthetic Operator','Recepción Principal',$4,$5)`, [
        `99999999-9999-4999-8999-${suffix}`, user, locationId,
        `88888888-8888-4888-8888-${suffix}`, timestamp
      ]);
    }
    const first = await history(request("/api/movements", undefined, cookie, "GET"));
    expect(first.status).toBe(200);
    const page1 = await first.json();
    expect(page1.items).toHaveLength(50);
    expect(page1.nextCursor).toEqual(expect.any(String));
    const second = await history(request(`/api/movements?cursor=${page1.nextCursor}`, undefined, cookie, "GET"));
    expect(second.status).toBe(200);
    const page2 = await second.json();
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((item: { id: string }) => item.id)).size).toBe(52);
  });

  it("rejects malformed cursors as client input instead of a server outage", async () => {
    const { cookie } = await signedIn();
    const response = await history(request("/api/movements?cursor=!!!", undefined, cookie, "GET"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
  });

  it("returns movements in descending order by recorded_at and id", async () => {
    const { cookie } = await signedIn();

    await capture(request("/api/movements", {
      qrPayload: `APA-TRANSIT:LOC:${qrToken}`,
      requestId: "11111111-1111-4111-8111-111111111111"
    }, cookie));

    await new Promise(resolve => setTimeout(resolve, 10));

    await capture(request("/api/movements", {
      qrPayload: `APA-TRANSIT:LOC:${qrToken}`,
      requestId: "22222222-2222-4222-8222-222222222222"
    }, cookie));

    const response = await history(request("/api/movements", undefined, cookie, "GET"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].requestId).toBe("22222222-2222-4222-8222-222222222222");
    expect(body.items[1].requestId).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.nextCursor).toBeNull();
  });

  it("returns empty array when no movements exist", async () => {
    const { cookie } = await signedIn();

    const response = await history(request("/api/movements", undefined, cookie, "GET"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("requires authentication", async () => {
    const response = await history(request("/api/movements", undefined, undefined, "GET"));
    expect(response.status).toBe(401);
  });
});
