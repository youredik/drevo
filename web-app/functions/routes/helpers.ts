import type { YcEvent, YcResponse, RouteContext } from "./types.js";
import { verifyToken } from "../shared/auth.js";
import { insertAuditLog } from "../shared/ydb-repository.js";

export function json(cors: Record<string, string>, data: unknown, status = 200): YcResponse {
  return {
    statusCode: status,
    headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify(data),
    isBase64Encoded: false,
  };
}

export function binary(cors: Record<string, string>, data: Buffer, contentType: string): YcResponse {
  return {
    statusCode: 200,
    headers: { ...cors, "Content-Type": contentType, "Cache-Control": "private, max-age=86400" },
    body: data.toString("base64"),
    isBase64Encoded: true,
  };
}

export function err(cors: Record<string, string>, msg: string, status: number): YcResponse {
  return json(cors, { error: msg }, status);
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patParts = pattern.split("/");
  const pathParts = path.split("/");
  if (patParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(":")) {
      params[patParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export function parseBody<T>(event: YcEvent): T {
  if (!event.body) return {} as T;
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
  return JSON.parse(raw);
}

export function getAuthUser(headers: Record<string, string>, query?: Record<string, string>): { id: string; login: string; role: string } | null {
  const authHeader = headers["Authorization"] || headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    return verifyToken(authHeader.slice(7));
  }
  if (query?.token) {
    return verifyToken(query.token);
  }
  return null;
}

const roleHierarchy: Record<string, number> = { admin: 3, manager: 2, viewer: 1 };

export function requireRole(ctx: RouteContext, minRole: "admin" | "manager"): { user: { id: string; login: string; role: string } } | YcResponse {
  const user = getAuthUser(ctx.headers);
  if (!user) return err(ctx.cors, "Требуется авторизация", 401);
  const minLevel = roleHierarchy[minRole];
  if ((roleHierarchy[user.role] || 0) < minLevel) return err(ctx.cors, "Недостаточно прав", 403);
  return { user };
}

export async function auditLog(useYdb: boolean, user: { id: string; login: string }, action: string, resourceType: string, resourceId: string, details?: string) {
  if (useYdb) {
    try {
      await insertAuditLog({ userId: user.id, userLogin: user.login, action, resourceType, resourceId, details });
    } catch (e) {
      console.error("Audit log failed:", e);
    }
  }
}
