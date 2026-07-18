/**
 * Issue #979 / regression for #962 — `OUTSIDE_PROJECT_ROOT`.
 *
 * The write gate refuses a mutating request when the caller's explicit
 * `accessPath` resolves to a location that is NOT within the project's
 * configured `projectRoot`. This catches accidental cross-project writes
 * (e.g. the consumer copied a config and forgot to update the path).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diagnoseProjectConfig } from "../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

function seedProjectWithSource(root: string): void {
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
      projectRoot: root,
      capabilities: { allowWrites: true },
    }),
  );
}

describe("regression #962: OUTSIDE_PROJECT_ROOT", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "dysflow-public-979-out-"));
    seedProjectWithSource(workdir);
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("export_modules apply:true returns OUTSIDE_PROJECT_ROOT when accessPath is outside projectRoot (#979)", async () => {
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

    // An accessPath that points outside the configured projectRoot — built
    // off the parent of the tmpdir so the realpath comparison fails cleanly.
    const outsidePath = join(workdir, "..", "outside", "app.accdb");
    const result = await tool?.handler({
      moduleNames: ["Example"],
      projectId: "app",
      accessPath: outsidePath,
      apply: true,
      confirmOverwriteSource: true,
    });

    expect(result?.error?.code).toBe("OUTSIDE_PROJECT_ROOT");
    expect(result?.error?.diagnostics?.[0]?.code).toBe("OUTSIDE_PROJECT_ROOT");
    const diagRemediation = result?.error?.diagnostics?.[0]?.remediation as
      | { description?: string; command?: string }
      | undefined;
    expect(typeof diagRemediation).toBe("object");
    expect(diagRemediation?.description ?? "").toMatch(/dysflow doctor/);
    expect(execute).not.toHaveBeenCalled();
    // Defensive: outsidePath is reachable from workdir, but the resolver
    // must reject it. The path itself is harmless — tmpdir cleaning handles it.
    void sep;
  });
});
