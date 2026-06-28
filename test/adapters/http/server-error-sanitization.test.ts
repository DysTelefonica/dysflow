import { mkdtemp } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDysflowHttpServer } from "../../../src/adapters/http/server.js";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../../src/core/contracts/index.js";
import { FileAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";

const startedServers: Server[] = [];

type HttpServerOptions = NonNullable<Parameters<typeof startDysflowHttpServer>[0]>;
type HttpServices = NonNullable<HttpServerOptions["services"]>;
type HttpErrorBody = {
  ok: false;
  error: { code: string; message: string; retryable?: boolean };
  diagnostics: unknown[];
  durationMs: number;
};

async function startTestServer(
  options: HttpServerOptions,
  passwordOverrides: { accessPassword?: string; backendPassword?: string; httpToken?: string } = {},
): Promise<{ server: Server; url: string }> {
  const started = await startDysflowHttpServer({
    host: "127.0.0.1",
    port: 0,
    ...options,
    httpToken: passwordOverrides.httpToken ?? options.httpToken,
    accessPassword: passwordOverrides.accessPassword ?? options.accessPassword,
    backendPassword: passwordOverrides.backendPassword ?? options.backendPassword,
  });
  startedServers.push(started.server);
  return { server: started.server, url: started.url };
}

function createFakeServices(overrides: Partial<HttpServices> = {}): HttpServices {
  return {
    diagnosticsService: {
      run: async () => successResult({ checks: [] }, { durationMs: 1 }),
    },
    queryService: {
      execute: async () => successResult({ rows: [] }, { durationMs: 1 }),
    },
    vbaService: {
      execute: async () => successResult({ returnValue: "" }, { durationMs: 1 }),
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

/**
 * Bearer auth helper for tests that configure httpToken. The server enforces
 * `Authorization: Bearer <token>` when an httpToken is set, so the redaction
 * test for httpToken in error messages needs to pass that gate first.
 */
function bearerHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

describe("HTTP error envelope sanitization — DELTA-002 (#576)", () => {
  afterEach(async () => {
    for (const s of startedServers) {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    startedServers.length = 0;
  });

  it("redacts accessPassword from query service failure envelope", async () => {
    const services = createFakeServices({
      queryService: {
        execute: async () =>
          failureResult(
            createDysflowError("RUNNER_FAILED", "open failed for db using pwd super-secret", {}),
          ),
      },
    });
    const { url } = await startTestServer(
      { services, accessPassword: "super-secret" },
      { accessPassword: "super-secret" },
    );

    const { response, body } = await readJson<HttpErrorBody>(`${url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1" }),
    });

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("RUNNER_FAILED");
    expect(body.error.message).not.toContain("super-secret");
    expect(body.error.message).toContain("[REDACTED]");
  });

  it("redacts backendPassword from cleanup service failure envelope", async () => {
    const services = createFakeServices({
      cleanupService: {
        cleanup: async () =>
          failureResult(
            createDysflowError("CLEANUP_FAILED", "relink failed: backend-secret invalid", {}),
          ),
      },
    });
    const { url } = await startTestServer(
      { services, backendPassword: "backend-secret" },
      { backendPassword: "backend-secret" },
    );

    const { response, body } = await readJson<HttpErrorBody>(`${url}/access/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId: "op-1", accessPath: "C:/db/front.accdb" }),
    });

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("CLEANUP_FAILED");
    expect(body.error.message).not.toContain("backend-secret");
    expect(body.error.message).toContain("[REDACTED]");
  });

  it("redacts httpToken from any failure envelope (with bearer auth)", async () => {
    const services = createFakeServices({
      queryService: {
        execute: async () =>
          failureResult(
            createDysflowError("RUNNER_FAILED", "auth failed for token tok-abc-123", {}),
          ),
      },
    });
    const { url } = await startTestServer(
      { services, httpToken: "tok-abc-123" },
      { httpToken: "tok-abc-123" },
    );

    const { response, body } = await readJson<HttpErrorBody>(`${url}/query/read`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...bearerHeaders("tok-abc-123"),
      },
      body: JSON.stringify({ sql: "SELECT 1" }),
    });

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("RUNNER_FAILED");
    expect(body.error.message).not.toContain("tok-abc-123");
    expect(body.error.message).toContain("[REDACTED]");
  });

  it("strips ;PWD=... fragments from error message even without an explicit secret", async () => {
    const services = createFakeServices({
      queryService: {
        execute: async () =>
          failureResult(
            createDysflowError(
              "ODBC_CONNECT_FAILED",
              "Provider=MSDASQL;PWD=hunter2;Database=foo",
              {},
            ),
          ),
      },
    });
    const { url } = await startTestServer({ services });

    const { response, body } = await readJson<HttpErrorBody>(`${url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1" }),
    });

    expect(response.status).toBe(500);
    expect(body.error.message).not.toContain("hunter2");
    expect(body.error.message).not.toContain(";PWD=");
  });

  it("preserves error.code and error.retryable byte-for-byte after sanitization", async () => {
    const services = createFakeServices({
      queryService: {
        execute: async () =>
          failureResult({
            code: "RUNNER_FAILED",
            message: "auth failed for token tok-xyz-999",
            retryable: true,
          }),
      },
    });
    const { url } = await startTestServer(
      { services, httpToken: "tok-xyz-999" },
      { httpToken: "tok-xyz-999" },
    );

    const { response, body } = await readJson<HttpErrorBody>(`${url}/query/read`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...bearerHeaders("tok-xyz-999"),
      },
      body: JSON.stringify({ sql: "SELECT 1" }),
    });

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("RUNNER_FAILED");
    expect(body.error.retryable).toBe(true);
    expect(body.error.message).not.toContain("tok-xyz-999");
  });

  it("does not sanitize success envelopes (payload content is preserved)", async () => {
    const services = createFakeServices({
      queryService: {
        execute: async () =>
          successResult({ rows: [{ id: 1, label: "secret-token-kept" }] }, { durationMs: 1 }),
      },
    });
    const { url } = await startTestServer({ services });

    const { response, body } = await readJson<{
      ok: true;
      data: { rows: Array<{ id: number; label: string }> };
    }>(`${url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1" }),
    });

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.rows[0]?.label).toBe("secret-token-kept");
  });

  it("also redacts accessPassword from validation errors (handleValidation path)", async () => {
    const services = createFakeServices();
    const { url } = await startTestServer(
      { services, accessPassword: "super-secret" },
      { accessPassword: "super-secret" },
    );

    const { response, body } = await readJson<HttpErrorBody>(`${url}/query/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // sql is missing → validation error.
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("HTTP_INVALID_INPUT");
    // The validation message itself should not contain the secret.
    expect(body.error.message).not.toContain("super-secret");
  });
});

// Compatibility aliases — keep imports referenced so the test file stays
// self-contained and a future reader sees the dependency surface.
void FileAccessOperationRegistry;
void ({} as OperationResult<unknown>);
void createServer;
void ({} as IncomingMessage);
void ({} as ServerResponse);
void tmpdir;
void mkdtemp;
void join;
