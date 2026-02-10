const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("drevo_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function mediaUrl(filename: string): string {
  return `${API_BASE}/api/media/${encodeURIComponent(filename)}`;
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

  login: (login: string, password: string) =>
    request<{ token: string; user: { id: string; login: string; role: string } }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ login, password }) }
    ),

  getMe: () => request<{ user: { id: string; login: string; role: string } }>("/api/auth/me"),

  getUsers: () => request<{ users: any[] }>("/api/admin/users"),
};
