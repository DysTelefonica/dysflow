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
  invalidInput,
  isWriteAllowed,
  procedureNotAllowed,
  writesDisabled,
} from "./dispatch-common.js";
import type {
  DysflowMcpServices,
  McpToolResult,
  McpWriteAccessResolver,
} from "./result-translation.js";
import { translateCoreResultToMcpContent } from "./result-translation.js";
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
    // allowlist and a remediation hint pointing to dysflow_get_capabilities.
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
  if (validation !== undefined) return invalidInput(validation);

  const request = buildRequest(input);
  if (isMcpToolResult(request)) return request;

  const allowlistError = ensureProcedureAllowed(
    request.procedureName,
    allowedProcedures,
    request.dryRun,
  );
  if (allowlistError !== undefined) return allowlistError;

  return translateCoreResultToMcpContent(
    await services.vbaService.execute(request, context?.sendProgress),
  );
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
  if (validation !== undefined) return invalidInput(validation);

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
  if (validation !== undefined) return invalidInput(validation);
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
  if (validation !== undefined) return invalidInput(validation);
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
