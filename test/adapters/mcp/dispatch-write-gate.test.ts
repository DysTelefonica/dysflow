import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

/**
 * Guards that the VBA-sync write-gate is DERIVED from MCP_TOOL_ROUTES
 * (route.mutatesBinary) rather than a hand-maintained name set in the dispatch
 * factory. Adding a new binary-mutating VBA tool without declaring it cannot
 * silently skip the write-gate: `mutatesBinary` is a required field on the
 * vba-sync route (compile-time net) and this test asserts the gate actually
 * fires for every flagged tool (runtime net).
 */
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeVbaService {
  public requests: unknown[] = [];
  async execute(...args: unknown[]) {
    this.requests.push(args.length > 1 ? args[1] : args[0]);
    return successResult({ returnValue: "ok" });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

function makeServices() {
  const vbaSyncToolService = new FakeVbaService();
  return {
    vbaService: new FakeVbaService(),
    vbaSyncToolService,
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };
}

function toolByName(name: string, writesEnabled = false) {
  const localServices = makeServices();
  const tools = createDysflowMcpTools(localServices, writesEnabled);
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return { tool, vbaSyncToolService: localServices.vbaSyncToolService };
}

describe("vba-sync filesystem write-gate derives from MCP_TOOL_ROUTES", () => {
  it("flags form generation and catalog mutation as filesystem-mutating tools", () => {
    const filesystemWriters = Object.entries(MCP_TOOL_ROUTES)
      .filter(([, route]) => route.kind === "vba-sync" && route.mutatesFilesystem)
      .map(([name]) => name);

    expect([...filesystemWriters].sort()).toEqual(
      [
        "catalog_add_control",
        "dysflow_form_add_control",
        "dysflow_form_move_control",
        "dysflow_form_rename_control",
        "generate_form",
      ].sort(),
    );
  });

  it("blocks generate_form when writes are disabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_form", false);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      projectRoot: "C:/project",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("allows generate_form dryRun:true without the write-gate when writes are disabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_form", false);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      projectRoot: "C:/project",
      dryRun: true,
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([
      expect.objectContaining({ dryRun: true, projectRoot: "C:/project" }),
    ]);
  });

  it("blocks generate_form dryRun:false when writes are disabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_form", false);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      projectRoot: "C:/project",
      dryRun: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("blocks generate_form dryRun:true with apply:true when writes are disabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_form", false);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      projectRoot: "C:/project",
      dryRun: true,
      apply: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("blocks catalog_add_control when writes are disabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("catalog_add_control", false);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      controlName: "txtName",
      controlType: "TextBox",
      catalogPath: "C:/project/forms/catalog.json",
      apply: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("keeps read-only form tools outside the write-gate", async () => {
    for (const name of ["validate_form_spec", "harvest_form_catalog"] as const) {
      const { tool, vbaSyncToolService } = toolByName(name, false);

      const result = await tool.handler(
        name === "validate_form_spec"
          ? { spec: { name: "CustomerEntry", kind: "Form", controls: [] } }
          : { catalogPath: "C:/project/forms/catalog.json" },
      );

      expect(result.isError, name).toBe(false);
      expect(result.content[0]?.text, name).not.toContain("MCP_WRITES_DISABLED");
      expect(vbaSyncToolService.requests, name).toHaveLength(1);
    }
  });

  it("allows form filesystem writers when writes are enabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_form", true);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      projectRoot: "C:/project",
    });

    expect(result.isError).toBe(false);
    expect(vbaSyncToolService.requests).toHaveLength(1);
  });
});

const binaryGateServices = {
  vbaService: new FakeVbaService(),
  queryService: new FakeQueryService(),
  diagnosticsService: new FakeDiagnosticsService(),
};

describe("vba-sync write-gate derives from MCP_TOOL_ROUTES.mutatesBinary", () => {
  const tools = createDysflowMcpTools(binaryGateServices, false); // writesEnabled=false → gate active

  const binaryWriters = Object.entries(MCP_TOOL_ROUTES)
    .filter(([, route]) => route.kind === "vba-sync" && route.mutatesBinary)
    .map(([name]) => name);

  // Minimal valid input per tool; only tools with `required` fields need an override.
  const minimalInput: Record<string, Record<string, unknown>> = {
    dysflow_form_add_control: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlName: "cmd",
      controlType: "CommandButton",
      apply: true,
    },
    dysflow_form_move_control: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlName: "cmd",
      left: 0,
      apply: true,
    },
    dysflow_form_rename_control: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlName: "cmd",
      newName: "cmdSave",
      apply: true,
    },
    vba_inline_execution: { code: "Sub T()\r\nEnd Sub" },
  };

  it("flags exactly the binary-mutating VBA tools", () => {
    expect([...binaryWriters].sort()).toEqual(
      [
        "compile_vba",
        "delete_module",
        "import_all",
        "import_modules",
        "dysflow_form_add_control",
        "dysflow_form_move_control",
        "dysflow_form_rename_control",
        "vba_inline_execution",
      ].sort(),
    );
  });

  it("write-gates every binary-mutating tool when writes are disabled", async () => {
    expect(binaryWriters.length).toBeGreaterThan(0);
    for (const name of binaryWriters) {
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Tool not registered: ${name}`);
      // These tools force isDryRun=false, so they must gate even without apply/dryRun.
      const result = await tool.handler(minimalInput[name] ?? {});
      expect(result.content[0]?.text, name).toContain("MCP_WRITES_DISABLED");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELTA-007 (mcp-reliability-fix) — catalog_add_control schema parity +
// dryRun/apply resolution + write-gate dispatch.
// ─────────────────────────────────────────────────────────────────────────────

describe("DELTA-007 — catalog_add_control schema parity (dryRun/apply)", () => {
  it("catalog_add_control schema includes dryRun and apply properties", async () => {
    const { VBA_SYNC_TOOL_SCHEMAS } = await import(
      "../../../src/adapters/mcp/schemas/vba-sync-schemas.js"
    );
    const schema = VBA_SYNC_TOOL_SCHEMAS.catalog_add_control;
    expect(schema).toBeDefined();
    expect(schema?.properties?.dryRun).toBeDefined();
    expect(schema?.properties?.apply).toBeDefined();
  });
});

describe("DELTA-007 — catalog_add_control dry-run dispatch parity", () => {
  it("catalog_add_control with dryRun:true (writes disabled) does NOT trigger write-gate", async () => {
    const { tool, vbaSyncToolService } = toolByName("catalog_add_control", false);
    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      controlName: "txtName",
      controlType: "TextBox",
      catalogPath: "C:/project/forms/catalog.json",
      dryRun: true,
    });
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toHaveLength(1);
  });

  it("catalog_add_control with apply:true bypasses write-gate when writes are enabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("catalog_add_control", true);
    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      controlName: "txtName",
      controlType: "TextBox",
      catalogPath: "C:/project/forms/catalog.json",
      apply: true,
    });
    expect(result.isError).toBe(false);
    expect(vbaSyncToolService.requests).toHaveLength(1);
  });

  it("catalog_add_control with no dryRun/apply defaults to dry-run (no write-gate trip)", async () => {
    const { tool, vbaSyncToolService } = toolByName("catalog_add_control", false);
    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      controlName: "txtName",
      controlType: "TextBox",
      catalogPath: "C:/project/forms/catalog.json",
    });
    // Default-dry-run means writes are NOT enabled — service runs in plan
    // mode but is not gated by MCP_WRITES_DISABLED.
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toHaveLength(1);
  });
});
