import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const location = "00000000-0000-4000-8000-000000000002";
const request = "00000000-0000-4000-8000-000000000003";
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);");
  await db.exec(await readFile(new URL("../supabase/migrations/202611250001_initial.sql", import.meta.url), "utf8"));
  await db.query("insert into auth.users values ($1)", [user]);
  await db.query("insert into apa_private.profiles(id,username,full_name,email,role) values ($1,'operator.test','Synthetic Operator','operator@example.invalid','operator')", [user]);
  await db.query("insert into apa_private.locations(id,name) values ($1,'Synthetic Location')", [location]);
});
afterAll(async () => { await db?.close(); });
describe("private database permissions", () => {
  it("denies browser roles access to application data", async () => {
    await db.exec("set role authenticated");
    await expect(db.query("select * from apa_private.profiles")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
  it("allows application append/read but never editing or deleting historical movements", async () => {
    await db.exec("set role apa_app");
    await db.query(`insert into apa_private.movements(user_id,location_id,user_name_snapshot,location_name_snapshot,request_id)
      values ($1,$2,'Snapshot Operator','Snapshot Location',$3)`, [user, location, request]);
    expect((await db.query("select * from apa_private.movements")).rows).toHaveLength(1);
    await expect(db.query("update apa_private.movements set user_name_snapshot='Changed'")).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from apa_private.movements")).rejects.toThrow(/permission denied/);
    await expect(db.query(`insert into apa_private.movements(user_id,location_id,user_name_snapshot,location_name_snapshot,request_id)
      values ($1,$2,'Snapshot Operator','Snapshot Location',$3)`, [user, location, request])).rejects.toThrow(/duplicate key/);
    await db.exec("reset role");
  });
  it("preserves snapshots on profile/location edits and prevents changing QR tokens", async () => {
    await db.exec("set role apa_app");
    await db.query("update apa_private.profiles set full_name='Renamed',is_active=false,deleted_at=clock_timestamp() where id=$1", [user]);
    await db.query("update apa_private.locations set name='Renamed',is_active=false where id=$1", [location]);
    const row = (await db.query<{ user_name_snapshot: string; location_name_snapshot: string }>("select * from apa_private.movements")).rows[0];
    expect(row.user_name_snapshot).toBe("Snapshot Operator");
    expect(row.location_name_snapshot).toBe("Snapshot Location");
    await expect(db.query("update apa_private.locations set qr_token=gen_random_uuid() where id=$1", [location])).rejects.toThrow(/immutable/);
    await db.exec("reset role");
  });
});
