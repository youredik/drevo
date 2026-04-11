"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

export function DataProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<ClientRepo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBundle = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("drevo_token") : null;
    if (!token) {
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
  };

  useEffect(() => {
    // Wait for auth token to be available
    const check = () => {
      const token = localStorage.getItem("drevo_token");
      if (token) {
        fetchBundle();
      } else {
        // Retry in 500ms — auth might not have completed yet
        setTimeout(check, 500);
      }
    };
    check();
  }, []);

  // Listen for token changes (login/logout)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "drevo_token") {
        if (e.newValue) fetchBundle();
        else setRepo(null);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <DataContext.Provider value={{ repo, loading, error, refetch: fetchBundle }}>
      {children}
    </DataContext.Provider>
  );
}
