import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineResultContract } from "../../../src/adapters/mcp/contracts/result-contract.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools, type DysflowMcpTool } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";

async function callRegisteredTool(
  tools: DysflowMcpTool[],
  name: string,
  args: Record<string, unknown>,
) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport, {
    resultValidationPolicy: "enforce",
  });
  const client = new Client({ name: "cleanup-contract-test", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await client.close();
    await serverDone.catch(() => undefined);
  }
}

function recoveryTools(cleanup: unknown) {
  const registry = new InMemoryAccessOperationRegistry();
  // Registry I/O can expose a lingering cleaned record; preserve its evidence.
  registry.get = async () => ({
    operationId: "registered-operation",
    action: "test",
    accessPath: "C:/fixture/frontend.accdb",
    accessPid: null,
    processStartTime: null,
    status: "cleaned",
    metadata: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  return createDysflowMcpTools({
    services: {
      vbaService: { execute: async () => successResult({}) },
      queryService: { execute: async () => successResult({}) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
      operationRegistry: registry,
      // Simulate untrusted adapter output at the I/O port, including invalid results.
      cleanupService: { cleanup: async () => successResult(cleanup as never) },
    },
  });
}

describe("registered recovery result validation — #1830", () => {
  it("returns the observed nullable cleanup evidence through public MCP dispatch", async () => {
    const cleanup = { operationId: "registered-operation", accessPid: null, status: "cleaned" };
    const result = await callRegisteredTool(recoveryTools(cleanup), "cleanup_access_operation", {
      accessPath: "C:/fixture/frontend.accdb",
      operationId: cleanup.operationId,
      force: false,
    });
    expect(result).toMatchObject({
      schemaVersion: "dysflow.result/v1",
      isError: false,
      ok: true,
      structuredContent: { cleanup, registryHealth: { status: "ok" } },
    });
  });

  it.each([
    { operationId: "op-1", accessPid: "unknown", status: "cleaned" },
    { operationId: "op-1", accessPid: null, status: "invented" },
    { accessPid: null, status: "cleaned" },
  ])("rejects malformed cleanup evidence %j", async (cleanup) => {
    const result = await callRegisteredTool(recoveryTools(cleanup), "cleanup_access_operation", {
      accessPath: "C:/fixture/frontend.accdb",
      operationId: "op-1",
    });
    expect(result).toMatchObject({
      isError: true,
      error: { code: "RESULT_CONTRACT_VIOLATION" },
    });
  });
});

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
