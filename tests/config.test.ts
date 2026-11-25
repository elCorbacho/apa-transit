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
    expect(configurationStatus({})).toEqual({ configured: false, productionApproved: false });
    expect(() => readServerConfig({})).toThrow("Server configuration is incomplete.");
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
