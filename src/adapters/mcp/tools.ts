import { createDysflowError, failureResult } from "../../core/contracts/index.js";
import { buildQueryExecuteRequest } from "../../core/mapping/access-query-request-mapper.js";
import { resolveAccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import type { VbaModuleLintRule } from "../../core/services/vba-module-lint-service.js";
import {
  handleMcpAccessOrphanCleanup,
  handleMcpCleanStaleMarkers,
  handleMcpQueryExecute,
} from "./canonical-handlers.js";
import {
  cleanStaleMarkersResultContract,
  orphanCleanupResultContract,
} from "./contracts/bootstrap-result-contracts.js";
import type { ResultValidationPolicy } from "./contracts/result-validation.js";
import { createDiagnoseTool } from "./diagnose-tool.js";
import { registerMcpTools } from "./dispatch.js";
import { MCP_TOOL_ROUTES } from "./dispatch-routes.js";
import { createGetCapabilitiesTool, readAdapterVersion } from "./get-capabilities-tool.js";
import { createLogsTool } from "./logs-tool.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import { createMigrateProjectConfigTool } from "./migrate-project-config-tool.js";
import { createModernAnalysisTools } from "./modern-analysis-tools.js";
import { createResolveProjectTool } from "./resolve-project-tool.js";
import { createDescribeToolTool, createSchemaTool } from "./schema-tool.js";
import { createStateTool } from "./state-tool.js";

export {
  ALIAS_TOOL_NAMES,
  MCP_TOOL_QUERY_ACTIONS,
  MCP_TOOL_ROUTES,
  registerMcpToolList,
} from "./dispatch.js";
export {
  type DysflowMcpServices,
  type DysflowMcpTool,
  type McpTextContent,
  type McpToolResult,
  type McpWriteAccessResolver,
  sanitizeMcpErrorMessage,
  translateCoreResultToMcpContent,
} from "./result-translation.js";
export { type JsonObjectSchema, MCP_TOOL_SCHEMAS } from "./schemas.js";

import type { ProjectConfigDiagnostic } from "../config/project-config-diagnostic.js";
import {
  doctorResultContract,
  queryExecuteResultContract,
} from "./contracts/remaining-result-contracts.js";
import {
  invalidInput,
  projectConfigNotWriteReady,
  requestRequiresWriteReady,
} from "./dispatch-common.js";
import type {
  DysflowMcpServices,
  DysflowMcpTool,
  McpAccessContextResolver,
  McpWriteAccessResolver,
} from "./result-translation.js";
import { translateCoreResultToMcpContent } from "./result-translation.js";
import {
  CLEAN_STALE_MARKERS_SCHEMA,
  DOCTOR_SCHEMA,
  ORPHAN_CLEANUP_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
} from "./schemas.js";
import { validateInput } from "./validator.js";

export {
  MODERN_ANALYSIS_TOOL_NAMES,
  MODERN_TOOL_NAMES,
  type ModernDysflowMcpToolName,
} from "./modern-tool-registry.js";

// ─── Main factory ─────────────────────────────────────────────────────────────

/**
 * Options bag for {@link createDysflowMcpTools}.
 *
 * Replaces the legacy positional-argument signature (#781 P3). All fields are
 * optional except `services`; defaults mirror the previous positional defaults
 * so behavior is unchanged for callers that omit a field. Naming tweaks:
 *   - `writesEnabled` -> `writes`
 *   - `lintRulesOverride` -> `lintOverrides`
 *
 * `accessDbPath` is kept on the options bag (not in the issue's example list)
 * because the stdio entry point forwards it to the capabilities snapshot so
 * the per-project `humanCompilePending` flag surfaces from the process-local
 * cache.
 */
export type CreateDysflowMcpToolsOptions = {
  services: DysflowMcpServices;
  writes?: boolean;
  writeAccessResolver?: McpWriteAccessResolver;
  env?: Record<string, string | undefined>;
  allowedProcedures?:
    | readonly string[]
    | import("./allowed-procedures-resolver.js").AllowedProcedures;
  accessContextResolver?: McpAccessContextResolver;
  // PR-1 (issue #656) — capabilities snapshot needs the project-level
  // allowWrites flag and the resolved projectId. Both default to
  // `options.writes` / `undefined` so existing callers (no
  // .dysflow/project.json resolved at this layer) keep working unchanged.
  allowWrites?: boolean;
  projectId?: string;
  // #731 — per-rule lint overrides from `.dysflow/project.json`
  // `capabilities.lint.rules`. When omitted, the lint service keeps its
  // strict greenfield behavior (no per-rule opt-outs, no legacy
  // auto-detection).
  lintOverrides?: Readonly<
    Partial<Record<VbaModuleLintRule, { enabled: boolean; reason?: string }>>
  >;
  // PR-1 (issue #762, v1.20.0) — front-end `.accdb` path used to surface
  // the per-project `humanCompilePending` flag in the capabilities snapshot.
  // When omitted, the snapshot reports `humanCompilePending: false` (no
  // project in scope at startup).
  accessDbPath?: string;
  // Issue #779 (v2.1.0) — risk-based write execution policy. Resolved from
  // `.dysflow/project.json` `capabilities.writeExecutionPolicy` by the
  // caller (stdio entry point). When omitted, the snapshot and the dispatch
  // layer default to `"safe-by-default"` so legacy call sites keep their
  // existing behavior.
  writeExecutionPolicy?: WriteExecutionPolicy;
  resultValidationPolicy?: ResultValidationPolicy;
  // Issue #789 — opt-in to the historical strict (error) severity for the
  // `identifier-safety` non-ASCII check. Resolved from
  // `.dysflow/project.json` `capabilities.lint.identifierSafety.strictNonAscii`
  // by the caller. Default `false` (warning for non-ASCII). When `true`,
  // the MCP `lint_module` tool passes `strictNonAscii: true` to the linter
  // service, restoring the legacy strict (error) severity.
  lintIdentifierSafetyStrict?: boolean;
  projectConfigResolver?: (
    input: unknown,
  ) => ProjectConfigDiagnostic | Promise<ProjectConfigDiagnostic>;
  // Issue #940 — optional resolver for the runtime documentation bundle
  // status. When omitted, the snapshot reports fail-closed defaults. The
  // stdio entry point wires a resolver that probes the live install dir
  // for `references/error-codes.md` and `docs/diagnostics/hresult-guide.md`.
  documentationBundleResolver?: () => import("../../shared/install-docs.js").DocumentationBundleStatus;
  cwd?: string;
};

export function createDysflowMcpTools(options: CreateDysflowMcpToolsOptions): DysflowMcpTool[] {
  const {
    services,
    writes: writesEnabled = false,
    writeAccessResolver,
    env = process.env,
    allowedProcedures,
    accessContextResolver: accessContextResolverInput,
    allowWrites,
    projectId,
    lintOverrides: lintRulesOverride = {},
    accessDbPath,
    writeExecutionPolicy,
    resultValidationPolicy,
    lintIdentifierSafetyStrict = false,
    projectConfigResolver,
    documentationBundleResolver,
    cwd = process.cwd(),
  } = options;
  const accessContextResolver: McpAccessContextResolver =
    accessContextResolverInput ??
    (async () =>
      failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_PATH_UNRESOLVED",
          "accessPath must be provided or .dysflow/project.json must declare one.",
        ),
      ));
  const writesAllowedForCapabilities = allowWrites ?? writesEnabled;
  const currentTools: DysflowMcpTool[] = [
    {
      name: "query_execute",
      resultContract: queryExecuteResultContract,
      description: `Execute Access SQL with explicit mode: "read" or mode: "write". Write mode honors dryRun/apply, is blocked by the MCP write gate when writes are disabled, and returns MCP_WRITES_DISABLED instead of mutating data. ${MCP_TOOL_CONTRACTS.query_execute.summary}`,
      inputSchema: QUERY_EXECUTE_SCHEMA,
      handler: async (input, context) =>
        handleMcpQueryExecute(
          input,
          QUERY_EXECUTE_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          (validatedInput) => buildQueryExecuteRequest(validatedInput),
          context,
        ),
    },
    {
      name: "doctor",
      resultContract: doctorResultContract,
      description: `Run core diagnostic checks for projectId or explicit accessPath/backendPath overrides; includeEnvironment adds environment diagnostics when supported. ${MCP_TOOL_CONTRACTS.doctor.summary}`,
      inputSchema: DOCTOR_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, DOCTOR_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as AccessDiagnosticsRequest;
        return translateCoreResultToMcpContent(await services.diagnosticsService.run(request));
      },
    },
    {
      // #777 (Opción A cont.) — the canonical `list_access_operations`
      // and `cleanup_access_operation` registrations live exclusively
      // in `alias-tools.ts` (`buildAliasTools`). Both aliases have
      // bespoke handlers that were in place before this rename. The
      // former bespoke registrations in this file (under their legacy
      // `dysflow_access_operations_list` / `dysflow_access_cleanup`
      // names) are REMOVED entirely; the alias is the sole source.
      name: "access_force_cleanup_orphaned",
      resultContract: orphanCleanupResultContract,
      description: `List orphaned headless MSACCESS processes and pwsh.exe worker processes holding the project's accessPath, or kill exactly one only when confirmPid is explicitly provided. Listing is read-only; confirmPid is write-gated, returns MCP_WRITES_DISABLED when writes are off, and still refuses non-headless, wrong-path, or Dysflow-owned processes. ${MCP_TOOL_CONTRACTS.access_force_cleanup_orphaned.summary}`,
      inputSchema: ORPHAN_CLEANUP_SCHEMA,
      handler: async (input) =>
        handleMcpAccessOrphanCleanup(
          input,
          ORPHAN_CLEANUP_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          async (validatedInput) => {
            const request = validatedInput as { confirmPid?: number };
            const context = await accessContextResolver(validatedInput);
            if (!context.ok) return translateCoreResultToMcpContent(context);
            if (request.confirmPid === undefined) return context.data;
            return {
              ...context.data,
              confirmPid: request.confirmPid,
            };
          },
        ),
    },
    // Round-12 (#976) — `clean_stale_markers`. User-callable companion
    // to the #967 auto-cleanup. Same write-class as `access_force_cleanup_orphaned`
    // (conditional-write, dry-run safe by default, apply requires
    // `confirm: true`). Does NOT participate in `MCP_TOOL_ROUTES` /
    // dispatch-factory because the cleanup itself is filesystem-local
    // and the access context is resolved directly via the resolver.
    {
      name: "clean_stale_markers",
      resultContract: cleanStaleMarkersResultContract,
      description: `Sweep <projectRoot>/.dysflow/runtime/markers/ and either plan or apply transitions of stale \`status: "running"\` markers (and, when keepFailed is false, stale \`status: "failed"\` markers) to \`status: "abandoned"\`. Dry-run is the default; any apply call requires \`options.confirm: true\` and is write-gated (returns MCP_WRITES_DISABLED when writes are off). ${MCP_TOOL_CONTRACTS.clean_stale_markers.summary}`,
      inputSchema: CLEAN_STALE_MARKERS_SCHEMA,
      handler: async (input) =>
        handleMcpCleanStaleMarkers(
          input,
          CLEAN_STALE_MARKERS_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          accessContextResolver,
        ),
    },
    // PR-1 (issue #656) — gate-introspection read-only tool. Returns the
    // aggregated `McpCapabilitySnapshot` for the live MCP adapter. The tool
    // is registered in `MODERN_TOOL_NAMES` above and surfaces its contract
    // summary through `MCP_TOOL_CONTRACTS.get_capabilities` (added in
    // `mcp-tool-contracts.ts`). It is intentionally read-only — it never
    // touches Access, never spawns PowerShell, and is never write-gated.
    createGetCapabilitiesTool({
      writesEnabled,
      writeAccessResolver,
      allowedProcedures,
      projectId,
      allowWrites: writesAllowedForCapabilities,
      accessDbPath,
      writeExecutionPolicy,
      resultValidationPolicy,
      projectConfigResolver:
        projectConfigResolver === undefined ? undefined : () => projectConfigResolver({}),
      // Issue #940 — forward the documentation bundle resolver so the
      // snapshot reports the live on-disk verdict for the runtime docs.
      documentationBundleResolver,
    }),
    ...createModernAnalysisTools({
      services,
      allowedProcedures,
      accessContextResolver,
      lintRulesOverride,
      lintIdentifierSafetyStrict,
    }),
    // Round-3 Item 1 — project config re-resolution companion tool
    createResolveProjectTool({ cwd }),
    // Issue #971 — runtime contract discovery. Read-only tool that
    // surfaces the documented schema for every advertised MCP tool. Pure
    // catalog: never opens Access, never spawns PowerShell, never mutates
    // state. Pairs with get_capabilities (live state) and resolve_project
    // (project resolution).
    createSchemaTool(),
    // Issue #1057 (F5) — single-tool introspection sibling of `schema`.
    createDescribeToolTool(),
    // Issue #965 — `dysflow.diagnose` aggregates projectConfig + filesystem
    // + runtime health in a single call, replacing the 4-5 round-trip
    // pattern AI consumers hit today. Read-only by construction: never
    // opens Access, never spawns PowerShell, never writes to disk. The
    // snapshot is captured from the same options the `get_capabilities`
    // tool consults, so `runtime.dysflowVersion` and
    // `runtime.writeExecutionPolicy` agree by construction.
    createDiagnoseTool({
      cwd,
      snapshot: {
        adapterVersion: readAdapterVersion(),
        writeExecutionPolicy: writeExecutionPolicy ?? "safe-by-default",
      },
    }),
    // Issue #978 — runtime operational state. Read-only tool that
    // surfaces `{ operations, markers, locks, counters }` aggregated
    // over the access operation registry + `.dysflow/runtime/markers/`.
    // Never opens Access, never spawns PowerShell, never mutates state.
    // Pairs with `diagnose` (health), `logs` (event timeline),
    // `resolve_project` (config).
    createStateTool({
      cwd,
      registry: resolveAccessOperationRegistry(services.operationRegistry),
    }),
    // Issue #973 — AI-aware log access. Pure read-only surface over
    // <cwd>/.dysflow/runtime/. Reads operations.json + markers/*.json,
    // maps to LogEntry[], applies filters/ordering/pagination, and
    // returns { entries, totalCount, truncated }. Never opens Access,
    // never spawns PowerShell, never mutates state. Pairs with
    // get_capabilities (live state) and schema (static contract catalog).
    createLogsTool({ cwd }),
    // Issue #1177 — `migrate_project_config`. Drives legacy
    // `.dysflow/project.json` migrations (absolute accessPath →
    // basename frontendFile, top-level allowWrites →
    // capabilities.allowWrites). Default empty call is a pure
    // read-class diff preview; `apply: true` atomically rewrites the
    // file and is write-gated.
    createMigrateProjectConfigTool({ cwd, writesEnabled }),
  ];

  const registered = registerMcpTools(
    currentTools,
    services,
    writesEnabled,
    writeAccessResolver,
    env,
    allowedProcedures,
    // Issue #785 (v2.1.1) — forward the resolved write-execution policy
    // through to the dispatch factory. `writeExecutionPolicy` was already
    // destructured at the top of this function (line 505) for the
    // capabilities snapshot; this just widens the seam so the dispatch
    // tools also consult the same resolved value.
    writeExecutionPolicy,
    // Issue #785 (v2.1.1, capa 4) — forward the MCP access-context resolver
    // (already constructed above) so the export-source guard can read the
    // project's active source root before forwarding to vbaSyncToolService.
    accessContextResolver,
  );
  if (projectConfigResolver === undefined) return registered;
  return registered.map((tool) => {
    const contract = MCP_TOOL_CONTRACTS[tool.name as keyof typeof MCP_TOOL_CONTRACTS];
    if (contract === undefined || contract.access === "read-only") return tool;
    // Issue #968 — read `mutatesBinary` from the dispatch route table once
    // per tool so `projectConfigResolver → diagnoseProjectConfig` can decide
    // whether the caller's `allowExternalAccessPath` opt-in should bypass
    // the `OUTSIDE_PROJECT_ROOT` verdict for read-only-side tools. The route
    // table remains the single source of truth — adding a new tool is a
    // single entry.
    const route = MCP_TOOL_ROUTES[tool.name as keyof typeof MCP_TOOL_ROUTES];
    const routeMutatesBinary = route?.kind === "vba-sync" ? route.mutatesBinary : undefined;
    return {
      ...tool,
      handler: async (input, context) => {
        // Issue #977 — dryRunWithPreflight intercept. Mutually exclusive
        // with `dryRun` (set when both flags present → MCP_INPUT_INVALID)
        // and applied BEFORE the standard requestRequiresWriteReady path.
        // When preflight is requested, we run the same pre-flight gates as
        // apply:true WITHOUT performing the write, regardless of whether
        // the caller also passed `apply:true`. The preflight return shape:
        //   - failed: projectConfigNotWriteReady (same errorCode path as
        //     apply:true would have).
        //   - succeeded: {ok:true, preflight:{passed:true, checks:[...]},
        //     dryRun:true} WITHOUT invoking the underlying handler.
        const inputRecord =
          typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
        const dryRunWithPreflightRequested = inputRecord.dryRunWithPreflight === true;
        if (dryRunWithPreflightRequested) {
          // Mutual exclusivity: dryRunWithPreflight + dryRun → MCP_INPUT_INVALID.
          // dryRunWithPreflight + apply is also mutually exclusive, BUT in
          // that case apply wins on the existing dispatch seam (per
          // #977 acceptance criterion "apply takes precedence on the
          // existing path" — keep that legacy behavior).
          if (inputRecord.dryRun === true) {
            return invalidInput(
              "dryRunWithPreflight is mutually exclusive with dryRun. Pass only one of the two.",
              "Pass dryRunWithPreflight:true to validate the project's readiness without writing, or dryRun:true to plan the write without preflight. They cannot be combined.",
              { rejectedFlag: "dryRunWithPreflight", toolName: tool.name },
            );
          }
          // apply:true + dryRunWithPreflight:true — apply wins, legacy behavior.
          // Forward to the underlying handler unchanged; the preflight
          // effectively becomes a no-op when apply is set.
          if (inputRecord.apply === true) return tool.handler(input, context);
          // Pure preflight — run the standard projectConfigResolver gate
          // even when this is normally a "dryRun-able" tool path. We must
          // NOT consult requestRequiresWriteReady with the original input
          // (it would resolve to false for a payload without apply/dryRun
          // and bypass the gate). Force the gate by appending
          // apply:true behind the scenes for the gate check, but never
          // forward that synthetic apply to the handler.
          const diagnostic = await projectConfigResolver({
            ...inputRecord,
            operation: tool.name,
            ...(routeMutatesBinary !== undefined ? { mutatesBinary: routeMutatesBinary } : {}),
          });
          if (!diagnostic.writeReady) return projectConfigNotWriteReady(tool.name, diagnostic);
          // Preflight passed — return the typed envelope WITHOUT
          // invoking the underlying handler. Preserve the standard
          // JSON-stringified `{ok:true, dryRun:true, preflight:{...}}`
          // shape so a regex / JSON consumer can branch on the prefix.
          const summary = {
            passed: true,
            tool: tool.name,
            operation: tool.name,
            projectId: typeof inputRecord.projectId === "string" ? inputRecord.projectId : null,
            checks: [
              {
                code: "WRITE_READY",
                severity: "info",
                message: `Project config is write-ready for ${tool.name}; apply:true is expected to succeed (modulo races).`,
                passed: true,
              },
              {
                code: "ACCESS_PATH_RESOLVED",
                severity: "info",
                message: `accessPath ${diagnostic.accessPath ?? "<unset>"} is resolved.`,
                passed: diagnostic.accessPath !== null,
                value: diagnostic.accessPath,
              },
              {
                code: "DESTINATION_ROOT_RESOLVED",
                severity: "info",
                message: `destinationRoot ${diagnostic.destinationRoot ?? "<unset>"} is resolved.`,
                passed: diagnostic.destinationRoot !== null,
                value: diagnostic.destinationRoot,
              },
              {
                code: "CAPABILITIES_ALLOW_WRITE",
                severity: "info",
                message: `Capabilities allow writes.`,
                passed: writesAllowedForCapabilities === true,
                value: { allowWrites: writesAllowedForCapabilities === true },
              },
              {
                code: "WRITE_EXECUTION_POLICY",
                severity: "info",
                message: `Effective write execution policy: ${writeExecutionPolicy ?? "safe-by-default"}.`,
                passed: true,
                value: { policy: writeExecutionPolicy ?? "safe-by-default" },
              },
            ],
          };
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  dryRun: true,
                  dryRunWithPreflight: true,
                  preflight: summary,
                }),
              },
            ],
            isError: false,
            ok: true,
          };
        }
        if (
          !(await requestRequiresWriteReady(
            tool.name,
            contract.access,
            input,
            writeExecutionPolicy,
          ))
        )
          return tool.handler(input, context);
        const diagnostic = await projectConfigResolver({
          ...inputRecord,
          operation: tool.name,
          // Issue #968 — forward `mutatesBinary` from the dispatch route so
          // the diagnostic honors `allowExternalAccessPath` for read-only-side
          // tools and ignores it for binary writers. See
          // `src/adapters/mcp/dispatch-routes.ts` for the source-of-truth.
          ...(routeMutatesBinary !== undefined ? { mutatesBinary: routeMutatesBinary } : {}),
        });
        if (!diagnostic.writeReady) return projectConfigNotWriteReady(tool.name, diagnostic);
        return tool.handler(input, context);
      },
    };
  });
}
