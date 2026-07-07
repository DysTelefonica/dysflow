/**
 * DELTA-005 (mcp-reliability-fix) — listOrphans returns failureResult, never throws.
 *
 * Regression guard for the stdio.ts listOrphans wrapper. The wrapper must NOT
 * reach the SDK as a raw throw — it must return a structured failureResult,
 * mirroring cleanupOrphan.
 *
 * This test exercises the wrapper through the SDK protocol path via
 * InMemoryTransport (no Access COM / PowerShell required — the wrapper's
 * behavior is at the adapter layer). It uses access_force_cleanup_orphaned
 * which, when called without confirmPid, delegates to listOrphans internally.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { startWithSdkServer } from "../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

async function createHarness(tools: Parameters<typeof startWithSdkServer>[0]): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport);
  const client = new Client({ name: "e2e-orphan", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await serverDone.catch(() => {});
    },
  };
}

describe("DELTA-005 — listOrphans wrapper returns failureResult over the MCP protocol (E2E)", () => {
  it("access_force_cleanup_orphaned with confirmPid absent returns SERVICE_UNAVAILABLE frame, not throw", async () => {
    // Build services WITHOUT an orphanCleanupService. The listOrphans wrapper
    // must return failureResult(SERVICE_UNAVAILABLE) — and that frame must reach
    // the SDK client as a structured McpToolResult (isError:true) rather than
    // an unhandled exception.
    const services = {
      vbaService: {
        execute: async () => successResult({ returnValue: "ok" }),
      },
      queryService: {
        execute: async () => successResult({ rows: [] }),
      },
      diagnosticsService: {
        run: async () => successResult({ checks: [] }),
      },
      // orphanCleanupService intentionally undefined
    } as unknown as Parameters<typeof createDysflowMcpTools>[0];

    const tools = createDysflowMcpTools(services, false);
    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "access_force_cleanup_orphaned",
        arguments: { accessPath: "C:/nonexistent/never.accdb" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
      // The wrapper's failureResult must surface as a structured error code
      // (SERVICE_UNAVAILABLE or ORPHAN_CLEANUP_NOT_CONFIGURED), NOT as an
      // unhandled exception that breaks the SDK protocol.
      expect(text).toMatch(/SERVICE_UNAVAILABLE|ORPHAN_CLEANUP_NOT_CONFIGURED|CONFIG/);
    } finally {
      await close();
    }
  });

  it("access_force_cleanup_orphaned with confirmPid absent does NOT propagate an uncaught exception", async () => {
    // Companion assertion: even when the underlying resolver fails (no project
    // config), the SDK call MUST return — it must not surface as a thrown
    // exception that crashes the client.
    const services = {
      vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    } as unknown as Parameters<typeof createDysflowMcpTools>[0];

    const tools = createDysflowMcpTools(services, false);
    const { client, close } = await createHarness(tools);
    try {
      let result: Awaited<ReturnType<typeof client.callTool>> | undefined;
      // Wrap in try/catch to assert NO exception escapes the SDK boundary.
      try {
        result = await client.callTool({
          name: "access_force_cleanup_orphaned",
          arguments: {},
        });
      } catch (err) {
        throw new Error(
          `listOrphans wrapper must not propagate a raw throw to the SDK client. Got: ${String(err)}`,
        );
      }
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    } finally {
      await close();
    }
  });
});
