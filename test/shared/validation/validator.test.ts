import { describe, expect, it } from "vitest";
import type { JsonObjectSchema } from "../../../src/shared/validation";
import { validateInput } from "../../../src/shared/validation";

// ──────────────────────────────────────────────────────────────────────────────
// validateInput — basic schema validation, error shape
// ──────────────────────────────────────────────────────────────────────────────

describe("validateInput — schema validation and error shape", () => {
  const schemaWithRequired: JsonObjectSchema = {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      count: { type: "number", minimum: 1 },
    },
  };

  it("returns error message when input is not an object", () => {
    const result = validateInput("not an object", schemaWithRequired);
    expect(result).toBe("input must be an object.");
  });

  it("returns error message when input is undefined (treated as empty object)", () => {
    const result = validateInput(undefined, schemaWithRequired);
    expect(result).toBe("name is required.");
  });

  it("returns error message when required property is missing", () => {
    const result = validateInput({ count: 5 }, schemaWithRequired);
    expect(result).toBe("name is required.");
  });

  it("returns error message when property type does not match", () => {
    const result = validateInput({ name: 123, count: 5 }, schemaWithRequired);
    expect(result).toBe("name must be a string.");
  });

  it("returns error message when numeric value is below minimum", () => {
    const result = validateInput({ name: "test", count: 0 }, schemaWithRequired);
    expect(result).toBe("count must be at least 1.");
  });

  it("returns undefined when input is valid", () => {
    const result = validateInput({ name: "test", count: 5 }, schemaWithRequired);
    expect(result).toBeUndefined();
  });

  it("rejects additional properties when additionalProperties is false", () => {
    const result = validateInput(
      { name: "test", count: 5, extra: "not allowed" },
      schemaWithRequired,
    );
    expect(result).toBe("extra is not allowed.");
  });
});

describe("validateInput — coercePrimitive behavior", () => {
  const schemaWithEnum: JsonObjectSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: { type: "string", enum: ["read", "write"] },
    },
  };

  it("rejects value not in enum", () => {
    const result = validateInput({ mode: "invalid" }, schemaWithEnum);
    expect(result).toBe("mode must be one of: read, write.");
  });

  it("accepts valid enum value", () => {
    const result = validateInput({ mode: "read" }, schemaWithEnum);
    expect(result).toBeUndefined();
  });
});

describe("validateInput — nested object validation", () => {
  const schemaWithNested: JsonObjectSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      config: {
        type: "object",
        required: ["path"],
        additionalProperties: false,
        properties: {
          path: { type: "string" },
        },
      },
    },
  };

  it("rejects missing nested required property with full path", () => {
    const result = validateInput({ config: {} }, schemaWithNested);
    expect(result).toBe("config.path is required.");
  });

  it("accepts valid nested object", () => {
    const result = validateInput({ config: { path: "/test" } }, schemaWithNested);
    expect(result).toBeUndefined();
  });
});

describe("validateInput — array validation", () => {
  const schemaWithArray: JsonObjectSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        maxItems: 3,
        items: { type: "string" },
      },
    },
  };

  it("rejects array exceeding maxItems", () => {
    const result = validateInput({ items: ["a", "b", "c", "d"] }, schemaWithArray);
    expect(result).toBe("items must have at most 3 items.");
  });

  it("accepts array within maxItems", () => {
    const result = validateInput({ items: ["a", "b", "c"] }, schemaWithArray);
    expect(result).toBeUndefined();
  });

  it("validates array item types", () => {
    const result = validateInput({ items: ["a", 123] }, schemaWithArray);
    expect(result).toBe("items[1] must be a string.");
  });
});
