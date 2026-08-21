import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import {
  RESULT_SCHEMA_VERSION,
  type ResponseEnvelopeShape,
  withWireResponseEnvelope,
} from "../../../src/adapters/mcp/response-envelope.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import type { DysflowMcpTool } from "../../../src/adapters/mcp/tools.js";

type WireEnvelope = ResponseEnvelopeShape & {
  schemaVersion: typeof RESULT_SCHEMA_VERSION;
  structuredContent: Record<string, unknown>;
};

function wireEnvelope(result: ResponseEnvelopeShape): WireEnvelope {
  return withWireResponseEnvelope(result) as WireEnvelope;
}

async function callLargeToolOverSdk() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const tool: DysflowMcpTool = {
    name: "large_result",
    description: "Returns a large structured result.",
    handler: async () => largeResult(),
  };
  const serverDone = startWithSdkServer([tool], serverTransport);
  const client = new Client({ name: "envelope-reduction-test", version: "1.0.0" }, {});
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name: tool.name, arguments: {} });
  } finally {
    await client.close();
    await serverDone.catch(() => undefined);
  }
}

function largeResult() {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          tools: Array.from({ length: 80 }, (_, index) => ({
            name: `tool_${index}`,
            description: "x".repeat(600),
          })),
        }),
      },
    ],
    isError: false,
    ok: true,
  };
}

describe("MCP response envelope reduction (#1460)", () => {
  it("keeps small text and structured projections backward compatible", () => {
    const result = wireEnvelope({
      content: [{ type: "text", text: JSON.stringify({ count: 2 }) }],
      isError: false,
      ok: true,
    });

    expect(result.content[0]?.text).toBe(JSON.stringify({ count: 2 }));
    expect(result.structuredContent).toMatchObject({
      count: 2,
      schemaVersion: RESULT_SCHEMA_VERSION,
      content: result.content,
      isError: false,
      ok: true,
    });
  });

  it("publishes large canonical payloads once and bounds the text fallback", () => {
    const result = wireEnvelope(largeResult());
    const structured = result.structuredContent;

    expect(structured.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
    expect(structured.tools).toHaveLength(80);
    expect(structured.content).toBeUndefined();
    expect((result.content[0]?.text ?? "").length).toBeLessThan(2_000);
    expect(result.content[0]?.text).not.toContain("tool_79");
  });

  it("retains typed error metadata while reducing a large JSON error payload", () => {
    const error = {
      code: "RESULT_CONTRACT_VIOLATION",
      message: "The result was too large",
      details: { actualShape: { fields: "x".repeat(20_000) } },
    };
    const result = wireEnvelope({
      content: [{ type: "text", text: JSON.stringify({ ok: false, error }) }],
      isError: true,
      ok: false,
      error,
    });
    const structured = result.structuredContent;

    expect(structured.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
    expect(structured.error).toEqual(error);
    expect((result.content[0]?.text ?? "").length).toBeLessThan(2_000);
  });

  it("keeps the reduced envelope JSON-stringifiable for wrapper clients", () => {
    const result = wireEnvelope(largeResult());
    const roundTripped = JSON.parse(JSON.stringify(result)) as WireEnvelope;

    expect(roundTripped.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
    expect(roundTripped.structuredContent?.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
    expect(roundTripped.structuredContent?.tools).toHaveLength(80);
  });

  it("keeps the full structured payload over the public SDK transport", async () => {
    const result = (await callLargeToolOverSdk()) as {
      content: Array<{ text?: string }>;
      structuredContent?: Record<string, unknown>;
    };
    const structured = result.structuredContent;

    expect((result.content[0]?.text ?? "").length).toBeLessThan(2_000);
    expect(structured?.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
    expect(structured?.tools).toHaveLength(80);
  });
});
