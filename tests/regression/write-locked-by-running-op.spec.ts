/**
 * Issue #979 / regression for #962 — `WRITE_LOCKED_BY_RUNNING_OP`.
 *
 * The write gate refuses a mutating request when a tracked access operation
 * with `status: "running"` is currently active for the project's configured
 * destinationRoot. The marker must have a fresh `updatedAt` so the
 * stale-marker auto-cleanup (#967) does NOT reap it before the gate's
 * active-blocker path fires.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diagnoseProjectConfig } from "../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

function seedProjectWithRunningOp(root: string): void {
  writeFileSync(join(root, ".git"), "gitdir: fixture");
  mkdirSync(join(root, ".dysflow"));
  mkdirSync(join(root, ".dysflow", "runtime"));
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
  // Fresh updatedAt so #967 auto-cleanup does not reap the running marker
  // before the gate's active-blocker branch fires.
  const freshUpdatedAt = new Date().toISOString();
  writeFileSync(
    join(root, ".dysflow", "runtime", "operations.json"),
    JSON.stringify({
      records: [
        {
          operationId: "op-running",
          action: "export",
          accessPath: join(root, "app.accdb"),
          projectRootAbs: root,
          destinationRootAbs: join(root, "src"),
          metadata: {},
          status: "running",
          accessPid: 123,
          processStartTime: "2026-07-18T10:00:00.000Z",
          updatedAt: freshUpdatedAt,
        },
      ],
    }),
  );
}

describe("regression #962: WRITE_LOCKED_BY_RUNNING_OP", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "dysflow-public-979-lock-"));
    seedProjectWithRunningOp(workdir);
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("export_modules apply:true returns WRITE_LOCKED_BY_RUNNING_OP when a running op blocks the destinationRoot (#979)", async () => {
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

    expect(result?.error?.code).toBe("WRITE_LOCKED_BY_RUNNING_OP");
    expect(result?.error?.diagnostics?.[0]?.code).toBe("WRITE_LOCKED_BY_RUNNING_OP");
    const diagRemediation = result?.error?.diagnostics?.[0]?.remediation as
      | { description?: string; command?: string }
      | undefined;
    expect(typeof diagRemediation).toBe("object");
    expect(diagRemediation?.description ?? "").toMatch(
      /access_force_cleanup_orphaned|cleanup_access_operation|wait|complete/i,
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
