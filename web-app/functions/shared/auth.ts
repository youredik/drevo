import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { AppUser, AuthResponse } from "./types.js";
import type { Request, Response, NextFunction } from "express";
import { isYdbConfigured } from "./ydb-client.js";
import { loadUsers as ydbLoadUsers, upsertUser as ydbUpsertUser, deleteUserFromYdb } from "./ydb-repository.js";

const JWT_SECRET = process.env.JWT_SECRET || "drevo-dev-secret-key-change-in-production";
const TOKEN_EXPIRY = "24h";

// Default users (seeded on first run)
const defaultUsers: { login: string; role: AppUser["role"]; password: string }[] = [
  { login: "admin", role: "admin", password: "Drv!Adm_8kX2q" },
  { login: "manager", role: "manager", password: "Drv!Mgr_5pW9n" },
  { login: "viewer", role: "viewer", password: "Drv!Vwr_3tR7m" },
];

// Old passwords for one-time migration
const oldPasswords: Record<string, string> = {
  admin: "admin123",
  manager: "manager123",
  viewer: "viewer123",
};

// In-memory user store
let users: AppUser[] = [];
let initialized = false;

export async function initUsers(): Promise<void> {
  if (initialized) return;

  if (isYdbConfigured()) {
    try {
      users = await ydbLoadUsers();
      if (users.length === 0) {
        console.log("No users in YDB, seeding defaults...");
        for (const u of defaultUsers) {
          const hash = await bcrypt.hash(u.password, 10);
          const user: AppUser = {
            id: String(Date.now() + Math.random()),
            login: u.login,
            passwordHash: hash,
            role: u.role,
            createdAt: new Date().toISOString(),
          };
          await ydbUpsertUser(user);
          users.push(user);
        }
      } else {
        // Migrate default users from old weak passwords to new strong ones
        for (const def of defaultUsers) {
          const user = users.find((u) => u.login === def.login);
          if (!user) continue;
          const oldPw = oldPasswords[def.login];
          if (!oldPw) continue;
          const hasOldPassword = await bcrypt.compare(oldPw, user.passwordHash);
          if (hasOldPassword) {
            console.log(`Migrating password for user: ${def.login}`);
            user.passwordHash = await bcrypt.hash(def.password, 10);
            await ydbUpsertUser(user);
          }
        }
      }
      console.log(`Auth initialized from YDB (${users.length} users)`);
    } catch (e: any) {
      console.error("Failed to load users from YDB, using defaults:", e.message);
      await seedDefaultUsers();
    }
  } else {
    await seedDefaultUsers();
  }

  initialized = true;
}

async function seedDefaultUsers(): Promise<void> {
  users = [];
  for (let i = 0; i < defaultUsers.length; i++) {
    const u = defaultUsers[i];
    const hash = await bcrypt.hash(u.password, 10);
    users.push({
      id: String(i + 1),
      login: u.login,
      passwordHash: hash,
      role: u.role,
      createdAt: new Date().toISOString(),
    });
  }
  console.log("Auth initialized (3 default users)");
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

// ─── User CRUD ──────────────────────────────────────────

export async function createUser(
  login: string,
  password: string,
  role: string
): Promise<Omit<AppUser, "passwordHash"> | null> {
  if (users.find((u) => u.login === login)) return null;

  const hash = await bcrypt.hash(password, 10);
  const user: AppUser = {
    id: String(Date.now()),
    login,
    passwordHash: hash,
    role: role as AppUser["role"],
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  if (isYdbConfigured()) {
    try { await ydbUpsertUser(user); } catch (e) { console.error("YDB upsert user error:", e); }
  }

  const { passwordHash, ...rest } = user;
  return rest;
}

export async function updateUserById(
  id: string,
  updates: { login?: string; password?: string; role?: string }
): Promise<Omit<AppUser, "passwordHash"> | null> {
  const user = users.find((u) => u.id === id);
  if (!user) return null;

  if (updates.login) user.login = updates.login;
  if (updates.role) user.role = updates.role as AppUser["role"];
  if (updates.password) user.passwordHash = await bcrypt.hash(updates.password, 10);

  if (isYdbConfigured()) {
    try { await ydbUpsertUser(user); } catch (e) { console.error("YDB update user error:", e); }
  }

  const { passwordHash, ...rest } = user;
  return rest;
}

export async function deleteUserById(id: string): Promise<boolean> {
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return false;

  users.splice(idx, 1);
  if (isYdbConfigured()) {
    try { await deleteUserFromYdb(id); } catch (e) { console.error("YDB delete user error:", e); }
  }
  return true;
}
