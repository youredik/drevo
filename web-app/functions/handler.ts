import { join } from "path";
import { existsSync, readFileSync } from "fs";
import mime from "mime-types";
import { DataRepository } from "./shared/data-repository.js";
import {
  initUsers, authenticate, verifyToken, getUsers,
  createUser, updateUserById, deleteUserById,
} from "./shared/auth.js";
import { isYdbConfigured } from "./shared/ydb-client.js";
import { ensureTables, migrateFromCsv } from "./shared/ydb-schema.js";
import { loadAllFromYdb, upsertPerson, deletePerson as ydbDeletePerson, addSpouse, removeSpouse, addChild, removeChild, loadConfig, setConfigValue } from "./shared/ydb-repository.js";
import type { Person, PersonFormData } from "./shared/types.js";

// ─── Paths ──────────────────────────────────────────────
const DATA_DIR = join(__dirname, "data");
const CSV_PATH = join(DATA_DIR, "fam.csv");
const FAV_PATH = join(DATA_DIR, "fav.csv");
const INFO_PATH = join(DATA_DIR, "info");
const MEDIA_PATH = process.env.MEDIA_PATH || "/function/storage/media";

// ─── Lazy init (cold start) ────────────────────────────
let repo: DataRepository | null = null;
let useYdb = false;

async function init(): Promise<DataRepository> {
  if (repo) return repo;

  if (isYdbConfigured()) {
    try {
      console.log("YDB configured, connecting...");
      await ensureTables();

      // Try migration if YDB is empty
      await migrateFromCsv(CSV_PATH, FAV_PATH);

      // Load from YDB into memory
      const { persons, favorites } = await loadAllFromYdb();
      repo = DataRepository.fromData(persons, favorites, MEDIA_PATH, INFO_PATH);
      useYdb = true;
      console.log(`Loaded ${repo.getPersonCount()} persons from YDB`);
    } catch (e: any) {
      console.error("YDB init failed, falling back to CSV:", e.message);
      repo = new DataRepository(CSV_PATH, FAV_PATH, MEDIA_PATH, INFO_PATH);
    }
  } else {
    repo = new DataRepository(CSV_PATH, FAV_PATH, MEDIA_PATH, INFO_PATH);
    console.log(`Loaded ${repo.getPersonCount()} persons from CSV`);
  }

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
function matchPath(pattern: string, path: string): Record<string, string> | null {
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

// ─── Auth helpers ───────────────────────────────────────
function getAuthUser(headers: Record<string, string>): { id: string; login: string; role: string } | null {
  const authHeader = headers["Authorization"] || headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return verifyToken(authHeader.slice(7));
}

const roleHierarchy: Record<string, number> = { admin: 3, manager: 2, viewer: 1 };

function requireRole(headers: Record<string, string>, minRole: "admin" | "manager"): { user: any } | YcResponse {
  const user = getAuthUser(headers);
  if (!user) return err("Требуется авторизация", 401);
  const minLevel = roleHierarchy[minRole];
  if ((roleHierarchy[user.role] || 0) < minLevel) return err("Недостаточно прав", 403);
  return { user };
}

function parseBody<T>(event: YcEvent): T {
  if (!event.body) return {} as T;
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
  return JSON.parse(raw);
}

// ─── Handler ────────────────────────────────────────────
export async function handler(event: YcEvent, _context: unknown): Promise<YcResponse> {
  const r = await init();
  const method = event.httpMethod;
  const url = event.url || "";
  const query = event.queryStringParameters || {};
  const headers = event.headers || {};

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "", isBase64Encoded: false };
  }

  const rawPath = url.split("?")[0];
  const apiPath = rawPath.startsWith("/api") ? rawPath.slice(4) : rawPath;
  let params: Record<string, string> | null;

  try {
    // ════════════════════════════════════════════════════
    // PUBLIC API
    // ════════════════════════════════════════════════════

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
        body = parseBody(event);
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

    // ════════════════════════════════════════════════════
    // ADMIN API
    // ════════════════════════════════════════════════════

    // ── POST /admin/persons — Create person ──
    if (method === "POST" && apiPath === "/admin/persons") {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const body = parseBody<PersonFormData>(event);
      if (!body.firstName && !body.lastName) return err("Укажите имя или фамилию", 400);

      const id = r.getNextId();
      const person: Person = {
        id,
        sex: body.sex ?? 1,
        firstName: body.firstName || "",
        lastName: body.lastName || "",
        fatherId: body.fatherId || 0,
        motherId: body.motherId || 0,
        birthPlace: body.birthPlace || "",
        birthDay: body.birthDay || "",
        deathPlace: body.deathPlace || "",
        deathDay: body.deathDay || "",
        address: body.address || "",
        spouseIds: [],
        childrenIds: [],
        orderByDad: body.orderByDad || 0,
        orderByMom: body.orderByMom || 0,
        orderBySpouse: body.orderBySpouse || 0,
        marryDay: body.marryDay || "",
      };

      r.addPerson(person);

      // Set parents (add to parent's children list)
      if (person.fatherId) r.addChildRelation(person.fatherId, id);
      if (person.motherId) r.addChildRelation(person.motherId, id);

      if (useYdb) await upsertPerson(person);
      return json({ person }, 201);
    }

    // ── PUT /admin/persons/:id — Update person ──
    if (method === "PUT" && (params = matchPath("/admin/persons/:id", apiPath))) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const id = parseInt(params.id);
      const body = parseBody<Partial<PersonFormData>>(event);

      const existing = r.getPerson(id);
      if (!existing) return err("Человек не найден", 404);

      // Handle parent changes
      const oldFatherId = existing.fatherId;
      const oldMotherId = existing.motherId;
      const newFatherId = body.fatherId !== undefined ? body.fatherId : oldFatherId;
      const newMotherId = body.motherId !== undefined ? body.motherId : oldMotherId;

      if (newFatherId !== oldFatherId || newMotherId !== oldMotherId) {
        r.setParents(id, newFatherId || 0, newMotherId || 0);
      }

      const updated = r.updatePerson(id, {
        ...(body.sex !== undefined && { sex: body.sex }),
        ...(body.firstName !== undefined && { firstName: body.firstName }),
        ...(body.lastName !== undefined && { lastName: body.lastName }),
        ...(body.birthPlace !== undefined && { birthPlace: body.birthPlace }),
        ...(body.birthDay !== undefined && { birthDay: body.birthDay }),
        ...(body.deathPlace !== undefined && { deathPlace: body.deathPlace }),
        ...(body.deathDay !== undefined && { deathDay: body.deathDay }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.orderByDad !== undefined && { orderByDad: body.orderByDad }),
        ...(body.orderByMom !== undefined && { orderByMom: body.orderByMom }),
        ...(body.orderBySpouse !== undefined && { orderBySpouse: body.orderBySpouse }),
        ...(body.marryDay !== undefined && { marryDay: body.marryDay }),
        fatherId: newFatherId || 0,
        motherId: newMotherId || 0,
      });

      if (useYdb && updated) await upsertPerson(updated);
      return json({ person: updated });
    }

    // ── DELETE /admin/persons/:id — Delete person ──
    if (method === "DELETE" && (params = matchPath("/admin/persons/:id", apiPath))) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const id = parseInt(params.id);
      if (!r.getPerson(id)) return err("Человек не найден", 404);

      r.removePerson(id);
      if (useYdb) await ydbDeletePerson(id);
      return json({ deleted: true });
    }

    // ── POST /admin/persons/:id/spouse — Add spouse ──
    if (method === "POST" && (params = matchPath("/admin/persons/:id/spouse", apiPath))) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const id = parseInt(params.id);
      const body = parseBody<{ spouseId: number }>(event);
      if (!body.spouseId) return err("Укажите spouseId", 400);
      if (!r.getPerson(id) || !r.getPerson(body.spouseId)) return err("Человек не найден", 404);

      r.addSpouseRelation(id, body.spouseId);
      if (useYdb) await addSpouse(id, body.spouseId);
      return json({ ok: true });
    }

    // ── DELETE /admin/persons/:id/spouse/:sid — Remove spouse ──
    if (method === "DELETE" && (params = matchPath("/admin/persons/:id/spouse/:sid", apiPath))) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const id = parseInt(params.id);
      const sid = parseInt(params.sid);
      r.removeSpouseRelation(id, sid);
      if (useYdb) await removeSpouse(id, sid);
      return json({ ok: true });
    }

    // ── POST /admin/persons/:id/child — Add child ──
    if (method === "POST" && (params = matchPath("/admin/persons/:id/child", apiPath))) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const id = parseInt(params.id);
      const body = parseBody<{ childId: number }>(event);
      if (!body.childId) return err("Укажите childId", 400);
      if (!r.getPerson(id) || !r.getPerson(body.childId)) return err("Человек не найден", 404);

      r.addChildRelation(id, body.childId);
      if (useYdb) await addChild(id, body.childId);
      return json({ ok: true });
    }

    // ── DELETE /admin/persons/:id/child/:cid — Remove child ──
    if (method === "DELETE" && (params = matchPath("/admin/persons/:id/child/:cid", apiPath))) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const id = parseInt(params.id);
      const cid = parseInt(params.cid);
      r.removeChildRelation(id, cid);
      if (useYdb) await removeChild(id, cid);
      return json({ ok: true });
    }

    // ── POST /admin/persons/:id/parent — Set parents ──
    if (method === "POST" && (params = matchPath("/admin/persons/:id/parent", apiPath))) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const id = parseInt(params.id);
      const body = parseBody<{ fatherId?: number; motherId?: number }>(event);
      if (!r.getPerson(id)) return err("Человек не найден", 404);

      r.setParents(id, body.fatherId || 0, body.motherId || 0);
      const person = r.getPerson(id)!;
      if (useYdb) await upsertPerson(person);
      return json({ person });
    }

    // ── POST /admin/persons/:id/photo — Upload photo ──
    if (method === "POST" && (params = matchPath("/admin/persons/:id/photo", apiPath))) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const id = parseInt(params.id);
      if (!r.getPerson(id)) return err("Человек не найден", 404);

      const body = parseBody<{ data: string; filename?: string }>(event);
      if (!body.data) return err("Укажите data (base64)", 400);

      const imageData = Buffer.from(body.data, "base64");
      const filename = r.addPhoto(id, imageData, body.filename);
      return json({ filename, photos: r.getPhotos(id) });
    }

    // ── DELETE /admin/persons/:id/photo/:fn — Delete photo ──
    if (method === "DELETE" && apiPath.startsWith("/admin/persons/") && apiPath.includes("/photo/")) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const parts = apiPath.split("/");
      // /admin/persons/42/photo/42%230.jpg
      const id = parseInt(parts[3]);
      const fn = decodeURIComponent(parts[5]);
      if (!r.getPerson(id)) return err("Человек не найден", 404);

      const deleted = r.deletePhoto(id, fn);
      if (!deleted) return err("Фото не найдено", 404);
      return json({ deleted: true, photos: r.getPhotos(id) });
    }

    // ── PUT /admin/bio/:id — Save biography ──
    if (method === "PUT" && (params = matchPath("/admin/bio/:id", apiPath))) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const id = parseInt(params.id);
      if (!r.getPerson(id)) return err("Человек не найден", 404);

      const body = parseBody<{ type: "open" | "lock"; text: string }>(event);
      if (!body.type || body.text === undefined) return err("Укажите type и text", 400);

      r.setBio(id, body.type, body.text);
      return json({ saved: true });
    }

    // ── DELETE /admin/bio/:id — Delete biography ──
    if (method === "DELETE" && (params = matchPath("/admin/bio/:id", apiPath))) {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;

      const id = parseInt(params.id);
      const body = parseBody<{ type: "open" | "lock" }>(event);
      r.deleteBio(id, body.type || "open");
      return json({ deleted: true });
    }

    // ── GET /admin/users — List users ──
    if (method === "GET" && apiPath === "/admin/users") {
      const auth = requireRole(headers, "admin");
      if ("statusCode" in auth) return auth;
      return json({ users: getUsers() });
    }

    // ── POST /admin/users — Create user ──
    if (method === "POST" && apiPath === "/admin/users") {
      const auth = requireRole(headers, "admin");
      if ("statusCode" in auth) return auth;

      const body = parseBody<{ login: string; password: string; role: string }>(event);
      if (!body.login || !body.password || !body.role) return err("Укажите login, password и role", 400);

      const user = await createUser(body.login, body.password, body.role);
      if (!user) return err("Пользователь с таким логином уже существует", 409);
      return json({ user }, 201);
    }

    // ── PUT /admin/users/:id — Update user ──
    if (method === "PUT" && (params = matchPath("/admin/users/:id", apiPath))) {
      const auth = requireRole(headers, "admin");
      if ("statusCode" in auth) return auth;

      const id = params.id;
      const body = parseBody<{ login?: string; password?: string; role?: string }>(event);
      const user = await updateUserById(id, body);
      if (!user) return err("Пользователь не найден", 404);
      return json({ user });
    }

    // ── DELETE /admin/users/:id — Delete user ──
    if (method === "DELETE" && (params = matchPath("/admin/users/:id", apiPath))) {
      const auth = requireRole(headers, "admin");
      if ("statusCode" in auth) return auth;

      const deleted = await deleteUserById(params.id);
      if (!deleted) return err("Пользователь не найден", 404);
      return json({ deleted: true });
    }

    // ── GET /admin/config — Get app config ──
    if (method === "GET" && apiPath === "/admin/config") {
      const auth = requireRole(headers, "admin");
      if ("statusCode" in auth) return auth;

      if (useYdb) {
        const config = await loadConfig();
        return json({ config });
      }
      return json({ config: {} });
    }

    // ── PUT /admin/config — Update app config ──
    if (method === "PUT" && apiPath === "/admin/config") {
      const auth = requireRole(headers, "admin");
      if ("statusCode" in auth) return auth;

      const body = parseBody<Record<string, string>>(event);
      if (useYdb) {
        for (const [key, value] of Object.entries(body)) {
          await setConfigValue(key, String(value));
        }
      }
      return json({ saved: true });
    }

    // ── GET /admin/validate — Data validation ──
    if (method === "GET" && apiPath === "/admin/validate") {
      const auth = requireRole(headers, "manager");
      if ("statusCode" in auth) return auth;
      return json(r.validate());
    }

    // ── GET /admin/export — Export CSV ──
    if (method === "GET" && apiPath === "/admin/export") {
      const auth = requireRole(headers, "admin");
      if ("statusCode" in auth) return auth;

      const csv = r.exportToCsv();
      return {
        statusCode: 200,
        headers: {
          ...CORS,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=drevo-export.csv",
        },
        body: csv,
        isBase64Encoded: false,
      };
    }

    // ── POST /admin/import — Import CSV ──
    if (method === "POST" && apiPath === "/admin/import") {
      const auth = requireRole(headers, "admin");
      if ("statusCode" in auth) return auth;

      const body = parseBody<{ data: string }>(event);
      if (!body.data) return err("Укажите data (base64 CSV)", 400);

      // This would require re-parsing CSV and reinitializing — complex operation
      // For now, only supported with YDB (re-migrate)
      return err("Импорт CSV через API пока не поддерживается. Используйте миграцию.", 501);
    }

    // ── 404 ──
    return err("Маршрут не найден", 404);

  } catch (e: any) {
    console.error("Handler error:", e);
    return err(e.message || "Внутренняя ошибка сервера", 500);
  }
}
