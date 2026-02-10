import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { parsePersonsCsv, parseFavoritesCsv } from "./csv-parser.js";
import type {
  Person,
  PersonBrief,
  PersonCard,
  SearchResult,
  EventItem,
  TreeNode,
  KinshipResult,
  FamilyMember,
  StatsData,
} from "./types.js";
import {
  calculateAge,
  calculateAgeNumber,
  getZodiac,
  isPersonAlive,
  getPersonFullName,
  getDayMonth,
  normalizeSearchQuery,
  isFullDate,
} from "./utils.js";

export class DataRepository {
  private persons: Map<number, Person>;
  private favorites: number[];
  private mediaPath: string;
  private infoPath: string;
  private photoCache: Map<number, string[]> = new Map();

  constructor(csvPath: string, favPath: string, mediaPath: string, infoPath: string) {
    this.persons = parsePersonsCsv(csvPath);
    this.favorites = existsSync(favPath) ? parseFavoritesCsv(favPath) : [];
    this.mediaPath = mediaPath;
    this.infoPath = infoPath;
    this.buildPhotoCache();
  }

  // Alternative constructor: create from pre-loaded data (e.g. from YDB)
  static fromData(
    persons: Map<number, Person>,
    favorites: number[],
    mediaPath: string,
    infoPath: string
  ): DataRepository {
    const repo = Object.create(DataRepository.prototype) as DataRepository;
    repo.persons = persons;
    repo.favorites = favorites;
    repo.mediaPath = mediaPath;
    repo.infoPath = infoPath;
    repo.photoCache = new Map();
    repo.buildPhotoCache();
    return repo;
  }

  private buildPhotoCache(): void {
    if (!existsSync(this.mediaPath)) return;
    const files = readdirSync(this.mediaPath);
    for (const file of files) {
      const match = file.match(/^(\d+)#(\d+)\.jpg$/i);
      if (match) {
        const personId = parseInt(match[1]);
        if (!this.photoCache.has(personId)) {
          this.photoCache.set(personId, []);
        }
        this.photoCache.get(personId)!.push(file);
      }
    }
    // Sort photos by index
    for (const [, photos] of this.photoCache) {
      photos.sort((a, b) => {
        const idxA = parseInt(a.split("#")[1]);
        const idxB = parseInt(b.split("#")[1]);
        return idxA - idxB;
      });
    }
  }

  getPhotos(personId: number): string[] {
    return this.photoCache.get(personId) || [];
  }

  getDefaultPhoto(person: Person): string {
    const photos = this.getPhotos(person.id);
    if (photos.length > 0) return photos[0];
    return person.sex === 1 ? "m.jpg" : "w.jpg";
  }

  private toBrief(person: Person): PersonBrief {
    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      sex: person.sex,
      birthDay: person.birthDay,
      deathDay: person.deathDay,
      photo: this.getDefaultPhoto(person),
      childCount: person.childrenIds.length,
      age: calculateAge(person.birthDay, person.deathDay),
    };
  }

  // ─── Persons ────────────────────────────────────────

  getPerson(id: number): Person | undefined {
    return this.persons.get(id);
  }

  getPersonCard(id: number): PersonCard | null {
    const person = this.persons.get(id);
    if (!person) return null;

    const father = person.fatherId ? this.persons.get(person.fatherId) : undefined;
    const mother = person.motherId ? this.persons.get(person.motherId) : undefined;

    const spouses = person.spouseIds
      .map((sid) => this.persons.get(sid))
      .filter((s): s is Person => !!s)
      .map((s) => this.toBrief(s));

    const children = person.childrenIds
      .map((cid) => this.persons.get(cid))
      .filter((c): c is Person => !!c)
      .map((c) => this.toBrief(c));

    const photos = this.getPhotos(person.id);
    const zodiac = getZodiac(person.birthDay);

    return {
      person,
      father: father ? this.toBrief(father) : null,
      mother: mother ? this.toBrief(mother) : null,
      spouses,
      children,
      photos: photos.length > 0 ? photos : [this.getDefaultPhoto(person)],
      age: calculateAge(person.birthDay, person.deathDay),
      zodiac: zodiac ? `${zodiac.icon} ${zodiac.name}` : "",
      hasBio: existsSync(join(this.infoPath, `open#${person.id}`)),
      hasLockedBio: existsSync(join(this.infoPath, `lock#${person.id}`)),
    };
  }

  getAllPersons(): PersonBrief[] {
    return Array.from(this.persons.values())
      .sort((a, b) => a.id - b.id)
      .map((p) => this.toBrief(p));
  }

  getPersonCount(): number {
    return this.persons.size;
  }

  // ─── Search ─────────────────────────────────────────

  search(query: string): SearchResult[] {
    const q = normalizeSearchQuery(query);
    if (q.length === 0) return [];

    const results: SearchResult[] = [];

    for (const person of this.persons.values()) {
      let matchField = "";

      // ID match
      if (q === String(person.id)) {
        matchField = "id";
      }
      // Name match
      else if (
        person.firstName.toLowerCase().includes(q) ||
        person.lastName.toLowerCase().includes(q) ||
        getPersonFullName(person).toLowerCase().includes(q)
      ) {
        matchField = "name";
      }
      // Address match
      else if (person.address.toLowerCase().includes(q)) {
        matchField = "address";
      }
      // Birth place match
      else if (person.birthPlace.toLowerCase().includes(q)) {
        matchField = "birthPlace";
      }
      // Birth date match
      else if (person.birthDay.toLowerCase().includes(q)) {
        matchField = "birthDay";
      }
      // Death date match
      else if (person.deathDay.toLowerCase().includes(q)) {
        matchField = "deathDay";
      }
      // Marriage date match
      else if (person.marryDay.toLowerCase().includes(q)) {
        matchField = "marryDay";
      }

      if (matchField) {
        results.push({
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          sex: person.sex,
          birthDay: person.birthDay,
          deathDay: person.deathDay,
          address: person.address,
          age: calculateAge(person.birthDay, person.deathDay),
          matchField,
        });
      }
    }

    return results;
  }

  // ─── Events ─────────────────────────────────────────

  getEvents(days: number = 5, includeYesterday: boolean = true): EventItem[] {
    const today = new Date();
    const events: EventItem[] = [];

    for (const person of this.persons.values()) {
      // Birthdays
      const birthDM = getDayMonth(person.birthDay);
      if (birthDM) {
        const daysUntil = this.daysUntilEvent(birthDM, today);
        const inRange =
          (daysUntil >= 0 && daysUntil <= days) ||
          (includeYesterday && daysUntil === -1) ||
          (daysUntil > 350 && includeYesterday); // yesterday wrapping

        if (inRange || (includeYesterday && this.isYesterday(birthDM, today))) {
          const ageNum = calculateAgeNumber(person.birthDay, "");
          events.push({
            id: person.id,
            firstName: person.firstName,
            lastName: person.lastName,
            sex: person.sex,
            birthDay: person.birthDay,
            deathDay: person.deathDay,
            marryDay: person.marryDay,
            eventType: "birthday",
            eventDate: birthDM,
            yearsCount: ageNum >= 0 ? ageNum : 0,
            daysUntil: daysUntil < 0 ? daysUntil + 365 : daysUntil,
            photo: this.getDefaultPhoto(person),
          });
        }
      }

      // Memorial days (death anniversary)
      const deathDM = getDayMonth(person.deathDay);
      if (deathDM) {
        const daysUntil = this.daysUntilEvent(deathDM, today);
        if (
          (daysUntil >= 0 && daysUntil <= days) ||
          (includeYesterday && this.isYesterday(deathDM, today))
        ) {
          const deathDate = new Date(
            today.getFullYear(),
            parseInt(deathDM.split(".")[1]) - 1,
            parseInt(deathDM.split(".")[0])
          );
          const yearsSinceDeath = today.getFullYear() - (new Date(person.deathDay.split(".").reverse().join("-"))).getFullYear();
          events.push({
            id: person.id,
            firstName: person.firstName,
            lastName: person.lastName,
            sex: person.sex,
            birthDay: person.birthDay,
            deathDay: person.deathDay,
            marryDay: person.marryDay,
            eventType: "memorial",
            eventDate: deathDM,
            yearsCount: yearsSinceDeath,
            daysUntil: daysUntil < 0 ? 0 : daysUntil,
            photo: this.getDefaultPhoto(person),
          });
        }
      }

      // Wedding anniversaries
      const marryDM = getDayMonth(person.marryDay);
      if (marryDM && person.spouseIds.length > 0) {
        const daysUntil = this.daysUntilEvent(marryDM, today);
        // Avoid duplicate: only count for the person with lower ID
        const minSpouseId = Math.min(...person.spouseIds);
        if (
          person.id < minSpouseId &&
          ((daysUntil >= 0 && daysUntil <= days) ||
            (includeYesterday && this.isYesterday(marryDM, today)))
        ) {
          const marryDate = person.marryDay.split(".").reverse().join("-");
          const yearsSinceMarriage = today.getFullYear() - new Date(marryDate).getFullYear();
          events.push({
            id: person.id,
            firstName: person.firstName,
            lastName: person.lastName,
            sex: person.sex,
            birthDay: person.birthDay,
            deathDay: person.deathDay,
            marryDay: person.marryDay,
            eventType: "wedding",
            eventDate: marryDM,
            yearsCount: yearsSinceMarriage,
            daysUntil: daysUntil < 0 ? 0 : daysUntil,
            photo: this.getDefaultPhoto(person),
          });
        }
      }
    }

    events.sort((a, b) => a.daysUntil - b.daysUntil);
    return events;
  }

  private daysUntilEvent(dayMonth: string, today: Date): number {
    const [day, month] = dayMonth.split(".").map(Number);
    const eventThisYear = new Date(today.getFullYear(), month - 1, day);
    const diff = Math.floor(
      (eventThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diff;
  }

  private isYesterday(dayMonth: string, today: Date): boolean {
    return this.daysUntilEvent(dayMonth, today) === -1;
  }

  // ─── Tree ───────────────────────────────────────────

  getAncestorTree(id: number, maxDepth: number = 13): TreeNode | null {
    const person = this.persons.get(id);
    if (!person) return null;
    return this.buildAncestorNode(person, 0, maxDepth);
  }

  private buildAncestorNode(person: Person, depth: number, maxDepth: number): TreeNode {
    const children: TreeNode[] = [];
    if (depth < maxDepth) {
      const father = person.fatherId ? this.persons.get(person.fatherId) : undefined;
      const mother = person.motherId ? this.persons.get(person.motherId) : undefined;
      if (father) children.push(this.buildAncestorNode(father, depth + 1, maxDepth));
      if (mother) children.push(this.buildAncestorNode(mother, depth + 1, maxDepth));
    }

    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      sex: person.sex,
      isAlive: isPersonAlive(person),
      photo: this.getDefaultPhoto(person),
      children,
    };
  }

  getDescendantTree(id: number, maxDepth: number = 13): TreeNode | null {
    const person = this.persons.get(id);
    if (!person) return null;
    return this.buildDescendantNode(person, 0, maxDepth);
  }

  private buildDescendantNode(person: Person, depth: number, maxDepth: number): TreeNode {
    const children: TreeNode[] = [];
    if (depth < maxDepth) {
      for (const childId of person.childrenIds) {
        const child = this.persons.get(childId);
        if (child) children.push(this.buildDescendantNode(child, depth + 1, maxDepth));
      }
    }

    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      sex: person.sex,
      isAlive: isPersonAlive(person),
      photo: this.getDefaultPhoto(person),
      children,
    };
  }

  // ─── Kinship ────────────────────────────────────────

  checkKinship(id1: number, id2: number): KinshipResult | null {
    const p1 = this.persons.get(id1);
    const p2 = this.persons.get(id2);
    if (!p1 || !p2) return null;

    const ancestors1 = this.getAncestorSet(id1);
    const ancestors2 = this.getAncestorSet(id2);

    // Find common ancestor
    let commonAncestorId: number | null = null;
    for (const [ancId] of ancestors1) {
      if (ancestors2.has(ancId)) {
        commonAncestorId = ancId;
        break;
      }
    }

    const pathFrom1 = commonAncestorId
      ? this.getPathToAncestor(id1, commonAncestorId).map((id) => {
          const p = this.persons.get(id)!;
          return this.toBrief(p);
        })
      : [];

    const pathFrom2 = commonAncestorId
      ? this.getPathToAncestor(id2, commonAncestorId).map((id) => {
          const p = this.persons.get(id)!;
          return this.toBrief(p);
        })
      : [];

    const commonPerson = commonAncestorId ? this.persons.get(commonAncestorId) : undefined;

    return {
      person1: this.toBrief(p1),
      person2: this.toBrief(p2),
      commonAncestor: commonPerson ? this.toBrief(commonPerson) : null,
      pathFromPerson1: pathFrom1,
      pathFromPerson2: pathFrom2,
      relationship: this.describeRelationship(pathFrom1.length, pathFrom2.length),
    };
  }

  private getAncestorSet(id: number): Map<number, number> {
    const ancestors = new Map<number, number>(); // ancestorId -> depth
    const queue: [number, number][] = [[id, 0]];

    while (queue.length > 0) {
      const [currentId, depth] = queue.shift()!;
      if (ancestors.has(currentId)) continue;
      ancestors.set(currentId, depth);

      const person = this.persons.get(currentId);
      if (!person) continue;

      if (person.fatherId && !ancestors.has(person.fatherId)) {
        queue.push([person.fatherId, depth + 1]);
      }
      if (person.motherId && !ancestors.has(person.motherId)) {
        queue.push([person.motherId, depth + 1]);
      }
    }

    return ancestors;
  }

  private getPathToAncestor(fromId: number, toId: number): number[] {
    if (fromId === toId) return [fromId];

    const visited = new Set<number>();
    const parent = new Map<number, number>();
    const queue = [fromId];
    visited.add(fromId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (currentId === toId) {
        const path: number[] = [];
        let cur = toId;
        while (cur !== fromId) {
          path.push(cur);
          cur = parent.get(cur)!;
        }
        path.push(fromId);
        return path.reverse();
      }

      const person = this.persons.get(currentId);
      if (!person) continue;

      for (const nextId of [person.fatherId, person.motherId]) {
        if (nextId && !visited.has(nextId)) {
          visited.add(nextId);
          parent.set(nextId, currentId);
          queue.push(nextId);
        }
      }
    }

    return [];
  }

  private describeRelationship(depth1: number, depth2: number): string {
    if (depth1 === 0 && depth2 === 0) return "Один и тот же человек";
    if (depth1 === 1 && depth2 === 1) return "Брат/Сестра";
    if (depth1 === 0 && depth2 === 1) return "Родитель";
    if (depth1 === 1 && depth2 === 0) return "Ребёнок";
    if (depth1 === 0 && depth2 === 2) return "Дедушка/Бабушка";
    if (depth1 === 2 && depth2 === 0) return "Внук/Внучка";
    if (depth1 === 1 && depth2 === 2) return "Дядя/Тётя";
    if (depth1 === 2 && depth2 === 1) return "Племянник/Племянница";
    if (depth1 === 2 && depth2 === 2) return "Двоюродный брат/сестра";
    if (depth1 === 0) return `Предок (${depth2} поколений)`;
    if (depth2 === 0) return `Потомок (${depth1} поколений)`;
    return `Родственники (${depth1}/${depth2} поколений от общего предка)`;
  }

  // ─── Family ─────────────────────────────────────────

  getFamily(id: number): FamilyMember[] {
    const person = this.persons.get(id);
    if (!person) return [];

    const members: FamilyMember[] = [];

    // Self
    members.push({ person: this.toBrief(person), relation: "Я", category: "self" });

    // Parents
    const father = person.fatherId ? this.persons.get(person.fatherId) : undefined;
    const mother = person.motherId ? this.persons.get(person.motherId) : undefined;
    if (father) members.push({ person: this.toBrief(father), relation: "Отец", category: "parents" });
    if (mother) members.push({ person: this.toBrief(mother), relation: "Мать", category: "parents" });

    // Siblings
    const siblingIds = new Set<number>();
    if (father) father.childrenIds.forEach((cid) => siblingIds.add(cid));
    if (mother) mother.childrenIds.forEach((cid) => siblingIds.add(cid));
    siblingIds.delete(id);
    for (const sibId of siblingIds) {
      const sib = this.persons.get(sibId);
      if (sib) {
        members.push({
          person: this.toBrief(sib),
          relation: sib.sex === 1 ? "Брат" : "Сестра",
          category: "siblings",
        });
      }
    }

    // Children
    for (const childId of person.childrenIds) {
      const child = this.persons.get(childId);
      if (child) {
        members.push({
          person: this.toBrief(child),
          relation: child.sex === 1 ? "Сын" : "Дочь",
          category: "children",
        });
      }
    }

    // Grandchildren
    for (const childId of person.childrenIds) {
      const child = this.persons.get(childId);
      if (!child) continue;
      for (const gcId of child.childrenIds) {
        const gc = this.persons.get(gcId);
        if (gc) {
          members.push({
            person: this.toBrief(gc),
            relation: gc.sex === 1 ? "Внук" : "Внучка",
            category: "grandchildren",
          });
        }
      }
    }

    // Great-grandchildren
    for (const childId of person.childrenIds) {
      const child = this.persons.get(childId);
      if (!child) continue;
      for (const gcId of child.childrenIds) {
        const gc = this.persons.get(gcId);
        if (!gc) continue;
        for (const ggcId of gc.childrenIds) {
          const ggc = this.persons.get(ggcId);
          if (ggc) {
            members.push({
              person: this.toBrief(ggc),
              relation: ggc.sex === 1 ? "Правнук" : "Правнучка",
              category: "greatGrandchildren",
            });
          }
        }
      }
    }

    return members;
  }

  // ─── Stats ──────────────────────────────────────────

  getStats(): StatsData {
    let maleCount = 0;
    let femaleCount = 0;
    let aliveCount = 0;
    let deceasedCount = 0;
    const ageDistribution: Record<string, number> = {
      "0-49": 0, "50-59": 0, "60-69": 0, "70-79": 0,
      "80-89": 0, "90-99": 0, "100+": 0,
    };
    const longestLived: { person: Person; age: number }[] = [];

    for (const person of this.persons.values()) {
      if (person.sex === 1) maleCount++;
      else femaleCount++;

      if (isPersonAlive(person)) aliveCount++;
      else deceasedCount++;

      const age = calculateAgeNumber(person.birthDay, person.deathDay);
      if (age >= 0) {
        if (age < 50) ageDistribution["0-49"]++;
        else if (age < 60) ageDistribution["50-59"]++;
        else if (age < 70) ageDistribution["60-69"]++;
        else if (age < 80) ageDistribution["70-79"]++;
        else if (age < 90) ageDistribution["80-89"]++;
        else if (age < 100) ageDistribution["90-99"]++;
        else ageDistribution["100+"]++;

        if (age >= 90) {
          longestLived.push({ person, age });
        }
      }
    }

    longestLived.sort((a, b) => b.age - a.age);

    return {
      totalPersons: this.persons.size,
      maleCount,
      femaleCount,
      aliveCount,
      deceasedCount,
      ageDistribution,
      longestLived: longestLived.slice(0, 20).map(({ person }) => this.toBrief(person)),
    };
  }

  // ─── Bio ────────────────────────────────────────────

  getBio(personId: number, type: "open" | "lock"): string | null {
    const filePath = join(this.infoPath, `${type}#${personId}`);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  }

  // ─── Favorites ──────────────────────────────────────

  getFavorites(): number[] {
    return this.favorites;
  }

  addFavorite(personId: number): number {
    if (this.favorites.includes(personId)) return this.favorites.indexOf(personId);
    const emptySlot = this.favorites.indexOf(0);
    if (emptySlot >= 0) {
      this.favorites[emptySlot] = personId;
      return emptySlot;
    }
    if (this.favorites.length < 20) {
      this.favorites.push(personId);
      return this.favorites.length - 1;
    }
    return -1;
  }

  removeFavorite(personId: number): number {
    const slot = this.favorites.indexOf(personId);
    if (slot >= 0) this.favorites[slot] = 0;
    return slot;
  }

  isFavorite(personId: number): boolean {
    return this.favorites.includes(personId);
  }

  // ─── Today's events for a person ────────────────────

  getPersonTodayEvents(person: Person): { birthday: boolean; memorial: boolean; wedding: boolean } {
    const today = new Date();
    const todayDM = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}`;

    return {
      birthday: getDayMonth(person.birthDay) === todayDM,
      memorial: getDayMonth(person.deathDay) === todayDM,
      wedding: getDayMonth(person.marryDay) === todayDM,
    };
  }

  // ─── Mutations (update in-memory cache) ───────────────

  getNextId(): number {
    let maxId = 0;
    for (const id of this.persons.keys()) {
      if (id > maxId) maxId = id;
    }
    return maxId + 1;
  }

  addPerson(person: Person): void {
    this.persons.set(person.id, person);
  }

  updatePerson(id: number, updates: Partial<Person>): Person | null {
    const person = this.persons.get(id);
    if (!person) return null;
    Object.assign(person, updates);
    return person;
  }

  removePerson(id: number): boolean {
    const person = this.persons.get(id);
    if (!person) return false;

    // Remove from other persons' spouse/children lists
    for (const p of this.persons.values()) {
      p.spouseIds = p.spouseIds.filter((sid) => sid !== id);
      p.childrenIds = p.childrenIds.filter((cid) => cid !== id);
      if (p.fatherId === id) p.fatherId = 0;
      if (p.motherId === id) p.motherId = 0;
    }

    this.persons.delete(id);
    this.photoCache.delete(id);
    return true;
  }

  addSpouseRelation(personId: number, spouseId: number): void {
    const p1 = this.persons.get(personId);
    const p2 = this.persons.get(spouseId);
    if (p1 && !p1.spouseIds.includes(spouseId)) p1.spouseIds.push(spouseId);
    if (p2 && !p2.spouseIds.includes(personId)) p2.spouseIds.push(personId);
  }

  removeSpouseRelation(personId: number, spouseId: number): void {
    const p1 = this.persons.get(personId);
    const p2 = this.persons.get(spouseId);
    if (p1) p1.spouseIds = p1.spouseIds.filter((id) => id !== spouseId);
    if (p2) p2.spouseIds = p2.spouseIds.filter((id) => id !== personId);
  }

  addChildRelation(parentId: number, childId: number): void {
    const parent = this.persons.get(parentId);
    if (parent && !parent.childrenIds.includes(childId)) {
      parent.childrenIds.push(childId);
    }
  }

  removeChildRelation(parentId: number, childId: number): void {
    const parent = this.persons.get(parentId);
    if (parent) {
      parent.childrenIds = parent.childrenIds.filter((id) => id !== childId);
    }
  }

  setParents(childId: number, fatherId: number, motherId: number): void {
    const child = this.persons.get(childId);
    if (!child) return;

    // Remove from old parents' children lists
    if (child.fatherId) {
      const oldFather = this.persons.get(child.fatherId);
      if (oldFather) oldFather.childrenIds = oldFather.childrenIds.filter((id) => id !== childId);
    }
    if (child.motherId) {
      const oldMother = this.persons.get(child.motherId);
      if (oldMother) oldMother.childrenIds = oldMother.childrenIds.filter((id) => id !== childId);
    }

    // Set new parents
    child.fatherId = fatherId;
    child.motherId = motherId;

    // Add to new parents' children lists
    if (fatherId) this.addChildRelation(fatherId, childId);
    if (motherId) this.addChildRelation(motherId, childId);
  }

  // ─── Photo management ─────────────────────────────────

  addPhoto(personId: number, data: Buffer, filename?: string): string {
    const photos = this.getPhotos(personId);
    const nextIndex = photos.length > 0
      ? Math.max(...photos.map((f) => parseInt(f.split("#")[1]) || 0)) + 1
      : 0;
    const fn = filename || `${personId}#${nextIndex}.jpg`;
    const filePath = join(this.mediaPath, fn);
    writeFileSync(filePath, data);

    // Update cache
    if (!this.photoCache.has(personId)) this.photoCache.set(personId, []);
    this.photoCache.get(personId)!.push(fn);
    this.photoCache.get(personId)!.sort((a, b) => {
      const idxA = parseInt(a.split("#")[1]);
      const idxB = parseInt(b.split("#")[1]);
      return idxA - idxB;
    });
    return fn;
  }

  deletePhoto(personId: number, filename: string): boolean {
    const filePath = join(this.mediaPath, filename);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    const photos = this.photoCache.get(personId);
    if (photos) {
      this.photoCache.set(personId, photos.filter((f) => f !== filename));
    }
    return true;
  }

  // ─── Biography management ─────────────────────────────

  setBio(personId: number, type: "open" | "lock", text: string): void {
    if (!existsSync(this.infoPath)) mkdirSync(this.infoPath, { recursive: true });
    const filePath = join(this.infoPath, `${type}#${personId}`);
    writeFileSync(filePath, text, "utf-8");
  }

  deleteBio(personId: number, type: "open" | "lock"): boolean {
    const filePath = join(this.infoPath, `${type}#${personId}`);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    return true;
  }

  // ─── Validation ───────────────────────────────────────

  validate(): { issues: { type: string; personId: number; message: string }[]; counts: Record<string, number> } {
    const issues: { type: string; personId: number; message: string }[] = [];

    for (const person of this.persons.values()) {
      // Empty names
      if (!person.firstName.trim() && !person.lastName.trim()) {
        issues.push({ type: "empty_name", personId: person.id, message: "Пустое имя и фамилия" });
      }

      // Unknown markers
      if (person.firstName.includes("?") || person.lastName.includes("?")) {
        issues.push({ type: "unknown_person", personId: person.id, message: "Содержит '?' в имени" });
      }

      // Spouse reciprocity
      for (const sid of person.spouseIds) {
        const spouse = this.persons.get(sid);
        if (!spouse) {
          issues.push({ type: "orphan_spouse", personId: person.id, message: `Супруг ${sid} не найден` });
        } else if (!spouse.spouseIds.includes(person.id)) {
          issues.push({ type: "missing_reciprocal_spouse", personId: person.id, message: `Супруг ${sid} не ссылается обратно` });
        }
      }

      // Parent-child reciprocity
      for (const cid of person.childrenIds) {
        const child = this.persons.get(cid);
        if (!child) {
          issues.push({ type: "orphan_child", personId: person.id, message: `Ребёнок ${cid} не найден` });
        } else if (child.fatherId !== person.id && child.motherId !== person.id) {
          issues.push({ type: "missing_reciprocal_parent", personId: person.id, message: `Ребёнок ${cid} не указывает родителем` });
        }
      }

      // No connections (orphan)
      if (!person.fatherId && !person.motherId && person.spouseIds.length === 0 && person.childrenIds.length === 0) {
        issues.push({ type: "isolated", personId: person.id, message: "Нет связей ни с кем" });
      }

      // No photos
      if (this.getPhotos(person.id).length === 0) {
        issues.push({ type: "no_photo", personId: person.id, message: "Нет фотографий" });
      }
    }

    const counts: Record<string, number> = {};
    for (const issue of issues) {
      counts[issue.type] = (counts[issue.type] || 0) + 1;
    }

    return { issues, counts };
  }

  // ─── CSV export ───────────────────────────────────────

  exportToCsv(): string {
    const lines: string[] = [];
    const sorted = Array.from(this.persons.values()).sort((a, b) => a.id - b.id);
    for (const p of sorted) {
      lines.push([
        p.id, p.sex, p.lastName, p.firstName, p.fatherId || "", p.motherId || "",
        p.birthPlace, p.birthDay, p.deathPlace, p.deathDay, p.address,
        p.spouseIds.join(" "), p.childrenIds.join(" "),
        p.orderByDad, p.orderByMom, p.orderBySpouse, p.marryDay,
      ].join(";"));
    }
    return lines.join("\n");
  }
}
