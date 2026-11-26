import "server-only";
import { ZodError } from "zod";
import { ApiError } from "./errors";
import { requireMutationOrigin } from "./request-security";
import { isProduction, readServerConfig } from "./config";

export function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
export async function handle(work: () => Promise<Response>): Promise<Response> {
  try { return await work(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
    if (error instanceof ZodError) return json({ error: { code: "INVALID_INPUT", message: "Invalid request." } }, 400);
    // Never return provider/database/configuration errors or log credentials.
    // Outside production the failure class is named so a deployment can be
    // fixed; the message and every value stay withheld.
    return json({
      error: { code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable." },
      ...(isProduction() ? {} : { diagnostic: failureClass(error) })
    }, 503);
  }
}

function failureClass(error: unknown) {
  const source = error instanceof Error ? error : undefined;
  const raw = source ? (source as unknown as { code?: unknown }).code : undefined;
  const code = typeof raw === "string" ? raw : undefined;
  return { name: source?.name ?? typeof error, ...(code ? { code } : {}) };
}
export function requireMutation(request: Request) {
  const config = readServerConfig();
  try { requireMutationOrigin(request, config.origin); }
  catch { throw new ApiError(403, "ORIGIN_DENIED", "Request origin denied."); }
}
export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(400, "INVALID_INPUT", "JSON is required.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_INPUT", "Invalid request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new ApiError(400, "INVALID_INPUT", "Request is too large.");
      }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new ApiError(400, "INVALID_INPUT", "Invalid JSON."); }
  } finally { reader.releaseLock(); }
}
