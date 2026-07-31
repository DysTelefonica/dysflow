import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineResultContract } from "../../../src/adapters/mcp/contracts/result-contract.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import type { DysflowMcpTool } from "../../../src/adapters/mcp/tools.js";

describe("RESULT_CONTRACT_VIOLATION exposes actual versus expected shape", () => {
  it("populates actualShape and expectedShape without leaking payload values", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const tools: DysflowMcpTool[] = [
      {
        name: "form_set_property",
        description: "Synthetic invalid form result.",
        resultContract: defineResultContract({
          schema: z.object({ mode: z.literal("dry-run"), changed: z.boolean() }).strict(),
        }),
        handler: async () => ({
          content: [{ type: "text", text: JSON.stringify({ mode: "dry-run", changed: "secret" }) }],
          isError: false,
        }),
      },
    ];
    const serverDone = startWithSdkServer(tools, serverTransport, {
      resultValidationPolicy: "enforce",
    });
    const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({ name: "form_set_property", arguments: {} });
      expect(result).toMatchObject({
        isError: true,
        error: {
          code: "RESULT_CONTRACT_VIOLATION",
          actualShape: expect.any(Object),
          expectedShape: expect.any(Object),
        },
      });
      expect(JSON.stringify(result)).not.toContain("secret");
    } finally {
      await client.close();
      await serverDone.catch(() => undefined);
    }
  });
});
