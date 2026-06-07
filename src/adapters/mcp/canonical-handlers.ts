import type { AccessQueryRequest, AccessVbaRequest } from "../../core/contracts/index.js";
import { successResult } from "../../core/contracts/index.js";
import type { AccessOperationRecord } from "../../core/operations/access-operation-registry.js";
import { InMemoryAccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import { invalidInput, isWriteAllowed, writesDisabled } from "./dispatch-common.js";
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

function ensureProcedureAllowed(
  procedureName: string,
  allowedProcedures: readonly string[] | undefined,
): McpToolResult | undefined {
  if (
    allowedProcedures !== undefined &&
    allowedProcedures.length > 0 &&
    !allowedProcedures.includes(procedureName)
  ) {
    return invalidInput(
      `Procedure '${procedureName}' is not in the configured allowedProcedures list.`,
    );
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

  const allowlistError = ensureProcedureAllowed(request.procedureName, allowedProcedures);
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
  const registry = services.operationRegistry ?? new InMemoryAccessOperationRegistry();
  return translateCoreResultToMcpContent(
    successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })),
  );
}

export async function handleMcpAccessCleanup(
  input: unknown,
  schema: JsonObjectSchema,
  services: DysflowMcpServices,
  buildRequest: (input: unknown) => { operationId: string; accessPath: string; force?: boolean },
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
    };
  }
  return translateCoreResultToMcpContent(
    await services.cleanupService.cleanup(buildRequest(input)),
  );
}
