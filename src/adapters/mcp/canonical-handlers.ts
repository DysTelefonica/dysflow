import { join } from "node:path";
import type { AccessQueryRequest, AccessVbaRequest } from "../../core/contracts/index.js";
import { successResult } from "../../core/contracts/index.js";
import type { AccessOperationListEntry } from "../../core/operations/access-operation-registry.js";
import {
  type AccessOperationRegistryHealth,
  listRecentAccessOperations,
  resolveAccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";
import {
  allowlistNotConfigured,
  enrichmentForValidationMessage,
  invalidInput,
  isWriteAllowed,
  procedureNotAllowed,
  writesDisabled,
} from "./dispatch-common.js";
import type {
  DysflowMcpServices,
  McpAccessContextResolver,
  McpToolResult,
  McpWriteAccessResolver,
} from "./result-translation.js";
import {
  extractAccessPathFromInput,
  translateCoreResultToMcpContent,
  withHumanCompileReminder,
} from "./result-translation.js";
import type { JsonObjectSchema } from "./schemas.js";
import type { McpToolContext } from "./types.js";
import { validateInput } from "./validator.js";

type RequestBuildResult<TRequest> = TRequest | McpToolResult;

function isMcpToolResult(value: unknown): value is McpToolResult {
  return typeof value === "object" && value !== null && "content" in value && "isError" in value;
}

/**
 * PR1a (#621 F1) — default-deny gate for compiled VBA execution at the MCP
 * adapter boundary. Refuses to call `services.vbaService.execute(...)` unless
 * EITHER (a) the project config declares a non-empty `allowedProcedures` AND
 * `procedureName` is in that list, OR (b) the caller explicitly passes
 * `dryRun: true`. The dry-run escape hatch is the consumer's explicit "plan
 * only" affirmation; without an allowlist it is the only path that survives.
 *
 * Exported so it can be unit-tested directly via
 * `test/adapters/mcp/canonical-handlers.test.ts` without a full MCP server
 * fixture.
 */
export function ensureProcedureAllowed(
  procedureName: string,
  allowedProcedures: readonly string[] | undefined,
  dryRun: boolean | undefined,
): McpToolResult | undefined {
  // PR1a #621: default-deny gate. When the project config has no allowlist
  // configured (undefined OR empty), execution MUST be rejected unless the
  // caller explicitly passes `dryRun: true`. This closes the contract-truth
  // gap where "read-only" tools could in fact run arbitrary compiled VBA.
  if (allowedProcedures === undefined || allowedProcedures.length === 0) {
    if (dryRun !== true) {
      // #757 (F6) — split out of the generic MCP_INPUT_INVALID so consumers can
      // tell "no allowlist configured" (a config fix) apart from a schema error.
      return allowlistNotConfigured(procedureName);
    }
    return undefined;
  }

  if (!allowedProcedures.includes(procedureName)) {
    // #659 — emit the new MCP_PROCEDURE_NOT_ALLOWED envelope so consumers can
    // distinguish "procedure is not in the allowlist" from generic
    // MCP_INPUT_INVALID. The structured error block carries the active
    // allowlist and a remediation hint pointing to get_capabilities.
    return procedureNotAllowed(procedureName, allowedProcedures);
  }
  return undefined;
}

export async function handleMcpVbaExecute(
  input: unknown,
  schema: JsonObjectSchema,
  services: DysflowMcpServices,
  allowedProcedures: readonly string[] | undefined,
  buildRequest: (input: unknown) => RequestBuildResult<AccessVbaRequest>,
  context?: McpToolContext,
): Promise<McpToolResult> {
  const validation = validateInput(input, schema);
  if (validation !== undefined) {
    // Issue #1078 — uniform `MCP_INPUT_INVALID` envelope across every
    // dispatch entry point. Use the shared helper so the apply/dryRun
    // contradiction and the legacy `<flag> is not allowed.` shape both
    // produce the structured rejection.
    const enrichment = enrichmentForValidationMessage(validation, "run_vba");
    if (enrichment !== undefined) return invalidInput(validation, undefined, enrichment);
    return invalidInput(validation);
  }

  const request = buildRequest(input);
  if (isMcpToolResult(request)) return request;

  const allowlistError = ensureProcedureAllowed(
    request.procedureName,
    allowedProcedures,
    request.dryRun,
  );
  if (allowlistError !== undefined) return allowlistError;

  const coreResult = await services.vbaService.execute(request, context?.sendProgress);
  const mcpResult = translateCoreResultToMcpContent(coreResult);
  // PR-1 (issue #762, v1.20.0) — surface the human-compile reminder on
  // `run_vba` (and was previously surfaced on `dysflow_vba_execute` — that
  // legacy name was removed under #777 Opción A cont.). The access path is
  // sourced from the request that the schema-validated input produced.
  return withHumanCompileReminder(mcpResult, {
    toolName: "run_vba",
    accessPath: extractAccessPathFromInput(request) ?? "",
  });
}

export async function handleMcpQueryExecute(
  input: unknown,
  schema: JsonObjectSchema,
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  buildRequest: (input: unknown) => AccessQueryRequest,
  context?: McpToolContext,
): Promise<McpToolResult> {
  const validation = validateInput(input, schema);
  if (validation !== undefined) {
    // Issue #1078 — uniform `MCP_INPUT_INVALID` envelope across every
    // dispatch entry point. The tool name (`query_execute`) is what the
    // structured enrichment binds to the registry's commit-flag metadata.
    const enrichment = enrichmentForValidationMessage(validation, "query_execute");
    if (enrichment !== undefined) return invalidInput(validation, undefined, enrichment);
    return invalidInput(validation);
  }

  const request = buildRequest(input);
  if (
    request.mode === "write" &&
    request.dryRun !== true &&
    !(await isWriteAllowed(request, writesEnabled, writeAccessResolver))
  ) {
    return writesDisabled();
  }

  return translateCoreResultToMcpContent(
    await services.queryService.execute(request, context?.sendProgress),
  );
}

export async function handleMcpAccessOperationsList(
  services: DysflowMcpServices,
): Promise<McpToolResult> {
  const registry = resolveAccessOperationRegistry(services.operationRegistry);
  // DELTA-001 (#575): include `registryHealth` alongside the list so callers
  // can distinguish "no operations" from "registry was corrupt and is now empty by design".
  const operations = await listRecentAccessOperations(registry);
  return translateCoreResultToMcpContent(
    successResult<{
      operations: readonly AccessOperationListEntry[];
      registryHealth: AccessOperationRegistryHealth;
    }>({
      operations,
      registryHealth: registry.getHealth(),
    }),
  );
}

export async function handleMcpAccessCleanup(
  input: unknown,
  schema: JsonObjectSchema,
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  buildRequest: (
    input: unknown,
  ) => RequestBuildResult<{ operationId: string; accessPath: string; force?: boolean }>,
): Promise<McpToolResult> {
  const validation = validateInput(input, schema);
  if (validation !== undefined) {
    // Issue #1078 — uniform `MCP_INPUT_INVALID` envelope.
    const enrichment = enrichmentForValidationMessage(validation, "cleanup_access_operation");
    if (enrichment !== undefined) return invalidInput(validation, undefined, enrichment);
    return invalidInput(validation);
  }
  if (services.cleanupService === undefined) {
    return {
      content: [
        {
          type: "text",
          text: "CLEANUP_NOT_CONFIGURED: Access cleanup service is not configured.",
        },
      ],
      isError: true,
      ok: false,
    };
  }
  const request = buildRequest(input);
  if (isMcpToolResult(request)) return request;
  // `force: true` escalates cleanup to a destructive operation (it retires operations with an
  // unknown/null PID and bypasses the eligible-status guard to kill processes). Gate that
  // escalation behind the MCP write-gate. The non-force path stays open as a safe recovery route.
  if (
    request.force === true &&
    !(await isWriteAllowed(input, writesEnabled, writeAccessResolver))
  ) {
    return writesDisabled();
  }
  const cleanupResult = await services.cleanupService.cleanup(request);
  // DELTA-001 (#575): on success, include `registryHealth` so the caller can
  // see whether the registry itself was in a degraded state when the cleanup
  // ran. Failure envelopes keep their existing shape (`error.code` is the
  // contract; downstream parsers depend on it).
  if (cleanupResult.ok) {
    const registry = resolveAccessOperationRegistry(services.operationRegistry);
    return translateCoreResultToMcpContent(
      successResult<{
        cleanup: typeof cleanupResult.data;
        registryHealth: AccessOperationRegistryHealth;
      }>({
        cleanup: cleanupResult.data,
        registryHealth: registry.getHealth(),
      }),
    );
  }
  return translateCoreResultToMcpContent(cleanupResult);
}

export async function handleMcpAccessOrphanCleanup(
  input: unknown,
  schema: JsonObjectSchema,
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  buildRequest: (
    input: unknown,
  ) =>
    | Promise<{ accessPath: string; projectRoot: string; confirmPid?: number } | McpToolResult>
    | { accessPath: string; projectRoot: string; confirmPid?: number }
    | McpToolResult,
): Promise<McpToolResult> {
  const validation = validateInput(input, schema);
  if (validation !== undefined) {
    // Issue #1078 — uniform `MCP_INPUT_INVALID` envelope.
    const enrichment = enrichmentForValidationMessage(validation, "access_force_cleanup_orphaned");
    if (enrichment !== undefined) return invalidInput(validation, undefined, enrichment);
    return invalidInput(validation);
  }
  if (services.orphanCleanupService === undefined) {
    return {
      content: [
        {
          type: "text",
          text: "ORPHAN_CLEANUP_NOT_CONFIGURED: Access orphan cleanup service is not configured.",
        },
      ],
      isError: true,
      ok: false,
    };
  }

  const request = await buildRequest(input);
  if (isMcpToolResult(request)) return request;

  if (request.confirmPid === undefined) {
    return translateCoreResultToMcpContent(
      await services.orphanCleanupService.listOrphans(request),
    );
  }

  if (!(await isWriteAllowed(input, writesEnabled, writeAccessResolver))) {
    return writesDisabled();
  }

  return translateCoreResultToMcpContent(
    await services.orphanCleanupService.cleanupOrphan({
      accessPath: request.accessPath,
      projectRoot: request.projectRoot,
      confirmPid: request.confirmPid,
    }),
  );
}

/**
 * Round-12 (#976) — `dysflow.clean_stale_markers` MCP handler.
 *
 * User-callable companion to the #967 auto-cleanup. The handler is
 * the contract surface for the four guardrails the spec promises:
 *
 *   1. **`dryRun` defaults to `true`** — the tool never writes without
 *      the caller asking.
 *   2. **`olderThanMinutes` defaults to 30** — mirrors the #967 default.
 *   3. **`keepFailed` defaults to `true`** — preserves diagnostic value.
 *   4. **`confirm: true` is REQUIRED for `dryRun: false`** — refused with
 *      `MCP_INPUT_INVALID` BEFORE any service call so a missed confirm
 *      never reaches the filesystem.
 *
 * The handler resolves the project root via the `McpAccessContextResolver`
 * the same way every other write-class tool does; the markers directory
 * is computed as `<projectRoot>/.dysflow/runtime/markers` (the canonical
 * location for #967 markers). The service does the actual sweep.
 */
export async function handleMcpCleanStaleMarkers(
  input: unknown,
  schema: JsonObjectSchema,
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  accessContextResolver: McpAccessContextResolver,
): Promise<McpToolResult> {
  const validation = validateInput(input, schema);
  if (validation !== undefined) {
    // Issue #1078 — uniform `MCP_INPUT_INVALID` envelope.
    const enrichment = enrichmentForValidationMessage(validation, "clean_stale_markers");
    if (enrichment !== undefined) return invalidInput(validation, undefined, enrichment);
    return invalidInput(validation);
  }

  if (services.cleanStaleMarkersService === undefined) {
    return {
      content: [
        {
          type: "text",
          text: "CLEAN_STALE_MARKERS_NOT_CONFIGURED: clean_stale_markers service is not configured.",
        },
      ],
      isError: true,
      ok: false,
    };
  }

  const options = (
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>).options
      : undefined
  ) as
    | {
        olderThanMinutes?: number;
        dryRun?: boolean;
        keepFailed?: boolean;
        confirm?: boolean;
      }
    | undefined;

  const dryRun = options?.dryRun ?? true;
  const keepFailed = options?.keepFailed ?? true;
  const olderThanMinutes =
    typeof options?.olderThanMinutes === "number" && options.olderThanMinutes > 0
      ? options.olderThanMinutes
      : 30;

  // Confirm gate — refuse any non-dry-run call without literal confirm:true.
  if (dryRun === false && options?.confirm !== true) {
    return invalidInput(
      "clean_stale_markers requires options.confirm === true whenever options.dryRun === false. Re-run with dryRun omitted (default true) to plan without writing, or pass { dryRun: false, confirm: true } to apply.",
      "Pass { dryRun: true } (or omit dryRun) to plan, or pass { dryRun: false, confirm: true } to apply.",
    );
  }

  // Resolve the project root so we can locate the markers directory. The
  // access-context resolver is the same seam every other MCP write tool
  // uses, so an empty markersRoot fallback to `<cwd>/.dysflow/runtime/markers`
  // is consistent with the rest of the surface.
  const context = await accessContextResolver(input);
  if (!context.ok) return translateCoreResultToMcpContent(context);
  const markersRoot = join(context.data.projectRoot, ".dysflow", "runtime", "markers");

  // Non-dry-run still goes through the write-gate: a dry-run by definition
  // does not mutate, so it skips the gate; an apply with confirm does
  // mutate and is gated like any other write-class tool.
  if (dryRun === false) {
    if (!(await isWriteAllowed(input, writesEnabled, writeAccessResolver))) {
      return writesDisabled("clean_stale_markers");
    }
  }

  const result = await services.cleanStaleMarkersService.run({
    markersRoot,
    olderThanMs: olderThanMinutes * 60 * 1000,
    keepFailed,
    dryRun,
  });

  return translateCoreResultToMcpContent(successResult(result));
}
