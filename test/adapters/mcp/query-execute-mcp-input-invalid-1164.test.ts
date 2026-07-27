/**
 * Issue #1164 — `query_execute` MUST return a structured `MCP_INPUT_INVALID`
 * envelope when the caller omits the required `mode` field, instead of the
 * opaque `[object Object]` flattening that the OpenCode Code Mode wrapper
 * produces today.
 *
 * Acceptance contract — the response envelope MUST expose:
 *   - `error.code === "MCP_INPUT_INVALID"`
 *   - `error.rejectedFlag === "mode"` (or `error.rejectedFlags: ["mode"]`)
 *   - `error.message` mentions `mode`
 *   - `error.remediation` instructs the caller to pass `mode: "read"` or
 *     `mode: "write"`
 *
 * The legacy `content[0].text` body keeps the `"MCP_INPUT_INVALID: …"` prefix
 * so regex-based consumers keep working.
 *
 * Three paths per slice (web-tdd-philosophy hard rule 5):
 *   - Happy path — `mode: "read"` returns the query service result.
 *   - Sad path — missing `mode` returns the structured envelope.
 *   - Edge path — `mode: "write"` + `apply: true` (writes enabled) commits;
 *     `dryRun: true` plans; missing `mode` with any value of `apply` /
 *     `dryRun` short-circuits to the structured rejection.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createDysflowMcpTools,
  type DysflowMcpServices,
} from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

function buildQueryExecuteServices(): {
  services: DysflowMcpServices;
  queryExecute: ReturnType<typeof vi.fn>;
} {
  const queryExecute = vi.fn(
    async () =>
      successResult({
        rows: [{ "1": 1 }],
      }),
  );
  return {
    queryExecute,
    services: {
      vbaService: { execute: vi.fn() },
      queryService: { execute: queryExecute },
      diagnosticsService: { run: vi.fn() },
    } as unknown as DysflowMcpServices,
  };
}

describe("query_execute (issue #1164) — missing mode returns structured MCP_INPUT_INVALID", () => {
  it("missing mode returns error.code === 'MCP_INPUT_INVALID' (sad path)", async () => {
    const { services, queryExecute } = buildQueryExecuteServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const tool = tools.find((t) => t.name === "query_execute");
    expect(tool, "query_execute must be registered").toBeDefined();

    const result = await tool?.handler({ sql: "SELECT 1", apply: true });

    expect(result).toBeDefined();
    expect(result?.isError).toBe(true);
    expect(result?.ok).toBe(false);
    expect(result?.error?.code).toBe("MCP_INPUT_INVALID");
    expect(queryExecute).not.toHaveBeenCalled();
  });

  it("missing mode surfaces error.rejectedFlag === 'mode' (or rejectedFlags: ['mode'])", async () => {
    const { services, queryExecute } = buildQueryExecuteServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const tool = tools.find((t) => t.name === "query_execute");

    const result = await tool?.handler({ sql: "SELECT 1", apply: true });

    const rejected = result?.error?.rejectedFlag ?? result?.error?.rejectedFlags?.[0];
    expect(rejected).toBe("mode");
    expect(queryExecute).not.toHaveBeenCalled();
  });

  it("missing mode error.message mentions the literal 'mode' substring", async () => {
    const { services } = buildQueryExecuteServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const tool = tools.find((t) => t.name === "query_execute");

    const result = await tool?.handler({ sql: "SELECT 1" });

    expect(result?.error?.message).toBeDefined();
    expect(result?.error?.message?.toLowerCase()).toContain("mode");
  });

  it("missing mode error.remediation tells the caller to pass mode: 'read' or mode: 'write'", async () => {
    const { services } = buildQueryExecuteServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const tool = tools.find((t) => t.name === "query_execute");

    const result = await tool?.handler({ sql: "SELECT 1" });

    const remediation = result?.error?.remediation ?? "";
    expect(remediation).toContain("read");
    expect(remediation).toContain("write");
  });

  it("missing mode preserves the legacy 'MCP_INPUT_INVALID:' text-prefix (regex consumers)", async () => {
    const { services } = buildQueryExecuteServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const tool = tools.find((t) => t.name === "query_execute");

    const result = await tool?.handler({ sql: "SELECT 1" });

    expect(result?.content[0]?.text.startsWith("MCP_INPUT_INVALID:")).toBe(true);
  });

  it("missing mode short-circuits even when dryRun: true is supplied (apply/dryRun are orthogonal)", async () => {
    const { services, queryExecute } = buildQueryExecuteServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const tool = tools.find((t) => t.name === "query_execute");

    const result = await tool?.handler({ sql: "SELECT 1", dryRun: true });

    expect(result?.isError).toBe(true);
    expect(result?.error?.code).toBe("MCP_INPUT_INVALID");
    expect(result?.error?.rejectedFlag).toBe("mode");
    expect(queryExecute).not.toHaveBeenCalled();
  });

  it("happy path — mode: 'read' reaches the query service (no MCP_INPUT_INVALID)", async () => {
    const { services, queryExecute } = buildQueryExecuteServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const tool = tools.find((t) => t.name === "query_execute");

    const result = await tool?.handler({ sql: "SELECT 1", mode: "read" });

    expect(result?.isError).toBeFalsy();
    expect(result?.error?.code).not.toBe("MCP_INPUT_INVALID");
    expect(queryExecute).toHaveBeenCalledTimes(1);
  });

  it("happy path — mode: 'write' + apply: true reaches the query service (writes enabled)", async () => {
    const { services, queryExecute } = buildQueryExecuteServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const tool = tools.find((t) => t.name === "query_execute");

    const result = await tool?.handler({
      sql: "UPDATE T SET A = 1",
      mode: "write",
      apply: true,
    });

    expect(result?.isError).toBeFalsy();
    expect(result?.error?.code).not.toBe("MCP_INPUT_INVALID");
    expect(queryExecute).toHaveBeenCalledTimes(1);
  });

  it("happy path — mode: 'write' + dryRun: true plans (apply/dryRun contract preserved)", async () => {
    const { services, queryExecute } = buildQueryExecuteServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const tool = tools.find((t) => t.name === "query_execute");

    const result = await tool?.handler({
      sql: "UPDATE T SET A = 1",
      mode: "write",
      dryRun: true,
    });

    expect(result?.isError).toBeFalsy();
    expect(result?.error?.code).not.toBe("MCP_INPUT_INVALID");
    expect(queryExecute).toHaveBeenCalledTimes(1);
  });
});
