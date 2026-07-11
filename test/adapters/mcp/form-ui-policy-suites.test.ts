/**
 * Issue #813, Phase 6 — atomic exposure policy suites.
 *
 * Pins every invariant the design.md "Route + write-gate (change together as
 * ONE unit — THREE hardcoded lists, not two)" section requires. The three
 * (actually four, per the expanded Phase-6 design.md note) hardcoded lists
 * must extend IN LOCKSTEP — missing any one is either a write-gate bypass
 * (CRITICAL) or a legitimate `dryRun: true` preview refused as if writes
 * were disabled.
 *
 * Surfaces pinned here:
 *   1. `MCP_TOOL_ROUTES` — reclassifies `apply_form_design_plan` (mutating)
 *      and adds net-new routes for `form_set_property` + `form_delete_control`.
 *   2. `VBA_SYNC_TOOL_NAMES` / `DYSFLOW_MCP_TOOL_NAMES` — registers the 2
 *      new tool names so the route table compiles and the parity registry
 *      iterates them.
 *   3. `TOOL_PARITY_REGISTRY` + `TOOL_DESCRIPTIONS` — every non-stub tool
 *      must have a real description and status:"implemented".
 *   4. `MCP_TOOL_RISKS` (derived from routes) — risk classifications are
 *      published.
 *   5. `isDryRunCapableBinaryWrite` (dispatch-factory.ts:137-142) — the
 *      first atomic-dryRun gating list.
 *   6. The second atomic-dryRun gating list (~224-233, inside `isDryRun`
 *      computation) — extends the same 3 tool names so a legitimate
 *      `dryRun: true` preview does NOT collapse to `isDryRun === false`.
 *   7. `POLICY_EXEMPT_TOOLS` (write-execution-dispatch.ts) — keeps the
 *      "form mutation family uses plan-by-default" semantics in developer
 *      mode.
 *   8. `apply_form_design_plan` schema — dead `targetPath` field REMOVED.
 *   9. `MCP_WRITES_DISABLED` write-gate enforcement (handler-level) — the
 *      three tools refuse with the gate before any adapter dispatch when
 *      writes are disabled + `apply: true`.
 *  10. `effectiveDryRunDefaultForTool` — capabilities snapshot vs resolver
 *      agree, all three tools stay at `true` (caller must pass `apply`).
 *  11. `createDysflowMcpTools` advertises the 3 tools (visible count
 *      cascade: 71 → 73).
 *
 * This file is the Phase 6.1 RED lock; it fails against the pre-Phase-6
 * codebase and goes GREEN together with Phase 6.2's atomic wiring.
 */

import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES, type McpToolRoute } from "../../../src/adapters/mcp/dispatch-routes.js";
import { createGetCapabilitiesTool } from "../../../src/adapters/mcp/get-capabilities-tool.js";
import {
  DYSFLOW_MCP_TOOL_NAMES,
  type DysflowMcpToolName,
  VBA_SYNC_TOOL_NAMES,
} from "../../../src/adapters/mcp/mcp-tool-registry.js";
import { effectiveDryRunDefaultForTool } from "../../../src/adapters/mcp/mcp-tool-risks.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import {
  getToolDefinition,
  TOOL_DESCRIPTIONS,
  TOOL_PARITY_REGISTRY,
} from "../../../src/adapters/mcp/tool-parity-registry.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { resolveEffectiveDryRunInput } from "../../../src/adapters/mcp/write-execution-dispatch.js";
import { successResult } from "../../../src/core/contracts/index.js";

// ─── 1. Route table — three-tool reclassification + new routes ─────────────

describe("MCP_TOOL_ROUTES — three-tool form mutation family (#813 phase 6)", () => {
  const THREE_TOOLS = [
    "apply_form_design_plan",
    "form_set_property",
    "form_delete_control",
  ] as const;

  it("registers form_set_property + form_delete_control as net-new mutating routes", () => {
    // Cast through `unknown` so the lookup works before the route table is
    // extended — the assertion below is what flips RED→GREEN.
    const routes = MCP_TOOL_ROUTES as unknown as Record<string, McpToolRoute>;
    for (const name of ["form_set_property", "form_delete_control"]) {
      const route = routes[name];
      expect(route, `${name} must have a route entry`).toBeDefined();
      expect(route?.kind, `${name} kind`).toBe("vba-sync");
      expect(
        (route as { mutatesBinary: boolean } | undefined)?.mutatesBinary,
        `${name} mutatesBinary must be true`,
      ).toBe(true);
      expect(
        (route as { mutatesFilesystem: boolean } | undefined)?.mutatesFilesystem,
        `${name} mutatesFilesystem must be true`,
      ).toBe(true);
    }
  });

  it("reclassifies apply_form_design_plan from read-only to mutating", () => {
    // The pre-Phase-6 route is read-only (kind:vba-sync, mutatesBinary:false,
    // mutatesFilesystem:false). Phase 6 flips BOTH mutates flags and pins
    // risk to routine-dev-write so MCP_WRITES_DISABLED actually fires.
    // Cast through `unknown` so the McpToolRoute union narrows cleanly
    // (mirrors dispatch-routes-risk.test.ts) — the vba-sync branch carries
    // mutatesBinary + mutatesFilesystem; the other branches do not.
    const route = MCP_TOOL_ROUTES.apply_form_design_plan as unknown as {
      kind: string;
      mutatesBinary: boolean;
      mutatesFilesystem: boolean;
      risk: string;
    };
    expect(route.kind).toBe("vba-sync");
    expect(route.mutatesBinary, "apply_form_design_plan mutatesBinary").toBe(true);
    expect(route.mutatesFilesystem, "apply_form_design_plan mutatesFilesystem").toBe(true);
    expect(route.risk, "apply_form_design_plan risk").toBe("routine-dev-write");
  });

  it("classifies risk per the design.md spec (set=routine, delete=destructive)", () => {
    const routes = MCP_TOOL_ROUTES as unknown as Record<string, { risk: string }>;
    expect(routes.form_set_property?.risk).toBe("routine-dev-write");
    expect(routes.form_delete_control?.risk).toBe("destructive-write");
  });

  it("three tools are NOT in the read-only family (regression pin)", () => {
    for (const name of THREE_TOOLS) {
      // Cast through `unknown` so the McpToolRoute union narrows cleanly
      // (mirrors the dispatch-routes-risk.test.ts pattern — every other
      // route entry is vba-sync for these three names, but the type
      // system needs an explicit cast to read the mutates flags).
      const route = (
        MCP_TOOL_ROUTES as unknown as Record<
          string,
          { kind: string; mutatesBinary?: boolean; mutatesFilesystem?: boolean }
        >
      )[name];
      expect(route, `${name} must have a route`).toBeDefined();
      // read-only routes have BOTH mutates flags false. Any non-false on
      // either flag means the tool is in the mutating family and must not
      // be classified as read-only.
      if (route?.kind === "vba-sync") {
        const isMutating = route.mutatesBinary === true || route.mutatesFilesystem === true;
        expect(isMutating, `${name} must NOT be a read-only vba-sync route`).toBe(true);
      }
    }
  });
});

// ─── 2. Tool registry — the 2 net-new names must exist as the type source ──

describe("tool registry — three-tool presence (#813 phase 6)", () => {
  it("VBA_SYNC_TOOL_NAMES contains the 2 new tool names", () => {
    expect((VBA_SYNC_TOOL_NAMES as readonly string[]).includes("form_set_property")).toBe(true);
    expect((VBA_SYNC_TOOL_NAMES as readonly string[]).includes("form_delete_control")).toBe(true);
  });

  it("DYSFLOW_MCP_TOOL_NAMES contains the 2 new tool names", () => {
    expect((DYSFLOW_MCP_TOOL_NAMES as readonly string[]).includes("form_set_property")).toBe(true);
    expect((DYSFLOW_MCP_TOOL_NAMES as readonly string[]).includes("form_delete_control")).toBe(
      true,
    );
  });

  it("tool counts step from 36/60 to 38/62 (Phase 6 cascade)", () => {
    // VBA_SYNC_TOOL_NAMES gains 2; query is unchanged.
    expect(VBA_SYNC_TOOL_NAMES).toHaveLength(38);
    expect(DYSFLOW_MCP_TOOL_NAMES).toHaveLength(62);
    expect(new Set(DYSFLOW_MCP_TOOL_NAMES).size).toBe(62);
  });
});

// ─── 3. Parity registry — every non-stub tool must be implemented ──────────

describe("tool parity registry — three-tool implemented (#813 phase 6)", () => {
  for (const name of [
    "apply_form_design_plan",
    "form_set_property",
    "form_delete_control",
  ] as const) {
    it(`${name} is registered with status:"implemented"`, () => {
      const entry = TOOL_PARITY_REGISTRY.find((row) => row.name === name);
      expect(entry, `${name} must have a parity registry row`).toBeDefined();
      expect(entry?.status, `${name} status`).toBe("implemented");
      expect(entry?.slice, `${name} slice`).toBe("vba-sync");
    });
  }

  for (const name of ["form_set_property", "form_delete_control"] as const) {
    it(`${name} has a real description (not the auto-built fallback)`, () => {
      const desc = TOOL_DESCRIPTIONS[name];
      expect(desc, `${name} must have a description`).toBeDefined();
      expect(desc?.length ?? 0, `${name} description length`).toBeGreaterThan(40);
      // The auto-built fallback starts with "Dysflow MCP tool <name>; ... tracked
      // for parity"; a real description must NOT match that prefix.
      expect(
        desc?.startsWith(`Dysflow MCP tool ${name};`),
        `${name} description is not the fallback`,
      ).toBe(false);
    });
  }

  it("getToolDefinition returns implemented for all three tools", () => {
    for (const name of [
      "apply_form_design_plan",
      "form_set_property",
      "form_delete_control",
    ] as DysflowMcpToolName[]) {
      expect(getToolDefinition(name).status, `${name} status via helper`).toBe("implemented");
    }
  });
});

// ─── 4. Effective dry-run default — capabilities vs resolver agreement ────

describe("effectiveDryRunDefaultForTool — three-tool plan-by-default (#813 phase 6)", () => {
  // The resolver reports the RISK-CLASS default (single source of truth).
  // The form-mutation family is in POLICY_EXEMPT_TOOLS — the dispatch seam
  // does NOT inject that resolver value. The exemption is verified
  // separately in the "POLICY_EXEMPT_TOOLS — three-tool exempt" block
  // below (resolveEffectiveDryRunInput test).
  for (const name of ["apply_form_design_plan", "form_set_property", "form_delete_control"]) {
    it(`${name} defaults to dry-run:true in safe-by-default mode`, () => {
      expect(effectiveDryRunDefaultForTool(name, "safe-by-default")).toBe(true);
    });

    it(`${name} — capabilities snapshot agrees with resolver helper (both modes)`, () => {
      const tool$ = createGetCapabilitiesTool({
        writesEnabled: true,
        writeAccessResolver: undefined,
        allowedProcedures: [],
        projectId: "test-813-p6",
        allowWrites: true,
        accessDbPath: "C:/project/front.accdb",
        writeExecutionPolicy: "developer",
      });
      const handler = tool$.handler as unknown as (
        input: Record<string, unknown>,
      ) => Promise<{ content: Array<{ text: string }> }>;
      return handler({}).then((result) => {
        const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
          effectiveDryRunDefault: Record<string, boolean>;
        };
        // The snapshot is the resolver's risk-class default. routine-dev-write
        // (apply_form_design_plan + form_set_property) flips to false in
        // developer mode; destructive-write (form_delete_control) stays true.
        const resolverDeveloper = effectiveDryRunDefaultForTool(name, "developer");
        expect(payload.effectiveDryRunDefault[name], `snapshot for ${name} (developer mode)`).toBe(
          resolverDeveloper,
        );
      });
    });
  }

  it("apply_form_design_plan + form_set_property flip to false in developer (routine-dev-write)", () => {
    // Mirrors the existing capa-5 pin for import_modules / import_all /
    // test_vba: routine-dev-write is the only risk that flips to false in
    // developer mode. The exemption in POLICY_EXEMPT_TOOLS prevents the
    // dispatch from INJECTING this value; the resolver still reports it.
    expect(effectiveDryRunDefaultForTool("apply_form_design_plan", "developer")).toBe(false);
    expect(effectiveDryRunDefaultForTool("form_set_property", "developer")).toBe(false);
  });

  it("form_delete_control stays at true in developer (destructive-write, no flip)", () => {
    // destructive-write stays at true in both modes (the operator must
    // explicitly opt in via apply:true). This is the same pin as
    // form_deserialize / delete_module / export_modules.
    expect(effectiveDryRunDefaultForTool("form_delete_control", "developer")).toBe(true);
  });
});

// ─── 5. POLICY_EXEMPT_TOOLS — form mutation family keeps plan-by-default ──

describe("POLICY_EXEMPT_TOOLS — three-tool exempt in developer mode (#813 phase 6)", () => {
  // The seam-level helper is the contract: in developer mode, exempt tools
  // get NO policy-driven `dryRun` injection — the forwarded payload must
  // not carry a `dryRun` key, mirroring the existing `catalog_add_control`
  // scenario in dispatch-write-policy-overrides.test.ts.
  for (const name of ["apply_form_design_plan", "form_set_property", "form_delete_control"]) {
    it(`${name} — developer mode without flags forwards input WITHOUT dryRun (exempt)`, () => {
      const normalized = resolveEffectiveDryRunInput(name, "developer", {
        sourcePath: "C:/repo/forms/Form_X.form.txt",
        controlName: "cmd",
      });
      expect(normalized, `${name} exempt input must NOT inject dryRun`).not.toHaveProperty(
        "dryRun",
      );
    });

    it(`${name} — explicit dryRun:true is preserved (caller intent wins)`, () => {
      const normalized = resolveEffectiveDryRunInput(name, "developer", {
        sourcePath: "C:/repo/forms/Form_X.form.txt",
        controlName: "cmd",
        dryRun: true,
      });
      expect(normalized).toMatchObject({ dryRun: true });
    });

    it(`${name} — explicit apply:true is preserved (caller intent wins)`, () => {
      const normalized = resolveEffectiveDryRunInput(name, "developer", {
        sourcePath: "C:/repo/forms/Form_X.form.txt",
        controlName: "cmd",
        apply: true,
      });
      expect(normalized).toMatchObject({ apply: true });
    });
  }
});

// ─── 6. MCP_WRITES_DISABLED write-gate — handler-level integration ─────────

class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
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
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

function makeServices() {
  return {
    vbaService: new FakeVbaService(),
    vbaSyncToolService: new FakeVbaSyncToolService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };
}

function toolByName(
  services: ReturnType<typeof makeServices>,
  name: string,
  writesEnabled = false,
  policy: "safe-by-default" | "developer" = "safe-by-default",
) {
  const tools = createDysflowMcpTools({
    services,
    writes: writesEnabled,
    writeExecutionPolicy: policy,
  });
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return { tool, vbaSyncToolService: services.vbaSyncToolService as FakeVbaSyncToolService };
}

const WRITE_GATE_INPUTS: Record<string, Record<string, unknown>> = {
  apply_form_design_plan: {
    plan: {
      formName: "Form_X",
      sourceContract: {
        formName: "Form_X",
        controls: [],
        formEvents: [],
        unmappedEvidence: [],
        warnings: [],
      },
      operations: [],
      warnings: [],
    },
    sourcePath: "C:/repo/forms/Form_X.form.txt",
    apply: true,
  },
  form_set_property: {
    sourcePath: "C:/repo/forms/Form_X.form.txt",
    controlName: "cmdSave",
    property: "Caption",
    value: "Save",
    apply: true,
  },
  form_delete_control: {
    sourcePath: "C:/repo/forms/Form_X.form.txt",
    controlName: "cmdObsolete",
    apply: true,
  },
};

describe("MCP_WRITES_DISABLED — three-tool gate enforcement (#813 phase 6)", () => {
  for (const name of ["apply_form_design_plan", "form_set_property", "form_delete_control"]) {
    it(`${name} refuses with apply:true when writes are disabled (#813 acceptance #5)`, async () => {
      const services = makeServices();
      const { tool, vbaSyncToolService } = toolByName(services, name, false);
      const input = WRITE_GATE_INPUTS[name] ?? {};
      const result = await tool.handler(input);
      expect(result.isError, `${name} must refuse when writes disabled`).toBe(true);
      expect(result.content[0]?.text, `${name} must surface MCP_WRITES_DISABLED`).toContain(
        "MCP_WRITES_DISABLED",
      );
      // CRITICAL — the gate must fire BEFORE any adapter dispatch.
      expect(vbaSyncToolService.requests, `${name} must NOT reach the adapter`).toEqual([]);
    });

    it(`${name} with dryRun:true when writes are disabled is NOT gated (preview path)`, async () => {
      const services = makeServices();
      const { tool, vbaSyncToolService } = toolByName(services, name, false);
      const input = { ...(WRITE_GATE_INPUTS[name] ?? {}), apply: undefined, dryRun: true };
      const result = await tool.handler(input);
      expect(result.isError, `${name} dryRun must not gate`).toBe(false);
      expect(
        result.content[0]?.text ?? "",
        `${name} dryRun must not surface MCP_WRITES_DISABLED`,
      ).not.toContain("MCP_WRITES_DISABLED");
      // Adapter is called once with the dryRun payload preserved.
      expect(
        vbaSyncToolService.requests,
        `${name} dryRun must reach the adapter once`,
      ).toHaveLength(1);
    });

    it(`${name} with apply:true when writes are enabled reaches the adapter`, async () => {
      const services = makeServices();
      const { tool, vbaSyncToolService } = toolByName(services, name, true);
      const input = WRITE_GATE_INPUTS[name] ?? {};
      const result = await tool.handler(input);
      expect(result.isError, `${name} enabled writes must succeed`).toBe(false);
      expect(vbaSyncToolService.requests, `${name} adapter must receive the call`).toHaveLength(1);
    });
  }
});

// ─── 7. apply_form_design_plan schema — dead targetPath removed ───────────

describe("apply_form_design_plan schema (#813 phase 6 — targetPath removed)", () => {
  it("does NOT declare targetPath anymore (dead field)", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.apply_form_design_plan;
    expect(schema).toBeDefined();
    expect(schema?.properties, "apply_form_design_plan properties must exist").toBeDefined();
    expect(
      schema?.properties?.targetPath,
      "targetPath must be removed (unvalidated alternate write destination)",
    ).toBeUndefined();
  });

  it("still declares sourcePath / path / plan / dryRun / apply / outputMode", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.apply_form_design_plan;
    expect(schema?.properties).toEqual(
      expect.objectContaining({
        plan: expect.any(Object),
        dryRun: expect.any(Object),
        apply: expect.any(Object),
        outputMode: expect.any(Object),
      }),
    );
    // sourcePath is on the base spread (CTX_PROPS / ACCESS_OVERRIDE) — accept
    // either the explicit field or its alias `path`.
    const hasSource = Boolean(schema?.properties?.sourcePath) || Boolean(schema?.properties?.path);
    expect(hasSource, "apply_form_design_plan must still declare a sourcePath-equivalent").toBe(
      true,
    );
  });
});

// ─── 8. Form mutation family adapter exposure ─────────────────────────────

describe("form mutation family exposed via createDysflowMcpTools (#813 phase 6)", () => {
  it("advertises all three tools", () => {
    const tools = createDysflowMcpTools({
      services: makeServices(),
      writes: true,
    });
    const advertised = tools.map((tool) => tool.name);
    expect(advertised).toEqual(
      expect.arrayContaining([
        "apply_form_design_plan",
        "form_set_property",
        "form_delete_control",
      ]),
    );
  });

  it("visible tool count step (cascade 71 -> 73)", () => {
    // Issue #807 (Feature 1) added `list_vba_modules`: visible 70 -> 71.
    // Phase 6 adds 2 more (form_set_property + form_delete_control):
    // 71 -> 73.
    const tools = createDysflowMcpTools({
      services: makeServices(),
      writes: true,
    });
    const visible = tools.filter((tool) => !tool.hidden).length;
    expect(visible, "visible tool count after Phase 6").toBe(73);
  });
});
