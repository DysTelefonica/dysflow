/**
 * Issue #809 - `sync_binary` workflow tool acceptance tests.
 *
 * Pins the 8 acceptance criteria from issue #809 at the dispatch-factory
 * and route table level. The full five-step compose logic
 * (verify -> plan -> execute -> re-verify -> recommend) is exercised at
 * the adapter level in `test/adapters/vba-sync/sync-binary.test.ts`.
 *
 * Hard rules pinned here:
 *   1. sync_binary is added to VBA_SYNC_TOOL_NAMES + DYSFLOW_MCP_TOOL_NAMES.
 *   2. MCP_TOOL_ROUTES classifies it as a write-class vba-sync tool
 *      (mutatesBinary + mutatesFilesystem both true because apply:true
 *      can write either side).
 *   3. The MCP_TOOL_ROUTES cascade steps from 79 -> 80 advertised tools.
 *   4. sync_binary is isDryRunCapableBinaryWrite (the dispatch must consult
 *      resolveIsDryRun, not collapse to isDryRun===false on the raw-binary
 *      branch). This pins acceptance criterion #2 (dryRun by default).
 *   5. sync_binary is in POLICY_EXEMPT_TOOLS so the developer-mode policy
 *      helper does NOT inject `dryRun: false` on plan-intended calls.
 *   6. The write-gate (MCP_WRITES_DISABLED) fires on apply:true when
 *      writes are disabled (acceptance criterion #8 backward compat).
 *   7. The schema declares direction / scope / dryRun / apply / batchSize /
 *      onChunkError / parallelChunks / returnFullDiff / moduleNames /
 *      directoryPath / recursive / includeTests / includeForms / strict.
 *   8. TOOL_DESCRIPTIONS has a real description (not the auto-built
 *      fallback) and the parity registry has status:"implemented".
 *
 * Acceptance criteria coverage map (issue body):
 *   AC1: dryRun:true populates plan.toImport without touching binary
 *        -> pinned via dispatch unit test (the adapter-level test in
 *        test/adapters/vba-sync/sync-binary.test.ts covers the actual
 *        plan population).
 *   AC2: apply:true runs import_modules with toImport chunked
 *        -> pinned via adapter test (chunk shape) AND via dispatch
 *        "reaches the adapter when writes enabled" test below.
 *   AC3: direction:'binary-to-src' runs export_modules with toExport
 *        -> pinned via adapter test.
 *   AC4: postSync.missingInBinary=[] && postSync.actionable.total=0
 *        after successful sync
 *        -> pinned via adapter test (assertion on the postSync shape).
 *   AC5: scope.actionableOnly:true (default) excludes nonActionable
 *        -> pinned via adapter test.
 *   AC6: scope.includeBothChanged:true includes them with
 *        skipped.reason:'bothChanged_acknowledged'
 *        -> pinned via adapter test.
 *   AC7: ok:false + recommendation:'manual_merge' when sync leaves
 *        residual diffs
 *        -> pinned via adapter test.
 *   AC8: backward compat - sync_binary is additive; existing consumers
 *        using verify_code + import_modules directly still work
 *        -> pinned by the route-table test below (the existing
 *        verify_code/import_modules routes are untouched).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXPECTED_ADVERTISED_TOOL_COUNT } from "../../../E2E_testing/_helpers/advertised-tool-count.mjs";
import { MCP_TOOL_ROUTES, type McpToolRoute } from "../../../src/adapters/mcp/dispatch-routes.js";
import {
  DYSFLOW_MCP_TOOL_NAMES,
  type DysflowMcpToolName,
  VBA_SYNC_TOOL_NAMES,
} from "../../../src/adapters/mcp/mcp-tool-registry.js";
import { effectiveDryRunDefaultForTool } from "../../../src/adapters/mcp/mcp-tool-risks.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { buildHiddenToolRegistry } from "../../../src/adapters/mcp/stdio-wrappers.js";
import {
  getToolDefinition,
  TOOL_DESCRIPTIONS,
  TOOL_PARITY_REGISTRY,
} from "../../../src/adapters/mcp/tool-parity-registry.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { resolveEffectiveDryRunInput } from "../../../src/adapters/mcp/write-execution-dispatch.js";
import { successResult } from "../../../src/core/contracts/index.js";

// ─── 1. Tool registry — sync_binary must exist as a vba-sync tool name ──────

describe("sync_binary — tool registry presence (#809)", () => {
  it("VBA_SYNC_TOOL_NAMES contains sync_binary", () => {
    expect((VBA_SYNC_TOOL_NAMES as readonly string[]).includes("sync_binary")).toBe(true);
  });

  it("DYSFLOW_MCP_TOOL_NAMES contains sync_binary", () => {
    expect((DYSFLOW_MCP_TOOL_NAMES as readonly string[]).includes("sync_binary")).toBe(true);
  });

  it("VBA_SYNC_TOOL_NAMES count steps from 44 to 45 (sync_binary is the 45th vba-sync tool)", () => {
    // Pre-#809 cascade: 44 (after #818). #809 adds 1 -> 45. #872 adds
    // 4 more (form_set_properties + form_duplicate_control +
    // form_get_geometry + form_list_controls): 45 -> 49.
    expect(VBA_SYNC_TOOL_NAMES).toHaveLength(49);
  });

  it("DYSFLOW_MCP_TOOL_NAMES count steps from 68 to 69 (sync_binary is the 69th tool)", () => {
    // #872 cascades 69 -> 73 (form_set_properties + form_duplicate_control
    // + form_get_geometry + form_list_controls).
    expect(DYSFLOW_MCP_TOOL_NAMES).toHaveLength(73);
    expect(new Set(DYSFLOW_MCP_TOOL_NAMES).size).toBe(73);
  });
});

// ─── 2. Route table — sync_binary is write-class (mutates both sides) ────────

describe("MCP_TOOL_ROUTES — sync_binary classification (#809)", () => {
  const route = MCP_TOOL_ROUTES as unknown as Record<
    string,
    { kind: string; mutatesBinary?: boolean; mutatesFilesystem?: boolean; risk: string }
  >;

  it("registers sync_binary as a vba-sync route", () => {
    const r = route.sync_binary;
    expect(r, "sync_binary must have a route entry").toBeDefined();
    expect(r?.kind, "sync_binary kind").toBe("vba-sync");
  });

  it("sync_binary mutatesBinary is true (apply:true -> import_modules writes the binary)", () => {
    expect(route.sync_binary?.mutatesBinary).toBe(true);
  });

  it("sync_binary mutatesFilesystem is true (apply:true direction='binary-to-src' -> export_modules writes the source tree)", () => {
    expect(route.sync_binary?.mutatesFilesystem).toBe(true);
  });

  it("sync_binary risk is routine-dev-write (composable workflow - matches apply_form_design_plan / form_set_property)", () => {
    expect(route.sync_binary?.risk).toBe("routine-dev-write");
  });

  it("every vba-sync tool still resolves to a McpToolRoute (regression pin)", () => {
    const allowedKinds = new Set<McpToolRoute["kind"]>([
      "vba-sync",
      "query-read",
      "query-maintenance",
    ]);
    for (const [tool, r] of Object.entries(MCP_TOOL_ROUTES)) {
      expect(allowedKinds.has(r.kind), `${tool} kind=${r.kind}`).toBe(true);
    }
  });
});

// ─── 3. Parity registry — sync_binary is implemented + has a real description ─

describe("tool parity registry — sync_binary implemented (#809)", () => {
  it("sync_binary has status:'implemented' in the parity registry", () => {
    const entry = TOOL_PARITY_REGISTRY.find((row) => row.name === "sync_binary");
    expect(entry, "sync_binary must have a parity registry row").toBeDefined();
    expect(entry?.status).toBe("implemented");
    expect(entry?.slice).toBe("vba-sync");
  });

  it("getToolDefinition returns implemented for sync_binary", () => {
    expect(getToolDefinition("sync_binary" as DysflowMcpToolName).status).toBe("implemented");
  });

  it("sync_binary has a real TOOL_DESCRIPTIONS entry (not the auto-built fallback)", () => {
    const desc = TOOL_DESCRIPTIONS.sync_binary;
    expect(desc, "sync_binary must have a description").toBeDefined();
    expect(desc?.length ?? 0).toBeGreaterThan(40);
    // The auto-built fallback starts with "Dysflow MCP tool <name>; ... tracked
    // for parity"; a real description must NOT match that prefix.
    expect(desc?.startsWith("Dysflow MCP tool sync_binary;")).toBe(false);
  });
});

// ─── 4. Schema — every documented parameter must be declared ───────────────

describe("sync_binary schema (#809)", () => {
  const schema = VBA_SYNC_TOOL_SCHEMAS.sync_binary;

  it("declares an object schema with no extra-property passthrough (additionalProperties:false)", () => {
    expect(schema).toBeDefined();
    expect(schema?.type).toBe("object");
    expect(schema?.additionalProperties).toBe(false);
  });

  it("declares direction (enum: src-to-binary | binary-to-src | both)", () => {
    const direction = schema?.properties?.direction as
      | { type: string; enum?: readonly string[] }
      | undefined;
    expect(direction, "direction must be declared").toBeDefined();
    expect(direction?.type).toBe("string");
    expect(direction?.enum).toEqual(["src-to-binary", "binary-to-src", "both"]);
  });

  it("declares scope as an object (actionableOnly default true, includeBothChanged default false)", () => {
    const scope = schema?.properties?.scope as
      | {
          type: string;
          properties?: Record<string, unknown>;
        }
      | undefined;
    expect(scope, "scope must be declared").toBeDefined();
    expect(scope?.type).toBe("object");
    expect(scope?.properties?.actionableOnly).toBeDefined();
    expect(scope?.properties?.includeBothChanged).toBeDefined();
  });

  it("declares dryRun + apply (apply is the commit signal; dryRun is the explicit escape hatch)", () => {
    expect(schema?.properties?.dryRun).toBeDefined();
    expect(schema?.properties?.apply).toBeDefined();
  });

  it("declares batchSize (modules per chunk during execute)", () => {
    expect(schema?.properties?.batchSize).toBeDefined();
  });

  it("declares onChunkError (continue | abort)", () => {
    const onChunkError = schema?.properties?.onChunkError as
      | { enum?: readonly string[] }
      | undefined;
    expect(onChunkError?.enum).toEqual(["continue", "abort"]);
  });

  it("declares parallelChunks (reserved for future parallel chunk fan-out, accepts integer 1..8)", () => {
    const parallelChunks = schema?.properties?.parallelChunks as
      | { type?: string; minimum?: number; maximum?: number }
      | undefined;
    expect(parallelChunks).toBeDefined();
    // The shared JsonSchemaPrimitiveType union does NOT include "integer" -
    // we use "number" (matches every other chunk-size parameter in the
    // registry: import_modules.chunkSize, verify_code.chunkSize, etc.).
    // 1..8 is enforced via minimum/maximum so the semantic intent is preserved.
    expect(parallelChunks?.type).toBe("number");
    expect(parallelChunks?.minimum).toBe(1);
    expect(parallelChunks?.maximum).toBe(8);
  });

  it("declares returnFullDiff (boolean opt-in to include the full verify_code diff in the response)", () => {
    expect(schema?.properties?.returnFullDiff).toBeDefined();
  });

  it("declares moduleNames / directoryPath / recursive / includeTests / includeForms / strict", () => {
    // moduleNames + strict come from the SCHEMA_PROPS surface.
    expect(schema?.properties?.moduleNames).toBeDefined();
    expect(schema?.properties?.strict).toBeDefined();
    // directoryPath + recursive + includeTests + includeForms are sync-binary-
    // specific knobs that mirror the directory-walk shape from
    // import_modules (#807) but resolved against the project source tree.
    expect(schema?.properties?.directoryPath).toBeDefined();
    expect(schema?.properties?.recursive).toBeDefined();
    expect(schema?.properties?.includeTests).toBeDefined();
    expect(schema?.properties?.includeForms).toBeDefined();
  });

  it("includes CTX_PROPS (projectId / contextId / accessPath / strictContext / expectedAccessPath etc.)", () => {
    const props = schema?.properties ?? {};
    expect(props.projectId).toBeDefined();
    expect(props.contextId).toBeDefined();
    expect(props.accessPath).toBeDefined();
    expect(props.strictContext).toBeDefined();
    expect(props.expectedAccessPath).toBeDefined();
    expect(props.timeoutMs).toBeDefined();
  });

  it("does NOT accept the v1.18 `compile` key (regression pin against compile_vba resurrection)", () => {
    expect(schema?.properties?.compile).toBeUndefined();
  });
});

// ─── 5. POLICY_EXEMPT_TOOLS — sync_binary must keep plan-by-default ─────────

describe("POLICY_EXEMPT_TOOLS — sync_binary exempt in developer mode (#809)", () => {
  it("developer mode without flags forwards input WITHOUT dryRun (exempt)", () => {
    const normalized = resolveEffectiveDryRunInput("sync_binary", "developer", {
      projectId: "test-809",
      direction: "src-to-binary",
    });
    expect(normalized, "sync_binary exempt input must NOT inject dryRun").not.toHaveProperty(
      "dryRun",
    );
  });

  it("explicit dryRun:true is preserved (caller intent wins)", () => {
    const normalized = resolveEffectiveDryRunInput("sync_binary", "developer", {
      projectId: "test-809",
      dryRun: true,
    });
    expect(normalized).toMatchObject({ dryRun: true });
  });

  it("explicit apply:true is preserved (caller intent wins)", () => {
    const normalized = resolveEffectiveDryRunInput("sync_binary", "developer", {
      projectId: "test-809",
      apply: true,
    });
    expect(normalized).toMatchObject({ apply: true });
  });

  it("effectiveDryRunDefaultForTool resolves sync_binary to true in safe-by-default (caller must opt-in via apply)", () => {
    expect(effectiveDryRunDefaultForTool("sync_binary", "safe-by-default")).toBe(true);
  });

  it("effectiveDryRunDefaultForTool resolves sync_binary to false in developer (routine-dev-write flips)", () => {
    // routine-dev-write flips to false in developer (same family as
    // apply_form_design_plan / form_set_property / import_modules). The
    // POLICY_EXEMPT_TOOLS entry prevents the dispatch from INJECTING this
    // value on plan-intended calls; the resolver still reports it.
    expect(effectiveDryRunDefaultForTool("sync_binary", "developer")).toBe(false);
  });
});

// ─── 6. MCP_WRITES_DISABLED — write-gate fires on apply:true, bypassed on dryRun:true ─

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
) {
  const tools = createDysflowMcpTools({
    services,
    writes: writesEnabled,
    writeExecutionPolicy: "safe-by-default",
  });
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return { tool, vbaSyncToolService: services.vbaSyncToolService as FakeVbaSyncToolService };
}

describe("MCP_WRITES_DISABLED — sync_binary gate enforcement (#809 acceptance #8)", () => {
  it("refuses with apply:true when writes are disabled (acceptance #8)", async () => {
    const services = makeServices();
    const { tool, vbaSyncToolService } = toolByName(services, "sync_binary", false);
    const result = await tool.handler({
      projectId: "test-809",
      direction: "src-to-binary",
      apply: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? "").toContain("MCP_WRITES_DISABLED");
    // CRITICAL - the gate must fire BEFORE any adapter dispatch.
    expect(vbaSyncToolService.requests).toEqual([]);
  });

  it("dryRun:true when writes are disabled is NOT gated (preview path)", async () => {
    const services = makeServices();
    const { tool, vbaSyncToolService } = toolByName(services, "sync_binary", false);
    const result = await tool.handler({
      projectId: "test-809",
      direction: "src-to-binary",
      dryRun: true,
    });
    expect(result.isError, "sync_binary dryRun must not gate").toBe(false);
    expect(result.content[0]?.text ?? "").not.toContain("MCP_WRITES_DISABLED");
    // Adapter is called once with the dryRun payload preserved.
    expect(vbaSyncToolService.requests).toHaveLength(1);
  });

  it("apply:true when writes are enabled reaches the adapter", async () => {
    const services = makeServices();
    const { tool, vbaSyncToolService } = toolByName(services, "sync_binary", true);
    const result = await tool.handler({
      projectId: "test-809",
      direction: "src-to-binary",
      apply: true,
    });
    expect(result.isError).toBe(false);
    expect(vbaSyncToolService.requests).toHaveLength(1);
  });
});

// ─── 7. createDysflowMcpTools — advertised tool count cascade 79 -> 80 ──────

describe("advertised MCP tool surface — sync_binary cascade (#809)", () => {
  let advertised: string[];
  beforeEach(() => {
    const tools = createDysflowMcpTools({
      services: makeServices(),
      writes: true,
    });
    const hidden = buildHiddenToolRegistry(tools);
    advertised = tools.filter((tool) => !hidden.has(tool.name)).map((tool) => tool.name);
  });
  afterEach(() => {
    advertised = [];
  });

  it("advertises sync_binary", () => {
    expect(advertised).toContain("sync_binary");
  });

  it(`advertises exactly ${EXPECTED_ADVERTISED_TOOL_COUNT} non-hidden tools (issue #809: 79 -> 80; #872: 80 -> 84; #971: 84 -> 85; #976: 85 -> 86; #978: 86 -> 87)`, () => {
    expect(advertised).toHaveLength(EXPECTED_ADVERTISED_TOOL_COUNT);
    expect(EXPECTED_ADVERTISED_TOOL_COUNT).toBe(87);
  });
});

// ─── 8. Backward compat — verify_code / import_modules / export_modules still resolve to the same routes ─

describe("backward compat — three primitive routes untouched (#809 acceptance #8)", () => {
  it("verify_code route unchanged (still vba-sync, read-only)", () => {
    const route = MCP_TOOL_ROUTES.verify_code;
    expect(route.kind).toBe("vba-sync");
    if (route.kind === "vba-sync") {
      expect(route.mutatesBinary).toBe(false);
      expect(route.mutatesFilesystem).toBe(false);
    }
  });

  it("import_modules route unchanged (still vba-sync, mutatesBinary only)", () => {
    const route = MCP_TOOL_ROUTES.import_modules;
    expect(route.kind).toBe("vba-sync");
    if (route.kind === "vba-sync") {
      expect(route.mutatesBinary).toBe(true);
      expect(route.mutatesFilesystem).toBe(false);
    }
  });

  it("export_modules route unchanged (still vba-sync, mutatesFilesystem only)", () => {
    const route = MCP_TOOL_ROUTES.export_modules;
    expect(route.kind).toBe("vba-sync");
    if (route.kind === "vba-sync") {
      expect(route.mutatesBinary).toBe(false);
      expect(route.mutatesFilesystem).toBe(true);
    }
  });
});
