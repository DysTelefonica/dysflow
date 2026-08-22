import type { OperationResult } from "../../core/contracts/index.js";
import { successResult } from "../../core/contracts/index.js";
import {
  PREFERRED_AGENT_WORKFLOWS,
  type AgentWorkflowPhase,
} from "./agent-workflow-registry.js";
import { BOOTSTRAP_INPUT_SCHEMA } from "./bootstrap-schema.js";
import { bootstrapResultContract } from "./contracts/bootstrap-result-contracts.js";
import { invalidInput } from "./dispatch-common.js";
import {
  getCapabilitiesAll,
  type GetCapabilitiesAllInput,
} from "./get-capabilities-tool.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import type { DysflowMcpTool } from "./result-translation.js";
import { translateCoreResultToMcpContent } from "./result-translation.js";
import { validateInput } from "./validator.js";

export type BootstrapWorkflowMap = {
  tools: { count: number };
} & Partial<Record<AgentWorkflowPhase, readonly string[]>>;

export type BootstrapSnapshot = {
  adapterVersion: string;
  surface: "stdio" | "http";
  writesProcess: {
    enabled: boolean;
    resolverConfigured: boolean;
  };
  writesProject: {
    allowWrites: boolean;
  };
  writeExecutionPolicy: "safe-by-default" | "developer";
  toolsVisible: number;
  preferredAgentWorkflows: BootstrapWorkflowMap;
  humanCompilePending: boolean;
};

export type BootstrapToolOptions = Pick<
  GetCapabilitiesAllInput,
  | "writesEnabled"
  | "writeAccessResolver"
  | "allowedProcedures"
  | "projectId"
  | "allowWrites"
  | "surface"
  | "adapterVersion"
  | "accessDbPath"
  | "writeExecutionPolicy"
  | "resultValidationPolicy"
>;

export function createBootstrapTool(opts: BootstrapToolOptions): DysflowMcpTool {
  const snapshot = getCapabilitiesAll(opts);

  return {
    name: "bootstrap",
    resultContract: bootstrapResultContract,
    description: `Return the minimal first-call Dysflow MCP bootstrap snapshot: adapter version, write gates, workflow routing, surface, and human-compile reminder. Read-only — does not resolve projects, open Access, spawn PowerShell, or mutate state. ${MCP_TOOL_CONTRACTS.bootstrap.summary}`,
    inputSchema: BOOTSTRAP_INPUT_SCHEMA,
    handler: async (input) => {
      const validation = validateInput(input, BOOTSTRAP_INPUT_SCHEMA);
      if (validation !== undefined) return invalidInput(validation);
      const params = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      const phase = typeof params.phase === "string" ? (params.phase as AgentWorkflowPhase) : undefined;
      const projected = projectBootstrapSnapshot(snapshot, phase);
      const result: OperationResult<typeof projected> = successResult(projected);
      return translateCoreResultToMcpContent(result);
    },
  };
}

export function projectBootstrapSnapshot(
  snapshot: ReturnType<typeof getCapabilitiesAll>,
  phase?: AgentWorkflowPhase,
): BootstrapSnapshot {
  return {
    adapterVersion: snapshot.adapterVersion,
    surface: snapshot.surface,
    writesProcess: snapshot.writesProcess,
    writesProject: snapshot.writesProject,
    writeExecutionPolicy: snapshot.writeExecutionPolicy,
    toolsVisible: snapshot.toolsVisible,
    preferredAgentWorkflows: buildBootstrapWorkflowMap(snapshot.toolsVisible, phase),
    humanCompilePending: snapshot.humanCompilePending,
  };
}

function buildBootstrapWorkflowMap(toolsVisible: number, phase?: AgentWorkflowPhase): BootstrapWorkflowMap {
  const workflows = PREFERRED_AGENT_WORKFLOWS.filter(
    (workflow) => phase === undefined || workflow.phase === phase,
  );
  return {
    tools: { count: toolsVisible },
    ...Object.fromEntries(workflows.map((workflow) => [workflow.phase, [...workflow.tools]])),
  };
}
