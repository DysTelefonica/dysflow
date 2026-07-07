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
    // PR-1 (#656) — `get_capabilities` is a read-only modern service
    // tool. It aggregates capability metadata; it never touches Access.
    "query_execute",
    "doctor",
    // #777 (Opción A cont.) — `list_access_operations` and
    // `cleanup_access_operation` were REMOVED from this group; they
    // are pre-existing aliases (lives in `modernServiceAliases` below)
    // registered in `alias-tools.ts`.
    "access_force_cleanup_orphaned",
    // #777 (Opción A cont.) — `dysflow_vba_execute` was REMOVED
    // completely. The canonical `run_vba` is a pre-existing alias in
    // `alias-tools.ts` (lives in `modernServiceAliases` below); it is no
    // longer a modern tool name in this group.
    "get_capabilities",
    // #701 — read-only modern service tools that parse VBA source text without
    // PowerShell runner DYSFLOW_RESULT output.
    "list_procedures",
    "get_procedure",
    "find_references",
    // #705 — read-only dead-code analysis over the supplied modules map.
    "detect_dead_code",
    // #703 — read-only VBA test manifest validation.
    "validate_manifest",
    // #704 — read-only VBA module pre-import linting.
    "lint_module",
    // #760 — read-only project-config resolution without Access.
    "resolve_project",
  ],
  modernServiceAliases: ["run_vba", "list_access_operations", "cleanup_access_operation"],
  vbaManagerDysflowResult: [
    "export_modules",
    "export_all",
    "import_modules",
    "import_all",
    "list_objects",
    "exists",
    "test_vba",
    // feat-759-no-compile (v1.19.0) — compile_vba was removed.
    "verify_code",
    "delete_module",
    "generate_erd",
    "fix_encoding",
    "validate_form_spec",
    "generate_form",
    "catalog_add_control",
    "harvest_form_catalog",
    "inspect_form",
    "compare_form",
    "lint_form_code",
    "form_add_control",
    "form_move_control",
    "form_rename_control",
    "form_serialize",
    "form_deserialize",
    "create_form_from_template",
    "vba_orphan_audit",
    "vba_inline_execution",
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
  // #777 (Opción A cont.) — `list_access_operations` and
  // `cleanup_access_operation` were REMOVED from the
  // `operationCleanupAliases` group; they now live exclusively
  // in `modernServiceAliases` along with `run_vba`. Each tool is
  // in exactly one group (the test below asserts that invariant).
  operationCleanupAliases: [],
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

  it("documents that the canonical VBA service aliases are not VBA manager DYSFLOW_RESULT tools", () => {
    // #777 (Opción A cont.) — three canonical names live in the
    // `alias-tools.ts` alias group: `run_vba`, `list_access_operations`,
    // and `cleanup_access_operation`. They are NOT in MODERN_TOOL_NAMES
    // (which only lists bespoke registrations) and NOT in the VBA
    // manager DYSFLOW_RESULT group (which lists vbaSync dispatch tools).
    expect(OUTPUT_CONTRACT_GROUPS.modernServiceAliases).toEqual(
      expect.arrayContaining(["run_vba", "list_access_operations", "cleanup_access_operation"]),
    );
    expect(OUTPUT_CONTRACT_GROUPS.modernServiceAliases).toHaveLength(3);
    expect(OUTPUT_CONTRACT_GROUPS.vbaManagerDysflowResult).not.toContain("run_vba");
    expect(OUTPUT_CONTRACT_GROUPS.vbaManagerDysflowResult).not.toContain("list_access_operations");
    expect(OUTPUT_CONTRACT_GROUPS.vbaManagerDysflowResult).not.toContain(
      "cleanup_access_operation",
    );
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("run_vba");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("list_access_operations");
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("cleanup_access_operation");
  });

  it("translates cleanup service output for modern and alias cleanup tools through the same MCP contract", async () => {
    const cleanupService = new FakeCleanupService();
    // force:true cleanup is gated behind the MCP write-gate (#509); enable writes so this
    // contract test exercises the translation path rather than the write-disabled refusal.
    const tools = createDysflowMcpTools(makeServices(cleanupService), true);
    const cleanupInput = {
      operationId: "op-cleanup-contract",
      accessPath: "C:/data/app.accdb",
      force: true,
    };

    for (const toolName of ["cleanup_access_operation", "cleanup_access_operation"] as const) {
      const tool = tools.find((candidate) => candidate.name === toolName);
      expect(tool, `${toolName} should be registered`).toBeDefined();
      if (tool === undefined) throw new Error(`${toolName} was not registered`);

      await expect(tool.handler(cleanupInput)).resolves.toMatchObject({ isError: false });
    }

    expect(cleanupService.requests).toEqual([cleanupInput, cleanupInput]);
  });
});
