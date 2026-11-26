export type Profile = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: "admin" | "operator";
};

export type Movement = {
  id: string;
  locationId: string;
  locationName: string;
  userName: string;
  recordedAt: string;
};

export type SessionData = { profile: Profile; lastMovement: Movement | null };
export type HistoryPage = { items: Movement[]; nextCursor: string | null };
export type Location = { id: string; name: string; isActive: boolean };

export class ApiFailure extends Error {
  constructor(public readonly status: number) {
    super("Request failed.");
  }
}

async function request<T>(path: string, options: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<T> {
  const response = await fetcher(path, { ...options, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new ApiFailure(response.status);
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function login(username: string, password: string, fetcher?: typeof fetch) {
  return request<{ profile: Profile }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-apa-csrf": "1" },
    body: JSON.stringify({ username, password })
  }, fetcher);
}

export function loadMe(fetcher?: typeof fetch) {
  return request<SessionData>("/api/me", {}, fetcher);
}

export function loadHistory(cursor?: string, fetcher?: typeof fetch) {
  const path = cursor ? `/api/movements?${new URLSearchParams({ cursor })}` : "/api/movements";
  return request<HistoryPage>(path, {}, fetcher);
}

export function logout(fetcher?: typeof fetch) {
  return request<void>("/api/auth/logout", {
    method: "POST", headers: { "x-apa-csrf": "1" }
  }, fetcher);
}

export function listLocations(fetcher?: typeof fetch) {
  return request<{ items: Location[] }>("/api/admin/locations", {}, fetcher);
}

export function createLocation(name: string, fetcher?: typeof fetch) {
  return request<Location>("/api/admin/locations", {
    method: "POST", headers: { "content-type": "application/json", "x-apa-csrf": "1" },
    body: JSON.stringify({ name })
  }, fetcher);
}

export function editLocation(id: string, changes: { name?: string; isActive?: boolean }, fetcher?: typeof fetch) {
  return request<Location>(`/api/admin/locations/${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { "content-type": "application/json", "x-apa-csrf": "1" },
    body: JSON.stringify(changes)
  }, fetcher);
}

export async function downloadLocationQR(id: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`/api/admin/locations/${encodeURIComponent(id)}/qr`, {
    credentials: "same-origin", cache: "no-store"
  });
  if (!response.ok) throw new ApiFailure(response.status);
  if (response.headers.get("content-type")?.split(";")[0] !== "image/png") throw new ApiFailure(503);
  return response.blob();
}
