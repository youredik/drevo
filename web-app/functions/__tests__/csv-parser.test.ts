import { describe, it, expect } from "vitest";
import { parsePersonsCsvString } from "../shared/csv-parser.js";

describe("parsePersonsCsvString", () => {
  it("parses a single person line", () => {
    const csv = "1;1;Иванов;Иван;0;0;Москва;01.01.1930;;01.01.2000;;2;3;0;0;0;01.06.1955";
    const result = parsePersonsCsvString(csv);
    expect(result.size).toBe(1);

    const person = result.get(1)!;
    expect(person.id).toBe(1);
    expect(person.sex).toBe(1);
    expect(person.lastName).toBe("Иванов");
    expect(person.firstName).toBe("Иван");
    expect(person.fatherId).toBe(0);
    expect(person.motherId).toBe(0);
    expect(person.birthPlace).toBe("Москва");
    expect(person.birthDay).toBe("01.01.1930");
    expect(person.deathPlace).toBe("");
    expect(person.deathDay).toBe("01.01.2000");
    expect(person.address).toBe("");
    expect(person.spouseIds).toEqual([2]);
    expect(person.childrenIds).toEqual([3]);
    expect(person.orderByDad).toBe(0);
    expect(person.orderByMom).toBe(0);
    expect(person.orderBySpouse).toBe(0);
    expect(person.marryDay).toBe("01.06.1955");
  });

  it("parses multiple persons", () => {
    const csv = [
      "1;1;Иванов;Иван;0;0;Москва;01.01.1930;;01.01.2000;;2;3;0;0;0;",
      "2;0;Иванова;Мария;0;0;Москва;15.03.1932;;15.03.2005;;1;3;0;0;0;",
    ].join("\n");
    const result = parsePersonsCsvString(csv);
    expect(result.size).toBe(2);
    expect(result.get(1)!.firstName).toBe("Иван");
    expect(result.get(2)!.firstName).toBe("Мария");
  });

  it("handles empty spouse and children fields", () => {
    const csv = "5;1;Иванов;Алексей;3;4;Москва;25.12.1990;;;;;0;1;1;0;";
    const result = parsePersonsCsvString(csv);
    const person = result.get(5)!;
    expect(person.spouseIds).toEqual([]);
    expect(person.childrenIds).toEqual([]);
  });

  it("parses multiple spouse IDs", () => {
    // 17 fields: id;sex;ln;fn;father;mother;bp;bd;dp;dd;addr;spouses;children;obd;obm;obs;md
    const csv = "1;1;Test;Person;0;0;;;;;;2 3 4;;0;0;0;";
    const result = parsePersonsCsvString(csv);
    expect(result.get(1)!.spouseIds).toEqual([2, 3, 4]);
  });

  it("parses multiple children IDs", () => {
    const csv = "1;1;Test;Person;0;0;;;;;;;5 6 7;0;0;0;";
    const result = parsePersonsCsvString(csv);
    expect(result.get(1)!.childrenIds).toEqual([5, 6, 7]);
  });

  it("handles female sex value (0)", () => {
    const csv = "2;0;Иванова;Мария;0;0;Москва;15.03.1932;;15.03.2005;;1;3;0;0;0;";
    const result = parsePersonsCsvString(csv);
    expect(result.get(2)!.sex).toBe(0);
  });

  it("skips empty lines", () => {
    const csv = "1;1;Test;Person;0;0;;;;;;;2;3;0;0;0;\n\n\n";
    const result = parsePersonsCsvString(csv);
    expect(result.size).toBe(1);
  });

  it("skips lines with fewer than 17 fields", () => {
    const csv = "1;2;3;4;5";
    const result = parsePersonsCsvString(csv);
    expect(result.size).toBe(0);
  });

  it("skips lines with non-numeric ID", () => {
    const csv = "abc;1;Test;Person;0;0;;;;;;;2;3;0;0;0;";
    const result = parsePersonsCsvString(csv);
    expect(result.size).toBe(0);
  });

  it("returns empty map for empty input", () => {
    const result = parsePersonsCsvString("");
    expect(result.size).toBe(0);
  });

  it("trims whitespace from fields", () => {
    const csv = "1;1; Иванов ; Иван ;0;0; Москва ;01.01.1930;; ;;2;3;0;0;0; 01.06.1955 ";
    const result = parsePersonsCsvString(csv);
    const person = result.get(1)!;
    expect(person.lastName).toBe("Иванов");
    expect(person.firstName).toBe("Иван");
    expect(person.birthPlace).toBe("Москва");
    expect(person.marryDay).toBe("01.06.1955");
  });
});
