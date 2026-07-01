// Backward-compat re-export shim. The shared types, property atoms and
// HTTP schemas now live in src/shared/validation/. The MCP adapter still
// owns a small set of MCP-only tool schemas (NO_INPUT_SCHEMA,
// VBA_EXECUTE_SCHEMA, QUERY_EXECUTE_SCHEMA, DOCTOR_SCHEMA,
// ORPHAN_CLEANUP_SCHEMA); those are defined locally below so the
// `dysflow_*` MCP tool registry can keep its imports stable.
//
// Anything that used to be exported from this file can still be imported
// from here — the re-exports are identity (`export { X } from`) so the
// runtime values are the same instances as in src/shared/validation/.

import {
  ACCESS_OVERRIDE,
  type JsonObjectSchema,
  SCHEMA_PROPS,
  STRICT_CTX,
} from "../../../shared/validation/index.js";

// Re-exports — types.
export type {
  JsonObjectSchema,
  JsonSchemaPrimitiveType,
  JsonSchemaProperty,
} from "../../../shared/validation/index.js";
// Re-exports — shared atoms.
// Re-exports — HTTP request schemas.
export {
  ACCESS_OVERRIDE,
  CLEANUP_SCHEMA,
  CTX_PROPS,
  HTTP_QUERY_SCHEMA,
  HTTP_VBA_EXECUTE_SCHEMA,
  HTTP_WRITE_QUERY_SCHEMA,
  SCHEMA_PROPS,
  STRICT_CTX,
} from "../../../shared/validation/index.js";

// Local MCP tool schemas (no HTTP counterpart; stay in the adapter).
export const NO_INPUT_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

export const VBA_EXECUTE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["procedureName"],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden by a tool that supports overrides.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    moduleName: { type: "string", description: "Optional VBA module name." },
    procedureName: {
      type: "string",
      minLength: 1,
      description: "Public VBA procedure to execute.",
    },
    arguments: { type: "array", items: {}, description: "Procedure arguments." },
    // PR1a (#621 F1) — explicit escape hatch for default-deny gate at the MCP
    // adapter. When the project config does not declare `allowedProcedures`,
    // the adapter refuses execution unless the caller passes `dryRun: true`.
    dryRun: SCHEMA_PROPS.dryRun,
    ...ACCESS_OVERRIDE,
    ...STRICT_CTX,
    timeoutMs: SCHEMA_PROPS.timeoutMs,
  },
};

export const QUERY_EXECUTE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["sql", "mode"],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden by a tool that supports overrides.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    sql: { type: "string", minLength: 1, description: "Access SQL to execute." },
    backendPath: {
      type: "string",
      description: "Optional override for Access backend database path.",
    },
    databasePath: { type: "string", description: "Database path." },
    sourcePath: {
      type: "string",
      description: "Source path alias for databasePath.",
    },
    mode: {
      type: "string",
      enum: ["read", "write"],
      description: "Execution mode: read or write.",
    },
    dryRun: SCHEMA_PROPS.dryRun,
    apply: SCHEMA_PROPS.apply,
  },
};

export const DOCTOR_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden by a tool that supports overrides.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    includeEnvironment: {
      type: "boolean",
      description: "Include environment diagnostics when supported.",
    },
    ...ACCESS_OVERRIDE,
    ...STRICT_CTX,
    timeoutMs: SCHEMA_PROPS.timeoutMs,
  },
};

export const ORPHAN_CLEANUP_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: [],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden by a tool that supports overrides.",
    },
    accessPath: {
      type: "string",
      description:
        "Frontend .accdb path to scan. Defaults to the accessDbPath declared in .dysflow/project.json when omitted.",
    },
    confirmPid: {
      type: "number",
      minimum: 1,
      description:
        "Optional explicit PID the operator confirms they want killed. Omit confirmPid to list orphan candidates. When present, the tool refuses zero or negative values. No wildcards, no name match — only this exact PID, and only if it is headless AND holding the accessPath.",
    },
  },
};
