const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("drevo_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && token) {
      localStorage.removeItem("drevo_token");
      window.location.href = "/login";
      throw new Error("Сессия истекла");
    }
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function requestText(path: string): Promise<string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("drevo_token") : null;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && token) {
      localStorage.removeItem("drevo_token");
      window.location.href = "/login";
      throw new Error("Сессия истекла");
    }
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.text();
}

export function mediaUrl(filename: string): string {
  const token = typeof window !== "undefined" ? localStorage.getItem("drevo_token") : null;
  const base = `${API_BASE}/api/media/${encodeURIComponent(filename)}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

// ─── API functions ────────────────────────────────────

export const api = {
  getInfo: () => request<{
    appName: string;
    personCount: number;
    version: string;
    dataCollectionDate: string;
    telegramLink: string;
  }>("/api/info"),

  getPerson: (id: number) => request<{
    person: any;
    father: any;
    mother: any;
    spouses: any[];
    children: any[];
    photos: string[];
    age: string;
    zodiac: string;
    hasBio: boolean;
    hasLockedBio: boolean;
  }>(`/api/persons/${id}`),

  getPersons: (page = 1, limit = 50) =>
    request<{ items: any[]; total: number; page: number; limit: number }>(
      `/api/persons?page=${page}&limit=${limit}`
    ),

  search: (q: string) =>
    request<{ results: any[]; count: number }>(`/api/search?q=${encodeURIComponent(q)}`),

  getEvents: (days = 5, yesterday = true) =>
    request<{ events: any[]; count: number }>(
      `/api/events?days=${days}&yesterday=${yesterday}`
    ),

  getTree: (id: number, type: "ancestors" | "descendants" = "ancestors") =>
    request<any>(`/api/tree/${id}?type=${type}`),

  getKinship: (id1: number, id2: number) =>
    request<any>(`/api/kinship?id1=${id1}&id2=${id2}`),

  getFamily: (id: number) => request<{ members: any[] }>(`/api/family/${id}`),

  getStats: () => request<any>("/api/stats"),

  getBio: (id: number, type: "open" | "lock" = "open") =>
    request<{ text: string }>(`/api/bio/${id}?type=${type}`),

  getFavorites: () => request<{ favorites: any[] }>("/api/favorites"),

  addFavorite: (personId: number) =>
    request<{ slot: number; personId: number }>("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ personId }),
    }),

  removeFavorite: (personId: number) =>
    request<{ removed: boolean }>(`/api/favorites/${personId}`, { method: "DELETE" }),

  checkFavorite: (personId: number) =>
    request<{ isFavorite: boolean }>(`/api/favorites/check/${personId}`),

  login: (login: string, password: string) =>
    request<{ token: string; user: { id: string; login: string; role: string } }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ login, password }) }
    ),

  getMe: () => request<{ user: { id: string; login: string; role: string } }>("/api/auth/me"),

  // ─── Admin: Persons ──────────────────────────────────

  createPerson: (data: any) =>
    request<{ person: any }>("/api/admin/persons", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updatePerson: (id: number, data: any) =>
    request<{ person: any }>(`/api/admin/persons/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deletePerson: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/persons/${id}`, { method: "DELETE" }),

  addSpouse: (id: number, spouseId: number) =>
    request<{ ok: boolean }>(`/api/admin/persons/${id}/spouse`, {
      method: "POST",
      body: JSON.stringify({ spouseId }),
    }),

  removeSpouse: (id: number, spouseId: number) =>
    request<{ ok: boolean }>(`/api/admin/persons/${id}/spouse/${spouseId}`, {
      method: "DELETE",
    }),

  addChild: (id: number, childId: number) =>
    request<{ ok: boolean }>(`/api/admin/persons/${id}/child`, {
      method: "POST",
      body: JSON.stringify({ childId }),
    }),

  removeChild: (id: number, childId: number) =>
    request<{ ok: boolean }>(`/api/admin/persons/${id}/child/${childId}`, {
      method: "DELETE",
    }),

  setParents: (id: number, fatherId: number, motherId: number) =>
    request<{ person: any }>(`/api/admin/persons/${id}/parent`, {
      method: "POST",
      body: JSON.stringify({ fatherId, motherId }),
    }),

  uploadPhoto: (id: number, base64: string, filename: string) =>
    request<{ filename: string; photos: string[] }>(`/api/admin/persons/${id}/photo`, {
      method: "POST",
      body: JSON.stringify({ data: base64, filename }),
    }),

  deletePhoto: (id: number, filename: string) =>
    request<{ ok: boolean }>(`/api/admin/persons/${id}/photo/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    }),

  saveBio: (id: number, text: string, type: "open" | "lock" = "open") =>
    request<{ saved: boolean }>(`/api/admin/bio/${id}`, {
      method: "PUT",
      body: JSON.stringify({ type, text }),
    }),

  // ─── Admin: Users ────────────────────────────────────

  getUsers: () => request<{ users: any[] }>("/api/admin/users"),

  createUser: (login: string, password: string, role: string) =>
    request<{ user: any }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ login, password, role }),
    }),

  updateUser: (id: string, data: { login?: string; password?: string; role?: string }) =>
    request<{ user: any }>(`/api/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteUser: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}`, { method: "DELETE" }),

  // ─── Admin: Config ───────────────────────────────────

  getConfig: () => request<{ config: any }>("/api/admin/config"),

  saveConfig: (config: any) =>
    request<{ ok: boolean }>("/api/admin/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  // ─── Admin: Misc ─────────────────────────────────────

  getAuditLogs: (limit = 50) =>
    request<{ logs: any[] }>(`/api/admin/audit-logs?limit=${limit}`),

  validate: () => request<{ issues: any[]; counts: Record<string, number> }>("/api/admin/validate"),

  exportCsv: () => requestText("/api/admin/export"),

  importCsv: (csv: string) =>
    request<{ ok: boolean; count: number }>("/api/admin/import", {
      method: "POST",
      body: JSON.stringify({ csv }),
    }),
};
