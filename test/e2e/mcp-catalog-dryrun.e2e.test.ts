/**
 * DELTA-007 (mcp-reliability-fix) — catalog_add_control dryRun/apply parity E2E.
 *
 * Exercises the FULL MCP protocol path for catalog_add_control through the
 * official SDK client/server pair over InMemoryTransport. Asserts the
 * default-plan semantics at the wire level: omitting `apply` returns a plan
 * result (no write), `apply:true` flips to write mode, and the write-gate fires
 * when `apply:true` is sent with writes disabled. The retired `dryRun` field is
 * rejected by the live input schema.
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
    vbaSyncToolService: {
      execute: vi.fn(async (toolName: string, input: unknown) => {
        const apply = (input as { apply?: boolean })?.apply === true;
        return successResult({
          toolName,
          mode: apply ? "apply" : "plan",
          ok: true,
          dryRun: !apply,
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
  it("catalog_add_control with no apply defaults to a plan (writes disabled)", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services: services,
    }); // writesEnabled=false

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
      expect(text).not.toContain("MCP_WRITES_DISABLED");
      expect(JSON.parse(text)).toMatchObject({ mode: "plan", ok: true, dryRun: true });
      expect(services.vbaSyncToolService?.execute).toHaveBeenCalledTimes(1);
      const lastCall = (
        services.vbaSyncToolService?.execute.mock.calls.at(-1) as unknown[] | undefined
      )?.[1] as { apply?: boolean } | undefined;
      expect(lastCall?.apply).toBeUndefined();
    } finally {
      await close();
    }
  });

  it("catalog_add_control rejects the retired dryRun field", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services: services,
    });

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
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
      expect(text).toContain("MCP_INPUT_INVALID");
      expect(services.vbaSyncToolService?.execute).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("catalog_add_control with apply:true bypasses write-gate (writes enabled)", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services: services,
      writes: true,
    }); // writesEnabled=true

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
      expect(JSON.parse(text)).toMatchObject({ mode: "apply", ok: true, dryRun: false });
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
    const tools = createDysflowMcpTools({
      services: services,
    }); // writesEnabled=false

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
