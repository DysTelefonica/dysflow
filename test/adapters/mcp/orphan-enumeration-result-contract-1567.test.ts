import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

function servicesWithOrphans() {
  const cleanupRequests: unknown[] = [];
  const services = {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
    orphanCleanupService: {
      listOrphans: async () =>
        successResult([
          {
            pid: 12_345,
            accessPath: "C:/project/app.accdb",
            kind: "access" as const,
            startTime: "2026-08-25T10:00:00.000Z",
            ageSeconds: 60,
            mainWindowHandle: 0,
          },
          {
            pid: 12_346,
            accessPath: "C:/project/app.accdb",
            kind: "powershell-worker" as const,
            ageSeconds: 30,
            mainWindowHandle: 0,
          },
        ]),
      cleanupOrphan: async (request: unknown) => {
        cleanupRequests.push(request);
        return successResult({ killed: [], refused: [], errors: [] });
      },
    },
  } as unknown as DysflowMcpServices;
  return { services, cleanupRequests };
}

async function callListing(arguments_: Record<string, unknown>) {
  const { services, cleanupRequests } = servicesWithOrphans();
  const tools = createDysflowMcpTools({
    services,
    accessContextResolver: async () =>
      successResult({ accessPath: "C:/project/app.accdb", projectRoot: "C:/project" }),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  void startWithSdkServer(tools, serverTransport, { resultValidationPolicy: "enforce" });
  const client = new Client({ name: "orphan-contract-1567", version: "1" }, {});
  clients.push(client);
  await client.connect(clientTransport);
  const result = await client.callTool({
    name: "access_force_cleanup_orphaned",
    arguments: arguments_,
  });
  return { result, cleanupRequests };
}

describe("access_force_cleanup_orphaned enumeration result contract (#1567)", () => {
  it.each([
    [
      "default enumeration",
      {
        accessPath: "C:/project/app.accdb",
        implements_check: "orphans_msaccess",
        confirmedRequiresConfirmation: true,
      },
    ],
    ["explicit complete enumeration", { accessPath: "C:/project/app.accdb", pid: null }],
  ])("keeps %s valid at the public MCP seam", async (_name, arguments_) => {
    const { result, cleanupRequests } = await callListing(arguments_);
    const structured = result.structuredContent as Record<string, unknown> | undefined;

    expect(result.isError, JSON.stringify(result)).toBe(false);
    expect(structured).toMatchObject({
      schemaVersion: "dysflow.result/v1",
      isError: false,
      ok: true,
      totalCount: 2,
      orphans: [
        { pid: 12_345, kind: "access" },
        { pid: 12_346, kind: "powershell-worker" },
      ],
    });
    expect(structured?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PREFERRED_TOOL_AVAILABLE",
          called: "access_force_cleanup_orphaned",
        }),
      ]),
    );
    expect(cleanupRequests).toEqual([]);
  });
});
