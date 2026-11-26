"use client";

import { useEffect, useState } from "react";
import { editUser, createUser, listUsers, type AdminUser, type CreateUserRequest } from "@/lib/client-api";

type Props = {
  onExpired: () => void;
};

export default function UserManager({ onExpired }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const { items } = await listUsers();
      setUsers(items);
    } catch (err) {
      if (err instanceof Error && err.message === "Request failed." && (err as any).status === 401) {
        onExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchUsers();
  }, []);

  async function handleRename(id: string, fullName: string) {
    setPending(true);
    setError(null);
    try {
      await editUser(id, { fullName });
      setUsers(current => current.map(user => user.id === id ? { ...user, fullName } : user));
      setEditing(null);
    } catch (err) {
      if (err instanceof Error && err.message === "Request failed." && (err as any).status === 401) {
        onExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to rename user");
    } finally {
      setPending(false);
    }
  }

  async function handleEmailChange(id: string, email: string) {
    setPending(true);
    setError(null);
    try {
      await editUser(id, { email });
      setUsers(current => current.map(user => user.id === id ? { ...user, email } : user));
      setEditing(null);
    } catch (err) {
      if (err instanceof Error && err.message === "Request failed." && (err as any).status === 401) {
        onExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to change email");
    } finally {
      setPending(false);
    }
  }

  async function handlePasswordChange(id: string, password: string) {
    setPending(true);
    setError(null);
    try {
      await editUser(id, { password });
      setEditing(null);
    } catch (err) {
      if (err instanceof Error && err.message === "Request failed." && (err as any).status === 401) {
        onExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPending(false);
    }
  }

  async function handleRoleChange(id: string, role: "admin" | "operator") {
    setPending(true);
    setError(null);
    try {
      await editUser(id, { role });
      setUsers(current => current.map(user => user.id === id ? { ...user, role } : user));
      setEditing(null);
    } catch (err) {
      if (err instanceof Error && err.message === "Request failed." && (err as any).status === 401) {
        onExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to change role");
    } finally {
      setPending(false);
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    setPending(true);
    setError(null);
    try {
      await editUser(id, { isActive });
      setUsers(current => current.map(user => user.id === id ? { ...user, isActive } : user));
    } catch (err) {
      if (err instanceof Error && err.message === "Request failed." && (err as any).status === 401) {
        onExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to toggle user");
    } finally {
      setPending(false);
    }
  }

  async function handleCreate(data: CreateUserRequest) {
    setPending(true);
    setError(null);
    try {
      const user = await createUser(data);
      setUsers(current => [...current, user].sort((a, b) => a.username.localeCompare(b.username)));
      setShowCreateForm(false);
    } catch (err) {
      if (err instanceof Error && err.message === "Request failed." && (err as any).status === 401) {
        onExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <div>Loading users...</div>;
  }

  return (
    <div>
      <h2>User Management</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button onClick={() => setShowCreateForm(true)} disabled={pending}>Create User</button>
      {showCreateForm && (
        <CreateUserForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreateForm(false)}
          pending={pending}
        />
      )}
      <ul>
        {users.map(user => (
          <li key={user.id}>
            <strong>{user.username}</strong> ({user.role})
            {editing === user.id ? (
              <div>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const formData = new FormData(form);
                    const fullName = formData.get("fullName") as string;
                    if (fullName) void handleRename(user.id, fullName);
                  }}
                >
                  <input name="fullName" defaultValue={user.fullName} placeholder="Full name" required disabled={pending} />
                  <button type="submit" disabled={pending}>Rename</button>
                </form>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const formData = new FormData(form);
                    const email = formData.get("email") as string;
                    if (email) void handleEmailChange(user.id, email);
                  }}
                >
                  <input name="email" type="email" defaultValue={user.email} placeholder="Email" required disabled={pending} />
                  <button type="submit" disabled={pending}>Change Email</button>
                </form>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const formData = new FormData(form);
                    const password = formData.get("password") as string;
                    if (password) void handlePasswordChange(user.id, password);
                  }}
                >
                  <input name="password" type="password" placeholder="New password" required minLength={8} disabled={pending} />
                  <button type="submit" disabled={pending}>Change Password</button>
                </form>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const formData = new FormData(form);
                    const role = formData.get("role") as "admin" | "operator";
                    void handleRoleChange(user.id, role);
                  }}
                >
                  <select name="role" defaultValue={user.role} disabled={pending}>
                    <option value="admin">Admin</option>
                    <option value="operator">Operator</option>
                  </select>
                  <button type="submit" disabled={pending}>Change Role</button>
                </form>
                <button type="button" onClick={() => setEditing(null)} disabled={pending}>Cancel</button>
              </div>
            ) : (
              <>
                {" "}
                <span>{user.fullName}</span>
                {" "}
                <span>{user.email}</span>
                {" "}
                <button onClick={() => setEditing(user.id)} disabled={pending}>Edit</button>
                {" "}
                <button onClick={() => void handleToggleActive(user.id, !user.isActive)} disabled={pending}>
                  {user.isActive ? "Deactivate" : "Activate"}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateUserForm({ onSubmit, onCancel, pending }: {
  onSubmit: (data: CreateUserRequest) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        const data: CreateUserRequest = {
          username: formData.get("username") as string,
          fullName: formData.get("fullName") as string,
          email: formData.get("email") as string,
          password: formData.get("password") as string,
          role: formData.get("role") as "admin" | "operator"
        };
        onSubmit(data);
      }}
    >
      <input name="username" placeholder="Username" required minLength={3} maxLength={40} disabled={pending} />
      <input name="fullName" placeholder="Full name" required disabled={pending} />
      <input name="email" type="email" placeholder="Email" required disabled={pending} />
      <input name="password" type="password" placeholder="Password" required minLength={8} disabled={pending} />
      <select name="role" disabled={pending}>
        <option value="operator">Operator</option>
        <option value="admin">Admin</option>
      </select>
      <button type="submit" disabled={pending}>Create</button>
      <button type="button" onClick={onCancel} disabled={pending}>Cancel</button>
    </form>
  );
}
