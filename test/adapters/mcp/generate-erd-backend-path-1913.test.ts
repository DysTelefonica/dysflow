/**
 * Issue #1913 — `generate_erd({cwd})` must use the project's configured
 * `backendPath` when the call does not pass one. Before the fix only
 * `input.backendPath` reached `Generate-ERD`, so the PowerShell worker fell
 * back to scanning the current directory for `*_Datos.accdb` and failed for a
 * backend that lives outside the project root.
 *
 * The composition is real (project-config resolution, MCP dispatch, the
 * VBA-sync adapter); only the PowerShell executor port is faked.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMcpAccessContextForInput } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import {
  type VbaManagerExecutionRequest,
  type VbaManagerExecutionResult,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const erdSuccess: VbaManagerExecutionResult = {
  exitCode: 0,
  stdout: 'DYSFLOW_RESULT {"ok":true,"markdownFile":"docs/erd/ERD.md"}',
  stderr: "",
  durationMs: 5,
  timedOut: false,
};

// Verbatim worker failure when neither -BackendPath nor a *_Datos.accdb resolves.
const noBackendFailure: VbaManagerExecutionResult = {
  exitCode: 1,
  stdout: "",
  stderr:
    "No se especifico -BackendPath y no se encontro ningun archivo *_Datos.accdb/.mdb en el directorio actual.",
  durationMs: 5,
  timedOut: false,
};

let root: string;
let projectRoot: string;
let externalBackend: string;

function writeProjectConfig(config: Record<string, unknown>): void {
  writeFileSync(join(projectRoot, ".dysflow", "project.json"), JSON.stringify(config), "utf-8");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dysflow-1913-erd-"));
  projectRoot = join(root, "worktree");
  const dataDir = join(root, "data");
  mkdirSync(join(projectRoot, ".dysflow"), { recursive: true });
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(projectRoot, ".git"), "gitdir: isolated-fixture", "utf-8");
  writeFileSync(join(projectRoot, "front.accdb"), "fake", "utf-8");
  externalBackend = join(dataDir, "App_Datos.accdb");
  writeFileSync(externalBackend, "fake", "utf-8");
  writeProjectConfig({
    id: "app",
    frontendFile: "front.accdb",
    destinationRoot: "src",
    backendPath: externalBackend,
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function erdTool(results: readonly VbaManagerExecutionResult[]) {
  const executor =
    vi.fn<(request: VbaManagerExecutionRequest) => Promise<VbaManagerExecutionResult>>();
  for (const result of results) executor.mockResolvedValueOnce(result);
  const vbaSyncToolService = new VbaSyncAdapter({
    preflightCleanup: noopPreflightCleanup(),
    cwd: projectRoot,
    accessPath: join(projectRoot, "front.accdb"),
    destinationRoot: join(projectRoot, "src"),
    env: {},
    executor,
  });
  const tools = createDysflowMcpTools({
    services: {
      vbaService: { execute: async () => successResult({}) },
      vbaSyncToolService,
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    } as never,
    writes: false,
    writeAccessResolver: async () => false,
    accessContextResolver: (input) => resolveMcpAccessContextForInput(input, undefined, {}),
  });
  const tool = tools.find((candidate) => candidate.name === "generate_erd");
  if (!tool) throw new Error("Tool not registered: generate_erd");
  return { tool, executor };
}

function forwardedBackendPath(
  executor: ReturnType<typeof erdTool>["executor"],
): string | number | boolean | undefined {
  expect(executor).toHaveBeenCalledTimes(1);
  return executor.mock.calls[0]?.[0].extra.backendPath;
}

describe("generate_erd backend resolution (#1913)", () => {
  it("passes the configured external backendPath to Generate-ERD", async () => {
    const { tool, executor } = erdTool([erdSuccess]);

    const result = await tool.handler({ cwd: projectRoot });

    expect(result.isError).toBe(false);
    expect(forwardedBackendPath(executor)).toBe(externalBackend);
  });

  it("an explicit backendPath argument still wins over the config", async () => {
    const explicitBackend = join(root, "data", "Other_Datos.accdb");
    writeFileSync(explicitBackend, "fake", "utf-8");
    const { tool, executor } = erdTool([erdSuccess]);

    const result = await tool.handler({ cwd: projectRoot, backendPath: explicitBackend });

    expect(result.isError).toBe(false);
    expect(forwardedBackendPath(executor)).toBe(explicitBackend);
  });

  it("names backendPath in the error when no backend resolves", async () => {
    writeProjectConfig({ id: "app", frontendFile: "front.accdb", destinationRoot: "src" });
    const { tool, executor } = erdTool([noBackendFailure]);

    const result = await tool.handler({ cwd: projectRoot });

    expect(result.isError).toBe(true);
    expect(forwardedBackendPath(executor)).toBeUndefined();
    const text = result.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n");
    expect(text).toContain("backendPath");
    expect(text).toContain(".dysflow/project.json");
  });
});
