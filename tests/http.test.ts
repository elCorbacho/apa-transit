import { afterEach, describe, expect, it } from "vitest";
import { handle } from "../src/server/http";

const failure = () => Object.assign(new Error("provider detail"), { code: "SELF_SIGNED_CERT_IN_CHAIN" });
const restore = { VERCEL_ENV: process.env.VERCEL_ENV, APP_ENV: process.env.APP_ENV };

afterEach(() => {
  for (const [key, value] of Object.entries(restore)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("unexpected service failure", () => {
  it("names the failure class outside production without exposing the message", async () => {
    delete process.env.VERCEL_ENV;
    delete process.env.APP_ENV;
    const response = await handle(async () => { throw failure(); });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ diagnostic: { code: "SELF_SIGNED_CERT_IN_CHAIN" } });
    expect(JSON.stringify(body)).not.toContain("provider detail");
  });
  it("withholds the failure class on a production deployment", async () => {
    process.env.VERCEL_ENV = "production";
    const response = await handle(async () => { throw failure(); });
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("diagnostic");
  });
});
