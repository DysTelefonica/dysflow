/**
 * Slice 3 RED tests — public form serialize/deserialize MCP tools.
 *
 * Mirrors the slice-4 form-mutation-tools.test.ts pattern:
 * - Registration in 5 surfaces (registry, dispatch-routes, parity, schemas, adapter.handles)
 * - Schema discovery (required params + dryRun/apply gates)
 * - Dry-run when writes are disabled
 * - Apply-route through `vbaSync` service when writes enabled
 * - Round-trip invariant: serialize(ir) === normalizeLineEndings(source)
 *
 * All tests RED at the moment of writing — implementation is Phase 2 GREEN.
 */

import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/dispatch-routes";
import {
  DYSFLOW_MCP_TOOL_NAMES,
  VBA_SYNC_TOOL_NAMES,
} from "../../../src/adapters/mcp/mcp-tool-registry";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas";
import { TOOL_PARITY_REGISTRY } from "../../../src/adapters/mcp/tool-parity-registry";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { VbaFormsAdapter } from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../src/core/contracts/index";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

class FakeVbaSyncToolService {
  public requests: Array<{ toolName: string; input: unknown }> = [];
  async execute(toolName: string, input: unknown) {
    this.requests.push({ toolName, input });
    return successResult({ ok: true, toolName, output: "stub" });
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

const SERIALIZE_NAMES = ["dysflow_form_serialize", "dysflow_form_deserialize"] as const;

// ---------------------------------------------------------------------------
// Registration surfaces — must be present in all 5 surfaces
// ---------------------------------------------------------------------------

describe("public form serialize/deserialize MCP tools — registration", () => {
  it("both serialize tools are registered as public MCP tool names", () => {
    expect(DYSFLOW_MCP_TOOL_NAMES).toEqual(expect.arrayContaining([...SERIALIZE_NAMES]));
    for (const name of SERIALIZE_NAMES) {
      expect((VBA_SYNC_TOOL_NAMES as readonly string[]).includes(name)).toBe(true);
    }
  });

  it("both serialize tools have entries in MCP_TOOL_ROUTES with kind 'vba-sync'", () => {
    for (const name of SERIALIZE_NAMES) {
      expect(MCP_TOOL_ROUTES[name]).toMatchObject({ kind: "vba-sync" });
    }
  });

  it("serialize tool is read-only; deserialize tool mutates binary + filesystem", () => {
    expect(MCP_TOOL_ROUTES.dysflow_form_serialize).toMatchObject({
      kind: "vba-sync",
      mutatesBinary: false,
      mutatesFilesystem: false,
    });
    expect(MCP_TOOL_ROUTES.dysflow_form_deserialize).toMatchObject({
      kind: "vba-sync",
      mutatesBinary: true,
      mutatesFilesystem: true,
    });
  });

  it("both serialize tools are discoverable via TOOL_PARITY_REGISTRY", () => {
    const parityNames = new Set(TOOL_PARITY_REGISTRY.map((tool) => tool.name));
    for (const name of SERIALIZE_NAMES) {
      expect(parityNames.has(name)).toBe(true);
    }
  });

  it("VbaFormsAdapter.handles() returns true for both serialize tools", () => {
    expect(VbaFormsAdapter.handles("dysflow_form_serialize")).toBe(true);
    expect(VbaFormsAdapter.handles("dysflow_form_deserialize")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Schema discovery — required fields + dryRun/apply gates
// ---------------------------------------------------------------------------

describe("public form serialize/deserialize MCP tools — schemas", () => {
  it("dysflow_form_serialize exposes sourcePath, controlName/ir, dryRun, apply", () => {
    expect(VBA_SYNC_TOOL_SCHEMAS.dysflow_form_serialize.properties).toEqual(
      expect.objectContaining({
        sourcePath: expect.any(Object),
        formName: expect.any(Object),
        dryRun: expect.any(Object),
        apply: expect.any(Object),
      }),
    );
  });

  it("dysflow_form_deserialize exposes sourcePath, ir, dryRun, apply", () => {
    expect(VBA_SYNC_TOOL_SCHEMAS.dysflow_form_deserialize.properties).toEqual(
      expect.objectContaining({
        sourcePath: expect.any(Object),
        ir: expect.any(Object),
        dryRun: expect.any(Object),
        apply: expect.any(Object),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Dry-run behavior — write must not happen when writes are disabled
// ---------------------------------------------------------------------------

describe("public form serialize/deserialize MCP tools — write-gate", () => {
  it("serialize tool can be called when writes are disabled (read-only)", async () => {
    const { tool } = toolByName("dysflow_form_serialize", false);
    const result = await tool.handler({
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      formName: "Form_Customer",
    });
    expect(result.ok).toBe(true);
  });

  it("deserialize tool REJECTS apply:true when writes are disabled", async () => {
    const { tool } = toolByName("dysflow_form_deserialize", false);
    const result = await tool.handler({
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      formName: "Form_Customer",
      ir: {
        name: "Form_Customer",
        kind: "Form",
        preamble: [],
        root: { blockType: "Form", entries: [], children: [] },
        codeBehind: null,
      },
      apply: true,
      dryRun: false,
    });
    expect(result.ok).toBe(false);
  });

  it("deserialize tool accepts dryRun:true when writes are disabled", async () => {
    const { tool } = toolByName("dysflow_form_deserialize", false);
    const result = await tool.handler({
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      formName: "Form_Customer",
      ir: {
        name: "Form_Customer",
        kind: "Form",
        preamble: [],
        root: { blockType: "Form", entries: [], children: [] },
        codeBehind: null,
      },
      apply: false,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slice-4 regression — slice 3 must not break slice 4 mutation tools
// ---------------------------------------------------------------------------

describe("slice-3 wiring does not regress slice-4 mutation tools", () => {
  it("dysflow_form_add_control is still callable alongside new serialize tools", async () => {
    const { tool } = toolByName("dysflow_form_add_control", false);
    const result = await tool.handler({
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtNewField",
      controlType: "TextBox",
      dryRun: true,
    });
    expect(result.ok).toBe(true);
  });
});
