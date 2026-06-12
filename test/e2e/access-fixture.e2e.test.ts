delete process.env.DYSFLOW_HOME;

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDysflowHttpServer } from "../../src/adapters/http/server";
import { createDefaultPowerShellExecutor } from "../../src/adapters/powershell/default-executor.js";
import { loadDysflowConfig } from "../../src/core/config/dysflow-config";
import { AccessPowerShellRunner } from "../../src/core/runner/access-runner";
import { AccessDiagnosticsService } from "../../src/core/services/diagnostics-service";
import { AccessQueryService } from "../../src/core/services/query-service";
import { AccessVbaService } from "../../src/core/services/vba-service";

const fixtureFront = resolve("E2E_testing/NoConformidades.accdb");
const fixtureBackend = resolve("E2E_testing/NoConformidades_Datos.accdb");
const canRunAccessE2e =
  existsSync(fixtureFront) &&
  existsSync(fixtureBackend) &&
  hasAccessCom() &&
  process.env.DYSFLOW_MOCK_COM !== "1";
const startedServers: Server[] = [];

if (!canRunAccessE2e) {
  console.warn(
    "[dysflow] Skipping Access fixture E2E: Access COM or E2E_testing/*.accdb fixtures are unavailable.",
  );
}

function hasAccessCom(): boolean {
  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "try { $a = New-Object -ComObject Access.Application; $a.Quit(); 'ok' } catch { 'missing' }",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 20_000 },
    );
    return output.includes("ok");
  } catch {
    return false;
  }
}

function createAccessFixtureWorkspace(): { root: string; cleanup(): void } {
  const root = join(
    tmpdir(),
    `dysflow-access-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  cpSync(fixtureFront, join(root, "NoConformidades.accdb"));
  cpSync(fixtureBackend, join(root, "NoConformidades_Datos.accdb"));
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    `${JSON.stringify(
      {
        id: "dysflow-access-e2e",
        accessPath: "NoConformidades.accdb",
        backendPath: "NoConformidades_Datos.accdb",
        destinationRoot: "src",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function createAccessFixtureRunner(): AccessPowerShellRunner {
  return new AccessPowerShellRunner({
    executor: createDefaultPowerShellExecutor(),
    scriptPath: resolve("scripts/dysflow-access-runner.ps1"),
  });
}

afterEach(async () => {
  await Promise.all(
    startedServers.splice(0).map(
      (server) =>
        new Promise<void>((resolveClose, reject) => {
          server.close((error) => (error ? reject(error) : resolveClose()));
        }),
    ),
  );
});

describe.skipIf(!canRunAccessE2e)("Access fixture E2E", () => {
  it("compares against backend database using backend password environment", async () => {
    const workspace = createAccessFixtureWorkspace();
    try {
      const config = loadDysflowConfig({
        cwd: workspace.root,
        env: {
          DYSFLOW_BACKEND_PASSWORD: process.env.DYSFLOW_BACKEND_PASSWORD ?? "backend-secret",
          DYSFLOW_ACCESS_PASSWORD: process.env.DYSFLOW_ACCESS_PASSWORD,
          ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD,
        },
      });
      expect(config.ok).toBe(true);
      if (!config.ok) throw new Error(config.error.message);

      const runner = createAccessFixtureRunner();
      const queryService = new AccessQueryService({ runner, config: config.data });

      const result = await queryService.execute({
        sql: "SELECT 1",
        mode: "read",
        action: "compare_backends",
        backendPath: join(workspace.root, "NoConformidades_Datos.accdb"),
      });

      expect(result).toMatchObject({
        ok: true,
        data: {
          comparison: {
            backendPath: join(workspace.root, "NoConformidades_Datos.accdb"),
          },
        },
      });
    } finally {
      workspace.cleanup();
    }
  }, 60_000);

  it("relinks backend-maintained tables using backend password environment", async () => {
    const workspace = createAccessFixtureWorkspace();
    try {
      const config = loadDysflowConfig({
        cwd: workspace.root,
        env: {
          DYSFLOW_BACKEND_PASSWORD: process.env.DYSFLOW_BACKEND_PASSWORD ?? "backend-secret",
          DYSFLOW_ACCESS_PASSWORD: process.env.DYSFLOW_ACCESS_PASSWORD,
          ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD,
        },
      });
      expect(config.ok).toBe(true);
      if (!config.ok) throw new Error(config.error.message);

      const runner = createAccessFixtureRunner();
      const queryService = new AccessQueryService({ runner, config: config.data });

      const result = await queryService.execute({
        sql: "",
        mode: "write",
        action: "relink_tables",
        backendPath: join(workspace.root, "NoConformidades_Datos.accdb"),
      });

      expect(result).toMatchObject({
        ok: true,
        data: {
          backendPath: join(workspace.root, "NoConformidades_Datos.accdb"),
        },
      });
    } finally {
      workspace.cleanup();
    }
  }, 60_000);

  it("serves diagnostics and read SQL through the real Access runner", async () => {
    const workspace = createAccessFixtureWorkspace();
    try {
      const config = loadDysflowConfig({
        cwd: workspace.root,
        env: {
          DYSFLOW_ACCESS_PASSWORD: process.env.DYSFLOW_ACCESS_PASSWORD,
          ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD,
          DYSFLOW_BACKEND_PASSWORD: process.env.DYSFLOW_BACKEND_PASSWORD,
        },
      });
      expect(config.ok).toBe(true);
      if (!config.ok) throw new Error(config.error.message);

      const runner = createAccessFixtureRunner();
      const server = await startDysflowHttpServer({
        host: "127.0.0.1",
        port: 0,
        services: {
          diagnosticsService: new AccessDiagnosticsService({ runner, config: config.data }),
          queryService: new AccessQueryService({ runner, config: config.data }),
          vbaService: new AccessVbaService({ runner, config: config.data }),
        },
      });
      startedServers.push(server.server);

      const diagnostics = await fetch(`${server.url}/diagnostics`).then(async (response) => ({
        response,
        body: (await response.json()) as Record<string, unknown>,
      }));
      const query = await fetch(`${server.url}/query/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql: "SELECT 1 AS One" }),
      }).then(async (response) => ({
        response,
        body: (await response.json()) as Record<string, unknown>,
      }));

      if (diagnostics.response.status !== 200 || query.response.status !== 200) {
        console.error("DIAGNOSTICS BODY:", diagnostics.body);
        console.error("QUERY BODY:", query.body);
      }

      expect(diagnostics.response.status).toBe(200);
      expect(diagnostics.body).toMatchObject({ ok: true });
      expect(query.response.status).toBe(200);
      expect(query.body).toMatchObject({ ok: true, data: { rows: [{ One: 1 }] } });
    } finally {
      workspace.cleanup();
    }
  }, 60_000);

  // ------------------------------------------------------------------
  // v1.2.32 regression: the runner must default to the project's
  // configured backendPath when the request omits it. Without this
  // defaulting, list_tables silently reads the frontend (which has
  // only two local tables), get_schema and query_sql throw without
  // emitting the DYSFLOW_RESULT sentinel, and the MCP caller only
  // sees the opaque "RUNNER_INVALID_JSON: No DYSFLOW_RESULT line".
  // These tests reproduce the exact symptoms the user reported in
  // issue 18 against the 00-no-conformidades-staging-clean project
  // on a setup that looked identical to a working environment.
  // ------------------------------------------------------------------

  it("list_tables with project cwd and no explicit backendPath reads the backend (regression: must NOT return only the 2 frontend tables)", async () => {
    const workspace = createAccessFixtureWorkspace();
    try {
      const config = loadDysflowConfig({
        cwd: workspace.root,
        env: { ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD ?? "dpddpd" },
      });
      expect(config.ok).toBe(true);
      if (!config.ok) throw new Error(config.error.message);

      const runner = createAccessFixtureRunner();
      const queryService = new AccessQueryService({ runner, config: config.data });

      // Caller passes ONLY the project cwd. The request has no
      // backendPath and no databasePath. The runner MUST default
      // to config.backendPath and return the backend tables. If
      // the runner silently falls back to the frontend, this
      // returns the 2 local tables (TbConfiguracionBackends,
      // TbTipologiaAux) and the test fails with a clear message.
      const result = await queryService.execute({
        sql: "",
        mode: "read",
        action: "list_tables",
      });

      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) throw new Error(`list_tables failed: ${result.error.message}`);
      const tables = result.data.tables ?? [];
      // The fixture backend has 40+ tables. The frontend has 2. We
      // require at least 10 to be confident we're reading the
      // backend, not the frontend.
      expect(tables.length).toBeGreaterThanOrEqual(10);
      // The 2 frontend-only tables MUST NOT be the only result.
      const onlyFrontend =
        tables.length === 2 &&
        tables.includes("TbConfiguracionBackends") &&
        tables.includes("TbTipologiaAux");
      expect(onlyFrontend).toBe(false);
    } finally {
      workspace.cleanup();
    }
  }, 60_000);

  it("get_schema with project cwd and no explicit backendPath returns structured DYSFLOW_RESULT (regression: must NOT return RUNNER_INVALID_JSON)", async () => {
    const workspace = createAccessFixtureWorkspace();
    try {
      const config = loadDysflowConfig({
        cwd: workspace.root,
        env: { ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD ?? "dpddpd" },
      });
      expect(config.ok).toBe(true);
      if (!config.ok) throw new Error(config.error.message);

      const runner = createAccessFixtureRunner();
      const queryService = new AccessQueryService({ runner, config: config.data });

      // Use a table that exists in the backend fixture. If the
      // runner correctly resolves the backend, this returns the
      // schema array. If it falls back to the frontend (where the
      // table does NOT exist), the runner throws "table not
      // found" mid-execution and the MCP caller surfaces
      // RUNNER_INVALID_JSON.
      const result = await queryService.execute({
        sql: "",
        mode: "read",
        action: "get_schema",
        tableName: "TbNoConformidades",
      });

      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) throw new Error(`get_schema failed: ${result.error.message}`);
      const schema = (result.data.schema ?? []) as Array<{ name: string }>;
      expect(schema.length).toBeGreaterThan(0);
      // The schema should have a primary key column.
      const hasIdColumn = schema.some((c) => /^ID/i.test(c.name));
      expect(hasIdColumn).toBe(true);
    } finally {
      workspace.cleanup();
    }
  }, 60_000);

  it("query_sql against a backend table returns structured rows (regression: must NOT return RUNNER_INVALID_JSON)", async () => {
    const workspace = createAccessFixtureWorkspace();
    try {
      const config = loadDysflowConfig({
        cwd: workspace.root,
        env: { ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD ?? "dpddpd" },
      });
      expect(config.ok).toBe(true);
      if (!config.ok) throw new Error(config.error.message);

      const runner = createAccessFixtureRunner();
      const queryService = new AccessQueryService({ runner, config: config.data });

      const result = await queryService.execute({
        sql: "SELECT TOP 1 * FROM TbNoConformidades",
        mode: "read",
        action: "query_sql",
      });

      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) throw new Error(`query_sql failed: ${result.error.message}`);
      const rows = result.data.rows ?? [];
      expect(rows.length).toBe(1);
    } finally {
      workspace.cleanup();
    }
  }, 60_000);
});
