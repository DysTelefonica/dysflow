import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/dispatch-routes";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

class FakeVbaSyncToolService {
  public requests: Array<{ toolName: string; input: unknown }> = [];
  async execute(toolName: string, input: unknown) {
    this.requests.push({ toolName, input });
    return successResult({ ok: true, toolName });
  }
}
class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

function toolByName(name: string, writesEnabled = false) {
  const vbaSyncToolService = new FakeVbaSyncToolService();
  const tools = createDysflowMcpTools(
    {
      vbaService: new FakeVbaService(),
      vbaSyncToolService,
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    },
    writesEnabled,
  );
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return { tool, vbaSyncToolService };
}

describe("public form mutation MCP tools", () => {
  const names = [
    "form_add_control",
    "form_move_control",
    "form_rename_control",
    "create_form_from_template",
  ] as const;

  it("registers all mutation tool names as public MCP tools", () => {
    expect(DYSFLOW_MCP_TOOL_NAMES).toEqual(expect.arrayContaining([...names]));
    for (const name of names) {
      expect(MCP_TOOL_ROUTES[name]).toMatchObject({
        kind: "vba-sync",
        mutatesBinary: true,
        mutatesFilesystem: true,
      });
    }
  });

  it("defines schemas with sourcePath, dryRun/apply, and mutation-specific fields", () => {
    expect(VBA_SYNC_TOOL_SCHEMAS.form_add_control.properties).toEqual(
      expect.objectContaining({
        sourcePath: expect.any(Object),
        controlName: expect.any(Object),
        controlType: expect.any(Object),
        dryRun: expect.any(Object),
        apply: expect.any(Object),
      }),
    );
    expect(VBA_SYNC_TOOL_SCHEMAS.form_move_control.properties).toEqual(
      expect.objectContaining({
        sourcePath: expect.any(Object),
        controlName: expect.any(Object),
        left: expect.any(Object),
        top: expect.any(Object),
        dryRun: expect.any(Object),
        apply: expect.any(Object),
      }),
    );
    expect(VBA_SYNC_TOOL_SCHEMAS.form_rename_control.properties).toEqual(
      expect.objectContaining({
        sourcePath: expect.any(Object),
        controlName: expect.any(Object),
        newName: expect.any(Object),
        dryRun: expect.any(Object),
        apply: expect.any(Object),
      }),
    );
    // slice 5 (issue #618) — `create_form_from_template` requires
    // sourceForm + targetForm + tokenMap and supports dryRun/apply,
    // missingTokenPolicy, overwrite. Source target must NOT carry a `.form.txt`
    // extension because the adapter derives it from the name (mirroring slice-1
    // FormIR naming).
    expect(VBA_SYNC_TOOL_SCHEMAS.create_form_from_template.properties).toEqual(
      expect.objectContaining({
        sourceForm: expect.any(Object),
        targetForm: expect.any(Object),
        tokenMap: expect.any(Object),
        missingTokenPolicy: expect.any(Object),
        overwrite: expect.any(Object),
        dryRun: expect.any(Object),
        apply: expect.any(Object),
      }),
    );
  });

  it("allows dry-run mutation calls when writes are disabled and routes to the VBA sync service", async () => {
    const { tool, vbaSyncToolService } = toolByName("form_add_control", false);

    const result = await tool.handler({
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "cmdSave",
      controlType: "CommandButton",
      properties: { Caption: '"Save"' },
      dryRun: true,
    });

    expect(result.isError).toBe(false);
    expect(vbaSyncToolService.requests).toEqual([
      {
        toolName: "form_add_control",
        input: expect.objectContaining({ controlName: "cmdSave", dryRun: true }),
      },
    ]);
  });

  it("write-gates apply mutation calls when writes are disabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("form_move_control", false);

    const result = await tool.handler({
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "cmdSave",
      left: 100,
      apply: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("create_form_from_template — dry-run is allowed when writes are disabled; apply is write-gated", async () => {
    const { tool, vbaSyncToolService } = toolByName("create_form_from_template", false);

    // Dry-run should pass through to the VBA sync service (default dry-run is
    // the safe semantic; we never accept a binary-mutating call with writes
    // disabled, but a dry-run is a no-op for the binary).
    const dryRunResult = await tool.handler({
      sourceForm: "Form_FormRiesgosGestionRiesgo",
      targetForm: "Form_FormNuevaAuditoria",
      tokenMap: { FormName: "FormNuevaAuditoria" },
      dryRun: true,
    });

    expect(dryRunResult.isError).toBe(false);
    expect(vbaSyncToolService.requests.slice(-1)[0]).toMatchObject({
      toolName: "create_form_from_template",
      input: expect.objectContaining({ dryRun: true }),
    });

    // Apply must be write-gated when writes are disabled.
    const applyResult = await tool.handler({
      sourceForm: "Form_FormRiesgosGestionRiesgo",
      targetForm: "Form_FormNuevaAuditoria",
      tokenMap: { FormName: "FormNuevaAuditoria" },
      apply: true,
    });

    expect(applyResult.isError).toBe(true);
    expect(applyResult.content[0]?.text).toContain("MCP_WRITES_DISABLED");
  });
});
