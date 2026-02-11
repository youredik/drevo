import { describe, it, expect } from "vitest";
import { matchPath, parseBody } from "../routes/helpers.js";
import type { YcEvent } from "../routes/types.js";

describe("matchPath", () => {
  it("matches exact path", () => {
    expect(matchPath("/persons", "/persons")).toEqual({});
  });

  it("extracts single param", () => {
    expect(matchPath("/persons/:id", "/persons/42")).toEqual({ id: "42" });
  });

  it("extracts multiple params", () => {
    expect(matchPath("/admin/persons/:id/spouse/:sid", "/admin/persons/1/spouse/2"))
      .toEqual({ id: "1", sid: "2" });
  });

  it("returns null on length mismatch", () => {
    expect(matchPath("/persons/:id", "/persons")).toBeNull();
    expect(matchPath("/persons", "/persons/42")).toBeNull();
  });

  it("returns null on segment mismatch", () => {
    expect(matchPath("/persons/:id", "/users/42")).toBeNull();
  });

  it("decodes URI components", () => {
    expect(matchPath("/media/:filename", "/media/42%230.jpg"))
      .toEqual({ filename: "42#0.jpg" });
  });
});

describe("parseBody", () => {
  it("parses plain JSON body", () => {
    const event = {
      body: JSON.stringify({ login: "admin", password: "test" }),
      isBase64Encoded: false,
    } as YcEvent;
    expect(parseBody(event)).toEqual({ login: "admin", password: "test" });
  });

  it("parses base64-encoded body", () => {
    const data = { personId: 42 };
    const event = {
      body: Buffer.from(JSON.stringify(data)).toString("base64"),
      isBase64Encoded: true,
    } as YcEvent;
    expect(parseBody(event)).toEqual(data);
  });

  it("returns empty object for missing body", () => {
    const event = { body: "", isBase64Encoded: false } as YcEvent;
    expect(parseBody(event)).toEqual({});
  });
});
