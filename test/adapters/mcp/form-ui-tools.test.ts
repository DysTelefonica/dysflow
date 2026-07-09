import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/dispatch-routes";
import {
  DYSFLOW_MCP_TOOL_NAMES,
  VBA_SYNC_TOOL_NAMES,
} from "../../../src/adapters/mcp/mcp-tool-registry";
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
  const tools = createDysflowMcpTools({
    services: {
      vbaService: new FakeVbaService(),
      vbaSyncToolService,
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    },
    writes: writesEnabled,
  });
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return { tool, vbaSyncToolService };
}

const FORM_UI_TOOL_NAMES = [
  "analyze_form_ui",
  "map_form_behavior",
  "generate_form_design_plan",
  "apply_form_design_plan",
  "copy_form_ui_pattern",
  "verify_form_ui",
] as const;

describe("public AI form UI builder MCP tools", () => {
  it("registers all tool names as VBA sync MCP tools", () => {
    expect(DYSFLOW_MCP_TOOL_NAMES).toEqual(expect.arrayContaining([...FORM_UI_TOOL_NAMES]));
    expect(VBA_SYNC_TOOL_NAMES).toEqual(expect.arrayContaining([...FORM_UI_TOOL_NAMES]));
  });

  it("routes form UI builder tools as read-only first-slice contract tools", () => {
    for (const name of FORM_UI_TOOL_NAMES) {
      expect(MCP_TOOL_ROUTES[name]).toMatchObject({
        kind: "vba-sync",
        mutatesBinary: false,
        mutatesFilesystem: false,
      });
    }
  });

  it("defines strict schemas for source paths, CodeGraph evidence, plans, dryRun/apply, and outputMode", () => {
    expect(VBA_SYNC_TOOL_SCHEMAS.analyze_form_ui.properties).toEqual(
      expect.objectContaining({ sourcePath: expect.any(Object), outputMode: expect.any(Object) }),
    );
    expect(VBA_SYNC_TOOL_SCHEMAS.map_form_behavior.properties).toEqual(
      expect.objectContaining({
        sourcePath: expect.any(Object),
        codegraphEvidence: expect.any(Object),
      }),
    );
    expect(VBA_SYNC_TOOL_SCHEMAS.generate_form_design_plan.properties).toEqual(
      expect.objectContaining({ behaviorMap: expect.any(Object), plan: expect.any(Object) }),
    );
    expect(VBA_SYNC_TOOL_SCHEMAS.apply_form_design_plan.properties).toEqual(
      expect.objectContaining({
        targetPath: expect.any(Object),
        plan: expect.any(Object),
        dryRun: expect.any(Object),
        apply: expect.any(Object),
      }),
    );
    expect(VBA_SYNC_TOOL_SCHEMAS.copy_form_ui_pattern.properties).toEqual(
      expect.objectContaining({
        behaviorMap: expect.any(Object),
        referencePattern: expect.any(Object),
      }),
    );
    expect(VBA_SYNC_TOOL_SCHEMAS.copy_form_ui_pattern.properties).not.toHaveProperty("dryRun");
    expect(VBA_SYNC_TOOL_SCHEMAS.copy_form_ui_pattern.properties).not.toHaveProperty("apply");
    expect(VBA_SYNC_TOOL_SCHEMAS.verify_form_ui.properties).toEqual(
      expect.objectContaining({
        sourceContract: expect.any(Object),
        appliedContract: expect.any(Object),
      }),
    );
  });

  it("allows read-only analysis when writes are disabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("analyze_form_ui", false);

    const result = await tool.handler({ sourcePath: "C:/repo/forms/Form_Customer.form.txt" });

    expect(result.isError).toBe(false);
    expect(vbaSyncToolService.requests).toEqual([
      {
        toolName: "analyze_form_ui",
        input: expect.objectContaining({ sourcePath: "C:/repo/forms/Form_Customer.form.txt" }),
      },
    ]);
  });

  it("allows apply/copy contract tools when writes are disabled because they do not mutate files or binaries", async () => {
    const { tool, vbaSyncToolService } = toolByName("apply_form_design_plan", false);
    const plan = {
      formName: "Customer",
      sourceContract: {
        formName: "Customer",
        controls: [],
        formEvents: [],
        unmappedEvidence: [],
        warnings: [],
      },
      operations: [],
      warnings: [],
    };

    const apply = await tool.handler({ plan, apply: true });
    expect(apply.isError).toBe(false);
    expect(vbaSyncToolService.requests).toHaveLength(1);
  });

  it("accepts the path alias and rejects malformed CodeGraph evidence at the MCP schema boundary", async () => {
    const analysis = toolByName("analyze_form_ui", false);
    const analysisResult = await analysis.tool.handler({
      path: "C:/repo/forms/Form_Customer.form.txt",
    });
    expect(analysisResult.isError).toBe(false);

    const map = toolByName("map_form_behavior", false);
    const invalid = await map.tool.handler({
      path: "C:/repo/forms/Form_Customer.form.txt",
      codegraphEvidence: [{}],
    });
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]?.text).toContain("codegraphEvidence[0].handler is required");
  });
});
