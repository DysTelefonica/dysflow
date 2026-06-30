import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/dispatch-routes";
import {
  DYSFLOW_MCP_TOOL_NAMES,
  QUERY_TOOL_NAMES,
  VBA_SYNC_TOOL_NAMES,
} from "../../../src/adapters/mcp/mcp-tool-registry";
import {
  getToolDefinition,
  TOOL_PARITY_REGISTRY,
} from "../../../src/adapters/mcp/tool-parity-registry";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { type OperationResult, successResult } from "../../../src/core/contracts/index";
import type { AccessDiagnosticsResult } from "../../../src/core/services/diagnostics-service";
import type { AccessQueryResult } from "../../../src/core/services/query-service";
import type { AccessVbaResult } from "../../../src/core/services/vba-service";

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

describe("Dysflow MCP tool parity inventory", () => {
  it("declares the complete 51-tool inventory", () => {
    expect(VBA_SYNC_TOOL_NAMES).toHaveLength(27);
    expect(QUERY_TOOL_NAMES).toHaveLength(24);
    expect(DYSFLOW_MCP_TOOL_NAMES).toHaveLength(51);
    expect(new Set(DYSFLOW_MCP_TOOL_NAMES).size).toBe(51);
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("export_modules");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("test_vba");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("query_sql");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("compact_repair");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("validate_form_spec");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("compare_form");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("dysflow_form_add_control");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("dysflow_form_move_control");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("dysflow_form_rename_control");
  });

  it("exports a typed parity registry that classifies every tool", () => {
    expect(TOOL_PARITY_REGISTRY).toHaveLength(51);
    expect(new Set(TOOL_PARITY_REGISTRY.map((entry) => entry.name)).size).toBe(51);

    const implemented = TOOL_PARITY_REGISTRY.filter((entry) => entry.status === "implemented");
    const pending = TOOL_PARITY_REGISTRY.filter((entry) => entry.status === "pending");

    expect(implemented.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "list_access_operations",
        "cleanup_access_operation",
        "run_vba",
        "query_sql",
        "list_tables",
        "get_schema",
        "exec_sql",
        "seed_fixture",
      ]),
    );
    // Zero-hidden-tools policy (#510): every registered tool is implemented and
    // visible, so no tool remains pending.
    expect(pending.length).toBe(0);
    expect(getToolDefinition("verify_code")).toMatchObject({ status: "implemented" });
    expect(getToolDefinition("query_sql")).toMatchObject({
      name: "query_sql",
      slice: "query",
      status: "implemented",
    });
  });

  it("exposes tool names for already implemented Dysflow operations", async () => {
    const vba = new FakeVbaService();
    const query = new FakeQueryService();
    const tools = createDysflowMcpTools({
      vbaService: vba,
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(),
      cleanupService: {
        cleanup: async () =>
          successResult({ operationId: "op-test", accessPid: 1234, status: "cleaned" as const }),
      },
    });
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    for (const name of [
      "list_access_operations",
      "cleanup_access_operation",
      "run_vba",
      "query_sql",
    ] as const) {
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
      content: [
        {
          type: "text",
          text: "MCP_SERVICE_UNAVAILABLE: export_modules requires the VBA sync service to be configured.",
        },
      ],
    });
  });

  it("dispatches VBA sync tools to the configured product service", async () => {
    const vbaSyncCalls: unknown[] = [];
    const queryCalls: unknown[] = [];
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(),
        queryService: {
          execute: async (request: unknown) => {
            queryCalls.push(request);
            return successResult({ rows: [{ ok: true }] });
          },
        },
        diagnosticsService: new FakeDiagnosticsService(),
        vbaSyncToolService: {
          execute: async (toolName, input) => {
            vbaSyncCalls.push({ toolName, input });
            return successResult({ ok: true, toolName });
          },
        },
      },
      true,
    );

    await expect(
      tools
        .find((tool) => tool.name === "export_modules")
        ?.handler({ moduleNames: ["Module1"], accessPath: "C:/db.accdb" }),
    ).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ ok: true, toolName: "export_modules" }) }],
    });
    await expect(
      tools.find((tool) => tool.name === "list_tables")?.handler({ backendPath: "C:/db.accdb" }),
    ).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(
      tools
        .find((tool) => tool.name === "exec_sql")
        ?.handler({ sql: "UPDATE People SET Name='Ada'", apply: false }),
    ).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(
      tools
        .find((tool) => tool.name === "run_script")
        ?.handler({ path: "fixtures.sql", apply: true }),
    ).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(
      tools
        .find((tool) => tool.name === "teardown_fixture")
        ?.handler({ tableName: "People", dryRun: false }),
    ).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(
      tools
        .find((tool) => tool.name === "verify_code")
        ?.handler({ moduleNames: ["Form_Main"], diff: true }),
    ).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ ok: true, toolName: "verify_code" }) }],
    });

    expect(vbaSyncCalls).toEqual([
      {
        toolName: "export_modules",
        input: { moduleNames: ["Module1"], accessPath: "C:/db.accdb" },
      },
      { toolName: "verify_code", input: { moduleNames: ["Form_Main"], diff: true } },
    ]);
    expect(queryCalls).toEqual([
      {
        action: "list_tables",
        mode: "read",
        sql: "",
        tableName: undefined,
        columnName: undefined,
        backendPath: "C:/db.accdb",
        rootPath: undefined,
      },
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

  it("preserves explicit write targets instead of substituting the frontend", async () => {
    const queryCalls: unknown[] = [];
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(),
        queryService: {
          execute: async (request: unknown) => {
            queryCalls.push(request);
            return successResult({ rows: [{ ok: true }] });
          },
        },
        diagnosticsService: new FakeDiagnosticsService(),
      },
      true,
    );

    await tools
      .find((tool) => tool.name === "exec_sql")
      ?.handler({
        accessPath: "C:/frontend.accdb",
        backendPath: "C:/backend.accdb",
        sql: "UPDATE People SET Name='Ada'",
        apply: true,
      });
    await tools
      .find((tool) => tool.name === "create_table")
      ?.handler({
        accessPath: "C:/frontend.accdb",
        databasePath: "C:/write-target.accdb",
        tableName: "ZZZ_Target",
        definition: "Id INTEGER",
        apply: true,
      });
    await tools
      .find((tool) => tool.name === "drop_table")
      ?.handler({
        accessPath: "C:/frontend.accdb",
        sourcePath: "C:/source-alias.accdb",
        tableName: "ZZZ_Target",
        apply: true,
      });
    await tools
      .find((tool) => tool.name === "run_script")
      ?.handler({
        accessPath: "C:/frontend.accdb",
        backendPath: "C:/script-backend.accdb",
        path: "fixtures/backend-ddl.sql",
        apply: true,
      });
    await tools
      .find((tool) => tool.name === "seed_fixture")
      ?.handler({
        accessPath: "C:/frontend.accdb",
        databasePath: "C:/seed-target.accdb",
        tableName: "ZZZ_Target",
        rows: [{ Id: 1 }],
        apply: true,
      });
    await tools
      .find((tool) => tool.name === "teardown_fixture")
      ?.handler({
        accessPath: "C:/frontend.accdb",
        sourcePath: "C:/teardown-target.accdb",
        tableName: "ZZZ_Target",
        apply: true,
      });

    expect(queryCalls).toEqual([
      expect.objectContaining({
        action: "exec_sql",
        backendPath: "C:/backend.accdb",
        databasePath: undefined,
      }),
      expect.objectContaining({
        action: "create_table",
        backendPath: undefined,
        databasePath: "C:/write-target.accdb",
      }),
      expect.objectContaining({
        action: "drop_table",
        backendPath: undefined,
        databasePath: "C:/source-alias.accdb",
      }),
      expect.objectContaining({
        action: "run_script",
        backendPath: "C:/script-backend.accdb",
        databasePath: undefined,
      }),
      expect.objectContaining({
        action: "seed_fixture",
        backendPath: undefined,
        databasePath: "C:/seed-target.accdb",
      }),
      expect.objectContaining({
        action: "teardown_fixture",
        backendPath: undefined,
        databasePath: "C:/teardown-target.accdb",
      }),
    ]);
  });

  it("builds maintenance requests with the mode declared in MCP_TOOL_ROUTES (single source of truth)", async () => {
    const maintenanceRoutes = Object.entries(MCP_TOOL_ROUTES).filter(
      ([, route]) => route.kind === "query-maintenance",
    );
    expect(maintenanceRoutes.length).toBeGreaterThan(0);

    for (const [name, route] of maintenanceRoutes) {
      if (route.kind !== "query-maintenance") continue;
      const query = new FakeQueryService();
      const tools = createDysflowMcpTools(
        {
          vbaService: new FakeVbaService(),
          queryService: query,
          diagnosticsService: new FakeDiagnosticsService(),
        },
        // writes enabled so write-mode maintenance tools are not gated before building the request
        true,
      );
      const tool = tools.find((entry) => entry.name === name);
      expect(tool, `${name} must be registered`).toBeDefined();
      await tool?.handler({});
      expect(query.requests, `${name} should reach the query service`).toHaveLength(1);
      expect(
        (query.requests[0] as { mode?: string }).mode,
        `${name} request mode must match its route table entry`,
      ).toBe(route.queryMode);
    }
  });

  it("dispatches maintenance query tools to the configured query service", async () => {
    const queryCalls: unknown[] = [];
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(),
        queryService: {
          execute: async (request: unknown) => {
            queryCalls.push(request);
            return successResult({ rows: [{ ok: true }] });
          },
        },
        diagnosticsService: new FakeDiagnosticsService(),
        vbaSyncToolService: {
          execute: async () => successResult({ ok: true }),
        },
      },
      true,
    );

    await expect(tools.find((tool) => tool.name === "list_links")?.handler({})).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(
      tools
        .find((tool) => tool.name === "link_tables")
        ?.handler({ backendPath: "C:/backend.accdb" }),
    ).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ rows: [{ ok: true }] }) }],
    });
    await expect(
      tools
        .find((tool) => tool.name === "compact_repair")
        ?.handler({ databasePath: "C:/db.accdb", dryRun: true }),
    ).resolves.toEqual({
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

  it("supports the basic form tooling workflow through the VBA sync service", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "dysflow-form-slice-"));
    const service = new VbaSyncAdapter({
      cwd: tempRoot,
      executor: async () => {
        throw new Error("executor should not be called for local form tooling");
      },
    });

    const spec = {
      name: "Form_Smoke",
      kind: "Form",
      controls: [{ name: "txtName", type: "TextBox" }],
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

    const generated = await service.execute("generate_form", {
      spec,
      destinationRoot: tempRoot,
      apply: true,
    });
    expect(generated.ok).toBe(true);
    const generatedPath = (generated.ok ? (generated.data as { outputPath?: string }) : undefined)
      ?.outputPath;
    expect(generatedPath).toBeTruthy();
    if (generatedPath) {
      await expect(readFile(generatedPath, "utf8")).resolves.toContain("Form_Smoke");
    }

    await expect(
      service.execute("catalog_add_control", {
        spec,
        destinationRoot: tempRoot,
        controlName: "txtName",
        controlType: "TextBox",
        apply: true,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        formName: "Form_Smoke",
        controlCount: 1,
      },
    });

    await expect(
      service.execute("harvest_form_catalog", { destinationRoot: tempRoot }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        total: 1,
      },
    });
  });
});
