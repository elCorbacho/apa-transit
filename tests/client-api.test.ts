import { describe, expect, it, vi } from "vitest";
import { ApiFailure, loadHistory, loadMe, login, logout } from "../src/lib/client-api";

const profile = { id: "synthetic-id", username: "operator.test", fullName: "Synthetic Operator", email: "operator@example.invalid", role: "operator" };

describe("same-origin client requests", () => {
  it("logs in without exposing credentials in URL or persisted browser storage", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ profile }));
    expect(await login("operator.test", "synthetic-password", fetcher)).toEqual({ profile });
    expect(fetcher).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: expect.objectContaining({ "x-apa-csrf": "1", "content-type": "application/json" }),
      body: JSON.stringify({ username: "operator.test", password: "synthetic-password" })
    }));
  });

  it("loads profile and shared history by encoded cursor without cache", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ profile, lastMovement: null }))
      .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null }));
    expect(await loadMe(fetcher)).toEqual({ profile, lastMovement: null });
    expect(await loadHistory("cursor+/=", fetcher)).toEqual({ items: [], nextCursor: null });
    expect(fetcher.mock.calls[0]).toEqual(["/api/me", expect.objectContaining({ credentials: "same-origin", cache: "no-store" })]);
    expect(fetcher.mock.calls[1][0]).toBe("/api/movements?cursor=cursor%2B%2F%3D");
    expect(fetcher.mock.calls[1][1]).toEqual(expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
  });

  it("exposes only HTTP status for denied requests, never provider messages", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ error: { message: "private diagnostic" } }, { status: 401 })
    );
    await expect(loadMe(fetcher)).rejects.toMatchObject({ status: 401 });
    await expect(loadHistory(undefined, fetcher)).rejects.toBeInstanceOf(ApiFailure);
    await expect(loadHistory(undefined, fetcher)).rejects.not.toThrow("private diagnostic");
  });

  it("logs out using CSRF and expects no response body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(logout(fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: expect.objectContaining({ "x-apa-csrf": "1" })
    }));
  });
});
