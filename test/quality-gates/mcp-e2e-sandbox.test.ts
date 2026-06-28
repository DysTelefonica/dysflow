import { homedir, tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMcpE2eSandboxPlan } from "../../E2E_testing/_helpers/mcp-e2e-sandbox.mjs";

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
