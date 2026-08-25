import { describe, expect, it } from "vitest";
import { isAdvertisedUnderSurface } from "../../../src/adapters/mcp/agent-workflow-registry.js";
import { MCP_TOOL_CONTRACTS } from "../../../src/adapters/mcp/mcp-tool-contracts.js";
import {
  createDysflowMcpTools,
  type DysflowMcpServices,
  type DysflowMcpTool,
} from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

const READ_ONLY_INSPECTION_TOOLS = [
  "get_schema",
  "list_tables",
  "list_links",
  "list_linked_tables",
  "get_relationships",
  "query_sql",
  "count_rows",
  "distinct_values",
  "analyze_form_layout",
  "analyze_form_ui",
  "render_form_preview",
  "map_form_behavior",
  "verify_form_ui",
  "verify_form_bindings",
  "diff_form_preview",
  "inspect_form",
  "form_list_controls",
  "form_get_geometry",
  "form_serialize",
  "copy_form_ui_pattern",
  "generate_form_design_plan",
  "harvest_form_catalog",
  "lint_form_code",
  "validate_form_spec",
  "compare_backends",
  "compare_form",
  "export_queries",
  "list_access_files",
] as const;

const PROMOTED_TOOLS = [...READ_ONLY_INSPECTION_TOOLS, "query_execute"] as const;
const BINARY_READERS = [
  "get_schema",
  "list_tables",
  "list_links",
  "list_linked_tables",
  "get_relationships",
  "query_sql",
  "count_rows",
  "distinct_values",
  "compare_backends",
  "export_queries",
  "list_access_files",
] as const;
const SOURCE_READERS = READ_ONLY_INSPECTION_TOOLS.filter(
  (name) => !BINARY_READERS.includes(name as (typeof BINARY_READERS)[number]),
);
const HIDDEN_WRITE_SIBLINGS = [
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
  "generate_form",
  "catalog_add_control",
  "form_add_control",
  "form_move_control",
  "form_rename_control",
  "form_deserialize",
  "create_form_from_template",
  "apply_form_design_plan",
  "form_set_property",
  "form_delete_control",
  "form_set_properties",
  "form_duplicate_control",
  "form_align_controls",
  "form_distribute_controls",
] as const;

function makeHarness() {
  const queryCalls: Record<string, unknown>[] = [];
  const services: DysflowMcpServices = {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: {
      execute: async (request) => {
        queryCalls.push(request as unknown as Record<string, unknown>);
        return successResult({ rows: [{ id: 1 }] });
      },
    },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
  return { queryCalls, tools: createDysflowMcpTools({ services }) };
}

function tool(name: string, tools: DysflowMcpTool[]): DysflowMcpTool {
  const found = tools.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`${name} tool not found`);
  return found;
}

describe("external inspection core surface (#1544)", () => {
  it("promotes exactly the 28 read-only inspection tools plus query_execute", () => {
    expect(PROMOTED_TOOLS).toHaveLength(29);
    for (const name of READ_ONLY_INSPECTION_TOOLS) {
      expect(MCP_TOOL_CONTRACTS[name].access, name).toBe("read-only");
      expect(isAdvertisedUnderSurface(name, "core"), name).toBe(true);
    }
    expect(MCP_TOOL_CONTRACTS.query_execute.access).toBe("read-write");
    expect(isAdvertisedUnderSurface("query_execute", "core")).toBe(true);
  });

  it("does not widen the core surface to write-capable SQL or form siblings", () => {
    for (const name of HIDDEN_WRITE_SIBLINGS) {
      expect(MCP_TOOL_CONTRACTS[name].access, name).not.toBe("read-only");
      expect(isAdvertisedUnderSurface(name, "core"), name).toBe(false);
    }
  });

  it("advertises the external-path opt-in only on binary readers", () => {
    const { tools } = makeHarness();
    for (const name of BINARY_READERS) {
      expect(tool(name, tools).inputSchema?.properties ?? {}, name).toHaveProperty(
        "allowExternalAccessPath",
      );
    }
    for (const name of SOURCE_READERS) {
      expect(tool(name, tools).inputSchema?.properties ?? {}, name).not.toHaveProperty(
        "allowExternalAccessPath",
      );
    }
  });

  it("accepts an external accessPath for query_execute only in read mode", async () => {
    const readHarness = makeHarness();
    const readResult = await tool("query_execute", readHarness.tools).handler({
      mode: "read",
      sql: "SELECT 1 AS id",
      accessPath: "C:/archives/legacy.accdb",
      allowExternalAccessPath: true,
    });

    expect(readResult.isError).toBe(false);
    expect(readHarness.queryCalls).toEqual([
      expect.objectContaining({
        mode: "read",
        accessPath: "C:/archives/legacy.accdb",
        allowExternalAccessPath: true,
      }),
    ]);

    const writeHarness = makeHarness();
    const writeResult = await tool("query_execute", writeHarness.tools).handler({
      mode: "write",
      sql: "UPDATE T SET value = 1",
      apply: false,
      accessPath: "C:/archives/legacy.accdb",
      allowExternalAccessPath: true,
    });

    expect(writeResult.isError).toBe(true);
    expect(writeResult.content[0]?.text).toMatch(/allowExternalAccessPath.*mode.*read/i);
    expect(writeHarness.queryCalls).toEqual([]);
  });

  it("keeps ordinary query_execute write plans available without the opt-in", async () => {
    const harness = makeHarness();
    const result = await tool("query_execute", harness.tools).handler({
      mode: "write",
      sql: "UPDATE T SET value = 1",
      apply: false,
    });

    expect(result.isError).toBe(false);
    expect(harness.queryCalls).toHaveLength(1);
  });
});
