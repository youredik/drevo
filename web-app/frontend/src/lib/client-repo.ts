/**
 * Client-side DataRepository — mirrors backend logic for instant local computation.
 * All person lookups, search, events, stats, tree, and kinship are computed locally
 * from a single data bundle fetched once on app load (~57KB gzipped for 2933 persons).
 */

import type { Person, PersonBrief, PersonCard, SearchResult, EventItem, TreeNode, KinshipResult, StatsData } from "./api";

// ─── Utils (ported from backend shared/utils.ts) ──────

function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === "") return null;
  const trimmed = dateStr.trim();
  const fullMatch = trimmed.match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);
  if (fullMatch) return new Date(parseInt(fullMatch[3]), parseInt(fullMatch[2]) - 1, parseInt(fullMatch[1]));
  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) return new Date(parseInt(yearMatch[1]), 0, 1);
  return null;
}

function isFullDate(dateStr: string): boolean {
  return /^\d{1,2}\.\d{2}\.\d{4}$/.test(dateStr.trim());
}

function calculateAge(birthDay: string, deathDay: string): string {
  const birth = parseDate(birthDay);
  if (!birth) return "";
  const end = deathDay && deathDay !== "?" ? parseDate(deathDay) : new Date();
  if (!end) return "";
  let years = end.getFullYear() - birth.getFullYear();
  let months = end.getMonth() - birth.getMonth();
  let days = end.getDate() - birth.getDate();
  if (days < 0) { months--; days += new Date(end.getFullYear(), end.getMonth(), 0).getDate(); }
  if (months < 0) { years--; months += 12; }
  if (years < 0) return "";
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}${yearSuffix(years)}`);
  if (months > 0) parts.push(`${months}м`);
  if (days > 0) parts.push(`${days}д`);
  return parts.join(" ") || "0д";
}

function yearSuffix(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return "л";
  if (last >= 1 && last <= 4) return "г";
  return "л";
}

function calculateAgeNumber(birthDay: string, deathDay: string): number {
  const birth = parseDate(birthDay);
  if (!birth) return -1;
  const end = deathDay && deathDay !== "?" ? parseDate(deathDay) : new Date();
  if (!end) return -1;
  let years = end.getFullYear() - birth.getFullYear();
  if (end.getMonth() - birth.getMonth() < 0 || (end.getMonth() === birth.getMonth() && end.getDate() < birth.getDate())) years--;
  return years;
}

function isPersonAlive(p: Person): boolean { return !p.deathDay || p.deathDay.trim() === "" || p.deathDay.trim() === "?"; }
function getPersonFullName(p: Person): string { return `${p.lastName} ${p.firstName}`.trim(); }

function getDayMonth(dateStr: string): string | null {
  if (!isFullDate(dateStr)) return null;
  const match = dateStr.trim().match(/^(\d{1,2})\.(\d{2})\.\d{4}$/);
  return match ? `${match[1].padStart(2, "0")}.${match[2]}` : null;
}

const ZODIAC_SIGNS = [
  { name: "Козерог", icon: "♑", from: [12, 22], to: [1, 19] },
  { name: "Водолей", icon: "♒", from: [1, 20], to: [2, 18] },
  { name: "Рыбы", icon: "♓", from: [2, 19], to: [3, 20] },
  { name: "Овен", icon: "♈", from: [3, 21], to: [4, 19] },
  { name: "Телец", icon: "♉", from: [4, 20], to: [5, 20] },
  { name: "Близнецы", icon: "♊", from: [5, 21], to: [6, 20] },
  { name: "Рак", icon: "♋", from: [6, 21], to: [7, 22] },
  { name: "Лев", icon: "♌", from: [7, 23], to: [8, 22] },
  { name: "Дева", icon: "♍", from: [8, 23], to: [9, 22] },
  { name: "Весы", icon: "♎", from: [9, 23], to: [10, 22] },
  { name: "Скорпион", icon: "♏", from: [10, 23], to: [11, 21] },
  { name: "Стрелец", icon: "♐", from: [11, 22], to: [12, 21] },
] as const;

function getZodiac(birthDay: string): { name: string; icon: string } | null {
  if (!isFullDate(birthDay)) return null;
  const date = parseDate(birthDay);
  if (!date) return null;
  const month = date.getMonth() + 1, day = date.getDate();
  for (const sign of ZODIAC_SIGNS) {
    const [fromM, fromD] = sign.from, [toM, toD] = sign.to;
    if (fromM === 12 && toM === 1) {
      if ((month === 12 && day >= fromD) || (month === 1 && day <= toD)) return { name: sign.name, icon: sign.icon };
    } else {
      if ((month === fromM && day >= fromD) || (month === toM && day <= toD)) return { name: sign.name, icon: sign.icon };
    }
  }
  return null;
}

const MONTH_NAMES: Record<string, string> = {
  "январь": ".01.", "января": ".01.", "янв": ".01.",
  "февраль": ".02.", "февраля": ".02.", "фев": ".02.",
  "март": ".03.", "марта": ".03.", "мар": ".03.",
  "апрель": ".04.", "апреля": ".04.", "апр": ".04.",
  "май": ".05.", "мая": ".05.",
  "июнь": ".06.", "июня": ".06.", "июн": ".06.",
  "июль": ".07.", "июля": ".07.", "июл": ".07.",
  "август": ".08.", "августа": ".08.", "авг": ".08.",
  "сентябрь": ".09.", "сентября": ".09.", "сен": ".09.",
  "октябрь": ".10.", "октября": ".10.", "окт": ".10.",
  "ноябрь": ".11.", "ноября": ".11.", "ноя": ".11.",
  "декабрь": ".12.", "декабря": ".12.", "дек": ".12.",
};

function normalizeSearchQuery(query: string): string {
  let q = query.toLowerCase().trim();
  for (const [name, num] of Object.entries(MONTH_NAMES)) q = q.replace(name, num);
  return q;
}

// ─── Data Bundle interface ────────────────────────────

export interface DataBundle {
  persons: Person[];
  favorites: number[];
  photos: Record<number, string[]>;
  bios: { open: number[]; locked: number[] };
  version: number;
}

// ─── Client-side DataRepository ───────────────────────

export class ClientRepo {
  private persons: Map<number, Person>;
  private favorites: number[];
  private photos: Record<number, string[]>;
  private openBios: Set<number>;
  private lockedBios: Set<number>;
  private searchIndex: Map<number, string>;
  private briefCache: Map<number, PersonBrief> = new Map();

  constructor(bundle: DataBundle) {
    this.persons = new Map(bundle.persons.map(p => [p.id, p]));
    this.favorites = bundle.favorites;
    this.photos = bundle.photos;
    this.openBios = new Set(bundle.bios.open);
    this.lockedBios = new Set(bundle.bios.locked);
    this.searchIndex = new Map();
    for (const p of bundle.persons) {
      this.searchIndex.set(p.id, [
        getPersonFullName(p), p.address, p.birthPlace, p.birthDay, p.deathDay, p.marryDay,
      ].join(" ").toLowerCase());
    }
  }

  private getDefaultPhoto(p: Person): string {
    const photos = this.photos[p.id];
    return photos && photos.length > 0 ? photos[0] : (p.sex === 1 ? "m.jpg" : "w.jpg");
  }

  private toBrief(p: Person): PersonBrief {
    const cached = this.briefCache.get(p.id);
    if (cached) return cached;
    const brief: PersonBrief = {
      id: p.id, firstName: p.firstName, lastName: p.lastName, sex: p.sex,
      birthDay: p.birthDay, deathDay: p.deathDay,
      photo: this.getDefaultPhoto(p), childCount: p.childrenIds.length,
      age: calculateAge(p.birthDay, p.deathDay),
    };
    this.briefCache.set(p.id, brief);
    return brief;
  }

  // ─── Public API (mirrors backend) ──────────────────

  getPersonCard(id: number): PersonCard | null {
    const p = this.persons.get(id);
    if (!p) return null;
    const father = p.fatherId ? this.persons.get(p.fatherId) : undefined;
    const mother = p.motherId ? this.persons.get(p.motherId) : undefined;
    const photos = this.photos[p.id];
    const zodiac = getZodiac(p.birthDay);
    return {
      person: p,
      father: father ? this.toBrief(father) : null,
      mother: mother ? this.toBrief(mother) : null,
      spouses: p.spouseIds.map(id => this.persons.get(id)).filter((s): s is Person => !!s).map(s => this.toBrief(s)),
      children: p.childrenIds.map(id => this.persons.get(id)).filter((c): c is Person => !!c).map(c => this.toBrief(c)),
      photos: photos && photos.length > 0 ? photos : [this.getDefaultPhoto(p)],
      age: calculateAge(p.birthDay, p.deathDay),
      zodiac: zodiac ? `${zodiac.icon} ${zodiac.name}` : "",
      hasBio: this.openBios.has(p.id),
      hasLockedBio: this.lockedBios.has(p.id),
    };
  }

  getAllPersons(page = 1, limit = 50): { items: PersonBrief[]; total: number; page: number; limit: number } {
    const all = Array.from(this.persons.values()).sort((a, b) => a.id - b.id).map(p => this.toBrief(p));
    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length, page, limit };
  }

  search(query: string): { results: SearchResult[]; count: number } {
    const q = normalizeSearchQuery(query);
    if (q.length === 0) return { results: [], count: 0 };
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return { results: [], count: 0 };
    const results: SearchResult[] = [];
    for (const person of this.persons.values()) {
      const haystack = this.searchIndex.get(person.id) || "";
      let matchField = "";
      if (tokens.length === 1 && tokens[0] === String(person.id)) {
        matchField = "id";
      } else {
        if (!tokens.every(t => haystack.includes(t))) continue;
        const fields: [string, string][] = [
          ["name", getPersonFullName(person).toLowerCase()],
          ["address", person.address.toLowerCase()],
          ["birthPlace", person.birthPlace.toLowerCase()],
          ["birthDay", person.birthDay.toLowerCase()],
          ["deathDay", person.deathDay.toLowerCase()],
          ["marryDay", person.marryDay.toLowerCase()],
        ];
        for (const [field, text] of fields) {
          if (tokens.some(t => text.includes(t))) { matchField = field; break; }
        }
        if (!matchField) matchField = "name";
      }
      results.push({
        id: person.id, firstName: person.firstName, lastName: person.lastName,
        sex: person.sex, birthDay: person.birthDay, deathDay: person.deathDay,
        address: person.address, age: calculateAge(person.birthDay, person.deathDay),
        photo: this.getDefaultPhoto(person), matchField,
      });
    }
    return { results, count: results.length };
  }

  getEvents(days = 5, includeYesterday = true): { events: EventItem[]; count: number } {
    const now = new Date();
    const today = new Date(now.getTime() + 3 * 60 * 60 * 1000); // Moscow time
    const events: EventItem[] = [];
    for (const person of this.persons.values()) {
      // Birthdays
      const birthDM = getDayMonth(person.birthDay);
      if (birthDM) {
        const du = this.daysUntilEvent(birthDM, today);
        if ((du >= 0 && du <= days) || (includeYesterday && du === -1)) {
          const eventYear = new Date(today.getTime() + du * 86400000).getUTCFullYear();
          const birthParts = person.birthDay.split(".");
          const birthYear = birthParts.length >= 3 ? parseInt(birthParts[2]) : 0;
          events.push({
            id: person.id, firstName: person.firstName, lastName: person.lastName,
            sex: person.sex, birthDay: person.birthDay, deathDay: person.deathDay,
            marryDay: person.marryDay, eventType: "birthday", eventDate: birthDM,
            yearsCount: birthYear > 0 ? eventYear - birthYear : 0, daysUntil: du,
            photo: this.getDefaultPhoto(person),
          });
        }
      }
      // Memorial days
      const deathDM = getDayMonth(person.deathDay);
      if (deathDM) {
        const du = this.daysUntilEvent(deathDM, today);
        if ((du >= 0 && du <= days) || (includeYesterday && du === -1)) {
          const eventYear = new Date(today.getTime() + du * 86400000).getUTCFullYear();
          const yearsSinceDeath = eventYear - new Date(person.deathDay.split(".").reverse().join("-")).getFullYear();
          events.push({
            id: person.id, firstName: person.firstName, lastName: person.lastName,
            sex: person.sex, birthDay: person.birthDay, deathDay: person.deathDay,
            marryDay: person.marryDay, eventType: "memorial", eventDate: deathDM,
            yearsCount: yearsSinceDeath, daysUntil: du, photo: this.getDefaultPhoto(person),
          });
        }
      }
      // Wedding anniversaries
      const marryDM = getDayMonth(person.marryDay);
      if (marryDM && person.spouseIds.length > 0) {
        const du = this.daysUntilEvent(marryDM, today);
        if ((du >= 0 && du <= days) || (includeYesterday && du === -1)) {
          const eventYear = new Date(today.getTime() + du * 86400000).getUTCFullYear();
          const yearsSinceMarriage = eventYear - new Date(person.marryDay.split(".").reverse().join("-")).getFullYear();
          events.push({
            id: person.id, firstName: person.firstName, lastName: person.lastName,
            sex: person.sex, birthDay: person.birthDay, deathDay: person.deathDay,
            marryDay: person.marryDay, eventType: "wedding", eventDate: marryDM,
            yearsCount: yearsSinceMarriage, daysUntil: du, photo: this.getDefaultPhoto(person),
          });
        }
      }
    }
    events.sort((a, b) => a.daysUntil - b.daysUntil);
    return { events, count: events.length };
  }

  private daysUntilEvent(dayMonth: string, today: Date): number {
    const [day, month] = dayMonth.split(".").map(Number);
    const todayTs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const eventTs = Date.UTC(today.getUTCFullYear(), month - 1, day);
    const diff = Math.round((eventTs - todayTs) / 86400000);
    if (diff < -1) return Math.round((Date.UTC(today.getUTCFullYear() + 1, month - 1, day) - todayTs) / 86400000);
    return diff;
  }

  getStats(): StatsData {
    let maleCount = 0, femaleCount = 0, aliveCount = 0, deceasedCount = 0;
    const ageDistribution: Record<string, number> = { "0-49": 0, "50-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-99": 0, "100+": 0 };
    const longestLived: { person: Person; age: number }[] = [];
    for (const person of this.persons.values()) {
      if (person.sex === 1) maleCount++; else femaleCount++;
      if (isPersonAlive(person)) aliveCount++; else deceasedCount++;
      const age = calculateAgeNumber(person.birthDay, person.deathDay);
      if (age >= 0) {
        if (age < 50) ageDistribution["0-49"]++; else if (age < 60) ageDistribution["50-59"]++;
        else if (age < 70) ageDistribution["60-69"]++; else if (age < 80) ageDistribution["70-79"]++;
        else if (age < 90) ageDistribution["80-89"]++; else if (age < 100) ageDistribution["90-99"]++;
        else ageDistribution["100+"]++;
        if (age >= 90) longestLived.push({ person, age });
      }
    }
    longestLived.sort((a, b) => b.age - a.age);
    return { totalPersons: this.persons.size, maleCount, femaleCount, aliveCount, deceasedCount, ageDistribution, longestLived: longestLived.slice(0, 20).map(({ person }) => this.toBrief(person)) };
  }

  getAncestorTree(id: number, maxDepth = 13): TreeNode | null {
    const person = this.persons.get(id);
    if (!person) return null;
    return this.buildNode(person, 0, maxDepth, "ancestors");
  }

  getDescendantTree(id: number, maxDepth = 13): TreeNode | null {
    const person = this.persons.get(id);
    if (!person) return null;
    return this.buildNode(person, 0, maxDepth, "descendants");
  }

  private buildNode(person: Person, depth: number, maxDepth: number, type: "ancestors" | "descendants"): TreeNode {
    const children: TreeNode[] = [];
    if (depth < maxDepth) {
      if (type === "ancestors") {
        const father = person.fatherId ? this.persons.get(person.fatherId) : undefined;
        const mother = person.motherId ? this.persons.get(person.motherId) : undefined;
        if (father) children.push(this.buildNode(father, depth + 1, maxDepth, type));
        if (mother) children.push(this.buildNode(mother, depth + 1, maxDepth, type));
      } else {
        for (const childId of person.childrenIds) {
          const child = this.persons.get(childId);
          if (child) children.push(this.buildNode(child, depth + 1, maxDepth, type));
        }
      }
    }
    return {
      id: person.id, firstName: person.firstName, lastName: person.lastName,
      sex: person.sex, isAlive: isPersonAlive(person), photo: this.getDefaultPhoto(person),
      birthDay: person.birthDay, deathDay: person.deathDay, children,
    };
  }

  checkKinship(id1: number, id2: number): KinshipResult | null {
    const p1 = this.persons.get(id1), p2 = this.persons.get(id2);
    if (!p1 || !p2) return null;
    const anc1 = this.getAncestorSet(id1), anc2 = this.getAncestorSet(id2);
    let commonAncestorId: number | null = null;
    for (const [ancId] of anc1) { if (anc2.has(ancId)) { commonAncestorId = ancId; break; } }
    const pathFrom1 = commonAncestorId ? this.getPathToAncestor(id1, commonAncestorId).map(id => this.toBrief(this.persons.get(id)!)) : [];
    const pathFrom2 = commonAncestorId ? this.getPathToAncestor(id2, commonAncestorId).map(id => this.toBrief(this.persons.get(id)!)) : [];
    const commonPerson = commonAncestorId ? this.persons.get(commonAncestorId) : undefined;
    return {
      person1: this.toBrief(p1), person2: this.toBrief(p2),
      commonAncestor: commonPerson ? this.toBrief(commonPerson) : null,
      pathFromPerson1: pathFrom1, pathFromPerson2: pathFrom2,
      relationship: id1 === id2 ? "Один и тот же человек" : !commonAncestorId ? "Кровного родства нет" : this.describeRelationship(pathFrom1.length, pathFrom2.length),
    };
  }

  private getAncestorSet(id: number): Map<number, number> {
    const ancestors = new Map<number, number>();
    const queue: [number, number][] = [[id, 0]];
    let head = 0;
    while (head < queue.length) {
      const [currentId, depth] = queue[head++];
      if (ancestors.has(currentId)) continue;
      ancestors.set(currentId, depth);
      const person = this.persons.get(currentId);
      if (!person) continue;
      if (person.fatherId && !ancestors.has(person.fatherId)) queue.push([person.fatherId, depth + 1]);
      if (person.motherId && !ancestors.has(person.motherId)) queue.push([person.motherId, depth + 1]);
    }
    return ancestors;
  }

  private getPathToAncestor(fromId: number, toId: number): number[] {
    if (fromId === toId) return [fromId];
    const visited = new Set<number>(), parent = new Map<number, number>(), queue = [fromId];
    let head = 0;
    visited.add(fromId);
    while (head < queue.length) {
      const currentId = queue[head++];
      if (currentId === toId) {
        const path: number[] = [];
        let cur = toId;
        while (cur !== fromId) { path.push(cur); cur = parent.get(cur)!; }
        path.push(fromId);
        return path.reverse();
      }
      const person = this.persons.get(currentId);
      if (!person) continue;
      for (const nextId of [person.fatherId, person.motherId]) {
        if (nextId && !visited.has(nextId)) { visited.add(nextId); parent.set(nextId, currentId); queue.push(nextId); }
      }
    }
    return [];
  }

  private describeRelationship(d1: number, d2: number): string {
    if (d1 === 0 && d2 === 0) return "Один и тот же человек";
    if (d1 === 1 && d2 === 1) return "Брат/Сестра";
    if (d1 === 0 && d2 === 1) return "Родитель";
    if (d1 === 1 && d2 === 0) return "Ребёнок";
    if (d1 === 0 && d2 === 2) return "Дедушка/Бабушка";
    if (d1 === 2 && d2 === 0) return "Внук/Внучка";
    if (d1 === 1 && d2 === 2) return "Дядя/Тётя";
    if (d1 === 2 && d2 === 1) return "Племянник/Племянница";
    if (d1 === 2 && d2 === 2) return "Двоюродный брат/сестра";
    if (d1 === 0) return `Предок (${d2} поколений)`;
    if (d2 === 0) return `Потомок (${d1} поколений)`;
    return `Родственники (${d1}/${d2} поколений от общего предка)`;
  }

  getFavorites(): number[] { return this.favorites; }
  isFavorite(personId: number): boolean { return this.favorites.includes(personId); }

  getFavoriteCards(): PersonCard[] {
    return this.favorites.map(id => this.getPersonCard(id)).filter((c): c is PersonCard => c !== null);
  }
}
