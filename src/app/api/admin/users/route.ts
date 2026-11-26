import { handle, json, readJson, requireMutation } from "@/server/http";
import { withSession } from "@/server/sessions";
import { publicAdminUser, type AdminUserRow } from "@/server/admin-users";
import { authProvider } from "@/server/auth-provider";
import { ApiError } from "@/server/errors";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createUserSchema = z.strictObject({
  username: z.string().trim().min(3).max(40).regex(/^[a-z0-9._-]+$/i),
  fullName: z.string().trim().min(1).max(120),
  email: z.string().email().max(255),
  password: z.string().min(8).max(255),
  role: z.enum(["admin", "operator"])
});

export async function GET(request: Request) {
  return handle(() => withSession(request, async tx => {
    const { rows } = await tx.query<AdminUserRow>(
      "select * from apa_private.profiles order by username,id"
    );
    return json({ items: rows.map(publicAdminUser) });
  }, true));
}

export async function POST(request: Request) {
  return handle(() => {
    requireMutation(request);
    return withSession(request, async (tx, actor) => {
      const data = createUserSchema.parse(await readJson(request));
      
      // Check username uniqueness
      const { rows: existingUsername } = await tx.query(
        "select id from apa_private.profiles where username=$1", [data.username.toLowerCase()]
      );
      if (existingUsername.length > 0) {
        throw new ApiError(409, "USERNAME_EXISTS", "Username already exists.");
      }
      
      // Check email uniqueness
      const { rows: existingEmail } = await tx.query(
        "select id from apa_private.profiles where email=$1", [data.email.toLowerCase()]
      );
      if (existingEmail.length > 0) {
        throw new ApiError(409, "EMAIL_EXISTS", "Email already exists.");
      }
      
      // Create user in Auth first
      let authUserId: string;
      try {
        authUserId = await authProvider().adminCreateUser(data.email, data.password);
      } catch (error) {
        throw new ApiError(503, "AUTH_CREATE_FAILED", "Failed to create user in authentication system.");
      }
      
      // Create in PostgreSQL
      try {
        const { rows } = await tx.query<AdminUserRow>(
          `insert into apa_private.profiles(id, username, full_name, email, role)
           values ($1, $2, $3, $4, $5) returning *`,
          [authUserId, data.username.toLowerCase(), data.fullName, data.email.toLowerCase(), data.role]
        );
        await tx.query(`insert into apa_private.audit_events(actor_id,target_id,action,result)
          values ($1,$2,'user_create','success')`, [actor.id, authUserId]);
        return json(publicAdminUser(rows[0]), 201);
      } catch (error) {
        // Reconciliation: delete from Auth if PostgreSQL failed
        try {
          await authProvider().adminDeleteUser(authUserId);
        } catch {
          // Log but don't throw - Auth cleanup is best-effort
        }
        throw new ApiError(500, "DB_CREATE_FAILED", "Failed to create user in database.");
      }
    }, true);
  });
}
