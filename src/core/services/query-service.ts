import type { DysflowConfig } from "../config/dysflow-config.js";
import {
  type AccessQueryRequest,
  createDysflowError,
  failureResult,
  type OperationResult,
  type RelinkDirectoryReport,
  successResult,
} from "../contracts/index.js";
import {
  type AccessRunner,
  type AccessRunnerProgressCallback,
  ensureResultShape,
} from "../runner/access-runner.js";
import { detectWriteSqlKeyword, isRecord, looksLikeReadOnlySql } from "../utils/index.js";

export type AccessQueryResult = {
  dryRun?: true;
  willExecute?: false;
  willModifyAccess?: false;
  action?: AccessQueryRequest["action"];
  mode?: AccessQueryRequest["mode"];
  sql?: string;
  /** Absolute database path selected by the runner for query_sql. */
  resolvedAccessPath?: string;
  rows?: readonly Record<string, unknown>[];
  affectedRows?: number;
  tables?: readonly string[];
  links?: readonly Record<string, unknown>[];
  queries?: readonly Record<string, unknown>[];
  schema?: readonly Record<string, unknown>[];
  files?: readonly string[];
  relationships?: readonly Record<string, unknown>[];
  comparison?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  relinkDirectory?: RelinkDirectoryReport;
};

export type AccessQueryServiceOptions = {
  runner: AccessRunner;
  config: DysflowConfig;
};

const INLINE_WRITE_PLAN_ACTIONS: ReadonlySet<AccessQueryRequest["action"]> = new Set([
  "exec_sql",
  "run_script",
  "create_table",
  "drop_table",
  "seed_fixture",
  "teardown_fixture",
]);

function usesInlineWritePlan(request: AccessQueryRequest): boolean {
  return request.action === undefined || INLINE_WRITE_PLAN_ACTIONS.has(request.action);
}

export class AccessQueryService {
  private readonly runner: AccessRunner;
  private readonly config: DysflowConfig;

  constructor(options: AccessQueryServiceOptions) {
    this.runner = options.runner;
    this.config = options.config;
  }

  async execute(
    request: AccessQueryRequest,
    onProgress?: AccessRunnerProgressCallback,
  ): Promise<OperationResult<AccessQueryResult>> {
    if (request.mode === "read" && typeof request.sql === "string" && request.sql.trim() !== "") {
      if (!looksLikeReadOnlySql(request.sql)) {
        const keyword = detectWriteSqlKeyword(request.sql);
        const forbiddenMessage = `${keyword} statements are not allowed in read-only queries. Use exec_sql or query_execute with mode "write" for write operations.`;
        return failureResult(createDysflowError("INVALID_READ_ONLY_QUERY", forbiddenMessage));
      }
    }

    if (request.mode === "write" && request.dryRun === true && usesInlineWritePlan(request)) {
      return successResult({
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        action: request.action,
        mode: request.mode,
        sql: request.sql,
      });
    }

    const result = await this.runner.run<AccessQueryResult>(
      { kind: "query", request },
      this.config,
      { onProgress },
    );
    return ensureResultShape(result, isRecord);
  }
}
