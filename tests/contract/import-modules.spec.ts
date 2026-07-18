/**
 * Issue #979 — contract test for `import_modules`.
 *
 * Documents the public contract for the most-trafficked reverse-sync tool.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diagnoseProjectConfig } from "../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

describe("contract: import_modules (issue #979)", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "dysflow-public-979-import-"));
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

  it("is registered with moduleNames and dryRun parameters (#807 bulk path accepts sourceDir)", () => {
    const execute = vi.fn(async () => successResult({}));
    const tools = createDysflowMcpTools({
      services: { vbaService: { execute } } as unknown as DysflowMcpServices,
      writes: true,
      cwd: workdir,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(workdir, input as Record<string, string>),
    });
    const tool = tools.find((t) => t.name === "import_modules");
    expect(tool, "import_modules must be registered").toBeDefined();
    // import_modules has no top-level `required` (moduleNames OR sourceDir
    // are both valid entry points per #807).
    const props = tool?.inputSchema?.properties ?? {};
    expect("moduleNames" in props).toBe(true);
    expect("dryRun" in props).toBe(true);
  });

  it("applies the write gate on dryRun:false (issue #962)", async () => {
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
    const tool = tools.find((t) => t.name === "import_modules");
    const result = await tool?.handler({
      moduleNames: ["Module1"],
      projectId: "app",
      dryRun: false,
    });
    expect(result?.error?.code).toBe("CAPABILITIES_DISALLOW_WRITE");
    expect(execute).not.toHaveBeenCalled();
  });
});
