import { handle, json, readJson, requireMutation } from "@/server/http";
import { withSession } from "@/server/sessions";
import { ApiError } from "@/server/errors";
import { auditLocation, columns, locationChanges, locationId, publicLocation, type LocationRow } from "@/server/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return handle(() => {
    requireMutation(request);
    return withSession(request, async (tx, profile) => {
      const id = locationId((await context.params).id);
      const changes = locationChanges.parse(await readJson(request));
      // An UPDATE lock serializes activation with capture's FOR SHARE lock.
      const { rows } = await tx.query<LocationRow>(
        `update apa_private.locations set
          name=coalesce($2,name), is_active=coalesce($3,is_active),
          updated_at=clock_timestamp()
         where id=$1 returning ${columns}`,
        [id, changes.name ?? null, changes.isActive ?? null]
      );
      if (!rows.length) throw new ApiError(404, "LOCATION_NOT_FOUND", "Location not found.");
      await auditLocation(tx, profile.id, id, "location_update");
      return json(publicLocation(rows[0]));
    }, true);
  });
}
