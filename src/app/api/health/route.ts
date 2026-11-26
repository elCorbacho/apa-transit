import { configurationDiagnostic, configurationStatus } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // This is application readiness, not a database or Auth connectivity check.
  const status = configurationStatus();
  const diagnostic = configurationDiagnostic();
  return Response.json({
    status: "setup_required",
    serverConfigured: status.configured,
    operational: false,
    ...(diagnostic ? { diagnostic } : {})
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
