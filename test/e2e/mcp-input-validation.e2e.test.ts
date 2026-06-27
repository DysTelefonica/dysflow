/**
 * DELTA-003 (mcp-reliability-fix) — empty input rejection for filesystem-mutating
 * dispatch tools (#584).
 *
 * Integration/E2E coverage for the dispatch-factory behavior added in
 * `src/adapters/mcp/dispatch-factory.ts`. This test exercises the FULL MCP
 * protocol path via the official SDK client/server pair over InMemoryTransport,
 * so it does NOT require Access COM or PowerShell — the rejection happens in
 * the adapter layer before any service is touched.
 *
 * The same assertions are also covered at the dispatch-handler unit level in
 * `test/adapters/mcp/stdio.test.ts`; this E2E test pins the protocol contract
 * (tools/list + tools/call → MCP_INPUT_INVALID content frame) so a future
 * regression in the SDK wiring is caught here.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { startWithSdkServer } from "../../src/adapters/mcp/stdio.js";
import type { DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

function makeServices(): DysflowMcpServices {
  return {
    vbaService: {
      execute: vi.fn(async () => successResult({ returnValue: "ok" })),
    },
    queryService: {
      execute: vi.fn(async () => successResult({ rows: [] })),
    },
    diagnosticsService: {
      run: vi.fn(async () => successResult({ checks: [] })),
    },
    // The dispatch-factory MUST short-circuit empty input BEFORE invoking this.
    vbaSyncToolService: {
      execute: vi.fn(async () => {
        throw new Error(
          "vbaSyncToolService.execute MUST NOT be called for empty input on filesystem-write tools",
        );
      }),
    },
  };
}

async function createHarness(tools: DysflowMcpToolsInput): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport);
  const client = new Client({ name: "e2e-input-validation", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await serverDone.catch(() => {});
    },
  };
}

type DysflowMcpToolsInput = Parameters<typeof startWithSdkServer>[0];

describe("DELTA-003 — empty input rejection for filesystem-mutating dispatch tools (E2E)", () => {
  it("catalog_add_control tools/call with arguments:{} returns MCP_INPUT_INVALID over the SDK protocol", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, false); // writesEnabled=false

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "catalog_add_control",
        arguments: {},
      });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string } | undefined)?.text ?? "";
      expect(text).toContain("MCP_INPUT_INVALID");
      expect(services.vbaSyncToolService?.execute).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("generate_form tools/call with arguments:{} returns MCP_INPUT_INVALID", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, false);

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "generate_form",
        arguments: {},
      });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string } | undefined)?.text ?? "";
      expect(text).toContain("MCP_INPUT_INVALID");
      expect(services.vbaSyncToolService?.execute).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("NO_INPUT_SCHEMA tools (list_access_operations) accept arguments:{} without MCP_INPUT_INVALID", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, false);

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "list_access_operations",
        arguments: {},
      });
      // Should NOT be MCP_INPUT_INVALID — list_access_operations has no schema.
      const text = (result.content[0] as { text: string } | undefined)?.text ?? "";
      expect(text).not.toContain("MCP_INPUT_INVALID");
    } finally {
      await close();
    }
  });
});