import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineResultContract } from "../../../../src/adapters/mcp/contracts/result-contract.js";
import { startWithSdkServer } from "../../../../src/adapters/mcp/stdio.js";
import type { DysflowMcpTool } from "../../../../src/adapters/mcp/tools.js";

const resultContract = defineResultContract({
  schema: z.object({ ok: z.literal(true), count: z.number() }).strict(),
});

async function callSynthetic(
  policy: "report" | "enforce",
  report = vi.fn(),
): Promise<{ result: Awaited<ReturnType<Client["callTool"]>>; report: typeof report }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const tools: DysflowMcpTool[] = [
    {
      name: "invalid_result",
      description: "Returns a deliberately invalid result.",
      resultContract,
      handler: async () => ({
        content: [{ type: "text", text: JSON.stringify({ ok: true, count: "password-value" }) }],
        isError: false,
      }),
    },
  ];
  const serverDone = startWithSdkServer(tools, serverTransport, {
    resultValidationPolicy: policy,
    reportResultContractViolation: report,
  });
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(clientTransport);
  try {
    return {
      result: await client.callTool({ name: "invalid_result", arguments: {} }),
      report,
    };
  } finally {
    await client.close();
    await serverDone.catch(() => undefined);
  }
}

describe("SDK pre-serialization result validation seam", () => {
  it("report preserves the legacy response and emits a redacted diagnostic", async () => {
    const { result, report } = await callSynthetic("report");
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      { type: "text", text: '{"ok":true,"count":"password-value"}' },
    ]);
    expect(result.structuredContent).toMatchObject({
      schemaVersion: "dysflow.result/v1",
      isError: false,
    });
    expect(report).toHaveBeenCalledOnce();
    expect(JSON.stringify(report.mock.calls)).not.toContain("password-value");
  });

  it("enforce fails closed with a typed envelope before invalid success serialization", async () => {
    const { result } = await callSynthetic("enforce");
    expect(result.isError).toBe(true);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "RESULT_CONTRACT_VIOLATION",
        errorCode: "RESULT_CONTRACT_VIOLATION",
      },
    });
    expect(JSON.stringify(result)).not.toContain("password-value");
  });
});
