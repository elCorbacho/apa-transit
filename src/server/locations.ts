import "server-only";
import { z } from "zod";
import { ApiError } from "./errors";
import type { Queryable } from "./db";

export const locationName = z.string().trim().min(1).max(120);
export const newLocation = z.strictObject({ name: locationName });
export const locationChanges = z.strictObject({
  name: locationName.optional(), isActive: z.boolean().optional()
}).refine(value => Object.keys(value).length > 0);

export function locationId(raw: string) {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "INVALID_INPUT", "Invalid location ID.");
  return parsed.data;
}

export type LocationRow = {
  id: string; name: string; isActive: boolean; qrToken: string;
};
export const columns = `id,name,is_active as "isActive",qr_token as "qrToken"`;
export function publicLocation(row: LocationRow) {
  return { id: row.id, name: row.name, isActive: row.isActive };
}
export async function auditLocation(tx: Queryable, actorId: string, targetId: string, action: string) {
  await tx.query(`insert into apa_private.audit_events(actor_id,target_id,action,result)
    values ($1,$2,$3,'success')`, [actorId, targetId, action]);
}
