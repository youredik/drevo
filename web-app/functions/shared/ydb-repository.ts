import { getYdbDriver } from "./ydb-client.js";
import ydb from "ydb-sdk";
import type { Person, AppUser, AppConfig } from "./types.js";

const { TypedValues } = ydb;

// ─── Helper: parse YDB row to Person ────────────────────

function rowToPerson(row: any, spouseMap: Map<number, number[]>, childMap: Map<number, number[]>): Person {
  const items = row.items || [];
  const id = Number(items[0]?.uint64Value || 0);
  return {
    id,
    sex: (Number(items[1]?.uint32Value || 0) as 0 | 1),
    firstName: items[2]?.textValue || "",
    lastName: items[3]?.textValue || "",
    fatherId: Number(items[4]?.uint64Value || 0),
    motherId: Number(items[5]?.uint64Value || 0),
    birthPlace: items[6]?.textValue || "",
    birthDay: items[7]?.textValue || "",
    deathPlace: items[8]?.textValue || "",
    deathDay: items[9]?.textValue || "",
    address: items[10]?.textValue || "",
    orderByDad: Number(items[11]?.uint32Value || 0),
    orderByMom: Number(items[12]?.uint32Value || 0),
    orderBySpouse: Number(items[13]?.uint32Value || 0),
    marryDay: items[14]?.textValue || "",
    spouseIds: spouseMap.get(id) || [],
    childrenIds: childMap.get(id) || [],
  };
}

function rowToUser(row: any): AppUser {
  const items = row.items || [];
  return {
    id: items[0]?.textValue || "",
    login: items[1]?.textValue || "",
    passwordHash: items[2]?.textValue || "",
    role: (items[3]?.textValue || "viewer") as AppUser["role"],
    createdAt: items[4]?.textValue || "",
  };
}

// ─── Load all data from YDB (for in-memory cache) ───────

// Paginated query helper (YDB limits data queries to ~1000 rows)
async function queryAllRows(driver: any, query: string, orderCol: string): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const allRows: any[] = [];
  let lastId = 0;

  while (true) {
    const rows = await driver.tableClient.withSession(async (session: any) => {
      const result = await session.executeQuery(
        `${query} WHERE ${orderCol} > ${lastId}ul ORDER BY ${orderCol} LIMIT ${PAGE_SIZE};`
      );
      return result.resultSets[0]?.rows || [];
    });

    if (rows.length === 0) break;
    allRows.push(...rows);
    lastId = Number(rows[rows.length - 1].items?.[0]?.uint64Value || 0);
    if (rows.length < PAGE_SIZE) break;
  }

  return allRows;
}

export async function loadAllFromYdb(): Promise<{
  persons: Map<number, Person>;
  favorites: number[];
}> {
  const driver = await getYdbDriver();

  // Load all four datasets in parallel
  const [spouseRows, childRows, personRows, favorites] = await Promise.all([
    queryAllRows(driver, "SELECT person_id, spouse_id FROM spouses", "person_id"),
    queryAllRows(driver, "SELECT parent_id, child_id FROM children", "parent_id"),
    queryAllRows(
      driver,
      `SELECT id, sex, first_name, last_name, father_id, mother_id,
              birth_place, birth_day, death_place, death_day, address,
              order_by_dad, order_by_mom, order_by_spouse, marry_day
       FROM persons`,
      "id"
    ),
    driver.tableClient.withSession(async (session: any) => {
      const result = await session.executeQuery("SELECT slot_index, person_id FROM favorites ORDER BY slot_index;");
      return (result.resultSets[0]?.rows || []).map((row: any) => Number(row.items?.[1]?.uint64Value || 0));
    }),
  ]);

  // Build spouse map
  const spouseMap = new Map<number, number[]>();
  for (const row of spouseRows) {
    const personId = Number(row.items?.[0]?.uint64Value || 0);
    const spouseId = Number(row.items?.[1]?.uint64Value || 0);
    if (!spouseMap.has(personId)) spouseMap.set(personId, []);
    spouseMap.get(personId)!.push(spouseId);
  }

  // Build child map
  const childMap = new Map<number, number[]>();
  for (const row of childRows) {
    const parentId = Number(row.items?.[0]?.uint64Value || 0);
    const childId = Number(row.items?.[1]?.uint64Value || 0);
    if (!childMap.has(parentId)) childMap.set(parentId, []);
    childMap.get(parentId)!.push(childId);
  }

  // Build persons map
  const persons = new Map<number, Person>();
  for (const row of personRows) {
    const person = rowToPerson(row, spouseMap, childMap);
    persons.set(person.id, person);
  }

  return { persons, favorites };
}

// ─── Person CRUD ────────────────────────────────────────

export async function getNextPersonId(): Promise<number> {
  const driver = await getYdbDriver();
  return await driver.tableClient.withSession(async (session) => {
    const result = await session.executeQuery("SELECT MAX(id) AS max_id FROM persons;");
    const rows = result.resultSets[0]?.rows || [];
    const maxId = Number(rows[0]?.items?.[0]?.uint64Value || 0);
    return maxId + 1;
  });
}

export async function upsertPerson(person: Person): Promise<void> {
  const driver = await getYdbDriver();
  const p = person;
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $id AS Uint64;
      DECLARE $sex AS Uint8;
      DECLARE $first_name AS Utf8;
      DECLARE $last_name AS Utf8;
      DECLARE $father_id AS Uint64;
      DECLARE $mother_id AS Uint64;
      DECLARE $birth_place AS Utf8;
      DECLARE $birth_day AS Utf8;
      DECLARE $death_place AS Utf8;
      DECLARE $death_day AS Utf8;
      DECLARE $address AS Utf8;
      DECLARE $order_by_dad AS Uint32;
      DECLARE $order_by_mom AS Uint32;
      DECLARE $order_by_spouse AS Uint32;
      DECLARE $marry_day AS Utf8;

      UPSERT INTO persons (id, sex, first_name, last_name, father_id, mother_id,
        birth_place, birth_day, death_place, death_day, address,
        order_by_dad, order_by_mom, order_by_spouse, marry_day)
      VALUES ($id, $sex, $first_name, $last_name, $father_id, $mother_id,
        $birth_place, $birth_day, $death_place, $death_day, $address,
        $order_by_dad, $order_by_mom, $order_by_spouse, $marry_day);
    `, {
      '$id': TypedValues.uint64(p.id),
      '$sex': TypedValues.uint8(p.sex),
      '$first_name': TypedValues.utf8(p.firstName),
      '$last_name': TypedValues.utf8(p.lastName),
      '$father_id': TypedValues.uint64(p.fatherId),
      '$mother_id': TypedValues.uint64(p.motherId),
      '$birth_place': TypedValues.utf8(p.birthPlace),
      '$birth_day': TypedValues.utf8(p.birthDay),
      '$death_place': TypedValues.utf8(p.deathPlace),
      '$death_day': TypedValues.utf8(p.deathDay),
      '$address': TypedValues.utf8(p.address),
      '$order_by_dad': TypedValues.uint32(p.orderByDad),
      '$order_by_mom': TypedValues.uint32(p.orderByMom),
      '$order_by_spouse': TypedValues.uint32(p.orderBySpouse),
      '$marry_day': TypedValues.utf8(p.marryDay),
    });
  });
}

export async function deletePerson(id: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    const params = { '$id': TypedValues.uint64(id) };
    await session.executeQuery(`DECLARE $id AS Uint64; DELETE FROM persons WHERE id = $id;`, params);
    await session.executeQuery(`DECLARE $id AS Uint64; DELETE FROM spouses WHERE person_id = $id OR spouse_id = $id;`, params);
    await session.executeQuery(`DECLARE $id AS Uint64; DELETE FROM children WHERE parent_id = $id OR child_id = $id;`, params);
  });
}

// ─── Relationship management ────────────────────────────

export async function addSpouse(personId: number, spouseId: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $person_id AS Uint64;
      DECLARE $spouse_id AS Uint64;
      UPSERT INTO spouses (person_id, spouse_id) VALUES ($person_id, $spouse_id);
    `, {
      '$person_id': TypedValues.uint64(personId),
      '$spouse_id': TypedValues.uint64(spouseId),
    });
    await session.executeQuery(`
      DECLARE $person_id AS Uint64;
      DECLARE $spouse_id AS Uint64;
      UPSERT INTO spouses (person_id, spouse_id) VALUES ($person_id, $spouse_id);
    `, {
      '$person_id': TypedValues.uint64(spouseId),
      '$spouse_id': TypedValues.uint64(personId),
    });
  });
}

export async function removeSpouse(personId: number, spouseId: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $person_id AS Uint64;
      DECLARE $spouse_id AS Uint64;
      DELETE FROM spouses WHERE person_id = $person_id AND spouse_id = $spouse_id;
    `, {
      '$person_id': TypedValues.uint64(personId),
      '$spouse_id': TypedValues.uint64(spouseId),
    });
    await session.executeQuery(`
      DECLARE $person_id AS Uint64;
      DECLARE $spouse_id AS Uint64;
      DELETE FROM spouses WHERE person_id = $person_id AND spouse_id = $spouse_id;
    `, {
      '$person_id': TypedValues.uint64(spouseId),
      '$spouse_id': TypedValues.uint64(personId),
    });
  });
}

export async function addChild(parentId: number, childId: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $parent_id AS Uint64;
      DECLARE $child_id AS Uint64;
      UPSERT INTO children (parent_id, child_id) VALUES ($parent_id, $child_id);
    `, {
      '$parent_id': TypedValues.uint64(parentId),
      '$child_id': TypedValues.uint64(childId),
    });
  });
}

export async function removeChild(parentId: number, childId: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $parent_id AS Uint64;
      DECLARE $child_id AS Uint64;
      DELETE FROM children WHERE parent_id = $parent_id AND child_id = $child_id;
    `, {
      '$parent_id': TypedValues.uint64(parentId),
      '$child_id': TypedValues.uint64(childId),
    });
  });
}

// ─── User management ────────────────────────────────────

export async function loadUsers(): Promise<AppUser[]> {
  const driver = await getYdbDriver();
  return await driver.tableClient.withSession(async (session) => {
    const result = await session.executeQuery("SELECT id, login, password_hash, role, created_at FROM users;");
    return (result.resultSets[0]?.rows || []).map(rowToUser);
  });
}

export async function upsertUser(user: AppUser): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $id AS Utf8;
      DECLARE $login AS Utf8;
      DECLARE $password_hash AS Utf8;
      DECLARE $role AS Utf8;
      DECLARE $created_at AS Utf8;

      UPSERT INTO users (id, login, password_hash, role, created_at)
      VALUES ($id, $login, $password_hash, $role, $created_at);
    `, {
      '$id': TypedValues.utf8(user.id),
      '$login': TypedValues.utf8(user.login),
      '$password_hash': TypedValues.utf8(user.passwordHash),
      '$role': TypedValues.utf8(user.role),
      '$created_at': TypedValues.utf8(user.createdAt),
    });
  });
}

export async function deleteUserFromYdb(id: string): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $id AS Utf8;
      DELETE FROM users WHERE id = $id;
    `, {
      '$id': TypedValues.utf8(id),
    });
  });
}

// ─── App config ─────────────────────────────────────────

export async function loadConfig(): Promise<Record<string, string>> {
  const driver = await getYdbDriver();
  return await driver.tableClient.withSession(async (session) => {
    const result = await session.executeQuery("SELECT key, value FROM app_config;");
    const config: Record<string, string> = {};
    for (const row of result.resultSets[0]?.rows || []) {
      const key = row.items?.[0]?.textValue || "";
      const value = row.items?.[1]?.textValue || "";
      if (key) config[key] = value;
    }
    return config;
  });
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $key AS Utf8;
      DECLARE $value AS Utf8;
      UPSERT INTO app_config (key, value) VALUES ($key, $value);
    `, {
      '$key': TypedValues.utf8(key),
      '$value': TypedValues.utf8(value),
    });
  });
}

// ─── Favorites CRUD ─────────────────────────────────────

export async function upsertFavorite(slotIndex: number, personId: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $slot_index AS Uint32;
      DECLARE $person_id AS Uint64;
      UPSERT INTO favorites (slot_index, person_id) VALUES ($slot_index, $person_id);
    `, {
      '$slot_index': TypedValues.uint32(slotIndex),
      '$person_id': TypedValues.uint64(personId),
    });
  });
}

export async function deleteFavoriteBySlot(slotIndex: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $slot_index AS Uint32;
      DELETE FROM favorites WHERE slot_index = $slot_index;
    `, {
      '$slot_index': TypedValues.uint32(slotIndex),
    });
  });
}

// ─── Audit log ──────────────────────────────────────────

export async function insertAuditLog(log: {
  userId: string;
  userLogin: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: string;
}): Promise<void> {
  const driver = await getYdbDriver();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      DECLARE $id AS Utf8;
      DECLARE $timestamp AS Utf8;
      DECLARE $user_id AS Utf8;
      DECLARE $user_login AS Utf8;
      DECLARE $action AS Utf8;
      DECLARE $resource_type AS Utf8;
      DECLARE $resource_id AS Utf8;
      DECLARE $details AS Utf8;

      UPSERT INTO audit_logs (id, timestamp, user_id, user_login, action,
        resource_type, resource_id, details)
      VALUES ($id, $timestamp, $user_id, $user_login, $action,
        $resource_type, $resource_id, $details);
    `, {
      '$id': TypedValues.utf8(id),
      '$timestamp': TypedValues.utf8(timestamp),
      '$user_id': TypedValues.utf8(log.userId),
      '$user_login': TypedValues.utf8(log.userLogin),
      '$action': TypedValues.utf8(log.action),
      '$resource_type': TypedValues.utf8(log.resourceType),
      '$resource_id': TypedValues.utf8(log.resourceId),
      '$details': TypedValues.utf8(log.details || ''),
    });
  });
}

export async function getAuditLogs(limit: number = 50): Promise<any[]> {
  const driver = await getYdbDriver();
  return await driver.tableClient.withSession(async (session) => {
    const result = await session.executeQuery(`
      SELECT id, timestamp, user_id, user_login, action, resource_type, resource_id, details
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT ${Math.min(Math.max(1, Math.floor(limit)), 200)};
    `);
    return (result.resultSets[0]?.rows || []).map((row: any) => ({
      id: row.items?.[0]?.textValue || '',
      timestamp: row.items?.[1]?.textValue || '',
      userId: row.items?.[2]?.textValue || '',
      userLogin: row.items?.[3]?.textValue || '',
      action: row.items?.[4]?.textValue || '',
      resourceType: row.items?.[5]?.textValue || '',
      resourceId: row.items?.[6]?.textValue || '',
      details: row.items?.[7]?.textValue || '',
    }));
  });
}
