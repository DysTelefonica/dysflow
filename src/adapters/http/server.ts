import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  type AccessQueryRequest,
  type AccessVbaRequest,
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import type {
  AccessOperationRecord,
  AccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";
import { getDefaultAccessOperationRegistry } from "../../core/runner/access-runner.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";
import { createHttpServices } from "./http-services-factory.js";

export const DEFAULT_HTTP_HOST = "127.0.0.1";
export const DEFAULT_HTTP_PORT = 17_321;
export const DEFAULT_HTTP_MAX_BODY_BYTES = 1024 * 1024;

export type DysflowHttpServices = {
  diagnosticsService: {
    run(request?: {
      includeEnvironment?: boolean;
    }): Promise<OperationResult<AccessDiagnosticsResult>>;
  };
  queryService: {
    execute(request: AccessQueryRequest): Promise<OperationResult<AccessQueryResult>>;
  };
  vbaService: {
    execute(request: AccessVbaRequest): Promise<OperationResult<AccessVbaResult>>;
  };
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: {
    cleanup(request: {
      operationId: string;
      accessPath: string;
      force?: boolean;
    }): Promise<OperationResult<AccessCleanupResult>>;
  };
};

export type StartDysflowHttpServerOptions = {
  host?: string;
  port?: number;
  writesEnabled?: boolean;
  maxBodyBytes?: number;
  services?: DysflowHttpServices;
  env?: Record<string, string | undefined>;
  cwd?: string;
};

export type StartedDysflowHttpServer = {
  server: Server;
  host: string;
  port: number;
  url: string;
  writesEnabled: boolean;
};

type JsonBody = Record<string, unknown>;

export async function startDysflowHttpServer(
  options: StartDysflowHttpServerOptions = {},
): Promise<StartedDysflowHttpServer> {
  const host = options.host ?? DEFAULT_HTTP_HOST;
  const port = options.port ?? DEFAULT_HTTP_PORT;
  const writesEnabled = options.writesEnabled ?? false;
  const maxBodyBytes = normalizeMaxBodyBytes(options.maxBodyBytes);
  const services = options.services ?? (await createHttpServices(options.env, options.cwd));
  const server = createServer((request, response) => {
    void routeRequest(request, response, { services, writesEnabled, maxBodyBytes });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === "object" && address !== null ? address.port : port;
  return { server, host, port: resolvedPort, url: `http://${host}:${resolvedPort}`, writesEnabled };
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: { services: DysflowHttpServices; writesEnabled: boolean; maxBodyBytes: number },
): Promise<void> {
  const sendBodyReadFailure = (body: OperationResult<JsonBody>): void => {
    sendOperationResult(response, body, bodyReadFailureStatus(body));
  };
  const method = request.method ?? "GET";
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

  if (method === "GET" && path === "/health") {
    sendJson(response, 200, { ok: true, service: "dysflow", writesEnabled: context.writesEnabled });
    return;
  }

  if (method === "GET" && path === "/access/operations") {
    const registry = context.services.operationRegistry ?? getDefaultAccessOperationRegistry();
    sendOperationResult(
      response,
      successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })),
    );
    return;
  }

  if (method === "POST" && path === "/access/cleanup") {
    const body = await readJsonBody(request, context.maxBodyBytes);
    if (!body.ok) {
      sendBodyReadFailure(body);
      return;
    }
    const cleanupService = context.services.cleanupService;
    if (cleanupService === undefined) {
      sendOperationResult(
        response,
        failureResult(
          createDysflowError("SERVICE_UNAVAILABLE", "Cleanup service is not configured."),
        ),
      );
      return;
    }
    sendOperationResult(
      response,
      await cleanupService.cleanup({
        operationId: String(body.data.operationId ?? ""),
        accessPath: String(body.data.accessPath ?? ""),
        force: body.data.force === true,
      }),
    );
    return;
  }

  if (method === "GET" && path === "/diagnostics") {
    sendOperationResult(
      response,
      await context.services.diagnosticsService.run({ includeEnvironment: true }),
    );
    return;
  }

  if (method === "POST" && path === "/query/read") {
    const body = await readJsonBody(request, context.maxBodyBytes);
    if (!body.ok) {
      sendBodyReadFailure(body);
      return;
    }
    const sql = String(body.data.sql ?? "");
    if (!looksLikeReadOnlySql(sql)) {
      sendOperationResult(
        response,
        failureResult(
          createDysflowError(
            "HTTP_READ_ONLY_SQL_REQUIRED",
            "The /query/read route only accepts read-only SELECT queries.",
          ),
        ),
        400,
      );
      return;
    }
    sendOperationResult(
      response,
      await context.services.queryService.execute({ sql, mode: "read" }),
    );
    return;
  }

  if (method === "POST" && path === "/query/write") {
    if (!context.writesEnabled) {
      sendWritesDisabled(response);
      return;
    }
    const body = await readJsonBody(request, context.maxBodyBytes);
    if (!body.ok) {
      sendBodyReadFailure(body);
      return;
    }
    sendOperationResult(
      response,
      await context.services.queryService.execute({
        sql: String(body.data.sql ?? ""),
        mode: "write",
      }),
    );
    return;
  }

  if (method === "POST" && path === "/vba/execute") {
    if (!context.writesEnabled) {
      sendWritesDisabled(response);
      return;
    }
    const body = await readJsonBody(request, context.maxBodyBytes);
    if (!body.ok) {
      sendBodyReadFailure(body);
      return;
    }
    sendOperationResult(
      response,
      await context.services.vbaService.execute(toVbaRequest(body.data)),
    );
    return;
  }

  sendOperationResult(
    response,
    failureResult(createDysflowError("HTTP_NOT_FOUND", `No route for ${method} ${path}.`)),
    404,
  );
}

/**
 * Heuristic check — not a security boundary.
 * Returns true if sql looks like a single SELECT with no INTO clause.
 * writesEnabled is the authoritative write gate.
 */
function looksLikeReadOnlySql(sql: string): boolean {
  // Step 1: strip line comments and block comments
  const withoutComments = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .toLowerCase();

  // Step 2: strip string literals so that ; or keywords inside them are invisible
  const tokenized = withoutComments.replace(/'([^']|'')*'/g, "''").replace(/"([^"]|"")*"/g, '""');

  // Step 3: split on top-level semicolons and filter empty fragments
  const statements = tokenized
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Step 4: must be exactly one non-empty statement
  if (statements.length !== 1) return false;

  const firstToken = statements[0].match(/^[a-z]+/)?.[0];
  return firstToken === "select" && !/\binto\b/.test(tokenized);
}

function toVbaRequest(body: JsonBody): AccessVbaRequest {
  const request: AccessVbaRequest = {
    moduleName: String(body.moduleName ?? ""),
    procedureName: String(body.procedureName ?? ""),
  };
  if (Array.isArray(body.arguments)) {
    request.arguments = body.arguments;
  }
  return request;
}

async function readJsonBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<OperationResult<JsonBody>> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return bodyTooLarge(maxBodyBytes);
  }

  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
    receivedBytes += buffer.byteLength;
    if (receivedBytes > maxBodyBytes) {
      return bodyTooLarge(maxBodyBytes);
    }
    chunks.push(buffer);
  }

  try {
    const rawBody = Buffer.concat(chunks, receivedBytes).toString("utf8");
    const parsed = rawBody.length > 0 ? JSON.parse(rawBody) : {};
    return successResult(isJsonBody(parsed) ? parsed : {});
  } catch {
    return failureResult(createDysflowError("HTTP_BAD_JSON", "Request body must be valid JSON."));
  }
}

function normalizeMaxBodyBytes(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? DEFAULT_HTTP_MAX_BODY_BYTES));
}

function bodyTooLarge(maxBodyBytes: number): OperationResult<JsonBody> {
  return failureResult(
    createDysflowError(
      "HTTP_BODY_TOO_LARGE",
      `Request body exceeds the ${maxBodyBytes} byte limit.`,
    ),
  );
}

function isJsonBody(value: unknown): value is JsonBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bodyReadFailureStatus(result: OperationResult<JsonBody>): number {
  return !result.ok && result.error.code === "HTTP_BODY_TOO_LARGE" ? 413 : 400;
}

function sendWritesDisabled(response: ServerResponse): void {
  sendOperationResult(
    response,
    failureResult(
      createDysflowError(
        "HTTP_WRITES_DISABLED",
        "Write routes are disabled. Start dysflow serve with --enable-writes to allow them.",
      ),
    ),
    403,
  );
}

function sendOperationResult<TData>(
  response: ServerResponse,
  result: OperationResult<TData>,
  failureStatus = 500,
): void {
  sendJson(response, result.ok ? 200 : failureStatus, result);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(body));
}
