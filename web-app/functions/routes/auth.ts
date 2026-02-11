import type { RouteContext, YcResponse } from "./types.js";
import { json, err, parseBody, getAuthUser } from "./helpers.js";
import { authenticate } from "../shared/auth.js";
import { loginSchema, validate } from "./validation.js";

// ─── Rate limiter ────────────────────────────────────
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 min
const LOGIN_MAX_ATTEMPTS = 10;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 5 * 60 * 1000);

// ─── Routes ──────────────────────────────────────────

export async function authRoutes(ctx: RouteContext): Promise<YcResponse | null> {
  const { method, apiPath, headers, cors } = ctx;

  // ── POST /auth/login ──
  if (method === "POST" && apiPath === "/auth/login") {
    const ip = headers["X-Real-Ip"] || headers["x-real-ip"] || headers["X-Forwarded-For"] || headers["x-forwarded-for"] || "unknown";

    if (!checkRateLimit(ip)) {
      return err(cors, "Слишком много попыток входа. Попробуйте через 15 минут", 429);
    }

    let raw: unknown;
    try {
      raw = parseBody(ctx.event);
    } catch {
      return err(cors, "Некорректный JSON", 400);
    }
    const parsed = validate(loginSchema, raw);
    if (!parsed.success) return err(cors, parsed.error, 400);
    const result = await authenticate(parsed.data.login, parsed.data.password);
    return result ? json(cors, result) : err(cors, "Неверный логин или пароль", 401);
  }

  // ── GET /auth/me ──
  if (method === "GET" && apiPath === "/auth/me") {
    const user = getAuthUser(headers);
    if (!user) return err(cors, "Требуется авторизация", 401);
    return json(cors, { user });
  }

  return null;
}
