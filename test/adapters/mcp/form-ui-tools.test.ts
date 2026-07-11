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

  it("routes apply_form_design_plan as a mutating tool (#813 phase 6)", () => {
    // Issue #813 phase 6 — apply_form_design_plan is no longer a
    // read-only contract tool. It mutates the .form.txt + .accdb
    // through the applyGuardedFormWrite seam, so the route is
    // mutatesBinary:true + mutatesFilesystem:true + risk:routine-dev-write.
    const route = MCP_TOOL_ROUTES.apply_form_design_plan;
    expect(route).toMatchObject({
      kind: "vba-sync",
      mutatesBinary: true,
      mutatesFilesystem: true,
    });
  });

  it("routes the other form UI builder tools as read-only first-slice contract tools", () => {
    // Issue #813 phase 6 — apply_form_design_plan is no longer in this
    // family (reclassified above). The other 5 contract tools stay
    // read-only.
    const READ_ONLY_FORM_UI_TOOLS = FORM_UI_TOOL_NAMES.filter(
      (name) => name !== "apply_form_design_plan",
    );
    for (const name of READ_ONLY_FORM_UI_TOOLS) {
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
    // Issue #813 phase 6 — `targetPath` was removed (unvalidated alternate
    // write destination). The schema still declares sourcePath-equivalent
    // (via sourcePath or path alias), plan, dryRun, apply, outputMode.
    expect(VBA_SYNC_TOOL_SCHEMAS.apply_form_design_plan.properties).toEqual(
      expect.objectContaining({
        plan: expect.any(Object),
        dryRun: expect.any(Object),
        apply: expect.any(Object),
      }),
    );
    expect(
      VBA_SYNC_TOOL_SCHEMAS.apply_form_design_plan.properties?.targetPath,
      "targetPath must be removed in phase 6",
    ).toBeUndefined();
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

  it("blocks apply_form_design_plan with apply:true when writes are disabled (#813 acceptance #5)", async () => {
    // Issue #813 phase 6 — apply_form_design_plan was reclassified to
    // mutating (mutatesBinary:true + mutatesFilesystem:true). With writes
    // disabled + apply:true, the write-gate MUST refuse BEFORE any
    // adapter dispatch — that's issue #813 acceptance criterion #5.
    const { tool, vbaSyncToolService } = toolByName("apply_form_design_plan", false);
    const plan = {
      formName: "Form_Customer",
      sourceContract: {
        formName: "Form_Customer",
        controls: [],
        formEvents: [],
        unmappedEvidence: [],
        warnings: [],
      },
      operations: [],
      warnings: [],
    };
    const apply = await tool.handler({
      plan,
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      apply: true,
    });
    expect(apply.isError).toBe(true);
    expect(apply.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    // CRITICAL — the gate must fire BEFORE any adapter dispatch.
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("allows apply_form_design_plan with dryRun:true (preview path) regardless of writes-disabled", async () => {
    // Issue #813 phase 6 — a legitimate dryRun:true preview call is NOT
    // gated. It reaches the adapter and returns the planned payload
    // without writing. The adapter-port path returns the in-memory
    // preview (mock service returns ok:true here).
    const { tool, vbaSyncToolService } = toolByName("apply_form_design_plan", false);
    const plan = {
      formName: "Form_Customer",
      sourceContract: {
        formName: "Form_Customer",
        controls: [],
        formEvents: [],
        unmappedEvidence: [],
        warnings: [],
      },
      operations: [],
      warnings: [],
    };
    const dryRun = await tool.handler({
      plan,
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      dryRun: true,
    });
    expect(dryRun.isError).toBe(false);
    expect(dryRun.content[0]?.text ?? "").not.toContain("MCP_WRITES_DISABLED");
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
