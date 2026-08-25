import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDysflowError, failureResult } from "../../core/contracts/index.js";
import { buildQueryExecuteRequest } from "../../core/mapping/access-query-request-mapper.js";
import { resolveAccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import type { VbaModuleLintRule } from "../../core/services/vba-module-lint-service.js";
import type { ToolSurface } from "./agent-workflow-registry.js";
import { createBootstrapTool } from "./bootstrap-tool.js";
import {
  handleMcpAccessOrphanCleanup,
  handleMcpCleanStaleMarkers,
  handleMcpQueryExecute,
} from "./canonical-handlers.js";
import {
  cleanStaleMarkersResultContract,
  orphanCleanupResultContract,
} from "./contracts/bootstrap-result-contracts.js";
import { projectPublicResolvedConfig } from "./contracts/public-project-config.js";
import type { ResultValidationPolicy } from "./contracts/result-validation.js";
import { createDiagnoseTool } from "./diagnose-tool.js";
import { registerMcpTools } from "./dispatch.js";
import { MCP_TOOL_ROUTES } from "./dispatch-routes.js";
import { createGetCapabilitiesTool, readAdapterVersion } from "./get-capabilities-tool.js";
import { createLogsTool } from "./logs-tool.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import { createMigrateProjectConfigTool } from "./migrate-project-config-tool.js";
import { createModernAnalysisTools } from "./modern-analysis-tools.js";
import { withSharedOutputModes } from "./output-mode.js";
import { withPreferredToolWarnings } from "./preferred-tool-warning.js";
import {
  createProjectResolutionRecovery,
  PROJECT_RECOVERY_SCHEMA_BLOCK,
  type ProjectResolutionRecovery,
} from "./project-resolution-recovery.js";
import { createResolveProjectTool } from "./resolve-project-tool.js";
import { createDescribeToolTool, createSchemaTool } from "./schema-tool.js";
import { createSetupProjectTool } from "./setup-project-tool.js";
import { createStateTool } from "./state-tool.js";
import { createWorktreeCacheTools } from "./worktree-cache-tools.js";
import { withWorktreeCwdSchema } from "./worktree-cwd.js";

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

import {
  diagnoseProjectConfig,
  type ProjectConfigDiagnostic,
} from "../config/project-config-diagnostic.js";
import { WorktreeContextCache } from "../config/worktree-context-cache.js";
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
  McpToolResult,
  McpWriteAccessResolver,
} from "./result-translation.js";
import { translateCoreResultToMcpContent } from "./result-translation.js";
import {
  CLEAN_STALE_MARKERS_SCHEMA,
  DOCTOR_SCHEMA,
  ORPHAN_CLEANUP_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
} from "./schemas.js";
import type { McpToolContext } from "./types.js";
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
    cwd?: string,
  ) => ProjectConfigDiagnostic | Promise<ProjectConfigDiagnostic>;
  // Issue #940 — optional resolver for the runtime documentation bundle
  // status. When omitted, the snapshot reports fail-closed defaults. The
  // stdio entry point wires a resolver that probes the live install dir
  // for `references/error-codes.md` and `docs/diagnostics/hresult-guide.md`.
  documentationBundleResolver?: () => import("../../shared/install-docs.js").DocumentationBundleStatus;
  cwd?: string;
  worktreeCache?: WorktreeContextCache;
  // Issue #1492 — advertised tool surface (default "core"). The bootstrap
  // tool reports it; the stdio tools/list handler applies the matching filter.
  toolSurface?: ToolSurface;
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
    worktreeCache: worktreeCacheInput,
    toolSurface = "core" as ToolSurface,
  } = options;
  const rawProjectConfigResolver =
    projectConfigResolver ??
    ((input: unknown, effectiveCwd = cwd) =>
      diagnoseProjectConfig(
        effectiveCwd,
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {},
      ));
  const worktreeCache =
    worktreeCacheInput ??
    new WorktreeContextCache({
      resolveDiagnostic: (effectiveCwd, input) => rawProjectConfigResolver(input, effectiveCwd),
    });
  const onProjectConfigMutated = (projectRoot: string) => {
    worktreeCache.clear(projectRoot);
  };
  const resolveCachedProjectConfig = (input: unknown, cwdOverride?: string) => {
    const params =
      typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
    const explicitCwd =
      typeof params.cwd === "string" && params.cwd.trim().length > 0 ? params.cwd : undefined;
    const effectiveCwd = cwdOverride ?? explicitCwd ?? cwd;
    return worktreeCache.resolveDiagnostic(
      effectiveCwd,
      params,
      effectiveCwd === cwd ? "startup" : "cwd-param",
    );
  };
  const projectResolutionRecovery = createProjectResolutionRecovery({ env });
  const accessContextResolver: McpAccessContextResolver =
    accessContextResolverInput ??
    (async () =>
      failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_PATH_UNRESOLVED",
          "accessPath must be provided or .dysflow/project.json must declare one.",
        ),
      ));
  const resolveProjectConfig = async (input: unknown, cwdOverride?: string) => {
    const params =
      typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
    const diagnostic = await resolveCachedProjectConfig(params, cwdOverride);
    if (diagnostic.writeReady || !hasExplicitProjectTarget(params)) return diagnostic;

    // Issue #1324 — plan and apply must resolve through the same live project
    // context. The dynamic plan path already resolves explicit per-call
    // selectors through accessContextResolver. When the startup cwd has no
    // config, reuse that resolved worktree root for the write-ready diagnostic
    // instead of incorrectly failing against the MCP process cwd.
    const liveContext = await accessContextResolver(params);
    if (!liveContext.ok) return diagnostic;
    const projectRoot = liveContext.data.projectRoot;
    if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) return diagnostic;
    return await resolveCachedProjectConfig(params, projectRoot);
  };
  const writesAllowedForCapabilities = allowWrites ?? writesEnabled;
  const currentTools: DysflowMcpTool[] = [
    {
      name: "query_execute",
      resultContract: queryExecuteResultContract,
      description: `Execute Access SQL with explicit mode: "read" or mode: "write". Write mode honors dryRun/apply, is blocked by the MCP write gate when writes are disabled, and returns MCP_WRITES_DISABLED instead of mutating data. Table allow/deny policies are rejected because arbitrary Jet/ACE SQL is not completely parsed. ${MCP_TOOL_CONTRACTS.query_execute.summary}`,
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
      description: `List orphaned headless MSACCESS processes and pwsh.exe worker processes holding the project's accessPath, or kill exactly one selected by pid after confirmedRequiresConfirmation is accepted. Listing is read-only; cleanup is write-gated, returns MCP_WRITES_DISABLED when writes are off, and still refuses non-headless, wrong-path, or Dysflow-owned processes. ${MCP_TOOL_CONTRACTS.access_force_cleanup_orphaned.summary}`,
      inputSchema: ORPHAN_CLEANUP_SCHEMA,
      handler: async (input) =>
        handleMcpAccessOrphanCleanup(
          input,
          ORPHAN_CLEANUP_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          async (validatedInput) => {
            const request = validatedInput as { pid?: number | null };
            const context = await accessContextResolver(validatedInput);
            if (!context.ok) return translateCoreResultToMcpContent(context);
            if (request.pid == null) return context.data;
            return {
              ...context.data,
              confirmPid: request.pid,
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
      description: `Sweep <projectRoot>/.dysflow/runtime/markers/ and either plan or apply transitions of stale \`status: "running"\` markers (and, when keepFailed is false, stale \`status: "failed"\` markers) to \`status: "abandoned"\`. apply:false is the plan path; apply:true requires \`confirmedRequiresConfirmation: true\` and is write-gated. ${MCP_TOOL_CONTRACTS.clean_stale_markers.summary}`,
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
    // Issue #1484 — minimal first-call read-only bootstrap. It reuses the
    // capabilities snapshot pipeline but deliberately omits project
    // resolution and heavy per-tool metadata.
    createBootstrapTool({
      writesEnabled,
      writeAccessResolver,
      allowedProcedures: Array.isArray(allowedProcedures) ? allowedProcedures : undefined,
      projectId,
      allowWrites: writesAllowedForCapabilities,
      accessDbPath,
      writeExecutionPolicy,
      resultValidationPolicy,
      toolSurface,
    }),
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
      toolSurface,
      projectConfigResolver: resolveProjectConfig,
      worktreeCacheTelemetry: () => worktreeCache.telemetry(),
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
    createResolveProjectTool({
      cwd,
      recovery: projectResolutionRecovery,
      projectConfigResolver: (effectiveCwd, input) => resolveProjectConfig(input, effectiveCwd),
    }),
    // Issue #971 — runtime contract discovery. Read-only tool that
    // surfaces the documented schema for every advertised MCP tool. Pure
    // catalog: never opens Access, never spawns PowerShell, never mutates
    // state. Pairs with get_capabilities (live state) and resolve_project
    // (project resolution).
    createSchemaTool({ toolSurface }),
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
      orphanProvider:
        services.orphanCleanupService === undefined
          ? undefined
          : async (input) => {
              const context = await accessContextResolver(input);
              if (!context.ok) {
                throw new Error(`${context.error.code}: ${context.error.message}`);
              }
              const listing = await services.orphanCleanupService?.listOrphans(context.data);
              if (listing === undefined) {
                throw new Error("ORPHAN_CLEANUP_NOT_CONFIGURED");
              }
              if (!listing.ok) {
                throw new Error(`${listing.error.code}: ${listing.error.message}`);
              }
              return listing.data
                .filter((candidate) => candidate.kind === "access")
                .map((candidate) => ({
                  pid: candidate.pid,
                  ageSeconds: candidate.ageSeconds ?? null,
                }));
            },
    }),
    // Issue #973 — AI-aware log access. Pure read-only surface over
    // <cwd>/.dysflow/runtime/. Reads operations.json + markers/*.json,
    // maps to LogEntry[], applies filters/ordering/pagination, and
    // returns { entries, totalCount, truncated }. Never opens Access,
    // never spawns PowerShell, never mutates state. Pairs with
    // get_capabilities (live state) and schema (static contract catalog).
    createLogsTool({ cwd }),
    // Issue #1312 — bootstrap is intentionally registered before the
    // existing-config write-ready wrapper. The wrapper exempts this tool
    // below because requiring an existing config would deadlock bootstrap.
    createSetupProjectTool({
      cwd,
      writesEnabled,
      resolveExistingProjectId: async (projectRoot) => {
        const { context } = await worktreeCache.getContext(
          projectRoot,
          projectRoot === cwd ? "startup" : "cwd-param",
        );
        const configuredProjectId = context.projectConfig.projectId;
        return typeof configuredProjectId === "string" && configuredProjectId.trim().length > 0
          ? configuredProjectId
          : null;
      },
      onConfigMutated: onProjectConfigMutated,
    }),
    ...createWorktreeCacheTools(worktreeCache),
    // Issue #1177 — `migrate_project_config`. Drives legacy
    // `.dysflow/project.json` migrations (absolute accessPath →
    // basename frontendFile, top-level allowWrites →
    // capabilities.allowWrites). Default empty call is a pure
    // read-class diff preview; `apply: true` atomically rewrites the
    // file and is write-gated.
    createMigrateProjectConfigTool({
      cwd,
      writesEnabled,
      onConfigMutated: onProjectConfigMutated,
    }),
  ];

  const registered = withSharedOutputModes(
    registerMcpTools(
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
    ),
  ).map((tool) => ({
    ...tool,
    inputSchema: withWorktreeCwdSchema(
      tool.name,
      tool.inputSchema ?? { type: "object", additionalProperties: false, properties: {} },
    ),
  }));
  if (projectConfigResolver === undefined)
    return withProjectResolutionRecovery(
      withPreferredToolWarnings(registered, readAdapterVersion()),
      projectResolutionRecovery,
    );
  const gated = registered.map((tool) => {
    const contract = MCP_TOOL_CONTRACTS[tool.name as keyof typeof MCP_TOOL_CONTRACTS];
    if (contract === undefined || contract.access === "read-only") return tool;
    if (tool.name === "setup_project") return tool;
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
      handler: async (input: unknown, context?: McpToolContext): Promise<McpToolResult> => {
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
          const diagnostic = await resolveProjectConfig({
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
                type: "text" as const,
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
        const requiresWriteReady = await requestRequiresWriteReady(
          tool.name,
          contract.access,
          input,
          writeExecutionPolicy,
        );
        if (!requiresWriteReady) {
          // Issue #1324 — an explicit apply:false comparison call must use
          // the same resolver and typed missing-state envelope as apply:true.
          // Omitted apply keeps the established lightweight/degraded preview.
          if (inputRecord.apply !== false || !hasExplicitProjectTarget(inputRecord)) {
            return tool.handler(input, context);
          }
          const planDiagnostic = await resolveProjectConfig({
            ...inputRecord,
            operation: tool.name,
            ...(routeMutatesBinary !== undefined ? { mutatesBinary: routeMutatesBinary } : {}),
          });
          if (!planDiagnostic.writeReady) {
            return projectConfigNotWriteReady(tool.name, planDiagnostic);
          }
          return tool.handler(input, context);
        }
        const diagnostic = await resolveProjectConfig({
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
  return withProjectResolutionRecovery(
    withPreferredToolWarnings(gated, readAdapterVersion()),
    projectResolutionRecovery,
  );
}

const RECOVERY_ENABLED_READ_TOOLS = new Set([
  "migrate_project_config",
  "access_force_cleanup_orphaned",
]);

function hasExplicitProjectTarget(input: Record<string, unknown>): boolean {
  return [
    "projectId",
    "accessPath",
    "accessDbPath",
    "databasePath",
    "backendPath",
    "destinationRoot",
    "projectRoot",
  ].some((key) => typeof input[key] === "string" && (input[key] as string).trim().length > 0);
}

function withProjectResolutionRecovery(
  tools: readonly DysflowMcpTool[],
  recovery: ProjectResolutionRecovery,
): DysflowMcpTool[] {
  return tools.map((tool) => {
    const contract = MCP_TOOL_CONTRACTS[tool.name as keyof typeof MCP_TOOL_CONTRACTS];
    if (
      contract === undefined ||
      (contract.access === "read-only" && !RECOVERY_ENABLED_READ_TOOLS.has(tool.name))
    )
      return tool;
    return {
      ...tool,
      inputSchema: {
        type: "object",
        ...tool.inputSchema,
        additionalProperties: tool.inputSchema?.additionalProperties ?? false,
        properties: {
          ...(tool.inputSchema?.properties ?? {}),
          ...PROJECT_RECOVERY_SCHEMA_BLOCK,
        },
      },
      handler: async (input: unknown, context?: McpToolContext): Promise<McpToolResult> => {
        const record =
          typeof input === "object" && input !== null
            ? { ...(input as Record<string, unknown>) }
            : {};
        const hasChoiceReason = record.projectChoiceReason !== undefined;
        const hasToken = record.recoveryToken !== undefined;
        if (hasChoiceReason || hasToken) {
          if (tool.name === "setup_project") {
            const selected = recovery.consume({
              cwd: typeof record.cwd === "string" ? record.cwd : undefined,
              projectId: typeof record.projectId === "string" ? record.projectId : undefined,
              projectChoiceReason:
                typeof record.projectChoiceReason === "string"
                  ? record.projectChoiceReason
                  : undefined,
              recoveryToken:
                typeof record.recoveryToken === "string" ? record.recoveryToken : undefined,
            });
            if (!selected.ok) return projectRecoveryFailure(selected);
            recordRecoveryConsumption(
              context,
              selected.project.projectId,
              selected.project.projectRoot,
            );
            const configPath = join(selected.project.projectRoot, ".dysflow", "project.json");
            let resolvedConfig: Record<string, unknown>;
            try {
              resolvedConfig = JSON.parse(readFileSync(configPath, "utf8")) as Record<
                string,
                unknown
              >;
            } catch {
              return projectRecoveryFailure({
                code: "MCP_INPUT_INVALID",
                message: "The selected worktree no longer has a readable project config.",
                remediation:
                  "Call resolve_project again and consume a fresh recovery token after restoring the selected .dysflow/project.json.",
              });
            }
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    mode: "resolution",
                    dryRun: true,
                    cached: true,
                    projectId: selected.project.projectId,
                    resolvedProjectId: selected.project.projectId,
                    projectRoot: selected.project.projectRoot,
                    accessPath: selected.project.accessPath,
                    configPath,
                    resolvedConfig: projectPublicResolvedConfig(resolvedConfig),
                    nextAction:
                      "Call the intended write-class tool; setup_project did not modify the existing config.",
                  }),
                },
              ],
              isError: false,
              ok: true,
            };
          }
          const selected = recovery.consume({
            cwd: typeof record.cwd === "string" ? record.cwd : undefined,
            projectId: typeof record.projectId === "string" ? record.projectId : undefined,
            projectChoiceReason:
              typeof record.projectChoiceReason === "string"
                ? record.projectChoiceReason
                : undefined,
            recoveryToken:
              typeof record.recoveryToken === "string" ? record.recoveryToken : undefined,
          });
          if (!selected.ok) return projectRecoveryFailure(selected);
          recordRecoveryConsumption(
            context,
            selected.project.projectId,
            selected.project.projectRoot,
          );
          record.projectId = selected.project.projectId;
          record.cwd = selected.project.projectRoot;
        } else {
          const cached = recovery.getCached();
          if (
            cached !== null &&
            (record.projectId === undefined || record.projectId === cached.projectId)
          ) {
            record.projectId = cached.projectId;
            record.cwd = cached.projectRoot;
          }
        }
        delete record.projectChoiceReason;
        delete record.recoveryToken;
        return tool.handler(record, context);
      },
    };
  });
}

function recordRecoveryConsumption(
  context: McpToolContext | undefined,
  projectId: string,
  projectRoot: string,
): void {
  if (context === undefined) return;
  context.authenticatedTelemetryProjectRoot = projectRoot;
  context.auditEvents ??= [];
  context.auditEvents.push(`trio-consumed:${projectId}`);
}

function projectRecoveryFailure(failure: {
  code: "MCP_INPUT_INVALID" | "PROJECT_ID_COLLISION";
  message: string;
  remediation: string;
}) {
  const error = {
    code: failure.code,
    message: failure.message,
    errorCode: failure.code,
    errorMessage: failure.message,
    remediation: failure.remediation,
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error }) }],
    isError: true,
    ok: false,
    error,
  };
}
