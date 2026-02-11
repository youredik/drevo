import { describe, it, expect, beforeAll } from "vitest";

// Direct test of jwt sign/verify cycle without full auth module
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-secret-key";

describe("JWT token cycle", () => {
  it("creates and verifies a valid token", () => {
    const payload = { id: "1", login: "admin", role: "admin" };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: "1h" });
    const decoded = jwt.verify(token, TEST_SECRET) as typeof payload;
    expect(decoded.id).toBe("1");
    expect(decoded.login).toBe("admin");
    expect(decoded.role).toBe("admin");
  });

  it("rejects an expired token", () => {
    const payload = { id: "1", login: "admin", role: "admin" };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: "-1s" });
    expect(() => jwt.verify(token, TEST_SECRET)).toThrow();
  });

  it("rejects a token signed with wrong secret", () => {
    const payload = { id: "1", login: "admin", role: "admin" };
    const token = jwt.sign(payload, "wrong-secret");
    expect(() => jwt.verify(token, TEST_SECRET)).toThrow();
  });
});

describe("Role hierarchy", () => {
  const roleHierarchy: Record<string, number> = { admin: 3, manager: 2, viewer: 1 };

  it("admin has highest level", () => {
    expect(roleHierarchy["admin"]).toBeGreaterThan(roleHierarchy["manager"]);
    expect(roleHierarchy["admin"]).toBeGreaterThan(roleHierarchy["viewer"]);
  });

  it("manager outranks viewer", () => {
    expect(roleHierarchy["manager"]).toBeGreaterThan(roleHierarchy["viewer"]);
  });

  it("unknown role returns undefined", () => {
    expect(roleHierarchy["guest"]).toBeUndefined();
  });
});
