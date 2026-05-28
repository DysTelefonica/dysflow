import type {
  AccessQueryRequest,
  AccessVbaRequest,
  OperationResult,
} from "../../core/contracts/index.js";
import { successResult } from "../../core/contracts/index.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import type {
  AccessOperationRecord,
  AccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import { getDefaultAccessOperationRegistry } from "../../core/runner/access-runner.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";
import { isRecord } from "../../core/utils/index.js";
import {
  CLEANUP_SCHEMA,
  DOCTOR_SCHEMA,
  type JsonObjectSchema,
  NO_INPUT_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
  VBA_EXECUTE_SCHEMA,
} from "./schemas.js";
import type { McpToolContext } from "./types.js";
import { validateInput } from "./validator.js";

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: readonly McpTextContent[];
  isError: boolean;
};

export type DysflowMcpTool = {
  name: string;
  description: string;
  inputSchema?: JsonObjectSchema;
  /**
   * When true, this tool is excluded from the tools/list MCP projection.
   * The handler remains callable via tools/call for backwards compatibility.
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
};

export type McpWriteAccessResolver = (input: unknown) => Promise<boolean>;

function writesDisabled(): McpToolResult {
  return {
    content: [
      { type: "text", text: "MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter." },
    ],
    isError: true,
  };
}

function invalidInput(message: string): McpToolResult {
  return { content: [{ type: "text", text: `MCP_INPUT_INVALID: ${message}` }], isError: true };
}

const WRITE_SQL_PATTERN =
  /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|EXEC(?:UTE)?|GRANT|REVOKE)\b/i;

export function rejectWriteSqlInReadMode(sql: string): string | undefined {
  if (!WRITE_SQL_PATTERN.test(sql)) return undefined;
  const keyword = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  return `${keyword} statements are not allowed in read-only queries. Use exec_sql or dysflow_query_execute with mode "write" for write operations.`;
}

/**
 * Canonical modern Dysflow MCP tool names.
 * These names use underscore separators and are the authoritative source of truth
 * for the five modern tool identifiers advertised via tools/list.
 * Exported for contract testing and regression guards.
 */
export const MODERN_TOOL_NAMES = [
  "dysflow_vba_execute",
  "dysflow_query_execute",
  "dysflow_doctor",
  "dysflow_access_operations_list",
  "dysflow_access_cleanup",
] as const;

export type ModernDysflowMcpToolName = (typeof MODERN_TOOL_NAMES)[number];

export function createDysflowMcpTools(
  services: DysflowMcpServices,
  writesEnabled = false,
  writeAccessResolver?: McpWriteAccessResolver,
  _env: Record<string, string | undefined> = process.env,
  allowedProcedures?: readonly string[],
): DysflowMcpTool[] {
  return [
    {
      name: "dysflow_vba_execute",
      description: "Execute a VBA procedure through Dysflow core services.",
      inputSchema: VBA_EXECUTE_SCHEMA,
      handler: async (input, context) => {
        const validation = validateInput(input, VBA_EXECUTE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as AccessVbaRequest;
        if (
          allowedProcedures !== undefined &&
          allowedProcedures.length > 0 &&
          !allowedProcedures.includes(request.procedureName)
        ) {
          return invalidInput(
            `Procedure '${request.procedureName}' is not in the configured allowedProcedures list.`,
          );
        }
        return translateCoreResultToMcpContent(
          await services.vbaService.execute(request, context?.sendProgress),
        );
      },
    },
    {
      name: "dysflow_query_execute",
      description: "Execute a query action through Dysflow core services.",
      inputSchema: QUERY_EXECUTE_SCHEMA,
      handler: async (input, context) => {
        const validation = validateInput(input, QUERY_EXECUTE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as AccessQueryRequest;
        if (request.mode === "read") {
          const sqlGuard = rejectWriteSqlInReadMode(request.sql);
          if (sqlGuard !== undefined) return invalidInput(sqlGuard);
        }
        if (
          request.mode === "write" &&
          !(await isWriteAllowed(request, writesEnabled, writeAccessResolver))
        ) {
          return writesDisabled();
        }
        return translateCoreResultToMcpContent(
          await services.queryService.execute(request, context?.sendProgress),
        );
      },
    },
    {
      name: "dysflow_doctor",
      description: "Run core diagnostic checks through Dysflow services.",
      inputSchema: DOCTOR_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, DOCTOR_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as AccessDiagnosticsRequest;
        return translateCoreResultToMcpContent(await services.diagnosticsService.run(request));
      },
    },
    {
      name: "dysflow_access_operations_list",
      description: "List recent Dysflow Access operation records.",
      inputSchema: NO_INPUT_SCHEMA,
      handler: async () => {
        const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
        return translateCoreResultToMcpContent(
          successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })),
        );
      },
    },
    {
      name: "dysflow_access_cleanup",
      description: "Clean up resources associated with a recent Access operation.",
      inputSchema: CLEANUP_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, CLEANUP_SCHEMA);
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
          await services.cleanupService.cleanup(
            input as { operationId: string; accessPath: string; force?: boolean },
          ),
        );
      },
    },
  ];
}

async function isWriteAllowed(
  input: unknown,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
): Promise<boolean> {
  if (writesEnabled) return true;
  if (writeAccessResolver === undefined) return false;
  return await writeAccessResolver(input);
}

export function translateCoreResultToMcpContent<TData>(
  result: OperationResult<TData>,
): McpToolResult {
  if (!result.ok) {
    return {
      content: [
        {
          type: "text",
          text: `${result.error.code}: ${sanitizeMcpErrorMessage(result.error.message)}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result.data) }],
    isError: false,
  };
}

export function sanitizeMcpErrorMessage(message: string): string {
  // Each alternative is applied sequentially to avoid nested unbounded quantifiers
  // in a single combined pattern (defense against catastrophic backtracking).
  // UNC paths: \\server\share[\subdir...][\ ]
  let result = message.replace(
    /\\\\[^\\\s"'<>|:*?]+\\[^\\\s"'<>|:*?]+(?:\\[^\\\s"'<>|:*?]+)*\\?/g,
    "[PATH]",
  );
  // Windows paths with database extension: C:\...\file.accdb
  result = result.replace(/[A-Za-z]:\\[^:\r\n]*?\.(?:accdb|mdb|accde|mde|laccdb)\b/gi, "[PATH]");
  // POSIX paths with database extension: /path/to/file.accdb
  result = result.replace(/(?<!\S)\/[^:\r\n]*?\.(?:accdb|mdb|accde|mde|laccdb)\b/gi, "[PATH]");
  // Windows drive root paths: C:\dir/...
  result = result.replace(/[A-Za-z]:\\(?:[^\\\s"'<>|:*?]+(?:\\[^\\\s"'<>|:*?]+)*\\?)?/g, "[PATH]");
  // POSIX directory paths: /dir/subdir/...
  result = result.replace(/(?<!\S)\/(?:[^/\s"'<>:]+\/)*[^/\s"'<>:]+/g, "[PATH]");
  return result;
}

export { type JsonObjectSchema } from "./schemas.js";
