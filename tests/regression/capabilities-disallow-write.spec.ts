/**
 * Issue #979 / regression for #962 — `CAPABILITIES_DISALLOW_WRITE`.
 *
 * The write gate refuses a mutating request when the project's
 * `.dysflow/project.json` declares `capabilities.allowWrites: false`. This
 * protects read-only consumers from accidentally committing changes against
 * a project the operator declared as locked down.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diagnoseProjectConfig } from "../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

function seedReadOnlyProject(root: string): void {
  writeFileSync(join(root, ".git"), "gitdir: fixture");
  mkdirSync(join(root, ".dysflow"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "app.accdb"), "");
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    JSON.stringify({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites: false },
    }),
  );
}

describe("regression #962: CAPABILITIES_DISALLOW_WRITE", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "dysflow-public-979-cap-"));
    seedReadOnlyProject(workdir);
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("export_modules apply:true returns CAPABILITIES_DISALLOW_WRITE when allowWrites:false (#979)", async () => {
    const execute = vi.fn(async () => successResult({}));
    const services = {
      vbaService: { execute },
      queryService: { execute },
      diagnosticsService: { run: execute },
      vbaSyncToolService: { execute },
    } as unknown as DysflowMcpServices;
    const tools = createDysflowMcpTools({
      services,
      // Even with `writes: true` at the process level, the project's
      // capabilities block is the authoritative source for the gate.
      writes: true,
      allowWrites: false,
      cwd: workdir,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(workdir, input as Record<string, string>),
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    expect(tool, "export_modules must be registered").toBeDefined();

    const result = await tool?.handler({
      moduleNames: ["Example"],
      projectId: "app",
      apply: true,
      confirmOverwriteSource: true,
    });

    expect(result?.error?.code).toBe("CAPABILITIES_DISALLOW_WRITE");
    expect(result?.error?.diagnostics?.[0]?.code).toBe("CAPABILITIES_DISALLOW_WRITE");
    const diagRemediation = result?.error?.diagnostics?.[0]?.remediation as
      | { description?: string; command?: string }
      | undefined;
    expect(typeof diagRemediation).toBe("object");
    expect(diagRemediation?.description ?? "").toMatch(/allowWrites|dysflow mcp --enable-writes/);
    expect(execute).not.toHaveBeenCalled();
  });
});
