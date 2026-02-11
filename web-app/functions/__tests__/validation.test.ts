import { describe, it, expect } from "vitest";
import { validate, loginSchema, personFormSchema, createUserSchema, bioSchema, favoriteSchema } from "../routes/validation.js";

describe("loginSchema", () => {
  it("accepts valid login data", () => {
    const result = validate(loginSchema, { login: "admin", password: "test123" });
    expect(result.success).toBe(true);
  });

  it("rejects missing login", () => {
    const result = validate(loginSchema, { password: "test123" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = validate(loginSchema, { login: "admin", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("personFormSchema", () => {
  it("accepts valid person data", () => {
    const result = validate(personFormSchema, { firstName: "Иван", lastName: "Петров", sex: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects when both firstName and lastName are empty", () => {
    const result = validate(personFormSchema, { firstName: "", lastName: "" });
    expect(result.success).toBe(false);
  });

  it("accepts when only firstName is provided", () => {
    const result = validate(personFormSchema, { firstName: "Иван" });
    expect(result.success).toBe(true);
  });

  it("accepts when only lastName is provided", () => {
    const result = validate(personFormSchema, { lastName: "Петров" });
    expect(result.success).toBe(true);
  });

  it("validates sex as 0 or 1", () => {
    const valid0 = validate(personFormSchema, { firstName: "A", sex: 0 });
    expect(valid0.success).toBe(true);
    const valid1 = validate(personFormSchema, { firstName: "A", sex: 1 });
    expect(valid1.success).toBe(true);
    const invalid = validate(personFormSchema, { firstName: "A", sex: 2 });
    expect(invalid.success).toBe(false);
  });
});

describe("createUserSchema", () => {
  it("accepts valid user data", () => {
    const result = validate(createUserSchema, { login: "test", password: "123456", role: "viewer" });
    expect(result.success).toBe(true);
  });

  it("rejects short password", () => {
    const result = validate(createUserSchema, { login: "test", password: "123", role: "viewer" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = validate(createUserSchema, { login: "test", password: "123456", role: "superadmin" });
    expect(result.success).toBe(false);
  });
});

describe("bioSchema", () => {
  it("accepts open bio", () => {
    const result = validate(bioSchema, { type: "open", text: "Some bio text" });
    expect(result.success).toBe(true);
  });

  it("accepts lock bio with empty text", () => {
    const result = validate(bioSchema, { type: "lock", text: "" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = validate(bioSchema, { type: "private", text: "text" });
    expect(result.success).toBe(false);
  });
});

describe("favoriteSchema", () => {
  it("accepts valid personId", () => {
    const result = validate(favoriteSchema, { personId: 42 });
    expect(result.success).toBe(true);
  });

  it("rejects zero personId", () => {
    const result = validate(favoriteSchema, { personId: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative personId", () => {
    const result = validate(favoriteSchema, { personId: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects missing personId", () => {
    const result = validate(favoriteSchema, {});
    expect(result.success).toBe(false);
  });
});
