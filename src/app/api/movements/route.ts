import { handle, json, readJson, requireMutation } from "@/server/http";
import { limitCaptureAttempt, withSession } from "@/server/sessions";
import { parseCapture, encodeCursor, decodeCursor } from "@/lib/domain";
import { ApiError } from "@/server/errors";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MovementRow = {
  id: string;
  locationId: string;
  locationName: string;
  userName: string;
  requestId: string;
  recordedAt: string;
};

const movementColumns = `id,location_id as "locationId",location_name_snapshot as "locationName",
  user_name_snapshot as "userName",request_id as "requestId",
  to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "recordedAt"`;

export async function POST(request: Request) {
  return handle(() => {
    requireMutation(request);
    return withSession(request, async (tx, profile) => {
      // Count every authenticated scan attempt, including malformed and unknown QR.
      await limitCaptureAttempt(tx, request);
      let capture: ReturnType<typeof parseCapture>;
      try { capture = parseCapture(await readJson(request)); }
      catch (error) {
        // Return a response inside the transaction so a rejected scan still
        // commits its rate-limit entry; unexpected database errors still roll back.
        if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
        if (error instanceof ZodError) return json({ error: { code: "INVALID_INPUT", message: "Invalid request." } }, 400);
        throw error;
      }
      const { qrToken, requestId } = capture;
      // Profile and session locks are held by withSession. Serialize requests
      // from different sessions using the same user's capture ID before reading.
      await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`${profile.id}:${requestId}`]);
      const location = (await tx.query<{ id: string; name: string; is_active: boolean }>(
        "select id, name, is_active from apa_private.locations where qr_token = $1 for share", [qrToken]
      )).rows[0];
      if (!location) return json({ error: { code: "LOCATION_NOT_FOUND", message: "Location not found." } }, 404);
      const existing = (await tx.query<MovementRow>(
        `select ${movementColumns} from apa_private.movements where user_id = $1 and request_id = $2`,
        [profile.id, requestId]
      )).rows[0];
      if (existing) {
        if (existing.locationId !== location.id) {
          return json({ error: { code: "REQUEST_ID_CONFLICT", message: "Request ID already used for a different location." } }, 409);
        }
        return json(existing, 200);
      }
      if (!location.is_active) {
        return json({ error: { code: "LOCATION_INACTIVE", message: "Location is inactive." } }, 409);
      }
      const inserted = (await tx.query<MovementRow>(
        `insert into apa_private.movements(user_id, location_id, user_name_snapshot, location_name_snapshot, request_id)
         values ($1, $2, $3, $4, $5)
         returning ${movementColumns}`,
        [profile.id, location.id, profile.full_name, location.name, requestId]
      )).rows[0];
      return json(inserted, 201);
    });
  });
}

export async function GET(request: Request) {
  return handle(() => withSession(request, async tx => {
    const url = new URL(request.url);
    const cursorParam = url.searchParams.get("cursor");
    if (url.searchParams.has("cursor") && (!cursorParam || url.searchParams.getAll("cursor").length !== 1)) {
      throw new ApiError(400, "INVALID_INPUT", "Invalid movement cursor.");
    }
    let cursor: ReturnType<typeof decodeCursor> | undefined;
    if (cursorParam) {
      try { cursor = decodeCursor(cursorParam); }
      catch { throw new ApiError(400, "INVALID_INPUT", "Invalid movement cursor."); }
    }
    const { rows } = await tx.query<MovementRow>(
      `select ${movementColumns} from apa_private.movements
       ${cursor ? "where (recorded_at, id) < ($1, $2)" : ""}
       order by recorded_at desc, id desc
       limit 51`,
      cursor ? [cursor.recordedAt, cursor.id] : []
    );
    const hasMore = rows.length > 50;
    const items = rows.slice(0, 50);
    const nextCursor = hasMore && items.length > 0 ? encodeCursor({
      recordedAt: items[items.length - 1].recordedAt,
      id: items[items.length - 1].id
    }) : null;

    return json({ items, nextCursor });
  }));
}
