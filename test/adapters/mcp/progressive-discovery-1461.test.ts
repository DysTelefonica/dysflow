import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createGetCapabilitiesTool } from "../../../src/adapters/mcp/get-capabilities-tool.js";
import {
  buildToolSchemaCatalog,
  createDescribeToolTool,
} from "../../../src/adapters/mcp/schema-tool.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";

function capabilityOptions(): Parameters<typeof createGetCapabilitiesTool>[0] {
  return {
    writesEnabled: true,
    writeAccessResolver: undefined,
    allowedProcedures: ["fixtureProcedure"],
    projectId: "fixture-project",
    allowWrites: true,
  };
}

function parseText(result: { content: ReadonlyArray<{ text?: string }> }) {
  return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("progressive discovery views (#1461)", () => {
  it("builds an index view with routing fields and phase/status/name filters", () => {
    const catalog = buildToolSchemaCatalog({
      view: "index",
      phase: "bootstrap",
      status: "preferred",
      toolName: "schema",
    });

    expect(catalog.tools).toHaveLength(1);
    expect(catalog.tools[0]).toMatchObject({
      name: "schema",
      status: "preferred",
      phases: ["bootstrap"],
    });
    expect(catalog.tools[0]).not.toHaveProperty("parameters");
    expect(catalog.tools[0]).not.toHaveProperty("inputSchema");
  });

  it("derives get_capabilities discovery inputs from the advertised schema", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "get_capabilities" });
    const parameters = catalog.tools[0]?.parameters ?? {};
    expect(parameters.compact).toMatchObject({ type: "boolean" });
    expect(parameters.include).toMatchObject({ type: "array" });
    expect(parameters.toolNames).toMatchObject({ type: "array" });
  });

  it("keeps the full capabilities default and provides compact filtered blocks", async () => {
    const tool = createGetCapabilitiesTool(capabilityOptions());
    const full = parseText(await tool.handler({}));
    const compact = parseText(
      await tool.handler({
        compact: true,
        include: ["tools", "sharedBlockSupport", "effectiveDryRunDefault", "migrationNotes"],
        toolNames: ["schema"],
      }),
    );

    expect(full.allowedProcedures).toBeDefined();
    expect(full.tools).toBeDefined();
    expect(compact.tools).toHaveProperty("schema");
    expect(compact.tools).not.toHaveProperty("export_modules");
    expect(compact.sharedBlockSupport).toHaveProperty("schema");
    expect(compact.effectiveDryRunDefault).toHaveProperty("schema");
    expect(compact.migrationNotes).toBeDefined();
    expect(compact.allowedProcedures).toBeUndefined();
  });

  it("selects describe sections without the legacy params duplicate", async () => {
    const tool = createDescribeToolTool();
    const summary = parseText(await tool.handler({ name: "schema", sections: ["summary"] }));
    const parameters = parseText(await tool.handler({ name: "schema", sections: ["parameters"] }));

    expect(summary.name).toBe("schema");
    expect(summary.parameters).toBeUndefined();
    expect(summary.params).toBeUndefined();
    expect(parameters.parameters).toBeDefined();
    expect(parameters.params).toBeUndefined();
  });

  it("advertises concise initialize instructions over the stdio SDK", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverDone = startWithSdkServer([], serverTransport);
    const client = new Client({ name: "progressive-discovery-test", version: "1.0.0" }, {});
    await client.connect(clientTransport);
    try {
      const instructions = client.getInstructions();
      expect(instructions).toMatch(/get_capabilities.*compact/i);
      expect(instructions).toMatch(/describe_tool/i);
    } finally {
      await client.close();
      await serverDone.catch(() => undefined);
    }
  });
});
