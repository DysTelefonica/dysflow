import { mkdtemp } from "node:fs/promises";
import { request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStringParam, startDysflowHttpServer } from "../../../src/adapters/http/server";
import { nodeRegistryFileSystem } from "../../../src/adapters/operations/node-registry-file-system";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import {
  type AccessQueryRequest,
  type AccessVbaRequest,
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index";
import { FileAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";
import { detectWriteSqlKeyword, looksLikeReadOnlySql } from "../../../src/core/utils/index";

const startedServers: Server[] = [];
type HttpServerOptions = NonNullable<Parameters<typeof startDysflowHttpServer>[0]>;
type HttpServices = NonNullable<HttpServerOptions["services"]>;
type HttpErrorBody = {
  ok: false;
  error: { code: string; message: string; retryable?: boolean };
  diagnostics: unknown[];
  durationMs: number;
};

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
        return successResult(
          { checks: [{ name: "access-db-path", ok: true, message: "configured" }] },
          { durationMs: 3 },
        );
      },
    },
    queryService: {
      execute: async (request: AccessQueryRequest) => {
        calls.queries.push(request);
        if (
          request.mode === "read" &&
          typeof request.sql === "string" &&
          request.sql.trim() !== "" &&
          !looksLikeReadOnlySql(request.sql)
        ) {
          const keyword = detectWriteSqlKeyword(request.sql);
          return failureResult(
            createDysflowError(
              "INVALID_READ_ONLY_QUERY",
              `${keyword} statements are not allowed in read-only queries. Use exec_sql or dysflow_query_execute with mode "write" for write operations.`,
            ),
          );
        }
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

async function readJson<TBody = unknown>(
  url: string,
  init?: RequestInit,
): Promise<{ response: Response; body: TBody }> {
  const response = await fetch(url, init);
  return { response, body: (await response.json()) as TBody };
}

async function postChunkedJson(
  url: string,
  chunks: readonly string[],
  headers: Record<string, string> = {},
) {
  const target = new URL(url);
  return new Promise<{ statusCode: number; body: unknown }>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: Number(target.port),
        path: target.pathname,
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () =>
          resolve({ statusCode: response.statusCode ?? 0, body: JSON.parse(raw) as unknown }),
        );
      },
    );
    request.on("error", reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

afterEach(async () => {
  await Promise.all(
    startedServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("Dysflow HTTP adapter", () => {
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
    const tempDir = await mkdtemp(join(tmpdir(), "dysflow-degraded-"));
    const server = await startDysflowHttpServer({
      host: "127.0.0.1",
      port: 0,
      env: {},
      cwd: tempDir,
    });
    startedServers.push(server.server);

    const health = await readJson(`${server.url}/health`);
    const diagnostics = await readJson<HttpErrorBody>(`${server.url}/diagnostics`);

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
    expect(diagnostics.body).toEqual({
      ok: true,
      data: { checks: [{ name: "access-db-path", ok: true, message: "configured" }] },
      diagnostics: [],
      durationMs: 3,
    });
    expect(query.response.status).toBe(200);
    expect(query.body).toEqual({
      ok: true,
      data: { rows: [{ id: 1, name: "Ada" }] },
      diagnostics: [],
      durationMs: 5,
    });
    expect(services.calls.diagnostics).toBe(1);
    expect(services.calls.vba).toEqual([]);
    expect(services.calls.queries).toMatchObject([
      { sql: "SELECT id, name FROM People", mode: "read" },
    ]);
  });

  it("rejects write SQL on the read route by translating the core guard's failure to HTTP 400", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "UPDATE People SET name='Ada' WHERE id=1" }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body).toEqual({
      ok: false,
      error: {
        code: "HTTP_READ_ONLY_SQL_REQUIRED",
        message: "The query/read route only accepts read-only SELECT queries.",
        retryable: false,
      },
      diagnostics: [],
      durationMs: 0,
    });
    expect(services.calls.queries).toMatchObject([
      { sql: "UPDATE People SET name='Ada' WHERE id=1", mode: "read" },
    ]);
  });

  it("rejects Access SELECT INTO write SQL on the read route by delegating to the core guard", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * INTO ArchivedPeople FROM People" }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body.error.code).toBe("HTTP_READ_ONLY_SQL_REQUIRED");
    expect(services.calls.queries).toMatchObject([
      { sql: "SELECT * INTO ArchivedPeople FROM People", mode: "read" },
    ]);
  });

  // now rejected: DDL keyword DROP is blocked by the hardened consolidated check
  it("rejects SELECT without semicolon followed by DDL keyword by delegating to the core guard", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM People DROP TABLE People" }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body.error.code).toBe("HTTP_READ_ONLY_SQL_REQUIRED");
    expect(services.calls.queries).toMatchObject([
      { sql: "SELECT * FROM People DROP TABLE People", mode: "read" },
    ]);
  });

  it("accepts CTE queries starting with WITH ... SELECT on /query/read", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "WITH cte AS (SELECT * FROM People) SELECT * FROM cte" }),
    });

    expect(response.response.status).toBe(200);
    expect(services.calls.queries).toHaveLength(1);
  });

  it("rejects write CTE queries containing write keywords on /query/read via the core guard", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sql: "WITH cte AS (INSERT INTO People VALUES (1)) SELECT * FROM cte",
      }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body.error.code).toBe("HTTP_READ_ONLY_SQL_REQUIRED");
    expect(services.calls.queries).toMatchObject([
      { sql: "WITH cte AS (INSERT INTO People VALUES (1)) SELECT * FROM cte", mode: "read" },
    ]);
  });

  it.each([
    "/* leading comment */\nUPDATE People SET name='Ada'",
    "WITH changed AS (DELETE FROM People RETURNING *) SELECT * FROM changed",
    "EXEC dangerous_procedure",
    "selection FROM People",
  ])("rejects non-read SQL edge case by delegating to the core guard: %s", async (sql) => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body.error.code).toBe("HTTP_READ_ONLY_SQL_REQUIRED");
    expect(services.calls.queries).toMatchObject([{ sql, mode: "read" }]);
  });

  it("rejects request bodies above the configured size limit before parsing JSON", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services, maxBodyBytes: 16 });

    const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1" }),
    });

    expect(response.response.status).toBe(413);
    expect(response.body).toEqual({
      ok: false,
      error: {
        code: "HTTP_BODY_TOO_LARGE",
        message: "Request body exceeds the 16 byte limit.",
        retryable: false,
      },
      diagnostics: [],
      durationMs: 0,
    });
    expect(services.calls.queries).toEqual([]);
  });

  it("rejects chunked request bodies above the configured size limit with a JSON 413 response", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services, maxBodyBytes: 16 });

    const response = await postChunkedJson(`${server.url}/query/read`, ['{"sql":', '"SELECT 1"}']);

    expect(response.statusCode).toBe(413);
    expect(response.body).toEqual({
      ok: false,
      error: {
        code: "HTTP_BODY_TOO_LARGE",
        message: "Request body exceeds the 16 byte limit.",
        retryable: false,
      },
      diagnostics: [],
      durationMs: 0,
    });
    expect(services.calls.queries).toEqual([]);
  });

  it("translates core failures and malformed JSON to safe JSON errors", async () => {
    const services = createFakeServices({
      queryService: {
        execute: async () =>
          failureResult(
            { code: "RUNNER_FAILED", message: "sanitized failure", retryable: false },
            { durationMs: 4 },
          ),
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
    expect(coreFailure.body).toEqual({
      ok: false,
      error: { code: "RUNNER_FAILED", message: "sanitized failure", retryable: false },
      diagnostics: [],
      durationMs: 4,
    });
    expect(badJson.response.status).toBe(400);
    expect(badJson.body).toEqual({
      ok: false,
      error: {
        code: "HTTP_BAD_JSON",
        message: "Request body must be valid JSON.",
        retryable: false,
      },
      diagnostics: [],
      durationMs: 0,
    });
  });

  it("blocks query and VBA write routes by default without calling core services", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const writeQuery = await readJson(`${server.url}/query/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "UPDATE People SET name='Ada' WHERE id=1" }),
    });
    const vba = await readJson<HttpErrorBody>(`${server.url}/vba/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moduleName: "Automation", procedureName: "Refresh" }),
    });

    expect(writeQuery.response.status).toBe(403);
    expect(vba.response.status).toBe(403);
    expect(writeQuery.body).toEqual({
      ok: false,
      error: {
        code: "HTTP_WRITES_DISABLED",
        message:
          "Write routes are disabled. Start dysflow serve with --enable-writes to allow them.",
        retryable: false,
      },
      diagnostics: [],
      durationMs: 0,
    });
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
      body: JSON.stringify({
        moduleName: "Automation",
        procedureName: "Refresh",
        arguments: [2026],
      }),
    });

    expect(writeQuery.response.status).toBe(200);
    expect(vba.response.status).toBe(200);
    expect(services.calls.queries).toMatchObject([
      {
        action: "exec_sql",
        sql: "UPDATE People SET name='Ada' WHERE id=1",
        mode: "write",
        dryRun: true,
      },
    ]);
    expect(services.calls.vba).toEqual([
      { moduleName: "Automation", procedureName: "Refresh", arguments: [2026] },
    ]);

    // Test that apply: true propagates dryRun: false
    const writeQueryApply = await readJson(`${server.url}/query/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "UPDATE People SET name='Ada' WHERE id=1", apply: true }),
    });
    expect(writeQueryApply.response.status).toBe(200);
    expect(services.calls.queries[1]).toMatchObject({
      action: "exec_sql",
      sql: "UPDATE People SET name='Ada' WHERE id=1",
      mode: "write",
      dryRun: false,
    });

    // Test that dryRun: false propagates dryRun: false
    const writeQueryDryRunFalse = await readJson(`${server.url}/query/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "UPDATE People SET name='Ada' WHERE id=1", dryRun: false }),
    });
    expect(writeQueryDryRunFalse.response.status).toBe(200);
    expect(services.calls.queries[2]).toMatchObject({
      action: "exec_sql",
      sql: "UPDATE People SET name='Ada' WHERE id=1",
      mode: "write",
      dryRun: false,
    });
  });

  it("accepts SELECT with a semicolon inside a string literal", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
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

    const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM T WHERE name = 'val;ue;with;many'" }),
    });

    expect(response.response.status).toBe(200);
    expect(services.calls.queries).toHaveLength(1);
  });

  it("rejects two real statements separated by a top-level semicolon (SELECT then INSERT) via the core guard", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1; INSERT INTO T VALUES(1)" }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body.error.code).toBe("HTTP_READ_ONLY_SQL_REQUIRED");
    expect(services.calls.queries).toMatchObject([
      { sql: "SELECT 1; INSERT INTO T VALUES(1)", mode: "read" },
    ]);
  });

  it("exposes operations + registryHealth from an injected FileAccessOperationRegistry via GET /access/operations (#176, #575)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "dysflow-http-registry-"));
    const registryPath = join(tmpDir, "operations.json");
    const operationRegistry = new FileAccessOperationRegistry({
      filePath: registryPath,
      fileSystem: nodeRegistryFileSystem,
    });

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
    const result = body as {
      ok: boolean;
      data: {
        operations: Array<{ operationId: string }>;
        registryHealth: { status: "ok" | "degraded" };
      };
    };

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(
      result.data.operations.some((op) => op.operationId === "op-test-http-shared-registry"),
    ).toBe(true);
    // DELTA-001 (#575): registryHealth is always present in the response so
    // consumers do not have to branch on its existence.
    expect(result.data.registryHealth.status).toBe("ok");
  });

  it("rejects INSERT followed by DELETE separated by a top-level semicolon via the core guard", async () => {
    const services = createFakeServices();
    const server = await startTestServer({ services });

    const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "INSERT INTO T VALUES (1); DELETE FROM T" }),
    });

    expect(response.response.status).toBe(400);
    expect(response.body.error.code).toBe("HTTP_READ_ONLY_SQL_REQUIRED");
    expect(services.calls.queries).toMatchObject([
      { sql: "INSERT INTO T VALUES (1); DELETE FROM T", mode: "read" },
    ]);
  });

  it("POST /access/cleanup with injected cleanupService calls cleanup with correct operationId and accessPath", async () => {
    const cleanupCalls: Array<{ operationId: string; accessPath: string; force?: boolean }> = [];
    const fakeCleanupService = {
      cleanup: async (request: { operationId: string; accessPath: string; force?: boolean }) => {
        cleanupCalls.push(request);
        return successResult({
          status: "cleaned" as const,
          accessPid: 9999,
          operationId: request.operationId,
        });
      },
    };
    const services = createFakeServices({ cleanupService: fakeCleanupService });
    const server = await startTestServer({ services });

    const response = await readJson<HttpErrorBody>(`${server.url}/access/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId: "op-123", accessPath: "C:/db/front.accdb" }),
    });

    expect(response.response.status).toBe(200);
    expect(cleanupCalls).toHaveLength(1);
    expect(cleanupCalls[0]).toMatchObject({
      operationId: "op-123",
      accessPath: "C:/db/front.accdb",
    });
  });

  it("POST /access/cleanup rejects force cleanup when writes are disabled without calling cleanupService", async () => {
    const cleanupCalls: Array<{ operationId: string; accessPath: string; force?: boolean }> = [];
    const fakeCleanupService = {
      cleanup: async (request: { operationId: string; accessPath: string; force?: boolean }) => {
        cleanupCalls.push(request);
        return successResult({
          status: "cleaned" as const,
          accessPid: 9999,
          operationId: request.operationId,
        });
      },
    };
    const services = createFakeServices({ cleanupService: fakeCleanupService });
    const server = await startTestServer({ services, writesEnabled: false });

    const response = await readJson<HttpErrorBody>(`${server.url}/access/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationId: "op-force-disabled",
        accessPath: "C:/db/front.accdb",
        force: true,
      }),
    });

    expect(response.response.status).toBe(403);
    expect(response.body).toEqual({
      ok: false,
      error: {
        code: "HTTP_WRITES_DISABLED",
        message:
          "Write routes are disabled. Start dysflow serve with --enable-writes to allow them.",
        retryable: false,
      },
      diagnostics: [],
      durationMs: 0,
    });
    expect(cleanupCalls).toEqual([]);
  });

  it("POST /access/cleanup allows force cleanup to reach cleanupService when writes are enabled", async () => {
    const cleanupCalls: Array<{ operationId: string; accessPath: string; force?: boolean }> = [];
    const fakeCleanupService = {
      cleanup: async (request: { operationId: string; accessPath: string; force?: boolean }) => {
        cleanupCalls.push(request);
        return successResult({
          status: "cleaned" as const,
          accessPid: 9999,
          operationId: request.operationId,
        });
      },
    };
    const services = createFakeServices({ cleanupService: fakeCleanupService });
    const server = await startTestServer({ services, writesEnabled: true });

    const response = await readJson<{
      ok: true;
      data: {
        cleanup: { operationId: string; status: string };
        registryHealth: { status: string };
      };
    }>(`${server.url}/access/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationId: "op-force-enabled",
        accessPath: "C:/db/front.accdb",
        force: true,
      }),
    });

    expect(response.response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    // DELTA-001 (#575): cleanup response wraps the cleanup payload AND the
    // registry health so callers can see whether the registry was degraded
    // when the cleanup ran.
    expect(response.body.data.cleanup).toMatchObject({
      operationId: "op-force-enabled",
      status: "cleaned",
    });
    expect(response.body.data.registryHealth).toEqual({ status: "ok" });
    expect(cleanupCalls).toEqual([
      { operationId: "op-force-enabled", accessPath: "C:/db/front.accdb", force: true },
    ]);
  });

  it("POST /access/cleanup allows non-force cleanup to reach cleanupService when writes are disabled", async () => {
    const cleanupCalls: Array<{ operationId: string; accessPath: string; force?: boolean }> = [];
    const fakeCleanupService = {
      cleanup: async (request: { operationId: string; accessPath: string; force?: boolean }) => {
        cleanupCalls.push(request);
        return successResult({
          status: "cleaned" as const,
          accessPid: 9999,
          operationId: request.operationId,
        });
      },
    };
    const services = createFakeServices({ cleanupService: fakeCleanupService });
    const server = await startTestServer({ services, writesEnabled: false });

    const absentForce = await readJson<HttpErrorBody>(`${server.url}/access/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId: "op-non-force-absent", accessPath: "C:/db/front.accdb" }),
    });
    const falseForce = await readJson<HttpErrorBody>(`${server.url}/access/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationId: "op-non-force-false",
        accessPath: "C:/db/front.accdb",
        force: false,
      }),
    });

    expect(absentForce.response.status).toBe(200);
    expect(falseForce.response.status).toBe(200);
    expect(cleanupCalls).toEqual([
      { operationId: "op-non-force-absent", accessPath: "C:/db/front.accdb", force: false },
      { operationId: "op-non-force-false", accessPath: "C:/db/front.accdb", force: false },
    ]);
  });

  it("POST /access/cleanup returns SERVICE_UNAVAILABLE 500 when cleanupService is absent", async () => {
    const services = createFakeServices({ cleanupService: undefined });
    const server = await startTestServer({ services });

    const response = await readJson<HttpErrorBody>(`${server.url}/access/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId: "op-456", accessPath: "C:/db/back.accdb" }),
    });

    expect(response.response.status).toBe(500);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  describe("allowedProcedures — procedureName allowlist for POST /vba/execute", () => {
    it("returns 403 when allowedProcedures is configured and procedure is not in the list", async () => {
      const services = createFakeServices();
      const server = await startTestServer({
        services,
        writesEnabled: true,
        allowedProcedures: ["Refresh", "Sync"],
      });

      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/vba/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moduleName: "Automation", procedureName: "DeleteAll" }),
      });

      expect(response.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("HTTP_PROCEDURE_NOT_ALLOWED");
      expect(services.calls.vba).toEqual([]);
    });

    it("allows the call when allowedProcedures is configured and procedure is in the list", async () => {
      const services = createFakeServices();
      const server = await startTestServer({
        services,
        writesEnabled: true,
        allowedProcedures: ["Refresh", "Sync"],
      });

      const { response } = await readJson(`${server.url}/vba/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moduleName: "Automation", procedureName: "Refresh" }),
      });

      expect(response.status).toBe(200);
      expect(services.calls.vba).toHaveLength(1);
    });

    it("allows any procedure when allowedProcedures is not configured", async () => {
      const services = createFakeServices();
      const server = await startTestServer({ services, writesEnabled: true });

      const { response } = await readJson(`${server.url}/vba/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moduleName: "Automation", procedureName: "DeleteAll" }),
      });

      expect(response.status).toBe(200);
      expect(services.calls.vba).toHaveLength(1);
    });
  });

  // PR1b (#621 F1) — tests for POST /vba/test default-deny allowlist gate
  describe("allowedProcedures — test_vba default-deny gate for POST /vba/test (#691)", () => {
    // Tracks calls to the mocked vbaSyncToolService
    const testVbaCalls: Array<{ toolName: string; input: unknown }> = [];

    /**
     * Creates a fake vbaSyncToolService that:
     * - Records all calls in testVbaCalls
     * - Simulates the VbaExecutionAdapter.ensureTestProceduresAllowed gate:
     *   - Rejects with MCP_INPUT_INVALID when allowedProcedures is undefined/empty AND dryRun !== true
     *   - Allows through otherwise (returns successResult)
     */
    function createFakeVbaSyncToolService(allowedProcedures?: readonly string[]) {
      return {
        execute: async (toolName: string, input: unknown) => {
          testVbaCalls.push({ toolName, input });
          const params = input as Record<string, unknown>;
          const dryRun = params.dryRun === true;

          // Simulate ensureTestProceduresAllowed gate behavior:
          // Gate rejects when no allowlist AND no dryRun escape hatch
          if (allowedProcedures === undefined || allowedProcedures.length === 0) {
            if (dryRun !== true) {
              return failureResult(
                createDysflowError(
                  "MCP_INPUT_INVALID",
                  `Refusing to execute test_vba plan [Test_A]: ` +
                    `project config must declare allowedProcedures (with every procedure in the list) ` +
                    `OR caller must pass dryRun:true. ` +
                    `Set allowedProcedures in .dysflow/project.json to allow these procedures.`,
                ),
              );
            }
            // dryRun === true: escape hatch, allow
            return successResult({ passed: 0, failed: 0, errors: 0, tests: [] }, { durationMs: 1 });
          }

          // Allowlist is configured: check if all procedures are in the list
          const proceduresJson = params.proceduresJson as string | undefined;
          let procedures: string[] = [];
          if (proceduresJson) {
            try {
              const parsed = JSON.parse(proceduresJson);
              if (Array.isArray(parsed)) {
                procedures = parsed.map((t) =>
                  typeof t === "string" ? t : (t as { procedure: string }).procedure,
                );
              }
            } catch {
              // ignore parse errors for test
            }
          }

          const allowSet = new Set(allowedProcedures);
          const disallowed = procedures.filter((p) => !allowSet.has(p));
          if (disallowed.length > 0) {
            return failureResult(
              createDysflowError(
                "PROCEDURE_NOT_ALLOWED",
                `Refusing to execute test_vba plan: procedure(s) [${disallowed.join(", ")}] ` +
                  `are not in the configured allowedProcedures list.`,
              ),
            );
          }

          return successResult({ passed: 1, failed: 0, errors: 0, tests: [] }, { durationMs: 5 });
        },
      };
    }

    beforeEach(() => {
      testVbaCalls.length = 0;
    });

    it("rejects test_vba before PowerShell side effects with the real VbaSyncAdapter default-deny gate", async () => {
      let executorCalled = false;
      const vbaSyncToolService = new VbaSyncAdapter({
        executor: async () => {
          executorCalled = true;
          return {
            exitCode: 0,
            stdout: "DYSFLOW_RESULT {}",
            stderr: "",
            durationMs: 1,
            timedOut: false,
          };
        },
        env: {},
        cwd: process.cwd(),
        allowedProcedures: undefined,
      });
      const services = createFakeServices({ vbaSyncToolService });
      const server = await startTestServer({ services, writesEnabled: true });

      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/vba/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proceduresJson: '["Test_A"]' }),
      });

      expect(response.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("MCP_INPUT_INVALID");
      expect(body.error.message).toContain("allowedProcedures");
      expect(body.error.message).toContain("dryRun:true");
      expect(executorCalled).toBe(false);
    });

    it("allows test_vba with dryRun:true as the explicit escape hatch", async () => {
      const vbaSyncToolService = createFakeVbaSyncToolService(undefined);
      const services = createFakeServices({ vbaSyncToolService });
      const server = await startTestServer({ services, writesEnabled: true });

      const { response, body } = await readJson<{ ok: true; data: unknown }>(
        `${server.url}/vba/test`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ proceduresJson: '["Test_A"]', dryRun: true }),
        },
      );

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      // Assert side effect DID occur: vbaSyncToolService was called
      expect(testVbaCalls).toHaveLength(1);
      expect(testVbaCalls[0]?.toolName).toBe("test_vba");
    });

    it("allows test_vba when allowedProcedures is configured and procedure is in the list", async () => {
      const vbaSyncToolService = createFakeVbaSyncToolService(["Test_A", "Test_B"]);
      const services = createFakeServices({ vbaSyncToolService });
      const server = await startTestServer({
        services,
        writesEnabled: true,
        allowedProcedures: ["Test_A", "Test_B"],
      });

      const { response, body } = await readJson<{ ok: true; data: unknown }>(
        `${server.url}/vba/test`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ proceduresJson: '["Test_A"]' }),
        },
      );

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(testVbaCalls).toHaveLength(1);
    });

    it("rejects test_vba when allowedProcedures is configured but procedure is NOT in the list", async () => {
      const vbaSyncToolService = createFakeVbaSyncToolService(["Test_A", "Test_B"]);
      const services = createFakeServices({ vbaSyncToolService });
      const server = await startTestServer({
        services,
        writesEnabled: true,
        allowedProcedures: ["Test_A", "Test_B"],
      });

      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/vba/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proceduresJson: '["Test_C"]' }), // Test_C not in allowlist
      });

      expect(response.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("PROCEDURE_NOT_ALLOWED");
      expect(testVbaCalls).toHaveLength(1); // Gate is inside adapter, so call happens
    });

    it.each([
      ["accessPath", "C:/other/project.accdb"],
      ["projectId", "other-project"],
      ["testsPath", "C:/outside/tests.vba.json"],
      ["testsPath", "../outside/tests.vba.json"],
    ])("rejects target override %s so the startup allowlist cannot authorize another target", async (key, value) => {
      const vbaSyncToolService = createFakeVbaSyncToolService(["Test_A"]);
      const services = createFakeServices({ vbaSyncToolService });
      const server = await startTestServer({
        services,
        writesEnabled: true,
        allowedProcedures: ["Test_A"],
      });

      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/vba/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proceduresJson: '["Test_A"]', [key]: value }),
      });

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(testVbaCalls).toEqual([]);
    });

    it("rejects an empty body because HTTP /vba/test requires an inline proceduresJson plan", async () => {
      const vbaSyncToolService = createFakeVbaSyncToolService(undefined);
      const services = createFakeServices({ vbaSyncToolService });
      const server = await startTestServer({ services, writesEnabled: true });

      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/vba/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(testVbaCalls).toEqual([]);
    });

    it.each([
      ["not-json", "VBA_INVALID_TEST_PLAN"],
      ["[]", "VBA_NO_TESTS_SELECTED"],
    ])("maps invalid proceduresJson %s to HTTP 400", async (proceduresJson, expectedCode) => {
      const vbaSyncToolService = new VbaSyncAdapter({
        executor: async () => {
          throw new Error("executor must not run for invalid test plans");
        },
        env: {},
        cwd: process.cwd(),
        allowedProcedures: ["Test_A"],
      });
      const services = createFakeServices({ vbaSyncToolService });
      const server = await startTestServer({ services, writesEnabled: true });

      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/vba/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proceduresJson }),
      });

      expect(response.status).toBe(400);
      expect(body.error.code).toBe(expectedCode);
    });

    it("returns 403 when writesEnabled is false (same as /vba/execute gate)", async () => {
      const vbaSyncToolService = createFakeVbaSyncToolService(undefined);
      const services = createFakeServices({ vbaSyncToolService });
      const server = await startTestServer({ services, writesEnabled: false });

      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/vba/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proceduresJson: '["Test_A"]' }),
      });

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("HTTP_WRITES_DISABLED");
      expect(testVbaCalls).toEqual([]); // No side effect: writes disabled check comes first
    });

    it("returns 500 when vbaSyncToolService is not configured", async () => {
      const services = createFakeServices({ vbaSyncToolService: undefined });
      const server = await startTestServer({ services, writesEnabled: true });

      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/vba/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proceduresJson: '["Test_A"]' }),
      });

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("HTTP Bearer Authentication", () => {
    it("allows `/health` path without token", async () => {
      const server = await startTestServer({ httpToken: "my-secret-token" });
      const { response, body } = await readJson<Record<string, unknown>>(`${server.url}/health`);
      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
    });

    it("rejects `/query/read` with 401 when Authorization header is missing", async () => {
      const server = await startTestServer({ httpToken: "my-secret-token" });
      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql: "SELECT * FROM Users;" }),
      });
      expect(response.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("HTTP_UNAUTHORIZED");
    });

    it("rejects `/query/read` with 401 when token is invalid", async () => {
      const server = await startTestServer({ httpToken: "my-secret-token" });
      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer wrong-token",
        },
        body: JSON.stringify({ sql: "SELECT * FROM Users;" }),
      });
      expect(response.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("HTTP_UNAUTHORIZED");
    });

    it("accepts `/query/read` with 200 when valid token is provided", async () => {
      const server = await startTestServer({ httpToken: "my-secret-token" });
      const { response, body } = await readJson<Record<string, unknown>>(
        `${server.url}/query/read`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: "Bearer my-secret-token",
          },
          body: JSON.stringify({ sql: "SELECT * FROM Users;" }),
        },
      );
      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
    });

    it("rejects `/query/read` with 401 when token has same length but wrong value (timing-safe compare)", async () => {
      // This exercises the timingSafeEqual path: same byte length, wrong content.
      // A naive string compare already rejects this, but with timingSafeEqual the guard
      // must NOT throw even when both buffers have the same length.
      const server = await startTestServer({ httpToken: "secret-token-16b" });
      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer secret-token-BAD",
        },
        body: JSON.stringify({ sql: "SELECT * FROM Users;" }),
      });
      expect(response.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("HTTP_UNAUTHORIZED");
    });

    it("rejects `/query/read` with 401 (not 500) when token has a different length — length guard must prevent timingSafeEqual throw", async () => {
      // timingSafeEqual THROWS if the two buffers differ in length.
      // Without the length guard this would produce a 500 Internal Server Error.
      // This test asserts the server returns 401 and does NOT throw/500.
      const server = await startTestServer({ httpToken: "short" });
      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer a-much-longer-wrong-token",
        },
        body: JSON.stringify({ sql: "SELECT * FROM Users;" }),
      });
      expect(response.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("HTTP_UNAUTHORIZED");
    });

    it("rejects `/query/read` with 401 when an empty token string is sent (missing after Bearer prefix)", async () => {
      const server = await startTestServer({ httpToken: "my-secret-token" });
      const { response, body } = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer ",
        },
        body: JSON.stringify({ sql: "SELECT * FROM Users;" }),
      });
      expect(response.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("HTTP_UNAUTHORIZED");
    });
  });

  describe("HTTP Request Body Validation", () => {
    it("rejects POST /access/cleanup with missing or empty operationId", async () => {
      const server = await startTestServer();
      const response = await readJson<HttpErrorBody>(`${server.url}/access/cleanup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessPath: "C:/db/front.accdb" }),
      });
      expect(response.response.status).toBe(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(response.body.error.message).toContain("operationId is required");

      const response2 = await readJson<HttpErrorBody>(`${server.url}/access/cleanup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationId: "   ", accessPath: "C:/db/front.accdb" }),
      });
      expect(response2.response.status).toBe(400);
      expect(response2.body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(response2.body.error.message).toContain(
        "operationId must be at least 1 non-whitespace character",
      );
    });

    it("rejects POST /query/read with missing sql or extra fields", async () => {
      const server = await startTestServer();
      const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.response.status).toBe(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(response.body.error.message).toContain("sql is required");

      const response2 = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql: "SELECT 1", extra: "field" }),
      });
      expect(response2.response.status).toBe(400);
      expect(response2.body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(response2.body.error.message).toContain("extra is not allowed");
    });

    it("rejects POST /query/write with missing sql or extra fields", async () => {
      const server = await startTestServer({ writesEnabled: true });
      const response = await readJson<HttpErrorBody>(`${server.url}/query/write`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.response.status).toBe(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(response.body.error.message).toContain("sql is required");

      const response2 = await readJson<HttpErrorBody>(`${server.url}/query/write`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql: "UPDATE People SET name='Ada'", extra: "field" }),
      });
      expect(response2.response.status).toBe(400);
      expect(response2.body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(response2.body.error.message).toContain("extra is not allowed");
    });

    it("rejects POST /vba/execute with missing moduleName/procedureName or arguments not as array", async () => {
      const server = await startTestServer({ writesEnabled: true });
      const response = await readJson<HttpErrorBody>(`${server.url}/vba/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moduleName: "Automation" }),
      });
      expect(response.response.status).toBe(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(response.body.error.message).toContain("procedureName is required");

      const response2 = await readJson<HttpErrorBody>(`${server.url}/vba/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          moduleName: "Automation",
          procedureName: "Refresh",
          arguments: "not-an-array",
        }),
      });
      expect(response2.response.status).toBe(400);
      expect(response2.body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(response2.body.error.message).toContain("arguments must be an array");
    });

    it("redacts httpToken, accessPassword, and backendPassword in validation error messages", async () => {
      const server = await startTestServer({
        httpToken: "dummy-token-val",
        env: {
          DYSFLOW_ACCESS_PASSWORD: "dummy-access-pwd",
          DYSFLOW_BACKEND_PASSWORD: "dummy-backend-pwd",
        },
      });

      const response = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer dummy-token-val",
        },
        body: JSON.stringify({
          sql: "SELECT 1",
          "dummy-token-val-key": "some-val",
        }),
      });

      expect(response.response.status).toBe(400);
      expect(response.body.error.code).toBe("HTTP_INVALID_INPUT");
      expect(response.body.error.message).toContain("[REDACTED]-key is not allowed");
      expect(response.body.error.message).not.toContain("dummy-token-val");

      const response2 = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer dummy-token-val",
        },
        body: JSON.stringify({
          sql: "SELECT 1",
          "dummy-access-pwd-key": "some-val",
        }),
      });

      expect(response2.response.status).toBe(400);
      expect(response2.body.error.message).toContain("[REDACTED]-key is not allowed");
      expect(response2.body.error.message).not.toContain("dummy-access-pwd");

      const response3 = await readJson<HttpErrorBody>(`${server.url}/query/read`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer dummy-token-val",
        },
        body: JSON.stringify({
          sql: "SELECT 1",
          "dummy-backend-pwd-key": "some-val",
        }),
      });

      expect(response3.response.status).toBe(400);
      expect(response3.body.error.message).toContain("[REDACTED]-key is not allowed");
      expect(response3.body.error.message).not.toContain("dummy-backend-pwd");
    });
  });

  describe("getStringParam helper", () => {
    it("extracts a string parameter successfully", () => {
      expect(getStringParam({ sql: "SELECT * FROM T" }, "sql")).toBe("SELECT * FROM T");
      expect(getStringParam({ sql: "" }, "sql")).toBe("");
    });

    it("throws an error when parameter is missing or not a string", () => {
      expect(() => getStringParam({ sql: 123 }, "sql")).toThrow("Parameter 'sql' must be a string");
      expect(() => getStringParam({}, "sql")).toThrow("Parameter 'sql' must be a string");
    });
  });
});
