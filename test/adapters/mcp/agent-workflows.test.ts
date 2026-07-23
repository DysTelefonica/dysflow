import { describe, expect, it } from "vitest";
import { EXPECTED_ADVERTISED_TOOL_COUNT } from "../../../E2E_testing/_helpers/advertised-tool-count.mjs";
import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool.js";
import {
  buildToolSchemaCatalog,
  createDescribeToolTool,
} from "../../../src/adapters/mcp/schema-tool.js";

type WorkflowStatus = "preferred" | "specialized" | "legacy";
type WorkflowPhase = "bootstrap" | "sync" | "tests" | "sql" | "forms" | "recovery";
type AgentWorkflowMetadata = {
  status: WorkflowStatus;
  supersededBy?: string;
  preferFor: string[];
  workflowPhase?: WorkflowPhase;
  specializedWhen?: string;
  migrationGuidance?: string;
  deprecationPolicy?: string;
};
type WorkflowTool = {
  name: string;
  useCases: string[];
  agentWorkflow: AgentWorkflowMetadata;
};
type PreferredAgentWorkflow = {
  phase: WorkflowPhase;
  tools: string[];
};

const STATUSES: WorkflowStatus[] = ["preferred", "specialized", "legacy"];
const PHASES: WorkflowPhase[] = ["bootstrap", "sync", "tests", "sql", "forms", "recovery"];

function fullCatalog(): WorkflowTool[] {
  return buildToolSchemaCatalog({ view: "full" }).tools as unknown as WorkflowTool[];
}

function compactCatalog(): WorkflowTool[] {
  return buildToolSchemaCatalog({ view: "compact" }).tools as unknown as WorkflowTool[];
}

async function describeTool(name: string): Promise<WorkflowTool> {
  const result = await createDescribeToolTool().handler({ name });
  return JSON.parse(result.content[0]?.text ?? "{}") as WorkflowTool;
}

describe("preferred agent workflows and specialized wrappers (#1080)", () => {
  it("classifies every advertised tool from the generated catalog", () => {
    const tools = fullCatalog();

    expect(tools).toHaveLength(EXPECTED_ADVERTISED_TOOL_COUNT);
    for (const tool of tools) {
      expect(STATUSES, `${tool.name} must declare a valid status`).toContain(
        tool.agentWorkflow.status,
      );
      expect(
        tool.agentWorkflow.preferFor.length,
        `${tool.name} must explain when to use it`,
      ).toBeGreaterThan(0);
      expect(tool.useCases).toEqual(tool.agentWorkflow.preferFor);
    }
  });

  it("resolves every legacy migration to a terminal preferred tool", () => {
    const tools = fullCatalog();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const legacy = tools.filter((tool) => tool.agentWorkflow.status === "legacy");

    expect(legacy.length).toBeGreaterThan(0);
    for (const tool of legacy) {
      expect(
        tool.agentWorkflow.supersededBy,
        `${tool.name} must name its replacement`,
      ).toBeTruthy();
      expect(
        tool.agentWorkflow.migrationGuidance,
        `${tool.name} must explain migration`,
      ).toBeTruthy();
      expect(tool.agentWorkflow.deprecationPolicy, `${tool.name} must declare policy`).toBeTruthy();

      const visited = new Set([tool.name]);
      let targetName = tool.agentWorkflow.supersededBy;
      while (targetName !== undefined) {
        expect(visited.has(targetName), `${tool.name} migration must not cycle`).toBe(false);
        visited.add(targetName);
        const target = byName.get(targetName);
        expect(target, `${tool.name} target ${targetName} must exist`).toBeDefined();
        if (target === undefined) break;
        if (target.agentWorkflow.status !== "legacy") {
          expect(target.agentWorkflow.status).toBe("preferred");
          break;
        }
        targetName = target.agentWorkflow.supersededBy;
      }
    }
  });

  it("states when every specialized tool is better than its preferred wrapper", () => {
    const specialized = fullCatalog().filter((tool) => tool.agentWorkflow.status === "specialized");

    expect(specialized.length).toBeGreaterThan(0);
    for (const tool of specialized) {
      expect(
        tool.agentWorkflow.specializedWhen,
        `${tool.name} must state when specialization wins`,
      ).toBeTruthy();
    }
  });

  it("exposes identical workflow metadata through compact schema and describe_tool", async () => {
    const full = fullCatalog();
    const compactByName = new Map(compactCatalog().map((tool) => [tool.name, tool]));

    for (const tool of full) {
      expect(tool.agentWorkflow, `${tool.name} full metadata`).toBeDefined();
      expect(compactByName.get(tool.name)?.agentWorkflow, `${tool.name} compact metadata`).toEqual(
        tool.agentWorkflow,
      );
    }

    for (const name of ["sync_binary", "query_execute", "query_sql", "form_set_property"]) {
      const described = await describeTool(name);
      expect(described.agentWorkflow, `${name} describe metadata`).toBeDefined();
      expect(described.agentWorkflow).toEqual(
        full.find((tool) => tool.name === name)?.agentWorkflow,
      );
    }
  });

  it("publishes preferred golden paths for every required workflow phase", () => {
    const tools = fullCatalog();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const snapshot = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: undefined,
      allowWrites: false,
      adapterVersion: "test",
    }) as ReturnType<typeof getCapabilitiesAll> & {
      preferredAgentWorkflows: PreferredAgentWorkflow[];
    };
    const workflows = snapshot.preferredAgentWorkflows;

    expect(workflows.map((workflow) => workflow.phase).sort()).toEqual([...PHASES].sort());
    for (const workflow of workflows) {
      expect(workflow.tools.length, `${workflow.phase} path must not be empty`).toBeGreaterThan(0);
      for (const name of workflow.tools) {
        expect(byName.get(name), `${workflow.phase} references unknown tool ${name}`).toBeDefined();
        expect(byName.get(name)?.agentWorkflow.status, `${workflow.phase}:${name}`).toBe(
          "preferred",
        );
      }
    }

    expect(workflows.find((workflow) => workflow.phase === "bootstrap")?.tools).toEqual([
      "get_capabilities",
      "schema",
      "describe_tool",
    ]);
    expect(workflows.find((workflow) => workflow.phase === "sync")?.tools).toContain("sync_binary");
    expect(workflows.find((workflow) => workflow.phase === "tests")?.tools).toEqual([
      "validate_manifest",
      "test_vba",
    ]);
    expect(workflows.find((workflow) => workflow.phase === "sql")?.tools).toEqual([
      "query_execute",
    ]);
    expect(workflows.find((workflow) => workflow.phase === "forms")?.tools).toEqual([
      "analyze_form_ui",
      "generate_form_design_plan",
      "apply_form_design_plan",
      "verify_form_ui",
    ]);
    expect(workflows.find((workflow) => workflow.phase === "recovery")?.tools).toEqual([
      "diagnose",
      "state",
      "logs",
      "cleanup_access_operation",
    ]);
  });
});
