import { handle, requireMutation } from "@/server/http";
import { logoutSession, sessionCookie } from "@/server/sessions";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    requireMutation(request);
    await logoutSession(request);
    return new Response(null, {
      status: 204, headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie("", 0) }
    });
  });
}
