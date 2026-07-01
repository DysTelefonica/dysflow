// HTTP request schemas for the dysflow_* official tools. These are the
// schemas the HTTP adapter validates incoming request bodies against.
// Originally defined alongside the MCP-only tool schemas in
// src/adapters/mcp/schemas/dysflow-schemas.ts; moved here so the HTTP
// adapter can import them through the shared validation kernel without
// crossing the adapter-to-adapter boundary.

import { ACCESS_OVERRIDE, CTX_PROPS, SCHEMA_PROPS, STRICT_CTX } from "./schema-props.js";
import type { JsonObjectSchema } from "./schemas.js";

export const CLEANUP_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["operationId", "accessPath"],
  additionalProperties: false,
  properties: {
    operationId: {
      type: "string",
      minLength: 1,
      description: "Dysflow-owned Access operation id.",
    },
    // PR2 (#621 F2 / #6b) — modern/legacy alias parity for
    // cleanup_access_operation. The legacy `cleanup_access_operation` schema
    // declares the full optional surface via CTX_PROPS / ACCESS_OVERRIDE /
    // STRICT_CTX / timeoutMs so `buildCleanupRequest` can project every field.
    // Mirror that surface on the modern `CLEANUP_SCHEMA` (accessPath comes via
    // ACCESS_OVERRIDE; force stays explicit) so the modern handler (which now
    // uses `buildCleanupRequest` after PR2) can carry every field through
    // without the validator silently dropping them via `additionalProperties:
    // false`. Forward-compat only — core enforcement of `strictContext` lands
    // in a follow-up.
    force: { type: "boolean", description: "Force cleanup when supported." },
    ...CTX_PROPS,
    ...ACCESS_OVERRIDE,
    ...STRICT_CTX,
    timeoutMs: SCHEMA_PROPS.timeoutMs,
  },
};

export const HTTP_VBA_EXECUTE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["moduleName", "procedureName"],
  additionalProperties: false,
  properties: {
    moduleName: { type: "string", minLength: 1 },
    procedureName: { type: "string", minLength: 1 },
    arguments: { type: "array", items: {} },
  },
};

export const HTTP_QUERY_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["sql"],
  additionalProperties: false,
  properties: { sql: { type: "string", minLength: 1, maxLength: 100000 } },
};

export const HTTP_WRITE_QUERY_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["sql"],
  additionalProperties: false,
  properties: {
    sql: { type: "string", minLength: 1, maxLength: 100000 },
    dryRun: SCHEMA_PROPS.dryRun,
    apply: SCHEMA_PROPS.apply,
  },
};
