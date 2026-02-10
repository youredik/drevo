import { join } from "path";
import { existsSync, readFileSync } from "fs";
import mime from "mime-types";
import { DataRepository } from "./shared/data-repository.js";
import { initUsers, authenticate, verifyToken, getUsers } from "./shared/auth.js";

// ─── Paths ──────────────────────────────────────────────
const DATA_DIR = join(__dirname, "data");
const CSV_PATH = join(DATA_DIR, "fam.csv");
const FAV_PATH = join(DATA_DIR, "fav.csv");
const INFO_PATH = join(DATA_DIR, "info");
const MEDIA_PATH = process.env.MEDIA_PATH || "/function/storage/media";

// ─── Lazy init (cold start) ────────────────────────────
let repo: DataRepository | null = null;

async function init(): Promise<DataRepository> {
  if (repo) return repo;
  repo = new DataRepository(CSV_PATH, FAV_PATH, MEDIA_PATH, INFO_PATH);
  await initUsers();
  return repo;
}

// ─── Types ──────────────────────────────────────────────
interface YcEvent {
  httpMethod: string;
  url: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

interface YcResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

// ─── CORS headers ───────────────────────────────────────
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): YcResponse {
  return {
    statusCode: status,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify(data),
    isBase64Encoded: false,
  };
}

function binary(data: Buffer, contentType: string): YcResponse {
  return {
    statusCode: 200,
    headers: { ...CORS, "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
    body: data.toString("base64"),
    isBase64Encoded: true,
  };
}

function err(msg: string, status: number): YcResponse {
  return json({ error: msg }, status);
}

// ─── Route matcher ──────────────────────────────────────
function matchPath(
  pattern: string,
  path: string
): Record<string, string> | null {
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

// ─── Auth helper ────────────────────────────────────────
function getAuthUser(headers: Record<string, string>): {
  id: string;
  login: string;
  role: string;
} | null {
  const authHeader =
    headers["Authorization"] || headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return verifyToken(authHeader.slice(7));
}

// ─── Handler ────────────────────────────────────────────
export async function handler(
  event: YcEvent,
  _context: unknown
): Promise<YcResponse> {
  const r = await init();
  const method = event.httpMethod;
  const url = event.url || "";
  const query = event.queryStringParameters || {};
  const headers = event.headers || {};

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "", isBase64Encoded: false };
  }

  // Strip /api prefix and query string
  const rawPath = url.split("?")[0];
  const apiPath = rawPath.startsWith("/api") ? rawPath.slice(4) : rawPath;
  let params: Record<string, string> | null;

  // ── GET /persons/:id ──
  if (method === "GET" && (params = matchPath("/persons/:id", apiPath))) {
    const id = parseInt(params.id);
    const card = r.getPersonCard(id);
    return card ? json(card) : err("Человек не найден", 404);
  }

  // ── GET /persons ──
  if (method === "GET" && apiPath === "/persons") {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;
    const all = r.getAllPersons();
    const start = (page - 1) * limit;
    return json({ items: all.slice(start, start + limit), total: all.length, page, limit });
  }

  // ── GET /search ──
  if (method === "GET" && apiPath === "/search") {
    const q = query.q || "";
    const results = r.search(q);
    return json({ results, count: results.length });
  }

  // ── GET /events ──
  if (method === "GET" && apiPath === "/events") {
    const days = parseInt(query.days) || 5;
    const yesterday = query.yesterday !== "false";
    const events = r.getEvents(days, yesterday);
    return json({ events, count: events.length });
  }

  // ── GET /tree/:id ──
  if (method === "GET" && (params = matchPath("/tree/:id", apiPath))) {
    const id = parseInt(params.id);
    const type = query.type || "ancestors";
    const tree = type === "descendants" ? r.getDescendantTree(id) : r.getAncestorTree(id);
    return tree ? json(tree) : err("Человек не найден", 404);
  }

  // ── GET /kinship ──
  if (method === "GET" && apiPath === "/kinship") {
    const id1 = parseInt(query.id1);
    const id2 = parseInt(query.id2);
    if (!id1 || !id2) return err("Укажите id1 и id2", 400);
    const result = r.checkKinship(id1, id2);
    return result ? json(result) : err("Один из людей не найден", 404);
  }

  // ── GET /family/:id ──
  if (method === "GET" && (params = matchPath("/family/:id", apiPath))) {
    const id = parseInt(params.id);
    const members = r.getFamily(id);
    return members.length > 0 ? json({ members }) : err("Человек не найден", 404);
  }

  // ── GET /stats ──
  if (method === "GET" && apiPath === "/stats") {
    return json(r.getStats());
  }

  // ── GET /bio/:id ──
  if (method === "GET" && (params = matchPath("/bio/:id", apiPath))) {
    const id = parseInt(params.id);
    const type = query.type === "lock" ? "lock" : "open";
    const bio = r.getBio(id, type);
    return bio !== null ? json({ text: bio }) : err("Биография не найдена", 404);
  }

  // ── GET /favorites ──
  if (method === "GET" && apiPath === "/favorites") {
    const favIds = r.getFavorites();
    const persons = favIds.map((id) => r.getPersonCard(id)).filter((p) => p !== null);
    return json({ favorites: persons });
  }

  // ── GET /media/:filename ──
  if (method === "GET" && apiPath.startsWith("/media/")) {
    const filename = decodeURIComponent(apiPath.slice(7));
    const filePath = join(MEDIA_PATH, filename);
    if (!existsSync(filePath)) return err("Файл не найден", 404);
    const contentType = (mime.lookup(filename) as string) || "application/octet-stream";
    const data = readFileSync(filePath);
    return binary(data, contentType);
  }

  // ── GET /info ──
  if (method === "GET" && apiPath === "/info") {
    return json({
      appName: "Drevo",
      personCount: r.getPersonCount(),
      version: "1.0.0",
      dataCollectionDate: "03.11.2025",
      telegramLink: "https://t.me/+XWBtysLh4jtmYzcy",
    });
  }

  // ── POST /auth/login ──
  if (method === "POST" && apiPath === "/auth/login") {
    let body: { login?: string; password?: string } = {};
    try {
      body = event.body
        ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body)
        : {};
    } catch {
      return err("Некорректный JSON", 400);
    }
    if (!body.login || !body.password) return err("Укажите login и password", 400);
    const result = await authenticate(body.login, body.password);
    return result ? json(result) : err("Неверный логин или пароль", 401);
  }

  // ── GET /auth/me ──
  if (method === "GET" && apiPath === "/auth/me") {
    const user = getAuthUser(headers);
    if (!user) return err("Требуется авторизация", 401);
    return json({ user });
  }

  // ── GET /admin/users ──
  if (method === "GET" && apiPath === "/admin/users") {
    const user = getAuthUser(headers);
    if (!user) return err("Требуется авторизация", 401);
    const roleHierarchy: Record<string, number> = { admin: 3, manager: 2, viewer: 1 };
    if ((roleHierarchy[user.role] || 0) < 3) return err("Недостаточно прав", 403);
    return json({ users: getUsers() });
  }

  // ── 404 ──
  return err("Маршрут не найден", 404);
}
