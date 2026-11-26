import { handle, json, readJson, requireMutation } from "@/server/http";
import { withSession } from "@/server/sessions";
import { ApiError } from "@/server/errors";
import { 
  publicAdminUser, userId, userNameChange, userEmailChange, 
  userPasswordChange, userRoleChange, type AdminUserRow 
} from "@/server/admin-users";
import { authProvider } from "@/server/auth-provider";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

const userChanges = z.strictObject({
  fullName: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().max(255).optional(),
  password: z.string().min(8).max(255).optional(),
  role: z.enum(["admin", "operator"]).optional(),
  isActive: z.boolean().optional()
});

export async function PATCH(request: Request, context: Context) {
  return handle(() => {
    requireMutation(request);
    return withSession(request, async (tx, actor) => {
      const id = userId((await context.params).id);
      const changes = userChanges.parse(await readJson(request));

      const target = (await tx.query<AdminUserRow>(
        "select * from apa_private.profiles where id=$1", [id]
      )).rows[0];
      if (!target) throw new ApiError(404, "USER_NOT_FOUND", "User not found.");

      // Handle role change (PostgreSQL only, revoke sessions)
      if (changes.role !== undefined && changes.role !== target.role) {
        if (changes.role === "operator" && target.role === "admin") {
          const { rows: activeAdmins } = await tx.query<{ count: number }>(
            "select count(*)::int as count from apa_private.profiles where role='admin' and is_active=true and id!=$1"
          );
          if (activeAdmins[0].count === 0) {
            throw new ApiError(409, "LAST_ADMIN", "Cannot demote the last active administrator.");
          }
        }
        const { rows } = await tx.query<AdminUserRow>(
          "update apa_private.profiles set role=$2 where id=$1 returning *", [id, changes.role]
        );
        // Revoke all sessions for this user
        await tx.query(
          "update apa_private.app_sessions set revoked_at=clock_timestamp() where user_id=$1 and revoked_at is null",
          [id]
        );
        await tx.query(`insert into apa_private.audit_events(actor_id,target_id,action,result)
          values ($1,$2,'user_role_change','success')`, [actor.id, id]);
        return json(publicAdminUser(rows[0]));
      }

      // Handle email change (requires Auth reconciliation)
      if (changes.email !== undefined && changes.email !== target.email) {
        // Block user and revoke sessions before Auth change
        await tx.query(
          "update apa_private.profiles set blocked_at=clock_timestamp() where id=$1", [id]
        );
        await tx.query(
          "update apa_private.app_sessions set revoked_at=clock_timestamp() where user_id=$1 and revoked_at is null",
          [id]
        );
        
        try {
          await authProvider().adminUpdateUser(id, { email: changes.email });
          const { rows } = await tx.query<AdminUserRow>(
            "update apa_private.profiles set email=$2, blocked_at=null where id=$1 returning *", 
            [id, changes.email]
          );
          await tx.query(`insert into apa_private.audit_events(actor_id,target_id,action,result)
            values ($1,$2,'user_email_change','success')`, [actor.id, id]);
          return json(publicAdminUser(rows[0]));
        } catch (error) {
          // Revert block if Auth failed
          await tx.query(
            "update apa_private.profiles set blocked_at=null where id=$1", [id]
          );
          throw error;
        }
      }

      // Handle password change (requires Auth reconciliation)
      if (changes.password !== undefined) {
        // Block user and revoke sessions before Auth change
        await tx.query(
          "update apa_private.profiles set blocked_at=clock_timestamp() where id=$1", [id]
        );
        await tx.query(
          "update apa_private.app_sessions set revoked_at=clock_timestamp() where user_id=$1 and revoked_at is null",
          [id]
        );
        
        try {
          await authProvider().adminUpdateUser(id, { password: changes.password });
          const { rows } = await tx.query<AdminUserRow>(
            "update apa_private.profiles set blocked_at=null where id=$1 returning *", [id]
          );
          await tx.query(`insert into apa_private.audit_events(actor_id,target_id,action,result)
            values ($1,$2,'user_password_change','success')`, [actor.id, id]);
          return json(publicAdminUser(rows[0]));
        } catch (error) {
          // Revert block if Auth failed
          await tx.query(
            "update apa_private.profiles set blocked_at=null where id=$1", [id]
          );
          throw error;
        }
      }

      // Handle isActive change
      if (changes.isActive !== undefined) {
        if (changes.isActive === false && target.role === "admin") {
          const { rows: activeAdmins } = await tx.query<{ count: number }>(
            "select count(*)::int as count from apa_private.profiles where role='admin' and is_active=true"
          );
          if (activeAdmins[0].count <= 1) {
            throw new ApiError(409, "LAST_ADMIN", "Cannot deactivate the last active administrator.");
          }
        }
        const { rows } = await tx.query<AdminUserRow>(
          "update apa_private.profiles set is_active=$2 where id=$1 returning *", [id, changes.isActive]
        );
        // Revoke all sessions when deactivating
        if (changes.isActive === false) {
          await tx.query(
            "update apa_private.app_sessions set revoked_at=clock_timestamp() where user_id=$1 and revoked_at is null",
            [id]
          );
        }
        await tx.query(`insert into apa_private.audit_events(actor_id,target_id,action,result)
          values ($1,$2,'user_toggle_active','success')`, [actor.id, id]);
        return json(publicAdminUser(rows[0]));
      }

      // Handle fullName change
      if (changes.fullName !== undefined) {
        const { rows } = await tx.query<AdminUserRow>(
          "update apa_private.profiles set full_name=$2 where id=$1 returning *", [id, changes.fullName]
        );
        await tx.query(`insert into apa_private.audit_events(actor_id,target_id,action,result)
          values ($1,$2,'user_rename','success')`, [actor.id, id]);
        return json(publicAdminUser(rows[0]));
      }

      throw new ApiError(400, "INVALID_INPUT", "No valid changes provided.");
    }, true);
  });
}
