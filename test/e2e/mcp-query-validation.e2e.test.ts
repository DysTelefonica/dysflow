/**
 * DELTA-010 (mcp-reliability-fix) — query_sql empty-string rejection E2E.
 *
 * Regression guard for the dispatch-level empty-sql rejection. The typed
 * builder (buildQuerySqlRequest) does the strict check, but the canonical
 * handleMcpQueryExecute path uses `buildQueryReadRequest` which lets an
 * empty `sql` slip through to the runner. Pin the wire-level behavior:
 * a caller passing `sql: ""` to query_sql must receive MCP_INPUT_INVALID,
 * NOT a silent empty-string SELECT (the previous behavior).
 *
 * No Access COM / PowerShell required — the rejection happens at the
 * adapter layer before any runner is touched.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { startWithSdkServer } from "../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";

function makeServices() {
  // queryService MUST NOT be invoked when sql is empty — the dispatcher must
  // short-circuit before any runner is touched.
  return {
    vbaService: { execute: vi.fn(async () => ({ ok: true, data: { returnValue: "ok" } })) },
    queryService: {
      execute: vi.fn(async () => {
        throw new Error("queryService.execute MUST NOT be called for empty sql");
      }),
    },
    diagnosticsService: { run: vi.fn(async () => ({ ok: true, data: { checks: [] } })) },
  };
}

async function createHarness(tools: Parameters<typeof startWithSdkServer>[0]): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport);
  const client = new Client({ name: "e2e-empty-sql", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await serverDone.catch(() => {});
    },
  };
}

describe("DELTA-010 — query_sql empty sql rejection (E2E)", () => {
  it("query_sql with sql:'' returns MCP_INPUT_INVALID and does NOT touch queryService", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, true);

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "query_sql",
        arguments: { sql: "" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string } | undefined)?.text ?? "";
      // Either the schema's minLength guard ("sql must be at least 1
      // non-whitespace character") or the typed builder's empty-sql guard
      // ("query_sql requires sql or query") is acceptable — both are
      // MCP_INPUT_INVALID. The contract is: empty sql MUST be rejected.
      expect(text).toContain("MCP_INPUT_INVALID");
      expect(services.queryService.execute).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("query_sql with sql:'   ' (whitespace) returns MCP_INPUT_INVALID", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, true);

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "query_sql",
        arguments: { sql: "   " },
      });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string } | undefined)?.text ?? "";
      expect(text).toContain("MCP_INPUT_INVALID");
      expect(services.queryService.execute).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("query_sql with {} (no sql, no query) returns MCP_INPUT_INVALID", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, true);

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "query_sql",
        arguments: {},
      });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string } | undefined)?.text ?? "";
      expect(text).toContain("MCP_INPUT_INVALID");
      expect(services.queryService.execute).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("query_sql with valid sql:'SELECT 1' executes the runner (positive control)", async () => {
    const services = {
      vbaService: { execute: vi.fn(async () => ({ ok: true, data: { returnValue: "ok" } })) },
      queryService: {
        execute: vi.fn(async () => ({ ok: true, data: { rows: [] } })),
      },
      diagnosticsService: { run: vi.fn(async () => ({ ok: true, data: { checks: [] } })) },
    };
    const tools = createDysflowMcpTools(services, true);

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "query_sql",
        arguments: { sql: "SELECT 1" },
      });
      expect(result.isError).toBe(false);
      expect(services.queryService.execute).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });
});