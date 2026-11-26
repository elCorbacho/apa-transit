import "server-only";
import { z } from "zod";
import { ApiError } from "./errors";
import { publicProfile } from "./sessions";

export type AdminUserRow = {
  id: string; username: string; full_name: string; email: string;
  role: "admin" | "operator"; is_active: boolean; blocked_at: Date | null;
  deleted_at: Date | null; auth_version: string | number;
};
export const userNameChange = z.strictObject({ fullName: z.string().trim().min(1).max(120) });
export const userEmailChange = z.strictObject({ email: z.string().email().max(255) });
export const userPasswordChange = z.strictObject({ password: z.string().min(8).max(255) });
export const userRoleChange = z.strictObject({ role: z.enum(["admin", "operator"]) });

export function userId(raw: string) {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "INVALID_INPUT", "Invalid user ID.");
  return parsed.data;
}

export function publicAdminUser(row: AdminUserRow) {
  return {
    ...publicProfile(row),
    isActive: row.is_active,
    isBlocked: row.blocked_at !== null,
    isDeleted: row.deleted_at !== null
  };
}
