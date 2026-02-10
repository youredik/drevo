import { readFileSync } from "fs";
import type { Person } from "./types.js";

export function parsePersonsCsvString(content: string): Map<number, Person> {
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  const persons = new Map<number, Person>();

  for (const line of lines) {
    const fields = line.split(";");
    if (fields.length < 17) continue;

    const id = parseInt(fields[0]);
    if (isNaN(id)) continue;

    const person: Person = {
      id,
      sex: parseInt(fields[1]) === 1 ? 1 : 0,
      lastName: fields[2]?.trim() || "",
      firstName: fields[3]?.trim() || "",
      fatherId: parseInt(fields[4]) || 0,
      motherId: parseInt(fields[5]) || 0,
      birthPlace: fields[6]?.trim() || "",
      birthDay: fields[7]?.trim() || "",
      deathPlace: fields[8]?.trim() || "",
      deathDay: fields[9]?.trim() || "",
      address: fields[10]?.trim() || "",
      spouseIds: parseIds(fields[11]),
      childrenIds: parseIds(fields[12]),
      orderByDad: parseInt(fields[13]) || 0,
      orderByMom: parseInt(fields[14]) || 0,
      orderBySpouse: parseInt(fields[15]) || 0,
      marryDay: fields[16]?.trim() || "",
    };

    persons.set(id, person);
  }

  return persons;
}

export function parsePersonsCsv(filePath: string): Map<number, Person> {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  const persons = new Map<number, Person>();

  for (const line of lines) {
    const fields = line.split(";");
    if (fields.length < 17) continue;

    const id = parseInt(fields[0]);
    if (isNaN(id)) continue;

    const person: Person = {
      id,
      sex: parseInt(fields[1]) === 1 ? 1 : 0,
      lastName: fields[2]?.trim() || "",
      firstName: fields[3]?.trim() || "",
      fatherId: parseInt(fields[4]) || 0,
      motherId: parseInt(fields[5]) || 0,
      birthPlace: fields[6]?.trim() || "",
      birthDay: fields[7]?.trim() || "",
      deathPlace: fields[8]?.trim() || "",
      deathDay: fields[9]?.trim() || "",
      address: fields[10]?.trim() || "",
      spouseIds: parseIds(fields[11]),
      childrenIds: parseIds(fields[12]),
      orderByDad: parseInt(fields[13]) || 0,
      orderByMom: parseInt(fields[14]) || 0,
      orderBySpouse: parseInt(fields[15]) || 0,
      marryDay: fields[16]?.trim() || "",
    };

    persons.set(id, person);
  }

  return persons;
}

function parseIds(field: string | undefined): number[] {
  if (!field || field.trim() === "") return [];
  return field
    .trim()
    .split(/\s+/)
    .map((s) => parseInt(s))
    .filter((n) => !isNaN(n) && n > 0);
}

export function parseFavoritesCsv(filePath: string): number[] {
  const content = readFileSync(filePath, "utf-8");
  const line = content.split("\n")[0]?.trim() || "";
  return line
    .split(";")
    .map((s) => parseInt(s))
    .filter((n) => !isNaN(n) && n > 0);
}
