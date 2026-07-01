import { describe, expect, it } from "vitest";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry";
import {
  CLEANUP_SCHEMA,
  HTTP_QUERY_SCHEMA,
  HTTP_VBA_EXECUTE_SCHEMA,
  HTTP_WRITE_QUERY_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
  VBA_EXECUTE_SCHEMA,
} from "../../../src/adapters/mcp/schemas";
import { MCP_TOOL_SCHEMAS } from "../../../src/adapters/mcp/tools";

describe("MCP_TOOL_SCHEMAS parity (#200)", () => {
  it("every name in DYSFLOW_MCP_TOOL_NAMES has an entry in MCP_TOOL_SCHEMAS", () => {
    const missingEntries = DYSFLOW_MCP_TOOL_NAMES.filter(
      (name) => MCP_TOOL_SCHEMAS[name] === undefined,
    );
    expect(missingEntries).toEqual([]);
  });

  it("run_vba, query_sql, and cleanup_access_operation have entries in MCP_TOOL_SCHEMAS", () => {
    expect(MCP_TOOL_SCHEMAS.run_vba).toBeDefined();
    expect(MCP_TOOL_SCHEMAS.query_sql).toBeDefined();
    expect(MCP_TOOL_SCHEMAS.cleanup_access_operation).toBeDefined();
  });

  it("cleanup_access_operation requires the same accessPath proof as the modern cleanup tool", () => {
    expect(MCP_TOOL_SCHEMAS.cleanup_access_operation?.required).toEqual([
      "operationId",
      "accessPath",
    ]);
    expect(CLEANUP_SCHEMA.required).toEqual(["operationId", "accessPath"]);
  });
});

describe("HTTP validation schemas", () => {
  it("CLEANUP_SCHEMA has minLength: 1 for operationId", () => {
    expect(CLEANUP_SCHEMA.properties.operationId).toBeDefined();
    expect(CLEANUP_SCHEMA.properties.operationId?.minLength).toBe(1);
  });

  it("HTTP_QUERY_SCHEMA validates sql input with no additional properties", () => {
    expect(HTTP_QUERY_SCHEMA).toBeDefined();
    expect(HTTP_QUERY_SCHEMA.type).toBe("object");
    expect(HTTP_QUERY_SCHEMA.required).toEqual(["sql"]);
    expect(HTTP_QUERY_SCHEMA.additionalProperties).toBe(false);
    expect(HTTP_QUERY_SCHEMA.properties.sql).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 100000,
    });
  });

  it("HTTP_WRITE_QUERY_SCHEMA validates sql input and dryRun/apply parameters", () => {
    expect(HTTP_WRITE_QUERY_SCHEMA).toBeDefined();
    expect(HTTP_WRITE_QUERY_SCHEMA.type).toBe("object");
    expect(HTTP_WRITE_QUERY_SCHEMA.required).toEqual(["sql"]);
    expect(HTTP_WRITE_QUERY_SCHEMA.additionalProperties).toBe(false);
    expect(HTTP_WRITE_QUERY_SCHEMA.properties.sql).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 100000,
    });
    const dryRun = HTTP_WRITE_QUERY_SCHEMA.properties?.dryRun as {
      type: string;
      description: string;
    };
    const apply = HTTP_WRITE_QUERY_SCHEMA.properties?.apply as {
      type: string;
      description: string;
    };
    expect(dryRun.type).toBe("boolean");
    expect(dryRun.description).toMatch(/default/i);
    expect(apply.type).toBe("boolean");
    expect(apply.description).toMatch(/precedence|default/i);
  });

  it("HTTP_VBA_EXECUTE_SCHEMA validates moduleName, procedureName, and optional arguments array", () => {
    expect(HTTP_VBA_EXECUTE_SCHEMA).toBeDefined();
    expect(HTTP_VBA_EXECUTE_SCHEMA.type).toBe("object");
    expect(HTTP_VBA_EXECUTE_SCHEMA.required).toEqual(["moduleName", "procedureName"]);
    expect(HTTP_VBA_EXECUTE_SCHEMA.additionalProperties).toBe(false);
    expect(HTTP_VBA_EXECUTE_SCHEMA.properties.moduleName).toEqual({
      type: "string",
      minLength: 1,
    });
    expect(HTTP_VBA_EXECUTE_SCHEMA.properties.procedureName).toEqual({
      type: "string",
      minLength: 1,
    });
    expect(HTTP_VBA_EXECUTE_SCHEMA.properties.arguments).toEqual({
      type: "array",
      items: {},
    });
  });

  it("MCP VBA_EXECUTE_SCHEMA declares dryRun as an optional boolean (PR1a #621 escape hatch)", () => {
    const dryRun = VBA_EXECUTE_SCHEMA.properties?.dryRun as { type: string };
    expect(dryRun).toBeDefined();
    expect(dryRun.type).toBe("boolean");
    expect(VBA_EXECUTE_SCHEMA.required).not.toContain("dryRun");
  });

  it("MCP run_vba schema declares dryRun as an optional boolean (PR1a #621 escape hatch)", () => {
    const dryRun = MCP_TOOL_SCHEMAS.run_vba?.properties?.dryRun as { type: string };
    expect(dryRun).toBeDefined();
    expect(dryRun.type).toBe("boolean");
    expect(MCP_TOOL_SCHEMAS.run_vba?.required).not.toContain("dryRun");
  });

  // PR2 (#621 F1 / #6a) — dysflow_query_execute write mode must surface
  // allowTables/denyTables in its schema so the modern handler (which spreads
  // the validated input) can pass them through to AccessQueryService. The
  // legacy `exec_sql` already accepts these; this closes the alias drift.
  it("MCP QUERY_EXECUTE_SCHEMA advertises allowTables as an optional string array (PR2 #621 F1 / #6a)", () => {
    const allowTables = QUERY_EXECUTE_SCHEMA.properties?.allowTables as {
      type: string;
      items: { type: string };
    };
    expect(allowTables).toBeDefined();
    expect(allowTables.type).toBe("array");
    expect(allowTables.items.type).toBe("string");
    expect(QUERY_EXECUTE_SCHEMA.required).not.toContain("allowTables");
  });

  it("MCP QUERY_EXECUTE_SCHEMA advertises denyTables as an optional string array (PR2 #621 F1 / #6a)", () => {
    const denyTables = QUERY_EXECUTE_SCHEMA.properties?.denyTables as {
      type: string;
      items: { type: string };
    };
    expect(denyTables).toBeDefined();
    expect(denyTables.type).toBe("array");
    expect(denyTables.items.type).toBe("string");
    expect(QUERY_EXECUTE_SCHEMA.required).not.toContain("denyTables");
  });

  // PR2 (#621 F2 / #6b) — modern dysflow_access_cleanup must accept the
  // same optional surface (projectId/contextId/backendPath/.../strictContext/
  // expectedAccessPath/.../timeoutMs) that the legacy cleanup_access_operation
  // schema already declares, so buildCleanupRequest can project every field
  // without the modern validator dropping them upstream. The legacy schema is
  // the source of truth for the parity surface.
  it("CLEANUP_SCHEMA accepts the legacy cleanup_access_operation surface (PR2 #621 F2 / #6b)", () => {
    const legacy = MCP_TOOL_SCHEMAS.cleanup_access_operation;
    expect(legacy).toBeDefined();
    if (legacy === undefined) return; // narrows `legacy` for the rest of the block

    // Every property that the legacy schema declares (except the required
    // operationId/accessPath and `force`) MUST also be present on the modern
    // CLEANUP_SCHEMA. This pins the parity surface that buildCleanupRequest
    // projects.
    const requiredLegacyKeys = ["operationId", "accessPath", "force"] as const;
    const legacyOptionalKeys = Object.keys(legacy.properties ?? {}).filter(
      (key) => !requiredLegacyKeys.includes(key as (typeof requiredLegacyKeys)[number]),
    );
    for (const key of legacyOptionalKeys) {
      expect(
        CLEANUP_SCHEMA.properties?.[key],
        `CLEANUP_SCHEMA must declare legacy field '${key}' for parity with buildCleanupRequest`,
      ).toBeDefined();
    }
  });

  it("CLEANUP_SCHEMA declares strictContext so buildCleanupRequest can preserve it (PR2 #621 F2 / #6b)", () => {
    expect(CLEANUP_SCHEMA.properties?.strictContext).toBeDefined();
    const strictContext = CLEANUP_SCHEMA.properties?.strictContext as { type: string };
    expect(strictContext.type).toBe("boolean");
    expect(CLEANUP_SCHEMA.required).not.toContain("strictContext");
  });
});
