import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMcpE2eSandboxPlan,
  initializeMcpE2eSandbox,
} from "../../E2E_testing/_helpers/mcp-e2e-sandbox.mjs";
import { diagnoseProjectConfig } from "../../src/adapters/config/project-config-diagnostic";

describe("MCP E2E fixture sandbox", () => {
  it("plans copied fixture paths under a temporary sandbox", () => {
    const scriptDir = resolve("E2E_testing");
    const sandboxParent = join(tmpdir(), "dysflow-mcp-e2e-parent");
    const plan = buildMcpE2eSandboxPlan({ scriptDir, sandboxRoot: sandboxParent });

    expect(plan.source.accessPath).toBe(join(scriptDir, "NoConformidades.accdb"));
    expect(plan.source.backendPath).toBe(join(scriptDir, "NoConformidades_Datos.accdb"));
    expect(plan.source.destinationRoot).toBe(join(scriptDir, "src"));
    expect(dirname(plan.sandbox.root)).toBe(sandboxParent);
    expect(plan.sandbox.root).not.toBe(sandboxParent);
    expect(plan.sandbox.root.split(/[\\/]/).at(-1)).toMatch(/^dysflow-mcp-e2e-/);
    expect(plan.sandbox.accessPath).toBe(join(plan.sandbox.root, "NoConformidades.accdb"));
    expect(plan.sandbox.backendPath).toBe(join(plan.sandbox.root, "NoConformidades_Datos.accdb"));
    expect(plan.sandbox.destinationRoot).toBe(join(plan.sandbox.root, "src"));
  });

  it("keeps every mutable MCP E2E path inside the sandbox root", () => {
    const scriptDir = resolve("E2E_testing");
    const sandboxParent = join(tmpdir(), "dysflow-mcp-e2e-parent");
    const plan = buildMcpE2eSandboxPlan({ scriptDir, sandboxRoot: sandboxParent });

    expect(plan.mutablePaths.length).toBeGreaterThan(5);
    for (const path of plan.mutablePaths) {
      expect(path.startsWith(`${plan.sandbox.root}`)).toBe(true);
      expect(path.startsWith(scriptDir)).toBe(false);
    }
  });

  it("initializes the release sandbox as a write-ready Git-owned project", async () => {
    const scriptDir = resolve("E2E_testing");
    const sandboxParent = join(tmpdir(), `dysflow-mcp-e2e-test-${process.pid}-${Date.now()}`);
    const plan = buildMcpE2eSandboxPlan({ scriptDir, sandboxRoot: sandboxParent });

    try {
      await initializeMcpE2eSandbox(plan, { projectId: "noconformidades-e2e" });
      writeFileSync(plan.sandbox.accessPath, "fixture");
      writeFileSync(plan.sandbox.backendPath, "fixture");
      mkdirSync(plan.sandbox.destinationRoot, { recursive: true });

      expect(existsSync(join(plan.sandbox.root, ".git"))).toBe(true);
      expect(
        JSON.parse(readFileSync(join(plan.sandbox.root, ".dysflow", "project.json"), "utf8")),
      ).toMatchObject({
        id: "noconformidades-e2e",
        accessPath: "NoConformidades.accdb",
        backendPath: "NoConformidades_Datos.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: true },
      });
      expect(
        diagnoseProjectConfig(plan.sandbox.root, { projectId: "noconformidades-e2e" }),
      ).toMatchObject({
        status: "valid",
        writeReady: true,
        owningWorktree: "cwd",
      });
    } finally {
      await import("node:fs/promises").then(({ rm }) =>
        rm(sandboxParent, { recursive: true, force: true }),
      );
    }
  });

  it("rejects operator-supplied parents that would target repo, fixture, home, or drive roots", () => {
    const scriptDir = resolve("E2E_testing");
    const repoRoot = resolve(scriptDir, "..");
    const fixtureSource = join(scriptDir, "src");
    const driveRoot = parse(repoRoot).root;
    const productionRuntime = join(tmpdir(), "LocalAppData", "dysflow");

    for (const unsafeParent of [
      repoRoot,
      join(repoRoot, "tmp-e2e"),
      scriptDir,
      fixtureSource,
      driveRoot,
      homedir(),
      productionRuntime,
    ]) {
      expect(() => buildMcpE2eSandboxPlan({ scriptDir, sandboxRoot: unsafeParent })).toThrow(
        /unsafe MCP E2E sandbox parent/i,
      );
    }
  });
});
