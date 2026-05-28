import { isRecord } from "../../core/utils/index.js";
import type { JsonObjectSchema, JsonSchemaPrimitiveType, JsonSchemaProperty } from "./schemas.js";

export function validateInput(input: unknown, schema: JsonObjectSchema): string | undefined {
  const params = input === undefined ? {} : input;
  if (!isRecord(params)) return "input must be an object.";

  for (const required of schema.required ?? []) {
    if (params[required] === undefined) return `${required} is required.`;
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(params)) {
      if (schema.properties[key] === undefined) return `${key} is not allowed.`;
    }
  }

  for (const [key, property] of Object.entries(schema.properties)) {
    const value = params[key];
    if (value === undefined) continue;
    const validation = validateJsonSchemaProperty(value, property, key);
    if (validation !== undefined) return validation;
  }

  return undefined;
}

function validateJsonSchemaProperty(
  value: unknown,
  property: JsonSchemaProperty,
  path: string,
): string | undefined {
  if (property.type === undefined) return undefined;
  if (!matchesJsonSchemaType(value, property.type))
    return `${path} must be ${articleFor(property.type)} ${property.type}.`;

  if (property.enum !== undefined) {
    if (typeof value !== "string" || !property.enum.includes(value))
      return `${path} must be one of: ${property.enum.join(", ")}.`;
  }

  if (property.minLength !== undefined && typeof value === "string") {
    if (value.trim().length < property.minLength)
      return `${path} must be at least ${property.minLength} non-whitespace character${property.minLength === 1 ? "" : "s"}.`;
  }

  if (property.pattern !== undefined && typeof value === "string") {
    if (!new RegExp(property.pattern).test(value))
      return `${path} does not match the required pattern.`;
  }

  if (property.type === "array" && property.items !== undefined && Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const validation = validateJsonSchemaProperty(item, property.items, `${path}[${index}]`);
      if (validation !== undefined) return validation;
    }
  }

  if (property.type === "object" && isRecord(value)) {
    if (property.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (property.properties?.[key] === undefined) return `${path}.${key} is not allowed.`;
      }
    }
    for (const [key, childProperty] of Object.entries(property.properties ?? {})) {
      const childValue = value[key];
      if (childValue === undefined) continue;
      const validation = validateJsonSchemaProperty(childValue, childProperty, `${path}.${key}`);
      if (validation !== undefined) return validation;
    }
  }

  return undefined;
}

function matchesJsonSchemaType(value: unknown, type: JsonSchemaPrimitiveType): boolean {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "object":
      return isRecord(value);
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number";
    case "string":
      return typeof value === "string";
  }
}

function articleFor(type: JsonSchemaPrimitiveType): "a" | "an" {
  return type === "object" || type === "array" ? "an" : "a";
}
