import type {
  AccessQueryRequest,
  AccessVbaRequest,
  OperationResult,
  VbaSyncPort,
} from "../../core/contracts/index.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import type { AccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import type {
  AccessOrphanCandidate,
  AccessOrphanCleanupResult,
} from "../../core/operations/access-orphan-cleanup.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";
import { sanitizeMcpErrorMessage } from "../../core/utils/sanitize-error.js";
import type { JsonObjectSchema } from "./schemas.js";
import type { McpToolContext } from "./types.js";

// Re-export sanitizeMcpErrorMessage so the adapter layer can import it from here.
export { sanitizeMcpErrorMessage } from "../../core/utils/sanitize-error.js";

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpToolError = {
  code: string;
  message: string;
  /**
   * Optional remediation hint surfaced on gate-rejection envelopes (#659).
   * When present, the hint names the next action a consumer should take
   * (e.g. "call dysflow_get_capabilities to introspect the allowlist").
   */
  remediation?: string;
  /**
   * Optional allowlist surfaced when the rejection is an allowlist
   * membership check (#659). Equals the array that was active at the time
   * of the call — verbatim, NOT a snapshot — so a consumer can branch on
   * its contents without a second round-trip to `dysflow_get_capabilities`.
   */
  allowedProcedures?: readonly string[];
};

export type McpToolResult = {
  content: readonly McpTextContent[];
  isError: boolean;
  /**
   * Mirror of `!isError` exposed for contract-style consumers (#616 slice 3).
   * Optional for backward compatibility with literal `{ content, isError }`
   * construction sites across the test suite; new dispatch surfaces populate it
   * explicitly. When omitted, treat `ok = !isError`.
   */
  ok?: boolean;
  /**
   * Structured error envelope (#659). Populated by gate-rejection helpers
   * (e.g. `procedureNotAllowed`) so consumers can branch on `error.code`
   * instead of regex-matching the legacy `content[0].text` body. The
   * `content[0].text` body still carries the same `<CODE>: <message>`
   * prefix for backward compatibility with regex consumers.
   */
  error?: McpToolError;
};

export type DysflowMcpTool = {
  name: string;
  description: string;
  inputSchema?: JsonObjectSchema;
  /**
   * When true, this tool is excluded from the tools/list MCP projection while its
   * handler stays callable via tools/call. Per the zero-hidden-tools policy (#510),
   * no registered tool currently sets this; it is retained only as the mechanism a
   * future pending/stub tool would use, derived from the parity registry (#433).
   */
  hidden?: boolean;
  handler(input: unknown, context?: McpToolContext): Promise<McpToolResult>;
};

export type DysflowMcpServices = {
  vbaService: {
    execute(
      request: AccessVbaRequest,
      onProgress?: (percent: number, total?: number, message?: string) => void,
    ): Promise<OperationResult<AccessVbaResult>>;
  };
  queryService: {
    execute(
      request: AccessQueryRequest,
      onProgress?: (percent: number, total?: number, message?: string) => void,
    ): Promise<OperationResult<AccessQueryResult>>;
  };
  diagnosticsService: {
    run(request?: AccessDiagnosticsRequest): Promise<OperationResult<AccessDiagnosticsResult>>;
  };
  /** Optional registry override. When omitted, MCP operation-list tools intentionally use Dysflow's default process-local registry. */
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: {
    cleanup(request: {
      operationId: string;
      accessPath: string;
      force?: boolean;
    }): Promise<OperationResult<AccessCleanupResult>>;
  };
  orphanCleanupService?: {
    listOrphans(request: {
      accessPath?: string;
      projectRoot?: string;
    }): Promise<OperationResult<AccessOrphanCandidate[]>>;
    cleanupOrphan(request: {
      accessPath: string;
      projectRoot: string;
      confirmPid: number;
    }): Promise<OperationResult<AccessOrphanCleanupResult>>;
  };
  /** Injected adapter for VBA sync tool dispatch. See VbaSyncPort in core/contracts. */
  vbaSyncToolService?: VbaSyncPort;
};

export type McpWriteAccessResolver = (input: unknown) => Promise<boolean>;

export type McpAccessContext = {
  accessPath: string;
  projectRoot: string;
  destinationRoot?: string;
};

export type McpAccessContextResolver = (
  input: unknown,
) => Promise<OperationResult<McpAccessContext>>;

export function translateCoreResultToMcpContent<TData>(
  result: OperationResult<TData>,
  secrets?: readonly string[],
): McpToolResult {
  if (!result.ok) {
    return {
      content: [
        {
          type: "text",
          text: `${result.error.code}: ${sanitizeMcpErrorMessage(result.error.message, secrets)}`,
        },
      ],
      isError: true,
      ok: false,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result.data) }],
    isError: false,
    ok: true,
  };
}

/**
 * Builds the explicit secret list for a maintenance error sink, mirroring the
 * HTTP adapter which filters non-empty secret values before sanitizeSecrets.
 * Returns undefined when no secret is in scope so the sink falls back to the
 * heuristic-only path.
 */
export function resolveInScopeSecrets(
  ...values: readonly (string | undefined)[]
): string[] | undefined {
  const secrets = values.filter((v): v is string => typeof v === "string" && v.length > 0);
  return secrets.length > 0 ? secrets : undefined;
}
