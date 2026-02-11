import { join } from "path";
import { DataRepository } from "./shared/data-repository.js";
import { initUsers } from "./shared/auth.js";
import { isYdbConfigured } from "./shared/ydb-client.js";
import { ensureTables, migrateFromCsv } from "./shared/ydb-schema.js";
import { loadAllFromYdb } from "./shared/ydb-repository.js";
import type { YcEvent, YcResponse, RouteContext } from "./routes/types.js";
import { getAuthUser, err, json } from "./routes/helpers.js";
import { publicRoutes } from "./routes/public.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";

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
      // Optimistic path: skip ensureTables/migrateFromCsv (tables already exist in production)
      const [ydbData] = await Promise.all([
        loadAllFromYdb(),
        initUsers(),
      ]);
      repo = DataRepository.fromData(ydbData.persons, ydbData.favorites, MEDIA_PATH, INFO_PATH);
      useYdb = true;
      console.log(`Loaded ${repo.getPersonCount()} persons from YDB`);
    } catch (e: any) {
      // First deploy or schema change: create tables and migrate
      console.warn("Optimistic load failed, running full init:", e.message);
      try {
        await ensureTables();
        await migrateFromCsv(CSV_PATH, FAV_PATH);
        const [ydbData] = await Promise.all([
          loadAllFromYdb(),
          initUsers(),
        ]);
        repo = DataRepository.fromData(ydbData.persons, ydbData.favorites, MEDIA_PATH, INFO_PATH);
        useYdb = true;
        console.log(`Loaded ${repo.getPersonCount()} persons from YDB (after full init)`);
      } catch (e2: any) {
        console.error("YDB init failed, falling back to CSV:", e2.message);
        repo = new DataRepository(CSV_PATH, FAV_PATH, MEDIA_PATH, INFO_PATH);
        await initUsers();
      }
    }
  } else {
    repo = new DataRepository(CSV_PATH, FAV_PATH, MEDIA_PATH, INFO_PATH);
    await initUsers();
    console.log(`Loaded ${repo.getPersonCount()} persons from CSV`);
  }

  return repo;
}

// ─── CORS headers ───────────────────────────────────────
const ALLOWED_ORIGINS = ["https://nashe-drevo.ru", "https://www.nashe-drevo.ru", "http://localhost:3000"];

function corsHeaders(origin?: string): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

// ─── Handler ────────────────────────────────────────────
export async function handler(event: YcEvent, _context: unknown): Promise<YcResponse> {
  const r = await init();

  // Timer trigger (keep-alive cron) — no HTTP method
  if (!event.httpMethod) {
    return { statusCode: 200, headers: {}, body: '{"status":"warm"}', isBase64Encoded: false };
  }

  const method = event.httpMethod;
  const url = event.url || "";
  const query = event.queryStringParameters || {};
  const headers = event.headers || {};
  const cors = corsHeaders(headers["Origin"] || headers["origin"]);

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "", isBase64Encoded: false };
  }

  const rawPath = url.split("?")[0];
  const apiPath = rawPath.startsWith("/api") ? rawPath.slice(4) : rawPath;

  // Health check / keep-alive (no auth required)
  if (method === "GET" && apiPath === "/ping") {
    return json(cors, { status: "ok", ts: Date.now() });
  }

  // Global auth check (all endpoints except login)
  if (!(method === "POST" && apiPath === "/auth/login")) {
    const authUser = getAuthUser(headers, query);
    if (!authUser) return err(cors, "Требуется авторизация", 401);
  }

  const ctx: RouteContext = { method, apiPath, query, headers, event, repo: r, useYdb, cors };

  const setRepo = (newRepo: DataRepository, ydb: boolean) => {
    repo = newRepo;
    useYdb = ydb;
  };

  try {
    const result =
      await authRoutes(ctx) ||
      await publicRoutes(ctx) ||
      await adminRoutes(ctx, setRepo);

    return result || err(cors, "Маршрут не найден", 404);
  } catch (e: any) {
    console.error("Handler error:", e);
    return err(cors, e.message || "Внутренняя ошибка сервера", 500);
  }
}
