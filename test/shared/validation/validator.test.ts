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
    expect(result).toMatch(/^extra is not allowed./);
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

import {
  DOCTOR_SCHEMA,
  VBA_EXECUTE_SCHEMA,
} from "../../../src/adapters/mcp/schemas/dysflow-schemas.js";
import { QUERY_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/query-schemas.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas.js";

describe("Validate tool schemas with overrides and context parameters", () => {
  it("run_vba allows context, overrides, and timeoutMs", () => {
    const input = {
      procedureName: "Main",
      projectId: "p1",
      contextId: "c1",
      accessPath: "a",
      backendPath: "b",
      destinationRoot: "d",
      projectRoot: "pr",
      timeoutMs: 5000,
      strictContext: true,
      expectedAccessPath: "ea",
      expectedProjectRoot: "epr",
      expectedDestinationRoot: "edr",
    };
    expect(validateInput(input, VBA_SYNC_TOOL_SCHEMAS.run_vba)).toBeUndefined();
  });

  it("cleanup_access_operation allows context, overrides, and timeoutMs", () => {
    const input = {
      operationId: "op-1",
      accessPath: "a",
      projectId: "p1",
      contextId: "c1",
      backendPath: "b",
      destinationRoot: "d",
      projectRoot: "pr",
      timeoutMs: 5000,
      strictContext: true,
      expectedAccessPath: "ea",
      expectedProjectRoot: "epr",
      expectedDestinationRoot: "edr",
    };
    expect(validateInput(input, VBA_SYNC_TOOL_SCHEMAS.cleanup_access_operation)).toBeUndefined();
  });

  it("relink_directory allows context, overrides, and expected paths", () => {
    const input = {
      rootPath: "C:/root",
      projectId: "p1",
      contextId: "c1",
      accessPath: "a",
      backendPath: "b",
      destinationRoot: "d",
      projectRoot: "pr",
      strictContext: true,
      expectedAccessPath: "ea",
      expectedProjectRoot: "epr",
      expectedDestinationRoot: "edr",
    };
    expect(validateInput(input, QUERY_TOOL_SCHEMAS.relink_directory)).toBeUndefined();
  });

  it("VBA_EXECUTE_SCHEMA allows context, overrides, and timeoutMs", () => {
    const input = {
      procedureName: "Main",
      projectId: "p1",
      contextId: "c1",
      accessPath: "a",
      backendPath: "b",
      destinationRoot: "d",
      projectRoot: "pr",
      timeoutMs: 5000,
      strictContext: true,
      expectedAccessPath: "ea",
      expectedProjectRoot: "epr",
      expectedDestinationRoot: "edr",
    };
    expect(validateInput(input, VBA_EXECUTE_SCHEMA)).toBeUndefined();
  });

  it("DOCTOR_SCHEMA allows context, overrides, and timeoutMs", () => {
    const input = {
      projectId: "p1",
      contextId: "c1",
      accessPath: "a",
      backendPath: "b",
      destinationRoot: "d",
      projectRoot: "pr",
      timeoutMs: 5000,
      strictContext: true,
      expectedAccessPath: "ea",
      expectedProjectRoot: "epr",
      expectedDestinationRoot: "edr",
    };
    expect(validateInput(input, DOCTOR_SCHEMA)).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// validateInput — schema-form additionalProperties (PR 5 of #624)
// ──────────────────────────────────────────────────────────────────────────────

describe("validateInput — additionalProperties schema form", () => {
  it('additionalProperties: { type: "string" } accepts valid extra keys', () => {
    const schema: JsonObjectSchema = {
      type: "object",
      additionalProperties: { type: "string" },
      properties: {
        a: { type: "string" },
      },
    };
    const result = validateInput({ a: "hello", b: "world" }, schema);
    expect(result).toBeUndefined();
  });

  it('additionalProperties: { type: "string" } rejects extra key with wrong primitive type', () => {
    const schema: JsonObjectSchema = {
      type: "object",
      additionalProperties: { type: "string" },
      properties: {
        a: { type: "string" },
      },
    };
    const result = validateInput({ a: "hello", b: 42 }, schema);
    expect(result).toBe("b must be a string.");
  });

  it("additionalProperties: { enum: [...] } rejects disallowed value", () => {
    const schema: JsonObjectSchema = {
      type: "object",
      additionalProperties: { enum: ["a", "b", "c"] },
      properties: {},
    };
    const result = validateInput({ x: "d" }, schema);
    expect(result).toBe("x must be one of: a, b, c.");
  });

  it("additionalProperties schema form is enforced recursively in nested objects", () => {
    const schema: JsonObjectSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        nested: {
          type: "object",
          // Nested object property allows arbitrary number-valued additional keys.
          additionalProperties: { type: "number" },
          properties: {
            z: { type: "number" },
          },
        },
      },
    };
    const result = validateInput({ nested: { y: "not a number", z: 99 } }, schema);
    expect(result).toBe("nested.y must be a number.");
  });

  it("additionalProperties: false still rejects extra keys (regression)", () => {
    const schema: JsonObjectSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        a: { type: "string" },
      },
    };
    const result = validateInput({ a: "hello", extra: "not allowed" }, schema);
    expect(result).toMatch(/^extra is not allowed./);
  });

  it("additionalProperties: true still allows extra keys (regression)", () => {
    const schema: JsonObjectSchema = {
      type: "object",
      additionalProperties: true,
      properties: {
        a: { type: "string" },
      },
    };
    const result = validateInput({ a: "hello", any: "value", count: 42 }, schema);
    expect(result).toBeUndefined();
  });
});
