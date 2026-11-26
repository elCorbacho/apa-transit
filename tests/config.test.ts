import { describe, expect, it } from "vitest";
import { configurationStatus, readServerConfig } from "../src/server/config";
import { requireMutationOrigin } from "../src/server/request-security";

const configured = {
  NODE_ENV: "test",
  APP_ENV: "development",
  APP_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://apa_runtime:synthetic@db.example.invalid:5432/postgres",
  SUPABASE_URL: "https://auth.example.invalid",
  SUPABASE_AUTH_KEY: "synthetic-auth-key",
  SUPABASE_ADMIN_KEY: "synthetic-admin-key",
  APP_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64")
};
describe("server configuration", () => {
  it("keeps an unconfigured environment closed without exposing values", () => {
    const status = configurationStatus({});
    expect(status.configured).toBe(false);
    expect(status.productionApproved).toBe(false);
    expect(status.reason).toBe("incomplete");
    expect(status.fields).toEqual([
      "APP_ORIGIN", "DATABASE_URL", "SUPABASE_URL",
      "SUPABASE_AUTH_KEY", "SUPABASE_ADMIN_KEY", "APP_SESSION_ENCRYPTION_KEY"
    ]);
    expect(JSON.stringify(status)).not.toContain("synthetic");
    expect(() => readServerConfig({})).toThrow("Server configuration is incomplete.");
  });
  it("names the setting that blocks configuration without exposing its value", () => {
    const reasonOf = (overrides: Record<string, string>) =>
      configurationStatus({ ...configured, ...overrides });
    expect(reasonOf({ APP_SESSION_ENCRYPTION_KEY: "too-short" })).toMatchObject({
      configured: false, reason: "encryption_key_invalid", fields: ["APP_SESSION_ENCRYPTION_KEY"]
    });
    expect(reasonOf({ DATABASE_URL: "postgresql://postgres:synthetic@db.example.invalid/postgres" })).toMatchObject({
      reason: "database_login_invalid", fields: ["DATABASE_URL"]
    });
    expect(reasonOf({ DATABASE_URL: "postgresql://apa_runtime:synthetic@db.example.invalid/postgres?sslmode=require" })).toMatchObject({
      reason: "database_tls_invalid", fields: ["DATABASE_URL"]
    });
    expect(reasonOf({ APP_ORIGIN: "http://localhost:3000/" })).toMatchObject({
      reason: "invalid_origin", fields: ["APP_ORIGIN"]
    });
    expect(reasonOf({ SUPABASE_URL: "http://auth.example.invalid" })).toMatchObject({
      reason: "auth_endpoint_invalid", fields: ["SUPABASE_URL"]
    });
    expect(reasonOf({ VERCEL_ENV: "production" })).toMatchObject({
      reason: "security_verification_pending", fields: ["RF007_VERIFIED"]
    });
    const leaked = JSON.stringify(reasonOf({ DATABASE_URL: "postgresql://postgres:synthetic-secret@db.example.invalid/postgres" }));
    expect(leaked).not.toContain("synthetic-secret");
    expect(leaked).not.toContain("db.example.invalid");
  });
  it("does not allow a development flag to bypass the production gate", () => {
    const env = { ...configured, VERCEL_ENV: "production" };
    expect(configurationStatus(env).productionApproved).toBe(false);
    expect(() => readServerConfig(env)).toThrow("Production security verification is pending.");
    expect(() => readServerConfig({ ...env, RF007_VERIFIED: "true", APP_ORIGIN: "https://app.example.invalid" })).not.toThrow();
  });
  it("requires a 256-bit encryption key and a non-owner database login", () => {
    expect(() => readServerConfig({ ...configured, APP_SESSION_ENCRYPTION_KEY: "too-short" })).toThrow();
    expect(() => readServerConfig({ ...configured, DATABASE_URL: "postgresql://postgres:synthetic@db.example.invalid/postgres" })).toThrow();
    expect(readServerConfig(configured).sessionDays).toBe(7);
  });
});
describe("same-origin mutation boundary", () => {
  it("requires exact origin plus an application-specific header, including login/logout", () => {
    const request = (origin?: string, csrf?: string) => new Request("https://app.example.invalid/api/auth/login", {
      method: "POST", headers: { ...(origin ? { origin } : {}), ...(csrf ? { "x-apa-csrf": csrf } : {}) }
    });
    expect(() => requireMutationOrigin(request("https://app.example.invalid", "1"), "https://app.example.invalid")).not.toThrow();
    for (const req of [request(), request("https://evil.example.invalid", "1"), request("https://app.example.invalid")]) {
      expect(() => requireMutationOrigin(req, "https://app.example.invalid")).toThrow("Request origin denied.");
    }
  });
});
