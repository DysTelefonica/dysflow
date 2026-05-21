import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import {
  LEGACY_DYSFLOW_MCP_TOOL_NAMES,
  LEGACY_QUERY_TOOL_NAMES,
  LEGACY_VBA_SYNC_TOOL_NAMES,
} from "../../../src/adapters/mcp/legacy-tool-inventory";
import {
  LEGACY_PARITY_REGISTRY,
  getLegacyParityToolDefinition,
} from "../../../src/adapters/mcp/legacy-parity-registry";
import { successResult, type OperationResult } from "../../../src/core/contracts/index";
import type { AccessDiagnosticsResult } from "../../../src/core/services/diagnostics-service";
import type { AccessQueryResult } from "../../../src/core/services/query-service";
import type { AccessVbaResult } from "../../../src/core/services/vba-service";
import { VbaSyncLegacyService } from "../../../src/core/services/vba-sync-legacy-service";

class FakeVbaService {
  public requests: unknown[] = [];
  async execute(request: unknown): Promise<OperationResult<AccessVbaResult>> {
    this.requests.push(request);
    return successResult({ returnValue: "ok" });
  }
}

class FakeQueryService {
  public requests: unknown[] = [];
  async execute(request: unknown): Promise<OperationResult<AccessQueryResult>> {
    this.requests.push(request);
    return successResult({ rows: [{ ok: true }] });
  }
}

class FakeDiagnosticsService {
  async run(): Promise<OperationResult<AccessDiagnosticsResult>> {
    return successResult({ checks: [] });
  }
}

describe("legacy Dysflow MCP parity inventory", () => {
  it("declares the complete 44-tool legacy inventory", () => {
    expect(LEGACY_VBA_SYNC_TOOL_NAMES).toHaveLength(21);
    expect(LEGACY_QUERY_TOOL_NAMES).toHaveLength(23);
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toHaveLength(44);
    expect(new Set(LEGACY_DYSFLOW_MCP_TOOL_NAMES).size).toBe(44);
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toContain("export_modules");
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toContain("test_vba");
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toContain("query_sql");
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toContain("compact_repair");
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toContain("validate_form_spec");
  });

  it("exports a typed parity registry that classifies every legacy tool", () => {
    expect(LEGACY_PARITY_REGISTRY).toHaveLength(44);
    expect(new Set(LEGACY_PARITY_REGISTRY.map((entry) => entry.name)).size).toBe(44);

    const implemented = LEGACY_PARITY_REGISTRY.filter((entry) => entry.status === "implemented");
    const pending = LEGACY_PARITY_REGISTRY.filter((entry) => entry.status === "pending");

    expect(implemented.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      "list_access_operations",
      "cleanup_access_operation",
      "run_vba",
      "query_sql",
      "list_tables",
      "get_schema",
      "exec_sql",
      "seed_fixture",
    ]));
    expect(pending.length).toBe(0);
    expect(getLegacyParityToolDefinition("query_sql")).toMatchObject({
      name: "query_sql",
      slice: "query",
      status: "implemented",
    });
  });

  it("exposes legacy-compatible names for already implemented Dysflow operations", async () => {
    const vba = new FakeVbaService();
    const query = new FakeQueryService();
    const tools = createDysflowMcpTools({
      vbaService: vba,
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(),
      cleanupService: { cleanup: async () => successResult({ operationId: "op-test", accessPid: 1234, status: "cleaned" as const }) },
    });
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    for (const name of ["list_access_operations", "cleanup_access_operation", "run_vba", "query_sql"] as const) {
      expect(byName.has(name), `${name} should be registered`).toBe(true);
    }

    await byName.get("run_vba")?.handler({ procedureName: "Smoke", argsJson: "[1,2]" });
    await byName.get("query_sql")?.handler({ sql: "SELECT 1" });

    expect(vba.requests).toEqual([{ moduleName: "", procedureName: "Smoke", arguments: [1, 2] }]);
    expect(query.requests).toEqual([{ sql: "SELECT 1", mode: "read" }]);
  });

  it("returns explicit service-unavailable errors for VBA sync tools when the product service is not configured", async () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    });
    const exportModules = tools.find((tool) => tool.name === "export_modules");

    await expect(exportModules?.handler({ moduleNames: ["Module1"] })).resolves.toEqual({
      isError: true,
      content: [{ type: "text", text: "MCP_SERVICE_UNAVAILABLE: export_modules requires the legacy VBA sync service to be configured." }],
    });
  });

  it("dispatches VBA sync legacy tools to the configured product service", async () => {
    const legacyCalls: unknown[] = [];
    const queryCalls: unknown[] = [];
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(),
      queryService: {
        execute: async (request: unknown) => {
          queryCalls.push(request);
          return successResult({ rows: [{ ok: true }] });
        },
      },
      diagnosticsService: new FakeDiagnosticsService(),
      legacyToolService: {
        execute: async (toolName, input) => {
          legacyCalls.push({ toolName, input });
          return successResult({ ok: true, toolName });
        },
      },
    }, true);

    await expect(tools.find((tool) => tool.name === "export_modules")?.handler({ moduleNames: ["Module1"], accessPath: "C:/db.accdb" })).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ ok: true, toolName: "export_modules" }) }],
    });
    await expect(tools.find((tool) => tool.name === "list_tables")?.handler({ backendPath: "C:/db.accdb" })).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(tools.find((tool) => tool.name === "exec_sql")?.handler({ sql: "UPDATE People SET Name='Ada'", apply: false })).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(tools.find((tool) => tool.name === "run_script")?.handler({ path: "fixtures.sql", apply: true })).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(tools.find((tool) => tool.name === "teardown_fixture")?.handler({ tableName: "People", dryRun: false })).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(tools.find((tool) => tool.name === "verify_binary")?.handler({ moduleNames: ["Form_Main"], diff: true })).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ ok: true, toolName: "verify_binary" }) }],
    });

    expect(legacyCalls).toEqual([
      { toolName: "export_modules", input: { moduleNames: ["Module1"], accessPath: "C:/db.accdb" } },
      { toolName: "verify_binary", input: { moduleNames: ["Form_Main"], diff: true } },
    ]);
    expect(queryCalls).toEqual([
      { action: "list_tables", mode: "read", sql: "", tableName: undefined, columnName: undefined, backendPath: "C:/db.accdb", rootPath: undefined },
      {
        action: "exec_sql",
        mode: "write",
        sql: "UPDATE People SET Name='Ada'",
        tableName: undefined,
        columnName: undefined,
        backendPath: undefined,
        rootPath: undefined,
        scriptPath: undefined,
        definition: undefined,
        rows: undefined,
        dryRun: true,
        allowTables: undefined,
        denyTables: undefined,
      },
      expect.objectContaining({ action: "run_script", scriptPath: "fixtures.sql", dryRun: false }),
      expect.objectContaining({ action: "teardown_fixture", tableName: "People", dryRun: false }),
    ]);
  });

  it("declares maintenance query access modes in the parity registry", () => {
    expect(getLegacyParityToolDefinition("list_links")).toMatchObject({ queryMode: "read" });
    expect(getLegacyParityToolDefinition("export_queries")).toMatchObject({ queryMode: "read" });
    expect(getLegacyParityToolDefinition("link_tables")).toMatchObject({ queryMode: "write" });
    expect(getLegacyParityToolDefinition("compact_repair")).toMatchObject({ queryMode: "write" });
  });

  it("dispatches maintenance query tools to the configured query service", async () => {
    const queryCalls: unknown[] = [];
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(),
      queryService: {
        execute: async (request: unknown) => {
          queryCalls.push(request);
          return successResult({ rows: [{ ok: true }] });
        },
      },
      diagnosticsService: new FakeDiagnosticsService(),
      legacyToolService: {
        execute: async () => successResult({ ok: true }),
      },
    }, true);

    await expect(tools.find((tool) => tool.name === "list_links")?.handler({})).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(tools.find((tool) => tool.name === "link_tables")?.handler({ backendPath: "C:/backend.accdb" })).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(tools.find((tool) => tool.name === "compact_repair")?.handler({ databasePath: "C:/db.accdb", dryRun: true })).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });

    expect(queryCalls).toEqual([
      {
        action: "list_links",
        mode: "read",
        sql: "",
        tableName: undefined,
        columnName: undefined,
        backendPath: undefined,
        rootPath: undefined,
        databasePath: undefined,
        dryRun: true,
        exportPath: undefined,
        importPath: undefined,
        queryDefinitions: undefined,
      },
      {
        action: "link_tables",
        mode: "write",
        sql: "",
        tableName: undefined,
        columnName: undefined,
        backendPath: "C:/backend.accdb",
        rootPath: undefined,
        databasePath: undefined,
        exportPath: undefined,
        importPath: undefined,
        queryDefinitions: undefined,
        dryRun: true,
      },
      {
        action: "compact_repair",
        mode: "write",
        sql: "",
        tableName: undefined,
        columnName: undefined,
        backendPath: undefined,
        rootPath: undefined,
        databasePath: "C:/db.accdb",
        exportPath: undefined,
        importPath: undefined,
        queryDefinitions: undefined,
        dryRun: true,
      },
    ]);
  });

  it("supports the basic form tooling workflow through the legacy VBA sync service", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "dysflow-form-slice-"));
    const service = new VbaSyncLegacyService({
      cwd: tempRoot,
      executor: async () => {
        throw new Error("executor should not be called for local form tooling");
      },
    });

    const spec = {
      name: "Form_Smoke",
      kind: "Form",
      controls: [
        { name: "txtName", type: "TextBox" },
      ],
    };

    await expect(service.execute("validate_form_spec", { spec })).resolves.toMatchObject({
      ok: true,
      data: {
        valid: true,
        name: "Form_Smoke",
        kind: "Form",
        controlCount: 1,
      },
    });

    const generated = await service.execute("generate_form", { spec, destinationRoot: tempRoot });
    expect(generated.ok).toBe(true);
    const generatedPath = (generated.ok ? (generated.data as { outputPath?: string }) : undefined)?.outputPath;
    expect(generatedPath).toBeTruthy();
    if (generatedPath) {
      await expect(readFile(generatedPath, "utf8")).resolves.toContain("Form_Smoke");
    }

    await expect(service.execute("catalog_add_control", {
      spec,
      destinationRoot: tempRoot,
      controlName: "txtName",
      controlType: "TextBox",
    })).resolves.toMatchObject({
      ok: true,
      data: {
        formName: "Form_Smoke",
        controlCount: 1,
      },
    });

    await expect(service.execute("harvest_form_catalog", { destinationRoot: tempRoot })).resolves.toMatchObject({
      ok: true,
      data: {
        total: 1,
      },
    });
  });

});
