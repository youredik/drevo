import express from "express";
import cors from "cors";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import mime from "mime-types";

import { DataRepository } from "./shared/data-repository.js";
import {
  initUsers, authenticate, authMiddleware, getUsers,
  createUser, updateUserById, deleteUserById,
} from "./shared/auth.js";
import { isYdbConfigured } from "./shared/ydb-client.js";
import { ensureTables, migrateFromCsv } from "./shared/ydb-schema.js";
import { loadAllFromYdb, upsertPerson, deletePerson as ydbDeletePerson, addSpouse, removeSpouse, addChild, removeChild, loadConfig, setConfigValue, upsertFavorite, deleteFavoriteBySlot, insertAuditLog, getAuditLogs } from "./shared/ydb-repository.js";
import type { Person, PersonFormData } from "./shared/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Paths to Android app assets
const ASSETS = join(__dirname, "..", "..", "android-app", "app", "src", "main", "assets");
const CSV_PATH = join(ASSETS, "fam.csv");
const FAV_PATH = join(ASSETS, "fav.csv");
const MEDIA_PATH = join(ASSETS, "images");
const INFO_PATH = join(ASSETS, "info");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ─── Global auth check (all endpoints except login) ──
app.use("/api", (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (req.method === "POST" && req.path === "/auth/login") return next();
  // Support token from query string (for <img src> media URLs)
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  authMiddleware("viewer")(req, res, next);
});

// Initialize data
let repo: DataRepository;
let useYdb = false;

if (isYdbConfigured()) {
  console.log("YDB configured, connecting...");
  try {
    await ensureTables();
    await migrateFromCsv(CSV_PATH, FAV_PATH);
    const { persons, favorites } = await loadAllFromYdb();
    repo = DataRepository.fromData(persons, favorites, MEDIA_PATH, INFO_PATH);
    useYdb = true;
    console.log(`Loaded ${repo.getPersonCount()} persons from YDB`);
  } catch (e: any) {
    console.error("YDB init failed, falling back to CSV:", e.message);
    repo = new DataRepository(CSV_PATH, FAV_PATH, MEDIA_PATH, INFO_PATH);
  }
} else {
  console.log("Loading data from CSV...");
  repo = new DataRepository(CSV_PATH, FAV_PATH, MEDIA_PATH, INFO_PATH);
  console.log(`Loaded ${repo.getPersonCount()} persons`);
}

await initUsers();

// ─── Public API ───────────────────────────────────────

app.get("/api/persons/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const card = repo.getPersonCard(id);
  if (!card) { res.status(404).json({ error: "Человек не найден" }); return; }
  res.json(card);
});

app.get("/api/persons", (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const all = repo.getAllPersons();
  const start = (page - 1) * limit;
  res.json({ items: all.slice(start, start + limit), total: all.length, page, limit });
});

app.get("/api/search", (req, res) => {
  const q = (req.query.q as string) || "";
  res.json({ results: repo.search(q), count: repo.search(q).length });
});

app.get("/api/events", (req, res) => {
  const days = parseInt(req.query.days as string) || 5;
  const yesterday = req.query.yesterday !== "false";
  const events = repo.getEvents(days, yesterday);
  res.json({ events, count: events.length });
});

app.get("/api/tree/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const type = (req.query.type as string) || "ancestors";
  const tree = type === "descendants" ? repo.getDescendantTree(id) : repo.getAncestorTree(id);
  if (!tree) { res.status(404).json({ error: "Человек не найден" }); return; }
  res.json(tree);
});

app.get("/api/kinship", (req, res) => {
  const id1 = parseInt(req.query.id1 as string);
  const id2 = parseInt(req.query.id2 as string);
  if (!id1 || !id2) { res.status(400).json({ error: "Укажите id1 и id2" }); return; }
  const result = repo.checkKinship(id1, id2);
  if (!result) { res.status(404).json({ error: "Один из людей не найден" }); return; }
  res.json(result);
});

app.get("/api/family/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const members = repo.getFamily(id);
  if (members.length === 0) { res.status(404).json({ error: "Человек не найден" }); return; }
  res.json({ members });
});

app.get("/api/stats", (_req, res) => { res.json(repo.getStats()); });

app.get("/api/bio/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const type = (req.query.type as string) === "lock" ? "lock" : "open";
  const bio = repo.getBio(id, type);
  if (bio === null) { res.status(404).json({ error: "Биография не найдена" }); return; }
  res.json({ text: bio });
});

app.get("/api/favorites", (_req, res) => {
  const favIds = repo.getFavorites();
  const persons = favIds.map((id) => repo.getPersonCard(id)).filter((p) => p !== null);
  res.json({ favorites: persons });
});

// ─── Favorites CRUD ──────────────────────────────────

app.post("/api/favorites", async (req, res) => {
  const { personId } = req.body;
  if (!personId) { res.status(400).json({ error: "Укажите personId" }); return; }
  if (!repo.getPerson(personId)) { res.status(404).json({ error: "Человек не найден" }); return; }
  const slot = repo.addFavorite(personId);
  if (slot < 0) { res.status(400).json({ error: "Избранное заполнено (макс. 20)" }); return; }
  if (useYdb) await upsertFavorite(slot, personId);
  res.json({ slot, personId });
});

app.delete("/api/favorites/:personId", async (req, res) => {
  const personId = parseInt(req.params.personId);
  const slot = repo.removeFavorite(personId);
  if (slot >= 0 && useYdb) await deleteFavoriteBySlot(slot);
  res.json({ removed: slot >= 0 });
});

app.get("/api/favorites/check/:personId", (req, res) => {
  const personId = parseInt(req.params.personId);
  res.json({ isFavorite: repo.isFavorite(personId) });
});

app.get("/api/media/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = join(MEDIA_PATH, filename);
  if (!existsSync(filePath)) { res.status(404).json({ error: "Файл не найден" }); return; }
  res.setHeader("Content-Type", mime.lookup(filename) || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(readFileSync(filePath));
});

app.get("/api/info", (_req, res) => {
  res.json({
    appName: "Drevo",
    personCount: repo.getPersonCount(),
    version: "1.0.0",
    dataCollectionDate: "03.11.2025",
    telegramLink: "https://t.me/+XWBtysLh4jtmYzcy",
  });
});

// ─── Auth ─────────────────────────────────────────────

app.post("/api/auth/login", async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) { res.status(400).json({ error: "Укажите login и password" }); return; }
  const result = await authenticate(login, password);
  if (!result) { res.status(401).json({ error: "Неверный логин или пароль" }); return; }
  res.json(result);
});

app.get("/api/auth/me", authMiddleware(), (req, res) => {
  res.json({ user: (req as any).user });
});

// ─── Admin: Persons CRUD ─────────────────────────────

app.post("/api/admin/persons", authMiddleware("manager"), async (req, res) => {
  const body = req.body as PersonFormData;
  if (!body.firstName && !body.lastName) { res.status(400).json({ error: "Укажите имя или фамилию" }); return; }

  const id = repo.getNextId();
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

  repo.addPerson(person);
  if (person.fatherId) repo.addChildRelation(person.fatherId, id);
  if (person.motherId) repo.addChildRelation(person.motherId, id);
  if (useYdb) await upsertPerson(person);

  res.status(201).json({ person });
});

app.put("/api/admin/persons/:id", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  const body = req.body as Partial<PersonFormData>;
  const existing = repo.getPerson(id);
  if (!existing) { res.status(404).json({ error: "Человек не найден" }); return; }

  const newFatherId = body.fatherId !== undefined ? body.fatherId : existing.fatherId;
  const newMotherId = body.motherId !== undefined ? body.motherId : existing.motherId;

  if (newFatherId !== existing.fatherId || newMotherId !== existing.motherId) {
    repo.setParents(id, newFatherId || 0, newMotherId || 0);
  }

  const updated = repo.updatePerson(id, {
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
  res.json({ person: updated });
});

app.delete("/api/admin/persons/:id", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!repo.getPerson(id)) { res.status(404).json({ error: "Человек не найден" }); return; }
  repo.removePerson(id);
  if (useYdb) await ydbDeletePerson(id);
  res.json({ deleted: true });
});

// ─── Admin: Relationships ─────────────────────────────

app.post("/api/admin/persons/:id/spouse", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { spouseId } = req.body;
  if (!spouseId) { res.status(400).json({ error: "Укажите spouseId" }); return; }
  if (!repo.getPerson(id) || !repo.getPerson(spouseId)) { res.status(404).json({ error: "Человек не найден" }); return; }
  repo.addSpouseRelation(id, spouseId);
  if (useYdb) await addSpouse(id, spouseId);
  res.json({ ok: true });
});

app.delete("/api/admin/persons/:id/spouse/:sid", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  const sid = parseInt(req.params.sid);
  repo.removeSpouseRelation(id, sid);
  if (useYdb) await removeSpouse(id, sid);
  res.json({ ok: true });
});

app.post("/api/admin/persons/:id/child", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { childId } = req.body;
  if (!childId) { res.status(400).json({ error: "Укажите childId" }); return; }
  if (!repo.getPerson(id) || !repo.getPerson(childId)) { res.status(404).json({ error: "Человек не найден" }); return; }
  repo.addChildRelation(id, childId);
  if (useYdb) await addChild(id, childId);
  res.json({ ok: true });
});

app.delete("/api/admin/persons/:id/child/:cid", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  const cid = parseInt(req.params.cid);
  repo.removeChildRelation(id, cid);
  if (useYdb) await removeChild(id, cid);
  res.json({ ok: true });
});

app.post("/api/admin/persons/:id/parent", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { fatherId, motherId } = req.body;
  if (!repo.getPerson(id)) { res.status(404).json({ error: "Человек не найден" }); return; }
  repo.setParents(id, fatherId || 0, motherId || 0);
  const person = repo.getPerson(id)!;
  if (useYdb) await upsertPerson(person);
  res.json({ person });
});

// ─── Admin: Photos ────────────────────────────────────

app.post("/api/admin/persons/:id/photo", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!repo.getPerson(id)) { res.status(404).json({ error: "Человек не найден" }); return; }
  const { data, filename } = req.body;
  if (!data) { res.status(400).json({ error: "Укажите data (base64)" }); return; }
  const imageData = Buffer.from(data, "base64");
  const fn = repo.addPhoto(id, imageData, filename);
  res.json({ filename: fn, photos: repo.getPhotos(id) });
});

app.delete("/api/admin/persons/:id/photo/:filename", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  const fn = req.params.filename;
  if (!repo.getPerson(id)) { res.status(404).json({ error: "Человек не найден" }); return; }
  const deleted = repo.deletePhoto(id, fn);
  if (!deleted) { res.status(404).json({ error: "Фото не найдено" }); return; }
  res.json({ deleted: true, photos: repo.getPhotos(id) });
});

// ─── Admin: Biography ─────────────────────────────────

app.put("/api/admin/bio/:id", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!repo.getPerson(id)) { res.status(404).json({ error: "Человек не найден" }); return; }
  const { type, text } = req.body;
  if (!type || text === undefined) { res.status(400).json({ error: "Укажите type и text" }); return; }
  repo.setBio(id, type, text);
  res.json({ saved: true });
});

app.delete("/api/admin/bio/:id", authMiddleware("manager"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { type } = req.body || {};
  repo.deleteBio(id, type || "open");
  res.json({ deleted: true });
});

// ─── Admin: Users ─────────────────────────────────────

app.get("/api/admin/users", authMiddleware("admin"), (_req, res) => {
  res.json({ users: getUsers() });
});

app.post("/api/admin/users", authMiddleware("admin"), async (req, res) => {
  const { login, password, role } = req.body;
  if (!login || !password || !role) { res.status(400).json({ error: "Укажите login, password и role" }); return; }
  const user = await createUser(login, password, role);
  if (!user) { res.status(409).json({ error: "Пользователь с таким логином уже существует" }); return; }
  res.status(201).json({ user });
});

app.put("/api/admin/users/:id", authMiddleware("admin"), async (req, res) => {
  const user = await updateUserById(req.params.id, req.body);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  res.json({ user });
});

app.delete("/api/admin/users/:id", authMiddleware("admin"), async (req, res) => {
  const deleted = await deleteUserById(req.params.id);
  if (!deleted) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  res.json({ deleted: true });
});

// ─── Admin: Config ────────────────────────────────────

app.get("/api/admin/config", authMiddleware("admin"), async (_req, res) => {
  if (useYdb) {
    const config = await loadConfig();
    res.json({ config });
  } else {
    res.json({ config: {} });
  }
});

app.put("/api/admin/config", authMiddleware("admin"), async (req, res) => {
  if (useYdb) {
    for (const [key, value] of Object.entries(req.body)) {
      await setConfigValue(key, String(value));
    }
  }
  res.json({ saved: true });
});

// ─── Admin: Audit ────────────────────────────────────

app.get("/api/admin/audit-logs", authMiddleware("admin"), async (_req, res) => {
  if (useYdb) {
    const limit = parseInt((_req.query.limit as string) || "50");
    const logs = await getAuditLogs(limit);
    res.json({ logs });
  } else {
    res.json({ logs: [] });
  }
});

// ─── Admin: Validate & Export ─────────────────────────

app.get("/api/admin/validate", authMiddleware("manager"), (_req, res) => {
  res.json(repo.validate());
});

app.get("/api/admin/export", authMiddleware("admin"), (_req, res) => {
  const csv = repo.exportToCsv();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=drevo-export.csv");
  res.send(csv);
});

app.get("/api/admin/export-gedcom", authMiddleware("admin"), (_req, res) => {
  const gedcom = repo.exportToGedcom();
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=drevo-export.ged");
  res.send(gedcom);
});

// ─── Start ────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3001");
app.listen(PORT, () => {
  console.log(`\nDrevo API dev-server running at http://localhost:${PORT}`);
  console.log(`YDB: ${useYdb ? "connected" : "off (CSV mode)"}`);
  console.log(`\nDefault users:`);
  console.log(`  admin / admin123    (role: admin)`);
  console.log(`  manager / manager123 (role: manager)`);
  console.log(`  viewer / viewer123   (role: viewer)`);
  console.log(`\nAdmin endpoints:`);
  console.log(`  POST   /api/admin/persons          — create person`);
  console.log(`  PUT    /api/admin/persons/:id       — update person`);
  console.log(`  DELETE /api/admin/persons/:id       — delete person`);
  console.log(`  POST   /api/admin/persons/:id/spouse — add spouse`);
  console.log(`  POST   /api/admin/persons/:id/child  — add child`);
  console.log(`  POST   /api/admin/persons/:id/photo  — upload photo`);
  console.log(`  PUT    /api/admin/bio/:id            — save biography`);
  console.log(`  GET    /api/admin/users              — list users`);
  console.log(`  POST   /api/admin/users              — create user`);
  console.log(`  GET    /api/admin/validate           — validate data`);
  console.log(`  GET    /api/admin/export             — export CSV`);
});
