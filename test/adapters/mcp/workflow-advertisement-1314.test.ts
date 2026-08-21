import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool.js";
import {
  buildToolSchemaCatalog,
  createDescribeToolTool,
} from "../../../src/adapters/mcp/schema-tool.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import type { DysflowMcpTool } from "../../../src/adapters/mcp/tools.js";

const WORKFLOW_META_KEY = "dysflow/workflow";
const STANDARD_ANNOTATION_KEYS = [
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
  "readOnlyHint",
  "title",
];
const PHASES = ["bootstrap", "sync", "tests", "sql", "forms", "recovery"];

type WorkflowAdvertisement = {
  annotations: Record<string, unknown>;
  _meta: {
    [WORKFLOW_META_KEY]: {
      phases: string[];
      status: string;
    };
  };
};

async function listSyntheticTools(tools: DysflowMcpTool[]) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport);
  const client = new Client(
    { name: "workflow-metadata-test", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(clientTransport);
  try {
    return await client.listTools();
  } finally {
    await client.close();
    await serverDone.catch(() => undefined);
  }
}

function capabilitySnapshot() {
  return getCapabilitiesAll({
    writesEnabled: false,
    writeAccessResolver: undefined,
    allowedProcedures: undefined,
    projectId: undefined,
    allowWrites: false,
    adapterVersion: "test",
  }) as ReturnType<typeof getCapabilitiesAll> & {
    tools: Record<string, WorkflowAdvertisement>;
  };
}

describe("MCP workflow advertisement (#1314)", () => {
  it("publishes only standard MCP behavior hints plus namespaced workflow metadata", async () => {
    const result = await listSyntheticTools([
      {
        name: "resolve_project",
        description: "Resolve a project",
        handler: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
      },
    ]);

    const tool = result.tools[0] as unknown as WorkflowAdvertisement;
    expect(Object.keys(tool.annotations).sort()).toEqual(STANDARD_ANNOTATION_KEYS);
    expect(tool.annotations).not.toHaveProperty("category");
    expect(tool.annotations).not.toHaveProperty("preferredFor");
    expect(tool._meta[WORKFLOW_META_KEY]).toMatchObject({
      phases: ["bootstrap", "recovery"],
      status: "preferred",
    });
  });

  it("classifies every advertised tool into one or more supported workflow phases", () => {
    const catalog = buildToolSchemaCatalog({ view: "full" }).tools as unknown as Array<
      { name: string } & WorkflowAdvertisement
    >;
    const snapshot = capabilitySnapshot();

    expect(Object.keys(snapshot.tools)).toHaveLength(catalog.length);
    for (const tool of catalog) {
      const workflow = tool._meta[WORKFLOW_META_KEY];
      expect(workflow.phases.length, `${tool.name} needs a workflow phase`).toBeGreaterThan(0);
      expect(
        workflow.phases.every((phase) => PHASES.includes(phase)),
        tool.name,
      ).toBe(true);
      expect(workflow.preferredFor.length, `${tool.name} needs usage guidance`).toBeGreaterThan(0);
      expect(snapshot.tools[tool.name]?._meta[WORKFLOW_META_KEY]).toEqual(workflow);
    }
  });

  it("supports multi-phase classification without collapsing resolve_project", () => {
    const snapshot = capabilitySnapshot();
    expect(snapshot.tools.resolve_project?._meta[WORKFLOW_META_KEY].phases).toEqual([
      "bootstrap",
      "recovery",
    ]);
    expect(
      snapshot.preferredAgentWorkflows
        .filter((workflow) => workflow.tools.includes("resolve_project"))
        .map((workflow) => workflow.phase),
    ).toEqual(["bootstrap", "recovery"]);
  });

  it("keeps preferred workflow cross-references aligned with per-tool phase metadata", () => {
    const snapshot = capabilitySnapshot();
    for (const workflow of snapshot.preferredAgentWorkflows) {
      for (const name of workflow.tools) {
        expect(
          snapshot.tools[name],
          `${workflow.phase} references unknown tool ${name}`,
        ).toBeDefined();
        expect(
          snapshot.tools[name]?._meta[WORKFLOW_META_KEY].phases,
          `${workflow.phase}:${name} must advertise the owning phase`,
        ).toContain(workflow.phase);
      }
    }
  });

  it("mirrors identical metadata through full schema, compact schema, describe_tool and capabilities", async () => {
    const full = buildToolSchemaCatalog({ view: "full", toolName: "test_vba" })
      .tools[0] as unknown as WorkflowAdvertisement;
    const compact = buildToolSchemaCatalog({ view: "compact", toolName: "test_vba" })
      .tools[0] as unknown as WorkflowAdvertisement;
    const describedResult = await createDescribeToolTool().handler({ name: "test_vba" });
    const described = JSON.parse(describedResult.content[0]?.text ?? "{}") as WorkflowAdvertisement;
    const capabilities = capabilitySnapshot().tools.test_vba;

    expect(compact.annotations).toEqual(full.annotations);
    expect(described.annotations).toEqual(full.annotations);
    expect(capabilities?.annotations).toEqual(full.annotations);
    expect(compact._meta).toEqual(full._meta);
    expect(described._meta).toEqual(full._meta);
    expect(capabilities?._meta).toEqual(full._meta);
  });

  it("derives conservative standard behavior hints from the canonical tool contract", () => {
    const snapshot = capabilitySnapshot();
    expect(snapshot.tools.get_capabilities?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(snapshot.tools.drop_table?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  });
});
