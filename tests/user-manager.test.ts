import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { editUser, listUsers } from "@/lib/client-api";

describe("admin user management API", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists users with same-origin credentials and no-store cache", async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{
        id: "user-1",
        username: "admin",
        fullName: "Admin User",
        email: "admin@example.com",
        role: "admin",
        isActive: true,
        isBlocked: false,
        isDeleted: false
      }]
    }), { status: 200 }));

    const { items } = await listUsers();
    expect(items).toHaveLength(1);
    expect(items[0].username).toBe("admin");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/users",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store"
      })
    );
  });

  it("renames a user with CSRF token and same-origin credentials", async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "user-1",
      username: "admin",
      fullName: "New Name",
      email: "admin@example.com",
      role: "admin",
      isActive: true,
      isBlocked: false,
      isDeleted: false
    }), { status: 200 }));

    const user = await editUser("user-1", { fullName: "New Name" });
    expect(user.fullName).toBe("New Name");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/users/user-1",
      expect.objectContaining({
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-apa-csrf": "1"
        },
        body: JSON.stringify({ fullName: "New Name" }),
        credentials: "same-origin",
        cache: "no-store"
      })
    );
  });

  it("toggles user active state", async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "user-1",
      username: "admin",
      fullName: "Admin User",
      email: "admin@example.com",
      role: "admin",
      isActive: false,
      isBlocked: false,
      isDeleted: false
    }), { status: 200 }));

    const user = await editUser("user-1", { isActive: false });
    expect(user.isActive).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/users/user-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ isActive: false })
      })
    );
  });

  it("handles 401 unauthorized response", async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(listUsers()).rejects.toThrow("Request failed.");
  });

  it("handles 403 forbidden response", async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(editUser("user-1", { fullName: "Test" })).rejects.toThrow("Request failed.");
  });
});
