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
  const tools = createDysflowMcpTools({
    services: localServices,
    writes: writesEnabled,
  });
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return { tool, vbaSyncToolService: localServices.vbaSyncToolService };
}

describe("vba-sync filesystem write-gate derives from MCP_TOOL_ROUTES", () => {
  it("flags form generation and catalog mutation as filesystem-mutating tools", () => {
    const filesystemWriters = Object.entries(MCP_TOOL_ROUTES)
      .filter(([, route]) => route.kind === "vba-sync" && route.mutatesFilesystem)
      .map(([name]) => name);

    // #665 — export_modules, export_all, generate_erd, and fix_encoding were
    // declared mutatesFilesystem:false but actually mutate the filesystem
    // (write .bas files / write ERD HTML / rewrite module encoding). The
    // declarations are now corrected so read-only MCP sessions cannot run
    // them under the write-gate.
    // #809 — sync_binary joins the filesystem-mutating family because
    // apply:true with direction:'binary-to-src' -> export_modules writes
    // the source tree.
    // #872 — form_set_properties + form_duplicate_control join the
    // filesystem-mutating family (same applyGuardedFormWrite seam).
    expect([...filesystemWriters].sort()).toEqual(
      [
        "catalog_add_control",
        "create_form_from_template",
        "form_add_control",
        "form_align_controls",
        "form_delete_control",
        "form_deserialize",
        "form_distribute_controls",
        "form_duplicate_control",
        "form_move_control",
        "form_rename_control",
        "form_set_properties",
        "form_set_property",
        "apply_form_design_plan",
        "export_all",
        "export_modules",
        "fix_encoding",
        "generate_form",
        "generate_erd",
        "sync_binary",
      ].sort(),
    );
  });

  // #665 — the newly-flagged filesystem writers must actually be blocked
  // when writes are disabled (regression net for the corrected declarations).
  it("blocks export_modules when writes are disabled (regression #665)", async () => {
    const { tool, vbaSyncToolService } = toolByName("export_modules", false);
    const result = await tool.handler({
      moduleNames: ["ModuleA"],
      destinationRoot: "C:/project",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("blocks export_all (incl. prune:true) when writes are disabled (regression #665)", async () => {
    const { tool, vbaSyncToolService } = toolByName("export_all", false);
    const result = await tool.handler({
      destinationRoot: "C:/project",
      prune: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("blocks generate_erd when writes are disabled (regression #665)", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_erd", false);
    const result = await tool.handler({
      erdPath: "C:/project/docs/schema.html",
      projectRoot: "C:/project",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("blocks fix_encoding when writes are disabled (regression #665)", async () => {
    const { tool, vbaSyncToolService } = toolByName("fix_encoding", false);
    // fix_encoding schema accepts location + accessPath + projectRoot but not
    // moduleNames (modules are derived from the project). Provide enough to
    // bypass the empty-input guard and reach the write-gate.
    const result = await tool.handler({
      location: "module",
      projectRoot: "C:/project",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
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

  it("rejects generate_form dryRun:true with apply:true as mutually exclusive (#1057 F8) before the write gate", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_form", false);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      projectRoot: "C:/project",
      dryRun: true,
      apply: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(result.content[0]?.text).toContain("mutually exclusive");
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
  const tools = createDysflowMcpTools({
    services: binaryGateServices,
  }); // writesEnabled=false → gate active

  const binaryWriters = Object.entries(MCP_TOOL_ROUTES)
    .filter(([, route]) => route.kind === "vba-sync" && route.mutatesBinary)
    .map(([name]) => name);

  // Minimal valid input per tool; only tools with `required` fields need an override.
  const minimalInput: Record<string, Record<string, unknown>> = {
    form_add_control: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlName: "cmd",
      controlType: "CommandButton",
      apply: true,
    },
    form_move_control: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlName: "cmd",
      left: 0,
      apply: true,
    },
    form_rename_control: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlName: "cmd",
      newName: "cmdSave",
      apply: true,
    },
    // Issue #813 phase 6 — apply_form_design_plan + form_set_property +
    // form_delete_control join the binary-mutating family.
    apply_form_design_plan: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      plan: {
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
      },
      apply: true,
    },
    form_set_property: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlName: "cmd",
      property: "Caption",
      value: "Save",
      apply: true,
    },
    // Issue #872 F1 — atomic batch property updates. Same applyGuardedFormWrite
    // seam; same write-gate behavior on apply:true when writes are disabled.
    form_set_properties: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlName: "cmd",
      properties: { Caption: '"Save"', Left: "100" },
      apply: true,
    },
    form_delete_control: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlName: "cmdObsolete",
      apply: true,
    },
    // Issue #872 F2 — clone a control. Same seam; same write-gate behavior.
    form_duplicate_control: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      sourceControlName: "cmd",
      newName: "cmdClone",
      apply: true,
    },
    // Issue #816 phase 3 — form_align_controls + form_distribute_controls
    // join the binary-mutating family (same applyGuardedFormWrite seam).
    form_align_controls: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlNames: ["cmdSave", "cmdExit"],
      edge: "left",
      apply: true,
    },
    form_distribute_controls: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      controlNames: ["cmdSave", "cmdExit"],
      axis: "horizontal",
      apply: true,
    },
    form_deserialize: {
      sourcePath: "C:/project/forms/Form_Customer.form.txt",
      ir: {
        name: "Form_Customer",
        kind: "Form",
        preamble: [],
        root: { blockType: "Form", entries: [], children: [] },
        codeBehind: null,
      },
      apply: true,
    },
    // slice 5 (issue #618) — minimal apply input for create_form_from_template.
    // The tool requires sourceForm/targetForm/tokenMap; apply:true forces isDryRun=false
    // so the write-gate must fire even when writes are disabled.
    create_form_from_template: {
      sourceForm: "Form_Customer",
      targetForm: "Form_CustomerClone",
      tokenMap: { FormName: "FormCustomerClone" },
      apply: true,
    },
    vba_inline_execution: { code: "Sub T()\r\nEnd Sub" },
    // Issue #809 — sync_binary is dryRun-capable (apply:true forces isDryRun=false)
    // so the gate must fire on apply:true even when writes are disabled.
    sync_binary: {
      projectId: "test-809",
      direction: "src-to-binary",
      apply: true,
    },
  };

  it("flags exactly the binary-mutating VBA tools", () => {
    // #665 — fix_encoding was declared mutatesBinary:false but the
    // PowerShell Fix-Encoding action rewrites modules inside the .accdb.
    // Now correctly declared so the binary write-gate fires.
    expect([...binaryWriters].sort()).toEqual(
      [
        // feat-759-no-compile (v1.19.0) — compile_vba was removed; the
        // remaining binary writers mutate the .accdb.
        // Issue #813 phase 6 — apply_form_design_plan + form_set_property +
        // form_delete_control join the binary-mutating family.
        // Issue #816 phase 3 — form_align_controls + form_distribute_controls
        // join the same family (same applyGuardedFormWrite seam).
        // Issue #809 — sync_binary joins the binary-mutating family
        // (apply:true with direction:'src-to-binary' -> import_modules writes
        // the .accdb).
        // Issue #872 — form_set_properties + form_duplicate_control join the
        // same family (atomic batch property updates + control duplication;
        // same applyGuardedFormWrite seam).
        "delete_module",
        "fix_encoding",
        "import_all",
        "import_modules",
        "apply_form_design_plan",
        "create_form_from_template",
        "form_add_control",
        "form_align_controls",
        "form_delete_control",
        "form_deserialize",
        "form_distribute_controls",
        "form_duplicate_control",
        "form_move_control",
        "form_rename_control",
        "form_set_properties",
        "form_set_property",
        "sync_binary",
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
      // fix_encoding is ALSO a filesystem write, so it requires non-empty input
      // (the dispatch-factory rejects empty input with MCP_INPUT_INVALID before
      // the gate would fire). Provide a minimal location to pass that check.
      const input = name === "fix_encoding" ? { location: "module" } : (minimalInput[name] ?? {});
      const result = await tool.handler(input);
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
