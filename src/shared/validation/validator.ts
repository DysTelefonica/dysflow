import { isRecord } from "../../core/utils/index.js";
import type { JsonObjectSchema, JsonSchemaPrimitiveType, JsonSchemaProperty } from "./schemas.js";

export function validateInput(input: unknown, schema: JsonObjectSchema): string | undefined {
  const params = input === undefined ? {} : input;
  if (!isRecord(params)) return "input must be an object.";

  const missingRequired = validateRequiredProperties(params, schema.required, "");
  if (missingRequired !== undefined) return missingRequired;

  // Issue #1057 (F8) — when a schema declares BOTH `apply` and `dryRun`,
  // a caller passing contradictory values (apply === dryRun, since
  // dryRun ≡ !apply) is rejected up-front instead of one flag silently
  // winning. Consistent redundancy (apply:true + dryRun:false) stays
  // accepted for backward compatibility with the precedence contract.
  const applyDryRunConflict = validateApplyDryRunConsistency(params, schema);
  if (applyDryRunConflict !== undefined) return applyDryRunConflict;

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(params)) {
      if (schema.properties[key] === undefined)
        return unknownKeyMessage(key, Object.keys(schema.properties));
    }
  } else if (isSchemaFormAdditionalProperties(schema.additionalProperties)) {
    for (const key of Object.keys(params)) {
      if (schema.properties[key] !== undefined) continue;
      const validation = validateJsonSchemaProperty(params[key], schema.additionalProperties, key);
      if (validation !== undefined) return validation;
    }
  }

  for (const [key, property] of Object.entries(schema.properties)) {
    const value = params[key];
    if (value === undefined) continue;
    const validation = validateJsonSchemaProperty(value, property, key);
    if (validation !== undefined) return validation;
  }

  // Issue #1074 — declarative alias-group enforcement. When the schema
  // declares `anyOf`, at least one alternative must be satisfied. An
  // alternative is satisfied when every key in its `required` set is
  // present in `params`. The error message lists the valid alternatives
  // so a consumer can self-correct without reading the schema.
  // Handler-only rules are no longer required.
  const anyOfViolation = validateAnyOf(params, schema);
  if (anyOfViolation !== undefined) return anyOfViolation;

  return undefined;
}

/**
 * Issue #1074 — returns an error message when none of the `anyOf`
 * alternatives are satisfied. The error message lists the valid
 * alternatives (each alternative's `required` set) so a consumer can
 * pick the preferred parameter without reverse-engineering the schema.
 */
function validateAnyOf(
  params: Record<string, unknown>,
  schema: JsonObjectSchema,
): string | undefined {
  if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) return undefined;
  const paramKeys = Object.keys(params);
  for (const alt of schema.anyOf) {
    const required = alt.required ?? [];
    if (required.every((key: string) => paramKeys.includes(key))) return undefined;
  }
  const alternatives = schema.anyOf
    .map((alt) => alt.required ?? [])
    .filter((req) => req.length > 0)
    .map((req) => `[${req.join(" | ")}]`);
  if (alternatives.length === 0) return undefined;
  return `one of these is required: ${alternatives.join(", ")}.`;
}

function validateJsonSchemaProperty(
  value: unknown,
  property: JsonSchemaProperty,
  path: string,
): string | undefined {
  // `enum` without `type` is still enforceable (string-by-default per
  // the existing enum branch below). Skip the early-return only when
  // neither guard is set.
  if (property.type === undefined && property.enum === undefined) return undefined;
  if (property.type !== undefined && !matchesJsonSchemaType(value, property.type))
    return `${path} must be ${articleFor(property.type)} ${property.type}.`;

  if (property.enum !== undefined) {
    if (typeof value !== "string" || !property.enum.includes(value))
      return `${path} must be one of: ${property.enum.join(", ")}.`;
  }

  if (property.minLength !== undefined && typeof value === "string") {
    if (value.trim().length < property.minLength)
      return `${path} must be at least ${property.minLength} non-whitespace character${property.minLength === 1 ? "" : "s"}.`;
  }

  if (property.maxLength !== undefined && typeof value === "string") {
    if (value.length > property.maxLength)
      return `${path} must be at most ${property.maxLength} characters.`;
  }

  if (property.minimum !== undefined && typeof value === "number") {
    if (value < property.minimum) return `${path} must be at least ${property.minimum}.`;
  }

  if (property.maximum !== undefined && typeof value === "number") {
    if (value > property.maximum) return `${path} must be at most ${property.maximum}.`;
  }

  if (property.maxItems !== undefined && Array.isArray(value)) {
    if (value.length > property.maxItems)
      return `${path} must have at most ${property.maxItems} items.`;
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
    const missingRequired = validateRequiredProperties(value, property.required, path);
    if (missingRequired !== undefined) return missingRequired;

    if (property.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (property.properties?.[key] === undefined) return `${path}.${key} is not allowed.`;
      }
    } else if (isSchemaFormAdditionalProperties(property.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (property.properties?.[key] !== undefined) continue;
        const validation = validateJsonSchemaProperty(
          value[key],
          property.additionalProperties,
          `${path}.${key}`,
        );
        if (validation !== undefined) return validation;
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

function validateRequiredProperties(
  value: Record<string, unknown>,
  requiredProperties: readonly string[] | undefined,
  path: string,
): string | undefined {
  for (const required of requiredProperties ?? []) {
    if (value[required] === undefined) {
      const requiredPath = path === "" ? required : `${path}.${required}`;
      return `${requiredPath} is required.`;
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

/**
 * Issue #1057 (F1 + F4) — unknown-key rejection with guidance. Keeps the
 * legacy `"<key> is not allowed."` prefix (regex consumers and the #757 C4
 * dispatch enrichment match on it) and appends the schema's valid params
 * plus a "Did you mean" suggestion when a near-match exists.
 */
function unknownKeyMessage(key: string, validKeys: readonly string[]): string {
  const suggestion = closestKey(key, validKeys);
  const validList = validKeys.length > 0 ? ` Valid params: ${validKeys.join(", ")}.` : "";
  const hint = suggestion === undefined ? "" : ` Did you mean '${suggestion}'?`;
  return `${key} is not allowed.${validList}${hint}`;
}

/**
 * Nearest-key heuristic for the "Did you mean" hint: case-insensitive
 * containment (module → moduleName, moduleName → moduleNames) wins first,
 * then a Levenshtein distance of at most 2. Returns undefined when no
 * candidate is close enough.
 */
function closestKey(key: string, validKeys: readonly string[]): string | undefined {
  const lower = key.toLowerCase();
  let best: { key: string; score: number } | undefined;
  for (const candidate of validKeys) {
    const candidateLower = candidate.toLowerCase();
    if (candidateLower === lower) return candidate;
    const contained =
      candidateLower.startsWith(lower) ||
      lower.startsWith(candidateLower) ||
      candidateLower.includes(lower);
    const distance = contained ? 0 : levenshtein(lower, candidateLower);
    const score = contained ? Math.abs(candidate.length - key.length) : distance + 10;
    if (contained || distance <= 2) {
      if (best === undefined || score < best.score) best = { key: candidate, score };
    }
  }
  return best?.key;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prior = previous[0] as number;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = prior + (a[i - 1] === b[j - 1] ? 0 : 1);
      prior = previous[j] as number;
      previous[j] = Math.min(prior + 1, (previous[j - 1] as number) + 1, substitution);
    }
  }
  return previous[b.length] as number;
}

/**
 * Issue #1057 (F8) — reject contradictory apply/dryRun combinations.
 * Applies only when the schema declares BOTH flags; otherwise the
 * standard unknown-key / type rules govern.
 */
function validateApplyDryRunConsistency(
  params: Record<string, unknown>,
  schema: JsonObjectSchema,
): string | undefined {
  if (schema.properties.apply === undefined || schema.properties.dryRun === undefined)
    return undefined;
  const apply = params.apply;
  const dryRun = params.dryRun;
  if (typeof apply !== "boolean" || typeof dryRun !== "boolean") return undefined;
  if (apply === dryRun) {
    return (
      `apply and dryRun are mutually exclusive: apply:${apply} contradicts dryRun:${dryRun}. ` +
      `Pass only one — apply is canonical (apply:true = commit, apply:false = plan); ` +
      `dryRun:true is a deprecated alias of apply:false.`
    );
  }
  return undefined;
}

// Distinguishes the schema form of `additionalProperties`
// (`{ type: "string" }`, `{ enum: [...] }`) from the boolean form
// (`true` / `false`) and the absent form. Used by `validateInput` and
// `validateJsonSchemaProperty` to enforce per-key schemas. Closes #624.
function isSchemaFormAdditionalProperties(
  value: JsonSchemaProperty["additionalProperties"],
): value is JsonSchemaProperty {
  return typeof value === "object" && value !== null;
}
