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
  // Boolean form (true/false) is what the dysflow validator currently
  // understands. Schema form (a nested JsonSchemaProperty) is the
  // canonical JSON-Schema way to constrain values of arbitrary keys
  // (e.g. `additionalProperties: { type: "string" }` for a string map).
  // The validator passes the schema form through without enforcing it
  // (effectively `additionalProperties: true`); documented for future
  // tightening.
  additionalProperties?: boolean | JsonSchemaProperty;
  required?: readonly string[];
  properties?: Record<string, JsonSchemaProperty>;
};

export type JsonObjectSchema = {
  type: "object";
  description?: string;
  required?: readonly string[];
  additionalProperties: boolean;
  properties: Record<string, JsonSchemaProperty>;
};
