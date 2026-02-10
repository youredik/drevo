import express from "express";
import cors from "cors";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import mime from "mime-types";

import { DataRepository } from "./shared/data-repository.js";
import { initUsers, authenticate, authMiddleware, getUsers } from "./shared/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Paths to Android app assets
const ASSETS = join(__dirname, "..", "..", "android-app", "app", "src", "main", "assets");
const CSV_PATH = join(ASSETS, "fam.csv");
const FAV_PATH = join(ASSETS, "fav.csv");
const MEDIA_PATH = join(ASSETS, "images");
const INFO_PATH = join(ASSETS, "info");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize data
console.log("Loading data from CSV...");
const repo = new DataRepository(CSV_PATH, FAV_PATH, MEDIA_PATH, INFO_PATH);
console.log(`Loaded ${repo.getPersonCount()} persons`);

// Initialize auth
await initUsers();
console.log("Auth initialized (3 default users)");

// ─── Public API ───────────────────────────────────────

// Person card
app.get("/api/persons/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const card = repo.getPersonCard(id);
  if (!card) {
    res.status(404).json({ error: "Человек не найден" });
    return;
  }
  res.json(card);
});

// All persons (paginated)
app.get("/api/persons", (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const all = repo.getAllPersons();
  const start = (page - 1) * limit;
  const items = all.slice(start, start + limit);
  res.json({ items, total: all.length, page, limit });
});

// Search
app.get("/api/search", (req, res) => {
  const q = (req.query.q as string) || "";
  const results = repo.search(q);
  res.json({ results, count: results.length });
});

// Events
app.get("/api/events", (req, res) => {
  const days = parseInt(req.query.days as string) || 5;
  const yesterday = req.query.yesterday !== "false";
  const events = repo.getEvents(days, yesterday);
  res.json({ events, count: events.length });
});

// Tree
app.get("/api/tree/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const type = (req.query.type as string) || "ancestors";
  const tree =
    type === "descendants" ? repo.getDescendantTree(id) : repo.getAncestorTree(id);
  if (!tree) {
    res.status(404).json({ error: "Человек не найден" });
    return;
  }
  res.json(tree);
});

// Kinship
app.get("/api/kinship", (req, res) => {
  const id1 = parseInt(req.query.id1 as string);
  const id2 = parseInt(req.query.id2 as string);
  if (!id1 || !id2) {
    res.status(400).json({ error: "Укажите id1 и id2" });
    return;
  }
  const result = repo.checkKinship(id1, id2);
  if (!result) {
    res.status(404).json({ error: "Один из людей не найден" });
    return;
  }
  res.json(result);
});

// Family
app.get("/api/family/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const members = repo.getFamily(id);
  if (members.length === 0) {
    res.status(404).json({ error: "Человек не найден" });
    return;
  }
  res.json({ members });
});

// Stats
app.get("/api/stats", (_req, res) => {
  res.json(repo.getStats());
});

// Biography
app.get("/api/bio/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const type = (req.query.type as string) === "lock" ? "lock" : "open";
  const bio = repo.getBio(id, type);
  if (bio === null) {
    res.status(404).json({ error: "Биография не найдена" });
    return;
  }
  res.json({ text: bio });
});

// Favorites
app.get("/api/favorites", (_req, res) => {
  const favIds = repo.getFavorites();
  const persons = favIds
    .map((id) => repo.getPersonCard(id))
    .filter((p) => p !== null);
  res.json({ favorites: persons });
});

// Media (photos)
app.get("/api/media/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = join(MEDIA_PATH, filename);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "Файл не найден" });
    return;
  }
  const contentType = mime.lookup(filename) || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(readFileSync(filePath));
});

// App info
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
  if (!login || !password) {
    res.status(400).json({ error: "Укажите login и password" });
    return;
  }
  const result = await authenticate(login, password);
  if (!result) {
    res.status(401).json({ error: "Неверный логин или пароль" });
    return;
  }
  res.json(result);
});

app.get("/api/auth/me", authMiddleware(), (req, res) => {
  res.json({ user: (req as any).user });
});

// ─── Admin routes ─────────────────────────────────────

app.get("/api/admin/users", authMiddleware("admin"), (_req, res) => {
  res.json({ users: getUsers() });
});

// ─── Start ────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3001");
app.listen(PORT, () => {
  console.log(`\nDrevo API dev-server running at http://localhost:${PORT}`);
  console.log(`\nDefault users:`);
  console.log(`  admin / admin123    (role: admin)`);
  console.log(`  manager / manager123 (role: manager)`);
  console.log(`  viewer / viewer123   (role: viewer)`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /api/persons/:id  — person card`);
  console.log(`  GET  /api/persons      — all persons`);
  console.log(`  GET  /api/search?q=    — search`);
  console.log(`  GET  /api/events       — events`);
  console.log(`  GET  /api/tree/:id     — ancestry tree`);
  console.log(`  GET  /api/kinship      — kinship check`);
  console.log(`  GET  /api/family/:id   — close family`);
  console.log(`  GET  /api/stats        — statistics`);
  console.log(`  GET  /api/media/:file  — photos`);
  console.log(`  GET  /api/bio/:id      — biography`);
  console.log(`  POST /api/auth/login   — authenticate`);
});
