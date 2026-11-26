import QRCode from "qrcode";
import { handle } from "@/server/http";
import { withSession } from "@/server/sessions";
import { ApiError } from "@/server/errors";
import { columns, locationId, type LocationRow } from "@/server/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return handle(() => withSession(request, async tx => {
    const id = locationId((await context.params).id);
    const { rows } = await tx.query<LocationRow>(
      `select ${columns} from apa_private.locations where id=$1`, [id]
    );
    if (!rows.length) throw new ApiError(404, "LOCATION_NOT_FOUND", "Location not found.");
    const png = await QRCode.toBuffer(`APA-TRANSIT:LOC:${rows[0].qrToken}`, {
      type: "png", errorCorrectionLevel: "M", margin: 4, width: 512
    });
    return new Response(new Uint8Array(png), {
      status: 200, headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="apa-transit-location-${id}.png"`,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"
      }
    });
  }, true));
}
