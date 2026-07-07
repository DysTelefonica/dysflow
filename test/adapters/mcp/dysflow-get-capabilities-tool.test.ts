import { afterEach, describe, expect, it } from "vitest";
import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool";
import { MCP_TOOL_CONTRACTS } from "../../../src/adapters/mcp/mcp-tool-contracts";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";
import {
  clearHumanCompileState,
  recordPersistence,
  recordVerifyOk,
} from "../../../src/core/runtime/human-compile-state";

/**
 * PR-1 (issue #656) — `dysflow_get_capabilities` is a read-only MCP tool that
 * returns an aggregated capabilities snapshot for the live MCP adapter. The
 * shape is the consumer surface for #655 (gate-introspection-v1).
 *
 * Cheap unit tests — pure module-import + function-call. No MSACCESS, no
 * PowerShell. The full integration test for the dispatch path lives in
 * `test/adapters/mcp/capabilities-via-dispatch.test.ts`.
 */

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

const ISSUE_713_REQUIRED_TOOLS = [
  "dysflow_list_procedures",
  "dysflow_get_procedure",
  "dysflow_find_references",
  "dysflow_detect_dead_code",
  "dysflow_validate_manifest",
] as const satisfies readonly (keyof typeof MCP_TOOL_CONTRACTS)[];

function makeServices() {
  return {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };
}

describe("getCapabilitiesAll() — pure aggregate function (#656)", () => {
  it("returns the documented snapshot shape with every required field", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: "my-project",
      allowWrites: false,
    });

    expect(snapshot).toMatchObject({
      adapterVersion: expect.any(String),
      surface: "stdio",
      writesProcess: {
        enabled: false,
        resolverConfigured: false,
      },
      writesProject: {
        allowWrites: false,
      },
      projectIdResolution: {
        projectId: "my-project",
        outcome: "resolved",
      },
      toolsVisible: expect.any(Number),
      writeClassToolsPermitted: expect.any(Array),
    });
    expect(snapshot.adapterVersion.length).toBeGreaterThan(0);
  });

  it("reports writesProcess.enabled = true when writesEnabled is true", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: "p",
      allowWrites: true,
    });
    expect(snapshot.writesProcess.enabled).toBe(true);
    expect(snapshot.writesProject.allowWrites).toBe(true);
  });

  it("reports writesProcess.resolverConfigured = true when a resolver is provided", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: async () => true,
      allowedProcedures: undefined,
      projectId: "p",
      allowWrites: false,
    });
    expect(snapshot.writesProcess.resolverConfigured).toBe(true);
  });

  it("propagates allowedProcedures verbatim into the snapshot", () => {
    const allowed = ["Test_A", "Test_B"] as const;
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: allowed,
      projectId: "p",
      allowWrites: true,
    });
    expect(snapshot.allowedProcedures).toEqual(["Test_A", "Test_B"]);
  });

  it("marks projectIdResolution.outcome = 'unresolved' when no projectId is given", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: undefined,
      allowWrites: false,
    });
    expect(snapshot.projectIdResolution).toEqual({
      projectId: null,
      outcome: "unresolved",
    });
  });

  it("counts every tool registered in MCP_TOOL_CONTRACTS as toolsVisible", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: "p",
      allowWrites: false,
    });
    expect(snapshot.toolsVisible).toBe(Object.keys(MCP_TOOL_CONTRACTS).length);
  });

  it("includes every #713 merged VBA tool in the capabilities contract surface", () => {
    const contractNames = Object.keys(MCP_TOOL_CONTRACTS);

    expect(contractNames).toEqual(expect.arrayContaining([...ISSUE_713_REQUIRED_TOOLS]));
    for (const toolName of ISSUE_713_REQUIRED_TOOLS) {
      expect(MCP_TOOL_CONTRACTS[toolName]?.access, `${toolName} must be read-only`).toBe(
        "read-only",
      );
      expect(MCP_TOOL_CONTRACTS[toolName]?.writeGate, `${toolName} must not be write-gated`).toBe(
        "none",
      );
    }
  });

  it("lists every write-class tool name when writes are fully open", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_A"],
      projectId: "p",
      allowWrites: true,
    });

    const expectedWriteClass = Object.entries(MCP_TOOL_CONTRACTS)
      .filter(([, contract]) => contract.access !== "read-only")
      .map(([name]) => name)
      .sort();

    expect([...snapshot.writeClassToolsPermitted].sort()).toEqual(expectedWriteClass);
  });

  it("lists NO write-class tools when writes are fully blocked and no resolver/allowlist applies", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: "p",
      allowWrites: false,
    });
    expect(snapshot.writeClassToolsPermitted).toEqual([]);
  });
});

// Issue #746 — dryRunDefault must align with the AGENTS.md / CHANGELOG v1.14
// promise ("Writing tools now consistently default to plan mode (dryRun: true)
// unless apply === true or dryRun === false is explicitly supplied"). Per-tool
// contracts and the global snapshot surface must report `true`.
describe("dryRunDefault contract — global + per-tool alignment (#746)", () => {
  const VBA_SYNC_WRITE_TOOLS = [
    // feat-759-no-compile (v1.19.0) — compile_vba was removed; the
    // remaining write-class set mutates the .accdb or the source tree.
    "import_modules",
    "import_all",
    "delete_module",
    "fix_encoding",
    "vba_inline_execution",
    "form_add_control",
    "form_move_control",
    "form_rename_control",
    "form_deserialize",
    "create_form_from_template",
  ] as const satisfies readonly (keyof typeof MCP_TOOL_CONTRACTS)[];

  it("every vba-sync write-class contract declares dryRunDefault = true", () => {
    for (const toolName of VBA_SYNC_WRITE_TOOLS) {
      expect(
        MCP_TOOL_CONTRACTS[toolName].dryRunDefault,
        `${toolName} must default to dryRun:true to match AGENTS.md`,
      ).toBe(true);
    }
  });

  it("dryRunDefault snapshot field is true regardless of projectId/allowWrites", () => {
    const writable = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_A"],
      projectId: "p",
      allowWrites: true,
    });
    const lockedDown = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: undefined,
      allowWrites: false,
    });
    expect(writable.dryRunDefault).toBe(true);
    expect(lockedDown.dryRunDefault).toBe(true);
  });
});

describe("dysflow_get_capabilities tool — registration and read-only contract (#656)", () => {
  it("is registered as a modern tool by createDysflowMcpTools", () => {
    const tools = createDysflowMcpTools(makeServices(), false);
    const tool = tools.find((t) => t.name === "dysflow_get_capabilities");
    expect(tool, "tool must be registered").toBeDefined();
  });

  it("uses NO_INPUT_SCHEMA (read-only, no required input)", () => {
    const tools = createDysflowMcpTools(makeServices(), false);
    const tool = tools.find((t) => t.name === "dysflow_get_capabilities");
    expect(tool?.inputSchema).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {},
    });
  });

  it("is NOT write-gated: handler returns ok when writes are disabled", async () => {
    const tools = createDysflowMcpTools(makeServices(), false);
    const tool = tools.find((t) => t.name === "dysflow_get_capabilities");
    if (!tool) throw new Error("tool not registered");

    const result = await tool.handler({});
    expect(result.isError).toBe(false);
    expect(result.ok).toBe(true);
    // No MCP_WRITES_DISABLED envelope — confirms the read-only gate contract.
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
  });

  it("handler returns a parseable JSON payload with the documented snapshot", async () => {
    const tools = createDysflowMcpTools(makeServices(), true);
    const tool = tools.find((t) => t.name === "dysflow_get_capabilities");
    if (!tool) throw new Error("tool not registered");

    const result = await tool.handler({});
    expect(result.isError).toBe(false);

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content[0]?.text ?? "{}");
    } catch (error) {
      throw new Error(`Expected dysflow_get_capabilities to return JSON: ${String(error)}`);
    }
    expect(parsed).toMatchObject({
      surface: "stdio",
      writesProcess: expect.any(Object),
      writesProject: expect.any(Object),
      projectIdResolution: expect.any(Object),
      toolsVisible: expect.any(Number),
      writeClassToolsPermitted: expect.any(Array),
    });
  });
});

// PR-1 (issue #762) — v1.20.0 adds a `humanCompilePending: boolean` field to
// the snapshot. The flag is sourced from the project-scoped `human-compile-state`
// keyed by `accessDbPath`. Each test below uses a unique accessPath and clears
// the state in `afterEach` so atoms cannot leak into each other.
describe("getCapabilitiesAll() — humanCompilePending snapshot field (#762)", () => {
  const TEST_ACCESS_PATH = "C:/repo/snapshot-front.accdb";

  afterEach(() => {
    clearHumanCompileState(TEST_ACCESS_PATH);
  });

  it("happy: after recordPersistence the snapshot reports humanCompilePending=true", () => {
    clearHumanCompileState(TEST_ACCESS_PATH);
    recordPersistence(TEST_ACCESS_PATH);

    const snapshot = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: "p",
      allowWrites: false,
      accessDbPath: TEST_ACCESS_PATH,
    });

    expect(snapshot.humanCompilePending).toBe(true);
  });

  it("happy 2: after recordPersistence + recordVerifyOk the snapshot reports humanCompilePending=false", () => {
    clearHumanCompileState(TEST_ACCESS_PATH);
    recordPersistence(TEST_ACCESS_PATH);
    recordVerifyOk(TEST_ACCESS_PATH);

    const snapshot = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: "p",
      allowWrites: false,
      accessDbPath: TEST_ACCESS_PATH,
    });

    expect(snapshot.humanCompilePending).toBe(false);
  });

  it("edge: with no recorded events the snapshot reports humanCompilePending=false", () => {
    clearHumanCompileState(TEST_ACCESS_PATH);

    const snapshot = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: "p",
      allowWrites: false,
      accessDbPath: TEST_ACCESS_PATH,
    });

    expect(snapshot.humanCompilePending).toBe(false);
  });

  it("edge: when no accessDbPath is supplied the snapshot reports humanCompilePending=false (no project in scope)", () => {
    clearHumanCompileState(TEST_ACCESS_PATH);
    recordPersistence(TEST_ACCESS_PATH); // would be pending if accessDbPath was forwarded

    const snapshot = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: undefined,
      allowWrites: false,
      // accessDbPath omitted on purpose
    });

    expect(snapshot.humanCompilePending).toBe(false);
  });
});
