/**
 * Issue #1942 — `query_execute` with `target:"backend"` must run its SQL
 * against the backend database, for writes as for reads.
 *
 * Two defects were observed through the MCP surface:
 *
 * - `target:"backend"` + `backendPath` + `accessPath` executed against the
 *   frontend `accessPath`, because the request builder filled `databasePath`
 *   from `accessPath` and an explicit `databasePath` outranks `backendPath`.
 * - `databasePath:<backend>` + `accessPath:<frontend>` was rejected for a write
 *   with `CONFLICTING_TARGET_ALIASES`, although the same pair works for a read:
 *   a `databasePath` that names the configured backend is a backend selector,
 *   not a second frontend alias.
 *
 * The test drives the tools with real project-config resolution, the real
 * query service and the real Access runner; only the PowerShell executor is
 * replaced. It records the database the runner script would open, using the
 * script's own payload precedence (databasePath > sourcePath > backendPath).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import { createDynamicServices } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { nodeLockFileSystem } from "../../../src/adapters/runner/node-lock-file-system.js";
import type { PowerShellExecutor } from "../../../src/core/contracts/index.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";
import { AccessPowerShellRunner, RESULT_MARKER } from "../../../src/core/runner/access-runner.js";
import { AccessQueryService } from "../../../src/core/services/query-service.js";

const roots: string[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/** The database the runner script opens for a payload (scripts/dysflow-access-runner.ps1). */
function scriptTargetPath(args: readonly string[]): string | undefined {
  const payloadIndex = args.indexOf("-PayloadJson");
  const payload = JSON.parse(args[payloadIndex + 1] ?? "{}") as Record<string, unknown>;
  for (const key of ["databasePath", "sourcePath", "backendPath"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "dysflow-1942-"));
  roots.push(root);
  const worktree = join(root, "worktree");
  mkdirSync(join(worktree, ".dysflow"), { recursive: true });
  mkdirSync(join(worktree, "src"), { recursive: true });
  writeFileSync(join(worktree, ".git"), "gitdir: fixture", "utf8");
  const frontend = join(worktree, "App.accdb");
  const backend = join(worktree, "App_Datos.accdb");
  const other = join(worktree, "Other.accdb");
  for (const file of [frontend, backend, other]) writeFileSync(file, "", "utf8");
  writeFileSync(
    join(worktree, ".dysflow", "project.json"),
    JSON.stringify({
      id: "issue-1942",
      accessPath: "App.accdb",
      backendPath: "App_Datos.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites: true },
    }),
    "utf8",
  );

  const targets: (string | undefined)[] = [];
  const executor: PowerShellExecutor = async (_command, args) => {
    targets.push(scriptTargetPath(args));
    return {
      exitCode: 0,
      stdout: `${RESULT_MARKER}${JSON.stringify({ rows: [], rowsAffected: 1 })}`,
      stderr: "",
      durationMs: 1,
      timedOut: false,
    };
  };
  const services = createDynamicServices(undefined, undefined, {
    cwd: worktree,
    env: {},
    serviceFactory: (config) => ({
      vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
      queryService: new AccessQueryService({
        config,
        runner: new AccessPowerShellRunner({
          executor,
          operationRegistry: new InMemoryAccessOperationRegistry(),
          lockFileSystem: nodeLockFileSystem,
          fileExists: () => true,
          preflightCleanup: {
            cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
          },
        }),
      }),
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    }),
  });
  // The project-config write gate is wired exactly as the stdio adapter does.
  const tools = createDysflowMcpTools({
    services,
    writes: true,
    cwd: worktree,
    projectConfigResolver: (input, cwd = worktree) =>
      diagnoseProjectConfig(cwd, isRecord(input) ? input : {}),
  });
  const call = async (name: string, input: Record<string, unknown>) => {
    const tool = tools.find((candidate) => candidate.name === name);
    if (tool === undefined) throw new Error(`missing ${name} tool`);
    return tool.handler({ cwd: worktree, ...input });
  };
  return { call, targets, frontend, backend, other };
}

function text(result: { content: readonly { text?: string }[] }): string {
  return result.content.map((entry) => entry.text ?? "").join("\n");
}

const INSERT = "INSERT INTO TbAnexos (IDAnexo, Titulo) VALUES (900699, 'x')";
const SELECT = "SELECT TOP 1 IDAnexo FROM TbAnexos";

describe("issue #1942 — query_execute target:'backend' resolves the backend", () => {
  it("writes with target:'backend' + backendPath against the backend, not the accessPath", async () => {
    const h = await harness();
    const result = await h.call("query_execute", {
      accessPath: h.frontend,
      backendPath: h.backend,
      target: "backend",
      mode: "write",
      apply: true,
      sql: INSERT,
    });
    expect(result.isError, text(result)).toBe(false);
    expect(h.targets).toEqual([h.backend]);
  });

  it("writes with target:'backend' alone against the configured backend", async () => {
    const h = await harness();
    const result = await h.call("query_execute", {
      accessPath: h.frontend,
      target: "backend",
      mode: "write",
      apply: true,
      sql: INSERT,
    });
    expect(result.isError, text(result)).toBe(false);
    expect(h.targets).toEqual([h.backend]);
  });

  it("accepts for a write the databasePath:<backend> + accessPath pair a read accepts", async () => {
    const h = await harness();
    const shared = { accessPath: h.frontend, databasePath: h.backend, target: "backend" };
    const read = await h.call("query_execute", { ...shared, mode: "read", sql: SELECT });
    const write = await h.call("query_execute", {
      ...shared,
      mode: "write",
      apply: true,
      sql: INSERT,
    });
    expect(read.isError, text(read)).toBe(false);
    expect(write.isError, text(write)).toBe(false);
    expect(text(write)).not.toContain("CONFLICTING_TARGET_ALIASES");
    expect(h.targets).toEqual([h.backend, h.backend]);
  });

  it("reads with target:'backend' + backendPath against the backend, for query_sql too", async () => {
    const h = await harness();
    const shared = { accessPath: h.frontend, backendPath: h.backend, target: "backend" };
    const viaExecute = await h.call("query_execute", { ...shared, mode: "read", sql: SELECT });
    const viaSql = await h.call("query_sql", { ...shared, sql: SELECT });
    expect(viaExecute.isError, text(viaExecute)).toBe(false);
    expect(viaSql.isError, text(viaSql)).toBe(false);
    expect(h.targets).toEqual([h.backend, h.backend]);
  });

  it("keeps target:'frontend' and an untargeted accessPath on the frontend", async () => {
    const h = await harness();
    const frontendWrite = await h.call("query_execute", {
      accessPath: h.frontend,
      backendPath: h.backend,
      target: "frontend",
      mode: "write",
      apply: true,
      sql: INSERT,
    });
    const untargetedRead = await h.call("query_execute", {
      accessPath: h.frontend,
      mode: "read",
      sql: SELECT,
    });
    expect(frontendWrite.isError, text(frontendWrite)).toBe(false);
    expect(untargetedRead.isError, text(untargetedRead)).toBe(false);
    expect(h.targets).toEqual([h.frontend, h.frontend]);
  });

  it("still rejects two different frontend aliases for a write", async () => {
    const h = await harness();
    const result = await h.call("query_execute", {
      accessPath: h.frontend,
      databasePath: h.other,
      mode: "write",
      apply: true,
      sql: INSERT,
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("CONFLICTING_TARGET_ALIASES");
    expect(h.targets).toEqual([]);
  });

  it("keeps the write gate: no apply plans, writes disabled refuses", async () => {
    const h = await harness();
    const shared = {
      accessPath: h.frontend,
      backendPath: h.backend,
      target: "backend",
      mode: "write",
      sql: INSERT,
    };
    const preview = await h.call("query_execute", shared);
    expect(preview.isError, text(preview)).toBe(false);
    expect(h.targets).toEqual([]);

    const locked = createDysflowMcpTools({
      services: createDynamicServices(undefined, undefined, { env: {} }),
      writes: false,
    }).find((tool) => tool.name === "query_execute");
    const refused = await locked?.handler({ ...shared, apply: true });
    expect(text(refused ?? { content: [] })).toContain("MCP_WRITES_DISABLED");
    expect(h.targets).toEqual([]);
  });
});
