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
    const { buildCleanupRequest, isMcpToolResult } = await import(
      "../../../src/adapters/mcp/alias-tools.js"
    );
    const request = buildCleanupRequest({
      operationId: "op-1",
      accessPath: "C:/repo/front.accdb",
      force: true,
      unknownField: "garbage",
    });
    expect(isMcpToolResult(request)).toBe(false);
    if (!isMcpToolResult(request)) {
      expect(request.operationId).toBe("op-1");
      expect(request.accessPath).toBe("C:/repo/front.accdb");
      expect(request.force).toBe(true);
      expect((request as unknown as Record<string, unknown>).unknownField).toBeUndefined();
    }
  });

  // PR2 (#621 F2 / #6b) — buildCleanupRequest is the parity anchor for the
  // modern dysflow_access_cleanup handler (replacing the previous bare cast).
  // Every optional field that the legacy cleanup_access_operation schema
  // declares MUST project through so both the legacy and modern handlers
  // forward the same field set to the cleanup service.
  it("buildCleanupRequest projects the full optional surface (PR2 #621 F2 / #6b)", async () => {
    const { buildCleanupRequest, isMcpToolResult } = await import(
      "../../../src/adapters/mcp/alias-tools.js"
    );
    const request = buildCleanupRequest({
      operationId: "op-pr2",
      accessPath: "C:/data/app.accdb",
      projectId: "demo",
      contextId: "run-42",
      backendPath: "C:/data/backend.accdb",
      destinationRoot: "C:/data/dest",
      projectRoot: "C:/data/proj",
      timeoutMs: 5000,
      strictContext: true,
      expectedAccessPath: "C:/data/app.accdb",
      expectedProjectRoot: "C:/data/proj",
      expectedDestinationRoot: "C:/data/dest",
    });
    expect(isMcpToolResult(request)).toBe(false);
    if (!isMcpToolResult(request)) {
      expect(request).toEqual({
        operationId: "op-pr2",
        accessPath: "C:/data/app.accdb",
        force: undefined,
        projectId: "demo",
        contextId: "run-42",
        backendPath: "C:/data/backend.accdb",
        destinationRoot: "C:/data/dest",
        projectRoot: "C:/data/proj",
        timeoutMs: 5000,
        strictContext: true,
        expectedAccessPath: "C:/data/app.accdb",
        expectedProjectRoot: "C:/data/proj",
        expectedDestinationRoot: "C:/data/dest",
      });
    }
  });

  it("buildCleanupRequest leaves optional fields undefined when not provided (PR2 #621 F2 / #6b)", async () => {
    const { buildCleanupRequest, isMcpToolResult } = await import(
      "../../../src/adapters/mcp/alias-tools.js"
    );
    const request = buildCleanupRequest({
      operationId: "op-min",
      accessPath: "C:/data/app.accdb",
    });
    expect(isMcpToolResult(request)).toBe(false);
    if (!isMcpToolResult(request)) {
      // Defined field set is exactly the two required ones; force and the rest
      // are explicitly undefined so the modern handler does not forward stale
      // keys to the cleanup service.
      expect(request.operationId).toBe("op-min");
      expect(request.accessPath).toBe("C:/data/app.accdb");
      expect(request.force).toBeUndefined();
      expect(request.strictContext).toBeUndefined();
      expect(request.backendPath).toBeUndefined();
      expect(request.projectRoot).toBeUndefined();
      expect(request.timeoutMs).toBeUndefined();
      expect(request.expectedAccessPath).toBeUndefined();
    }
  });

  it("buildRunVbaRequest ignores extra fields and parses argsJson", async () => {
    const { buildRunVbaRequest, isMcpToolResult } = await import(
      "../../../src/adapters/mcp/alias-tools.js"
    );
    const request = buildRunVbaRequest({
      procedureName: "Test",
      argsJson: "[1, 2, 3]",
      extra: "garbage",
    });
    expect(isMcpToolResult(request)).toBe(false);
    if (!isMcpToolResult(request)) {
      expect(request.procedureName).toBe("Test");
      expect(request.arguments).toEqual([1, 2, 3]);
      expect((request as Record<string, unknown>).extra).toBeUndefined();
    }
  });

  it("buildRunVbaRequest projects dryRun:true through to the typed request (PR1a #621 escape hatch)", async () => {
    const { buildRunVbaRequest, isMcpToolResult } = await import(
      "../../../src/adapters/mcp/alias-tools.js"
    );
    const request = buildRunVbaRequest({
      procedureName: "Test",
      dryRun: true,
    });
    expect(isMcpToolResult(request)).toBe(false);
    if (!isMcpToolResult(request)) {
      expect(request.dryRun).toBe(true);
    }
  });

  it("buildRunVbaRequest leaves dryRun undefined when not provided (PR1a #621)", async () => {
    const { buildRunVbaRequest, isMcpToolResult } = await import(
      "../../../src/adapters/mcp/alias-tools.js"
    );
    const request = buildRunVbaRequest({
      procedureName: "Test",
    });
    expect(isMcpToolResult(request)).toBe(false);
    if (!isMcpToolResult(request)) {
      expect(request.dryRun).toBeUndefined();
    }
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
