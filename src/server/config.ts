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

function isProduction(env: Environment) {
  return env.VERCEL_ENV === "production"
    || env.APP_ENV === "production"
    || (env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview" && env.APP_ENV !== "development" && env.APP_ENV !== "preview");
}

export function readServerConfig(env: Environment = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error("Server configuration is incomplete.");
  const value = parsed.data;
  const production = isProduction(env);
  if (production && env.RF007_VERIFIED !== "true") {
    throw new Error("Production security verification is pending.");
  }
  const origin = new URL(value.APP_ORIGIN);
  const upstream = new URL(value.SUPABASE_URL);
  const database = new URL(value.DATABASE_URL);
  if (origin.origin !== value.APP_ORIGIN || origin.username || origin.password) {
    throw new Error("APP_ORIGIN must be an origin without a path or credentials.");
  }
  const localOrigin = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (origin.protocol !== "https:" && (production || !localOrigin)) {
    throw new Error("HTTPS is required.");
  }
  if (upstream.protocol !== "https:" || upstream.username || upstream.password) {
    throw new Error("Auth must use an HTTPS server endpoint.");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol)
      || !database.hostname || !database.username || !database.password
      || /^(postgres|supabase_admin|supabase_auth_admin|service_role)(\.|$)/i.test(decodeURIComponent(database.username))) {
    throw new Error("A dedicated database runtime login is required.");
  }
  if (database.searchParams.has("sslmode") && database.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("Database TLS must verify the server certificate.");
  }
  const encryptionKey = Buffer.from(value.APP_SESSION_ENCRYPTION_KEY, "base64");
  if (encryptionKey.length !== 32 || encryptionKey.toString("base64") !== value.APP_SESSION_ENCRYPTION_KEY) {
    throw new Error("Session encryption requires a 32-byte base64 key.");
  }
  return {
    origin: origin.origin, databaseUrl: value.DATABASE_URL, databaseCA: env.DATABASE_CA_CERT,
    supabaseUrl: value.SUPABASE_URL, authKey: value.SUPABASE_AUTH_KEY,
    adminKey: value.SUPABASE_ADMIN_KEY, encryptionKey, sessionDays: value.SESSION_DAYS,
    production
  };
}

export function configurationStatus(env: Environment = process.env) {
  try {
    readServerConfig(env);
    return { configured: true, productionApproved: isProduction(env) && env.RF007_VERIFIED === "true" };
  } catch {
    return { configured: false, productionApproved: false };
  }
}
