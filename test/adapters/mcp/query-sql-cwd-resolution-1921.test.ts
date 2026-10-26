/**
 * Issue #1921 — `query_sql` must resolve the project from `cwd` exactly like
 * `query_execute`, and a read tool's missing-config error must name the real
 * `accessPath` parameter (and the `frontendFile` config field), never the
 * internal `accessDbPath` field.
 *
 * The test drives both tools through the MCP surface with real config
 * resolution; only the Access query port is replaced, recording which
 * database each call resolved to.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDynamicServices } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

const SQL = "SELECT COUNT(*) AS C FROM TbConfiguracionBackends";
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "dysflow-1921-"));
  roots.push(root);
  const startup = join(root, "startup");
  const worktree = join(root, "worktree");
  const otherWorktree = join(root, "other-worktree");
  for (const dir of [startup, worktree, otherWorktree]) mkdirSync(dir, { recursive: true });
  mkdirSync(join(worktree, ".dysflow"), { recursive: true });
  for (const dir of [worktree, otherWorktree]) {
    writeFileSync(join(dir, "App.accdb"), "", "utf8");
    writeFileSync(join(dir, "App_Datos.accdb"), "", "utf8");
  }
  writeFileSync(
    join(worktree, ".dysflow", "project.json"),
    JSON.stringify({
      id: "issue-1921",
      accessPath: "App.accdb",
      destinationRoot: "src",
      projectRoot: otherWorktree,
      backendPath: "App_Datos.accdb",
      capabilities: { allowWrites: true },
    }),
    "utf8",
  );

  const resolvedAccessPaths: Record<string, string[]> = {};
  let currentTool = "";
  const services = createDynamicServices(undefined, undefined, {
    cwd: startup,
    env: {},
    serviceFactory: (config) => ({
      vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
      queryService: {
        execute: async () => {
          resolvedAccessPaths[currentTool] = [
            ...(resolvedAccessPaths[currentTool] ?? []),
            config.accessDbPath,
          ];
          return successResult({ rows: [{ C: 1 }] });
        },
      },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    }),
  });
  const tools = createDysflowMcpTools({ services });
  const call = async (name: string, input: Record<string, unknown>) => {
    const tool = tools.find((candidate) => candidate.name === name);
    if (tool === undefined) throw new Error(`missing ${name} tool`);
    currentTool = name;
    return tool.handler(input);
  };
  return { call, resolvedAccessPaths, startup, worktree };
}

function errorText(result: { content: readonly { text?: string }[] }): string {
  return result.content.map((entry) => entry.text ?? "").join("\n");
}

describe("issue #1921 — query_sql and query_execute share cwd resolution", () => {
  it("resolves the same frontend for the same cwd", async () => {
    const { call, resolvedAccessPaths, worktree } = await harness();

    const viaExecute = await call("query_execute", {
      cwd: worktree,
      sql: SQL,
      target: "frontend",
      mode: "read",
    });
    const viaSql = await call("query_sql", { cwd: worktree, sql: SQL, target: "frontend" });

    expect(viaExecute.isError, errorText(viaExecute)).toBe(false);
    expect(viaSql.isError, errorText(viaSql)).toBe(false);
    expect(resolvedAccessPaths.query_execute).toHaveLength(1);
    expect(resolvedAccessPaths.query_sql).toEqual(resolvedAccessPaths.query_execute);
  });

  it("names accessPath and frontendFile, never accessDbPath, when no config resolves", async () => {
    const { call, startup } = await harness();

    for (const [name, input] of [
      ["query_execute", { cwd: startup, sql: SQL, mode: "read" }],
      ["query_sql", { cwd: startup, sql: SQL }],
    ] as const) {
      const result = await call(name, input);
      const text = errorText(result);
      expect(result.isError, `${name}: ${text}`).toBe(true);
      expect(text, name).toContain("CONFIG_MISSING_ACCESS_PATH");
      expect(text, name).not.toContain("accessDbPath");
      expect(text, name).toContain("accessPath");
      expect(text, name).toContain("frontendFile");
    }
  });
});
