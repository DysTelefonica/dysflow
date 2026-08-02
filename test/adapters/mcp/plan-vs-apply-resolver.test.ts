import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

const roots: string[] = [];

function fixture(prefix: string, configured: boolean): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  writeFileSync(join(root, ".git"), "gitdir: fixture", "utf8");
  if (configured) {
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "forms"));
    writeFileSync(join(root, "Frontend.accdb"), "", "utf8");
    writeFileSync(join(root, "Backend.accdb"), "", "utf8");
    writeFileSync(
      join(root, "forms", "Form_Probe.form.txt"),
      "Version =21\nBegin Form\nEnd\n",
      "utf8",
    );
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "bench",
        frontendFile: "Frontend.accdb",
        backendPath: "Backend.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: true },
      }),
      "utf8",
    );
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("plan-mode and apply-mode resolve projectConfig identically (HR-4)", () => {
  it("import_modules: same args, plan and apply resolve identically", async () => {
    const startup = fixture("dysflow-plan-apply-startup-", false);
    const selected = fixture("dysflow-plan-apply-selected-", true);
    const execute = vi.fn(async (_name?: string, input?: Record<string, unknown>) =>
      successResult({
        mode: input?.apply === true ? "apply" : "plan",
        dryRun: input?.apply !== true,
        resolvedProjectId: "bench",
        configSource: "repo-config",
        written: input?.apply === true ? ["Constantes"] : [],
      }),
    );
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      allowWrites: true,
      cwd: startup,
      accessContextResolver: async () =>
        successResult({
          accessPath: join(selected, "Frontend.accdb"),
          backendPath: join(selected, "Backend.accdb"),
          destinationRoot: join(selected, "src"),
          projectRoot: join(selected, "src"),
          projectId: "bench",
        }),
      projectConfigResolver: (input, cwd = startup) =>
        diagnoseProjectConfig(cwd, input as Record<string, unknown>),
    });
    const importModules = tools.find((tool) => tool.name === "import_modules");
    if (importModules === undefined) throw new Error("import_modules not registered");
    const args = {
      projectId: "bench",
      accessPath: join(selected, "Frontend.accdb"),
      backendPath: join(selected, "Backend.accdb"),
      destinationRoot: join(selected, "src"),
      moduleNames: ["Constantes"],
    };

    const plan = await importModules.handler({ ...args, apply: false });
    const planPayload = JSON.parse(plan.content[0]?.text ?? "{}") as Record<string, unknown>;
    expect(plan.error).toBeUndefined();
    expect(plan.ok).toBe(true);
    expect(planPayload).toMatchObject({
      dryRun: true,
      resolvedProjectId: "bench",
      configSource: "repo-config",
    });

    const apply = await importModules.handler({ ...args, apply: true });
    const applyPayload = JSON.parse(apply.content[0]?.text ?? "{}") as Record<string, unknown>;
    expect(apply.error).toBeUndefined();
    expect(apply.ok).toBe(true);
    expect(applyPayload).toMatchObject({ mode: "apply" });
    expect(applyPayload.written).toContain("Constantes");
  });

  it.each([
    ["test_vba", { proceduresJson: JSON.stringify([{ procedure: "Test_Alpha", args: [] }]) }],
    ["sync_binary", { direction: "src-to-binary" }],
    [
      "form_set_property",
      {
        sourcePath: "forms/Form_Probe.form.txt",
        controlName: "txtProbe",
        propertyName: "Caption",
        value: '"Probe"',
      },
    ],
  ])("%s: plan and apply share the selected WorktreeContext", async (toolName, toolInput) => {
    const startup = fixture(`dysflow-${toolName}-startup-`, false);
    const selected = fixture(`dysflow-${toolName}-selected-`, true);
    const execute = vi.fn(async () => successResult({ mode: "apply", dryRun: false }));
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      allowWrites: true,
      allowedProcedures: ["Test_Alpha"],
      writeExecutionPolicy: "developer",
      cwd: startup,
      accessContextResolver: async () =>
        successResult({
          accessPath: join(selected, "Frontend.accdb"),
          backendPath: join(selected, "Backend.accdb"),
          destinationRoot: join(selected, "src"),
          projectRoot: join(selected, "src"),
          projectId: "bench",
        }),
      projectConfigResolver: (input, cwd = startup) =>
        diagnoseProjectConfig(cwd, input as Record<string, unknown>),
    });
    const tool = tools.find((candidate) => candidate.name === toolName);
    if (tool === undefined) throw new Error(`${toolName} not registered`);
    const args = {
      projectId: "bench",
      accessPath: join(selected, "Frontend.accdb"),
      backendPath: join(selected, "Backend.accdb"),
      destinationRoot: join(selected, "src"),
      ...toolInput,
    };

    const plan = await tool.handler({ ...args, apply: false });
    const apply = await tool.handler({ ...args, apply: true });

    expect(plan.error?.code).not.toBe("PROJECT_CONFIG_NOT_WRITE_READY");
    expect(apply.error?.code).not.toBe("PROJECT_CONFIG_NOT_WRITE_READY");
  });

  it("returns the same missing-config code and wording for explicit plan/apply calls", async () => {
    const startup = fixture("dysflow-plan-apply-missing-", false);
    const execute = vi.fn(async () => successResult({}));
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      allowWrites: true,
      cwd: startup,
      accessContextResolver: async () =>
        ({
          ok: false,
          error: { code: "CONFIG_NOT_FOUND", message: "No project config" },
        }) as never,
      projectConfigResolver: (input, cwd = startup) =>
        diagnoseProjectConfig(cwd, input as Record<string, unknown>),
    });
    const tool = tools.find((candidate) => candidate.name === "import_modules");
    if (tool === undefined) throw new Error("import_modules not registered");
    const args = {
      projectId: "missing",
      accessPath: join(startup, "Frontend.accdb"),
      destinationRoot: join(startup, "src"),
      moduleNames: ["Constantes"],
    };

    const plan = await tool.handler({ ...args, apply: false });
    const apply = await tool.handler({ ...args, apply: true });

    expect(plan.error?.code).toBe("PROJECT_CONFIG_NOT_WRITE_READY");
    expect(apply.error?.code).toBe(plan.error?.code);
    expect(apply.error?.message).toBe(plan.error?.message);
    expect(execute).not.toHaveBeenCalled();
  });
});
