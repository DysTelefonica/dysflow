/**
 * Issue #1944 — a read-only query tool must not modify the frontend `.accdb`.
 *
 * The runner script keeps every byte of the frontend only when it can take its
 * read-only DAO path, which it selects from the payload: `mode: "read"` and
 * the database to open. `scripts/tests/dysflow-access-runner-read-frontend-untouched-1944.Tests.ps1`
 * proves the script side with a byte hash. This suite proves the TypeScript
 * side hands the script that payload, through the MCP tools with real config
 * resolution, the real query service and the real Access runner; only the
 * PowerShell executor is replaced. It also proves a read spawns no extra run
 * that could open the frontend.
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

type RunnerSpawn = { accessDbPath: string | undefined; payload: Record<string, unknown> };

function readSpawn(args: readonly string[]): RunnerSpawn {
  const accessDbPath = args[args.indexOf("-AccessDbPath") + 1];
  const payload = JSON.parse(args[args.indexOf("-PayloadJson") + 1] ?? "{}") as Record<
    string,
    unknown
  >;
  return { accessDbPath, payload };
}

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "dysflow-1944-"));
  roots.push(root);
  const worktree = join(root, "worktree");
  mkdirSync(join(worktree, ".dysflow"), { recursive: true });
  mkdirSync(join(worktree, "src"), { recursive: true });
  writeFileSync(join(worktree, ".git"), "gitdir: fixture", "utf8");
  const frontend = join(worktree, "App.accdb");
  const backend = join(worktree, "App_Datos.accdb");
  for (const file of [frontend, backend]) writeFileSync(file, "", "utf8");
  writeFileSync(
    join(worktree, ".dysflow", "project.json"),
    JSON.stringify({
      id: "issue-1944",
      accessPath: "App.accdb",
      backendPath: "App_Datos.accdb",
      destinationRoot: "src",
    }),
    "utf8",
  );

  const spawns: RunnerSpawn[] = [];
  const executor: PowerShellExecutor = async (_command, args) => {
    spawns.push(readSpawn(args));
    return {
      exitCode: 0,
      stdout: `${RESULT_MARKER}${JSON.stringify({ rows: [], links: [], queries: [] })}`,
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
  return { call, spawns, frontend, backend };
}

function text(result: { content: readonly { text?: string }[] }): string {
  return result.content.map((entry) => entry.text ?? "").join("\n");
}

describe("issue #1944 — read-only query tools hand the runner a read-only payload", () => {
  it("query_execute mode:read with a backend databasePath runs once, as a read of the backend", async () => {
    const h = await harness();
    const result = await h.call("query_execute", {
      accessPath: h.frontend,
      databasePath: h.backend,
      target: "backend",
      mode: "read",
      sql: "SELECT TOP 1 IDAnexo FROM TbAnexos",
    });

    expect(result.isError, text(result)).toBe(false);
    expect(h.spawns).toHaveLength(1);
    expect(h.spawns[0]?.payload).toMatchObject({ mode: "read", databasePath: h.backend });
  });

  it.each(["list_links", "export_queries"])(
    "%s sends mode:read for the frontend, so the runner reads it without Access",
    async (tool) => {
      const h = await harness();
      const result = await h.call(tool, { accessPath: h.frontend });

      expect(result.isError, text(result)).toBe(false);
      expect(h.spawns).toHaveLength(1);
      expect(h.spawns[0]?.accessDbPath).toBe(h.frontend);
      expect(h.spawns[0]?.payload).toMatchObject({ action: tool, mode: "read" });
    },
  );
});
