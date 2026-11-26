import { handle, json } from "@/server/http";
import { withSession } from "@/server/sessions";
import { publicAdminUser, type AdminUserRow } from "@/server/admin-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(() => withSession(request, async tx => {
    const { rows } = await tx.query<AdminUserRow>(
      "select * from apa_private.profiles order by username,id"
    );
    return json({ items: rows.map(publicAdminUser) });
  }, true));
}
