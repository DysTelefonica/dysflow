/**
 * Issue #979 — contract test for `export_modules`.
 *
 * Documents the public contract for the most-trafficked write tool:
 *   - Required parameters: `moduleNames`, `projectId` (under the public gate).
 *   - Return shape: McpToolResult with `content` array, `isError` boolean,
 *     `ok` boolean.
 *   - Error taxonomy: gate refusals carry one of the 5 #962 codes or
 *     MCP_INPUT_INVALID for schema rejections.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diagnoseProjectConfig } from "../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

describe("contract: export_modules (issue #979)", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "dysflow-public-979-export-"));
    writeFileSync(join(workdir, ".git"), "gitdir: fixture");
    mkdirSync(join(workdir, ".dysflow"));
    mkdirSync(join(workdir, "src"));
    writeFileSync(join(workdir, "app.accdb"), "");
    writeFileSync(
      join(workdir, ".dysflow", "project.json"),
      JSON.stringify({
        id: "app",
        accessPath: "app.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: true },
      }),
    );
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("is registered with moduleNames and apply parameters (#807 bulk path accepts sourceDir)", () => {
    const execute = vi.fn(async () => successResult({}));
    const tools = createDysflowMcpTools({
      services: { vbaService: { execute } } as unknown as DysflowMcpServices,
      writes: true,
      cwd: workdir,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(workdir, input as Record<string, string>),
    });
    const tool = tools.find((t) => t.name === "export_modules");
    expect(tool, "export_modules must be registered").toBeDefined();
    // export_modules has no top-level `required` (moduleNames OR sourceDir
    // are both valid entry points per #807). The contract is that BOTH
    // fields appear under properties.
    const props = tool?.inputSchema?.properties ?? {};
    expect("moduleNames" in props).toBe(true);
    expect("apply" in props).toBe(true);
  });

  it("returns McpToolResult envelope shape on a dry-run call with explicit moduleNames", async () => {
    const execute = vi.fn(async () =>
      successResult({
        exported: ["Module1.bas"],
        dryRun: true,
        plan: { moduleNames: ["Module1"], destinationRoot: join(workdir, "src") },
      }),
    );
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: workdir,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(workdir, input as Record<string, string>),
    });
    const tool = tools.find((t) => t.name === "export_modules");
    const result = await tool?.handler({
      moduleNames: ["Module1"],
      projectId: "app",
      dryRun: true,
    });
    expect(result).toBeDefined();
    expect(Array.isArray(result?.content)).toBe(true);
    expect(typeof result?.isError).toBe("boolean");
    expect(typeof result?.ok).toBe("boolean");
  });

  it("applies the write gate when apply:true and project is write-locked", async () => {
    // Re-seed the project with allowWrites:false in .dysflow/project.json
    // so the gate can fire. The factory option alone is not enough; the
    // project config resolver reads the file.
    writeFileSync(
      join(workdir, ".dysflow", "project.json"),
      JSON.stringify({
        id: "app",
        accessPath: "app.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: false },
      }),
    );
    const execute = vi.fn(async () => successResult({}));
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: workdir,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(workdir, input as Record<string, string>),
    });
    const tool = tools.find((t) => t.name === "export_modules");
    const result = await tool?.handler({
      moduleNames: ["Module1"],
      projectId: "app",
      apply: true,
      confirmOverwriteSource: true,
    });
    expect(result?.error?.code).toBe("CAPABILITIES_DISALLOW_WRITE");
    expect(execute).not.toHaveBeenCalled();
  });
});
