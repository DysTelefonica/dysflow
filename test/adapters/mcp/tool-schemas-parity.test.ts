import { describe, expect, it } from "vitest";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry";
import {
  CLEANUP_SCHEMA,
  HTTP_QUERY_SCHEMA,
  HTTP_VBA_EXECUTE_SCHEMA,
  HTTP_WRITE_QUERY_SCHEMA,
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
    expect(HTTP_WRITE_QUERY_SCHEMA.properties.dryRun).toEqual({
      type: "boolean",
      description: "Run without applying writes.",
    });
    expect(HTTP_WRITE_QUERY_SCHEMA.properties.apply).toEqual({
      type: "boolean",
      description: "Apply a write instead of dry run.",
    });
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
});
