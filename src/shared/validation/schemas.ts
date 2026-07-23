// Base types and schemas for the 5 dysflow_* official tools.

export type JsonSchemaPrimitiveType = "string" | "boolean" | "number" | "array" | "object";

export type JsonSchemaProperty = {
  type?: JsonSchemaPrimitiveType;
  description?: string;
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: JsonSchemaProperty;
  maxItems?: number;
  // Boolean form (true / false) and schema form (a nested
  // JsonSchemaProperty) are both enforced by the dysflow validator
  // (#624 PR 5). Schema-form lets callers constrain values of arbitrary
  // additional keys — e.g. `additionalProperties: { type: "string" }`
  // for a string-valued map.
  additionalProperties?: boolean | JsonSchemaProperty;
  required?: readonly string[];
  properties?: Record<string, JsonSchemaProperty>;
};

export type JsonObjectSchema = {
  type: "object";
  description?: string;
  required?: readonly string[];
  // Boolean form (false / true) is the original contract. The schema form
  // (a nested JsonSchemaProperty) lets callers constrain values of arbitrary
  // additional keys — e.g. `additionalProperties: { type: "string" }` for a
  // string-valued map. The validator enforces both forms (#624 PR 5).
  additionalProperties: boolean | JsonSchemaProperty;
  properties: Record<string, JsonSchemaProperty>;
  // Issue #1074 — declarative constraint for alias groups and other
  // composition rules. The validator enforces that at least one
  // alternative whose `required` set is a subset of the supplied keys
  // is satisfied. Each alternative is a partial `JsonObjectSchema` —
  // only `required` is consulted today; additional constraints
  // (`properties`, `additionalProperties`, etc.) are reserved for
  // future rolls without breaking the existing catalog surface.
  anyOf?: readonly Partial<JsonObjectSchema>[];
};
