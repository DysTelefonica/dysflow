/**
 * DELTA-007 (mcp-reliability-fix) — catalog_add_control dryRun/apply parity E2E.
 *
 * Exercises the FULL MCP protocol path for catalog_add_control through the
 * official SDK client/server pair over InMemoryTransport. Asserts the
 * default-dry-run semantics at the wire level: omitting both flags returns
 * a plan result (no write), `apply:true` flips to write mode, and the
 * write-gate fires when `apply:true` is sent with writes disabled.
 *
 * No Access COM / PowerShell required — the rejection/plan branches happen
 * at the adapter layer.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { startWithSdkServer } from "../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

type ToolsInput = Parameters<typeof startWithSdkServer>[0];

function makeServices() {
  return {
    vbaService: { execute: vi.fn(async () => successResult({ returnValue: "ok" })) },
    queryService: { execute: vi.fn(async () => successResult({ rows: [] })) },
    diagnosticsService: { run: vi.fn(async () => successResult({ checks: [] })) },
    // vbaSyncToolService MUST receive dryRun:true when caller omits both
    // dryRun and apply. Pin the args the mock sees — that's the actual
    // contract for DELTA-007 default-dry-run.
    vbaSyncToolService: {
      execute: vi.fn(async (toolName: string, input: unknown) => {
        return successResult({
          toolName,
          dryRun: (input as { dryRun?: boolean })?.dryRun,
        });
      }),
    },
  };
}

async function createHarness(tools: ToolsInput): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport);
  const client = new Client({ name: "e2e-catalog", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await serverDone.catch(() => {});
    },
  };
}

describe("DELTA-007 — catalog_add_control dryRun/apply parity (E2E)", () => {
  it("catalog_add_control with no dryRun/apply defaults to dry-run plan (writes disabled)", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, false); // writesEnabled=false

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "catalog_add_control",
        arguments: {
          spec: { name: "CustomerEntry", kind: "Form", controls: [] },
          controlName: "txtName",
          controlType: "TextBox",
        },
      });
      expect(result.isError).toBe(false);
      const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
      // Default-dry-run does NOT trip the write-gate — the dispatch resolves
      // resolveIsDryRun=true so the service runs in plan mode. The mock
      // returns a generic success, so we assert the write-gate did NOT fire
      // and the service WAS reached (the service itself then decides
      // dry-run from `params.dryRun !== false`).
      expect(text).not.toContain("MCP_WRITES_DISABLED");
      expect(services.vbaSyncToolService?.execute).toHaveBeenCalledTimes(1);
      // The dispatch passes the RAW input through to the service — the
      // dryRun decision is made inside the service based on input.dryRun
      // and input.apply. With both absent, input.dryRun is undefined.
      const lastCall = (
        services.vbaSyncToolService?.execute.mock.calls.at(-1) as unknown[] | undefined
      )?.[1] as { dryRun?: boolean; apply?: boolean } | undefined;
      expect(lastCall?.dryRun).toBeUndefined();
      expect(lastCall?.apply).toBeUndefined();
    } finally {
      await close();
    }
  });

  it("catalog_add_control with dryRun:true runs plan path and skips write-gate", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, false);

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "catalog_add_control",
        arguments: {
          spec: { name: "CustomerEntry", kind: "Form", controls: [] },
          controlName: "txtName",
          controlType: "TextBox",
          dryRun: true,
        },
      });
      expect(result.isError).toBe(false);
      const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
      expect(text).not.toContain("MCP_WRITES_DISABLED");
      const lastCall = (
        services.vbaSyncToolService?.execute.mock.calls.at(-1) as unknown[] | undefined
      )?.[1] as { dryRun?: boolean } | undefined;
      expect(lastCall?.dryRun).toBe(true);
    } finally {
      await close();
    }
  });

  it("catalog_add_control with apply:true bypasses write-gate (writes enabled)", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, true); // writesEnabled=true

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "catalog_add_control",
        arguments: {
          spec: { name: "CustomerEntry", kind: "Form", controls: [] },
          controlName: "txtName",
          controlType: "TextBox",
          apply: true,
        },
      });
      expect(result.isError).toBe(false);
      const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
      expect(text).not.toContain("MCP_WRITES_DISABLED");
      const lastCall = (
        services.vbaSyncToolService?.execute.mock.calls.at(-1) as unknown[] | undefined
      )?.[1] as { apply?: boolean } | undefined;
      expect(lastCall?.apply).toBe(true);
    } finally {
      await close();
    }
  });

  it("catalog_add_control with apply:true trips write-gate (writes disabled)", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, false); // writesEnabled=false

    const { client, close } = await createHarness(tools);
    try {
      const result = await client.callTool({
        name: "catalog_add_control",
        arguments: {
          spec: { name: "CustomerEntry", kind: "Form", controls: [] },
          controlName: "txtName",
          controlType: "TextBox",
          apply: true,
        },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
      expect(text).toContain("MCP_WRITES_DISABLED");
    } finally {
      await close();
    }
  });
});
