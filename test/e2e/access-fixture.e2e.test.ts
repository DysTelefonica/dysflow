import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { startDysflowHttpServer } from "../../src/adapters/http/server";
import { loadDysflowConfig } from "../../src/core/config/dysflow-config";
import { AccessPowerShellRunner } from "../../src/core/runner/access-runner";
import { AccessDiagnosticsService } from "../../src/core/services/diagnostics-service";
import { AccessQueryService } from "../../src/core/services/query-service";
import { AccessVbaService } from "../../src/core/services/vba-service";
import type { Server } from "node:http";

const fixtureFront = resolve("E2E_testing/NoConformidades.accdb");
const fixtureBackend = resolve("E2E_testing/NoConformidades_Datos.accdb");
const canRunAccessE2e = existsSync(fixtureFront) && existsSync(fixtureBackend) && hasAccessCom();
const startedServers: Server[] = [];

function hasAccessCom(): boolean {
  try {
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "try { $a = New-Object -ComObject Access.Application; $a.Quit(); 'ok' } catch { 'missing' }"],
      { encoding: "utf8", windowsHide: true, timeout: 20_000 },
    );
    return output.includes("ok");
  } catch {
    return false;
  }
}

function createAccessFixtureWorkspace(): { root: string; cleanup(): void } {
  const root = join(tmpdir(), `dysflow-access-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  cpSync(fixtureFront, join(root, "NoConformidades.accdb"));
  cpSync(fixtureBackend, join(root, "NoConformidades_Datos.accdb"));
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    `${JSON.stringify({
      id: "dysflow-access-e2e",
      accessPath: "NoConformidades.accdb",
      backendPath: "NoConformidades_Datos.accdb",
      destinationRoot: "src",
    }, null, 2)}\n`,
    "utf8",
  );
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

afterEach(async () => {
  await Promise.all(startedServers.splice(0).map((server) => new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  })));
});

describe.skipIf(!canRunAccessE2e)("Access fixture E2E", () => {
  it("serves diagnostics and read SQL through the real Access runner", async () => {
    const workspace = createAccessFixtureWorkspace();
    try {
      const config = loadDysflowConfig({ cwd: workspace.root, env: {} });
      expect(config.ok).toBe(true);
      if (!config.ok) throw new Error(config.error.message);

      const runner = new AccessPowerShellRunner({ scriptPath: resolve("scripts/dysflow-access-runner.ps1") });
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

      const diagnostics = await fetch(`${server.url}/diagnostics`).then(async (response) => ({ response, body: await response.json() as Record<string, unknown> }));
      const query = await fetch(`${server.url}/query/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql: "SELECT 1 AS One" }),
      }).then(async (response) => ({ response, body: await response.json() as Record<string, unknown> }));

      expect(diagnostics.response.status).toBe(200);
      expect(diagnostics.body).toMatchObject({ ok: true });
      expect(query.response.status).toBe(200);
      expect(query.body).toMatchObject({ ok: true, data: { rows: { One: 1 } } });
    } finally {
      workspace.cleanup();
    }
  }, 60_000);
});
