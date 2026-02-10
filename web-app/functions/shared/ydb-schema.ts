import { getYdbDriver } from "./ydb-client.js";
import ydb from "ydb-sdk";
import { parsePersonsCsv, parsePersonsCsvString, parseFavoritesCsv } from "./csv-parser.js";
import type { Person } from "./types.js";

const { Column, TableDescription, Types } = ydb;

// ─── Table DDL ───────────────────────────────────────────

const TABLES = {
  persons: new TableDescription()
    .withColumn(new Column("id", Types.optional(Types.UINT64)))
    .withColumn(new Column("sex", Types.optional(Types.UINT8)))
    .withColumn(new Column("first_name", Types.optional(Types.UTF8)))
    .withColumn(new Column("last_name", Types.optional(Types.UTF8)))
    .withColumn(new Column("father_id", Types.optional(Types.UINT64)))
    .withColumn(new Column("mother_id", Types.optional(Types.UINT64)))
    .withColumn(new Column("birth_place", Types.optional(Types.UTF8)))
    .withColumn(new Column("birth_day", Types.optional(Types.UTF8)))
    .withColumn(new Column("death_place", Types.optional(Types.UTF8)))
    .withColumn(new Column("death_day", Types.optional(Types.UTF8)))
    .withColumn(new Column("address", Types.optional(Types.UTF8)))
    .withColumn(new Column("order_by_dad", Types.optional(Types.UINT32)))
    .withColumn(new Column("order_by_mom", Types.optional(Types.UINT32)))
    .withColumn(new Column("order_by_spouse", Types.optional(Types.UINT32)))
    .withColumn(new Column("marry_day", Types.optional(Types.UTF8)))
    .withPrimaryKey("id"),

  spouses: new TableDescription()
    .withColumn(new Column("person_id", Types.optional(Types.UINT64)))
    .withColumn(new Column("spouse_id", Types.optional(Types.UINT64)))
    .withPrimaryKeys("person_id", "spouse_id"),

  children: new TableDescription()
    .withColumn(new Column("parent_id", Types.optional(Types.UINT64)))
    .withColumn(new Column("child_id", Types.optional(Types.UINT64)))
    .withPrimaryKeys("parent_id", "child_id"),

  users: new TableDescription()
    .withColumn(new Column("id", Types.optional(Types.UTF8)))
    .withColumn(new Column("login", Types.optional(Types.UTF8)))
    .withColumn(new Column("password_hash", Types.optional(Types.UTF8)))
    .withColumn(new Column("role", Types.optional(Types.UTF8)))
    .withColumn(new Column("created_at", Types.optional(Types.UTF8)))
    .withPrimaryKey("id"),

  app_config: new TableDescription()
    .withColumn(new Column("key", Types.optional(Types.UTF8)))
    .withColumn(new Column("value", Types.optional(Types.UTF8)))
    .withPrimaryKey("key"),

  favorites: new TableDescription()
    .withColumn(new Column("slot_index", Types.optional(Types.UINT32)))
    .withColumn(new Column("person_id", Types.optional(Types.UINT64)))
    .withPrimaryKey("slot_index"),

  audit_logs: new TableDescription()
    .withColumn(new Column("id", Types.optional(Types.UTF8)))
    .withColumn(new Column("timestamp", Types.optional(Types.UTF8)))
    .withColumn(new Column("user_id", Types.optional(Types.UTF8)))
    .withColumn(new Column("user_login", Types.optional(Types.UTF8)))
    .withColumn(new Column("action", Types.optional(Types.UTF8)))
    .withColumn(new Column("resource_type", Types.optional(Types.UTF8)))
    .withColumn(new Column("resource_id", Types.optional(Types.UTF8)))
    .withColumn(new Column("details", Types.optional(Types.UTF8)))
    .withPrimaryKey("id"),
};

// ─── Ensure tables exist ────────────────────────────────

export async function ensureTables(): Promise<void> {
  const driver = await getYdbDriver();

  await driver.tableClient.withSession(async (session) => {
    for (const [name, desc] of Object.entries(TABLES)) {
      try {
        await session.createTable(name, desc);
        console.log(`Table '${name}' created`);
      } catch (e: any) {
        // Table already exists — ignore
        if (e.message?.includes("ALREADY_EXISTS") || e.issues?.some((i: any) => i.message?.includes("already exists"))) {
          console.log(`Table '${name}' already exists`);
        } else {
          throw e;
        }
      }
    }
  });
}

// ─── Migration: CSV → YDB ───────────────────────────────

export async function migrateFromCsv(csvPath: string, favPath?: string): Promise<number> {
  const driver = await getYdbDriver();
  const persons = parsePersonsCsv(csvPath);

  // Check if data already exists
  const countResult = await driver.tableClient.withSession(async (session) => {
    const result = await session.executeQuery("SELECT COUNT(*) AS cnt FROM persons;");
    const rows = result.resultSets[0]?.rows || [];
    return rows.length > 0 ? Number(rows[0].items?.[0]?.uint64Value || 0) : 0;
  });

  if (countResult > 0) {
    console.log(`YDB already has ${countResult} persons, skipping migration`);
    return countResult;
  }

  console.log(`Migrating ${persons.size} persons from CSV to YDB...`);

  // Batch upsert persons
  const personBatch: Person[] = Array.from(persons.values());
  const BATCH_SIZE = 50;

  for (let i = 0; i < personBatch.length; i += BATCH_SIZE) {
    const batch = personBatch.slice(i, i + BATCH_SIZE);
    await upsertPersonsBatch(driver, batch);
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= personBatch.length) {
      console.log(`  Persons: ${Math.min(i + BATCH_SIZE, personBatch.length)} / ${personBatch.length}`);
    }
  }

  // Extract and insert spouse relationships
  const spousePairs = new Set<string>();
  for (const person of persons.values()) {
    for (const spouseId of person.spouseIds) {
      const key = [Math.min(person.id, spouseId), Math.max(person.id, spouseId)].join(",");
      if (!spousePairs.has(key)) {
        spousePairs.add(key);
      }
    }
  }

  const spouseRows: { personId: number; spouseId: number }[] = [];
  for (const pair of spousePairs) {
    const [a, b] = pair.split(",").map(Number);
    spouseRows.push({ personId: a, spouseId: b });
    spouseRows.push({ personId: b, spouseId: a });
  }

  for (let i = 0; i < spouseRows.length; i += BATCH_SIZE) {
    const batch = spouseRows.slice(i, i + BATCH_SIZE);
    await upsertSpousesBatch(driver, batch);
  }
  console.log(`  Spouses: ${spouseRows.length} rows`);

  // Extract and insert child relationships
  const childRows: { parentId: number; childId: number }[] = [];
  for (const person of persons.values()) {
    for (const childId of person.childrenIds) {
      childRows.push({ parentId: person.id, childId });
    }
  }

  for (let i = 0; i < childRows.length; i += BATCH_SIZE) {
    const batch = childRows.slice(i, i + BATCH_SIZE);
    await upsertChildrenBatch(driver, batch);
  }
  console.log(`  Children: ${childRows.length} rows`);

  // Migrate favorites
  if (favPath) {
    try {
      const favIds = parseFavoritesCsv(favPath);
      for (let slot = 0; slot < favIds.length; slot++) {
        await driver.tableClient.withSession(async (session) => {
          await session.executeQuery(`
            UPSERT INTO favorites (slot_index, person_id) VALUES (${slot}u, ${favIds[slot]}ul);
          `);
        });
      }
      console.log(`  Favorites: ${favIds.length} slots`);
    } catch {
      console.log("  Favorites: skipped (no file)");
    }
  }

  console.log(`Migration complete: ${persons.size} persons`);
  return persons.size;
}

// ─── Migration from CSV string (for import API) ─────────

export async function migrateFromCsvString(csvContent: string): Promise<number> {
  const driver = await getYdbDriver();
  const persons = parsePersonsCsvString(csvContent);

  if (persons.size === 0) return 0;

  // Clear existing data
  await driver.tableClient.withSession(async (session: any) => {
    await session.executeQuery("DELETE FROM persons;");
    await session.executeQuery("DELETE FROM spouses;");
    await session.executeQuery("DELETE FROM children;");
  });

  console.log(`Importing ${persons.size} persons from CSV...`);

  const personBatch: Person[] = Array.from(persons.values());
  const BATCH_SIZE = 50;

  for (let i = 0; i < personBatch.length; i += BATCH_SIZE) {
    const batch = personBatch.slice(i, i + BATCH_SIZE);
    await upsertPersonsBatch(driver, batch);
  }

  const spousePairs = new Set<string>();
  for (const person of persons.values()) {
    for (const spouseId of person.spouseIds) {
      const key = [Math.min(person.id, spouseId), Math.max(person.id, spouseId)].join(",");
      spousePairs.add(key);
    }
  }

  const spouseRows: { personId: number; spouseId: number }[] = [];
  for (const pair of spousePairs) {
    const [a, b] = pair.split(",").map(Number);
    spouseRows.push({ personId: a, spouseId: b });
    spouseRows.push({ personId: b, spouseId: a });
  }

  for (let i = 0; i < spouseRows.length; i += BATCH_SIZE) {
    const batch = spouseRows.slice(i, i + BATCH_SIZE);
    await upsertSpousesBatch(driver, batch);
  }

  const childRows: { parentId: number; childId: number }[] = [];
  for (const person of persons.values()) {
    for (const childId of person.childrenIds) {
      childRows.push({ parentId: person.id, childId });
    }
  }

  for (let i = 0; i < childRows.length; i += BATCH_SIZE) {
    const batch = childRows.slice(i, i + BATCH_SIZE);
    await upsertChildrenBatch(driver, batch);
  }

  console.log(`Import complete: ${persons.size} persons, ${spouseRows.length} spouse rows, ${childRows.length} child rows`);
  return persons.size;
}

// ─── Batch upsert helpers ───────────────────────────────

async function upsertPersonsBatch(driver: any, batch: Person[]): Promise<void> {
  if (batch.length === 0) return;

  const values = batch
    .map(
      (p) =>
        `(${safeNum(p.id)}ul, ${safeNum(p.sex)}ut, "${esc(p.firstName)}"u, "${esc(p.lastName)}"u, ` +
        `${safeNum(p.fatherId)}ul, ${safeNum(p.motherId)}ul, "${esc(p.birthPlace)}"u, "${esc(p.birthDay)}"u, ` +
        `"${esc(p.deathPlace)}"u, "${esc(p.deathDay)}"u, "${esc(p.address)}"u, ` +
        `${safeNum(p.orderByDad)}u, ${safeNum(p.orderByMom)}u, ${safeNum(p.orderBySpouse)}u, "${esc(p.marryDay)}"u)`
    )
    .join(",\n");

  const query = `
    UPSERT INTO persons (id, sex, first_name, last_name, father_id, mother_id,
      birth_place, birth_day, death_place, death_day, address,
      order_by_dad, order_by_mom, order_by_spouse, marry_day)
    VALUES ${values};
  `;

  await driver.tableClient.withSession(async (session: any) => {
    await session.executeQuery(query);
  });
}

async function upsertSpousesBatch(driver: any, batch: { personId: number; spouseId: number }[]): Promise<void> {
  if (batch.length === 0) return;
  const values = batch.map((r) => `(${safeNum(r.personId)}ul, ${safeNum(r.spouseId)}ul)`).join(", ");
  await driver.tableClient.withSession(async (session: any) => {
    await session.executeQuery(`UPSERT INTO spouses (person_id, spouse_id) VALUES ${values};`);
  });
}

async function upsertChildrenBatch(driver: any, batch: { parentId: number; childId: number }[]): Promise<void> {
  if (batch.length === 0) return;
  const values = batch.map((r) => `(${safeNum(r.parentId)}ul, ${safeNum(r.childId)}ul)`).join(", ");
  await driver.tableClient.withSession(async (session: any) => {
    await session.executeQuery(`UPSERT INTO children (parent_id, child_id) VALUES ${values};`);
  });
}

function esc(s: string): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\0/g, "");
}

function safeNum(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
