import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { loadDysflowConfigAsync } from "../../core/config/dysflow-config.js";
import { createDysflowError, failureResult, successResult, type AccessQueryRequest, type AccessVbaRequest, type OperationResult } from "../../core/contracts/index.js";
import { AccessPowerShellRunner, getDefaultAccessOperationRegistry } from "../../core/runner/access-runner.js";
import { AccessOperationCleanupService, type AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import { FileAccessOperationRegistry, type AccessOperationRecord, type AccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import { WindowsMsAccessProcessInspector, WindowsProcessKiller } from "../../core/operations/windows-processes.js";
import { AccessDiagnosticsService, type AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import { AccessQueryService, type AccessQueryResult } from "../../core/services/query-service.js";
import { AccessVbaService, type AccessVbaResult } from "../../core/services/vba-service.js";
import { resolveProjectOperationRegistryPath } from "../../core/operations/access-operation-registry.js";

export const DEFAULT_HTTP_HOST = "127.0.0.1";
export const DEFAULT_HTTP_PORT = 17_321;
export const DEFAULT_HTTP_MAX_BODY_BYTES = 1024 * 1024;

export type DysflowHttpServices = {
  diagnosticsService: {
    run(request?: { includeEnvironment?: boolean }): Promise<OperationResult<AccessDiagnosticsResult>>;
  };
  queryService: {
    execute(request: AccessQueryRequest): Promise<OperationResult<AccessQueryResult>>;
  };
  vbaService: {
    execute(request: AccessVbaRequest): Promise<OperationResult<AccessVbaResult>>;
  };
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: { cleanup(request: { operationId: string; accessPath: string; force?: boolean }): Promise<OperationResult<AccessCleanupResult>> };
};

export type StartDysflowHttpServerOptions = {
  host?: string;
  port?: number;
  writesEnabled?: boolean;
  maxBodyBytes?: number;
  services?: DysflowHttpServices;
  env?: Record<string, string | undefined>;
};

type HttpSecurityConfig = {
  token?: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
};

type RateState = Map<string, { count: number; windowStart: number }>;

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
  const security = resolveHttpSecurity(options.env);
  const rateState: RateState = new Map();
  const services = options.services ?? await createCoreServices(options.env);
  const server = createServer((request, response) => {
    void routeRequest(request, response, { services, writesEnabled, maxBodyBytes, security, rateState });
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

async function createCoreServices(env?: Record<string, string | undefined>): Promise<DysflowHttpServices> {
  const configResult = await loadDysflowConfigAsync({ env });
  if (!configResult.ok) {
    process.stderr.write(`[dysflow] HTTP server starting in degraded mode: ${configResult.error.code}: ${configResult.error.message}\n`);
    return createUnavailableHttpServices();
  }

  const operationRegistry = new FileAccessOperationRegistry({
    filePath: resolveProjectOperationRegistryPath(configResult.data),
  });
  const runner = new AccessPowerShellRunner({ operationRegistry });
  return {
    diagnosticsService: new AccessDiagnosticsService({ runner, config: configResult.data }),
    queryService: new AccessQueryService({ runner, config: configResult.data }),
    vbaService: new AccessVbaService({ runner, config: configResult.data }),
    operationRegistry,
    cleanupService: new AccessOperationCleanupService({
      registry: operationRegistry,
      processInspector: new WindowsMsAccessProcessInspector(),
      processKiller: new WindowsProcessKiller(),
    }),
  };
}

function createUnavailableHttpServices(): DysflowHttpServices {
  const unavailable = async () =>
    failureResult(createDysflowError("SERVICE_UNAVAILABLE", "Service is unavailable. Check the server configuration."));
  return {
    diagnosticsService: { run: unavailable },
    queryService: { execute: unavailable },
    vbaService: { execute: unavailable },
    operationRegistry: getDefaultAccessOperationRegistry(),
  };
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: { services: DysflowHttpServices; writesEnabled: boolean; maxBodyBytes: number; security: HttpSecurityConfig; rateState: RateState },
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

  if (!isAuthorizedRequest(request, context.security.token)) {
    sendOperationResult(response, failureResult(createDysflowError("HTTP_UNAUTHORIZED", "Missing or invalid bearer token.")), 401);
    return;
  }

  const limited = applyRateLimit(request, context.security, context.rateState);
  if (!limited.ok) {
    sendOperationResult(response, limited.result, 429);
    return;
  }

  if (method === "GET" && path === "/access/operations") {
    const registry = context.services.operationRegistry ?? getDefaultAccessOperationRegistry();
    sendOperationResult(response, successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })));
    return;
  }

  if (method === "POST" && path === "/access/cleanup") {
    const body = await readJsonBody(request, context.maxBodyBytes);
    if (!body.ok) {
      sendBodyReadFailure(body);
      return;
    }
    const cleanupService = context.services.cleanupService ?? new AccessOperationCleanupService({ registry: getDefaultAccessOperationRegistry(), processInspector: new WindowsMsAccessProcessInspector(), processKiller: new WindowsProcessKiller() });
    sendOperationResult(response, await cleanupService.cleanup({ operationId: String(body.data.operationId ?? ""), accessPath: String(body.data.accessPath ?? ""), force: body.data.force === true }));
    return;
  }

  if (method === "GET" && path === "/diagnostics") {
    sendOperationResult(response, await context.services.diagnosticsService.run({ includeEnvironment: true }));
    return;
  }

  if (method === "POST" && path === "/query/read") {
    const body = await readJsonBody(request, context.maxBodyBytes);
    if (!body.ok) {
      sendBodyReadFailure(body);
      return;
    }
    const sql = String(body.data.sql ?? "");
    if (!isReadOnlySql(sql)) {
      sendOperationResult(
        response,
        failureResult(
          createDysflowError("HTTP_READ_ONLY_SQL_REQUIRED", "The /query/read route only accepts read-only SELECT queries."),
        ),
        400,
      );
      return;
    }
    sendOperationResult(response, await context.services.queryService.execute({ sql, mode: "read" }));
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
    sendOperationResult(response, await context.services.queryService.execute({ sql: String(body.data.sql ?? ""), mode: "write" }));
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
    sendOperationResult(response, await context.services.vbaService.execute(toVbaRequest(body.data)));
    return;
  }

  sendOperationResult(response, failureResult(createDysflowError("HTTP_NOT_FOUND", `No route for ${method} ${path}.`)), 404);
}

function isReadOnlySql(sql: string): boolean {
  // Step 1: strip line comments and block comments
  const withoutComments = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .toLowerCase();

  // Step 2: strip string literals so that ; or keywords inside them are invisible
  const tokenized = withoutComments
    .replace(/'([^']|'')*'/g, "''")
    .replace(/"([^"]|"")*"/g, '""');

  // Step 3: split on top-level semicolons and filter empty fragments
  const statements = tokenized.split(";").map((s) => s.trim()).filter((s) => s.length > 0);

  // Step 4: must be exactly one non-empty statement
  if (statements.length !== 1) return false;

  const firstToken = statements[0].match(/^[a-z]+/)?.[0];
  return firstToken === "select" && !/\binto\b/.test(tokenized) && !/\b(alter|create|delete|drop|exec|execute|insert|parameters|transform|update)\b/.test(tokenized);
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

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<OperationResult<JsonBody>> {
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

function resolveHttpSecurity(env: Record<string, string | undefined> | undefined): HttpSecurityConfig {
  const token = env?.DYSFLOW_HTTP_TOKEN?.trim();
  return {
    token: token && token.length > 0 ? token : undefined,
    rateLimitMax: parsePositiveInt(env?.DYSFLOW_HTTP_RATE_LIMIT_MAX, 60),
    rateLimitWindowMs: parsePositiveInt(env?.DYSFLOW_HTTP_RATE_LIMIT_WINDOW_MS, 60_000),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isAuthorizedRequest(request: IncomingMessage, token: string | undefined): boolean {
  if (token === undefined) return true;
  const auth = request.headers.authorization;
  if (typeof auth !== "string") return false;
  return auth === `Bearer ${token}`;
}

function applyRateLimit(
  request: IncomingMessage,
  security: HttpSecurityConfig,
  state: RateState,
): { ok: true } | { ok: false; result: OperationResult<never> } {
  const key = `${request.socket.remoteAddress ?? "unknown"}:${request.headers.authorization ?? "anon"}`;
  const now = Date.now();
  const bucket = state.get(key);
  if (bucket === undefined || now - bucket.windowStart >= security.rateLimitWindowMs) {
    state.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (bucket.count >= security.rateLimitMax) {
    return { ok: false, result: failureResult(createDysflowError("HTTP_RATE_LIMITED", "Too many requests. Please retry later.")) };
  }
  bucket.count += 1;
  return { ok: true };
}

function bodyTooLarge(maxBodyBytes: number): OperationResult<JsonBody> {
  return failureResult(createDysflowError("HTTP_BODY_TOO_LARGE", `Request body exceeds the ${maxBodyBytes} byte limit.`));
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

function sendOperationResult<TData>(response: ServerResponse, result: OperationResult<TData>, failureStatus = 500): void {
  sendJson(response, result.ok ? 200 : failureStatus, result);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(body));
}
