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
    // PR2 (#621 F1 / #6a) — modern/legacy alias parity for query execute.
    // The legacy `exec_sql` schema already declares allowTables/denyTables
    // and `scripts/dysflow-access-runner.ps1:1062-1072` enforces them.
    // `AccessQueryRequest.allowTables` / `denyTables` exist on the core
    // contract (`src/core/contracts/index.ts:207-208`); this surfaces them in
    // the modern tool's inputSchema so the handler's spread (`...request`)
    // carries them through to `AccessQueryService.execute`. Write-mode only —
    // read-mode ignores the guards, which is the same behavior the legacy
    // alias has always had.
    allowTables: SCHEMA_PROPS.allowTables,
    denyTables: SCHEMA_PROPS.denyTables,
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

export const LIST_PROCEDURES_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["module"],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    module: {
      type: "string",
      description: "VBA module name (without extension).",
    },
    filter: {
      type: "string",
      description:
        "Optional substring filter; only procedures whose name contains this value are returned.",
    },
    kind: {
      type: "string",
      enum: ["Sub", "Function", "Property", "both"],
      description:
        "Optional procedure kind filter. Use 'both' or omit to include every procedure kind.",
    },
    source: {
      type: "string",
      description:
        "VBA module source code. When provided, the procedure catalog is built by parsing this text. When omitted, the module is resolved via the project's source root.",
    },
    ...ACCESS_OVERRIDE,
    ...STRICT_CTX,
  },
};

export const GET_PROCEDURE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["module", "procedure"],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    module: {
      type: "string",
      description: "VBA module name (without extension).",
    },
    procedure: {
      type: "string",
      minLength: 1,
      description: "Name of the procedure to retrieve.",
    },
    source: {
      type: "string",
      description:
        "VBA module source code. When provided, the procedure is located by parsing this text. When omitted, the module is resolved via the project's source root.",
    },
    ...ACCESS_OVERRIDE,
    ...STRICT_CTX,
  },
};

export const FIND_REFERENCES_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["symbol"],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    symbol: {
      type: "string",
      minLength: 1,
      description: "The name of the symbol to search references for.",
    },
    scope: {
      type: "string",
      enum: ["module", "binary", "source", "all"],
      description: "Search scope: module, binary, source, or all. Defaults to all.",
    },
    module: {
      type: "string",
      description: "Optional module name constraint. Restricts search to this module only.",
    },
    modules: {
      type: "object",
      description: "Optional in-memory mapping of module names to source code.",
      additionalProperties: { type: "string" },
    },
    ...ACCESS_OVERRIDE,
    ...STRICT_CTX,
  },
};

export const VALIDATE_MANIFEST_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    testsPath: {
      type: "string",
      description: "VBA test manifest path. Relative paths resolve against the project root.",
    },
    path: {
      type: "string",
      description: "Alias for testsPath.",
    },
    manifest: {
      description:
        "Inline test manifest object or array. Use testsPath/path for normal project validation.",
      additionalProperties: true,
    },
    modules: {
      type: "object",
      description: "Optional in-memory mapping of module names to source code.",
      additionalProperties: { type: "string" },
    },
    ...ACCESS_OVERRIDE,
    ...STRICT_CTX,
  },
};

export const LINT_MODULE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["module"],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    module: {
      type: "string",
      minLength: 1,
      description: "VBA module name (without extension) to lint.",
    },
    source: {
      type: "string",
      description:
        "Inline VBA module source code. When omitted, the module is resolved via the project's source root.",
    },
    rules: {
      type: "array",
      description:
        "Optional rule filter. Omit to run all rules. An empty array produces a clean report (no rules applied). Unknown rule names are rejected by schema validation. Supported rules: option-declaration, identifier-safety, declaration-order, arg-type-match, forbidden-name, logical-short-circuit, implicit-variant, missing-exit-handler, invalid-static-class-call, openargs-contract-mismatch. " +
        "Rule limitations: arg-type-match checks same-module signatures only and detects clear literal-argument / declared-type mismatches. forbidden-name (F22) flags identifiers that shadow VBA / Access / DAO / Scripting globals (Err, Date, Name, Form, DoCmd, etc.). logical-short-circuit flags And/Or operations on the same object combining existence check and member access. implicit-variant flags multiple declarations on a single line missing explicit As clause. missing-exit-handler flags missing Exit Sub/Function/Property before error label. invalid-static-class-call flags static-style calls on non-predeclared class modules. " +
        "openargs-contract-mismatch (#1006 slice 2) — project-level rule that pairs DoCmd.OpenForm producer sites against Me.OpenArgs consumers across the configured project's .cls tree (forms/, classes/, reports/). It walks every .cls file under the resolved destinationRoot, runs the project-lint engine, and emits one OPENARGS_CONTRACT_MISMATCH diagnostic per divergent producer/consumer pair (producerGrammar vs consumerGrammar differ, and a silent fallback is reachable in the consumer). When this rule is requested, the destinationRoot must resolve; the rule is silently skipped if the project source tree cannot be enumerated. " +
        "identifier-safety (issue #789) — non-ASCII VBA identifiers (Spanish, Portuguese, French, German, Italian, etc.) are valid VBA and emit `warning` by default; they do NOT block. The `._` dot-underscore and reserved-word findings stay at `error` always. To restore the historical strict (error) severity for non-ASCII, set `capabilities.lint.identifierSafety.strictNonAscii: true` in `.dysflow/project.json`.",
      items: {
        type: "string",
        enum: [
          "option-declaration",
          "identifier-safety",
          "declaration-order",
          "arg-type-match",
          "forbidden-name",
          "logical-short-circuit",
          "implicit-variant",
          "missing-exit-handler",
          "invalid-static-class-call",
          "openargs-contract-mismatch",
        ],
      },
    },
    ...ACCESS_OVERRIDE,
    ...STRICT_CTX,
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
        "Optional explicit PID the operator confirms they want killed. Omit confirmPid to list orphan candidates (MSACCESS.EXE or pwsh.exe worker). When present, the tool refuses zero or negative values. No wildcards, no name match — only this exact PID, and only if it is headless AND holding the accessPath (MSACCESS) or owned by a Dysflow operation (pwsh worker).",
    },
  },
};

// Round-12 (#976) — `clean_stale_markers`. The user-callable companion to
// the #967 auto-cleanup. Safe-by-default: `dryRun` defaults to true and
// `confirm` is required before any non-dry-run call is allowed through.
//
//   - `olderThanMinutes` defaults to 30 (matches the #967 default).
//   - `keepFailed` defaults to true (preserves diagnostic value of
//     markers from failed operations regardless of age).
//   - `dryRun` defaults to true; `confirm` is only consulted when
//     `dryRun: false`.
//
// The handler refuses `dryRun: false` without `confirm: true` BEFORE
// any service call, so a missed confirm never reaches the filesystem.
export const CLEAN_STALE_MARKERS_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: [],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden.",
    },
    options: {
      type: "object",
      additionalProperties: false,
      properties: {
        olderThanMinutes: {
          type: "number",
          minimum: 1,
          description:
            "Stale cutoff in minutes. Markers with `updatedAt` older than this are reap candidates. Defaults to 30.",
        },
        dryRun: {
          type: "boolean",
          description:
            "When true (default), return the plan without writing. When false, perform real transitions (requires confirm:true).",
        },
        keepFailed: {
          type: "boolean",
          description:
            "When true (default), markers from failed operations are NEVER transitioned regardless of age. Set false to also reap stale failed markers.",
        },
        confirm: {
          type: "boolean",
          description:
            "Required for any non-dry-run call. Literal `true` is the only acceptable value; omitting it or passing false leaves the tool in dry-run mode.",
        },
      },
    },
  },
};

// issue #705 — `detect_dead_code`. The schema mirrors the
// `find_references` shape: the caller either supplies an inline
// `modules` map (so the handler never opens Access) or relies on the
// project-source-tree fallback resolved via the Access context.
//
// `modules` is intentionally NOT in the `required` list: omitting it is
// a valid request that triggers the `resolveAllProjectModules` fallback
// inside the handler. When the fallback also fails to resolve anything,
// the handler returns a typed `MODULE_NOT_FOUND` envelope (#705 review
// blocker #2). The `additionalProperties: false` guard rejects typos at
// the validator boundary so the handler never runs against ill-formed
// input.
export const DETECT_DEAD_CODE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["scope"],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    scope: {
      type: "string",
      enum: ["binary", "source", "module"],
      description:
        "Search scope for the dead-code analysis. The handler treats the caller-supplied modules map as the source of truth regardless of scope; `scope` and `module` are echoed back on the report for caller introspection.",
    },
    module: {
      type: "string",
      description:
        "Optional module-name constraint. When set, only procedures and declarations in that module are considered; risk is elevated to `Med` for surviving private-procedure findings because a narrowed scan may hide references that live outside the chosen module.",
    },
    modules: {
      type: "object",
      description:
        "In-memory mapping of module name to VBA source code. The handler operates exclusively on this map and never opens Access or reads from disk. Omit to defer to the project-source-tree fallback resolved via the Access context.",
      additionalProperties: { type: "string" },
    },
    ...ACCESS_OVERRIDE,
    ...STRICT_CTX,
  },
};
