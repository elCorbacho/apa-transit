import { handle, json, readJson, requireMutation } from "@/server/http";
import { withSession } from "@/server/sessions";
import { auditLocation, columns, newLocation, publicLocation, type LocationRow } from "@/server/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(() => withSession(request, async tx => {
    const { rows } = await tx.query<LocationRow>(`select ${columns} from apa_private.locations order by name,id`);
    return json({ items: rows.map(publicLocation) });
  }, true));
}

export async function POST(request: Request) {
  return handle(() => {
    requireMutation(request);
    return withSession(request, async (tx, profile) => {
      const { name } = newLocation.parse(await readJson(request));
      const { rows } = await tx.query<LocationRow>(
        `insert into apa_private.locations(name) values ($1) returning ${columns}`, [name]
      );
      await auditLocation(tx, profile.id, rows[0].id, "location_create");
      return json(publicLocation(rows[0]), 201);
    }, true);
  });
}
