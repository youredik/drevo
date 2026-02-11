import { join, resolve } from "path";
import { existsSync, readFileSync } from "fs";
import mime from "mime-types";
import type { RouteContext, YcResponse } from "./types.js";
import { json, binary, err, matchPath, parseBody } from "./helpers.js";
import { upsertFavorite, deleteFavoriteBySlot } from "../shared/ydb-repository.js";
import { validate, favoriteSchema } from "./validation.js";

const MEDIA_PATH = process.env.MEDIA_PATH || "/function/storage/media";

export async function publicRoutes(ctx: RouteContext): Promise<YcResponse | null> {
  const { method, apiPath, query, cors, repo, useYdb } = ctx;
  let params: Record<string, string> | null;

  // ── GET /persons/:id ──
  if (method === "GET" && (params = matchPath("/persons/:id", apiPath))) {
    const id = parseInt(params.id);
    const card = repo.getPersonCard(id);
    return card ? json(cors, card) : err(cors, "Человек не найден", 404);
  }

  // ── GET /persons ──
  if (method === "GET" && apiPath === "/persons") {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;
    const all = repo.getAllPersons();
    const start = (page - 1) * limit;
    return json(cors, { items: all.slice(start, start + limit), total: all.length, page, limit });
  }

  // ── GET /search ──
  if (method === "GET" && apiPath === "/search") {
    const q = query.q || "";
    const results = repo.search(q);
    return json(cors, { results, count: results.length });
  }

  // ── GET /events ──
  if (method === "GET" && apiPath === "/events") {
    const days = parseInt(query.days) || 5;
    const yesterday = query.yesterday !== "false";
    const events = repo.getEvents(days, yesterday);
    return json(cors, { events, count: events.length });
  }

  // ── GET /tree/:id ──
  if (method === "GET" && (params = matchPath("/tree/:id", apiPath))) {
    const id = parseInt(params.id);
    const type = query.type || "ancestors";
    const tree = type === "descendants" ? repo.getDescendantTree(id) : repo.getAncestorTree(id);
    return tree ? json(cors, tree) : err(cors, "Человек не найден", 404);
  }

  // ── GET /kinship ──
  if (method === "GET" && apiPath === "/kinship") {
    const id1 = parseInt(query.id1);
    const id2 = parseInt(query.id2);
    if (!id1 || !id2) return err(cors, "Укажите id1 и id2", 400);
    const result = repo.checkKinship(id1, id2);
    return result ? json(cors, result) : err(cors, "Один из людей не найден", 404);
  }

  // ── GET /family/:id ──
  if (method === "GET" && (params = matchPath("/family/:id", apiPath))) {
    const id = parseInt(params.id);
    const members = repo.getFamily(id);
    return members.length > 0 ? json(cors, { members }) : err(cors, "Человек не найден", 404);
  }

  // ── GET /stats ──
  if (method === "GET" && apiPath === "/stats") {
    return json(cors, repo.getStats());
  }

  // ── GET /bio/:id ──
  if (method === "GET" && (params = matchPath("/bio/:id", apiPath))) {
    const id = parseInt(params.id);
    const type = query.type === "lock" ? "lock" : "open";
    const bio = repo.getBio(id, type);
    return bio !== null ? json(cors, { text: bio }) : err(cors, "Биография не найдена", 404);
  }

  // ── GET /favorites ──
  if (method === "GET" && apiPath === "/favorites") {
    const favIds = repo.getFavorites();
    const persons = favIds.map((id) => repo.getPersonCard(id)).filter((p) => p !== null);
    return json(cors, { favorites: persons });
  }

  // ── POST /favorites ──
  if (method === "POST" && apiPath === "/favorites") {
    const parsed = validate(favoriteSchema, parseBody(ctx.event));
    if (!parsed.success) return err(cors, parsed.error, 400);
    const body = parsed.data;
    if (!repo.getPerson(body.personId)) return err(cors, "Человек не найден", 404);
    const slot = repo.addFavorite(body.personId);
    if (slot < 0) return err(cors, "Избранное заполнено (макс. 20)", 400);
    if (useYdb) await upsertFavorite(slot, body.personId);
    return json(cors, { slot, personId: body.personId });
  }

  // ── DELETE /favorites/:personId ──
  if (method === "DELETE" && (params = matchPath("/favorites/:personId", apiPath))) {
    const personId = parseInt(params.personId);
    const slot = repo.removeFavorite(personId);
    if (slot >= 0 && useYdb) await deleteFavoriteBySlot(slot);
    return json(cors, { removed: slot >= 0 });
  }

  // ── GET /favorites/check/:personId ──
  if (method === "GET" && (params = matchPath("/favorites/check/:personId", apiPath))) {
    const personId = parseInt(params.personId);
    return json(cors, { isFavorite: repo.isFavorite(personId) });
  }

  // ── GET /media/:filename ──
  if (method === "GET" && apiPath.startsWith("/media/")) {
    const filename = decodeURIComponent(apiPath.slice(7));
    const filePath = resolve(MEDIA_PATH, filename);
    // Prevent path traversal
    if (!filePath.startsWith(resolve(MEDIA_PATH))) return err(cors, "Недопустимый путь", 400);
    if (!existsSync(filePath)) return err(cors, "Файл не найден", 404);
    const contentType = (mime.lookup(filename) as string) || "application/octet-stream";
    const data = readFileSync(filePath);
    return binary(cors, data, contentType);
  }

  // ── GET /info ──
  if (method === "GET" && apiPath === "/info") {
    return json(cors, {
      appName: "Drevo",
      personCount: repo.getPersonCount(),
      version: "1.0.0",
      dataCollectionDate: "03.11.2025",
      telegramLink: "https://t.me/+XWBtysLh4jtmYzcy",
    });
  }

  return null;
}
