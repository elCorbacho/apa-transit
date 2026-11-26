import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readServerConfig } from "./config";
import { ApiError } from "./errors";

export type ProviderSession = {
  userId: string; accessToken: string; refreshToken: string; expiresAt: number;
};

export function authProvider() {
  const config = readServerConfig();
  // Never share an auth client or mutable upstream session between requests.
  const client = createClient(config.supabaseUrl, config.authKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(5_000)])
          : AbortSignal.timeout(5_000)
      })
    }
  });
  function reject(error: { status?: number } | null): never {
    if (error?.status && [400, 401, 403].includes(error.status)) {
      throw new ApiError(401, "AUTH_REJECTED", "Authentication failed.");
    }
    throw new ApiError(503, "AUTH_UNAVAILABLE", "Authentication is temporarily unavailable.");
  }
  return {
    async signIn(email: string, password: string): Promise<ProviderSession> {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session) return reject(error);
      return {
        userId: data.session.user.id, accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at!
      };
    },
    async refresh(refreshToken: string): Promise<ProviderSession> {
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) return reject(error);
      return {
        userId: data.session.user.id, accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at!
      };
    },
    async adminUpdateUser(userId: string, updates: { email?: string; password?: string }): Promise<void> {
      const { error } = await client.auth.admin.updateUserById(userId, updates);
      if (error) reject(error);
    },
    async adminCreateUser(email: string, password: string): Promise<string> {
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (error || !data.user) reject(error);
      return data.user!.id;
    },
    async adminDeleteUser(userId: string): Promise<void> {
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) reject(error);
    }
  };
}
