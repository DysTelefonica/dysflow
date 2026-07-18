/**
 * Issue #979 / regression for #962 — `DESTINATION_ROOT_NOT_FOUND`.
 *
 * The write gate refuses a mutating request when the project's configured
 * `destinationRoot` directory does not exist on disk. The contract surface is:
 *
 *   error.code === "DESTINATION_ROOT_NOT_FOUND"
 *   error.diagnostics[0].code === "DESTINATION_ROOT_NOT_FOUND"
 *   error.diagnostics[0].remediation is a structured Remediation (#970)
 *
 * The fixture pattern mirrors `test/adapters/mcp/project-config-write-guard.test.ts`
 * but is parameterized so it can run as part of the public suite without
 * touching internal helpers.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diagnoseProjectConfig } from "../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

function seedProjectWithoutDestinationRoot(root: string): void {
  writeFileSync(join(root, ".git"), "gitdir: fixture");
  mkdirSync(join(root, ".dysflow"));
  writeFileSync(join(root, "app.accdb"), "");
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    JSON.stringify({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites: true },
    }),
  );
}

describe("regression #962: DESTINATION_ROOT_NOT_FOUND", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "dysflow-public-979-dest-"));
    seedProjectWithoutDestinationRoot(workdir);
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("export_modules apply:true returns DESTINATION_ROOT_NOT_FOUND with structured remediation (#979)", async () => {
    const execute = vi.fn(async () => successResult({}));
    const services = {
      vbaService: { execute },
      queryService: { execute },
      diagnosticsService: { run: execute },
      vbaSyncToolService: { execute },
    } as unknown as DysflowMcpServices;
    const tools = createDysflowMcpTools({
      services,
      writes: true,
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

    expect(result?.error?.code).toBe("DESTINATION_ROOT_NOT_FOUND");
    expect(result?.error?.diagnostics?.[0]?.code).toBe("DESTINATION_ROOT_NOT_FOUND");
    const diagRemediation = result?.error?.diagnostics?.[0]?.remediation as
      | { description?: string; command?: string; platform?: string }
      | undefined;
    expect(typeof diagRemediation).toBe("object");
    expect(diagRemediation).not.toBeNull();
    expect(typeof diagRemediation?.description).toBe("string");
    expect(diagRemediation?.description).toMatch(/mkdir/);
    expect(execute).not.toHaveBeenCalled();
  });
});
