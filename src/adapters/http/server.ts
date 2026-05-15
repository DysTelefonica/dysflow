import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { loadDysflowConfig } from "../../core/config/dysflow-config.js";
import { createDysflowError, failureResult, successResult, type AccessQueryRequest, type AccessVbaRequest, type OperationResult } from "../../core/contracts/index.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import { AccessDiagnosticsService, type AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import { AccessQueryService, type AccessQueryResult } from "../../core/services/query-service.js";
import { AccessVbaService, type AccessVbaResult } from "../../core/services/vba-service.js";

export const DEFAULT_HTTP_HOST = "127.0.0.1";
export const DEFAULT_HTTP_PORT = 17_321;

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
};

export type StartDysflowHttpServerOptions = {
  host?: string;
  port?: number;
  writesEnabled?: boolean;
  services?: DysflowHttpServices;
  env?: Record<string, string | undefined>;
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
  const services = options.services ?? createCoreServices(options.env);
  const server = createServer((request, response) => {
    void routeRequest(request, response, { services, writesEnabled });
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

function createCoreServices(env?: Record<string, string | undefined>): DysflowHttpServices {
  const configResult = loadDysflowConfig({ env });
  if (!configResult.ok) {
    throw new Error(`${configResult.error.code}: ${configResult.error.message}`);
  }

  const runner = new AccessPowerShellRunner();
  return {
    diagnosticsService: new AccessDiagnosticsService({ runner, config: configResult.data }),
    queryService: new AccessQueryService({ runner, config: configResult.data }),
    vbaService: new AccessVbaService({ runner, config: configResult.data }),
  };
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: { services: DysflowHttpServices; writesEnabled: boolean },
): Promise<void> {
  const method = request.method ?? "GET";
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

  if (method === "GET" && path === "/health") {
    sendJson(response, 200, { ok: true, service: "dysflow", writesEnabled: context.writesEnabled });
    return;
  }

  if (method === "GET" && path === "/diagnostics") {
    sendOperationResult(response, await context.services.diagnosticsService.run({ includeEnvironment: true }));
    return;
  }

  if (method === "POST" && path === "/query/read") {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendOperationResult(response, body, 400);
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
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendOperationResult(response, body, 400);
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
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendOperationResult(response, body, 400);
      return;
    }
    sendOperationResult(response, await context.services.vbaService.execute(toVbaRequest(body.data)));
    return;
  }

  sendOperationResult(response, failureResult(createDysflowError("HTTP_NOT_FOUND", `No route for ${method} ${path}.`)), 404);
}

function isReadOnlySql(sql: string): boolean {
  const normalized = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .toLowerCase();

  return normalized.startsWith("select") && !normalized.includes(";") && !/\binto\b/.test(normalized);
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

async function readJsonBody(request: IncomingMessage): Promise<OperationResult<JsonBody>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk));
  }

  try {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const parsed = rawBody.length > 0 ? JSON.parse(rawBody) : {};
    return successResult(isJsonBody(parsed) ? parsed : {});
  } catch {
    return failureResult(createDysflowError("HTTP_BAD_JSON", "Request body must be valid JSON."));
  }
}

function isJsonBody(value: unknown): value is JsonBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  response.end(JSON.stringify(body));
}
