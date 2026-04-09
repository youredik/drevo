// Recently viewed persons stored in localStorage as an MRU list of IDs.
// Used by /kinship to suggest a second person quickly.

const KEY = "drevo-recent-persons";
const LEGACY_KEY = "drevo-last-person";
const MAX = 20;

export function addRecentPerson(id: number): void {
  if (typeof window === "undefined") return;
  const list = getRecentPersons();
  const filtered = list.filter((x) => x !== id);
  filtered.unshift(id);
  const trimmed = filtered.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
    // Keep the legacy single-id key in sync for redirect-to-last logic.
    localStorage.setItem(LEGACY_KEY, String(id));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function getRecentPersons(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((n) => typeof n === "number");
    }
    // Migrate from old single-id key.
    const last = localStorage.getItem(LEGACY_KEY);
    return last ? [Number(last)] : [];
  } catch {
    return [];
  }
}
