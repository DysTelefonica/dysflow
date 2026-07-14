import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

describe("central project config write guard", () => {
  it("does not interpret a form mutation sourcePath as an Access target alias", async () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-form-source-"));
    writeFileSync(join(root, ".git"), "gitdir: fixture");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "forms"));
    writeFileSync(join(root, "app.accdb"), "");
    const sourcePath = join(root, "forms", "Form_Customer.form.txt");
    writeFileSync(sourcePath, "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "src" }),
    );
    const execute = vi.fn(async () => successResult({}));
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: root,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(root, input as Record<string, string>),
    });
    const result = await tools
      .find((tool) => tool.name === "form_add_control")
      ?.handler({
        sourcePath,
        controlName: "cmdSave",
        controlType: "CommandButton",
        apply: true,
      });
    expect(result?.error?.code).not.toBe("PROJECT_CONFIG_NOT_WRITE_READY");
    expect(execute).toHaveBeenCalled();
  });
  it.each([true, false])("fails closed before services for dryRun=%s", async (dryRun) => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-write-guard-"));
    writeFileSync(join(root, ".git"), "gitdir: isolated-fixture");
    const diagnostic = diagnoseProjectConfig(root);
    const execute = vi.fn(async () => successResult({}));
    const services = {
      vbaService: { execute },
      queryService: { execute },
      diagnosticsService: { run: execute },
    } as unknown as DysflowMcpServices;
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      cwd: root,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(root, input as Record<string, string>),
    });
    const tool = tools.find((t) => t.name === "import_modules");
    const result = await tool?.handler({
      moduleNames: ["Example"],
      accessPath: join(root, "explicit.accdb"),
      dryRun,
    });
    expect(result?.error).toMatchObject({
      code: "PROJECT_CONFIG_NOT_WRITE_READY",
      details: { status: diagnostic.status, operation: "import_modules" },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
