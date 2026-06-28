import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMcpE2eSandboxPlan } from "../../E2E_testing/_helpers/mcp-e2e-sandbox.mjs";

describe("MCP E2E fixture sandbox", () => {
  it("plans copied fixture paths under a temporary sandbox", () => {
    const scriptDir = resolve("E2E_testing");
    const sandboxRoot = join(tmpdir(), "dysflow-mcp-e2e-test");
    const plan = buildMcpE2eSandboxPlan({ scriptDir, sandboxRoot });

    expect(plan.source.accessPath).toBe(join(scriptDir, "NoConformidades.accdb"));
    expect(plan.source.backendPath).toBe(join(scriptDir, "NoConformidades_Datos.accdb"));
    expect(plan.source.destinationRoot).toBe(join(scriptDir, "src"));
    expect(plan.sandbox.accessPath).toBe(join(sandboxRoot, "NoConformidades.accdb"));
    expect(plan.sandbox.backendPath).toBe(join(sandboxRoot, "NoConformidades_Datos.accdb"));
    expect(plan.sandbox.destinationRoot).toBe(join(sandboxRoot, "src"));
  });

  it("keeps every mutable MCP E2E path inside the sandbox root", () => {
    const scriptDir = resolve("E2E_testing");
    const sandboxRoot = join(tmpdir(), "dysflow-mcp-e2e-test");
    const plan = buildMcpE2eSandboxPlan({ scriptDir, sandboxRoot });

    expect(plan.mutablePaths.length).toBeGreaterThan(5);
    for (const path of plan.mutablePaths) {
      expect(path.startsWith(`${sandboxRoot}`)).toBe(true);
      expect(path.startsWith(scriptDir)).toBe(false);
    }
  });
});
