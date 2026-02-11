import { describe, it, expect, beforeAll, vi } from "vitest";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

// Mock YDB modules (ydb-sdk requires native gRPC not available in tests)
vi.mock("../shared/ydb-client.js", () => ({
  isYdbConfigured: () => false,
  getYdbDriver: async () => { throw new Error("YDB not available in tests"); },
}));

vi.mock("../shared/ydb-repository.js", () => ({
  loadAllFromYdb: async () => ({ persons: new Map(), favorites: [] }),
  upsertPerson: async () => {},
  deletePerson: async () => {},
  addSpouse: async () => {},
  removeSpouse: async () => {},
  addChild: async () => {},
  removeChild: async () => {},
  loadConfig: async () => ({}),
  setConfigValue: async () => {},
  upsertFavorite: async () => {},
  deleteFavoriteBySlot: async () => {},
  insertAuditLog: async () => {},
  getAuditLogs: async () => [],
  loadUsers: async () => [],
  upsertUser: async () => {},
  deleteUserFromYdb: async () => {},
}));

vi.mock("../shared/ydb-schema.js", () => ({
  ensureTables: async () => {},
  migrateFromCsv: async () => {},
  migrateFromCsvString: async () => 0,
}));

import { DataRepository } from "../shared/data-repository.js";
import { publicRoutes } from "../routes/public.js";
import { authRoutes } from "../routes/auth.js";
import { adminRoutes } from "../routes/admin.js";
import type { YcEvent, YcResponse, RouteContext } from "../routes/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const CSV_PATH = join(FIXTURES, "data", "fam.csv");
const FAV_PATH = join(FIXTURES, "data", "fav.csv");
const MEDIA_PATH = join(FIXTURES, "data"); // not real media, but enough to avoid crashes
const INFO_PATH = join(FIXTURES, "data", "info");

const JWT_SECRET = "drevo-dev-secret-key-change-in-production";
const CORS = { "Access-Control-Allow-Origin": "*" };

let repo: DataRepository;

function makeToken(role: "admin" | "manager" | "viewer" = "admin"): string {
  return jwt.sign({ id: "1", login: role, role }, JWT_SECRET, { expiresIn: "1h" });
}

function makeEvent(overrides: Partial<YcEvent> = {}): YcEvent {
  return {
    httpMethod: "GET",
    url: "/api/test",
    headers: {},
    queryStringParameters: {},
    body: "",
    isBase64Encoded: false,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<RouteContext> = {}): RouteContext {
  return {
    method: "GET",
    apiPath: "/test",
    query: {},
    headers: { Authorization: `Bearer ${makeToken()}` },
    event: makeEvent(),
    repo,
    useYdb: false,
    cors: CORS,
    ...overrides,
  };
}

function parseJson(response: YcResponse): any {
  return JSON.parse(response.body);
}

beforeAll(() => {
  repo = new DataRepository(CSV_PATH, FAV_PATH, MEDIA_PATH, INFO_PATH);
});

// ══════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════

describe("E2E: Public routes", () => {
  describe("GET /persons/:id", () => {
    it("returns person card for existing person", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/persons/1" });
      const res = await publicRoutes(ctx);
      expect(res).not.toBeNull();
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.person.id).toBe(1);
      expect(body.person.firstName).toBe("Иван");
      expect(body.person.lastName).toBe("Иванов");
      expect(body.father).toBeNull(); // person 1 has no father
      expect(body.mother).toBeNull();
      expect(body.spouses).toHaveLength(1);
      expect(body.children).toHaveLength(1);
    });

    it("returns 404 for non-existent person", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/persons/999" });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(404);
    });
  });

  describe("GET /persons", () => {
    it("returns paginated list", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/persons", query: { page: "1", limit: "3" } });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.total).toBe(5);
      expect(body.items).toHaveLength(3);
      expect(body.page).toBe(1);
    });

    it("handles page 2", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/persons", query: { page: "2", limit: "3" } });
      const res = await publicRoutes(ctx);
      const body = parseJson(res!);
      expect(body.items).toHaveLength(2); // 5 total, page 2 of size 3 = 2 remaining
    });
  });

  describe("GET /search", () => {
    it("finds person by last name", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/search", query: { q: "Иванов" } });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.count).toBeGreaterThan(0);
      expect(body.results.some((r: any) => r.lastName === "Иванов")).toBe(true);
    });

    it("finds person by first name", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/search", query: { q: "Алексей" } });
      const res = await publicRoutes(ctx);
      const body = parseJson(res!);
      expect(body.count).toBeGreaterThanOrEqual(1);
      expect(body.results[0].firstName).toBe("Алексей");
    });

    it("returns empty for non-matching query", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/search", query: { q: "Несуществующий" } });
      const res = await publicRoutes(ctx);
      const body = parseJson(res!);
      expect(body.count).toBe(0);
    });
  });

  describe("GET /tree/:id", () => {
    it("returns ancestor tree", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/tree/5", query: { type: "ancestors" } });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.id).toBe(5);
      expect(body.firstName).toBe("Алексей");
    });

    it("returns descendant tree", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/tree/1", query: { type: "descendants" } });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.id).toBe(1);
      expect(body.children.length).toBeGreaterThan(0);
    });

    it("returns 404 for non-existent person", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/tree/999", query: { type: "ancestors" } });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(404);
    });
  });

  describe("GET /kinship", () => {
    it("finds kinship between related people", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/kinship", query: { id1: "1", id2: "5" } });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.person1.id).toBe(1);
      expect(body.person2.id).toBe(5);
    });

    it("returns 400 without both ids", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/kinship", query: { id1: "1" } });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(400);
    });

    it("returns 404 for non-existent person", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/kinship", query: { id1: "1", id2: "999" } });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(404);
    });
  });

  describe("GET /family/:id", () => {
    it("returns family members", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/family/3" });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.members.length).toBeGreaterThan(0);
    });

    it("returns 404 for non-existent person", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/family/999" });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(404);
    });
  });

  describe("GET /stats", () => {
    it("returns statistics", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/stats" });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.totalPersons).toBe(5);
      expect(body.maleCount).toBe(3);
      expect(body.femaleCount).toBe(2);
      expect(body.aliveCount).toBe(3);
      expect(body.deceasedCount).toBe(2);
    });
  });

  describe("GET /bio/:id", () => {
    it("returns 404 when no bio exists", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/bio/2", query: { type: "open" } });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(404);
    });
  });

  describe("GET /info", () => {
    it("returns app info with correct person count", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/info" });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.appName).toBe("Drevo");
      expect(body.personCount).toBe(5);
      expect(body.version).toBe("1.0.0");
    });
  });

  describe("GET /events", () => {
    it("returns events list", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/events", query: { days: "365" } });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(Array.isArray(body.events)).toBe(true);
    });
  });

  describe("Favorites CRUD", () => {
    it("adds and removes a favorite", async () => {
      // Check initially not favorite
      const checkCtx = makeCtx({ method: "GET", apiPath: "/favorites/check/1" });
      const checkRes = await publicRoutes(checkCtx);
      expect(parseJson(checkRes!).isFavorite).toBe(false);

      // Add favorite
      const addCtx = makeCtx({
        method: "POST",
        apiPath: "/favorites",
        event: makeEvent({
          httpMethod: "POST",
          body: JSON.stringify({ personId: 1 }),
        }),
      });
      const addRes = await publicRoutes(addCtx);
      expect(addRes!.statusCode).toBe(200);
      expect(parseJson(addRes!).personId).toBe(1);

      // Verify it's now in favorites list
      const listCtx = makeCtx({ method: "GET", apiPath: "/favorites" });
      const listRes = await publicRoutes(listCtx);
      const favs = parseJson(listRes!).favorites;
      expect(favs.some((f: any) => f.person.id === 1)).toBe(true);

      // Check is favorite
      const check2Ctx = makeCtx({ method: "GET", apiPath: "/favorites/check/1" });
      const check2Res = await publicRoutes(check2Ctx);
      expect(parseJson(check2Res!).isFavorite).toBe(true);

      // Remove favorite
      const rmCtx = makeCtx({ method: "DELETE", apiPath: "/favorites/1" });
      const rmRes = await publicRoutes(rmCtx);
      expect(parseJson(rmRes!).removed).toBe(true);
    });

    it("rejects invalid personId", async () => {
      const ctx = makeCtx({
        method: "POST",
        apiPath: "/favorites",
        event: makeEvent({ httpMethod: "POST", body: JSON.stringify({ personId: -1 }) }),
      });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(400);
    });

    it("returns 404 for non-existent person", async () => {
      const ctx = makeCtx({
        method: "POST",
        apiPath: "/favorites",
        event: makeEvent({ httpMethod: "POST", body: JSON.stringify({ personId: 999 }) }),
      });
      const res = await publicRoutes(ctx);
      expect(res!.statusCode).toBe(404);
    });
  });

  describe("Route miss", () => {
    it("returns null for unknown route", async () => {
      const ctx = makeCtx({ method: "GET", apiPath: "/unknown" });
      const res = await publicRoutes(ctx);
      expect(res).toBeNull();
    });
  });
});

// ══════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════

describe("E2E: Auth routes", () => {
  describe("POST /auth/login", () => {
    it("rejects empty body", async () => {
      const ctx = makeCtx({
        method: "POST",
        apiPath: "/auth/login",
        event: makeEvent({ httpMethod: "POST", body: JSON.stringify({}) }),
      });
      const res = await authRoutes(ctx);
      expect(res!.statusCode).toBe(400);
    });

    it("rejects invalid JSON", async () => {
      const ctx = makeCtx({
        method: "POST",
        apiPath: "/auth/login",
        event: makeEvent({ httpMethod: "POST", body: "not json" }),
      });
      const res = await authRoutes(ctx);
      expect(res!.statusCode).toBe(400);
    });

    it("rejects missing password", async () => {
      const ctx = makeCtx({
        method: "POST",
        apiPath: "/auth/login",
        event: makeEvent({ httpMethod: "POST", body: JSON.stringify({ login: "admin" }) }),
      });
      const res = await authRoutes(ctx);
      expect(res!.statusCode).toBe(400);
    });
  });

  describe("GET /auth/me", () => {
    it("returns user info with valid token", async () => {
      const token = makeToken("admin");
      const ctx = makeCtx({
        method: "GET",
        apiPath: "/auth/me",
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await authRoutes(ctx);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.user.role).toBe("admin");
    });

    it("rejects request without token", async () => {
      const ctx = makeCtx({
        method: "GET",
        apiPath: "/auth/me",
        headers: {},
      });
      const res = await authRoutes(ctx);
      expect(res!.statusCode).toBe(401);
    });

    it("rejects expired token", async () => {
      const expired = jwt.sign({ id: "1", login: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "-1s" });
      const ctx = makeCtx({
        method: "GET",
        apiPath: "/auth/me",
        headers: { Authorization: `Bearer ${expired}` },
      });
      const res = await authRoutes(ctx);
      expect(res!.statusCode).toBe(401);
    });
  });
});

// ══════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════

describe("E2E: Admin routes", () => {
  const noopSetRepo = () => {};

  function adminCtx(overrides: Partial<RouteContext> = {}): RouteContext {
    return makeCtx({
      headers: { Authorization: `Bearer ${makeToken("admin")}` },
      ...overrides,
    });
  }

  function managerCtx(overrides: Partial<RouteContext> = {}): RouteContext {
    return makeCtx({
      headers: { Authorization: `Bearer ${makeToken("manager")}` },
      ...overrides,
    });
  }

  function viewerCtx(overrides: Partial<RouteContext> = {}): RouteContext {
    return makeCtx({
      headers: { Authorization: `Bearer ${makeToken("viewer")}` },
      ...overrides,
    });
  }

  describe("POST /admin/persons — Create person", () => {
    it("creates a person as manager", async () => {
      const ctx = managerCtx({
        method: "POST",
        apiPath: "/admin/persons",
        event: makeEvent({
          httpMethod: "POST",
          body: JSON.stringify({ firstName: "Новый", lastName: "Человек", sex: 1 }),
        }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(201);
      const body = parseJson(res!);
      expect(body.person.firstName).toBe("Новый");
      expect(body.person.lastName).toBe("Человек");
      expect(body.person.id).toBeGreaterThan(5);
    });

    it("rejects without name", async () => {
      const ctx = managerCtx({
        method: "POST",
        apiPath: "/admin/persons",
        event: makeEvent({
          httpMethod: "POST",
          body: JSON.stringify({ firstName: "", lastName: "" }),
        }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(400);
    });

    it("rejects viewer role", async () => {
      const ctx = viewerCtx({
        method: "POST",
        apiPath: "/admin/persons",
        event: makeEvent({
          httpMethod: "POST",
          body: JSON.stringify({ firstName: "Test", sex: 1 }),
        }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(403);
    });
  });

  describe("PUT /admin/persons/:id — Update person", () => {
    it("updates person fields", async () => {
      const ctx = adminCtx({
        method: "PUT",
        apiPath: "/admin/persons/5",
        event: makeEvent({
          httpMethod: "PUT",
          body: JSON.stringify({ address: "Новый адрес" }),
        }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(body.person.address).toBe("Новый адрес");
    });

    it("returns 404 for non-existent person", async () => {
      const ctx = adminCtx({
        method: "PUT",
        apiPath: "/admin/persons/999",
        event: makeEvent({
          httpMethod: "PUT",
          body: JSON.stringify({ address: "test" }),
        }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(404);
    });
  });

  describe("DELETE /admin/persons/:id — Delete person", () => {
    it("deletes a person", async () => {
      // First create a person to delete
      const createCtx = adminCtx({
        method: "POST",
        apiPath: "/admin/persons",
        event: makeEvent({
          httpMethod: "POST",
          body: JSON.stringify({ firstName: "Удалить", lastName: "Меня", sex: 0 }),
        }),
      });
      const createRes = await adminRoutes(createCtx, noopSetRepo);
      const newId = parseJson(createRes!).person.id;

      // Now delete
      const delCtx = adminCtx({
        method: "DELETE",
        apiPath: `/admin/persons/${newId}`,
      });
      const delRes = await adminRoutes(delCtx, noopSetRepo);
      expect(delRes!.statusCode).toBe(200);
      expect(parseJson(delRes!).deleted).toBe(true);

      // Verify person is gone
      const getCtx = makeCtx({ method: "GET", apiPath: `/persons/${newId}` });
      const getRes = await publicRoutes(getCtx);
      expect(getRes!.statusCode).toBe(404);
    });

    it("returns 404 for non-existent person", async () => {
      const ctx = adminCtx({ method: "DELETE", apiPath: "/admin/persons/999" });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(404);
    });
  });

  describe("Spouse management", () => {
    it("rejects adding self as spouse", async () => {
      const ctx = managerCtx({
        method: "POST",
        apiPath: "/admin/persons/1/spouse",
        event: makeEvent({
          httpMethod: "POST",
          body: JSON.stringify({ spouseId: 1 }),
        }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(400);
    });
  });

  describe("Child management", () => {
    it("rejects adding self as child", async () => {
      const ctx = managerCtx({
        method: "POST",
        apiPath: "/admin/persons/1/child",
        event: makeEvent({
          httpMethod: "POST",
          body: JSON.stringify({ childId: 1 }),
        }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(400);
    });
  });

  describe("Parent management", () => {
    it("rejects setting self as parent", async () => {
      const ctx = managerCtx({
        method: "POST",
        apiPath: "/admin/persons/5/parent",
        event: makeEvent({
          httpMethod: "POST",
          body: JSON.stringify({ fatherId: 5 }),
        }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(400);
    });
  });

  describe("Bio management", () => {
    it("saves and retrieves biography", async () => {
      // Save bio
      const saveCtx = adminCtx({
        method: "PUT",
        apiPath: "/admin/bio/1",
        event: makeEvent({
          httpMethod: "PUT",
          body: JSON.stringify({ type: "open", text: "Тестовая биография" }),
        }),
      });
      const saveRes = await adminRoutes(saveCtx, noopSetRepo);
      expect(saveRes!.statusCode).toBe(200);
      expect(parseJson(saveRes!).saved).toBe(true);

      // Read bio through public route
      const readCtx = makeCtx({ method: "GET", apiPath: "/bio/1", query: { type: "open" } });
      const readRes = await publicRoutes(readCtx);
      expect(readRes!.statusCode).toBe(200);
      expect(parseJson(readRes!).text).toBe("Тестовая биография");
    });

    it("rejects invalid bio type", async () => {
      const ctx = adminCtx({
        method: "PUT",
        apiPath: "/admin/bio/1",
        event: makeEvent({
          httpMethod: "PUT",
          body: JSON.stringify({ type: "invalid", text: "test" }),
        }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(400);
    });
  });

  describe("Validate data", () => {
    it("returns validation result", async () => {
      const ctx = managerCtx({ method: "GET", apiPath: "/admin/validate" });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(200);
      const body = parseJson(res!);
      expect(Array.isArray(body.issues)).toBe(true);
      expect(typeof body.counts).toBe("object");
    });
  });

  describe("Export", () => {
    it("exports CSV", async () => {
      const ctx = adminCtx({ method: "GET", apiPath: "/admin/export" });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(200);
      expect(res!.headers["Content-Type"]).toContain("text/csv");
      expect(res!.body).toContain("Иванов");
    });

    it("exports GEDCOM", async () => {
      const ctx = adminCtx({ method: "GET", apiPath: "/admin/export-gedcom" });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(200);
      expect(res!.headers["Content-Type"]).toContain("text/plain");
      expect(res!.body).toContain("HEAD");
    });
  });

  describe("Role-based access control", () => {
    it("viewer cannot create persons", async () => {
      const ctx = viewerCtx({
        method: "POST",
        apiPath: "/admin/persons",
        event: makeEvent({ httpMethod: "POST", body: JSON.stringify({ firstName: "X", sex: 1 }) }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(403);
    });

    it("viewer cannot export", async () => {
      const ctx = viewerCtx({ method: "GET", apiPath: "/admin/export" });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(403);
    });

    it("manager cannot manage users", async () => {
      const ctx = managerCtx({ method: "GET", apiPath: "/admin/users" });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(403);
    });

    it("no token returns 401", async () => {
      const ctx = makeCtx({
        method: "POST",
        apiPath: "/admin/persons",
        headers: {},
        event: makeEvent({ httpMethod: "POST", body: JSON.stringify({ firstName: "X", sex: 1 }) }),
      });
      const res = await adminRoutes(ctx, noopSetRepo);
      expect(res!.statusCode).toBe(401);
    });
  });
});
