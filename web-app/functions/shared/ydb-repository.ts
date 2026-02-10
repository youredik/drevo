import { getYdbDriver } from "./ydb-client.js";
import type { Person, AppUser, AppConfig } from "./types.js";

// ─── Helper: parse YDB row to Person ────────────────────

function rowToPerson(row: any, spouseMap: Map<number, number[]>, childMap: Map<number, number[]>): Person {
  const items = row.items || [];
  const id = Number(items[0]?.uint64Value || 0);
  return {
    id,
    sex: (Number(items[1]?.uint8Value || 0) as 0 | 1),
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

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ─── Load all data from YDB (for in-memory cache) ───────

export async function loadAllFromYdb(): Promise<{
  persons: Map<number, Person>;
  favorites: number[];
}> {
  const driver = await getYdbDriver();

  // Load spouses
  const spouseMap = new Map<number, number[]>();
  await driver.tableClient.withSession(async (session) => {
    const result = await session.executeQuery("SELECT person_id, spouse_id FROM spouses;");
    for (const row of result.resultSets[0]?.rows || []) {
      const personId = Number(row.items?.[0]?.uint64Value || 0);
      const spouseId = Number(row.items?.[1]?.uint64Value || 0);
      if (!spouseMap.has(personId)) spouseMap.set(personId, []);
      spouseMap.get(personId)!.push(spouseId);
    }
  });

  // Load children
  const childMap = new Map<number, number[]>();
  await driver.tableClient.withSession(async (session) => {
    const result = await session.executeQuery("SELECT parent_id, child_id FROM children;");
    for (const row of result.resultSets[0]?.rows || []) {
      const parentId = Number(row.items?.[0]?.uint64Value || 0);
      const childId = Number(row.items?.[1]?.uint64Value || 0);
      if (!childMap.has(parentId)) childMap.set(parentId, []);
      childMap.get(parentId)!.push(childId);
    }
  });

  // Load persons
  const persons = new Map<number, Person>();
  await driver.tableClient.withSession(async (session) => {
    const result = await session.executeQuery(`
      SELECT id, sex, first_name, last_name, father_id, mother_id,
             birth_place, birth_day, death_place, death_day, address,
             order_by_dad, order_by_mom, order_by_spouse, marry_day
      FROM persons;
    `);
    for (const row of result.resultSets[0]?.rows || []) {
      const person = rowToPerson(row, spouseMap, childMap);
      persons.set(person.id, person);
    }
  });

  // Load favorites
  const favorites: number[] = [];
  await driver.tableClient.withSession(async (session) => {
    const result = await session.executeQuery("SELECT slot_index, person_id FROM favorites ORDER BY slot_index;");
    for (const row of result.resultSets[0]?.rows || []) {
      favorites.push(Number(row.items?.[1]?.uint64Value || 0));
    }
  });

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
      UPSERT INTO persons (id, sex, first_name, last_name, father_id, mother_id,
        birth_place, birth_day, death_place, death_day, address,
        order_by_dad, order_by_mom, order_by_spouse, marry_day)
      VALUES (${p.id}ul, ${p.sex}ut, "${esc(p.firstName)}"u, "${esc(p.lastName)}"u,
        ${p.fatherId}ul, ${p.motherId}ul, "${esc(p.birthPlace)}"u, "${esc(p.birthDay)}"u,
        "${esc(p.deathPlace)}"u, "${esc(p.deathDay)}"u, "${esc(p.address)}"u,
        ${p.orderByDad}u, ${p.orderByMom}u, ${p.orderBySpouse}u, "${esc(p.marryDay)}"u);
    `);
  });
}

export async function deletePerson(id: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`DELETE FROM persons WHERE id = ${id}ul;`);
    await session.executeQuery(`DELETE FROM spouses WHERE person_id = ${id}ul OR spouse_id = ${id}ul;`);
    await session.executeQuery(`DELETE FROM children WHERE parent_id = ${id}ul OR child_id = ${id}ul;`);
  });
}

// ─── Relationship management ────────────────────────────

export async function addSpouse(personId: number, spouseId: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      UPSERT INTO spouses (person_id, spouse_id) VALUES (${personId}ul, ${spouseId}ul);
    `);
    await session.executeQuery(`
      UPSERT INTO spouses (person_id, spouse_id) VALUES (${spouseId}ul, ${personId}ul);
    `);
  });
}

export async function removeSpouse(personId: number, spouseId: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`DELETE FROM spouses WHERE person_id = ${personId}ul AND spouse_id = ${spouseId}ul;`);
    await session.executeQuery(`DELETE FROM spouses WHERE person_id = ${spouseId}ul AND spouse_id = ${personId}ul;`);
  });
}

export async function addChild(parentId: number, childId: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`
      UPSERT INTO children (parent_id, child_id) VALUES (${parentId}ul, ${childId}ul);
    `);
  });
}

export async function removeChild(parentId: number, childId: number): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`DELETE FROM children WHERE parent_id = ${parentId}ul AND child_id = ${childId}ul;`);
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
      UPSERT INTO users (id, login, password_hash, role, created_at)
      VALUES ("${esc(user.id)}"u, "${esc(user.login)}"u, "${esc(user.passwordHash)}"u,
              "${esc(user.role)}"u, "${esc(user.createdAt)}"u);
    `);
  });
}

export async function deleteUserFromYdb(id: string): Promise<void> {
  const driver = await getYdbDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(`DELETE FROM users WHERE id = "${esc(id)}"u;`);
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
    await session.executeQuery(`UPSERT INTO app_config (key, value) VALUES ("${esc(key)}"u, "${esc(value)}"u);`);
  });
}
