import "server-only";
import { z } from "zod";
import { database, type Queryable } from "./db";
import { authProvider, type ProviderSession } from "./auth-provider";
import { readServerConfig } from "./config";
import { ApiError, invalidSession } from "./errors";
import { decryptTokens, encryptTokens, hashSessionToken, newSessionToken } from "./session-crypto";

export const SESSION_COOKIE = "__Host-apa_session";
type ProfileRow = {
  id: string; username: string; full_name: string; email: string; role: "admin" | "operator";
  is_active: boolean; blocked_at: Date | null; deleted_at: Date | null; auth_version: string | number;
};
export const publicProfile = (p: ProfileRow) => ({
  id: p.id, username: p.username, fullName: p.full_name, email: p.email, role: p.role
});
const usable = (p?: ProfileRow) => !!p && p.is_active && !p.blocked_at && !p.deleted_at;
const credentials = z.strictObject({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),
  password: z.string().min(1).max(1024)
});
const providerSession = z.object({
  userId: z.uuid(), accessToken: z.string().min(1), refreshToken: z.string().min(1),
  expiresAt: z.number().finite().int().positive()
});

export function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function cookieToken(request: Request): string | null {
  const matches = (request.headers.get("cookie") ?? "").split(";")
    .map(x => x.trim()).filter(x => x.startsWith(`${SESSION_COOKIE}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
async function countAttempt(key: string, limit: number) {
  const { rows } = await database().query<{ attempts: number }>(`
    insert into apa_private.rate_limits(key_hash) values ($1)
    on conflict (key_hash) do update set
      attempts = case when rate_limits.window_at < clock_timestamp()-interval '15 minutes' then 1 else rate_limits.attempts+1 end,
      window_at = case when rate_limits.window_at < clock_timestamp()-interval '15 minutes' then clock_timestamp() else rate_limits.window_at end
    returning attempts`, [hashSessionToken(key)]);
  if (rows[0].attempts > limit) throw new ApiError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
}
export async function loginSession(input: unknown, request: Request) {
  const config = readServerConfig();
  const data = credentials.parse(input);
  // Only trust Vercel's overwritten proxy header in a Vercel runtime. Local
  // development shares a single bucket rather than trusting client headers.
  const ip = process.env.VERCEL === "1"
    ? (request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown")
    : "local";
  await countAttempt(`login:ip:${ip}`, 60);
  await countAttempt(`login:user:${data.username}`, 5);
  const fail = () => new ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
  const initial = (await database().query<ProfileRow>(
    "select * from apa_private.profiles where username=$1", [data.username]
  )).rows[0];
  if (!usable(initial)) throw fail();
  let upstream: ProviderSession;
  try { upstream = await authProvider().signIn(initial.email, data.password); }
  catch (error) { if (error instanceof ApiError && error.status === 401) throw fail(); throw error; }
  const parsed = providerSession.safeParse(upstream);
  if (!parsed.success || upstream.userId !== initial.id || upstream.expiresAt <= Date.now() / 1000) throw fail();
  const token = newSessionToken();
  const profile = await database().transaction(async tx => {
    const current = (await tx.query<ProfileRow>("select * from apa_private.profiles where id=$1 for share", [initial.id])).rows[0];
    if (!usable(current) || String(current.auth_version) !== String(initial.auth_version)) throw fail();
    await tx.query(`insert into apa_private.app_sessions(token_hash,user_id,auth_tokens,auth_expires_at,expires_at)
      values ($1,$2,$3,to_timestamp($4),clock_timestamp()+$5*interval '1 day')`, [
      hashSessionToken(token), current.id,
      encryptTokens({ accessToken: upstream.accessToken, refreshToken: upstream.refreshToken }, config.encryptionKey),
      upstream.expiresAt, config.sessionDays
    ]);
    return publicProfile(current);
  });
  return { profile, cookie: sessionCookie(token, config.sessionDays * 86400) };
}

export async function withSession<T>(
  request: Request, work: (tx: Queryable, profile: ProfileRow) => Promise<T>, admin = false
): Promise<T> {
  const config = readServerConfig();
  const token = cookieToken(request);
  if (!token) throw invalidSession();
  const hash = hashSessionToken(token);
  const result = await database().transaction(async tx => {
    const lookup = (await tx.query<{ user_id: string }>(
      "select user_id from apa_private.app_sessions where token_hash=$1", [hash]
    )).rows[0];
    if (!lookup) return { denied: true as const };
    // All protected operations lock profile before session. Administrative
    // revocation takes the profile's update lock before touching sessions.
    const profile = (await tx.query<ProfileRow>("select * from apa_private.profiles where id=$1 for share", [lookup.user_id])).rows[0];
    const session = (await tx.query<{ auth_tokens: string; refresh_due: boolean }>(`
      select auth_tokens,auth_expires_at < clock_timestamp()+interval '60 seconds' as refresh_due
      from apa_private.app_sessions where token_hash=$1 and revoked_at is null
      and expires_at > clock_timestamp() for update`, [hash])).rows[0];
    if (!usable(profile) || !session) return { denied: true as const };
    if (admin && profile.role !== "admin") throw new ApiError(403, "ROLE_DENIED", "Administrator access required.");
    if (session.refresh_due) {
      let refreshToken: string;
      try { refreshToken = decryptTokens(session.auth_tokens, config.encryptionKey).refreshToken; }
      catch {
        await tx.query("update apa_private.app_sessions set revoked_at=clock_timestamp() where token_hash=$1", [hash]);
        return { denied: true as const };
      }
      let refreshed: ProviderSession;
      try { refreshed = await authProvider().refresh(refreshToken); }
      catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
        await tx.query("update apa_private.app_sessions set revoked_at=clock_timestamp() where token_hash=$1", [hash]);
        return { denied: true as const };
      }
      const parsed = providerSession.safeParse(refreshed);
      if (!parsed.success || refreshed.userId !== profile.id || refreshed.expiresAt <= Date.now() / 1000) {
        await tx.query("update apa_private.app_sessions set revoked_at=clock_timestamp() where token_hash=$1", [hash]);
        return { denied: true as const };
      }
      await tx.query(`update apa_private.app_sessions set auth_tokens=$2,auth_expires_at=to_timestamp($3)
        where token_hash=$1 and revoked_at is null`, [
        hash, encryptTokens({ accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken }, config.encryptionKey),
        refreshed.expiresAt
      ]);
    }
    return { value: await work(tx, profile) };
  });
  // Throw only after a definitive revocation has committed.
  if ("denied" in result) throw invalidSession();
  return result.value;
}

// A provisional development limit; confirm the threshold with operations before the pilot.
export async function limitCaptureAttempt(tx: Queryable, request: Request) {
  const token = cookieToken(request);
  if (!token) throw invalidSession();
  const { rows } = await tx.query<{ attempts: number }>(`
    insert into apa_private.rate_limits(key_hash) values ($1)
    on conflict (key_hash) do update set
      attempts = case when rate_limits.window_at < clock_timestamp()-interval '15 minutes' then 1 else rate_limits.attempts+1 end,
      window_at = case when rate_limits.window_at < clock_timestamp()-interval '15 minutes' then clock_timestamp() else rate_limits.window_at end
    returning attempts`, [hashSessionToken(`scan:${token}`)]);
  if (rows[0].attempts > 120) throw new ApiError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
}

export async function logoutSession(request: Request) {
  const token = cookieToken(request);
  if (token) await database().query(
    "update apa_private.app_sessions set revoked_at=clock_timestamp() where token_hash=$1 and revoked_at is null",
    [hashSessionToken(token)]
  );
}
