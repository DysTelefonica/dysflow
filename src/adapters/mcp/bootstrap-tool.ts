import type { OperationResult } from "../../core/contracts/index.js";
import { successResult } from "../../core/contracts/index.js";
import {
  type AgentWorkflowPhase,
  isAdvertisedUnderSurface,
  PREFERRED_AGENT_WORKFLOWS,
  type ToolInventorySnapshot,
  type ToolSurface,
} from "./agent-workflow-registry.js";
import { BOOTSTRAP_INPUT_SCHEMA } from "./bootstrap-schema.js";
import { bootstrapResultContract } from "./contracts/bootstrap-result-contracts.js";
import { invalidInput } from "./dispatch-common.js";
import { type GetCapabilitiesAllInput, getCapabilitiesAll } from "./get-capabilities-tool.js";
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
  /**
   * Issue #1492 — number of tools the runtime will advertise under the
   * active surface (`core` ≈ 39, `full` ≈ 95). Non-advertised tools remain
   * callable by name.
   */
  toolsVisible: number;
  /** Unambiguous replacement for the legacy context-dependent toolsVisible field. */
  toolInventory: ToolInventorySnapshot;
  toolSurface: ToolSurface;
  /**
   * Issue #1492 — how to widen the surface. Only emitted when the active
   * surface is `core`; consumers can read `schema({ view: "index" })` to
   * discover non-advertised tools without flipping the surface.
   */
  toolSurfaceGuidance?: string;
  preferredAgentWorkflows: BootstrapWorkflowMap;
  humanCompilePending: boolean;
  /**
   * Issue #1668 — `bootstrap` deliberately never resolves a project, so its
   * `humanCompilePending` is scoped to the frontend the MCP process started
   * with. A consumer reading `false` on a worktree the resolver cannot target
   * would otherwise conclude the workflow was unblocked. This field names the
   * scope the flag was evaluated in; it is never a project-resolution result.
   */
  humanCompilePendingScope: "project-in-scope" | "no-project-in-scope";
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
> & {
  /** Issue #1492 — active advertised surface (default "core"). */
  toolSurface?: ToolSurface;
};

export function formatCoreSurfaceGuidance(advertisedCount: number): string {
  return `Active surface is "core" (${advertisedCount} tools). Pass \`toolSurface: "full"\` to the dysflow mcp CLI (\`--tool-surface full\`) or set \`mcp.toolSurface: "full"\` in \`.dysflow/project.json\` to advertise every tool. Non-advertised tools remain callable by name; discover them with \`schema({ view: "index" })\`.`;
}

export function createBootstrapTool(opts: BootstrapToolOptions): DysflowMcpTool {
  const snapshot = getCapabilitiesAll(opts);

  return {
    name: "bootstrap",
    resultContract: bootstrapResultContract,
    description: `Return the minimal first-call Dysflow MCP bootstrap snapshot: adapter version, write gates, workflow routing, surface, and human-compile reminder. Read-only — does not resolve projects, open Access, spawn PowerShell, or mutate state. Because it never resolves a project, humanCompilePending is scoped to the MCP startup frontend and humanCompilePendingScope says whether it was evaluated at all; call resolve_project to learn whether a cwd is targetable. ${MCP_TOOL_CONTRACTS.bootstrap.summary}`,
    inputSchema: BOOTSTRAP_INPUT_SCHEMA,
    handler: async (input) => {
      const validation = validateInput(input, BOOTSTRAP_INPUT_SCHEMA);
      if (validation !== undefined) return invalidInput(validation);
      const params =
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      const phase =
        typeof params.phase === "string" ? (params.phase as AgentWorkflowPhase) : undefined;
      const projected = projectBootstrapSnapshot(snapshot, opts.toolSurface ?? "core", phase);
      const result: OperationResult<typeof projected> = successResult(projected);
      return translateCoreResultToMcpContent(result);
    },
  };
}

export function projectBootstrapSnapshot(
  snapshot: ReturnType<typeof getCapabilitiesAll>,
  toolSurface: ToolSurface,
  phase?: AgentWorkflowPhase,
): BootstrapSnapshot {
  const advertisedCount = Object.keys(MCP_TOOL_CONTRACTS).filter((name) =>
    isAdvertisedUnderSurface(name, toolSurface),
  ).length;
  return {
    adapterVersion: snapshot.adapterVersion,
    surface: snapshot.surface,
    writesProcess: snapshot.writesProcess,
    writesProject: snapshot.writesProject,
    writeExecutionPolicy: snapshot.writeExecutionPolicy,
    toolsVisible: advertisedCount,
    toolInventory: {
      callable: Object.keys(MCP_TOOL_CONTRACTS).length,
      advertised: advertisedCount,
      surface: toolSurface,
    },
    toolSurface,
    ...(toolSurface === "core"
      ? {
          toolSurfaceGuidance: formatCoreSurfaceGuidance(advertisedCount),
        }
      : {}),
    preferredAgentWorkflows: buildBootstrapWorkflowMap(advertisedCount, phase),
    humanCompilePending: snapshot.humanCompilePending,
    humanCompilePendingScope: snapshot.humanCompilePendingScope,
  };
}

function buildBootstrapWorkflowMap(
  toolsVisible: number,
  phase?: AgentWorkflowPhase,
): BootstrapWorkflowMap {
  const workflows = PREFERRED_AGENT_WORKFLOWS.filter(
    (workflow) => phase === undefined || workflow.phase === phase,
  );
  return {
    tools: { count: toolsVisible },
    ...Object.fromEntries(workflows.map((workflow) => [workflow.phase, [...workflow.tools]])),
  };
}
