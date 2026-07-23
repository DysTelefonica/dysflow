// `schema` — Issue #971 runtime contract discovery.
//
// Read-only MCP tool. Returns the documented schema for every tool in the
// consumer's dysflow installation so an AI agent can introspect the
// contract programmatically instead of parsing prose from tool description
// blocks.
//
// The tool never opens Access, never spawns PowerShell, never mutates
// state. The catalog is built from the static registries already kept in
// lockstep with the dispatcher and contract tables
// (`MCP_TOOL_CONTRACTS`, `MCP_TOOL_SCHEMAS`, `MCP_TOOL_ROUTES`,
// `MODERN_TOOL_NAMES`, `ALIAS_TOOL_NAME_LIST`), so the data shape stays
// aligned with the live adapter by construction — no parallel metadata
// mirror to drift.
//
// Schema shape (one entry per tool):
//   {
//     name,
//     description,
//     parameters,           // typed + required + description + enumValues? + default?
//     returns,              // JSON Schema fragment
//     errorCodes,           // [{code, description, recoverable}]
//     crossReferences,      // issue numbers, e.g. ["#962"]
//     requiredCapabilities, // e.g. ["allowWrites"]
//     safeByDefault,        // boolean
//   }

import {
  commitFlagMetadataForOrNoop,
  legacyAliasesFor,
} from "../../core/runtime/commit-flag-registry.js";
import { ALIAS_TOOL_NAMES } from "./alias-tools.js";
import { DIAGNOSE_INPUT_SCHEMA } from "./diagnose-tool.js";
import {
  CAPABILITIES_DISALLOW_WRITE,
  DESTINATION_ROOT_NOT_FOUND,
  MCP_INPUT_INVALID_CODE,
  MCP_WRITES_DISABLED,
  OUTSIDE_PROJECT_ROOT,
  PROJECT_ID_MISMATCH,
  WRITE_LOCKED_BY_RUNNING_OP,
} from "./dispatch-common.js";
import { MCP_TOOL_ROUTES } from "./dispatch-routes.js";
import { LOGS_TOOL_SCHEMA } from "./logs-tool.js";
import { MCP_TOOL_CONTRACTS, type McpToolAccess } from "./mcp-tool-contracts.js";
import { DYSFLOW_MCP_TOOL_NAMES } from "./mcp-tool-registry.js";
import { RESOLVE_PROJECT_SCHEMA } from "./resolve-project-tool.js";
import type { DysflowMcpTool, McpTextContent, McpToolResult } from "./result-translation.js";
import {
  CLEAN_STALE_MARKERS_SCHEMA,
  DETECT_DEAD_CODE_SCHEMA,
  DOCTOR_SCHEMA,
  FIND_REFERENCES_SCHEMA,
  GET_PROCEDURE_SCHEMA,
  LINT_MODULE_SCHEMA,
  LIST_PROCEDURES_SCHEMA,
  ORPHAN_CLEANUP_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
  VALIDATE_MANIFEST_SCHEMA,
} from "./schemas/dysflow-schemas.js";
import { MCP_TOOL_SCHEMAS, NO_INPUT_SCHEMA } from "./schemas/index.js";
import type { JsonObjectSchema } from "./schemas.js";
import { STATE_TOOL_SCHEMA } from "./state-tool.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Stable parameter surface for the `schema` tool. Mirrors the request body
 * consumers send to `dysflow.schema`. `projectId` is reserved for a
 * future per-project scoping extension (#966 follow-up); the current
 * implementation returns the global catalog regardless of the supplied
 * `projectId`.
 */
export type SchemaInput = {
  projectId?: string;
  toolName?: string;
};

/**
 * Single parameter descriptor exposed under `ToolSchema.parameters`.
 * Mirrors the issue's TypeScript sketch; the `type` literal is narrow so
 * the consumer can branch without consulting JSON Schema.
 */
export type ToolParameterSchema = {
  type: "string" | "number" | "boolean" | "object" | "array" | "enum";
  required: boolean;
  description: string;
  enumValues?: string[];
  default?: unknown;
  canonicalName?: string;
  aliases?: string[];
  deprecated?: boolean;
  deprecatedSince?: string;
  conflictsWith?: string[];
  precedence?: "canonical" | "alias" | "deprecated";
  sensitive?: boolean;
};

/**
 * Single error-code descriptor exposed under `ToolSchema.errorCodes`.
 * `recoverable` reports whether a consumer can branch on the code and
 * retry without human intervention (true) or must escalate (false).
 */
export type ToolErrorCodeSchema = {
  code: string;
  description: string;
  recoverable: boolean;
};

/**
 * Composition constraint for alias groups and other "one of these is
 * required" rules. The `kind` literal reserves room for future
 * `oneOf` / `allOf` rollouts without breaking the catalog surface.
 * `alternatives[*].canonical` is the parameter the handler prefers when
 * callers pass both — absent when the group has no canonical choice.
 *
 * Issue #1074 — exposed under `ToolSchema.compositionConstraints` so a
 * consumer introspects the alias-group requirement without hand-parsing
 * the raw JSON Schema.
 */
export type SchemaCompositionConstraint = {
  kind: "anyOf";
  alternatives: readonly { parameters: readonly string[]; canonical?: string }[];
};

/**
 * Runtime contract for a single MCP tool. Returned inside the `tools`
 * array from `buildToolSchemaCatalog` / `dysflow.schema`.
 */
export type ToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, ToolParameterSchema>;
  returns: {
    type: "object";
    schema: Record<string, unknown>;
  };
  errorCodes: ToolErrorCodeSchema[];
  crossReferences: string[];
  requiredCapabilities: string[];
  safeByDefault: boolean;
  /**
   * Issue #1057 (F6) — when to reach for this tool. Human-readable
   * workflow hints so consumers discover capabilities from the runtime
   * instead of out-of-band skill docs. Empty when no curated entry
   * exists yet.
   */
  useCases: string[];
  /**
   * Issue #1074 — declarative alias-group requirements lifted from the
   * schema's `anyOf` clause. Empty when the tool does not declare
   * `anyOf`. The catalog surfaces these so a consumer can pick the
   * canonical parameter without reading the raw JSON Schema.
   */
  compositionConstraints: SchemaCompositionConstraint[];
};

/**
 * Top-level catalog shape. The `projectId` field echoes the input so a
 * consumer can branch on its presence without remembering which
 * overload they called.
 */
export type ToolSchemaCatalog = {
  projectId: string | null;
  tools: ToolSchema[];
};

/**
 * Canonical JSON Schema fragment for the `McpToolResult` envelope every
 * dysflow tool returns. Surfaced verbatim under `ToolSchema.returns` so
 * a consumer does not need to learn the envelope separately.
 */
const MCP_TOOL_RESULT_JSON_SCHEMA = {
  type: "object",
  required: ["content", "isError"],
  properties: {
    content: { type: "array", items: { type: "object" } },
    isError: { type: "boolean" },
    ok: { type: "boolean" },
    error: { type: "object" },
  },
} as const;

// ─── Per-tool metadata tables ─────────────────────────────────────────────────

/**
 * Cross-reference issue numbers per tool. Sourced from the JSDoc
 * citations on `MCP_TOOL_ROUTES` (the dispatch route table is the
 * canonical source for tool-level issue lineage). Defaulted to an empty
 * list so the consumer always sees the field.
 */
const TOOL_CROSS_REFERENCES: Record<string, readonly string[]> = {
  export_modules: ["#757", "#785", "#962", "#802"],
  export_all: ["#757", "#785", "#619", "#802"],
  import_modules: ["#757", "#958", "#962"],
  import_all: ["#757", "#958", "#962"],
  list_objects: ["#405"],
  list_vba_modules: ["#807"],
  exists: [],
  test_vba: ["#621", "#746"],
  verify_code: ["#701", "#959"],
  delete_module: ["#619"],
  generate_erd: [],
  fix_encoding: ["#958"],
  validate_form_spec: ["#616"],
  generate_form: ["#616"],
  catalog_add_control: [],
  harvest_form_catalog: [],
  inspect_form: ["#795"],
  compare_form: ["#795"],
  lint_form_code: ["#795"],
  form_add_control: ["#795"],
  form_move_control: ["#795"],
  form_rename_control: ["#795"],
  form_serialize: ["#616"],
  form_deserialize: ["#616"],
  create_form_from_template: ["#618"],
  analyze_form_ui: ["#795"],
  map_form_behavior: ["#795", "#830"],
  generate_form_design_plan: ["#795"],
  apply_form_design_plan: ["#795", "#813"],
  copy_form_ui_pattern: ["#795"],
  verify_form_ui: ["#795"],
  form_set_property: ["#813"],
  form_delete_control: ["#813"],
  form_set_properties: ["#872"],
  form_duplicate_control: ["#872"],
  form_get_geometry: ["#872"],
  form_list_controls: ["#872"],
  form_align_controls: ["#816"],
  form_distribute_controls: ["#816"],
  render_form_preview: ["#814"],
  analyze_form_layout: ["#815"],
  diff_form_preview: ["#817"],
  verify_form_bindings: ["#818"],
  sync_binary: ["#809"],
  vba_orphan_audit: [],
  vba_inline_execution: ["#746"],
  query_execute: ["#746", "#962"],
  doctor: [],
  access_force_cleanup_orphaned: ["#777"],
  get_capabilities: ["#656", "#779", "#940", "#962"],
  list_procedures: ["#701"],
  get_procedure: ["#701"],
  find_references: ["#701"],
  detect_dead_code: ["#705"],
  validate_manifest: ["#703"],
  lint_module: ["#704", "#789"],
  resolve_project: ["#963", "#962"],
  schema: ["#971"],
  // Issue #1057 (F5) — on-demand single-tool introspection. Sibling of
  // `schema` (full catalog): `describe_tool` returns one entry with
  // params + description + useCases so a consumer stops probing param
  // names by trial and error.
  describe_tool: ["#1057"],
  // #965 — `diagnose` collapses the 4-5 round-trip pattern into one
  // read-only call. Sibling of `schema` (static contract) and
  // `resolve_project` (config resolution) — pairs with them under the
  // Round-12 #965 umbrella.
  diagnose: ["#965"],
  state: ["#978"],
  // Issue #973 — AI-aware log access. Pure read-only structured view
  // of `.dysflow/runtime/`. Pairs with `get_capabilities` (live state)
  // and `schema` (static contract catalog).
  logs: ["#973"],
  list_access_operations: ["#777"],
  cleanup_access_operation: ["#659", "#777"],
  run_vba: ["#621", "#659"],
  query_sql: [],
  exec_sql: ["#746"],
  run_script: ["#746"],
  create_table: ["#746"],
  drop_table: ["#746"],
  seed_fixture: [],
  teardown_fixture: [],
  list_links: [],
  export_queries: [],
  link_tables: [],
  relink_tables: [],
  localize_backend_links: [],
  unlink_table: [],
  import_queries: [],
  compact_repair: [],
  relink_directory: [],
  list_tables: [],
  list_linked_tables: [],
  get_schema: [],
  count_rows: [],
  distinct_values: [],
  compare_backends: [],
  list_access_files: [],
  get_relationships: [],
};

/**
 * Issue #1057 (F6) — curated "use this tool when..." hints. Sourced from
 * the Round-15 consumer session: these are the tools the consumer only
 * discovered after manual grep/codegraph work that a single documented
 * hint would have avoided. Tools without an entry surface an empty list.
 */
const TOOL_USE_CASES: Record<string, readonly string[]> = {
  vba_orphan_audit: [
    "Find test procedures registered in the binary but missing from the source tree (orphaned tests).",
    "Audit source ↔ binary module parity before a cleanup batch.",
  ],
  detect_dead_code: [
    "Find procedures never referenced from any module before deleting them.",
    "Reduce a legacy module surface prior to a migration.",
  ],
  compare_backends: [
    "Diff schema/data between two backend .accdb files (e.g. production vs sandbox).",
    "Verify a sandbox refresh actually mirrors production structure.",
  ],
  access_force_cleanup_orphaned: [
    "List orphaned MSACCESS.EXE candidates (confirmPid omitted) after a timeout.",
    "Kill ONE verified orphan by passing its confirmPid — never kill by process name.",
  ],
  validate_manifest: [
    "Pre-flight a tests.vba.json manifest before test_vba — reports PROCEDURE_NOT_FOUND per entry.",
  ],
  verify_code: [
    "Detect source ↔ binary drift and plan a sync from bulkImportable / bulkExportable.",
  ],
  delete_module: ["Remove a VBA module from the binary (plan first with apply:false)."],
  describe_tool: ["Introspect one tool's params, defaults, and error codes before calling it."],
  schema: ["Fetch the full static contract catalog for every advertised tool."],
};

// ─── Input-schema registry (modern tools) ─────────────────────────────────────

// Schema for the `schema` MCP tool. Declared above the modern tool registry
// (issue #1072) so the registry can include it by reference without a
// module-init TDZ. The factory below uses the same constant — both the
// MCP advertisement and the `schema`/`describe_tool` catalog agree by
// construction.
export const SCHEMA_TOOL_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Optional projectId. Reserved for a future per-project scoping extension (#966 follow-up). The current catalog is global.",
    },
    toolName: {
      type: "string",
      description:
        "Optional tool name to filter the catalog to a single entry. Omit for the full catalog.",
    },
  },
} as const;

// Schema for the `describe_tool` MCP tool (issue #1057 F5). Single-tool
// sibling of `schema`. Hoisted above the modern tool registry for the same
// reason as `SCHEMA_TOOL_INPUT_SCHEMA` (issue #1072 — eliminate the
// `describe_tool` TDZ branch in `inputSchemaForTool`).
export const DESCRIBE_TOOL_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
      description: "Tool name to describe (canonical param).",
    },
    toolName: {
      type: "string",
      description: "Alias of `name` for symmetry with the `schema` tool's filter param.",
    },
    projectId: {
      type: "string",
      description:
        "Optional projectId. Reserved for a future per-project scoping extension. The current catalog is global.",
    },
  },
  // Issue #1074 — declarative alias-group requirement. The handler
  // historically rejected missing name/toolName with MCP_INPUT_INVALID;
  // the constraint now lives in the schema so the validator and the
  // `schema` catalog can surface it without re-parsing the handler.
  // `name` is canonical — when both are supplied, the handler prefers
  // `name` (see the resolver below).
  anyOf: [{ required: ["name"] }, { required: ["toolName"] }],
} as const;

/**
 * Per-modern-tool input schemas. Modern tools do not live in
 * `MCP_TOOL_SCHEMAS` (that registry is dispatch-only) so they are looked
 * up here by name. Missing entry → `NO_INPUT_SCHEMA` (no parameters).
 *
 * Issue #1072 — every modern tool advertised through `createDysflowMcpTools`
 * MUST have an entry here pointing at the SAME JSON Schema the factory
 * exposes via `tool.inputSchema`. The factory and the catalog become two
 * readers of the same authoritative source so they cannot drift.
 */
const MODERN_TOOL_INPUT_SCHEMAS: Record<string, JsonObjectSchema> = {
  query_execute: QUERY_EXECUTE_SCHEMA,
  doctor: DOCTOR_SCHEMA,
  access_force_cleanup_orphaned: ORPHAN_CLEANUP_SCHEMA,
  get_capabilities: NO_INPUT_SCHEMA,
  list_procedures: LIST_PROCEDURES_SCHEMA,
  get_procedure: GET_PROCEDURE_SCHEMA,
  find_references: FIND_REFERENCES_SCHEMA,
  detect_dead_code: DETECT_DEAD_CODE_SCHEMA,
  validate_manifest: VALIDATE_MANIFEST_SCHEMA,
  lint_module: LINT_MODULE_SCHEMA,
  resolve_project: RESOLVE_PROJECT_SCHEMA,
  // Issue #1072 — every modern tool advertised through createDysflowMcpTools
  // gets a real entry here. Previously these four fell through to
  // NO_INPUT_SCHEMA and the catalog reported `parameters: {}` for tools
  // that actually accept real parameters.
  schema: SCHEMA_TOOL_INPUT_SCHEMA,
  describe_tool: DESCRIBE_TOOL_INPUT_SCHEMA,
  diagnose: DIAGNOSE_INPUT_SCHEMA,
  state: STATE_TOOL_SCHEMA,
  clean_stale_markers: CLEAN_STALE_MARKERS_SCHEMA,
  logs: LOGS_TOOL_SCHEMA,
};

/**
 * Per-alias-tool input schemas. Aliases either reuse a dispatch schema
 * (`query_sql` → same as `query_execute` minus `mode`) or ship a
 * bespoke one. The dispatch-alias pair (`list_access_operations`,
 * `cleanup_access_operation`) is wired here because
 * `MCP_TOOL_SCHEMAS` already carries the schema under the dispatch name.
 */
const ALIAS_INPUT_SCHEMA_OVERRIDES: Record<string, unknown> = {
  list_access_operations: NO_INPUT_SCHEMA,
};

// ─── Error-code registry ──────────────────────────────────────────────────────

const WRITE_GATE_ERROR_CODES: ToolErrorCodeSchema[] = [
  {
    code: DESTINATION_ROOT_NOT_FOUND,
    description:
      "Project destinationRoot is missing or unconfigured. Configure it in .dysflow/project.json or pass destinationRoot explicitly.",
    recoverable: true,
  },
  {
    code: OUTSIDE_PROJECT_ROOT,
    description:
      "Operation target is outside the configured project root. Pass a path inside the project root.",
    recoverable: true,
  },
  {
    code: WRITE_LOCKED_BY_RUNNING_OP,
    description:
      "A concurrent dysflow operation holds the project's write lock. Wait for it to finish or call cleanup_access_operation with force.",
    recoverable: true,
  },
  {
    code: CAPABILITIES_DISALLOW_WRITE,
    description:
      "Project capabilities.allowWrites is false. Enable writes in .dysflow/project.json or restart the MCP with --enable-writes.",
    recoverable: true,
  },
  {
    code: PROJECT_ID_MISMATCH,
    description:
      "Caller-supplied projectId does not match the project's configured id. Drop the projectId or align it.",
    recoverable: true,
  },
  {
    code: MCP_WRITES_DISABLED,
    description:
      "Process-level writes are disabled. Either restart the MCP with --enable-writes or pass dryRun:true to preview.",
    recoverable: true,
  },
  {
    code: MCP_INPUT_INVALID_CODE,
    description:
      "Input does not satisfy the tool's schema. Read the tool's inputSchema for required fields and accepted flags.",
    recoverable: true,
  },
];

const READ_ONLY_ERROR_CODES: ToolErrorCodeSchema[] = [
  {
    code: MCP_INPUT_INVALID_CODE,
    description:
      "Input does not satisfy the tool's schema. Read the tool's inputSchema for required fields.",
    recoverable: true,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Coerce a JSON Schema property fragment into the narrow
 * `ToolParameterSchema` shape the contract exposes. The `type` literal
 * collapses JSON Schema's `string|number|integer|boolean|array|object|...`
 * to the documented six — "enum" is reported as `string` plus
 * `enumValues` so the consumer's branch stays uniform.
 */
function parameterFromJsonSchema(
  name: string,
  property:
    | { type?: string; enum?: unknown[]; description?: string; default?: unknown }
    | undefined,
  required: boolean,
): ToolParameterSchema {
  const jsonType = property?.type ?? "string";
  const isEnum = Array.isArray(property?.enum) && property.enum.length > 0;
  let narrowType: ToolParameterSchema["type"];
  switch (jsonType) {
    case "number":
    case "integer":
      narrowType = "number";
      break;
    case "boolean":
      narrowType = "boolean";
      break;
    case "object":
      narrowType = "object";
      break;
    case "array":
      narrowType = "array";
      break;
    case "enum":
      narrowType = "enum";
      break;
    default:
      narrowType = isEnum ? "enum" : "string";
      break;
  }
  const result: ToolParameterSchema = {
    type: narrowType,
    required,
    description: property?.description ?? "",
  };
  if (isEnum) {
    result.enumValues = (property?.enum ?? []).map((value) => String(value));
  }
  if (property?.default !== undefined) {
    result.default = property.default;
  }
  // Tiny accommodation for tool-specific naming (`dryRun`/`apply` live
  // under the inputSchema; the `name` argument documents them too).
  if (name.length === 0) {
    throw new Error("parameterFromJsonSchema: empty parameter name");
  }
  return result;
}

function aliasesFromComposition(
  toolName: string,
  schema: unknown,
): { canonical: string; aliases: string[] } | undefined {
  const canonical = TOOL_COMPOSITION_CANONICAL[toolName];
  if (canonical === undefined || typeof schema !== "object" || schema === null) return undefined;
  const anyOf = (schema as { anyOf?: unknown }).anyOf;
  if (!Array.isArray(anyOf)) return undefined;
  const aliases = anyOf.flatMap((alternative) => {
    if (typeof alternative !== "object" || alternative === null) return [];
    const required = (alternative as { required?: unknown }).required;
    if (!Array.isArray(required) || required.length !== 1 || typeof required[0] !== "string") {
      return [];
    }
    return [required[0]];
  });
  if (!aliases.includes(canonical)) return undefined;
  return { canonical, aliases: [...new Set(aliases)] };
}

function enrichParameterMetadata(
  toolName: string,
  schema: unknown,
  parameters: Record<string, ToolParameterSchema>,
): void {
  const aliasGroup = aliasesFromComposition(toolName, schema);
  if (aliasGroup !== undefined) {
    for (const alias of aliasGroup.aliases) {
      const parameter = parameters[alias];
      if (parameter === undefined) continue;
      parameter.canonicalName = aliasGroup.canonical;
      parameter.aliases = [...aliasGroup.aliases];
      parameter.precedence = alias === aliasGroup.canonical ? "canonical" : "deprecated";
      if (alias !== aliasGroup.canonical) {
        parameter.deprecated = true;
        parameter.deprecatedSince = "2.23.0";
      }
    }
  }

  for (const [name, parameter] of Object.entries(parameters)) {
    if (/password|secret|token/i.test(name)) parameter.sensitive = true;
  }

  const writeFlags = ["apply", "dryRun", "diff"].filter((name) => parameters[name] !== undefined);
  if (writeFlags.length < 2) return;
  const metadata = commitFlagMetadataForOrNoop(toolName);
  const legacyAliases = new Set(legacyAliasesFor(toolName));
  for (const flag of writeFlags) {
    const parameter = parameters[flag];
    if (parameter === undefined) continue;
    parameter.conflictsWith = writeFlags.filter((candidate) => candidate !== flag);
    if (flag === metadata.commitFlag) {
      parameter.precedence = "canonical";
      continue;
    }
    parameter.precedence = legacyAliases.has(flag) ? "deprecated" : "alias";
    if (legacyAliases.has(flag)) {
      parameter.deprecated = true;
      parameter.deprecatedSince = "2.23.0";
      parameter.canonicalName = metadata.commitFlag;
      parameter.aliases = [...writeFlags];
    }
  }
}

function parametersFromInputSchema(
  toolName: string,
  schema: unknown,
): Record<string, ToolParameterSchema> {
  const out: Record<string, ToolParameterSchema> = {};
  if (typeof schema !== "object" || schema === null) return out;
  const root = schema as {
    properties?: Record<string, unknown>;
    required?: readonly string[];
  };
  const properties = root.properties ?? {};
  const requiredSet = new Set<string>(root.required ?? []);
  for (const [name, raw] of Object.entries(properties)) {
    out[name] = parameterFromJsonSchema(
      name,
      raw as { type?: string; enum?: unknown[]; description?: string; default?: unknown },
      requiredSet.has(name),
    );
  }
  enrichParameterMetadata(toolName, schema, out);
  return out;
}

/**
 * Issue #1074 — lift the `anyOf` composition constraints from the raw
 * input schema into a typed catalog surface. Only `required` is
 * consulted today (the validator only enforces `required`); the rest of
 * the partial schema (`properties`, `additionalProperties`, …) is
 * reserved for future constraint kinds without breaking the catalog
 * shape.
 */
function compositionConstraintsFromSchema(schema: unknown): SchemaCompositionConstraint[] {
  if (typeof schema !== "object" || schema === null) return [];
  const root = schema as { anyOf?: unknown };
  if (!Array.isArray(root.anyOf)) return [];
  const alternatives: { parameters: readonly string[]; canonical?: string }[] = [];
  for (const alt of root.anyOf) {
    if (typeof alt !== "object" || alt === null) continue;
    const altObj = alt as { required?: unknown };
    if (!Array.isArray(altObj.required)) continue;
    const params = altObj.required.filter(
      (key): key is string => typeof key === "string" && key.length > 0,
    );
    if (params.length === 0) continue;
    alternatives.push({ parameters: params });
  }
  if (alternatives.length === 0) return [];
  return [{ kind: "anyOf", alternatives }];
}

function isWriteClassAccess(access: McpToolAccess): boolean {
  return access === "read-write" || access === "conditional-write";
}

function errorCodesForTool(_name: string, access: McpToolAccess): ToolErrorCodeSchema[] {
  if (!isWriteClassAccess(access)) {
    return READ_ONLY_ERROR_CODES.map((entry) => ({ ...entry }));
  }
  // Write-class tools carry the full gate envelope plus MCP_INPUT_INVALID.
  return WRITE_GATE_ERROR_CODES.map((entry) => ({ ...entry }));
}

function requiredCapabilitiesForTool(access: McpToolAccess): string[] {
  if (isWriteClassAccess(access)) return ["allowWrites"];
  return [];
}

function safeByDefaultForTool(name: string, access: McpToolAccess): boolean {
  if (!isWriteClassAccess(access)) return true;
  const contract = MCP_TOOL_CONTRACTS[name as keyof typeof MCP_TOOL_CONTRACTS];
  if (contract === undefined) return true;
  // Every write-class contract defaults to `dryRunDefault: true` (see
  // `contractFromGeneratedRoute`); read-only contracts don't carry the
  // flag but are inherently safe.
  return contract.dryRunDefault !== false;
}

function inputSchemaForTool(name: string): unknown {
  // Modern tools live in MODERN_TOOL_INPUT_SCHEMAS (dispatch registry
  // doesn't carry them); everything else falls through to
  // MCP_TOOL_SCHEMAS. Issue #1072 — every modern tool advertised via
  // `createDysflowMcpTools` is registered above, so the lookup is total
  // and the explicit `describe_tool` TDZ branch is no longer needed.
  const modern = MODERN_TOOL_INPUT_SCHEMAS[name];
  if (modern !== undefined) return modern;
  const alias = ALIAS_INPUT_SCHEMA_OVERRIDES[name];
  if (alias !== undefined) return alias;
  const dispatch = (MCP_TOOL_SCHEMAS as Record<string, unknown>)[name];
  if (dispatch !== undefined) return dispatch;
  return NO_INPUT_SCHEMA;
}

function descriptionForTool(name: string): string {
  const contract = MCP_TOOL_CONTRACTS[name as keyof typeof MCP_TOOL_CONTRACTS];
  if (contract !== undefined) return contract.summary;
  return "No contract metadata registered.";
}

// ─── Tool registry assembly ──────────────────────────────────────────────────

/**
 * The full set of advertised MCP tool names. Built by merging the three
 * authoritative registries (`MCP_TOOL_CONTRACTS` covers modern + alias +
 * dispatch + `schema` once registered) plus `DYSFLOW_MCP_TOOL_NAMES`
 * (covers every name in the dispatch-route table). Duplicates collapse
 * to one; ordering is irrelevant for the consumer surface.
 */
function advertisedToolNames(): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const pushUnique = (name: string): void => {
    if (seen.has(name)) return;
    seen.add(name);
    ordered.push(name);
  };
  for (const name of Object.keys(MCP_TOOL_CONTRACTS)) pushUnique(name);
  for (const name of DYSFLOW_MCP_TOOL_NAMES) pushUnique(name);
  // Belt-and-suspenders: when this module loads before the modernContracts
  // entry for `schema` lands in `MCP_TOOL_CONTRACTS`, the catalog still
  // surfaces itself.
  pushUnique("schema");
  return ordered;
}

function buildSchemaForTool(name: string): ToolSchema {
  const contract = MCP_TOOL_CONTRACTS[name as keyof typeof MCP_TOOL_CONTRACTS];
  const access: McpToolAccess = contract?.access ?? "read-only";
  const inputSchema = inputSchemaForTool(name);
  const crossReferences = [...(TOOL_CROSS_REFERENCES[name] ?? [])];
  return {
    name,
    description: descriptionForTool(name),
    parameters: parametersFromInputSchema(name, inputSchema),
    returns: {
      type: "object",
      schema: { ...MCP_TOOL_RESULT_JSON_SCHEMA },
    },
    errorCodes: errorCodesForTool(name, access),
    crossReferences,
    requiredCapabilities: requiredCapabilitiesForTool(access),
    safeByDefault: safeByDefaultForTool(name, access),
    useCases: [...(TOOL_USE_CASES[name] ?? [])],
    compositionConstraints: markCanonicalAlternatives(
      name,
      compositionConstraintsFromSchema(inputSchema),
    ),
  };
}

/**
 * Issue #1074 — annotate every `anyOf` alternative with its `canonical`
 * flag using the per-tool `TOOL_COMPOSITION_CANONICAL` registry. The
 * registry is the SINGLE place the catalog declares "this is the
 * preferred parameter when callers pass both" — handlers may continue
 * to resolve the alias but the catalog surface stays the source of
 * truth for AI consumers.
 */
function markCanonicalAlternatives(
  toolName: string,
  constraints: SchemaCompositionConstraint[],
): SchemaCompositionConstraint[] {
  const canonicalByAlt = TOOL_COMPOSITION_CANONICAL[toolName];
  if (canonicalByAlt === undefined) return constraints;
  return constraints.map((constraint) => {
    if (constraint.kind !== "anyOf") return constraint;
    return {
      kind: "anyOf" as const,
      alternatives: constraint.alternatives.map((alt) => {
        const isCanonical = alt.parameters.length === 1 && alt.parameters[0] === canonicalByAlt;
        return isCanonical ? { ...alt, canonical: canonicalByAlt } : alt;
      }),
    };
  });
}

/**
 * Issue #1074 — the canonical parameter per tool that declares an
 * alias-group `anyOf`. Sourced from the handler's documented
 * "preferred when both are supplied" behavior; see the corresponding
 * adapter for the runtime resolver.
 */
const TOOL_COMPOSITION_CANONICAL: Record<string, string> = {
  describe_tool: "name",
  analyze_form_ui: "sourcePath",
  unlink_table: "tableName",
  validate_manifest: "testsPath",
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the runtime contract catalog for one tool (when `toolName` is
 * supplied) or every advertised tool in the consumer's dysflow
 * installation. The result is sorted by tool name for deterministic
 * cross-process comparison; `toolName` filtering returns the matching
 * entry in the same shape or an empty list when nothing matches.
 *
 * Pure function — never touches Access, never spawns PowerShell, never
 * mutates state. Safe to call from read-only MCP contexts.
 */
export function buildToolSchemaCatalog(input: SchemaInput): ToolSchemaCatalog {
  const filter = input.toolName?.trim();
  const advertised = advertisedToolNames();
  const selected =
    filter === undefined || filter.length === 0
      ? advertised
      : advertised.filter((name) => name === filter);
  const sorted = [...selected].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    projectId: input.projectId ?? null,
    tools: sorted.map(buildSchemaForTool),
  };
}

// ─── MCP tool factory ─────────────────────────────────────────────────────────

/**
 * Factory for the `schema` MCP tool. Pure: `cwd` is unused today but
 * reserved for the per-project scoping extension. The handler never
 * opens Access, never spawns PowerShell, and never mutates state.
 *
 * Issues #971 — runtime contract discovery. Pairs with `get_capabilities`
 * (which reports live state) and `diagnose` (which surfaces diagnostic
 * verdicts): `schema` reports the static contract every other tool
 * advertises.
 */
export function createSchemaTool(): DysflowMcpTool {
  return {
    name: "schema",
    description:
      "Return the runtime contract for every tool in the consumer's dysflow installation: parameters (typed + required + description + enumValues + default), returns (JSON Schema fragment), errorCodes (with recoverable flag), crossReferences (issue numbers), requiredCapabilities, safeByDefault. Read-only — never opens Access, never spawns PowerShell, never mutates state. Pass { toolName: '<name>' } to filter to a single tool. " +
      MCP_TOOL_CONTRACTS.schema.summary,
    inputSchema: SCHEMA_TOOL_INPUT_SCHEMA,
    handler: async (input): Promise<McpToolResult> => {
      const params =
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      const projectId =
        typeof params.projectId === "string" && params.projectId.length > 0
          ? params.projectId
          : undefined;
      const toolName =
        typeof params.toolName === "string" && params.toolName.length > 0
          ? params.toolName
          : undefined;
      const catalog = buildToolSchemaCatalog({ projectId, toolName });
      const content: McpTextContent[] = [{ type: "text", text: JSON.stringify(catalog) }];
      return { content, isError: false, ok: true };
    },
  };
}

/**
 * Factory for the `describe_tool` MCP tool (#1057 F5). Returns ONE
 * tool's full contract — description, params (typed + required +
 * description), returns, errorCodes, crossReferences, useCases — so a
 * consumer introspects a single tool without fetching the whole
 * `schema` catalog. Pure read-class: never opens Access, never spawns
 * PowerShell, never mutates state.
 */
export function createDescribeToolTool(): DysflowMcpTool {
  return {
    name: "describe_tool",
    description:
      "Describe ONE MCP tool on demand: description, params (typed + required + description + enumValues + default), returns, errorCodes, crossReferences, useCases (when to reach for it). Pass { name: '<tool>' } (alias: toolName). Read-only — never opens Access, never spawns PowerShell, never mutates state. Use the `schema` tool for the full catalog. " +
      MCP_TOOL_CONTRACTS.describe_tool.summary,
    inputSchema: DESCRIBE_TOOL_INPUT_SCHEMA as unknown as DysflowMcpTool["inputSchema"],
    handler: async (input): Promise<McpToolResult> => {
      const params =
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      const rawName =
        typeof params.name === "string" && params.name.trim().length > 0
          ? params.name.trim()
          : typeof params.toolName === "string" && params.toolName.trim().length > 0
            ? params.toolName.trim()
            : undefined;
      if (rawName === undefined) {
        const message =
          "name is required. Pass { name: '<tool>' } (alias: toolName) — e.g. { name: 'delete_module' }.";
        return {
          content: [{ type: "text", text: `MCP_INPUT_INVALID: ${message}` }],
          isError: true,
          ok: false,
          error: { code: "MCP_INPUT_INVALID", message },
        };
      }
      const catalog = buildToolSchemaCatalog({ toolName: rawName });
      const entry = catalog.tools[0];
      if (entry === undefined) {
        const message = `Tool '${rawName}' not found. Call the 'schema' tool (no filter) to list every advertised tool name.`;
        return {
          content: [{ type: "text", text: `TOOL_NOT_FOUND: ${message}` }],
          isError: true,
          ok: false,
          error: { code: "TOOL_NOT_FOUND", message },
        };
      }
      // `params` mirrors `parameters` for consumers following the issue's
      // sketch (`describe_tool(...).params`); `parameters` stays the
      // catalog-consistent field name.
      const payload = {
        ...entry,
        description: `${entry.name}: ${entry.description}`,
        params: entry.parameters,
      };
      const content: McpTextContent[] = [{ type: "text", text: JSON.stringify(payload) }];
      return { content, isError: false, ok: true };
    },
  };
}

// Re-export the route table so a follow-up issue (#966) can surface
// the per-tool mutatesBinary / mutatesFilesystem / risk metadata
// without re-importing dispatch-routes from the adapter layer.
export { ALIAS_TOOL_NAMES, MCP_TOOL_ROUTES };
