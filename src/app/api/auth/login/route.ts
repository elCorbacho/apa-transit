import { handle, json, readJson, requireMutation } from "@/server/http";
import { loginSession } from "@/server/sessions";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    requireMutation(request);
    const { profile, cookie } = await loginSession(await readJson(request), request);
    return json({ profile }, 200, { "Set-Cookie": cookie });
  });
}
