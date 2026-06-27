/**
 * DELTA-006 (mcp-reliability-fix) — Typed mappers for alias-tool request builders.
 *
 * The structural `validatedInput as { ... }` casts in alias-tools.ts:81-201 are
 * unsafe: any unknown field passes through. These tests pin the new typed
 * builder contract: extract pure functions that read only declared fields and
 * return the typed domain object (no casts).
 *
 * Builders covered:
 * - buildCleanupRequest (for cleanup_access_operation)
 * - buildRunVbaRequest   (for run_vba)
 * - buildQuerySqlRequest (for query_sql — also DELTA-010: empty sql rejected)
 */

import { describe, expect, it } from "vitest";

describe("DELTA-006 — typed alias-tool request builders (read only declared fields)", () => {
  it("buildCleanupRequest ignores undeclared fields and returns the typed request", async () => {
    const { buildCleanupRequest } = await import("../../../src/adapters/mcp/alias-tools.js");
    const request = buildCleanupRequest({
      operationId: "op-1",
      accessPath: "C:/repo/front.accdb",
      force: true,
      unknownField: "garbage",
    });
    expect(request.operationId).toBe("op-1");
    expect(request.accessPath).toBe("C:/repo/front.accdb");
    expect(request.force).toBe(true);
    expect((request as Record<string, unknown>).unknownField).toBeUndefined();
  });

  it("buildRunVbaRequest ignores extra fields and parses argsJson", async () => {
    const { buildRunVbaRequest } = await import("../../../src/adapters/mcp/alias-tools.js");
    const request = buildRunVbaRequest({
      procedureName: "Test",
      argsJson: "[1, 2, 3]",
      extra: "garbage",
    });
    expect(request.procedureName).toBe("Test");
    expect(request.arguments).toEqual([1, 2, 3]);
    expect((request as Record<string, unknown>).extra).toBeUndefined();
  });

  it("buildRunVbaRequest returns McpToolResult for invalid argsJson (not throws)", async () => {
    const { buildRunVbaRequest, isMcpToolResult } = await import(
      "../../../src/adapters/mcp/alias-tools.js"
    );
    const request = buildRunVbaRequest({
      procedureName: "Test",
      argsJson: "{not-json}",
    });
    expect(isMcpToolResult(request)).toBe(true);
    if (isMcpToolResult(request)) {
      expect(request.content[0]?.text).toContain("MCP_INPUT_INVALID");
    }
  });

  it("buildQuerySqlRequest ignores unknownField and resolves sql from sql or query alias", async () => {
    const { buildQuerySqlRequest, isMcpToolResult } = await import(
      "../../../src/adapters/mcp/alias-tools.js"
    );
    const fromSql = buildQuerySqlRequest({
      projectId: "demo",
      sql: "SELECT 1",
      unknownField: "x",
    });
    expect(isMcpToolResult(fromSql)).toBe(false);
    if (!isMcpToolResult(fromSql)) {
      expect(fromSql.sql).toBe("SELECT 1");
      expect((fromSql as Record<string, unknown>).unknownField).toBeUndefined();
    }

    const fromQuery = buildQuerySqlRequest({
      projectId: "demo",
      query: "SELECT 2",
    });
    if (!isMcpToolResult(fromQuery)) {
      expect(fromQuery.sql).toBe("SELECT 2");
    }
  });

  // DELTA-010 (mcp-reliability-fix) — query_sql rejects empty sql/query.
  it("buildQuerySqlRequest rejects empty sql and empty query (DELTA-010)", async () => {
    const { buildQuerySqlRequest, isMcpToolResult } = await import(
      "../../../src/adapters/mcp/alias-tools.js"
    );

    const noSql = buildQuerySqlRequest({ projectId: "demo" });
    expect(isMcpToolResult(noSql)).toBe(true);
    if (isMcpToolResult(noSql)) {
      expect(noSql.content[0]?.text).toContain("MCP_INPUT_INVALID");
      expect(noSql.content[0]?.text).toMatch(/query_sql requires sql or query/);
    }

    const emptySql = buildQuerySqlRequest({ projectId: "demo", sql: "" });
    expect(isMcpToolResult(emptySql)).toBe(true);
    if (isMcpToolResult(emptySql)) {
      expect(emptySql.content[0]?.text).toContain("MCP_INPUT_INVALID");
    }

    const whitespaceSql = buildQuerySqlRequest({ projectId: "demo", sql: "   " });
    expect(isMcpToolResult(whitespaceSql)).toBe(true);
    if (isMcpToolResult(whitespaceSql)) {
      expect(whitespaceSql.content[0]?.text).toContain("MCP_INPUT_INVALID");
    }

    const validSql = buildQuerySqlRequest({ projectId: "demo", sql: "SELECT 1" });
    expect(isMcpToolResult(validSql)).toBe(false);
    if (!isMcpToolResult(validSql)) {
      expect(validSql.sql).toBe("SELECT 1");
    }
  });
});