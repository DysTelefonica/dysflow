import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMissingProjectConfigRemediation } from "../../../src/adapters/config/missing-project-guidance";
import { createResolveProjectTool } from "../../../src/adapters/mcp/resolve-project-tool";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function worktreeWithoutConfig(): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-no-config-"));
  writeFileSync(join(root, ".git"), "gitdir: fixture");
  roots.push(root);
  return root;
}

describe("worktree-without-.dysflow field-level guidance", () => {
  it("resolve_project reports the required fields and the caller's cwd", async () => {
    const startup = worktreeWithoutConfig();
    const target = worktreeWithoutConfig();
    const result = await createResolveProjectTool({ cwd: startup }).handler({ cwd: target });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toMatch(/PROJECT_CONFIG_MISSING|MCP_INPUT_INVALID/);
    const remediation = result.error?.remediation as unknown as {
      fieldChecklist: string[];
      command: { cwd: string };
    };
    expect(remediation.fieldChecklist).toEqual(
      expect.arrayContaining([
        "frontendFile",
        "backendPath",
        "destinationRoot",
        "capabilities.allowWrites",
        "capabilities.writeExecutionPolicy",
        "projectId",
      ]),
    );
    expect(remediation.command.cwd).toBe(target);
  });

  it("offers restoration when .dysflow.bak exists", async () => {
    const startup = worktreeWithoutConfig();
    const target = worktreeWithoutConfig();
    mkdirSync(join(target, ".dysflow.bak"));

    const result = await createResolveProjectTool({ cwd: startup }).handler({ cwd: target });
    expect(JSON.stringify(result.error?.remediation)).toContain("mv .dysflow.bak .dysflow");
  });

  it("offers a copy-from-origin command when a sibling worktree has config", async () => {
    const target = worktreeWithoutConfig();
    const origin = worktreeWithoutConfig();
    mkdirSync(join(origin, ".dysflow"));
    writeFileSync(
      join(origin, ".dysflow", "project.json"),
      JSON.stringify({ id: "origin", frontendFile: "App.accdb" }),
    );

    const remediation = buildMissingProjectConfigRemediation(target, [
      { root: target, branch: "fixture-target" },
      { root: origin, branch: "main" },
    ]);
    expect(remediation.originReference).toContain("git show main:.dysflow/project.json");
  });
});
