import { describe, expect, it } from "vitest";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry";
import { createDysflowMcpTools, MODERN_TOOL_NAMES } from "../../../src/adapters/mcp/tools";
import type { AccessQueryRequest } from "../../../src/core/contracts/index";
import { type OperationResult, successResult } from "../../../src/core/contracts/index";
import type { AccessCleanupResult } from "../../../src/core/operations/access-operation-cleanup";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";
import type { AccessDiagnosticsResult } from "../../../src/core/services/diagnostics-service";
import type { AccessQueryResult } from "../../../src/core/services/query-service";
import type { AccessVbaResult } from "../../../src/core/services/vba-service";

const OUTPUT_CONTRACT_GROUPS = {
  modernCoreService: [
    "dysflow_vba_execute",
    "dysflow_query_execute",
    "dysflow_doctor",
    "dysflow_access_operations_list",
    "dysflow_access_cleanup",
    "dysflow_access_force_cleanup_orphaned",
  ],
  modernServiceAliases: ["run_vba"],
  vbaManagerDysflowResult: [
    "export_modules",
    "export_all",
    "import_modules",
    "import_all",
    "list_objects",
    "exists",
    "test_vba",
    "compile_vba",
    "verify_code",
    "verify_binary",
    "reconcile_binary",
    "delete_module",
    "generate_erd",
    "fix_encoding",
    "validate_form_spec",
    "generate_form",
    "catalog_add_control",
    "harvest_form_catalog",
  ],
  accessRunnerQuery: [
    "query_sql",
    "list_tables",
    "list_linked_tables",
    "get_schema",
    "count_rows",
    "distinct_values",
    "compare_backends",
    "list_access_files",
    "get_relationships",
    "list_links",
    "export_queries",
    "exec_sql",
    "run_script",
    "create_table",
    "drop_table",
    "seed_fixture",
    "teardown_fixture",
    "link_tables",
    "relink_tables",
    "localize_backend_links",
    "unlink_table",
    "import_queries",
    "compact_repair",
    "relink_directory",
  ],
  operationCleanupAliases: ["list_access_operations", "cleanup_access_operation"],
} as const satisfies Record<string, readonly string[]>;

class FakeVbaService {
  constructor(private readonly result: OperationResult<AccessVbaResult>) {}
  async execute(): Promise<OperationResult<AccessVbaResult>> {
    return this.result;
  }
}

class FakeQueryService {
  constructor(private readonly result: OperationResult<AccessQueryResult>) {}
  async execute(_request: AccessQueryRequest): Promise<OperationResult<AccessQueryResult>> {
    return this.result;
  }
}

class FakeDiagnosticsService {
  constructor(private readonly result: OperationResult<AccessDiagnosticsResult>) {}
  async run(): Promise<OperationResult<AccessDiagnosticsResult>> {
    return this.result;
  }
}

class FakeCleanupService {
  public requests: unknown[] = [];
  async cleanup(request: unknown): Promise<OperationResult<AccessCleanupResult>> {
    this.requests.push(request);
    return successResult({
      operationId: "op-cleanup-contract",
      accessPid: null,
      status: "cleaned",
    });
  }
}

function makeServices(cleanupService = new FakeCleanupService()) {
  return {
    vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
    queryService: new FakeQueryService(successResult({ rows: [] })),
    diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    cleanupService,
    operationRegistry: new InMemoryAccessOperationRegistry(),
  };
}

function sorted(values: readonly string[]) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

describe("MCP tool output contract inventory", () => {
  it("classifies every registered MCP tool name into exactly one output contract group", () => {
    const registeredToolNames = createDysflowMcpTools(makeServices()).map((tool) => tool.name);
    const expectedRegisteredNames = [...MODERN_TOOL_NAMES, ...DYSFLOW_MCP_TOOL_NAMES];
    const groupedToolNames = Object.values(OUTPUT_CONTRACT_GROUPS).flat();

    expect(sorted(registeredToolNames)).toEqual(sorted(expectedRegisteredNames));
    expect(sorted(groupedToolNames)).toEqual(sorted(registeredToolNames));
    expect(new Set(groupedToolNames).size).toBe(groupedToolNames.length);
    expect(new Set(registeredToolNames).size).toBe(registeredToolNames.length);
  });

  it("keeps canonical modern service tools outside the generated DYSFLOW_RESULT and runner registries", () => {
    expect(OUTPUT_CONTRACT_GROUPS.modernCoreService).toEqual(MODERN_TOOL_NAMES);
    expect(
      OUTPUT_CONTRACT_GROUPS.modernCoreService.filter((name) =>
        (DYSFLOW_MCP_TOOL_NAMES as readonly string[]).includes(name),
      ),
    ).toEqual([]);
  });

  it("documents that run_vba is a modern service alias, not a VBA manager DYSFLOW_RESULT tool", () => {
    expect(OUTPUT_CONTRACT_GROUPS.modernServiceAliases).toEqual(["run_vba"]);
    expect(OUTPUT_CONTRACT_GROUPS.vbaManagerDysflowResult).not.toContain("run_vba");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("run_vba");
  });

  it("translates cleanup service output for modern and alias cleanup tools through the same MCP contract", async () => {
    const cleanupService = new FakeCleanupService();
    const tools = createDysflowMcpTools(makeServices(cleanupService));
    const cleanupInput = {
      operationId: "op-cleanup-contract",
      accessPath: "C:/data/app.accdb",
      force: true,
    };

    for (const toolName of ["dysflow_access_cleanup", "cleanup_access_operation"] as const) {
      const tool = tools.find((candidate) => candidate.name === toolName);
      expect(tool, `${toolName} should be registered`).toBeDefined();
      if (tool === undefined) throw new Error(`${toolName} was not registered`);

      await expect(tool.handler(cleanupInput)).resolves.toMatchObject({ isError: false });
    }

    expect(cleanupService.requests).toEqual([cleanupInput, cleanupInput]);
  });
});
