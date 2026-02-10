"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "./api";

interface User {
  id: string;
  login: string;
  role: "admin" | "manager" | "viewer";
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
  canEdit: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => {},
  logout: () => {},
  canEdit: false,
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("drevo_token");
    if (token) {
      api
        .getMe()
        .then((data) => setUser(data.user as User))
        .catch(() => localStorage.removeItem("drevo_token"))
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [isLoading, user, pathname, router]);

  const login = useCallback(async (loginStr: string, password: string) => {
    const data = await api.login(loginStr, password);
    localStorage.setItem("drevo_token", data.token);
    setUser(data.user as User);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("drevo_token");
    setUser(null);
  }, []);

  const canEdit = user?.role === "admin" || user?.role === "manager";
  const isAdmin = user?.role === "admin";

  // While redirecting to login, render nothing (avoid flash of content)
  if (!isLoading && !user && pathname !== "/login") {
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, canEdit, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
