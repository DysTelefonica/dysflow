import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  type AccessQueryRequest,
  type AccessVbaRequest,
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import {
  buildQueryReadRequest,
  buildWriteFixtureRequest,
} from "../../core/mapping/access-query-request-mapper.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import {
  type AccessOperationListEntry,
  type AccessOperationRegistry,
  type AccessOperationRegistryHealth,
  listRecentAccessOperations,
  resolveAccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";
import { sanitizeMcpErrorMessage } from "../../core/utils/sanitize-error.js";
import {
  CLEANUP_SCHEMA,
  HTTP_QUERY_SCHEMA,
  HTTP_VBA_EXECUTE_SCHEMA,
  HTTP_WRITE_QUERY_SCHEMA,
  type JsonObjectSchema,
  validateInput,
} from "../../shared/validation/index.js";
import { loadDysflowConfigAsync } from "../config/dysflow-config-node.js";
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
  httpToken?: string;
  allowedProcedures?: readonly string[];
  /**
   * Caller-supplied Access (frontend) password. Wins over env-derived
   * `DYSFLOW_ACCESS_PASSWORD` / `ACCESS_VBA_PASSWORD`. Forwarded to every
   * HTTP error envelope so the response sanitizer can redact it.
   */
  accessPassword?: string;
  /**
   * Caller-supplied backend password. Wins over env-derived
   * `DYSFLOW_BACKEND_PASSWORD`. Forwarded to every HTTP error envelope so
   * the response sanitizer can redact it.
   */
  backendPassword?: string;
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

  const envSource = options.env ?? process.env;
  let httpToken = options.httpToken;
  let allowedProcedures = options.allowedProcedures;
  // Options (caller-supplied) win over env. This makes `options.accessPassword`
  // and `options.backendPassword` first-class for tests AND for callers that
  // already resolved the password from a vault or a higher-level config.
  let accessPassword =
    options.accessPassword ?? envSource.DYSFLOW_ACCESS_PASSWORD ?? envSource.ACCESS_VBA_PASSWORD;
  let backendPassword = options.backendPassword ?? envSource.DYSFLOW_BACKEND_PASSWORD;

  const configResult = await loadDysflowConfigAsync({ env: options.env, cwd: options.cwd });
  if (configResult.ok) {
    if (httpToken === undefined) httpToken = configResult.data.httpToken;
    if (allowedProcedures === undefined) allowedProcedures = configResult.data.allowedProcedures;
    // Caller-supplied options win over configResult: a higher-level caller
    // (test harness, vault-backed resolver, CLI override) should not have
    // its password silently replaced by .dysflow/project.json.
    if (accessPassword === undefined && configResult.data.accessPassword !== undefined) {
      accessPassword = configResult.data.accessPassword;
    }
    if (backendPassword === undefined && configResult.data.backendPassword !== undefined) {
      backendPassword = configResult.data.backendPassword;
    }
  }

  const server = createServer((request, response) => {
    void routeRequest(request, response, {
      services,
      writesEnabled,
      maxBodyBytes,
      httpToken,
      allowedProcedures,
      accessPassword,
      backendPassword,
    });
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
  context: {
    services: DysflowHttpServices;
    writesEnabled: boolean;
    maxBodyBytes: number;
    httpToken?: string;
    allowedProcedures?: readonly string[];
    accessPassword?: string;
    backendPassword?: string;
  },
): Promise<void> {
  // DELTA-002 (#576): build the secrets list once and thread it through
  // every response sent by this request, so service-result errors AND
  // validation errors AND body-read failures all get the same sanitization.
  const secrets = collectSecrets(context);
  const send = <TData>(result: OperationResult<TData>, failureStatus?: number): void => {
    // sendOperationResult's 4th parameter is `secrets` (defaults to []).
    // Pass them so the failure branch goes through `sanitizeOperationResult`.
    sendOperationResult(response, result, failureStatus, secrets);
  };
  const sendBodyReadFailure = (body: OperationResult<JsonBody>): void => {
    send(body, bodyReadFailureStatus(body));
  };
  const method = request.method ?? "GET";
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

  if (method === "GET" && path === "/health") {
    sendJson(response, 200, { ok: true, service: "dysflow", writesEnabled: context.writesEnabled });
    return;
  }

  if (context.httpToken !== undefined && context.httpToken.length > 0) {
    const authHeader = request.headers.authorization;
    if (authHeader === undefined || !authHeader.startsWith("Bearer ")) {
      sendUnauthorized(response);
      return;
    }
    const token = authHeader.substring(7);
    const tokenBuf = Buffer.from(token, "utf8");
    const expectedBuf = Buffer.from(context.httpToken, "utf8");
    if (tokenBuf.length !== expectedBuf.length || !timingSafeEqual(tokenBuf, expectedBuf)) {
      sendUnauthorized(response);
      return;
    }
  }

  if (method === "GET" && path === "/access/operations") {
    const registry = resolveAccessOperationRegistry(context.services.operationRegistry);
    // DELTA-001 (#575): include `registryHealth` alongside the list so callers
    // can distinguish "no operations" from "registry was corrupt and is now empty by design".
    const operations = await listRecentAccessOperations(registry);
    send(
      successResult<{
        operations: readonly AccessOperationListEntry[];
        registryHealth: AccessOperationRegistryHealth;
      }>({
        operations,
        registryHealth: registry.getHealth(),
      }),
    );
    return;
  }

  if (method === "POST" && path === "/access/cleanup") {
    const body = await readJsonBody(request, context.maxBodyBytes);
    if (!body.ok) {
      sendBodyReadFailure(body);
      return;
    }
    if (!handleValidation(body.data, CLEANUP_SCHEMA, context, response)) {
      return;
    }
    if (body.data.force === true && !context.writesEnabled) {
      sendWritesDisabled(response);
      return;
    }
    const cleanupService = context.services.cleanupService;
    if (cleanupService === undefined) {
      send(
        failureResult(
          createDysflowError("SERVICE_UNAVAILABLE", "Cleanup service is not configured."),
        ),
      );
      return;
    }
    const cleanupResult = await cleanupService.cleanup({
      operationId: getStringParam(body.data, "operationId"),
      accessPath: getStringParam(body.data, "accessPath"),
      force: body.data.force === true,
    });
    // DELTA-001 (#575): on success, include `registryHealth` so the caller can
    // see whether the registry itself was in a degraded state when the cleanup
    // ran. Failure envelopes keep their existing shape (`error.code` is the
    // contract; downstream parsers depend on it).
    if (cleanupResult.ok) {
      const registry = resolveAccessOperationRegistry(context.services.operationRegistry);
      send(
        successResult<{
          cleanup: typeof cleanupResult.data;
          registryHealth: AccessOperationRegistryHealth;
        }>({
          cleanup: cleanupResult.data,
          registryHealth: registry.getHealth(),
        }),
      );
    } else {
      send(cleanupResult);
    }
    return;
  }

  if (method === "GET" && path === "/diagnostics") {
    send(await context.services.diagnosticsService.run({ includeEnvironment: true }));
    return;
  }

  if (method === "POST" && path === "/query/read") {
    const body = await readJsonBody(request, context.maxBodyBytes);
    if (!body.ok) {
      sendBodyReadFailure(body);
      return;
    }
    if (!handleValidation(body.data, HTTP_QUERY_SCHEMA, context, response)) {
      return;
    }
    const result = await context.services.queryService.execute(
      buildQueryReadRequest("query_sql", body.data),
    );
    if (!result.ok && result.error.code === "INVALID_READ_ONLY_QUERY") {
      // DELTA-002 (#576): avoid slash-prefixed route names in user-facing
      // messages — `sanitizeMcpErrorMessage` strips path-like tokens so the
      // wire output stays stable across redaction.
      send(
        failureResult(
          createDysflowError(
            "HTTP_READ_ONLY_SQL_REQUIRED",
            "The query/read route only accepts read-only SELECT queries.",
          ),
        ),
        400,
      );
      return;
    }
    send(result);
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
    if (!handleValidation(body.data, HTTP_WRITE_QUERY_SCHEMA, context, response)) {
      return;
    }
    send(
      await context.services.queryService.execute(buildWriteFixtureRequest("exec_sql", body.data)),
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
    if (!handleValidation(body.data, HTTP_VBA_EXECUTE_SCHEMA, context, response)) {
      return;
    }
    const vbaRequest = toVbaRequest(body.data);
    if (
      context.allowedProcedures !== undefined &&
      context.allowedProcedures.length > 0 &&
      !context.allowedProcedures.includes(vbaRequest.procedureName)
    ) {
      send(
        failureResult(
          createDysflowError(
            "HTTP_PROCEDURE_NOT_ALLOWED",
            `Procedure '${vbaRequest.procedureName}' is not in the configured allowedProcedures list.`,
          ),
        ),
        403,
      );
      return;
    }
    send(await context.services.vbaService.execute(vbaRequest));
    return;
  }

  send(failureResult(createDysflowError("HTTP_NOT_FOUND", `No route for ${method} ${path}.`)), 404);
}

function handleValidation(
  bodyData: unknown,
  schema: JsonObjectSchema,
  context: { httpToken?: string; accessPassword?: string; backendPassword?: string },
  response: ServerResponse,
): boolean {
  const error = validateInput(bodyData, schema);
  if (error !== undefined) {
    const secrets = collectSecrets(context);
    // DELTA-002 (#576): use the same sanitizer as service-result errors so
    // HTTP error envelopes stay consistent (secrets redacted, ;PWD=...
    // fragments stripped, paths sanitized).
    const failureResultValue = failureResult(
      createDysflowError("HTTP_INVALID_INPUT", sanitizeMcpErrorMessage(error, secrets)),
    );
    sendOperationResult(response, failureResultValue, 400, secrets);
    return false;
  }
  return true;
}

/**
 * Returns the active secrets list (httpToken, accessPassword, backendPassword)
 * filtered to non-empty strings, in that order. Shared by validation and
 * service-result sanitization so both paths use the same input set.
 */
function collectSecrets(context: {
  httpToken?: string;
  accessPassword?: string;
  backendPassword?: string;
}): string[] {
  return [context.httpToken, context.accessPassword, context.backendPassword].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
}

/**
 * Returns a shallow copy of `result` with the error message sanitized via
 * `sanitizeMcpErrorMessage(secrets)` when the result is a failure. Successful
 * results are returned untouched (we do not redact user payloads). The
 * structured `error.code` and `error.retryable` fields are preserved exactly.
 */
function sanitizeOperationResult<T>(
  result: OperationResult<T>,
  secrets: readonly string[],
): OperationResult<T> {
  if (result.ok) return result;
  const sanitizedMessage = sanitizeMcpErrorMessage(result.error.message, secrets);
  if (sanitizedMessage === result.error.message) return result;
  return {
    ...result,
    error: { ...result.error, message: sanitizedMessage },
  };
}

function toVbaRequest(body: JsonBody): AccessVbaRequest {
  return {
    moduleName: getStringParam(body, "moduleName"),
    procedureName: getStringParam(body, "procedureName"),
    arguments: Array.isArray(body.arguments) ? body.arguments : undefined,
  };
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

function sendUnauthorized(response: ServerResponse): void {
  sendOperationResult(
    response,
    failureResult(
      createDysflowError(
        "HTTP_UNAUTHORIZED",
        "Authentication required. Provide a valid Bearer token in the Authorization header.",
      ),
    ),
    401,
  );
}

function sendOperationResult<TData>(
  response: ServerResponse,
  result: OperationResult<TData>,
  failureStatus = 500,
  secrets: readonly string[] = [],
): void {
  // DELTA-002 (#576): on the failure branch, redact the error message with
  // `sanitizeMcpErrorMessage(secrets)` so HTTP envelopes match MCP parity.
  // The structured error.code/retryable stay byte-exact; only message is
  // touched (and only when sanitization actually changes it).
  // Always run sanitization, even when no explicit secrets are configured:
  // `sanitizeMcpErrorMessage` still applies heuristic redaction for ;PWD= fragments,
  // ;*** patterns, and Windows/UNC paths, so the envelope stays safe in all cases.
  const sanitized = sanitizeOperationResult(result, secrets);
  sendJson(response, sanitized.ok ? 200 : failureStatus, sanitized);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(body));
}

export function getStringParam(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  if (typeof val !== "string") {
    throw new Error(`Parameter '${key}' must be a string.`);
  }
  return val;
}
