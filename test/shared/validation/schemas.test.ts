import { describe, expect, it } from "vitest";
import type {
  JsonObjectSchema,
  JsonSchemaPrimitiveType,
  JsonSchemaProperty,
} from "../../../src/shared/validation";

// ──────────────────────────────────────────────────────────────────────────────
// JsonObjectSchema — type shape & required fields
// ──────────────────────────────────────────────────────────────────────────────

describe("JsonObjectSchema — type shape contract", () => {
  it("is satisfied by a literal with type 'object', properties, and additionalProperties", () => {
    const schema: JsonObjectSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
      },
    };
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties)).toEqual(["name"]);
  });

  it("supports optional required array", () => {
    const schema: JsonObjectSchema = {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: { name: { type: "string" } },
    };
    expect(schema.required).toEqual(["name"]);
  });

  it("supports nested object properties", () => {
    const schema: JsonObjectSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        config: {
          type: "object",
          required: ["path"],
          additionalProperties: false,
          properties: { path: { type: "string" } },
        },
      },
    };
    const configProp = schema.properties.config;
    expect(configProp?.type).toBe("object");
    expect(configProp?.required).toEqual(["path"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// JsonSchemaProperty — supported field set
// ──────────────────────────────────────────────────────────────────────────────

describe("JsonSchemaProperty — supported field set", () => {
  it("supports type, description, enum, minLength, maxLength", () => {
    const prop: JsonSchemaProperty = {
      type: "string",
      description: "user name",
      enum: ["admin", "user"],
      minLength: 1,
      maxLength: 50,
    };
    expect(prop.type).toBe("string");
    expect(prop.enum).toEqual(["admin", "user"]);
  });

  it("supports numeric minimum and maximum", () => {
    const prop: JsonSchemaProperty = {
      type: "number",
      minimum: 1,
      maximum: 1000,
    };
    expect(prop.minimum).toBe(1);
    expect(prop.maximum).toBe(1000);
  });

  it("supports pattern, maxItems, items for arrays", () => {
    const prop: JsonSchemaProperty = {
      type: "array",
      maxItems: 100,
      pattern: "^[a-z]+$",
      items: { type: "string" },
    };
    expect(prop.maxItems).toBe(100);
    expect(prop.items?.type).toBe("string");
  });

  it("supports nested object with required and additionalProperties", () => {
    const prop: JsonSchemaProperty = {
      type: "object",
      required: ["x"],
      additionalProperties: false,
      properties: { x: { type: "number" } },
    };
    expect(prop.required).toEqual(["x"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// JsonSchemaPrimitiveType — exhaustive type union
// ──────────────────────────────────────────────────────────────────────────────

describe("JsonSchemaPrimitiveType — type union contract", () => {
  it("accepts every primitive literal expected by the validator", () => {
    const types: JsonSchemaPrimitiveType[] = ["string", "boolean", "number", "array", "object"];
    expect(types).toHaveLength(5);
    expect(new Set(types).size).toBe(5);
  });

  it("rejects unknown primitive values at the type level", () => {
    // Compile-time guarantee: this assignment is a type error if a stray
    // string is added without updating the union.
    const prop: JsonSchemaProperty = { type: "string" };
    if (prop.type !== undefined) {
      const t: JsonSchemaPrimitiveType = prop.type;
      expect(typeof t).toBe("string");
    }
  });
});
