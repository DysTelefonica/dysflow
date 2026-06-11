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
  additionalProperties?: boolean;
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