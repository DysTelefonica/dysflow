import { describe, expect, it } from "vitest";
import type { JsonObjectSchema } from "../../../src/adapters/mcp/schemas";
import { SCHEMA_PROPS } from "../../../src/adapters/mcp/schemas";
import { validateInput } from "../../../src/adapters/mcp/validator";

// ──────────────────────────────────────────────────────────────────────────────
// validateInput — numeric bounds (minimum / maximum)
// ──────────────────────────────────────────────────────────────────────────────

describe("validateInput — numeric bounds", () => {
  const schemaWithMinimum: JsonObjectSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      count: { type: "number", minimum: 1 },
    },
  };

  const schemaWithMaximum: JsonObjectSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      count: { type: "number", maximum: 100 },
    },
  };

  const schemaWithBoth: JsonObjectSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      count: { type: "number", minimum: 1, maximum: 100 },
    },
  };

  // ── below minimum ──────────────────────────────────────────────────────────

  it("rejects a value below minimum", () => {
    const result = validateInput({ count: 0 }, schemaWithMinimum);
    expect(result).toBe("count must be at least 1.");
  });

  it("rejects a negative value when minimum is 1", () => {
    const result = validateInput({ count: -5 }, schemaWithMinimum);
    expect(result).toBe("count must be at least 1.");
  });

  // ── at/above minimum ──────────────────────────────────────────────────────

  it("accepts the exact minimum value", () => {
    const result = validateInput({ count: 1 }, schemaWithMinimum);
    expect(result).toBeUndefined();
  });

  it("accepts a value above minimum", () => {
    const result = validateInput({ count: 999 }, schemaWithMinimum);
    expect(result).toBeUndefined();
  });

  // ── above maximum ─────────────────────────────────────────────────────────

  it("rejects a value above maximum", () => {
    const result = validateInput({ count: 101 }, schemaWithMaximum);
    expect(result).toBe("count must be at most 100.");
  });

  it("accepts the exact maximum value", () => {
    const result = validateInput({ count: 100 }, schemaWithMaximum);
    expect(result).toBeUndefined();
  });

  // ── combined minimum + maximum ────────────────────────────────────────────

  it("rejects a value below minimum when both are set", () => {
    const result = validateInput({ count: 0 }, schemaWithBoth);
    expect(result).toBe("count must be at least 1.");
  });

  it("rejects a value above maximum when both are set", () => {
    const result = validateInput({ count: 200 }, schemaWithBoth);
    expect(result).toBe("count must be at most 100.");
  });

  it("accepts a value within range when both are set", () => {
    const result = validateInput({ count: 50 }, schemaWithBoth);
    expect(result).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SCHEMA_PROPS — specific bounded fields declared in dysflow-schemas.ts
// ──────────────────────────────────────────────────────────────────────────────

describe("SCHEMA_PROPS — bounded numeric fields (#432)", () => {
  // Build minimal object schemas around each SCHEMA_PROPS atom so we can call
  // validateInput without wiring full tool schemas.

  function wrapProp(prop: (typeof SCHEMA_PROPS)[keyof typeof SCHEMA_PROPS]): JsonObjectSchema {
    return { type: "object", additionalProperties: false, properties: { value: prop } };
  }

  describe("timeoutMs (minimum: 1)", () => {
    const schema = wrapProp(SCHEMA_PROPS.timeoutMs);

    it("rejects timeoutMs: 0", () => {
      expect(validateInput({ value: 0 }, schema)).toBe("value must be at least 1.");
    });

    it("rejects timeoutMs: -100", () => {
      expect(validateInput({ value: -100 }, schema)).toBe("value must be at least 1.");
    });

    it("accepts timeoutMs: 1", () => {
      expect(validateInput({ value: 1 }, schema)).toBeUndefined();
    });

    it("accepts timeoutMs: 30000", () => {
      expect(validateInput({ value: 30000 }, schema)).toBeUndefined();
    });
  });

  describe("limit (minimum: 1)", () => {
    const schema = wrapProp(SCHEMA_PROPS.limit);

    it("rejects limit: 0", () => {
      expect(validateInput({ value: 0 }, schema)).toBe("value must be at least 1.");
    });

    it("rejects limit: -1", () => {
      expect(validateInput({ value: -1 }, schema)).toBe("value must be at least 1.");
    });

    it("accepts limit: 1", () => {
      expect(validateInput({ value: 1 }, schema)).toBeUndefined();
    });
  });

  describe("top (minimum: 0)", () => {
    const schema = wrapProp(SCHEMA_PROPS.top);

    it("accepts top: 0", () => {
      expect(validateInput({ value: 0 }, schema)).toBeUndefined();
    });

    it("rejects top: -5", () => {
      expect(validateInput({ value: -5 }, schema)).toBe("value must be at least 0.");
    });

    it("accepts top: 1", () => {
      expect(validateInput({ value: 1 }, schema)).toBeUndefined();
    });
  });
});

describe("validateInput — maxLength and maxItems bounds", () => {
  const schemaWithMaxLength: JsonObjectSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      str: { type: "string", maxLength: 5 },
    },
  };

  const schemaWithMaxItems: JsonObjectSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      arr: { type: "array", maxItems: 3, items: { type: "string" } },
    },
  };

  it("rejects string longer than maxLength", () => {
    const result = validateInput({ str: "abcdef" }, schemaWithMaxLength);
    expect(result).toBe("str must be at most 5 characters.");
  });

  it("accepts string within maxLength", () => {
    const result = validateInput({ str: "abcde" }, schemaWithMaxLength);
    expect(result).toBeUndefined();
  });

  it("rejects array with items exceeding maxItems", () => {
    const result = validateInput({ arr: ["a", "b", "c", "d"] }, schemaWithMaxItems);
    expect(result).toBe("arr must have at most 3 items.");
  });

  it("accepts array within maxItems limit", () => {
    const result = validateInput({ arr: ["a", "b", "c"] }, schemaWithMaxItems);
    expect(result).toBeUndefined();
  });
});

describe("validateInput — required properties", () => {
  const schemaWithRequired: JsonObjectSchema = {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: {
      name: { type: "string" },
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

  it("rejects a missing top-level required property", () => {
    const result = validateInput({}, schemaWithRequired);

    expect(result).toBe("name is required.");
  });

  it("accepts a present nested required property", () => {
    const result = validateInput(
      { name: "project", config: { path: "C:/data" } },
      schemaWithRequired,
    );

    expect(result).toBeUndefined();
  });

  it("rejects a missing nested required property with its object path", () => {
    const result = validateInput({ name: "project", config: {} }, schemaWithRequired);

    expect(result).toBe("config.path is required.");
  });

  it("treats an undefined nested required property as absent", () => {
    const result = validateInput(
      { name: "project", config: { path: undefined } },
      schemaWithRequired,
    );

    expect(result).toBe("config.path is required.");
  });

  it("rejects missing required properties inside array object items", () => {
    const schema: JsonObjectSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["name"],
            additionalProperties: false,
            properties: {
              name: { type: "string" },
            },
          },
        },
      },
    };

    const result = validateInput({ items: [{}] }, schema);

    expect(result).toBe("items[0].name is required.");
  });
});
