"use client";

import { useEffect, useState } from "react";
import { editUser, listUsers, type AdminUser } from "@/lib/client-api";

type Props = {
  onExpired: () => void;
};

export default function UserManager({ onExpired }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const { items } = await listUsers();
      setUsers(items);
    } catch (err) {
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
      setError(err instanceof Error ? err.message : "Failed to rename user");
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
      setError(err instanceof Error ? err.message : "Failed to toggle user");
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
      <ul>
        {users.map(user => (
          <li key={user.id}>
            <strong>{user.username}</strong> ({user.role})
            {editing === user.id ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const formData = new FormData(form);
                  const fullName = formData.get("fullName") as string;
                  void handleRename(user.id, fullName);
                }}
              >
                <input name="fullName" defaultValue={user.fullName} required disabled={pending} />
                <button type="submit" disabled={pending}>Save</button>
                <button type="button" onClick={() => setEditing(null)} disabled={pending}>Cancel</button>
              </form>
            ) : (
              <>
                {" "}
                <span>{user.fullName}</span>
                {" "}
                <button onClick={() => setEditing(user.id)} disabled={pending}>Rename</button>
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
