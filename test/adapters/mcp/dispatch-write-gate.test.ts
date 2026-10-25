import { win32 } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectConfigDiagnostic } from "../../../src/adapters/config/project-config-diagnostic";
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

  // #1861 contract change — #665 blocked every generate_erd call when writes
  // were disabled. The ERD is now a documentation export: only a target
  // outside the project root keeps being refused (see the #1861 suite below).
  it("blocks generate_erd outside the project root when writes are disabled (#665, #1861)", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_erd", false);
    const result = await tool.handler({
      erdPath: "C:/elsewhere/docs/schema.md",
      projectRoot: "C:/project",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("OUTSIDE_PROJECT_ROOT");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("blocks fix_encoding apply:true when writes are disabled (regression #665)", async () => {
    const { tool, vbaSyncToolService } = toolByName("fix_encoding", false);
    // fix_encoding schema accepts location + accessPath + projectRoot but not
    // moduleNames (modules are derived from the project). Provide enough to
    // bypass the empty-input guard and reach the write-gate.
    const result = await tool.handler({
      location: "module",
      projectRoot: "C:/project",
      apply: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("allows fix_encoding apply:false preview through public dispatch with writes disabled", async () => {
    const name = "fix_encoding" as const;
    const { tool, vbaSyncToolService } = toolByName(name, false);
    const input = { location: "module", apply: false };

    const result = await tool.handler(input);

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([expect.objectContaining({ apply: false })]);
  });

  it("keeps fix_encoding diff:true and omitted intent as safe plans", async () => {
    const name = "fix_encoding" as const;
    for (const intent of [{ diff: true }, {}]) {
      const { tool, vbaSyncToolService } = toolByName(name, false);
      const input = { location: "module", ...intent };

      const result = await tool.handler(input);

      expect(result.isError).toBe(false);
      expect(vbaSyncToolService.requests).toEqual([expect.objectContaining(intent)]);
    }
  });

  it("rejects removed dryRun even when apply:true is present for fix_encoding", async () => {
    const name = "fix_encoding" as const;
    const { tool, vbaSyncToolService } = toolByName(name, true);
    const input = { location: "module", apply: true, dryRun: true };

    const result = await tool.handler(input);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(result.content[0]?.text).toContain("dryRun is not allowed");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("keeps generate_form omission as a safe plan when writes are disabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_form", false);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      projectRoot: "C:/project",
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toHaveLength(1);
  });

  it("allows generate_form apply:false without the write-gate when writes are disabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_form", false);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      projectRoot: "C:/project",
      apply: false,
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([
      expect.objectContaining({ apply: false, projectRoot: "C:/project" }),
    ]);
  });

  it("blocks generate_form apply:true when writes are disabled", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_form", false);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      projectRoot: "C:/project",
      apply: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("rejects removed generate_form dryRun before the write gate", async () => {
    const { tool, vbaSyncToolService } = toolByName("generate_form", false);

    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      projectRoot: "C:/project",
      dryRun: true,
      apply: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(result.content[0]?.text).toContain("dryRun is not allowed");
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
    // Issue #1224 — delete_module now requires moduleName OR moduleNames.
    // The write-gate test passes the gate only AFTER validation succeeds,
    // so every tool's minimal input must be schema-valid.
    delete_module: {
      moduleName: "TestModule",
      apply: true,
      implements_check: "delete_module_precheck",
      confirmedRequiresConfirmation: true,
    },
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
      ].sort(),
    );
  });

  it("write-gates every binary-mutating tool when writes are disabled", async () => {
    expect(binaryWriters.length).toBeGreaterThan(0);
    for (const name of binaryWriters) {
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Tool not registered: ${name}`);
      // Explicit apply must always cross the write gate.
      // fix_encoding is ALSO a filesystem write, so it requires non-empty input
      // (the dispatch-factory rejects empty input with MCP_INPUT_INVALID before
      // the gate would fire). Provide a minimal location to pass that check.
      const input =
        name === "fix_encoding"
          ? { location: "module", apply: true }
          : { ...(minimalInput[name] ?? {}), apply: true };
      const result = await tool.handler(input);
      expect(result.content[0]?.text, name).toContain("MCP_WRITES_DISABLED");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELTA-007 (mcp-reliability-fix) — catalog_add_control schema parity +
// canonical apply resolution + write-gate dispatch.
// ─────────────────────────────────────────────────────────────────────────────

describe("DELTA-007 — catalog_add_control schema parity (dryRun/apply)", () => {
  it("catalog_add_control schema exposes apply and rejects legacy dryRun", async () => {
    const { VBA_SYNC_TOOL_SCHEMAS } = await import(
      "../../../src/adapters/mcp/schemas/vba-sync-schemas.js"
    );
    const schema = VBA_SYNC_TOOL_SCHEMAS.catalog_add_control;
    expect(schema).toBeDefined();
    expect(schema?.properties?.dryRun).toBeUndefined();
    expect(schema?.properties?.apply).toBeDefined();
  });
});

describe("DELTA-007 — catalog_add_control dry-run dispatch parity", () => {
  it("catalog_add_control with apply:false (writes disabled) does NOT trigger write-gate", async () => {
    const { tool, vbaSyncToolService } = toolByName("catalog_add_control", false);
    const result = await tool.handler({
      spec: { name: "CustomerEntry", kind: "Form", controls: [] },
      controlName: "txtName",
      controlType: "TextBox",
      catalogPath: "C:/project/forms/catalog.json",
      apply: false,
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

  it("catalog_add_control with omitted apply uses its safe plan default (no write-gate trip)", async () => {
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

// #1861 — generate_erd is a documentation export. With writes disabled
// (process and project), a call whose resolved output file lands inside the
// project root succeeds; any other target is refused with OUTSIDE_PROJECT_ROOT.
describe("generate_erd documentation-export gate (#1861)", () => {
  const projectRoot = "C:/project";

  function erdTool(
    options: {
      writes?: boolean;
      writeExecutionPolicy?: "safe-by-default" | "developer";
      projectConfigResolver?: () => ProjectConfigDiagnostic;
    } = {},
  ) {
    const localServices = makeServices();
    const tools = createDysflowMcpTools({
      services: localServices,
      writes: options.writes ?? false,
      writeAccessResolver: async () => false,
      accessContextResolver: async () =>
        successResult({
          accessPath: `${projectRoot}/app.accdb`,
          projectRoot,
          destinationRoot: `${projectRoot}/src`,
        }),
      ...(options.writeExecutionPolicy !== undefined
        ? { writeExecutionPolicy: options.writeExecutionPolicy }
        : {}),
      ...(options.projectConfigResolver !== undefined
        ? { projectConfigResolver: options.projectConfigResolver }
        : {}),
    });
    const tool = tools.find((candidate) => candidate.name === "generate_erd");
    if (!tool) throw new Error("Tool not registered: generate_erd");
    return { tool, vbaSyncToolService: localServices.vbaSyncToolService };
  }

  function forwardedRequest(service: FakeVbaService): Record<string, unknown> {
    expect(service.requests).toHaveLength(1);
    return service.requests[0] as Record<string, unknown>;
  }

  it("generate_erd({}) succeeds with writes disabled and targets docs/erd/ERD.md", async () => {
    const { tool, vbaSyncToolService } = erdTool();
    const result = await tool.handler({});
    expect(result.isError).toBe(false);
    const request = forwardedRequest(vbaSyncToolService);
    expect(request.erdPath).toBe(win32.resolve(projectRoot, "docs/erd/ERD.md"));
    // S12 — the zero-argument call never depends on destinationRoot.
    expect(request).not.toHaveProperty("destinationRoot");
  });

  it("accepts an explicit erdPath inside the project root with writes disabled", async () => {
    const { tool, vbaSyncToolService } = erdTool();
    const result = await tool.handler({ erdPath: "docs/schema" });
    expect(result.isError).toBe(false);
    expect(forwardedRequest(vbaSyncToolService).erdPath).toBe(
      win32.resolve(projectRoot, "docs/schema.md"),
    );
  });

  it.each([
    ["an absolute path outside the root", "D:/elsewhere/ERD.md"],
    ["a relative path escaping the root", "../sibling/ERD.md"],
  ])("refuses %s with OUTSIDE_PROJECT_ROOT", async (_label, erdPath) => {
    const { tool, vbaSyncToolService } = erdTool();
    const result = await tool.handler({ erdPath });
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("OUTSIDE_PROJECT_ROOT");
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("succeeds in developer policy even when the project config disallows writes", async () => {
    const disallowed: ProjectConfigDiagnostic = {
      status: "capabilities-disallow-write",
      cwd: projectRoot,
      configPath: `${projectRoot}/.dysflow/project.json`,
      projectRoot,
      projectId: "demo",
      accessPath: `${projectRoot}/app.accdb`,
      backendPath: null,
      destinationRoot: `${projectRoot}/src`,
      writeReady: false,
      diagnostics: [
        {
          code: "CAPABILITIES_DISALLOW_WRITE",
          severity: "error",
          message: "Project 'demo' has capabilities.allowWrites = false.",
        },
      ],
      remediation: null,
    };
    const { tool, vbaSyncToolService } = erdTool({
      writeExecutionPolicy: "developer",
      projectConfigResolver: () => disallowed,
    });
    const result = await tool.handler({});
    expect(result.isError).toBe(false);
    expect(forwardedRequest(vbaSyncToolService).erdPath).toBe(
      win32.resolve(projectRoot, "docs/erd/ERD.md"),
    );
  });

  it("keeps the established behaviour for outside targets when writes are enabled", async () => {
    const { tool, vbaSyncToolService } = erdTool({ writes: true });
    const result = await tool.handler({ erdPath: "D:/elsewhere/ERD.md" });
    expect(result.isError).toBe(false);
    expect(forwardedRequest(vbaSyncToolService).erdPath).toBe("D:/elsewhere/ERD.md");
  });

  it("does not extend the exemption to other filesystem writers", async () => {
    const { tool } = toolByName("generate_form", false);
    const result = await tool.handler({
      spec: { name: "frmDemo", controls: [] },
      projectRoot,
      apply: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
  });
});
