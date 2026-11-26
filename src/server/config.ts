import "server-only";
import { z } from "zod";

type Environment = Record<string, string | undefined>;
const schema = z.object({
  APP_ORIGIN: z.url(),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_AUTH_KEY: z.string().min(1),
  SUPABASE_ADMIN_KEY: z.string().min(1),
  APP_SESSION_ENCRYPTION_KEY: z.string().min(1),
  SESSION_DAYS: z.coerce.number().int().min(1).max(30).default(7)
});

export function isProduction(env: Environment = process.env) {
  return env.VERCEL_ENV === "production"
    || env.APP_ENV === "production"
    || (env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview" && env.APP_ENV !== "development" && env.APP_ENV !== "preview");
}

// Names the failing setting without ever echoing its value, so an operator can
// fix a deployment from the setup screen instead of guessing.
export class ConfigError extends Error {
  constructor(readonly reason: string, readonly fields: string[], message: string) {
    super(message);
  }
}

export function readServerConfig(env: Environment = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map(issue => String(issue.path[0])))];
    throw new ConfigError("incomplete", fields, "Server configuration is incomplete.");
  }
  const value = parsed.data;
  const production = isProduction(env);
  if (production && env.RF007_VERIFIED !== "true") {
    throw new ConfigError("security_verification_pending", ["RF007_VERIFIED"], "Production security verification is pending.");
  }
  const origin = new URL(value.APP_ORIGIN);
  const upstream = new URL(value.SUPABASE_URL);
  const database = new URL(value.DATABASE_URL);
  if (origin.origin !== value.APP_ORIGIN || origin.username || origin.password) {
    throw new ConfigError("invalid_origin", ["APP_ORIGIN"], "APP_ORIGIN must be an origin without a path or credentials.");
  }
  const localOrigin = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (origin.protocol !== "https:" && (production || !localOrigin)) {
    throw new ConfigError("https_required", ["APP_ORIGIN"], "HTTPS is required.");
  }
  if (upstream.protocol !== "https:" || upstream.username || upstream.password) {
    throw new ConfigError("auth_endpoint_invalid", ["SUPABASE_URL"], "Auth must use an HTTPS server endpoint.");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol)
      || !database.hostname || !database.username || !database.password
      || /^(postgres|supabase_admin|supabase_auth_admin|service_role)(\.|$)/i.test(decodeURIComponent(database.username))) {
    throw new ConfigError("database_login_invalid", ["DATABASE_URL"], "A dedicated database runtime login is required.");
  }
  if (database.searchParams.has("sslmode") && database.searchParams.get("sslmode") !== "verify-full") {
    throw new ConfigError("database_tls_invalid", ["DATABASE_URL"], "Database TLS must verify the server certificate.");
  }
  const encryptionKey = Buffer.from(value.APP_SESSION_ENCRYPTION_KEY, "base64");
  if (encryptionKey.length !== 32 || encryptionKey.toString("base64") !== value.APP_SESSION_ENCRYPTION_KEY) {
    throw new ConfigError("encryption_key_invalid", ["APP_SESSION_ENCRYPTION_KEY"], "Session encryption requires a 32-byte base64 key.");
  }
  return {
    origin: origin.origin, databaseUrl: value.DATABASE_URL, databaseCA: env.DATABASE_CA_CERT,
    supabaseUrl: value.SUPABASE_URL, authKey: value.SUPABASE_AUTH_KEY,
    adminKey: value.SUPABASE_ADMIN_KEY, encryptionKey, sessionDays: value.SESSION_DAYS,
    production
  };
}

export type ConfigurationStatus =
  | { configured: true; productionApproved: boolean; reason: null; fields: [] }
  | { configured: false; productionApproved: false; reason: string; fields: string[] };

export function configurationStatus(env: Environment = process.env): ConfigurationStatus {
  try {
    readServerConfig(env);
    return {
      configured: true,
      productionApproved: isProduction(env) && env.RF007_VERIFIED === "true",
      reason: null,
      fields: []
    };
  } catch (error) {
    if (error instanceof ConfigError) {
      return { configured: false, productionApproved: false, reason: error.reason, fields: error.fields };
    }
    return { configured: false, productionApproved: false, reason: "unknown", fields: [] };
  }
}

// The setup screen may name the failing setting, but never on a production
// deployment where that would describe the perimeter to anonymous visitors.
export function configurationDiagnostic(env: Environment = process.env) {
  const status = configurationStatus(env);
  if (status.configured || isProduction(env)) return null;
  return { reason: status.reason, fields: status.fields };
}
