import type { RouteContext, YcResponse } from "./types.js";
import { json, err, matchPath, parseBody, requireRole, auditLog } from "./helpers.js";
import {
  upsertPerson, deletePerson as ydbDeletePerson,
  addSpouse, removeSpouse, addChild, removeChild,
  loadConfig, setConfigValue, getAuditLogs,
} from "../shared/ydb-repository.js";
import { isYdbConfigured } from "../shared/ydb-client.js";
import {
  getUsers, createUser, updateUserById, deleteUserById,
} from "../shared/auth.js";
import { migrateFromCsvString } from "../shared/ydb-schema.js";
import { loadAllFromYdb } from "../shared/ydb-repository.js";
import { DataRepository } from "../shared/data-repository.js";
import { parsePersonsCsvString } from "../shared/csv-parser.js";
import type { Person, PersonFormData } from "../shared/types.js";
import { validate, personFormSchema, createUserSchema, updateUserSchema, bioSchema, favoriteSchema, spouseSchema, childSchema, parentSchema, photoUploadSchema } from "./validation.js";

const MEDIA_PATH = process.env.MEDIA_PATH || "/function/storage/media";
const INFO_PATH = process.env.INFO_PATH || "/function/storage/info";

export async function adminRoutes(
  ctx: RouteContext,
  setRepo: (r: DataRepository, ydb: boolean) => void,
): Promise<YcResponse | null> {
  const { method, apiPath, query, cors, repo, useYdb, event } = ctx;
  let params: Record<string, string> | null;

  // ── POST /admin/persons ──
  if (method === "POST" && apiPath === "/admin/persons") {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const raw = parseBody(event);
    const parsed = validate(personFormSchema, raw);
    if (!parsed.success) return err(cors, parsed.error, 400);
    const body = parsed.data;

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
    await auditLog(useYdb, auth.user, "create", "person", String(id), `${person.lastName} ${person.firstName}`);
    return json(cors, { person }, 201);
  }

  // ── PUT /admin/persons/:id ──
  if (method === "PUT" && (params = matchPath("/admin/persons/:id", apiPath))) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const id = parseInt(params.id);
    const body = parseBody<Partial<PersonFormData>>(event);
    const existing = repo.getPerson(id);
    if (!existing) return err(cors, "Человек не найден", 404);

    const oldFatherId = existing.fatherId;
    const oldMotherId = existing.motherId;
    const newFatherId = body.fatherId !== undefined ? body.fatherId : oldFatherId;
    const newMotherId = body.motherId !== undefined ? body.motherId : oldMotherId;

    if (newFatherId !== oldFatherId || newMotherId !== oldMotherId) {
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
    await auditLog(useYdb, auth.user, "update", "person", String(id), `${updated?.lastName} ${updated?.firstName}`);
    return json(cors, { person: updated });
  }

  // ── DELETE /admin/persons/:id ──
  if (method === "DELETE" && (params = matchPath("/admin/persons/:id", apiPath))) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const id = parseInt(params.id);
    const personName = repo.getPerson(id);
    if (!personName) return err(cors, "Человек не найден", 404);

    repo.removePerson(id);
    if (useYdb) await ydbDeletePerson(id);
    await auditLog(useYdb, auth.user, "delete", "person", String(id), `${personName.lastName} ${personName.firstName}`);
    return json(cors, { deleted: true });
  }

  // ── POST /admin/persons/:id/spouse ──
  if (method === "POST" && (params = matchPath("/admin/persons/:id/spouse", apiPath))) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const id = parseInt(params.id);
    const parsed = validate(spouseSchema, parseBody(event));
    if (!parsed.success) return err(cors, parsed.error, 400);
    const body = parsed.data;
    if (id === body.spouseId) return err(cors, "Нельзя добавить человека как собственного супруга", 400);
    if (!repo.getPerson(id) || !repo.getPerson(body.spouseId)) return err(cors, "Человек не найден", 404);

    repo.addSpouseRelation(id, body.spouseId);
    if (useYdb) await addSpouse(id, body.spouseId);
    return json(cors, { ok: true });
  }

  // ── DELETE /admin/persons/:id/spouse/:sid ──
  if (method === "DELETE" && (params = matchPath("/admin/persons/:id/spouse/:sid", apiPath))) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const id = parseInt(params.id);
    const sid = parseInt(params.sid);
    repo.removeSpouseRelation(id, sid);
    if (useYdb) await removeSpouse(id, sid);
    return json(cors, { ok: true });
  }

  // ── POST /admin/persons/:id/child ──
  if (method === "POST" && (params = matchPath("/admin/persons/:id/child", apiPath))) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const id = parseInt(params.id);
    const parsed = validate(childSchema, parseBody(event));
    if (!parsed.success) return err(cors, parsed.error, 400);
    const body = parsed.data;
    if (id === body.childId) return err(cors, "Нельзя добавить человека как собственного ребёнка", 400);
    if (!repo.getPerson(id) || !repo.getPerson(body.childId)) return err(cors, "Человек не найден", 404);

    repo.addChildRelation(id, body.childId);
    if (useYdb) await addChild(id, body.childId);
    return json(cors, { ok: true });
  }

  // ── DELETE /admin/persons/:id/child/:cid ──
  if (method === "DELETE" && (params = matchPath("/admin/persons/:id/child/:cid", apiPath))) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const id = parseInt(params.id);
    const cid = parseInt(params.cid);
    repo.removeChildRelation(id, cid);
    if (useYdb) await removeChild(id, cid);
    return json(cors, { ok: true });
  }

  // ── POST /admin/persons/:id/parent ──
  if (method === "POST" && (params = matchPath("/admin/persons/:id/parent", apiPath))) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const id = parseInt(params.id);
    const parsed = validate(parentSchema, parseBody(event));
    if (!parsed.success) return err(cors, parsed.error, 400);
    const body = parsed.data;
    if (!repo.getPerson(id)) return err(cors, "Человек не найден", 404);
    if (body.fatherId === id || body.motherId === id) return err(cors, "Нельзя назначить человека родителем самого себя", 400);

    repo.setParents(id, body.fatherId || 0, body.motherId || 0);
    const person = repo.getPerson(id)!;
    if (useYdb) await upsertPerson(person);
    return json(cors, { person });
  }

  // ── POST /admin/persons/:id/photo ──
  if (method === "POST" && (params = matchPath("/admin/persons/:id/photo", apiPath))) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const id = parseInt(params.id);
    if (!repo.getPerson(id)) return err(cors, "Человек не найден", 404);

    const parsed = validate(photoUploadSchema, parseBody(event));
    if (!parsed.success) return err(cors, parsed.error, 400);
    const body = parsed.data;

    const imageData = Buffer.from(body.data, "base64");
    const filename = repo.addPhoto(id, imageData, body.filename);
    return json(cors, { filename, photos: repo.getPhotos(id) });
  }

  // ── DELETE /admin/persons/:id/photo/:fn ──
  if (method === "DELETE" && apiPath.startsWith("/admin/persons/") && apiPath.includes("/photo/")) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const parts = apiPath.split("/");
    const id = parseInt(parts[3]);
    const fn = decodeURIComponent(parts[5]);
    if (!repo.getPerson(id)) return err(cors, "Человек не найден", 404);

    const deleted = repo.deletePhoto(id, fn);
    if (!deleted) return err(cors, "Фото не найдено", 404);
    return json(cors, { deleted: true, photos: repo.getPhotos(id) });
  }

  // ── PUT /admin/bio/:id ──
  if (method === "PUT" && (params = matchPath("/admin/bio/:id", apiPath))) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const id = parseInt(params.id);
    if (!repo.getPerson(id)) return err(cors, "Человек не найден", 404);

    const parsed = validate(bioSchema, parseBody(event));
    if (!parsed.success) return err(cors, parsed.error, 400);
    const body = parsed.data;

    repo.setBio(id, body.type, body.text);
    return json(cors, { saved: true });
  }

  // ── DELETE /admin/bio/:id ──
  if (method === "DELETE" && (params = matchPath("/admin/bio/:id", apiPath))) {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;

    const id = parseInt(params.id);
    const body = parseBody<{ type: "open" | "lock" }>(event);
    repo.deleteBio(id, body.type || "open");
    return json(cors, { deleted: true });
  }

  // ── GET /admin/users ──
  if (method === "GET" && apiPath === "/admin/users") {
    const auth = requireRole(ctx, "admin");
    if ("statusCode" in auth) return auth;
    return json(cors, { users: getUsers() });
  }

  // ── POST /admin/users ──
  if (method === "POST" && apiPath === "/admin/users") {
    const auth = requireRole(ctx, "admin");
    if ("statusCode" in auth) return auth;

    const parsed = validate(createUserSchema, parseBody(event));
    if (!parsed.success) return err(cors, parsed.error, 400);
    const body = parsed.data;

    const user = await createUser(body.login, body.password, body.role);
    if (!user) return err(cors, "Пользователь с таким логином уже существует", 409);
    await auditLog(useYdb, auth.user, "create", "user", user.id, `${body.login} (${body.role})`);
    return json(cors, { user }, 201);
  }

  // ── PUT /admin/users/:id ──
  if (method === "PUT" && (params = matchPath("/admin/users/:id", apiPath))) {
    const auth = requireRole(ctx, "admin");
    if ("statusCode" in auth) return auth;

    const parsed = validate(updateUserSchema, parseBody(event));
    if (!parsed.success) return err(cors, parsed.error, 400);
    const user = await updateUserById(params.id, parsed.data);
    if (!user) return err(cors, "Пользователь не найден", 404);
    return json(cors, { user });
  }

  // ── DELETE /admin/users/:id ──
  if (method === "DELETE" && (params = matchPath("/admin/users/:id", apiPath))) {
    const auth = requireRole(ctx, "admin");
    if ("statusCode" in auth) return auth;

    const deleted = await deleteUserById(params.id);
    if (!deleted) return err(cors, "Пользователь не найден", 404);
    await auditLog(useYdb, auth.user, "delete", "user", params.id);
    return json(cors, { deleted: true });
  }

  // ── GET /admin/config ──
  if (method === "GET" && apiPath === "/admin/config") {
    const auth = requireRole(ctx, "admin");
    if ("statusCode" in auth) return auth;

    if (useYdb) {
      const config = await loadConfig();
      return json(cors, { config });
    }
    return json(cors, { config: {} });
  }

  // ── PUT /admin/config ──
  if (method === "PUT" && apiPath === "/admin/config") {
    const auth = requireRole(ctx, "admin");
    if ("statusCode" in auth) return auth;

    const body = parseBody<Record<string, string>>(event);
    if (useYdb) {
      for (const [key, value] of Object.entries(body)) {
        await setConfigValue(key, String(value));
      }
    }
    return json(cors, { saved: true });
  }

  // ── GET /admin/validate ──
  if (method === "GET" && apiPath === "/admin/validate") {
    const auth = requireRole(ctx, "manager");
    if ("statusCode" in auth) return auth;
    return json(cors, repo.validate());
  }

  // ── GET /admin/export ──
  if (method === "GET" && apiPath === "/admin/export") {
    const auth = requireRole(ctx, "admin");
    if ("statusCode" in auth) return auth;

    const csv = repo.exportToCsv();
    return {
      statusCode: 200,
      headers: {
        ...cors,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=drevo-export.csv",
      },
      body: csv,
      isBase64Encoded: false,
    };
  }

  // ── GET /admin/export-gedcom ──
  if (method === "GET" && apiPath === "/admin/export-gedcom") {
    const auth = requireRole(ctx, "admin");
    if ("statusCode" in auth) return auth;

    const gedcom = repo.exportToGedcom();
    return {
      statusCode: 200,
      headers: {
        ...cors,
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": "attachment; filename=drevo-export.ged",
      },
      body: gedcom,
      isBase64Encoded: false,
    };
  }

  // ── POST /admin/import ──
  if (method === "POST" && apiPath === "/admin/import") {
    const auth = requireRole(ctx, "admin");
    if ("statusCode" in auth) return auth;

    const body = parseBody<{ data: string }>(event);
    if (!body.data) return err(cors, "Укажите data (base64 CSV)", 400);

    const csvContent = Buffer.from(body.data, "base64").toString("utf-8");
    const persons = parsePersonsCsvString(csvContent);
    if (persons.size === 0) return err(cors, "CSV пустой или некорректный", 400);

    if (isYdbConfigured()) {
      const count = await migrateFromCsvString(csvContent);
      const { persons: ydbPersons, favorites } = await loadAllFromYdb();
      setRepo(DataRepository.fromData(ydbPersons, favorites, MEDIA_PATH, INFO_PATH), true);
      return json(cors, { imported: count });
    } else {
      setRepo(DataRepository.fromData(persons, [], MEDIA_PATH, INFO_PATH), false);
      return json(cors, { imported: persons.size, warning: "Данные загружены только в память (YDB не настроен)" });
    }
  }

  // ── GET /admin/audit-logs ──
  if (method === "GET" && apiPath === "/admin/audit-logs") {
    const auth = requireRole(ctx, "admin");
    if ("statusCode" in auth) return auth;
    const limit = parseInt(query.limit) || 50;
    if (useYdb) {
      const logs = await getAuditLogs(limit);
      return json(cors, { logs });
    }
    return json(cors, { logs: [] });
  }

  return null;
}
