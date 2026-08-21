import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}

class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}

class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

const tools = createDysflowMcpTools({
  services: {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  },
});

async function listTools(): Promise<{
  tools: Array<Record<string, unknown>>;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport);
  const client = new Client(
    { name: "compact-tools-list-test", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(clientTransport);
  return {
    tools: (await client.listTools()).tools as Array<Record<string, unknown>>,
    close: async () => {
      await client.close();
      await serverDone.catch(() => undefined);
    },
  };
}

describe("compact tools/list advertisements (#1462)", () => {
  it("keeps every callable input property while removing deep parameter prose", async () => {
    const listed = await listTools();
    try {
      const sourceByName = new Map(tools.map((tool) => [tool.name, tool]));
      for (const advertised of listed.tools) {
        const name = String(advertised.name);
        const sourceSchema = sourceByName.get(name)?.inputSchema as {
          properties?: Record<string, unknown>;
        };
        const advertisedSchema = advertised.inputSchema as {
          properties?: Record<string, unknown>;
        };
        expect(Object.keys(advertisedSchema.properties ?? {}).sort()).toEqual(
          Object.keys(sourceSchema.properties ?? {}).sort(),
        );
      }

      const importTool = listed.tools.find((tool) => tool.name === "import_modules");
      expect(importTool).toBeDefined();
      expect(String(importTool?.description).length).toBeLessThan(240);
      expect(String(importTool?.description)).toMatch(/apply|dryRun|write/i);
      const importSchema = importTool?.inputSchema as { properties?: Record<string, unknown> };
      expect(importSchema.properties?.apply).toBeDefined();
      expect(
        String((importSchema.properties?.apply as { description?: string }).description),
      ).toMatch(/apply|write|dry-run/i);
    } finally {
      await listed.close();
    }
  });

  it("exposes routing-only metadata and keeps preferred guidance in deep catalog views", async () => {
    const listed = await listTools();
    try {
      const advertised = listed.tools.find((tool) => tool.name === "schema");
      expect(advertised).toBeDefined();
      const metadata = advertised?._meta as {
        "dysflow/workflow"?: { phases?: unknown; status?: unknown; preferredFor?: unknown };
      };
      expect(metadata["dysflow/workflow"]).toMatchObject({
        phases: expect.any(Array),
        status: expect.any(String),
      });
      expect(metadata["dysflow/workflow"]).not.toHaveProperty("preferredFor");

      const deep = buildToolSchemaCatalog({ toolName: "schema" }).tools[0];
      expect(deep?.agentWorkflow.preferFor.length).toBeGreaterThan(0);
      expect(deep?.agentWorkflow.preferFor[0]).toMatch(/discover|tool/i);
    } finally {
      await listed.close();
    }
  });

  it("keeps compact safety parameters explicit for every advertised tool", async () => {
    const listed = await listTools();
    try {
      const listedByName = new Map(listed.tools.map((tool) => [String(tool.name), tool]));
      const safetyNames =
        /^(apply|dryRun|compile|confirm|confirmedRequiresConfirmation|force|allowedProcedures|allowWrites|mode|strictContext)$/;
      for (const source of tools) {
        const sourceSchema = source.inputSchema as {
          properties?: Record<string, unknown>;
        };
        const advertised = listedByName.get(source.name);
        const advertisedSchema = advertised?.inputSchema as {
          properties?: Record<string, { description?: unknown }>;
        };
        for (const name of Object.keys(sourceSchema.properties ?? {}).filter((key) =>
          safetyNames.test(key),
        )) {
          expect(
            advertisedSchema.properties?.[name]?.description,
            `${source.name}.${name} must retain explicit compact safety semantics`,
          ).toEqual(expect.any(String));
        }
      }
    } finally {
      await listed.close();
    }
  });
});
