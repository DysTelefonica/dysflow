/**
 * Issue #979 / regression for #962 — `PROJECT_ID_MISMATCH`.
 *
 * The write gate refuses a mutating request when the caller's
 * `projectId` does not match the `id` declared in
 * `.dysflow/project.json`. This protects consumers from accidentally
 * targeting the wrong project (e.g. a stale opencode.json wiring that
 * references a project id from a previous worktree).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diagnoseProjectConfig } from "../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

function seedProject(root: string): void {
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
      capabilities: { allowWrites: true },
    }),
  );
}

describe("regression #962: PROJECT_ID_MISMATCH", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "dysflow-public-979-id-"));
    seedProject(workdir);
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("export_modules apply:true returns PROJECT_ID_MISMATCH when caller's projectId does not match the file (#979)", async () => {
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
      // Caller says "stale-worktree" but the file declares "app" — must
      // refuse before any service is invoked.
      projectId: "stale-worktree",
      apply: true,
      confirmOverwriteSource: true,
    });

    expect(result?.error?.code).toBe("PROJECT_ID_MISMATCH");
    expect(result?.error?.diagnostics?.[0]?.code).toBe("PROJECT_ID_MISMATCH");
    const diagRemediation = result?.error?.diagnostics?.[0]?.remediation as
      | { description?: string; command?: string }
      | undefined;
    expect(typeof diagRemediation).toBe("object");
    expect(diagRemediation?.description ?? "").toMatch(/dysflow doctor|projectId|"id"/);
    expect(execute).not.toHaveBeenCalled();
  });
});
