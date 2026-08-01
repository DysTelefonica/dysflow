/**
 * Issue #779 (v2.1.0) — unified risk registry and effective-dry-run-default
 * helper for every contract tool exposed by the MCP adapter.
 *
 * The risk classification is a parallel concern to the existing
 * `mutatesBinary` / `mutatesFilesystem` / `queryMode` route flags. Those
 * flags decide whether the write-gate fires (process-level + project-level);
 * risk decides whether the default `dryRun` flag is `true` under the active
 * write-execution policy.
 *
 * Architecture:
 *   - Generated dispatch routes source their risk from
 *     `MCP_TOOL_ROUTES[name].risk` (capa 3, additive metadata).
 *   - Modern tools (e.g. `query_execute`, `list_procedures`) and alias
 *     tools (e.g. `run_vba`, `cleanup_access_operation`) declare their
 *     risk here in the `MCP_TOOL_RISKS` registry.
 *   - `effectiveDryRunDefaultForTool(name, mode)` is the single source of
 *     truth for the per-tool default that the dispatch layer and the
 *     capabilities snapshot consult. There must NOT be any other place in
 *     the codebase that hardcodes per-tool defaults.
 */

import { commitFlagMetadataForOrNoop } from "../../core/runtime/commit-flag-registry.js";
import type { ToolRisk, WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import { DEFAULT_DRY_RUN_TABLE } from "../../core/runtime/write-execution-policy.js";
import { supportsSharedOutputMode } from "../../shared/validation/schema-blocks.js";
import { MCP_TOOL_ROUTES } from "./dispatch-routes.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";

/**
 * Risk classification for modern tools (those not in `MCP_TOOL_ROUTES`).
 * Generated routes are derived from `MCP_TOOL_ROUTES[name].risk` at
 * registry-build time so the per-route test (capa 3) and this registry
 * stay in lockstep.
 */
const MODERN_TOOL_RISK: Readonly<Record<string, ToolRisk>> = {
  // #777 canonical names — read-only unless noted
  doctor: "read-only",
  access_force_cleanup_orphaned: "process-control",
  resolve_project: "read-only",
  get_capabilities: "read-only",
  // #701 read-only VBA procedure introspection
  list_procedures: "read-only",
  get_procedure: "read-only",
  find_references: "read-only",
  // #705 read-only dead-code analysis
  detect_dead_code: "read-only",
  // #703 read-only manifest validation
  validate_manifest: "read-only",
  // #704 read-only module linting
  lint_module: "read-only",
  // #971 — runtime contract discovery. Pure read-class: never opens
  // Access, never spawns PowerShell, never mutates state. Same risk
  // family as `doctor` / `get_capabilities` / `resolve_project`.
  schema: "read-only",
  // #1057 (F5) — single-tool introspection. Same risk family as `schema`.
  describe_tool: "read-only",
  // #965 — aggregated project health (projectConfig + filesystem + runtime)
  // in a single call. Pure read-class: never opens Access, never spawns
  // PowerShell, never writes to disk. Same risk family as `schema` and
  // `resolve_project`.
  diagnose: "read-only",
  // #973 — AI-aware log access. Pure read-class: never opens Access,
  // never spawns PowerShell, never mutates state. Same risk family as
  // `schema` / `doctor` / `resolve_project`.
  logs: "read-only",
  // query_execute — write-side is arbitrary
  query_execute: "arbitrary-write",
  // Round-12 (#976) — `clean_stale_markers` is filesystem-control on apply.
  // Dry-run (default) never mutates; apply transitions stale markers'
  // status to `abandoned`. Pairs with the #967 auto-cleanup which already
  // runs the same sweep before every operation start, so the risk tier
  // is the same: a routine but explicit filesystem write.
  clean_stale_markers: "routine-dev-write",
  // Round-12 (#978) — `state` is a pure read-class snapshot. Never opens
  // Access, never spawns PowerShell, never mutates state. Same risk
  // family as `schema` / `diagnose` / `logs` / `resolve_project`.
  state: "read-only",
  // Issue #1177 — `migrate_project_config` rewrites
  // `.dysflow/project.json` on apply. The default empty call is a pure
  // read-class diff preview; `apply: true` is a routine dev-write on
  // the project config file (no Access, no PowerShell, no .accdb). Same
  // risk family as `clean_stale_markers` (filesystem control under an
  // explicit confirm gate).
  migrate_project_config: "routine-dev-write",
  setup_project: "routine-dev-write",
};

/**
 * Risk classification for alias tools (those routed via
 * `alias-tools.ts`, not via `MCP_TOOL_ROUTES`). The contract for
 * per-call gating (e.g. `force: true` vs. `confirmPid: <int>`) is
 * encoded in the runtime behavior; the risk at the tool level is
 * process-control for the killable family.
 */
const ALIAS_TOOL_RISK: Readonly<Record<string, ToolRisk>> = {
  list_access_operations: "read-only",
  cleanup_access_operation: "process-control",
  // run_vba is gated by the configured allowedProcedures allowlist; in
  // developer mode the dry-run ceremony drops, but the allowlist gate
  // remains the real safety boundary.
  run_vba: "routine-dev-write",
  // query_sql is the read-side alias of query_execute (mode="read")
  query_sql: "read-only",
  exec_sql: "arbitrary-write",
  run_script: "arbitrary-write",
  create_table: "protected-write",
  drop_table: "destructive-write",
  seed_fixture: "routine-dev-write",
  teardown_fixture: "destructive-write",
};

/**
 * Build the unified risk registry. Generated routes source from the route
 * table (capa 3); modern + alias are explicit. The keys must cover every
 * entry in `MCP_TOOL_CONTRACTS` — a mismatch is a build-time error via the
 * `satisfies` check below.
 */
const ROUTE_TOOL_NAMES = new Set<string>(Object.keys(MCP_TOOL_ROUTES));

function buildRiskRegistry(): Record<string, ToolRisk> {
  const out: Record<string, ToolRisk> = {};
  // Generated routes
  for (const [name, route] of Object.entries(MCP_TOOL_ROUTES)) {
    const risk = (route as { risk?: ToolRisk }).risk;
    if (risk === undefined) {
      // Surfaced as a TypeError rather than a silent `undefined` so a
      // future capa-3 regression (route missing the additive risk field)
      // fails fast at the registry boundary instead of corrupting every
      // downstream consumer.
      throw new TypeError(`MCP_TOOL_ROUTES["${name}"] is missing the additive risk field (#779)`);
    }
    out[name] = risk;
  }
  // Modern tools (overlap with routes is harmless; explicit entries win)
  for (const [name, risk] of Object.entries(MODERN_TOOL_RISK)) {
    out[name] = risk;
  }
  // Alias tools
  for (const [name, risk] of Object.entries(ALIAS_TOOL_RISK)) {
    if (ROUTE_TOOL_NAMES.has(name)) {
      throw new TypeError(
        `MCP_TOOL_RISKS: "${name}" appears in both MCP_TOOL_ROUTES and ALIAS_TOOL_RISK; classify once`,
      );
    }
    out[name] = risk;
  }
  return out;
}

/**
 * Unified risk registry. The keys must cover every entry in
 * `MCP_TOOL_CONTRACTS`. A mismatch is a runtime check in the test suite
 * (capa 4); the type assertion below keeps it tight at compile time.
 */
export const MCP_TOOL_RISKS: Readonly<Record<string, ToolRisk>> = buildRiskRegistry();

/**
 * Resolve the risk for a tool by name. Returns `undefined` for unknown
 * tool names — the resolver never throws. Callers (dispatch, capabilities
 * snapshot) must decide what to do with an unknown tool.
 */
export function resolveRiskForTool(name: string): ToolRisk | undefined {
  return MCP_TOOL_RISKS[name];
}

/**
 * Whether a tool participates in the shared apply/dryRun/diff contract.
 *
 * Process-control tools and read-shaped generators can carry a non-read-only
 * risk without accepting write-intent flags, so risk alone is insufficient.
 * Commit metadata supplies the second half of the runtime classification:
 * an executing default or a no-write alias means the tool has a caller-facing
 * write-intent contract.
 */
export function isWriteIntentTool(name: string): boolean {
  const metadata = commitFlagMetadataForOrNoop(name);
  return (
    resolveRiskForTool(name) !== "read-only" &&
    resolveRiskForTool(name) !== undefined &&
    (metadata.defaultBehavior !== "noop" || metadata.noWriteAlias !== null)
  );
}

export type SharedBlockRequirement = "required" | "not-applicable";

export type SharedBlockPolicy = {
  strictContext: SharedBlockRequirement;
  timeoutMs: SharedBlockRequirement;
  transactional: boolean;
  dryRunWithPreflight: boolean;
  outputMode: SharedBlockRequirement;
};

/**
 * Issue #1192 — explicit exceptions to the write-class strict-context rule.
 *
 * These tools do not resolve an Access, project-source, or destination target
 * through the shared execution-target pipeline. Advertising the four pins
 * would therefore be a dangerous no-op rather than a safety rail.
 */
export const STRICT_CONTEXT_EXCEPTIONS = {
  catalog_add_control:
    "Offline catalog-file mutation; it resolves no Access or managed-source execution target.",
  clean_stale_markers:
    "Local runtime-marker maintenance; it resolves no Access or managed-source execution target.",
  generate_form:
    "Offline form-spec generation; it resolves no Access or managed-source execution target.",
  migrate_project_config:
    "Project-config migration validates its explicit cwd-bound config path and resolves no Access target.",
  setup_project:
    "Project bootstrap validates the selected Git worktree and candidate config before atomic publication.",
} as const satisfies Readonly<Record<string, string>>;

/**
 * Tools routed through MCP_TOOL_ROUTES are Access/PowerShell-backed by
 * default. This allowlist records the offline routes for which a timeout
 * parameter would be a no-op. Modern and alias exceptions are included here
 * for the same reason.
 */
export const TIMEOUT_EXCEPTIONS = {
  analyze_form_layout: "Pure offline FormIR/layout analysis; no child process is spawned.",
  analyze_form_ui: "Pure offline FormIR analysis; no child process is spawned.",
  catalog_add_control: "Updates the offline form catalog; no child process is spawned.",
  clean_stale_markers: "Synchronous marker-file maintenance; no child process is spawned.",
  compare_form: "Pure offline form-source comparison; no child process is spawned.",
  copy_form_ui_pattern: "Pure offline FormIR planning; no child process is spawned.",
  detect_dead_code: "Pure source analysis; no child process is spawned.",
  diff_form_preview: "Pure offline preview comparison; no child process is spawned.",
  find_references: "Pure source analysis; no child process is spawned.",
  form_get_geometry: "Pure offline form-source read; no child process is spawned.",
  form_list_controls: "Pure offline form-source read; no child process is spawned.",
  generate_form: "Generates an offline form-spec file; no child process is spawned.",
  generate_form_design_plan: "Pure offline plan generation; no child process is spawned.",
  get_procedure: "Pure source analysis; no child process is spawned.",
  harvest_form_catalog: "Reads offline form sources; no child process is spawned.",
  inspect_form: "Reads one offline form source; no child process is spawned.",
  lint_form_code: "Pure source linting; no child process is spawned.",
  lint_module: "Pure source linting; no child process is spawned.",
  list_access_files: "Uses the filesystem adapter directly; no child process is spawned.",
  list_procedures: "Pure source analysis; no child process is spawned.",
  map_form_behavior:
    "FormIR mapping does not spawn Access or PowerShell; optional CodeGraph enrichment is outside this timeout class.",
  migrate_project_config: "Synchronous project-config migration; no child process is spawned.",
  render_form_preview: "Pure offline preview rendering; no child process is spawned.",
  validate_form_spec: "Pure JSON/form-spec validation; no child process is spawned.",
  validate_manifest: "Pure manifest validation; no child process is spawned.",
  vba_orphan_audit: "Pure source-tree audit; no child process is spawned.",
  verify_form_bindings: "Pure offline binding validation; no child process is spawned.",
  verify_form_ui: "Pure offline contract comparison; no child process is spawned.",
} as const satisfies Readonly<Record<string, string>>;

const PROCESS_BACKED_MODERN_OR_ALIAS_TOOLS = new Set([
  "cleanup_access_operation",
  "doctor",
  "exec_sql",
  "query_execute",
  "query_sql",
  "run_script",
  "run_vba",
  "create_table",
  "drop_table",
  "seed_fixture",
  "teardown_fixture",
]);

const TRANSACTIONAL_TOOLS = new Set(["export_modules", "import_modules", "sync_binary"]);
const PREFLIGHT_TOOLS = new Set(["export_modules", "import_modules", "sync_binary"]);

/**
 * Class-derived shared-block policy. The completeness gate consumes this
 * function, and get_capabilities exposes the same verdict per tool.
 */
export function sharedBlockPolicyForTool(name: string): SharedBlockPolicy {
  const strictContextRequired = isWriteIntentTool(name) && !(name in STRICT_CONTEXT_EXCEPTIONS);
  const routeBacked = name in MCP_TOOL_ROUTES;
  const timeoutRequired =
    (routeBacked || PROCESS_BACKED_MODERN_OR_ALIAS_TOOLS.has(name)) &&
    !(name in TIMEOUT_EXCEPTIONS);
  return {
    strictContext: strictContextRequired ? "required" : "not-applicable",
    timeoutMs: timeoutRequired ? "required" : "not-applicable",
    transactional: TRANSACTIONAL_TOOLS.has(name),
    dryRunWithPreflight: PREFLIGHT_TOOLS.has(name),
    outputMode: supportsSharedOutputMode(name) ? "required" : "not-applicable",
  };
}

export function sharedBlockExceptionsForTool(
  name: string,
): Readonly<Partial<Record<"strictContext" | "timeoutMs", string>>> {
  return {
    ...(name in STRICT_CONTEXT_EXCEPTIONS
      ? {
          strictContext: STRICT_CONTEXT_EXCEPTIONS[name as keyof typeof STRICT_CONTEXT_EXCEPTIONS],
        }
      : {}),
    ...(name in TIMEOUT_EXCEPTIONS
      ? { timeoutMs: TIMEOUT_EXCEPTIONS[name as keyof typeof TIMEOUT_EXCEPTIONS] }
      : {}),
  };
}

/**
 * Compute the effective `dryRun` default for a tool under the given
 * write-execution policy. This is the SINGLE place that hardcodes the
 * mode × risk truth table; the dispatch layer and the capabilities
 * snapshot must call this helper rather than re-derive the answer.
 *
 * Truth table (locked in v2.1.0):
 *
 *   read-only           → true under both modes
 *   routine-dev-write   → true under safe-by-default, false under developer
 *   protected-write     → true under both modes
 *   destructive-write   → true under both modes (caller still needs
 *                         `confirmOverwriteSource` on export tools)
 *   arbitrary-write     → true under both modes
 *   process-control     → true under both modes (per-call gating decides)
 *
 * @param name Tool name (DysflowMcpToolName | ModernDysflowMcpToolName | alias).
 * @param mode Active write-execution policy (resolved from project config).
 * @returns The effective `dryRun` default. `true` means the tool plans by
 *          default (caller must pass `dryRun:false` to commit). `false`
 *          means the tool executes by default (the developer-mode routine
 *          loop).
 */
export function effectiveDryRunDefaultForTool(name: string, mode: WriteExecutionPolicy): boolean {
  const risk = resolveRiskForTool(name);
  if (risk === undefined) {
    // Unknown tool — fail safe: default to plan-only. The dispatcher
    // surfaces the unknown-tool error before reaching this point, so
    // this branch is defensive.
    return true;
  }
  // Derive from DEFAULT_DRY_RUN_TABLE — the single source of truth for the
  // (mode × risk) → default. `resolveWriteExecutionPolicy` reads the same
  // table for `requiresConfirmOverwriteSource`, so the helper (consulted by
  // the dispatch seam + capabilities snapshot) and the resolver can never
  // diverge. See test `mcp-tool-risks.test.ts` anti-divergence guard (#790).
  return DEFAULT_DRY_RUN_TABLE[mode][risk];
}

/**
 * Internal contract pin. The risk registry must cover every contract tool.
 * A mismatch is a build-time error so a future contract addition without a
 * risk entry doesn't slip through silently.
 */
const _everyContractCovered = (() => {
  for (const name of Object.keys(MCP_TOOL_CONTRACTS)) {
    if (!(name in MCP_TOOL_RISKS)) {
      throw new TypeError(`MCP_TOOL_RISKS is missing risk for contract tool "${name}" (#779)`);
    }
  }
  return true;
})();
void _everyContractCovered;
