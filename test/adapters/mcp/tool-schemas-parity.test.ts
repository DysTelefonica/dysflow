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

  it("MCP VBA_EXECUTE_SCHEMA exposes canonical apply intent and rejects legacy dryRun", () => {
    expect(VBA_EXECUTE_SCHEMA.properties).not.toHaveProperty("dryRun");
    expect(VBA_EXECUTE_SCHEMA.properties?.apply).toMatchObject({ type: "boolean" });
    expect(VBA_EXECUTE_SCHEMA.required).not.toContain("apply");
  });

  it("MCP run_vba schema exposes canonical apply intent and rejects legacy dryRun", () => {
    expect(MCP_TOOL_SCHEMAS.run_vba?.properties).not.toHaveProperty("dryRun");
    expect(MCP_TOOL_SCHEMAS.run_vba?.properties?.apply).toMatchObject({ type: "boolean" });
    expect(MCP_TOOL_SCHEMAS.run_vba?.required).not.toContain("apply");
  });

  it("MCP QUERY_EXECUTE_SCHEMA does not advertise unenforceable arbitrary-SQL table policies (#1452)", () => {
    expect(QUERY_EXECUTE_SCHEMA.properties).not.toHaveProperty("allowTables");
    expect(QUERY_EXECUTE_SCHEMA.properties).not.toHaveProperty("denyTables");
  });

  // PR2 (#621 F2 / #6b) — modern cleanup_access_operation must accept the
  // same optional surface (projectId/contextId/backendPath/.../strictContext/
  // expectedAccessPath/.../timeoutMs) that the legacy cleanup_access_operation
  // schema already declares, so buildCleanupRequest can project every field
  // without the modern validator dropping them upstream. The legacy schema is
  // the source of truth for the parity surface.
  it("CLEANUP_SCHEMA accepts the legacy cleanup_access_operation surface (PR2 #621 F2 / #6b)", () => {
    const legacy = MCP_TOOL_SCHEMAS.cleanup_access_operation;
    expect(legacy).toBeDefined();
    if (legacy === undefined) return; // narrows `legacy` for the rest of the block

    // Protocol-only confirmation metadata stays on the MCP schema and is not
    // projected into the HTTP cleanup request.
    const requiredLegacyKeys = [
      "operationId",
      "accessPath",
      "force",
      "implements_check",
      "confirmedRequiresConfirmation",
    ] as const;
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
