import { configurationStatus } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // This is application readiness, not a database or Auth connectivity check.
  return Response.json({
    status: "setup_required",
    serverConfigured: configurationStatus().configured,
    operational: false
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
