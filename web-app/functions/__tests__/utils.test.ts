import { describe, it, expect } from "vitest";
import {
  parseDate,
  isFullDate,
  calculateAge,
  calculateAgeNumber,
  getZodiac,
  getDayMonth,
  formatDateRu,
  isPersonAlive,
  getPersonFullName,
  normalizeSearchQuery,
} from "../shared/utils.js";
import type { Person } from "../shared/types.js";

// ─── parseDate ─────────────────────────────────────────

describe("parseDate", () => {
  it("parses DD.MM.YYYY format", () => {
    const d = parseDate("25.12.1990");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(1990);
    expect(d!.getMonth()).toBe(11); // December = 11
    expect(d!.getDate()).toBe(25);
  });

  it("parses single-digit day", () => {
    const d = parseDate("1.01.2000");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(1);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getFullYear()).toBe(2000);
  });

  it("parses year-only format", () => {
    const d = parseDate("1990");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(1990);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(1);
  });

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
  });

  it("returns null for whitespace", () => {
    expect(parseDate("   ")).toBeNull();
  });

  it("returns null for invalid format", () => {
    expect(parseDate("not-a-date")).toBeNull();
    expect(parseDate("12/25/1990")).toBeNull();
  });

  it("trims whitespace before parsing", () => {
    const d = parseDate("  01.01.2000  ");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2000);
  });
});

// ─── isFullDate ────────────────────────────────────────

describe("isFullDate", () => {
  it("returns true for DD.MM.YYYY", () => {
    expect(isFullDate("25.12.1990")).toBe(true);
    expect(isFullDate("01.01.2000")).toBe(true);
    expect(isFullDate("1.03.1985")).toBe(true);
  });

  it("returns false for year-only", () => {
    expect(isFullDate("1990")).toBe(false);
  });

  it("returns false for empty/invalid", () => {
    expect(isFullDate("")).toBe(false);
    expect(isFullDate("invalid")).toBe(false);
  });
});

// ─── calculateAge / calculateAgeNumber ─────────────────

describe("calculateAge", () => {
  it("calculates age for deceased person (full dates)", () => {
    const age = calculateAge("01.01.1930", "01.01.2000");
    expect(age).toBe("70 лет");
  });

  it("returns empty for invalid birth", () => {
    expect(calculateAge("", "01.01.2000")).toBe("");
    expect(calculateAge("invalid", "01.01.2000")).toBe("");
  });

  it("handles year-only birth with full death date", () => {
    // Year-only parses as Jan 1, so 1930-01-01 to 2000-01-01 = 70 years
    const age = calculateAge("1930", "01.01.2000");
    expect(age).toBe("70 лет");
  });

  it("uses correct Russian plural: 1 год", () => {
    expect(calculateAge("01.01.1999", "01.01.2000")).toBe("1 год");
  });

  it("uses correct Russian plural: 2 года", () => {
    expect(calculateAge("01.01.1998", "01.01.2000")).toBe("2 года");
  });

  it("uses correct Russian plural: 5 лет", () => {
    expect(calculateAge("01.01.1995", "01.01.2000")).toBe("5 лет");
  });

  it("uses correct Russian plural: 11 лет", () => {
    expect(calculateAge("01.01.1989", "01.01.2000")).toBe("11 лет");
  });

  it("uses correct Russian plural: 21 год", () => {
    expect(calculateAge("01.01.1979", "01.01.2000")).toBe("21 год");
  });

  it("uses correct Russian plural: 34 года", () => {
    expect(calculateAge("01.01.1966", "01.01.2000")).toBe("34 года");
  });
});

describe("calculateAgeNumber", () => {
  it("returns numeric age", () => {
    expect(calculateAgeNumber("01.01.1930", "01.01.2000")).toBe(70);
  });

  it("returns -1 for invalid birth", () => {
    expect(calculateAgeNumber("", "01.01.2000")).toBe(-1);
  });

  it("adjusts if birthday hasn't passed yet in death year", () => {
    // Born Dec 25, died Jan 1 same effective year
    expect(calculateAgeNumber("25.12.1930", "01.01.2000")).toBe(69);
  });
});

// ─── getZodiac ─────────────────────────────────────────

describe("getZodiac", () => {
  it("returns null for year-only date", () => {
    expect(getZodiac("1990")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getZodiac("")).toBeNull();
  });

  it("identifies Capricorn (Dec 25)", () => {
    const z = getZodiac("25.12.1990");
    expect(z).not.toBeNull();
    expect(z!.name).toBe("Козерог");
    expect(z!.icon).toBe("♑");
  });

  it("identifies Capricorn in January (Jan 5)", () => {
    const z = getZodiac("05.01.1990");
    expect(z).not.toBeNull();
    expect(z!.name).toBe("Козерог");
  });

  it("identifies Aries (Apr 1)", () => {
    const z = getZodiac("01.04.1990");
    expect(z).not.toBeNull();
    expect(z!.name).toBe("Овен");
  });

  it("identifies Cancer (Jul 1)", () => {
    const z = getZodiac("01.07.1990");
    expect(z).not.toBeNull();
    expect(z!.name).toBe("Рак");
  });

  it("identifies Virgo (Sep 1)", () => {
    const z = getZodiac("01.09.1990");
    expect(z).not.toBeNull();
    expect(z!.name).toBe("Дева");
  });
});

// ─── getDayMonth ───────────────────────────────────────

describe("getDayMonth", () => {
  it("extracts DD.MM from full date", () => {
    expect(getDayMonth("25.12.1990")).toBe("25.12");
  });

  it("pads single-digit day", () => {
    expect(getDayMonth("1.03.1990")).toBe("01.03");
  });

  it("returns null for year-only", () => {
    expect(getDayMonth("1990")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getDayMonth("")).toBeNull();
  });
});

// ─── formatDateRu ──────────────────────────────────────

describe("formatDateRu", () => {
  it("formats full date in Russian", () => {
    expect(formatDateRu("25.12.1990")).toBe("25 декабря 1990 г.");
  });

  it("formats January date", () => {
    expect(formatDateRu("01.01.2000")).toBe("1 января 2000 г.");
  });

  it("formats year-only", () => {
    expect(formatDateRu("1990")).toBe("1990 г.");
  });

  it("returns empty for empty string", () => {
    expect(formatDateRu("")).toBe("");
  });

  it("returns input for unrecognized format", () => {
    expect(formatDateRu("invalid")).toBe("invalid");
  });
});

// ─── isPersonAlive ─────────────────────────────────────

describe("isPersonAlive", () => {
  const basePerson: Person = {
    id: 1, sex: 1, firstName: "Test", lastName: "Person",
    fatherId: 0, motherId: 0, birthPlace: "", birthDay: "01.01.1990",
    deathPlace: "", deathDay: "", address: "",
    spouseIds: [], childrenIds: [],
    orderByDad: 0, orderByMom: 0, orderBySpouse: 0, marryDay: "",
  };

  it("returns true when deathDay is empty", () => {
    expect(isPersonAlive({ ...basePerson, deathDay: "" })).toBe(true);
  });

  it("returns true when deathDay is whitespace", () => {
    expect(isPersonAlive({ ...basePerson, deathDay: "  " })).toBe(true);
  });

  it("returns false when deathDay is set", () => {
    expect(isPersonAlive({ ...basePerson, deathDay: "01.01.2000" })).toBe(false);
  });
});

// ─── getPersonFullName ─────────────────────────────────

describe("getPersonFullName", () => {
  const basePerson: Person = {
    id: 1, sex: 1, firstName: "Иван", lastName: "Иванов",
    fatherId: 0, motherId: 0, birthPlace: "", birthDay: "",
    deathPlace: "", deathDay: "", address: "",
    spouseIds: [], childrenIds: [],
    orderByDad: 0, orderByMom: 0, orderBySpouse: 0, marryDay: "",
  };

  it("returns 'lastName firstName'", () => {
    expect(getPersonFullName(basePerson)).toBe("Иванов Иван");
  });

  it("handles empty lastName", () => {
    expect(getPersonFullName({ ...basePerson, lastName: "" })).toBe("Иван");
  });

  it("handles empty firstName", () => {
    expect(getPersonFullName({ ...basePerson, firstName: "" })).toBe("Иванов");
  });
});

// ─── normalizeSearchQuery ──────────────────────────────

describe("normalizeSearchQuery", () => {
  it("lowercases and trims", () => {
    expect(normalizeSearchQuery("  ИвАнОв  ")).toBe("иванов");
  });

  it("replaces full month name 'января'", () => {
    expect(normalizeSearchQuery("25 января")).toBe("25 .01.");
  });

  it("replaces abbreviated month 'янв'", () => {
    expect(normalizeSearchQuery("25 янв")).toBe("25 .01.");
  });

  it("replaces 'декабря'", () => {
    expect(normalizeSearchQuery("декабря")).toBe(".12.");
  });

  it("handles mixed case — lowercased then partial match", () => {
    // "Марта" → lowercase → "марта", then "март" in map matches first → ".03." + trailing "а"
    expect(normalizeSearchQuery("25 Марта")).toBe("25 .03.а");
  });
});
