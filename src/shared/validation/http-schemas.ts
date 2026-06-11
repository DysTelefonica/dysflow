// HTTP request schemas for the dysflow_* official tools. These are the
// schemas the HTTP adapter validates incoming request bodies against.
// Originally defined alongside the MCP-only tool schemas in
// src/adapters/mcp/schemas/dysflow-schemas.ts; moved here so the HTTP
// adapter can import them through the shared validation kernel without
// crossing the adapter-to-adapter boundary.

import type { JsonObjectSchema } from "./schemas.js";
import { SCHEMA_PROPS } from "./schema-props.js";

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
    accessPath: {
      type: "string",
      description: "Access database path associated with the operation.",
    },
    force: { type: "boolean", description: "Force cleanup when supported." },
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
