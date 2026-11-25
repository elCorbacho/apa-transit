import { handle, json } from "@/server/http";
import { publicProfile, withSession } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(() => withSession(request, async (tx, profile) => {
    const { rows } = await tx.query(`select id,location_id as "locationId",location_name_snapshot as "locationName",
      user_name_snapshot as "userName",
      to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "recordedAt"
      from apa_private.movements where user_id=$1 order by recorded_at desc,id desc limit 1`, [profile.id]);
    return json({ profile: publicProfile(profile), lastMovement: rows[0] ?? null });
  }));
}
