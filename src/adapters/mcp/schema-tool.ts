import {
  describeToolResultContract,
  schemaResultContract,
} from "./contracts/bootstrap-result-contracts.js";
import { toToolResultContract } from "./contracts/result-contract.js";
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
  type CommitFlagName,
  commitFlagMetadataForOrNoop,
  type DefaultBehavior,
  legacyAliasesFor,
  type NoWriteAliasName,
} from "../../core/runtime/commit-flag-registry.js";
import {
  PROJECT_IDENTITY_BLOCK,
  supportsSharedOutputMode,
} from "../../shared/validation/schema-blocks.js";
import {
  AGENT_WORKFLOW_PHASES,
  type AgentWorkflowMetadata,
  type AgentWorkflowPhase,
  type AgentWorkflowStatus,
  buildAgentWorkflowMetadata,
  buildToolAdvertisementMetadata,
  isAdvertisedUnderSurface,
  type ToolAdvertisementMetadata,
  type ToolSurface,
} from "./agent-workflow-registry.js";
import { ALIAS_TOOL_NAMES } from "./alias-tools.js";
import { BOOTSTRAP_INPUT_SCHEMA } from "./bootstrap-schema.js";
import { CAPABILITIES_INPUT_SCHEMA } from "./capabilities-discovery.js";
import { executableResultContractForTool } from "./contracts/executable-result-contract-registry.js";
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
import { MIGRATE_PROJECT_CONFIG_SCHEMA } from "./migrate-project-config-tool.js";
import { withPreferredToolControlSchema } from "./preferred-tool-warning.js";
import { PROJECT_RECOVERY_SCHEMA_BLOCK } from "./project-resolution-recovery.js";
import { RESOLVE_PROJECT_SCHEMA } from "./resolve-project-tool.js";
import {
  type DysflowMcpTool,
  type McpTextContent,
  type McpToolResult,
  withSchemaVersion,
} from "./result-translation.js";
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
import { SETUP_PROJECT_SCHEMA } from "./schemas/setup-project-schema.js";
import type { JsonObjectSchema } from "./schemas.js";
import { STATE_TOOL_SCHEMA } from "./state-tool.js";
import { CLEAR_WORKTREE_CACHE_SCHEMA, REGISTER_WORKTREE_SCHEMA } from "./worktree-cache-schemas.js";
import { withWorktreeCwdSchema } from "./worktree-cwd.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Stable parameter surface for the `schema` tool. Mirrors the request body
 * consumers send to `dysflow.schema`. `projectId` is reserved for a
 * future per-project scoping extension (#966 follow-up); the current
 * implementation returns the global catalog regardless of the supplied
 * `projectId`.
 */
export type SchemaView = "compact" | "full" | "index";

export type SchemaInput = {
  projectId?: string;
  toolName?: string;
  view?: SchemaView;
  phase?: AgentWorkflowPhase;
  status?: AgentWorkflowStatus;
  /** Issue #1492 — surfaces advertised state in the index view. */
  toolSurface?: ToolSurface;
};

export const DESCRIBE_TOOL_SECTIONS = [
  "summary",
  "parameters",
  "returns",
  "errors",
  "references",
  "workflow",
  "resultContract",
] as const;
export type DescribeToolSection = (typeof DESCRIBE_TOOL_SECTIONS)[number];

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
  /** Exact literal required by a JSON Schema `const`. */
  expectedValue?: unknown;
  default?: unknown;
  canonicalName?: string;
  aliases?: string[];
  deprecated?: boolean;
  deprecatedSince?: string;
  conflictsWith?: string[];
  precedence?: "canonical" | "alias" | "deprecated";
  sensitive?: boolean;
  compositionConstraints?: {
    requiredWith?: string[];
  };
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

// ─── Result-contract surface (#1077) ───────────────────────────────────────────

export type {
  ToolDataSchemaFragment,
  ToolErrorEnvelopeShape,
  ToolFieldShape,
  ToolOutputMode,
  ToolResultContract,
  ToolResultMode,
} from "./contracts/result-contract-types.js";

import type {
  ToolOutputMode,
  ToolResultContract,
  ToolResultMode,
} from "./contracts/result-contract-types.js";

/**
 * Runtime contract for a single MCP tool. Returned inside the `tools`
 * array from `buildToolSchemaCatalog` / `dysflow.schema`.
 */
export type ToolSchema = ToolAdvertisementMetadata & {
  name: string;
  description: string;
  access: McpToolAccess;
  inputSchema: JsonObjectSchema;
  parameters: Record<string, ToolParameterSchema>;
  returns: {
    type: "object";
    schema: Record<string, unknown>;
  };
  errorCodes: ToolErrorCodeSchema[];
  crossReferences: string[];
  requiredCapabilities: string[];
  safeByDefault: boolean;
  agentWorkflow: AgentWorkflowMetadata;
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
  /**
   * Issue #1077 — tool-specific result contract. Either a typed
   * `dataSchema` (plan/apply variants, output modes, error envelope
   * shape) or an `envelope-only` justification. Every advertised tool
   * carries one — the RED test in
   * `test/adapters/mcp/tool-result-contracts.test.ts` pins the
   * invariant.
   */
  resultContract: ToolResultContract;
};

export type CompactToolWriteIntent = {
  canonicalCommitFlag: CommitFlagName;
  noWriteAlias: NoWriteAliasName;
  defaultBehavior: DefaultBehavior;
  legacyAliases: string[];
};

export type CompactToolPrimaryResult = {
  kind: ToolResultContract["kind"];
  summary: string;
  fields: string[];
  requiredFields: string[];
  modes: ToolResultMode[];
  outputModes: ToolOutputMode[];
};

export type CompactToolSchema = ToolAdvertisementMetadata & {
  name: string;
  purpose: string;
  access: McpToolAccess;
  agentWorkflow: AgentWorkflowMetadata;
  requiredParameters: string[];
  requiredParameterGroups: readonly (readonly string[])[];
  defaults: Record<string, unknown>;
  writeIntent: CompactToolWriteIntent | null;
  primaryResult: CompactToolPrimaryResult;
  recommendations: {
    deepView: "describe_tool";
    useCases: string[];
  };
};

export type CompactToolSchemaCatalog = {
  projectId: string | null;
  tools: CompactToolSchema[];
};

/** Routing-only catalog entry for progressive bootstrap discovery. */
export type SchemaIndexTool = {
  name: string;
  purpose: string;
  access: McpToolAccess;
  phases: AgentWorkflowPhase[];
  status: AgentWorkflowStatus;
  preferredFor: string[];
  annotations: ToolAdvertisementMetadata["annotations"];
  /** Issue #1492 — true if the tool is currently advertised via `tools/list`. */
  advertised: boolean;
};

export type SchemaIndexCatalog = {
  projectId: string | null;
  tools: SchemaIndexTool[];
};

export type ToolSchemaCatalogView =
  | ToolSchemaCatalog
  | CompactToolSchemaCatalog
  | SchemaIndexCatalog;

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
  test_vba: ["#621", "#746", "#1556"],
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
    // Issue #1076 — compose the shared ProjectIdentity block so the
    // consumer-facing description matches every other tool that uses
    // this atom.
    ...PROJECT_IDENTITY_BLOCK,
    toolName: {
      type: "string",
      description:
        "Optional tool name to filter the catalog to a single entry. Omit for every advertised tool.",
    },
    phase: {
      type: "string",
      enum: [...AGENT_WORKFLOW_PHASES],
      description: "Optional routing filter for compact or index discovery views.",
    },
    status: {
      type: "string",
      enum: ["preferred", "specialized", "legacy"],
      description: "Optional workflow-status filter for compact or index discovery views.",
    },
    view: {
      type: "string",
      enum: ["index", "compact", "full"],
      description:
        "Required. Choose index for routing-only discovery, compact for low-context discovery, or full for complete JSON Schema (deliberate opt-in).",
      runtimeRequired: true,
      omissionErrorCode: "SCHEMA_VIEW_REQUIRED",
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
    // Issue #1076 — compose the shared ProjectIdentity block so the
    // consumer-facing description matches every other tool that uses
    // this atom.
    ...PROJECT_IDENTITY_BLOCK,
    sections: {
      type: "array",
      items: { type: "string", enum: [...DESCRIBE_TOOL_SECTIONS] },
      description:
        "Optional sections for a bounded deep view. Omit for the legacy full response; selected sections expose parameters once under `parameters` (without the compatibility `params` alias).",
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
  bootstrap: BOOTSTRAP_INPUT_SCHEMA,
  get_capabilities: CAPABILITIES_INPUT_SCHEMA,
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
  // Issue #1177 — `migrate_project_config` advertises its input schema
  // through the `schema` / `describe_tool` catalog so consumers can
  // introspect the read-only vs apply branching without re-reading the
  // factory.
  migrate_project_config: MIGRATE_PROJECT_CONFIG_SCHEMA,
  setup_project: SETUP_PROJECT_SCHEMA,
  register_worktree: REGISTER_WORKTREE_SCHEMA,
  clear_worktree_cache: CLEAR_WORKTREE_CACHE_SCHEMA,
};

/**
 * Per-alias-tool input schemas. Aliases either reuse a dispatch schema
 * (`query_sql` → same as `query_execute` minus `mode`) or ship a
 * bespoke one. The dispatch-alias pair (`list_access_operations`,
 * `cleanup_access_operation`) is wired here because
 * `MCP_TOOL_SCHEMAS` already carries the schema under the dispatch name.
 */
const ALIAS_INPUT_SCHEMA_OVERRIDES: Record<string, JsonObjectSchema> = {
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
    | { type?: string; enum?: unknown[]; const?: unknown; description?: string; default?: unknown }
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
  if (property?.const !== undefined) result.expectedValue = property.const;
  if (property?.default !== undefined) {
    result.default = property.default === "runtime-defined" ? null : property.default;
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

function defaultFromDescription(parameter: ToolParameterSchema): unknown {
  if (!/\bdefault(?:s|ed)?\b/i.test(parameter.description)) return undefined;
  const quoted = parameter.description.match(/[`'"]([^`'"]+)[`'"]\s*\(default\)/i)?.[1];
  const stated = parameter.description.match(
    /\bdefault(?:s|ed)?(?:\s+value)?(?:\s+is|\s+to)?\s+[`'"]?([^.;,`'"]+)/i,
  )?.[1];
  const raw = (quoted ?? stated)?.trim();
  if (raw === undefined || raw.length === 0) return undefined;
  if (parameter.type === "boolean") {
    if (/^true\b/i.test(raw)) return true;
    if (/^false\b/i.test(raw)) return false;
  }
  if (parameter.type === "number") {
    const numeric = raw.match(/^-?\d+(?:\.\d+)?/)?.[0];
    if (numeric !== undefined) return Number(numeric);
  }
  return raw;
}

function canonicalNameFromDescription(
  name: string,
  description: string,
  parameters: Record<string, ToolParameterSchema>,
): string | undefined {
  const explicit =
    description.match(/\balias\s+(?:of|for)\s+[`'"]([A-Za-z][A-Za-z0-9]*)[`'"]/i)?.[1] ??
    description.match(/\b[A-Za-z]+\s+alias\s+for\s+[`'"]([A-Za-z][A-Za-z0-9]*)[`'"]/i)?.[1];
  if (explicit !== undefined) return explicit;
  const candidates: Record<string, readonly string[]> = {
    path: ["sourcePath", "testsPath", "exportPath", "importPath", "directoryPath", "databasePath"],
    table: ["tableName"],
    query: ["sql"],
    column: ["columnName"],
    name: ["formName", "moduleName"],
    type: ["controlType"],
    fields: ["columns"],
    target: ["targetPath"],
    password: ["backendPassword", "passwordEnv"],
    backendPassword: ["passwordEnv"],
  };
  return candidates[name]?.find((candidate) => parameters[candidate] !== undefined);
}

function enrichProseMetadata(parameters: Record<string, ToolParameterSchema>): void {
  for (const [name, parameter] of Object.entries(parameters)) {
    if (parameter.default === undefined) {
      const inferredDefault = defaultFromDescription(parameter);
      if (inferredDefault !== undefined) {
        parameter.default = inferredDefault === "runtime-defined" ? null : inferredDefault;
      }
    } else if (parameter.default === "runtime-defined") {
      parameter.default = null;
    }
    if (!/\balias(?:es)?\b/i.test(parameter.description) || parameter.canonicalName !== undefined) {
      continue;
    }
    const candidate = canonicalNameFromDescription(name, parameter.description, parameters);
    if (candidate === undefined) continue;
    parameter.canonicalName = candidate;
    parameter.precedence = parameter.canonicalName === name ? "canonical" : "deprecated";
    if (parameter.canonicalName !== name) {
      parameter.deprecated = true;
      parameter.deprecatedSince = "2.23.0";
    } else {
      delete parameter.deprecated;
      delete parameter.deprecatedSince;
    }
  }

  const groups = new Map<string, Set<string>>();
  for (const [name, parameter] of Object.entries(parameters)) {
    if (parameter.canonicalName === undefined) continue;
    const group = groups.get(parameter.canonicalName) ?? new Set<string>();
    group.add(parameter.canonicalName);
    group.add(name);
    groups.set(parameter.canonicalName, group);
  }
  for (const [canonicalName, aliases] of groups) {
    const values = [...aliases];
    for (const alias of values) {
      const parameter = parameters[alias];
      if (parameter === undefined) continue;
      parameter.canonicalName = canonicalName;
      parameter.aliases = values;
      parameter.precedence ??= alias === canonicalName ? "canonical" : "deprecated";
    }
  }
}

const EXPLICIT_PARAMETER_ALIAS_MIGRATIONS: Readonly<
  Record<
    string,
    readonly {
      canonical: string;
      alias: string;
      deprecatedSince: string;
    }[]
  >
> = {
  compare_form: [
    {
      canonical: "targetPath",
      alias: "target",
      deprecatedSince: "2.27.0",
    },
  ],
  generate_form: [
    {
      canonical: "artifactKind",
      alias: "kind",
      deprecatedSince: "2.27.0",
    },
  ],
};

function applyExplicitAliasMigrations(
  toolName: string,
  parameters: Record<string, ToolParameterSchema>,
): void {
  for (const migration of EXPLICIT_PARAMETER_ALIAS_MIGRATIONS[toolName] ?? []) {
    const canonical = parameters[migration.canonical];
    const alias = parameters[migration.alias];
    if (canonical === undefined || alias === undefined) continue;

    const aliases = [migration.canonical, migration.alias];
    canonical.canonicalName = migration.canonical;
    canonical.aliases = aliases;
    canonical.precedence = "canonical";
    alias.canonicalName = migration.canonical;
    alias.aliases = aliases;
    alias.precedence = "deprecated";
    alias.deprecated = true;
    alias.deprecatedSince = migration.deprecatedSince;
  }
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

  const commitMetadata = commitFlagMetadataForOrNoop(toolName);
  const applyParameter = parameters.apply;
  if (applyParameter !== undefined && applyParameter.default === undefined) {
    applyParameter.default = commitMetadata.defaultBehavior === "writes";
  }
  const dryRunParameter = parameters.dryRun;
  if (dryRunParameter !== undefined && dryRunParameter.default === undefined) {
    dryRunParameter.default = commitMetadata.defaultBehavior !== "writes";
  }
  const diffParameter = parameters.diff;
  if (diffParameter !== undefined && diffParameter.default === undefined) {
    diffParameter.default = false;
  }

  enrichProseMetadata(parameters);
  applyExplicitAliasMigrations(toolName, parameters);

  for (const [name, parameter] of Object.entries(parameters)) {
    if (/password|secret|credential|apiKey|authToken/i.test(name) || /^token$/i.test(name)) {
      parameter.sensitive = true;
    } else {
      delete parameter.sensitive;
    }
  }

  const writeFlags = ["apply", "dryRun", "diff"].filter((name) => parameters[name] !== undefined);
  if (writeFlags.length < 2) return;
  for (const flag of writeFlags) {
    const parameter = parameters[flag];
    if (parameter === undefined) continue;
    parameter.conflictsWith = writeFlags.filter((candidate) => candidate !== flag);
    if (flag === commitMetadata.commitFlag) {
      parameter.precedence = "canonical";
      continue;
    }
    parameter.precedence = "deprecated";
    parameter.deprecated = true;
    parameter.deprecatedSince = "2.23.0";
    parameter.canonicalName = commitMetadata.commitFlag;
    parameter.aliases = [...writeFlags];
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
      raw as {
        type?: string;
        enum?: unknown[];
        description?: string;
        default?: unknown;
        requiredWith?: readonly string[];
      },
      requiredSet.has(name),
    );
    const requiredWith = (raw as { requiredWith?: readonly string[] }).requiredWith;
    if (requiredWith !== undefined && requiredWith.length > 0) {
      out[name].compositionConstraints = { requiredWith: [...requiredWith] };
    }
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

function errorCodesForTool(name: string, access: McpToolAccess): ToolErrorCodeSchema[] {
  const writeClass = isWriteClassAccess(access);
  const codes = !writeClass
    ? READ_ONLY_ERROR_CODES.map((entry) => ({ ...entry }))
    : WRITE_GATE_ERROR_CODES.map((entry) => ({ ...entry }));
  if (name === "query_execute") {
    codes.push({
      code: "INVALID_READ_ONLY_QUERY",
      description:
        'mode:"read" rejected SQL that can mutate the database. Retry with read-only SQL or explicitly select mode:"write".',
      recoverable: true,
    });
  }
  if (name === "setup_project") {
    codes.push(
      {
        code: "FROMCWD_NOT_FOUND",
        description:
          "fromCwd does not contain a readable .dysflow/project.json source configuration.",
        recoverable: true,
      },
      {
        code: "FROMCWD_CONFIG_INVALID",
        description: "The fromCwd project configuration is malformed or not write-ready.",
        recoverable: true,
      },
    );
  }
  if (name === "teardown_fixture") {
    codes.push(
      {
        code: "FIXTURE_TEARDOWN_UNBOUNDED",
        description:
          "The required bounded predicate was missing, so teardown stopped before Access mutation.",
        recoverable: true,
      },
      {
        code: "FIXTURE_TEARDOWN_PREDICATE_INVALID",
        description:
          "The teardown predicate column or inclusive integer range was invalid, so teardown stopped before Access mutation.",
        recoverable: true,
      },
    );
  }
  if (writeClass && name === "run_script") {
    codes.push({
      code: "SANDBOX_ONLY",
      description: "The explicit Access target is outside the active worktree sandbox.",
      recoverable: true,
    });
  }
  if (writeClass && name === "access_force_cleanup_orphaned") {
    codes.push({
      code: "CONFIRMATION_REQUIRED",
      description: "The operation requires explicit human confirmation before it can execute.",
      recoverable: true,
    });
  }
  return codes;
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

export function inputSchemaForTool(name: string): JsonObjectSchema {
  const contract = MCP_TOOL_CONTRACTS[name as keyof typeof MCP_TOOL_CONTRACTS];
  const withRecovery = (schema: JsonObjectSchema): JsonObjectSchema =>
    contract !== undefined && isWriteClassAccess(contract.access)
      ? {
          ...schema,
          properties: { ...(schema.properties ?? {}), ...PROJECT_RECOVERY_SCHEMA_BLOCK },
        }
      : schema;
  const modern = MODERN_TOOL_INPUT_SCHEMAS[name];
  if (modern !== undefined) return withWorktreeCwdSchema(name, withRecovery(modern));
  const alias = ALIAS_INPUT_SCHEMA_OVERRIDES[name];
  if (alias !== undefined) return withWorktreeCwdSchema(name, withRecovery(alias));
  const dispatch = (MCP_TOOL_SCHEMAS as Record<string, JsonObjectSchema>)[name];
  if (dispatch !== undefined) return withWorktreeCwdSchema(name, withRecovery(dispatch));
  return withWorktreeCwdSchema(name, withRecovery(NO_INPUT_SCHEMA));
}

function descriptionForTool(name: string): string {
  const contract = MCP_TOOL_CONTRACTS[name as keyof typeof MCP_TOOL_CONTRACTS];
  if (contract !== undefined) return contract.summary;
  return "No contract metadata registered.";
}

// ─── Executable result-contract projection (#1100) ───────────────────────────

/**
 * Issue #1077 — load-time guard. Every advertised tool must have a
 * `resultContract` entry — a missing one would mean the catalog falls
 * back to envelope-only with no justification, which is precisely the
 * silent failure mode the issue rejects. The assert runs once on module
 * load; if it ever fires the test suite catches it next run.
 */
function assertToolResultContractsAreTotal(): void {
  const advertised = advertisedToolNames();
  const missing = advertised.filter((name) => executableResultContractForTool(name) === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Advertised MCP tools missing executable result contracts: ${missing.join(", ")}.`,
    );
  }
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
  const inputSchema = withPreferredToolControlSchema(name, inputSchemaForTool(name));
  const crossReferences = [...(TOOL_CROSS_REFERENCES[name] ?? [])];
  const description = descriptionForTool(name);
  const agentWorkflow = buildAgentWorkflowMetadata(name);
  const advertisement = buildToolAdvertisementMetadata(name, access);
  const executableResultContract = executableResultContractForTool(name);
  if (executableResultContract === undefined) {
    throw new Error(`Advertised MCP tool '${name}' is missing an executable result contract.`);
  }
  const resultContract = toToolResultContract(executableResultContract);
  const advertisedResultContract =
    supportsSharedOutputMode(name) && resultContract.kind === "dataSchema"
      ? { ...resultContract, outputModes: ["summary", "file", "full"] as const }
      : resultContract;
  return {
    ...advertisement,
    name,
    description,
    access,
    inputSchema,
    parameters: parametersFromInputSchema(name, inputSchema),
    returns: {
      type: "object",
      schema: { ...MCP_TOOL_RESULT_JSON_SCHEMA },
    },
    errorCodes: errorCodesForTool(name, access),
    crossReferences,
    requiredCapabilities: requiredCapabilitiesForTool(access),
    safeByDefault: safeByDefaultForTool(name, access),
    agentWorkflow,
    useCases: [...agentWorkflow.preferFor],
    compositionConstraints: markCanonicalAlternatives(
      name,
      compositionConstraintsFromSchema(inputSchema),
    ),
    resultContract: advertisedResultContract,
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
  create_table: "tableName",
  drop_table: "tableName",
  seed_fixture: "tableName",
  teardown_fixture: "tableName",
  get_schema: "tableName",
  count_rows: "tableName",
  distinct_values: "tableName",
  unlink_table: "tableName",
  form_set_property: "propertyName",
  validate_manifest: "testsPath",
};

// ─── Public API ──────────────────────────────────────────────────────────────

function primaryResultForTool(tool: ToolSchema): CompactToolPrimaryResult {
  const contract = tool.resultContract;
  if (contract.kind === "envelope-only") {
    return {
      kind: contract.kind,
      summary: contract.justification,
      fields: [],
      requiredFields: [],
      modes: [],
      outputModes: [],
    };
  }

  const fragments = [contract.dataSchema, ...(contract.dataSchema.oneOf ?? [])];
  const fields = new Set<string>();
  const requiredFields = new Set<string>();
  for (const fragment of fragments) {
    for (const field of Object.keys(fragment.properties ?? {})) fields.add(field);
    for (const field of fragment.required ?? []) requiredFields.add(field);
  }

  return {
    kind: contract.kind,
    summary: contract.description ?? tool.description,
    fields: [...fields].sort(),
    requiredFields: [...requiredFields].sort(),
    modes: [...(contract.modes ?? [])],
    outputModes: [...(contract.outputModes ?? [])],
  };
}

function compactSchemaForTool(tool: ToolSchema): CompactToolSchema {
  const parameterEntries = Object.entries(tool.parameters);
  const defaults = Object.fromEntries(
    parameterEntries
      .filter(([, parameter]) => Object.hasOwn(parameter, "default"))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([name, parameter]) => [name, parameter.default]),
  );
  const primaryResult = primaryResultForTool(tool);
  const commitMetadata = commitFlagMetadataForOrNoop(tool.name);
  return {
    annotations: { ...tool.annotations },
    _meta: {
      ...tool._meta,
      "dysflow/workflow": {
        ...tool._meta["dysflow/workflow"],
        phases: [...tool._meta["dysflow/workflow"].phases],
        preferredFor: [...tool._meta["dysflow/workflow"].preferredFor],
      },
    },
    name: tool.name,
    purpose: tool.useCases[0] ?? primaryResult.summary,
    access: tool.access,
    agentWorkflow: {
      ...tool.agentWorkflow,
      preferFor: [...tool.agentWorkflow.preferFor],
    },
    requiredParameters: parameterEntries
      .filter(([, parameter]) => parameter.required)
      .map(([name]) => name)
      .sort(),
    requiredParameterGroups:
      tool.compositionConstraints.length > 0
        ? tool.compositionConstraints.flatMap((group) =>
            group.alternatives.map((alt) => [...alt.parameters]),
          )
        : (tool.inputSchema.anyOf ?? []).map((alternative) => [...(alternative.required ?? [])]),
    defaults,
    writeIntent:
      tool.access === "read-only"
        ? null
        : {
            canonicalCommitFlag: commitMetadata.commitFlag,
            noWriteAlias: commitMetadata.noWriteAlias,
            defaultBehavior: commitMetadata.defaultBehavior,
            legacyAliases: [...legacyAliasesFor(tool.name)],
          },
    primaryResult,
    recommendations: {
      deepView: "describe_tool",
      useCases: [...tool.useCases],
    },
  };
}

function buildFullToolSchemaCatalog(input: SchemaInput): ToolSchemaCatalog {
  const filter = input.toolName?.trim();
  const advertised = advertisedToolNames();
  const selected =
    filter === undefined || filter.length === 0
      ? advertised
      : advertised.filter((name) => name === filter);
  const sorted = [...selected].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const tools = sorted.map(buildSchemaForTool);
  const filtered = tools.filter((tool) => {
    const workflow = tool.agentWorkflow;
    return (
      (input.phase === undefined || workflow.workflowPhases.includes(input.phase)) &&
      (input.status === undefined || workflow.status === input.status)
    );
  });
  return {
    projectId: input.projectId ?? null,
    tools: filtered,
  };
}

function indexSchemaForTool(tool: ToolSchema, toolSurface: ToolSurface): SchemaIndexTool {
  return {
    name: tool.name,
    purpose: tool.description,
    access: tool.access,
    phases: [...tool.agentWorkflow.workflowPhases],
    status: tool.agentWorkflow.status,
    preferredFor: [...tool.agentWorkflow.preferFor],
    annotations: tool.annotations,
    advertised: isAdvertisedUnderSurface(tool.name, toolSurface),
  };
}

export function buildToolSchemaCatalog(
  input: SchemaInput & { view: "compact" },
): CompactToolSchemaCatalog;
export function buildToolSchemaCatalog(input: SchemaInput & { view: "index" }): SchemaIndexCatalog;
export function buildToolSchemaCatalog(input: SchemaInput & { view?: "full" }): ToolSchemaCatalog;
export function buildToolSchemaCatalog(input: SchemaInput): ToolSchemaCatalogView;
export function buildToolSchemaCatalog(input: SchemaInput): ToolSchemaCatalogView {
  const full = buildFullToolSchemaCatalog(input);
  if (input.view === "index") {
    const surface = input.toolSurface ?? "full";
    return {
      projectId: full.projectId,
      tools: full.tools.map((tool) => indexSchemaForTool(tool, surface)),
    };
  }
  if (input.view !== "compact") return full;
  return {
    projectId: full.projectId,
    tools: full.tools.map(compactSchemaForTool),
  };
}

// Issue #1077 — load-time guard. Runs once when the module is first
// imported; throws when an advertised tool is missing a resultContract
// entry. Cheap (one Set lookup per advertised name) and isolated to
// module init so production traffic pays nothing.
assertToolResultContractsAreTotal();

// ─── MCP tool factory ─────────────────────────────────────────────────────────

function resolveSchemaView(value: unknown): SchemaView | undefined {
  return value === "index" || value === "compact" || value === "full" ? value : undefined;
}

function schemaViewRequiredError(): McpToolResult {
  const message =
    "schema({}) is not allowed without an explicit view. Pass view: 'index' (routing-only), 'compact' (~30K tokens), or 'full' (full schema, ~196K tokens — opt in deliberately).";
  return withSchemaVersion({
    content: [{ type: "text", text: `SCHEMA_VIEW_REQUIRED: ${message}` }],
    isError: true,
    ok: false,
    error: {
      code: "SCHEMA_VIEW_REQUIRED",
      message,
      remediation:
        "Call schema({ view: 'index' }) for routing-only discovery, schema({ view: 'compact' }) for low-context discovery, or schema({ view: 'full' }) only when deliberately opting into the complete catalog.",
    },
  });
}

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
export function createSchemaTool(opts: { toolSurface?: ToolSurface } = {}): DysflowMcpTool {
  return {
    name: "schema",
    resultContract: schemaResultContract,
    description:
      "Return static contracts for this dysflow installation. Call get_capabilities first. Explicit view is required: use { view: 'index' } for routing-only discovery, { view: 'compact' } for low-context discovery, or { view: 'full' } for the complete catalog only by deliberate opt-in. Use describe_tool for the preferred one-tool deep view. Read-only — never opens Access, never spawns PowerShell, never mutates state. " +
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
      const view = resolveSchemaView(params.view);
      if (view === undefined) return schemaViewRequiredError();
      const phase =
        typeof params.phase === "string" &&
        AGENT_WORKFLOW_PHASES.includes(params.phase as AgentWorkflowPhase)
          ? (params.phase as AgentWorkflowPhase)
          : undefined;
      const status =
        params.status === "preferred" ||
        params.status === "specialized" ||
        params.status === "legacy"
          ? params.status
          : undefined;
      const catalog = buildToolSchemaCatalog({
        projectId,
        toolName,
        view,
        phase,
        status,
        toolSurface: opts.toolSurface,
      });
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
    resultContract: describeToolResultContract,
    description:
      "Preferred one-tool deep introspection view: complete inputSchema, canonical params and aliases, defaults, returns, resultContract, errors, references, and useCases. Pass { name: '<tool>' } (alias: toolName). Call get_capabilities first for live state; use schema({ view: 'compact' }) only for catalog-wide discovery. Read-only — never opens Access, never spawns PowerShell, never mutates state. " +
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
        const message = `Tool '${rawName}' not found. Call schema({ view: 'index' }) to list every callable tool name and inspect its advertised state.`;
        return {
          content: [{ type: "text", text: `TOOL_NOT_FOUND: ${message}` }],
          isError: true,
          ok: false,
          error: { code: "TOOL_NOT_FOUND", message },
        };
      }
      const rawSections = Array.isArray(params.sections)
        ? params.sections.filter((value): value is DescribeToolSection =>
            DESCRIBE_TOOL_SECTIONS.includes(value as DescribeToolSection),
          )
        : undefined;
      const sections = rawSections === undefined ? undefined : new Set(rawSections);
      const payload: Record<string, unknown> = {
        name: entry.name,
        description: `${entry.name}: ${entry.description}`,
      };
      if (sections === undefined) {
        Object.assign(payload, entry, { params: entry.parameters });
        payload.description = `${entry.name}: ${entry.description}`;
      } else {
        if (sections.has("parameters")) payload.parameters = entry.parameters;
        if (sections.has("returns")) payload.returns = entry.returns;
        if (sections.has("errors")) payload.errorCodes = entry.errorCodes;
        if (sections.has("references")) payload.crossReferences = entry.crossReferences;
        if (sections.has("workflow")) {
          payload.agentWorkflow = entry.agentWorkflow;
          payload.useCases = entry.useCases;
        }
        if (sections.has("resultContract")) payload.resultContract = entry.resultContract;
        if (sections.has("summary")) {
          payload.access = entry.access;
          payload.safeByDefault = entry.safeByDefault;
        }
      }
      const content: McpTextContent[] = [{ type: "text", text: JSON.stringify(payload) }];
      return { content, isError: false, ok: true };
    },
  };
}

// Re-export the route table so a follow-up issue (#966) can surface
// the per-tool mutatesBinary / mutatesFilesystem / risk metadata
// without re-importing dispatch-routes from the adapter layer.
export { ALIAS_TOOL_NAMES, MCP_TOOL_ROUTES };
