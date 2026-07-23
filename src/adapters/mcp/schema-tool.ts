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
  type CommitFlagName,
  type DefaultBehavior,
  legacyAliasesFor,
  type NoWriteAliasName,
} from "../../core/runtime/commit-flag-registry.js";
import { PROJECT_IDENTITY_BLOCK } from "../../shared/validation/index.js";
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
export type SchemaView = "compact" | "full";

export type SchemaInput = {
  projectId?: string;
  toolName?: string;
  view?: SchemaView;
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

// ─── Result-contract surface (#1077) ───────────────────────────────────────────

/**
 * Field-type descriptor used inside the result-contract surface. Mirrors
 * the {@link ToolParameterSchema} vocabulary so a single consumer-side
 * helper can coerce both surfaces without branching on field shape.
 */
export type ToolFieldShape = {
  type: "string" | "number" | "boolean" | "object" | "array";
  optional?: boolean;
  description?: string;
  /** Element type when `type === "array"`. */
  items?: ToolFieldShape;
  /**
   * Nested property map when `type === "object"`. Allows one level of
   * inline nesting so a typed payload like `{ summary: { total,
   * inSync } }` does not require a separate
   * {@link ToolDataSchemaFragment} just for the nested object.
   */
  properties?: Record<string, ToolFieldShape>;
};

/**
 * Issue #1077 — typed error envelope shape. Mirrors the `McpToolError`
 * contract surfaced by `translateCoreResultToMcpContent`: every error
 * envelope carries a typed `code`, a human-readable `message`, and (for
 * gate refusals) a typed `remediation` string. The shape is pinned here
 * so a future envelope simplification cannot silently drop the
 * remediation field that consumers rely on.
 */
export type ToolErrorEnvelopeShape = {
  code: { type: "string" };
  message: { type: "string" };
  remediation?: { type: "string"; optional: true };
};

/**
 * Tools whose payload can grow unbounded surface this dimension so the
 * consumer knows where to find the bytes. `summary` is the inline
 * count/aggregation; `file` is a path on disk; `full` is the full
 * in-memory payload. Today only `export_modules` and the form
 * preview/lint tools declare more than one mode.
 */
export type ToolOutputMode = "summary" | "file" | "full";

/**
 * Plan / apply discriminator for write-class tools. `plan` means the
 * runtime computed the change but did not commit; `apply` means the
 * runtime persisted the change. A consumer can refuse a result that
 * claims `apply:true` but returned a `plan`-shaped payload — the modes
 * field is what makes that refusal safe.
 */
export type ToolResultMode = "plan" | "apply";

/**
 * Minimal JSON-Schema-like fragment for a tool's primary payload. The
 * fragment is intentionally narrow (no `oneOf`/`anyOf`/`$ref`): it
 * documents the SHAPE of the payload, not its full type algebra. Tools
 * with discriminated payloads (sync_binary, query_execute) use
 * `oneOf`; tools with a flat payload use `properties`.
 */
export type ToolDataSchemaFragment = {
  type: "object";
  description?: string;
  properties?: Record<string, ToolFieldShape>;
  required?: readonly string[];
  oneOf?: readonly ToolDataSchemaFragment[];
  additionalProperties?: boolean;
};

/**
 * Issue #1077 — discriminated result contract. The catalog exposes
 * either:
 *
 *   - `kind: "dataSchema"` — the tool returns a typed payload that the
 *     consumer must introspect (plan/apply variants, output modes,
 *     error envelope shape).
 *   - `kind: "envelope-only"` — the tool is a pure pass-through or
 *     returns an opaque status; the generic MCP envelope is enough and
 *     the catalog carries a justification that names WHY.
 *
 * Every advertised tool must publish one or the other. The schema test
 * (`test/adapters/mcp/tool-result-contracts.test.ts`) enforces the
 * invariant at build time.
 */
export type ToolResultContract =
  | {
      kind: "dataSchema";
      /**
       * Human-readable description of what the payload contains.
       * Optional — most entries use it to document the discriminator
       * or the way to interpret the shape.
       */
      description?: string;
      dataSchema: ToolDataSchemaFragment;
      /**
       * Issue #1077 — discriminated result modes for write-class tools.
       * Read-only tools omit this field; write-class tools must declare
       * at least `["plan", "apply"]` so consumers can refuse
       * inconsistent `apply:true` / plan-shaped combinations.
       */
      modes?: readonly ToolResultMode[];
      /**
       * Issue #1077 — large-response behavior. Tools whose payload
       * could grow unbounded declare the supported modes; consumers
       * branch on `outputModes` to decide between reading inline vs
       * tailing a file path. Omitted when the tool only has one
       * canonical delivery channel.
       */
      outputModes?: readonly ToolOutputMode[];
      errorEnvelope: { shape: ToolErrorEnvelopeShape };
    }
  | {
      kind: "envelope-only";
      /**
       * Human-readable justification for why the generic envelope is
       * sufficient. Required: the schema test fails any envelope-only
       * entry that ships without one.
       */
      justification: string;
      errorEnvelope: { shape: ToolErrorEnvelopeShape };
    };

/**
 * Runtime contract for a single MCP tool. Returned inside the `tools`
 * array from `buildToolSchemaCatalog` / `dysflow.schema`.
 */
export type ToolSchema = {
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

export type CompactToolSchema = {
  name: string;
  purpose: string;
  access: McpToolAccess;
  requiredParameters: string[];
  requiredParameterGroups: SchemaCompositionConstraint[];
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

export type ToolSchemaCatalogView = ToolSchemaCatalog | CompactToolSchemaCatalog;

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
  describe_tool: [
    "Use the preferred one-tool deep view after compact discovery identifies the tool to call.",
  ],
  schema: [
    "Call with view:'compact' for low-context discovery across all tools; filter with toolName in either view.",
    "Call with view:'full' only when complete JSON Schema, aliases, errors, use cases, and references are required.",
  ],
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
    view: {
      type: "string",
      enum: ["compact", "full"],
      default: "full",
      description:
        "Catalog detail level. Use compact for low-context discovery and full for complete JSON Schema, aliases, errors, use cases, and references. Defaults to full for backward compatibility.",
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

function defaultFromDescription(parameter: ToolParameterSchema): unknown {
  if (!/\bdefault(?:s|ed)?\b/i.test(parameter.description)) return undefined;
  const quoted = parameter.description.match(/[`'"]([^`'"]+)[`'"]\s*\(default\)/i)?.[1];
  const stated = parameter.description.match(
    /\bdefault(?:s|ed)?(?:\s+value)?(?:\s+is|\s+to)?\s+[`'"]?([^.;,`'"]+)/i,
  )?.[1];
  const raw = (quoted ?? stated)?.trim();
  if (raw === undefined || raw.length === 0) return "runtime-defined";
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
    description.match(/\balias\s+(?:of|for)\s+[`'"]?([A-Za-z][A-Za-z0-9]*)/i)?.[1] ??
    description.match(/\b[A-Za-z]+\s+alias\s+for\s+[`'"]?([A-Za-z][A-Za-z0-9]*)/i)?.[1];
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
      if (inferredDefault !== undefined) parameter.default = inferredDefault;
    }
    if (!/\balias(?:es)?\b/i.test(parameter.description) || parameter.canonicalName !== undefined) {
      continue;
    }
    parameter.canonicalName =
      canonicalNameFromDescription(name, parameter.description, parameters) ?? name;
    parameter.precedence = parameter.canonicalName === name ? "canonical" : "deprecated";
    if (parameter.canonicalName !== name) {
      parameter.deprecated = true;
      parameter.deprecatedSince = "2.23.0";
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

  for (const [name, parameter] of Object.entries(parameters)) {
    if (/password|secret|token/i.test(name)) parameter.sensitive = true;
  }

  const writeFlags = ["apply", "dryRun", "diff"].filter((name) => parameters[name] !== undefined);
  if (writeFlags.length < 2) return;
  const legacyAliases = new Set(legacyAliasesFor(toolName));
  for (const flag of writeFlags) {
    const parameter = parameters[flag];
    if (parameter === undefined) continue;
    parameter.conflictsWith = writeFlags.filter((candidate) => candidate !== flag);
    if (flag === commitMetadata.commitFlag) {
      parameter.precedence = "canonical";
      continue;
    }
    parameter.precedence = legacyAliases.has(flag) ? "deprecated" : "alias";
    if (legacyAliases.has(flag)) {
      parameter.deprecated = true;
      parameter.deprecatedSince = "2.23.0";
      parameter.canonicalName = commitMetadata.commitFlag;
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

function inputSchemaForTool(name: string): JsonObjectSchema {
  const modern = MODERN_TOOL_INPUT_SCHEMAS[name];
  if (modern !== undefined) return modern;
  const alias = ALIAS_INPUT_SCHEMA_OVERRIDES[name];
  if (alias !== undefined) return alias;
  const dispatch = (MCP_TOOL_SCHEMAS as Record<string, JsonObjectSchema>)[name];
  if (dispatch !== undefined) return dispatch;
  return NO_INPUT_SCHEMA;
}

function descriptionForTool(name: string): string {
  const contract = MCP_TOOL_CONTRACTS[name as keyof typeof MCP_TOOL_CONTRACTS];
  if (contract !== undefined) return contract.summary;
  return "No contract metadata registered.";
}

// ─── Result-contract registry (#1077) ──────────────────────────────────────────

/**
 * Issue #1077 — the canonical error envelope shape every Dysflow tool
 * returns. Surfaced verbatim on every result contract so a consumer
 * branching on `error.code` / `error.remediation` does not need to
 * memorize the runtime's envelope separately.
 */
const TOOL_ERROR_ENVELOPE_SHAPE: ToolErrorEnvelopeShape = {
  code: { type: "string" },
  message: { type: "string" },
  remediation: { type: "string", optional: true },
};

const STANDARD_ERROR_ENVELOPE = { shape: TOOL_ERROR_ENVELOPE_SHAPE } as const;

/**
 * Issue #1077 — per-tool result contract registry. Each entry tells a
 * consumer what the tool's primary payload looks like (or, for
 * `envelope-only` entries, WHY the generic envelope is sufficient).
 *
 * The registry is the single source of truth — `buildSchemaForTool`
 * reads from here when populating `ToolSchema.resultContract`. Adding a
 * new tool means an entry here AND a passing test in
 * `test/adapters/mcp/tool-result-contracts.test.ts`.
 *
 * The 6 representative families named in the issue body
 * (verify_code, sync_binary, diagnose, logs, query_execute,
 * export_modules) carry hand-written typed schemas; the remaining
 * tools carry group-derived schemas that are accurate enough to branch
 * on without re-reading handler source. `envelope-only` entries are
 * reserved for tools where the generic envelope is genuinely enough
 * (pure pass-through helpers).
 */

// ── 6 representative families (issue body) ──────────────────────────────────

const VERIFY_CODE_RESULT: ToolResultContract = {
  kind: "dataSchema",
  description:
    "Source ↔ binary drift report. `mode` discriminates 'summary' (counts only) from 'full' (per-module drift).",
  dataSchema: {
    type: "object",
    properties: {
      driftDetected: { type: "boolean", description: "True when any module differs." },
      summary: {
        type: "object",
        description: "Counts of in-sync / source-only / binary-only / diverged modules.",
        properties: {
          total: { type: "number" },
          inSync: { type: "number" },
          sourceOnly: { type: "number" },
          binaryOnly: { type: "number" },
          diverged: { type: "number" },
        },
      },
      bulkImportable: {
        type: "array",
        description: "Modules present on disk but missing from the binary (safe to import).",
      },
      bulkExportable: {
        type: "array",
        description: "Modules present in the binary but missing from disk (safe to export).",
      },
      conflicts: {
        type: "array",
        description:
          "Modules that exist on both sides with non-matching bytes; resolve with sync_binary.",
      },
    },
    required: ["driftDetected", "summary"],
  },
  outputModes: ["summary", "full"],
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

const SYNC_BINARY_RESULT: ToolResultContract = {
  kind: "dataSchema",
  description:
    "sync_binary composes verify + import + export into one round-trip; the `mode` discriminator reports which path actually ran.",
  dataSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description:
          "Discriminator: 'plan' when the call did not mutate, 'apply' when the call committed. Pin this — the runtime never lies about it.",
      },
      direction: {
        type: "string",
        description: "Which side won for each module: 'src-to-binary' or 'binary-to-src'.",
      },
      verify: {
        type: "object",
        description: "Subset of the verify_code payload consumed before the commit.",
      },
      bothChanged: {
        type: "array",
        description:
          "Modules that differed on both sides; the call returned a plan unless acceptBothChanged resolved them.",
      },
      applied: {
        type: "array",
        description: "Modules the call actually committed.",
      },
      conflicts: {
        type: "array",
        description:
          "Modules left unresolved by the call (require manual decision via acceptBothChanged).",
      },
    },
    required: ["mode", "direction"],
  },
  modes: ["plan", "apply"],
  outputModes: ["summary", "full"],
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

const DIAGNOSE_RESULT: ToolResultContract = {
  kind: "dataSchema",
  description:
    "Aggregated project health surface — projectConfig + filesystem + runtime. Pure read-only.",
  dataSchema: {
    type: "object",
    properties: {
      projectConfig: {
        type: "object",
        description:
          "Resolved .dysflow/project.json verdict (status, configPath, projectRoot, projectId, accessPath, backendPath).",
      },
      filesystem: {
        type: "object",
        description: "Filesystem observations (source root, binary present, permissions).",
      },
      runtime: {
        type: "object",
        description: "Runtime counters (operations, markers, locks) — same shape as `state`.",
      },
      checks: {
        type: "array",
        description:
          "Per-check verdict (level: info|warning|error, source, message). Read by category.",
      },
    },
    required: ["projectConfig", "checks"],
  },
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

const LOGS_RESULT: ToolResultContract = {
  kind: "dataSchema",
  description:
    "AI-aware log access — structured view of .dysflow/runtime/ (operations.json + markers).",
  dataSchema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        description: "Log entries matching the filter (since/until/level/operationId/tool).",
      },
      totalCount: { type: "number", description: "Total entries that matched the filter." },
      truncated: {
        type: "boolean",
        description: "True when the result was clipped by `limit` (max 1000).",
      },
      nextOffset: {
        type: "number",
        description:
          "When `truncated`, the offset for the next page; null when there is nothing more to read.",
      },
    },
    required: ["entries", "totalCount", "truncated"],
  },
  outputModes: ["summary", "full"],
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

const QUERY_EXECUTE_RESULT: ToolResultContract = {
  kind: "dataSchema",
  description:
    "Discriminated query result; mode=read returns rows, mode=write returns affectedCount + plan/apply.",
  dataSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description: "Echoes the request mode: 'read' | 'write'.",
      },
      rows: {
        type: "array",
        description: "Row set (mode=read). Empty when the call was a write.",
      },
      affectedCount: {
        type: "number",
        description: "Affected rows (mode=write).",
      },
      plan: {
        type: "boolean",
        description: "True when the call was a dry-run; the runtime did NOT mutate the database.",
      },
      columns: {
        type: "array",
        description: "Column metadata for mode=read results.",
      },
    },
    required: ["mode"],
  },
  modes: ["plan", "apply"],
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

const EXPORT_MODULES_RESULT: ToolResultContract = {
  kind: "dataSchema",
  description:
    "Module export result; `mode` discriminates plan vs apply, `outputMode` is `summary|file|full`.",
  dataSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description: "'plan' or 'apply' — what the runtime actually did.",
      },
      exportedPaths: {
        type: "array",
        description: "Files written to disk (mode=apply) or expected to be written (mode=plan).",
      },
      pruned: {
        type: "array",
        description:
          "Files the runtime would have removed because prune=true and they no longer exist in the binary.",
      },
      binaryMutated: {
        type: "boolean",
        description:
          "Whether the binary was opened for write. False when mutateBinary=false (the default for safe exports).",
      },
    },
    required: ["mode", "exportedPaths"],
  },
  modes: ["plan", "apply"],
  outputModes: ["summary", "file", "full"],
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

// ── Write-class generic contracts (vba-sync + query-maintenance) ────────────

const GENERIC_WRITE_CONTRACT: ToolResultContract = {
  kind: "dataSchema",
  description: "Generic write-class payload; `mode` discriminates plan vs apply.",
  dataSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description: "'plan' or 'apply' — what the runtime actually did.",
      },
    },
    required: ["mode"],
  },
  modes: ["plan", "apply"],
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

const VBA_SYNC_WRITE_RESULT: ToolResultContract = {
  kind: "dataSchema",
  description:
    "vba-sync write-class payload; carriers export/import/delete operations over the source ↔ binary seam.",
  dataSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description: "'plan' or 'apply' — what the runtime actually did.",
      },
      applied: {
        type: "array",
        description: "Modules actually mutated (apply mode).",
      },
      skipped: {
        type: "array",
        description: "Modules skipped by the call (e.g. read-only flag, filter mismatch).",
      },
    },
    required: ["mode"],
  },
  modes: ["plan", "apply"],
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

const QUERY_MAINTENANCE_WRITE_RESULT: ToolResultContract = {
  kind: "dataSchema",
  description:
    "Query-maintenance write-class payload (exec_sql, run_script, create_table, drop_table, seed_fixture, teardown_fixture).",
  dataSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description: "'plan' or 'apply' — what the runtime actually did.",
      },
      affectedCount: { type: "number", description: "Rows affected (when applicable)." },
    },
    required: ["mode"],
  },
  modes: ["plan", "apply"],
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

// ── Read-class generic contracts ─────────────────────────────────────────────

const READ_ONLY_GENERIC: ToolResultContract = {
  kind: "dataSchema",
  description: "Read-only payload; no plan/apply discriminator (the runtime never mutates).",
  dataSchema: {
    type: "object",
    properties: {
      content: { type: "object", description: "Tool-specific read payload." },
    },
  },
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

const ENVELOPE_ONLY_PASSTHROUGH: ToolResultContract = {
  kind: "envelope-only",
  justification:
    "Pure pass-through helper; the generic MCP envelope is the entire response (no typed payload).",
  errorEnvelope: STANDARD_ERROR_ENVELOPE,
};

/**
 * Issue #1077 — the registry. Every advertised MCP tool has an entry
 * here. `buildSchemaForTool` reads from this map and falls back to a
 * group-derived default when an entry is missing — the load-time guard
 * in `assertToolResultContractsAreTotal` enforces total coverage so a
 * missing entry fails the build, not a runtime consumer.
 */
const TOOL_RESULT_CONTRACTS: Record<string, ToolResultContract> = {
  // ── Bootstrap / diagnostics (read-only) ──────────────────────────────────
  schema: {
    kind: "dataSchema",
    description:
      "Static contract catalog in compact or full detail; omitted view preserves the full legacy shape.",
    dataSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Echo of the request's projectId, or null." },
        tools: {
          type: "array",
          description: "CompactToolSchema or full ToolSchema records selected by view.",
        },
      },
      required: ["tools"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  describe_tool: {
    kind: "dataSchema",
    description: "Single-tool introspection entry.",
    dataSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        params: { type: "object" },
        returns: { type: "object" },
        errorCodes: { type: "array" },
        useCases: { type: "array" },
        resultContract: { type: "object", description: "The tool's own resultContract." },
      },
      required: ["name"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  diagnose: DIAGNOSE_RESULT,
  doctor: {
    kind: "dataSchema",
    description: "Doctor diagnostic checks (per-category verdict).",
    dataSchema: {
      type: "object",
      properties: {
        checks: { type: "array", description: "Per-check verdict (level, source, message)." },
      },
      required: ["checks"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  resolve_project: {
    kind: "dataSchema",
    description: "Resolved .dysflow/project.json verdict (status, paths, write-ready).",
    dataSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "'valid' or a typed failure status." },
        cwd: { type: "string" },
        configPath: { type: "string" },
        projectRoot: { type: "string" },
        projectId: { type: "string" },
        accessPath: { type: "string" },
        backendPath: { type: "string" },
        destinationRoot: { type: "string" },
      },
      required: ["status"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  state: {
    kind: "dataSchema",
    description: "Runtime operational state (operations + markers + locks + counters).",
    dataSchema: {
      type: "object",
      properties: {
        operations: { type: "array" },
        markers: { type: "array" },
        locks: { type: "array" },
        counters: { type: "object" },
      },
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  logs: LOGS_RESULT,
  get_capabilities: {
    kind: "dataSchema",
    description:
      "Aggregated capabilities snapshot (write gates, allowed procedures, commit flags).",
    dataSchema: {
      type: "object",
      properties: {
        adapterVersion: { type: "string" },
        writesProcess: { type: "object" },
        writesProject: { type: "object" },
        dryRunDefault: { type: "boolean" },
        toolsVisible: { type: "number" },
        tools: { type: "object", description: "Per-tool commit-flag metadata." },
      },
      required: ["adapterVersion", "toolsVisible"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },

  // ── Process / recovery (write-class, conditional) ────────────────────────
  list_access_operations: {
    kind: "dataSchema",
    description: "List of recorded access operations (with status + pid + accessPath).",
    dataSchema: {
      type: "object",
      properties: {
        operations: { type: "array" },
      },
      required: ["operations"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  cleanup_access_operation: {
    kind: "dataSchema",
    description: "Cleanup verdict (operationId + final status).",
    dataSchema: {
      type: "object",
      properties: {
        operationId: { type: "string" },
        accessPid: { type: "number" },
        status: {
          type: "string",
          description: "Final status — 'cleaned' or a typed failure verdict.",
        },
      },
      required: ["operationId", "status"],
    },
    modes: ["plan", "apply"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  access_force_cleanup_orphaned: {
    kind: "dataSchema",
    description: "Orphan-process verdict (candidates list or single killed pid).",
    dataSchema: {
      type: "object",
      properties: {
        candidates: { type: "array", description: "Orphan process candidates (list mode)." },
        killedPid: { type: "number", description: "Single pid killed (cleanup mode)." },
      },
    },
    modes: ["plan", "apply"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  clean_stale_markers: {
    kind: "dataSchema",
    description: "Stale-marker sweep verdict.",
    dataSchema: {
      type: "object",
      properties: {
        mode: { type: "string", description: "'plan' or 'apply'." },
        wouldTransition: { type: "array" },
        transitioned: { type: "array" },
      },
      required: ["mode"],
    },
    modes: ["plan", "apply"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },

  // ── VBA sync (dispatch) ──────────────────────────────────────────────────
  export_modules: EXPORT_MODULES_RESULT,
  export_all: {
    kind: "dataSchema",
    description: "Whole-tree export verdict; similar to export_modules but covers every folder.",
    dataSchema: {
      type: "object",
      properties: {
        mode: { type: "string" },
        exportedPaths: { type: "array" },
        pruned: { type: "array" },
      },
      required: ["mode", "exportedPaths"],
    },
    modes: ["plan", "apply"],
    outputModes: ["summary", "file", "full"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  import_modules: {
    kind: "dataSchema",
    description: "Module import verdict; `mode` discriminates plan vs apply.",
    dataSchema: {
      type: "object",
      properties: {
        mode: { type: "string" },
        importedPaths: { type: "array" },
        chunkErrors: { type: "array" },
      },
      required: ["mode"],
    },
    modes: ["plan", "apply"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  import_all: {
    kind: "dataSchema",
    description: "Whole-tree import verdict.",
    dataSchema: {
      type: "object",
      properties: {
        mode: { type: "string" },
        importedPaths: { type: "array" },
        chunkErrors: { type: "array" },
      },
      required: ["mode"],
    },
    modes: ["plan", "apply"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  list_objects: {
    kind: "dataSchema",
    description: "Binary object inventory (modules, classes, forms, reports).",
    dataSchema: {
      type: "object",
      properties: {
        objects: { type: "array" },
      },
      required: ["objects"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  list_vba_modules: {
    kind: "dataSchema",
    description: "VBA module inventory with type/name pattern filters.",
    dataSchema: {
      type: "object",
      properties: {
        modules: { type: "array" },
      },
      required: ["modules"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  exists: {
    kind: "dataSchema",
    description: "Existence check verdict.",
    dataSchema: {
      type: "object",
      properties: {
        exists: { type: "boolean" },
        module: { type: "string" },
      },
      required: ["exists"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  test_vba: {
    kind: "dataSchema",
    description: "VBA test-run verdict with per-test pass/fail breakdown.",
    dataSchema: {
      type: "object",
      properties: {
        mode: { type: "string" },
        total: { type: "number" },
        passed: { type: "number" },
        failed: { type: "number" },
        results: { type: "array" },
      },
      required: ["mode", "total"],
    },
    modes: ["plan", "apply"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  verify_code: VERIFY_CODE_RESULT,
  delete_module: {
    kind: "dataSchema",
    description: "Module-deletion verdict.",
    dataSchema: {
      type: "object",
      properties: {
        mode: { type: "string" },
        deleted: { type: "array" },
      },
      required: ["mode"],
    },
    modes: ["plan", "apply"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  generate_erd: {
    kind: "dataSchema",
    description: "ERD generation verdict (output file path + summary).",
    dataSchema: {
      type: "object",
      properties: {
        erdPath: { type: "string" },
      },
      required: ["erdPath"],
    },
    modes: ["plan", "apply"],
    outputModes: ["file"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  fix_encoding: GENERIC_WRITE_CONTRACT,
  validate_form_spec: READ_ONLY_GENERIC,
  generate_form: GENERIC_WRITE_CONTRACT,
  catalog_add_control: GENERIC_WRITE_CONTRACT,
  harvest_form_catalog: READ_ONLY_GENERIC,
  inspect_form: READ_ONLY_GENERIC,
  compare_form: READ_ONLY_GENERIC,
  lint_form_code: READ_ONLY_GENERIC,
  form_add_control: VBA_SYNC_WRITE_RESULT,
  form_move_control: VBA_SYNC_WRITE_RESULT,
  form_rename_control: VBA_SYNC_WRITE_RESULT,
  form_serialize: READ_ONLY_GENERIC,
  form_deserialize: VBA_SYNC_WRITE_RESULT,
  create_form_from_template: VBA_SYNC_WRITE_RESULT,
  analyze_form_ui: READ_ONLY_GENERIC,
  map_form_behavior: READ_ONLY_GENERIC,
  generate_form_design_plan: READ_ONLY_GENERIC,
  apply_form_design_plan: VBA_SYNC_WRITE_RESULT,
  copy_form_ui_pattern: READ_ONLY_GENERIC,
  verify_form_ui: READ_ONLY_GENERIC,
  form_set_property: VBA_SYNC_WRITE_RESULT,
  form_delete_control: VBA_SYNC_WRITE_RESULT,
  form_set_properties: VBA_SYNC_WRITE_RESULT,
  form_duplicate_control: VBA_SYNC_WRITE_RESULT,
  form_get_geometry: READ_ONLY_GENERIC,
  form_list_controls: READ_ONLY_GENERIC,
  form_align_controls: VBA_SYNC_WRITE_RESULT,
  form_distribute_controls: VBA_SYNC_WRITE_RESULT,
  render_form_preview: {
    kind: "dataSchema",
    description: "Form preview — SVG or ASCII geometry of a .form.txt.",
    dataSchema: {
      type: "object",
      properties: {
        svg: { type: "string", description: "SVG rendering (outputMode=svg|full)." },
        ascii: { type: "string", description: "ASCII rendering (outputMode=ascii)." },
        widthTwips: { type: "number" },
        heightTwips: { type: "number" },
      },
    },
    outputModes: ["summary", "file", "full"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  analyze_form_layout: {
    kind: "dataSchema",
    description: "Geometry lint verdict (overlaps, alignment, tab-order).",
    dataSchema: {
      type: "object",
      properties: {
        overlaps: { type: "array" },
        alignmentIssues: { type: "array" },
        tabOrderIssues: { type: "array" },
      },
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  diff_form_preview: {
    kind: "dataSchema",
    description: "Before/after form preview diff verdict.",
    dataSchema: {
      type: "object",
      properties: {
        added: { type: "array" },
        removed: { type: "array" },
        moved: { type: "array" },
        resized: { type: "array" },
      },
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  verify_form_bindings: {
    kind: "dataSchema",
    description: "ControlSource / RowSource binding validation verdict.",
    dataSchema: {
      type: "object",
      properties: {
        bindings: { type: "array" },
        issues: { type: "array" },
      },
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  sync_binary: SYNC_BINARY_RESULT,
  vba_orphan_audit: {
    kind: "dataSchema",
    description:
      "Orphan VBA procedure audit (procedures registered in binary but missing from source).",
    dataSchema: {
      type: "object",
      properties: {
        orphans: { type: "array" },
      },
      required: ["orphans"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  vba_inline_execution: {
    kind: "dataSchema",
    description: "Inline VBA execution verdict.",
    dataSchema: {
      type: "object",
      properties: {
        mode: { type: "string" },
        returnValue: { type: "string" },
      },
      required: ["mode"],
    },
    modes: ["plan", "apply"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },

  // ── VBA analysis (read-only) ────────────────────────────────────────────
  list_procedures: {
    kind: "dataSchema",
    description: "VBA procedure inventory for a module.",
    dataSchema: {
      type: "object",
      properties: {
        module: { type: "string" },
        procedures: { type: "array" },
      },
      required: ["module", "procedures"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  get_procedure: {
    kind: "dataSchema",
    description: "Single procedure body (startLine/endLine/body).",
    dataSchema: {
      type: "object",
      properties: {
        module: { type: "string" },
        procedure: { type: "string" },
        startLine: { type: "number" },
        endLine: { type: "number" },
        body: { type: "string" },
      },
      required: ["module", "procedure", "startLine", "endLine", "body"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  find_references: {
    kind: "dataSchema",
    description: "Symbol references verdict (with optional pagination).",
    dataSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        scope: { type: "string" },
        references: { type: "array" },
        totalCount: { type: "number" },
        truncated: { type: "boolean" },
        nextOffset: { type: "number" },
      },
      required: ["symbol", "scope", "references"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  detect_dead_code: {
    kind: "dataSchema",
    description: "Dead-code analysis verdict.",
    dataSchema: {
      type: "object",
      properties: {
        deadProcedures: { type: "array" },
        deadDeclarations: { type: "array" },
      },
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  validate_manifest: {
    kind: "dataSchema",
    description: "Test-manifest validation verdict (issues per entry).",
    dataSchema: {
      type: "object",
      properties: {
        issues: { type: "array" },
        isValid: { type: "boolean" },
      },
      required: ["issues", "isValid"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  lint_module: {
    kind: "dataSchema",
    description: "Module lint verdict (per-rule diagnostics + summary).",
    dataSchema: {
      type: "object",
      properties: {
        module: { type: "string" },
        diagnostics: { type: "object", description: "Per-rule diagnostics map." },
        flatDiagnostics: { type: "array" },
        summary: { type: "object" },
      },
      required: ["module", "diagnostics", "summary"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },

  // ── VBA execution / tests (write-class, conditional) ─────────────────────
  run_vba: {
    kind: "dataSchema",
    description: "VBA procedure execution verdict.",
    dataSchema: {
      type: "object",
      properties: {
        mode: { type: "string" },
        returnValue: { type: "string" },
        executionMs: { type: "number" },
      },
      required: ["mode"],
    },
    modes: ["plan", "apply"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },

  // ── Query runner (read + write) ──────────────────────────────────────────
  query_execute: QUERY_EXECUTE_RESULT,
  query_sql: {
    kind: "dataSchema",
    description: "Read-only query SQL verdict (legacy alias of query_execute mode=read).",
    dataSchema: {
      type: "object",
      properties: {
        rows: { type: "array" },
        columns: { type: "array" },
      },
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  exec_sql: QUERY_MAINTENANCE_WRITE_RESULT,
  run_script: QUERY_MAINTENANCE_WRITE_RESULT,
  create_table: QUERY_MAINTENANCE_WRITE_RESULT,
  drop_table: QUERY_MAINTENANCE_WRITE_RESULT,
  seed_fixture: QUERY_MAINTENANCE_WRITE_RESULT,
  teardown_fixture: QUERY_MAINTENANCE_WRITE_RESULT,
  list_tables: {
    kind: "dataSchema",
    description: "Table list verdict.",
    dataSchema: {
      type: "object",
      properties: {
        tables: { type: "array" },
      },
      required: ["tables"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  list_linked_tables: {
    kind: "dataSchema",
    description: "Linked-table inventory.",
    dataSchema: {
      type: "object",
      properties: {
        linkedTables: { type: "array" },
      },
      required: ["linkedTables"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  get_schema: {
    kind: "dataSchema",
    description: "Schema verdict (columns per table).",
    dataSchema: {
      type: "object",
      properties: {
        tables: { type: "array", description: "Per-table column metadata." },
      },
      required: ["tables"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  count_rows: {
    kind: "dataSchema",
    description: "Row count verdict.",
    dataSchema: {
      type: "object",
      properties: {
        count: { type: "number" },
      },
      required: ["count"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  distinct_values: {
    kind: "dataSchema",
    description: "Distinct column values verdict.",
    dataSchema: {
      type: "object",
      properties: {
        values: { type: "array" },
      },
      required: ["values"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  compare_backends: {
    kind: "dataSchema",
    description: "Backend comparison verdict.",
    dataSchema: {
      type: "object",
      properties: {
        differences: { type: "array" },
        inSync: { type: "boolean" },
      },
      required: ["inSync"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  list_access_files: {
    kind: "dataSchema",
    description: "Access file inventory under a directory.",
    dataSchema: {
      type: "object",
      properties: {
        files: { type: "array" },
      },
      required: ["files"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  get_relationships: {
    kind: "dataSchema",
    description: "Table relationship verdict.",
    dataSchema: {
      type: "object",
      properties: {
        relationships: { type: "array" },
      },
      required: ["relationships"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  list_links: {
    kind: "dataSchema",
    description: "Linked-table inventory.",
    dataSchema: {
      type: "object",
      properties: {
        links: { type: "array" },
      },
      required: ["links"],
    },
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  link_tables: QUERY_MAINTENANCE_WRITE_RESULT,
  relink_tables: QUERY_MAINTENANCE_WRITE_RESULT,
  localize_backend_links: QUERY_MAINTENANCE_WRITE_RESULT,
  unlink_table: QUERY_MAINTENANCE_WRITE_RESULT,
  import_queries: QUERY_MAINTENANCE_WRITE_RESULT,
  export_queries: {
    kind: "dataSchema",
    description: "Query export verdict (file output).",
    dataSchema: {
      type: "object",
      properties: {
        exportPath: { type: "string" },
        count: { type: "number" },
      },
      required: ["exportPath"],
    },
    outputModes: ["file"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
  compact_repair: QUERY_MAINTENANCE_WRITE_RESULT,
  relink_directory: {
    kind: "dataSchema",
    description: "Directory-wide relink verdict.",
    dataSchema: {
      type: "object",
      properties: {
        mode: { type: "string" },
        filesScanned: { type: "number" },
        appliedRelinks: { type: "number" },
        unresolved: { type: "array" },
      },
      required: ["mode"],
    },
    modes: ["plan", "apply"],
    errorEnvelope: STANDARD_ERROR_ENVELOPE,
  },
};

/**
 * Issue #1077 — load-time guard. Every advertised tool must have a
 * `resultContract` entry — a missing one would mean the catalog falls
 * back to envelope-only with no justification, which is precisely the
 * silent failure mode the issue rejects. The assert runs once on module
 * load; if it ever fires the test suite catches it next run.
 */
function assertToolResultContractsAreTotal(): void {
  const advertised = advertisedToolNames();
  const missing: string[] = [];
  for (const name of advertised) {
    if (TOOL_RESULT_CONTRACTS[name] === undefined) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing resultContract entries for advertised MCP tools: ${missing.join(", ")}. ` +
        `Add an entry to TOOL_RESULT_CONTRACTS in src/adapters/mcp/schema-tool.ts.`,
    );
  }
}

function resultContractForTool(name: string): ToolResultContract {
  const entry = TOOL_RESULT_CONTRACTS[name];
  if (entry === undefined) {
    // This branch should be unreachable thanks to
    // `assertToolResultContractsAreTotal`, but the consumer-side guard
    // keeps the catalog surface total even if the assert is ever
    // disabled by mistake.
    return ENVELOPE_ONLY_PASSTHROUGH;
  }
  return entry;
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
    useCases: [...(TOOL_USE_CASES[name] ?? [])],
    compositionConstraints: markCanonicalAlternatives(
      name,
      compositionConstraintsFromSchema(inputSchema),
    ),
    resultContract: resultContractForTool(name),
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
      .filter(([, parameter]) => Object.prototype.hasOwnProperty.call(parameter, "default"))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([name, parameter]) => [name, parameter.default]),
  );
  const primaryResult = primaryResultForTool(tool);
  const commitMetadata = commitFlagMetadataForOrNoop(tool.name);

  return {
    name: tool.name,
    purpose: tool.useCases[0] ?? primaryResult.summary,
    access: tool.access,
    requiredParameters: parameterEntries
      .filter(([, parameter]) => parameter.required)
      .map(([name]) => name)
      .sort(),
    requiredParameterGroups: [...tool.compositionConstraints],
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
  return {
    projectId: input.projectId ?? null,
    tools: sorted.map(buildSchemaForTool),
  };
}

export function buildToolSchemaCatalog(
  input: SchemaInput & { view: "compact" },
): CompactToolSchemaCatalog;
export function buildToolSchemaCatalog(
  input: SchemaInput & { view?: "full" },
): ToolSchemaCatalog;
export function buildToolSchemaCatalog(input: SchemaInput): ToolSchemaCatalogView;
export function buildToolSchemaCatalog(input: SchemaInput): ToolSchemaCatalogView {
  const full = buildFullToolSchemaCatalog(input);
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
      "Return static contracts for the consumer's dysflow installation. Call get_capabilities first for live adapter and write-gate state. Use { view: 'compact' } for low-context discovery across all tools, { view: 'full' } for complete JSON Schema, aliases, errors, use cases, and references, and { toolName: '<name>' } to filter either view. Omitted view defaults to full for backward compatibility. Use describe_tool for the preferred one-tool deep view. Read-only — never opens Access, never spawns PowerShell, never mutates state. " +
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
      const view: SchemaView = params.view === "compact" ? "compact" : "full";
      const catalog = buildToolSchemaCatalog({ projectId, toolName, view });
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
