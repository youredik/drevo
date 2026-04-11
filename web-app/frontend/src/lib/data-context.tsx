"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { API_BASE } from "./api";
import { ClientRepo, type DataBundle } from "./client-repo";

interface DataContextValue {
  repo: ClientRepo | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const DataContext = createContext<DataContextValue>({ repo: null, loading: true, error: null, refetch: () => {} });

export function useData() {
  return useContext(DataContext);
}

// Custom event for same-tab token changes
const TOKEN_EVENT = "drevo-token-changed";

/** Call this after login/logout to notify DataProvider in the same tab */
export function notifyTokenChanged() {
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

/** Call this after admin mutations to refresh local data */
export function notifyDataChanged() {
  window.dispatchEvent(new Event("drevo-data-changed"));
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<ClientRepo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBundle = useCallback(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("drevo_token") : null;
    if (!token) {
      setRepo(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/data-bundle`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DataBundle>;
      })
      .then(bundle => {
        setRepo(new ClientRepo(bundle));
        setLoading(false);
      })
      .catch(err => {
        console.error("Data bundle fetch failed:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Initial load — only if token exists
  useEffect(() => {
    const token = localStorage.getItem("drevo_token");
    if (token) {
      fetchBundle();
    } else {
      setLoading(false);
    }
  }, [fetchBundle]);

  // Listen for same-tab token changes (login/logout)
  useEffect(() => {
    const onTokenChange = () => {
      const token = localStorage.getItem("drevo_token");
      if (token) fetchBundle();
      else setRepo(null);
    };
    window.addEventListener(TOKEN_EVENT, onTokenChange);
    return () => window.removeEventListener(TOKEN_EVENT, onTokenChange);
  }, [fetchBundle]);

  // Listen for data changes (admin mutations)
  useEffect(() => {
    const onDataChange = () => fetchBundle();
    window.addEventListener("drevo-data-changed", onDataChange);
    return () => window.removeEventListener("drevo-data-changed", onDataChange);
  }, [fetchBundle]);

  // Cross-tab token changes
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "drevo_token") {
        if (e.newValue) fetchBundle();
        else setRepo(null);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [fetchBundle]);

  return (
    <DataContext.Provider value={{ repo, loading, error, refetch: fetchBundle }}>
      {children}
    </DataContext.Provider>
  );
}
