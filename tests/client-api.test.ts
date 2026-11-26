import { describe, expect, it, vi } from "vitest";
import { ApiFailure, captureMovement, createLocation, downloadLocationQR, editLocation, listLocations, loadHistory, loadMe, login, logout } from "../src/lib/client-api";

const profile = { id: "synthetic-id", username: "operator.test", fullName: "Synthetic Operator", email: "operator@example.invalid", role: "operator" };

describe("same-origin client requests", () => {
  it("retries an uncertain scan with the same ID and QR without exposing credentials", async () => {
    const attempt = {
      qrPayload: "APA-TRANSIT:LOC:11111111-1111-4111-8111-111111111111",
      requestId: "22222222-2222-4222-8222-222222222222"
    };
    const movement = {
      id: "33333333-3333-4333-8333-333333333333", locationId: "11111111-1111-4111-8111-111111111111",
      locationName: "Synthetic Room", userName: "Synthetic Operator", recordedAt: "2026-11-26T10:00:00Z",
      requestId: attempt.requestId
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValueOnce(Response.json(movement));
    await expect(captureMovement(attempt, fetcher)).rejects.toThrow("Network unavailable");
    expect(await captureMovement(attempt, fetcher)).toEqual(movement);
    expect(fetcher.mock.calls.map(([url, options]) => [url, options?.body])).toEqual([
      ["/api/movements", JSON.stringify(attempt)], ["/api/movements", JSON.stringify(attempt)]
    ]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: expect.objectContaining({ "x-apa-csrf": "1" })
    });
  });
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

  it("uses protected same-origin requests for location administration and QR download", async () => {
    const location = { id: "11111111-1111-4111-8111-111111111111", name: "Synthetic Room", isActive: true };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [location] }))
      .mockResolvedValueOnce(Response.json(location, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ ...location, isActive: false }))
      .mockResolvedValueOnce(new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" }
      }));
    expect(await listLocations(fetcher)).toEqual({ items: [location] });
    expect(await createLocation("Synthetic Room", fetcher)).toEqual(location);
    expect(await editLocation(location.id, { isActive: false }, fetcher)).toMatchObject({ isActive: false });
    expect((await downloadLocationQR(location.id, fetcher)).size).toBe(4);
    for (const [url, options] of fetcher.mock.calls) {
      expect(String(url)).toMatch(/^\/api\/admin\/locations(?:\/|$)/);
      expect(options).toMatchObject({ credentials: "same-origin", cache: "no-store" });
    }
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: "POST", body: JSON.stringify({ name: "Synthetic Room" }),
      headers: expect.objectContaining({ "x-apa-csrf": "1" })
    });
    expect(fetcher.mock.calls[2][1]).toMatchObject({
      method: "PATCH", body: JSON.stringify({ isActive: false }),
      headers: expect.objectContaining({ "x-apa-csrf": "1" })
    });
    expect(fetcher.mock.calls[3][0]).toBe(`/api/admin/locations/${location.id}/qr`);
  });

  it("rejects denied QR downloads instead of rendering a server error as an image", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "private detail" }, { status: 401 }));
    await expect(downloadLocationQR("synthetic-id", fetcher)).rejects.toMatchObject({ status: 401 });
  });
});
