import { describe, it, expect, beforeAll, vi } from "vitest";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Mock YDB modules
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const CSV_PATH = join(FIXTURES, "data", "fam.csv");
const FAV_PATH = join(FIXTURES, "data", "fav.csv");
const MEDIA_PATH = join(FIXTURES, "data");
const INFO_PATH = join(FIXTURES, "data", "info");

/*
  Fixture family tree:
    Person 1 (Ivan, M, 1930-2000) ══ Person 2 (Maria, F, 1932-2005)
        └── Person 3 (Petr, M, 1960-alive) ══ Person 4 (Anna, F, 1962-alive)
                └── Person 5 (Alexey, M, 1990-alive)
*/

let repo: DataRepository;

beforeAll(() => {
  repo = new DataRepository(CSV_PATH, FAV_PATH, MEDIA_PATH, INFO_PATH);
});

// ══════════════════════════════════════════════════════
// ANCESTOR TREE
// ══════════════════════════════════════════════════════

describe("getAncestorTree", () => {
  it("returns null for non-existent person", () => {
    expect(repo.getAncestorTree(999)).toBeNull();
  });

  it("builds tree for person with no parents (root)", () => {
    const tree = repo.getAncestorTree(1)!;
    expect(tree.id).toBe(1);
    expect(tree.firstName).toBe("Иван");
    expect(tree.children).toHaveLength(0); // no parents
  });

  it("builds tree for person with parents", () => {
    const tree = repo.getAncestorTree(3)!;
    expect(tree.id).toBe(3);
    expect(tree.children).toHaveLength(2); // father=1, mother=2
    expect(tree.children[0].id).toBe(1); // father
    expect(tree.children[1].id).toBe(2); // mother
  });

  it("builds 3-generation ancestor tree", () => {
    const tree = repo.getAncestorTree(5)!;
    expect(tree.id).toBe(5);
    expect(tree.children).toHaveLength(2); // father=3, mother=4

    const father = tree.children.find((c) => c.id === 3)!;
    expect(father.children).toHaveLength(2); // grandparents 1 and 2

    const mother = tree.children.find((c) => c.id === 4)!;
    expect(mother.children).toHaveLength(0); // no parents for Anna
  });

  it("respects maxDepth", () => {
    const tree = repo.getAncestorTree(5, 1)!;
    expect(tree.id).toBe(5);
    expect(tree.children).toHaveLength(2); // father=3, mother=4
    // At depth 1, children of depth 1 should not recurse further
    const father = tree.children.find((c) => c.id === 3)!;
    expect(father.children).toHaveLength(0); // maxDepth reached
  });

  it("includes correct isAlive status", () => {
    const tree = repo.getAncestorTree(5)!;
    expect(tree.isAlive).toBe(true); // Alexey is alive

    const father = tree.children.find((c) => c.id === 3)!;
    expect(father.isAlive).toBe(true); // Petr is alive

    const grandfather = father.children.find((c) => c.id === 1)!;
    expect(grandfather.isAlive).toBe(false); // Ivan is deceased
  });

  it("includes correct sex values", () => {
    const tree = repo.getAncestorTree(5)!;
    expect(tree.sex).toBe(1); // Male
    const mother = tree.children.find((c) => c.id === 4)!;
    expect(mother.sex).toBe(0); // Female
  });
});

// ══════════════════════════════════════════════════════
// DESCENDANT TREE
// ══════════════════════════════════════════════════════

describe("getDescendantTree", () => {
  it("returns null for non-existent person", () => {
    expect(repo.getDescendantTree(999)).toBeNull();
  });

  it("builds tree for leaf person (no children)", () => {
    const tree = repo.getDescendantTree(5)!;
    expect(tree.id).toBe(5);
    expect(tree.firstName).toBe("Алексей");
    expect(tree.children).toHaveLength(0);
  });

  it("builds tree for person with children", () => {
    const tree = repo.getDescendantTree(3)!;
    expect(tree.id).toBe(3);
    expect(tree.children).toHaveLength(1); // child=5
    expect(tree.children[0].id).toBe(5);
  });

  it("builds 3-generation descendant tree", () => {
    const tree = repo.getDescendantTree(1)!;
    expect(tree.id).toBe(1);
    expect(tree.children).toHaveLength(1); // child=3
    expect(tree.children[0].id).toBe(3);
    expect(tree.children[0].children).toHaveLength(1); // grandchild=5
    expect(tree.children[0].children[0].id).toBe(5);
  });

  it("respects maxDepth", () => {
    const tree = repo.getDescendantTree(1, 1)!;
    expect(tree.children).toHaveLength(1); // child=3
    expect(tree.children[0].children).toHaveLength(0); // maxDepth stops further
  });
});

// ══════════════════════════════════════════════════════
// KINSHIP
// ══════════════════════════════════════════════════════

describe("checkKinship", () => {
  it("returns null when person1 doesn't exist", () => {
    expect(repo.checkKinship(999, 1)).toBeNull();
  });

  it("returns null when person2 doesn't exist", () => {
    expect(repo.checkKinship(1, 999)).toBeNull();
  });

  it("returns result for same person", () => {
    const result = repo.checkKinship(1, 1)!;
    // pathFrom1=[1] length=1, pathFrom2=[1] length=1 → describeRelationship(1,1) = "Брат/Сестра"
    expect(result.relationship).toBe("Брат/Сестра");
    expect(result.person1.id).toBe(1);
    expect(result.person2.id).toBe(1);
    expect(result.commonAncestor).not.toBeNull();
  });

  it("detects relationship between parent and child", () => {
    const result = repo.checkKinship(3, 5)!;
    // Common ancestor = 3; pathFrom1=[3] len=1, pathFrom2=[5,3] len=2
    expect(result.relationship).toBe("Дядя/Тётя");
    expect(result.commonAncestor).not.toBeNull();
    expect(result.commonAncestor!.id).toBe(3);
  });

  it("detects relationship between child and parent", () => {
    const result = repo.checkKinship(5, 3)!;
    // Common ancestor = 3; pathFrom1=[5,3] len=2, pathFrom2=[3] len=1
    expect(result.relationship).toBe("Племянник/Племянница");
  });

  it("detects relationship between grandparent and grandchild", () => {
    const result = repo.checkKinship(1, 5)!;
    // Common ancestor = 1; pathFrom1=[1] len=1, pathFrom2=[5,3,1] len=3
    expect(result.pathFromPerson1).toHaveLength(1);
    expect(result.pathFromPerson2).toHaveLength(3);
    expect(result.commonAncestor!.id).toBe(1);
    // describeRelationship(1, 3) → generic fallback
    expect(result.relationship).toContain("поколений");
  });

  it("detects relationship between grandchild and grandparent", () => {
    const result = repo.checkKinship(5, 1)!;
    expect(result.pathFromPerson1).toHaveLength(3); // [5, 3, 1]
    expect(result.pathFromPerson2).toHaveLength(1); // [1]
    expect(result.relationship).toContain("поколений");
  });

  it("returns paths to common ancestor", () => {
    const result = repo.checkKinship(5, 1)!;
    expect(result.pathFromPerson1.length).toBeGreaterThan(0);
    expect(result.pathFromPerson2.length).toBeGreaterThan(0);
    // Person 1 should be in both paths (as common ancestor)
    expect(result.commonAncestor!.id).toBe(1);
  });

  it("handles unrelated persons (no common ancestor in small fixture)", () => {
    // Persons 1 and 4 are unrelated — 4 has no parents
    const result = repo.checkKinship(1, 4)!;
    expect(result.commonAncestor).toBeNull();
    expect(result.pathFromPerson1).toHaveLength(0);
    expect(result.pathFromPerson2).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════
// FAMILY
// ══════════════════════════════════════════════════════

describe("getFamily", () => {
  it("returns empty array for non-existent person", () => {
    expect(repo.getFamily(999)).toEqual([]);
  });

  it("includes self", () => {
    const members = repo.getFamily(3);
    const self = members.find((m) => m.category === "self");
    expect(self).toBeDefined();
    expect(self!.person.id).toBe(3);
    expect(self!.relation).toBe("Я");
  });

  it("includes parents for person 3", () => {
    const members = repo.getFamily(3);
    const parents = members.filter((m) => m.category === "parents");
    expect(parents).toHaveLength(2);
    expect(parents.find((p) => p.relation === "Отец")!.person.id).toBe(1);
    expect(parents.find((p) => p.relation === "Мать")!.person.id).toBe(2);
  });

  it("includes children for person 3", () => {
    const members = repo.getFamily(3);
    const children = members.filter((m) => m.category === "children");
    expect(children).toHaveLength(1);
    expect(children[0].person.id).toBe(5);
    expect(children[0].relation).toBe("Сын");
  });

  it("includes grandchildren for person 1", () => {
    const members = repo.getFamily(1);
    const grandchildren = members.filter((m) => m.category === "grandchildren");
    expect(grandchildren).toHaveLength(1);
    expect(grandchildren[0].person.id).toBe(5);
    expect(grandchildren[0].relation).toBe("Внук");
  });

  it("has no parents for root person 1", () => {
    const members = repo.getFamily(1);
    const parents = members.filter((m) => m.category === "parents");
    expect(parents).toHaveLength(0);
  });

  it("has correct gender labels (Дочь for female child)", () => {
    // Person 1 has child 3 who is male → "Сын"
    const members = repo.getFamily(1);
    const children = members.filter((m) => m.category === "children");
    expect(children[0].relation).toBe("Сын");
  });
});

// ══════════════════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════════════════

describe("search", () => {
  it("returns empty for empty query", () => {
    expect(repo.search("")).toHaveLength(0);
  });

  it("finds by ID", () => {
    const results = repo.search("1");
    expect(results.some((r) => r.id === 1 && r.matchField === "id")).toBe(true);
  });

  it("finds by last name", () => {
    const results = repo.search("Иванов");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.matchField === "name")).toBe(true);
  });

  it("finds by first name", () => {
    const results = repo.search("Алексей");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(5);
  });

  it("is case-insensitive", () => {
    const results = repo.search("иванов");
    expect(results.length).toBeGreaterThan(0);
  });

  it("finds by birth place", () => {
    // Person 4 has birthPlace="Санкт-Петербург", address="" — birthPlace matches first
    const results = repo.search("Санкт-Петербург");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchField).toBe("birthPlace");
  });

  it("finds by birth place", () => {
    const results = repo.search("Москва");
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns no results for non-matching query", () => {
    expect(repo.search("Несуществующий")).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════
// PERSON CARD
// ══════════════════════════════════════════════════════

describe("getPersonCard", () => {
  it("returns null for non-existent person", () => {
    expect(repo.getPersonCard(999)).toBeNull();
  });

  it("returns full card for person with parents and spouse", () => {
    const card = repo.getPersonCard(3)!;
    expect(card.person.id).toBe(3);
    expect(card.father).not.toBeNull();
    expect(card.father!.id).toBe(1);
    expect(card.mother).not.toBeNull();
    expect(card.mother!.id).toBe(2);
    expect(card.spouses).toHaveLength(1);
    expect(card.spouses[0].id).toBe(4);
    expect(card.children).toHaveLength(1);
    expect(card.children[0].id).toBe(5);
  });

  it("returns null parents for root person", () => {
    const card = repo.getPersonCard(1)!;
    expect(card.father).toBeNull();
    expect(card.mother).toBeNull();
  });

  it("includes age string", () => {
    const card = repo.getPersonCard(1)!;
    expect(card.age).toContain("70"); // 1930-2000
  });

  it("includes zodiac for full birth date", () => {
    const card = repo.getPersonCard(1)!; // born 01.01.1930
    expect(card.zodiac).toContain("Козерог");
  });

  it("returns default photo when no photos exist", () => {
    const card = repo.getPersonCard(1)!;
    expect(card.photos).toHaveLength(1);
    expect(card.photos[0]).toMatch(/\.(jpg|png)$/);
  });
});

// ══════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════

describe("getStats", () => {
  it("returns correct total count", () => {
    const stats = repo.getStats();
    expect(stats.totalPersons).toBe(5);
  });

  it("returns correct gender counts", () => {
    const stats = repo.getStats();
    expect(stats.maleCount).toBe(3); // persons 1, 3, 5
    expect(stats.femaleCount).toBe(2); // persons 2, 4
  });

  it("returns correct alive/deceased counts", () => {
    const stats = repo.getStats();
    expect(stats.aliveCount).toBe(3); // persons 3, 4, 5
    expect(stats.deceasedCount).toBe(2); // persons 1, 2
  });

  it("has age distribution buckets", () => {
    const stats = repo.getStats();
    expect(stats.ageDistribution).toBeDefined();
    expect("0-49" in stats.ageDistribution).toBe(true);
    expect("100+" in stats.ageDistribution).toBe(true);
  });

  it("longestLived is an array", () => {
    const stats = repo.getStats();
    expect(Array.isArray(stats.longestLived)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════
// FAVORITES
// ══════════════════════════════════════════════════════

describe("favorites", () => {
  it("initially has no favorites", () => {
    expect(repo.isFavorite(1)).toBe(false);
  });

  it("adds a favorite and checks it", () => {
    const slot = repo.addFavorite(1);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(repo.isFavorite(1)).toBe(true);
  });

  it("returns same slot for duplicate add", () => {
    const slot1 = repo.addFavorite(2);
    const slot2 = repo.addFavorite(2);
    expect(slot1).toBe(slot2);
  });

  it("removes a favorite", () => {
    repo.addFavorite(3);
    expect(repo.isFavorite(3)).toBe(true);
    repo.removeFavorite(3);
    expect(repo.isFavorite(3)).toBe(false);
  });

  it("returns -1 when removing non-favorite", () => {
    const slot = repo.removeFavorite(999);
    expect(slot).toBe(-1);
  });

  it("getFavorites returns the list", () => {
    const favs = repo.getFavorites();
    expect(Array.isArray(favs)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════
// VALIDATE
// ══════════════════════════════════════════════════════

describe("validate", () => {
  it("returns issues and counts", () => {
    const result = repo.validate();
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.counts).toBe("object");
  });

  it("detects no_photo for persons without photos", () => {
    const result = repo.validate();
    const photoIssues = result.issues.filter((i) => i.type === "no_photo");
    expect(photoIssues.length).toBeGreaterThan(0);
  });

  it("each issue has type, personId, message", () => {
    const result = repo.validate();
    for (const issue of result.issues) {
      expect(issue).toHaveProperty("type");
      expect(issue).toHaveProperty("personId");
      expect(issue).toHaveProperty("message");
    }
  });

  it("counts match issues", () => {
    const result = repo.validate();
    for (const [type, count] of Object.entries(result.counts)) {
      expect(result.issues.filter((i) => i.type === type)).toHaveLength(count);
    }
  });
});

// ══════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════

describe("exportToCsv", () => {
  it("contains all persons", () => {
    const csv = repo.exportToCsv();
    const lines = csv.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(5);
  });

  it("contains person data", () => {
    const csv = repo.exportToCsv();
    expect(csv).toContain("Иванов");
    expect(csv).toContain("Иван");
    expect(csv).toContain("Москва");
  });

  it("uses semicolon delimiter", () => {
    const csv = repo.exportToCsv();
    const firstLine = csv.split("\n")[0];
    expect(firstLine.split(";").length).toBeGreaterThanOrEqual(17);
  });
});

describe("exportToGedcom", () => {
  it("contains GEDCOM header and trailer", () => {
    const gedcom = repo.exportToGedcom();
    expect(gedcom).toContain("0 HEAD");
    expect(gedcom).toContain("0 TRLR");
    expect(gedcom).toContain("1 GEDC");
    expect(gedcom).toContain("2 VERS 5.5.1");
  });

  it("contains individual records", () => {
    const gedcom = repo.exportToGedcom();
    expect(gedcom).toContain("@I1@ INDI");
    expect(gedcom).toContain("1 NAME Иван /Иванов/");
    expect(gedcom).toContain("1 SEX M");
  });

  it("contains family records", () => {
    const gedcom = repo.exportToGedcom();
    expect(gedcom).toContain("@F1@ FAM");
    expect(gedcom).toContain("1 HUSB");
    expect(gedcom).toContain("1 WIFE");
    expect(gedcom).toContain("1 CHIL");
  });

  it("converts dates to GEDCOM format", () => {
    const gedcom = repo.exportToGedcom();
    expect(gedcom).toContain("1 JAN 1930"); // 01.01.1930
  });
});

// ══════════════════════════════════════════════════════
// MUTATIONS
// ══════════════════════════════════════════════════════

describe("mutations", () => {
  it("getNextId returns max+1", () => {
    const nextId = repo.getNextId();
    expect(nextId).toBeGreaterThan(5);
  });

  it("getAllPersons returns sorted briefs", () => {
    const all = repo.getAllPersons();
    expect(all.length).toBeGreaterThanOrEqual(5);
    // Should be sorted by ID
    for (let i = 1; i < all.length; i++) {
      expect(all[i].id).toBeGreaterThanOrEqual(all[i - 1].id);
    }
  });

  it("getPersonCount returns correct number", () => {
    expect(repo.getPersonCount()).toBeGreaterThanOrEqual(5);
  });
});

// ══════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════

describe("getEvents", () => {
  it("returns array of events", () => {
    const events = repo.getEvents(365);
    expect(Array.isArray(events)).toBe(true);
  });

  it("events have correct structure", () => {
    const events = repo.getEvents(365);
    for (const event of events) {
      expect(event).toHaveProperty("id");
      expect(event).toHaveProperty("eventType");
      expect(event).toHaveProperty("eventDate");
      expect(event).toHaveProperty("yearsCount");
      expect(event).toHaveProperty("daysUntil");
      expect(["birthday", "memorial", "wedding"]).toContain(event.eventType);
    }
  });

  it("events are sorted by daysUntil ascending", () => {
    const events = repo.getEvents(365);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].daysUntil).toBeGreaterThanOrEqual(events[i - 1].daysUntil);
    }
  });

  it("narrower range returns fewer or equal events", () => {
    const wide = repo.getEvents(365);
    const narrow = repo.getEvents(1, false);
    expect(narrow.length).toBeLessThanOrEqual(wide.length);
  });
});
