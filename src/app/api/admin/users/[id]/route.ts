import { handle, json, readJson, requireMutation } from "@/server/http";
import { withSession } from "@/server/sessions";
import { ApiError } from "@/server/errors";
import { publicAdminUser, userId, userNameChange, type AdminUserRow } from "@/server/admin-users";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

const userChanges = z.strictObject({
  fullName: z.string().trim().min(1).max(120).optional(),
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
        await tx.query(`insert into apa_private.audit_events(actor_id,target_id,action,result)
          values ($1,$2,'user_toggle_active','success')`, [actor.id, id]);
        return json(publicAdminUser(rows[0]));
      }

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
