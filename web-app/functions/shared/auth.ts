import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { AppUser, AuthResponse } from "./types.js";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "drevo-dev-secret-key-change-in-production";
const TOKEN_EXPIRY = "24h";

// Default users (seeded on first run)
const defaultUsers: Omit<AppUser, "passwordHash">[] = [
  { id: "1", login: "admin", role: "admin", createdAt: new Date().toISOString() },
  { id: "2", login: "manager", role: "manager", createdAt: new Date().toISOString() },
  { id: "3", login: "viewer", role: "viewer", createdAt: new Date().toISOString() },
];

const defaultPasswords: Record<string, string> = {
  admin: "admin123",
  manager: "manager123",
  viewer: "viewer123",
};

// In-memory user store (for dev; in production: YDB)
let users: AppUser[] = [];
let initialized = false;

export async function initUsers(): Promise<void> {
  if (initialized) return;
  users = [];
  for (const u of defaultUsers) {
    const hash = await bcrypt.hash(defaultPasswords[u.login], 10);
    users.push({ ...u, passwordHash: hash });
  }
  initialized = true;
}

export async function authenticate(login: string, password: string): Promise<AuthResponse | null> {
  const user = users.find((u) => u.login === login);
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  const token = jwt.sign({ id: user.id, login: user.login, role: user.role }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });

  return {
    token,
    user: { id: user.id, login: user.login, role: user.role },
  };
}

export function verifyToken(token: string): { id: string; login: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; login: string; role: string };
  } catch {
    return null;
  }
}

// Express middleware
export function authMiddleware(requiredRole?: "admin" | "manager" | "viewer") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Требуется авторизация" });
      return;
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: "Недействительный токен" });
      return;
    }

    if (requiredRole) {
      const roleHierarchy = { admin: 3, manager: 2, viewer: 1 };
      const userLevel = roleHierarchy[payload.role as keyof typeof roleHierarchy] || 0;
      const requiredLevel = roleHierarchy[requiredRole];
      if (userLevel < requiredLevel) {
        res.status(403).json({ error: "Недостаточно прав" });
        return;
      }
    }

    (req as any).user = payload;
    next();
  };
}

export function getUsers(): Omit<AppUser, "passwordHash">[] {
  return users.map(({ passwordHash, ...rest }) => rest);
}
