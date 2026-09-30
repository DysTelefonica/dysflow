/**
 * Issue #1801 — binary inspection names every missing requirement at once.
 *
 * Exercises the full MCP protocol path (SDK client → server over
 * InMemoryTransport → tools/call) so a regression in the SDK wiring, the
 * handler ordering, or the precheck placement is caught before merge. The
 * rejection happens in the adapter before any Access process, so this runs on
 * every change without Access COM. The real-binary success path is covered by
 * the release/nightly MCP E2E against the fixture `.accdb`.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { startWithSdkServer } from "../../src/adapters/mcp/stdio.js";
import type { DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

const ACCESS_PATH = "C:/archives/legacy.accdb";
const MODULE_SOURCE = [
  'Attribute VB_Name = "ControlCambios"',
  "Option Explicit",
  "",
  "Private Sub ResetState()",
  "End Sub",
].join("\r\n");

function makeServices(): DysflowMcpServices {
  return {
    vbaService: { execute: vi.fn(async () => successResult({ returnValue: "ok" })) },
    queryService: { execute: vi.fn(async () => successResult({ rows: [] })) },
    diagnosticsService: { run: vi.fn(async () => successResult({ checks: [] })) },
    vbaSyncToolService: {
      execute: vi.fn(async () =>
        successResult({
          modules: [{ name: "ControlCambios", binaryExists: true, binarySource: MODULE_SOURCE }],
        }),
      ),
    },
  };
}

async function withClient<T>(
  services: DysflowMcpServices,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(createDysflowMcpTools({ services }), serverTransport);
  const client = new Client({ name: "e2e-binary-inspection-1801", version: "0.0.1" });
  await client.connect(clientTransport);
  try {
    return await run(client);
  } finally {
    await client.close();
    await serverDone.catch(() => {});
  }
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
}

const BINARY_TOOLS = [
  { name: "get_procedure", base: { module: "ControlCambios", procedure: "ResetState" } },
  { name: "list_procedures", base: { module: "ControlCambios" } },
  { name: "lint_module", base: { module: "ControlCambios" } },
] as const;

describe("#1801 binary inspection requirements over the MCP protocol (E2E)", () => {
  for (const { name, base } of BINARY_TOOLS) {
    it(`${name} rejects an incomplete binary call once, naming both requirements`, async () => {
      const services = makeServices();
      await withClient(services, async (client) => {
        const result = await client.callTool({
          name,
          arguments: { ...base, source: "binary" },
        });

        expect(result.isError).toBe(true);
        const text = textOf(result);
        expect(text).toContain("MCP_INPUT_INVALID");
        expect(text).toContain(
          "missing required parameters: allowExternalAccessPath:true, accessPath",
        );
        expect(services.vbaSyncToolService?.execute).not.toHaveBeenCalled();
      });
    });
  }

  it("redirects databasePath to accessPath instead of a bare unknown-key rejection", async () => {
    const services = makeServices();
    await withClient(services, async (client) => {
      const result = await client.callTool({
        name: "get_procedure",
        arguments: {
          module: "ControlCambios",
          procedure: "ResetState",
          source: "binary",
          allowExternalAccessPath: true,
          databasePath: ACCESS_PATH,
        },
      });

      expect(result.isError).toBe(true);
      const text = textOf(result);
      expect(text).toContain("missing required parameters: accessPath");
      expect(text).toContain("pass the same path as accessPath");
      expect(text).not.toContain("databasePath is not allowed");
      expect(services.vbaSyncToolService?.execute).not.toHaveBeenCalled();
    });
  });

  it("serves the complete call shape unchanged", async () => {
    const services = makeServices();
    await withClient(services, async (client) => {
      const result = await client.callTool({
        name: "get_procedure",
        arguments: {
          module: "ControlCambios",
          procedure: "ResetState",
          source: "binary",
          allowExternalAccessPath: true,
          accessPath: ACCESS_PATH,
        },
      });

      expect(result.isError).toBeFalsy();
      expect(JSON.parse(textOf(result))).toMatchObject({
        module: "ControlCambios",
        procedure: "ResetState",
      });
      expect(services.vbaSyncToolService?.execute).toHaveBeenCalledTimes(1);
    });
  });
});
