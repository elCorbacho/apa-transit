import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { editUser, createUser } from "@/lib/client-api";

describe("admin user management with Auth reconciliation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("email change", () => {
    it("sends email change request with CSRF token", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
        id: "user-1",
        username: "admin",
        fullName: "Admin User",
        email: "newemail@example.com",
        role: "admin",
        isActive: true,
        isBlocked: false,
        isDeleted: false
      }), { status: 200 }));

      const user = await editUser("user-1", { email: "newemail@example.com" });
      expect(user.email).toBe("newemail@example.com");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users/user-1",
        expect.objectContaining({
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-apa-csrf": "1"
          },
          body: JSON.stringify({ email: "newemail@example.com" }),
          credentials: "same-origin",
          cache: "no-store"
        })
      );
    });
  });

  describe("password change", () => {
    it("sends password change request with CSRF token", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
        id: "user-1",
        username: "admin",
        fullName: "Admin User",
        email: "admin@example.com",
        role: "admin",
        isActive: true,
        isBlocked: false,
        isDeleted: false
      }), { status: 200 }));

      await editUser("user-1", { password: "newpassword123" });
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users/user-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ password: "newpassword123" })
        })
      );
    });
  });

  describe("role change", () => {
    it("sends role change request with CSRF token", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
        id: "user-1",
        username: "admin",
        fullName: "Admin User",
        email: "admin@example.com",
        role: "operator",
        isActive: true,
        isBlocked: false,
        isDeleted: false
      }), { status: 200 }));

      const user = await editUser("user-1", { role: "operator" });
      expect(user.role).toBe("operator");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users/user-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ role: "operator" })
        })
      );
    });
  });

  describe("user creation", () => {
    it("sends create user request with all required fields", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
        id: "new-user-id",
        username: "newuser",
        fullName: "New User",
        email: "newuser@example.com",
        role: "operator",
        isActive: true,
        isBlocked: false,
        isDeleted: false
      }), { status: 201 }));

      const user = await createUser({
        username: "newuser",
        fullName: "New User",
        email: "newuser@example.com",
        password: "password123",
        role: "operator"
      });
      
      expect(user.username).toBe("newuser");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users",
        expect.objectContaining({
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-apa-csrf": "1"
          },
          body: JSON.stringify({
            username: "newuser",
            fullName: "New User",
            email: "newuser@example.com",
            password: "password123",
            role: "operator"
          }),
          credentials: "same-origin",
          cache: "no-store"
        })
      );
    });
  });
});
