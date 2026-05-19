import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { request as httpRequest, type Server } from "node:http";
import { startDysflowHttpServer } from "../../../src/adapters/http/server";
import { FileAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";
import { failureResult, successResult, type AccessQueryRequest, type AccessVbaRequest } from "../../../src/core/contracts/index";

const startedServers: Server[] = [];
type HttpServerOptions = NonNullable<Parameters<typeof startDysflowHttpServer>[0]>;
type HttpServices = NonNullable<HttpServerOptions["services"]>;

async function startTestServer(options: HttpServerOptions = {}) {
  const server = await startDysflowHttpServer({
    host: "127.0.0.1",
    port: 0,
    services: createFakeServices(),
    ...options,
  });
  startedServers.push(server.server);
  return server;
}

function createFakeServices(overrides: Partial<HttpServices> = {}) {
  const calls: { queries: AccessQueryRequest[]; vba: AccessVbaRequest[]; diagnostics: number } = {
    queries: [],
    vba: [],
    diagnostics: 0,
  };

  return {
    calls,
    diagnosticsService: {
      run: async () => {
        calls.diagnostics += 1;
        return successResult({ checks: [{ name: "access-db-path", ok: true, message: "configured" }] }, { durationMs: 3 });
      },
    },
    queryService: {
      execute: async (request: AccessQueryRequest) => {
        calls.queries.push(request);
        return successResult({ rows: [{ id: 1, name: "Ada" }] }, { durationMs: 5 });
      },
    },
    vbaService: {
      execute: async (request: AccessVbaRequest) => {
        calls.vba.push(request);
        return successResult({ returnValue: "done" }, { durationMs: 7 });
      },
    },
    ...overrides,
  };
}

async function readJson<TBody = any>(url: string, init?: RequestInit): Promise<{ response: Response; body: TBody }> {
  const response = await fetch(url, init);
  return { response, body: await response.json() as TBody };
}

async function postChunkedJson(url: string, chunks: readonly string[], headers: Record<string, string> = {}) {
  const target = new URL(url);
  return new Promise<{ statusCode: number; body: unknown }>((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: Number(target.port),
      path: target.pathname,
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => resolve({ statusCode: response.statusCode ?? 0, body: JSON.parse(raw) as unknown }));
    });
    request.on("error", reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

afterEach(async () => {
  await Promise.all(startedServers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("Dysflow HTTP adapter", () => {
  it("requires bearer auth for non-health routes when HTTP token is configured", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services, env: { DYSFLOW_HTTP_TOKEN: "top-secret" } });

    const unauthorized = await readJson(`${server.url}/diagnostics`);
    const authorized = await readJson(`${server.url}/diagnostics`, {
      headers: { authorization: "Bearer top-secret" },
    });

    expect(unauthorized.response.status).toBe(401);
    expect(unauthorized.body.error.code).toBe("HTTP_UNAUTHORIZED");
    expect(services.calls.diagnostics).toBe(1);
    expect(authorized.response.status).toBe(200);
  });

  it("rate limits bursts per client key", async () => {
    const services = createFakeServices();
    const server = await startTestServer({
      services,
      env: {
        DYSFLOW_HTTP_TOKEN: "burst-token",
        DYSFLOW_HTTP_RATE_LIMIT_MAX: "2",
        DYSFLOW_HTTP_RATE_LIMIT_WINDOW_MS: "60000",
      },
    });

    const headers = { "content-type": "application/json", authorization: "Bearer burst-token" };
    const r1 = await readJson(`${server.url}/query/read`, { method: "POST", headers, body: JSON.stringify({ sql: "SELECT 1" }) });
    const r2 = await readJson(`${server.url}/query/read`, { method: "POST", headers, body: JSON.stringify({ sql: "SELECT 1" }) });
    const r3 = await readJson(`${server.url}/query/read`, { method: "POST", headers, body: JSON.stringify({ sql: "SELECT 1" }) });

    expect(r1.response.status).toBe(200);
    expect(r2.response.status).toBe(200);
    expect(r3.response.status).toBe(429);
    expect(r3.body.error.code).toBe("HTTP_RATE_LIMITED");
  });

  it("does not expose environment diagnostics without explicit auth", async () => {
    const services = createFakeServices({
      diagnosticsService: {
        run: async (request) => {
          return successResult({ checks: [{ name: "environment", ok: request?.includeEnvironment === true, message: String(request?.includeEnvironment) }] });
        },
      },
    });
    const server = await startTestServer({ services, env: { DYSFLOW_HTTP_TOKEN: "diag-token" } });

    const denied = await readJson(`${server.url}/diagnostics`);
    const allowed = await readJson(`${server.url}/diagnostics`, { headers: { authorization: "Bearer diag-token" } });

    expect(denied.response.status).toBe(401);
    expect(allowed.response.status).toBe(200);
    expect(allowed.body.data.checks[0]).toEqual({ name: "environment", ok: true, message: "true" });
  });

  it("defaults to 127.0.0.1 with writes disabled and exposes JSON health", async () => {
    const server = await startTestServer();

    expect(server.host).toBe("127.0.0.1");
    expect(server.writesEnabled).toBe(false);

    const { response, body } = await readJson(`${server.url}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toEqual({ ok: true, service: "dysflow", writesEnabled: false });
  });

  it("starts in degraded mode when project config is unavailable", async () => {
    const server = await startDysflowHttpServer({
      host: "127.0.0.1",
      port: 0,
      env: {},
    });
    startedServers.push(server.server);

    const health = await readJson(`${server.url}/health`);
    const diagnostics = await readJson(`${server.url}/diagnostics`);

    expect(health.response.status).toBe(200);
    expect(health.body).toEqual({ ok: true, service: "dysflow", writesEnabled: false });
    expect(diagnostics.response.status).toBe(500);
    expect(diagnostics.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(diagnostics.body.error.message).not.toContain("/");
    expect(diagnostics.body.error.message).not.toContain("\\");
  });

  it("serves diagnostics and read query routes through core services", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const diagnostics = await readJson(`${server.url}/diagnostics`);
    const query = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT id, name FROM People" }),
    });

    expect(diagnostics.response.status).toBe(200);
    expect(diagnostics.body).toEqual({ ok: true, data: { checks: [{ name: "access-db-path", ok: true, message: "configured" }] }, diagnostics: [], durationMs: 3 });
    expect(query.response.status).toBe(200);
    expect(query.body).toEqual({ ok: true, data: { rows: [{ id: 1, name: "Ada" }] }, diagnostics: [], durationMs: 5 });
    expect(services.calls).toEqual({ diagnostics: 1, queries: [{ sql: "SELECT id, name FROM People", mode: "read" }], vba: [] });
  });


  it("rejects write SQL sent to the read route before it reaches core services", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "UPDATE People SET name='Ada' WHERE id=1" }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body).toEqual({
      ok: false,
      error: {
        code: "HTTP_READ_ONLY_SQL_REQUIRED",
        message: "The /query/read route only accepts read-only SELECT queries.",
        retryable: false,
      },
      diagnostics: [],
      durationMs: 0,
    });
    expect(services.calls.queries).toEqual([]);
  });


  it("rejects Access SELECT INTO write SQL on the read route", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * INTO ArchivedPeople FROM People" }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body.error.code).toBe("HTTP_READ_ONLY_SQL_REQUIRED");
    expect(services.calls.queries).toEqual([]);
  });

  it.each([
    "/* leading comment */\nUPDATE People SET name='Ada'",
    "WITH changed AS (DELETE FROM People RETURNING *) SELECT * FROM changed",
    "EXEC dangerous_procedure",
    "selection FROM People",
    "SELECT * FROM People DROP TABLE People",
  ])("rejects non-read SQL edge case: %s", async (sql) => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body.error.code).toBe("HTTP_READ_ONLY_SQL_REQUIRED");
    expect(services.calls.queries).toEqual([]);
  });

  it("rejects request bodies above the configured size limit before parsing JSON", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services, maxBodyBytes: 16 });

    const response = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1" }),
    });

    expect(response.response.status).toBe(413);
    expect(response.body).toEqual({ ok: false, error: { code: "HTTP_BODY_TOO_LARGE", message: "Request body exceeds the 16 byte limit.", retryable: false }, diagnostics: [], durationMs: 0 });
    expect(services.calls.queries).toEqual([]);
  });

  it("rejects chunked request bodies above the configured size limit with a JSON 413 response", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services, maxBodyBytes: 16 });

    const response = await postChunkedJson(`${server.url}/query/read`, ["{\"sql\":", "\"SELECT 1\"}"]);

    expect(response.statusCode).toBe(413);
    expect(response.body).toEqual({ ok: false, error: { code: "HTTP_BODY_TOO_LARGE", message: "Request body exceeds the 16 byte limit.", retryable: false }, diagnostics: [], durationMs: 0 });
    expect(services.calls.queries).toEqual([]);
  });

  it("translates core failures and malformed JSON to safe JSON errors", async () => {
    const services = createFakeServices({
      queryService: {
        execute: async () => failureResult({ code: "RUNNER_FAILED", message: "sanitized failure", retryable: false }, { durationMs: 4 }),
      },
    });
    const server = await startTestServer({ services });

    const coreFailure = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM Missing" }),
    });
    const badJson = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });

    expect(coreFailure.response.status).toBe(500);
    expect(coreFailure.body).toEqual({ ok: false, error: { code: "RUNNER_FAILED", message: "sanitized failure", retryable: false }, diagnostics: [], durationMs: 4 });
    expect(badJson.response.status).toBe(400);
    expect(badJson.body).toEqual({ ok: false, error: { code: "HTTP_BAD_JSON", message: "Request body must be valid JSON.", retryable: false }, diagnostics: [], durationMs: 0 });
  });

  it("blocks query and VBA write routes by default without calling core services", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const writeQuery = await readJson(`${server.url}/query/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "UPDATE People SET name='Ada' WHERE id=1" }),
    });
    const vba = await readJson(`${server.url}/vba/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moduleName: "Automation", procedureName: "Refresh" }),
    });

    expect(writeQuery.response.status).toBe(403);
    expect(vba.response.status).toBe(403);
    expect(writeQuery.body).toEqual({ ok: false, error: { code: "HTTP_WRITES_DISABLED", message: "Write routes are disabled. Start dysflow serve with --enable-writes to allow them.", retryable: false }, diagnostics: [], durationMs: 0 });
    expect(vba.body.error.code).toBe("HTTP_WRITES_DISABLED");
    expect(services.calls).toEqual({ diagnostics: 0, queries: [], vba: [] });
  });

  it("allows explicit write routes when writes are enabled", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services, writesEnabled: true });

    const writeQuery = await readJson(`${server.url}/query/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "UPDATE People SET name='Ada' WHERE id=1" }),
    });
    const vba = await readJson(`${server.url}/vba/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moduleName: "Automation", procedureName: "Refresh", arguments: [2026] }),
    });

    expect(writeQuery.response.status).toBe(200);
    expect(vba.response.status).toBe(200);
    expect(services.calls.queries).toEqual([{ sql: "UPDATE People SET name='Ada' WHERE id=1", mode: "write" }]);
    expect(services.calls.vba).toEqual([{ moduleName: "Automation", procedureName: "Refresh", arguments: [2026] }]);
  });

  it("accepts SELECT with a semicolon inside a string literal", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM T WHERE col = 'foo;bar'" }),
    });

    expect(response.response.status).toBe(200);
    expect(services.calls.queries).toHaveLength(1);
  });

  it("accepts a SELECT with multiple semicolons embedded inside string literals", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM T WHERE name = 'val;ue;with;many'" }),
    });

    expect(response.response.status).toBe(200);
    expect(services.calls.queries).toHaveLength(1);
  });

  it("rejects two real statements separated by a top-level semicolon (SELECT then INSERT)", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1; INSERT INTO T VALUES(1)" }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body.error.code).toBe("HTTP_READ_ONLY_SQL_REQUIRED");
    expect(services.calls.queries).toEqual([]);
  });

  it("exposes operations from an injected FileAccessOperationRegistry via GET /access/operations (#176)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "dysflow-http-registry-"));
    const registryPath = join(tmpDir, "operations.json");
    const operationRegistry = new FileAccessOperationRegistry({ filePath: registryPath });

    const operationRecord = {
      operationId: "op-test-http-shared-registry",
      action: "query" as const,
      accessPath: "C:/test/front.accdb",
      accessPid: null,
      processStartTime: null,
      status: "running" as const,
      metadata: {},
      updatedAt: new Date().toISOString(),
    };
    await operationRegistry.create(operationRecord);

    const server = await startDysflowHttpServer({
      host: "127.0.0.1",
      port: 0,
      services: { ...createFakeServices(), operationRegistry },
    });
    startedServers.push(server.server);

    const { response, body } = await readJson(`${server.url}/access/operations`);
    const result = body as { ok: boolean; data: Array<{ operationId: string }> };

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.data.some((op) => op.operationId === "op-test-http-shared-registry")).toBe(true);
  });

  it("rejects INSERT followed by DELETE separated by a top-level semicolon", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "INSERT INTO T VALUES (1); DELETE FROM T" }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body.error.code).toBe("HTTP_READ_ONLY_SQL_REQUIRED");
    expect(services.calls.queries).toEqual([]);
  });
});
