import {
  buildAgentWorkflowMetadata,
  buildToolAdvertisementMetadata,
  DYSFLOW_WORKFLOW_META_KEY,
  type McpStandardToolAnnotations,
} from "./agent-workflow-registry.js";
import { MCP_TOOL_CONTRACTS, type McpToolAccess } from "./mcp-tool-contracts.js";

export type CompactToolAdvertisementMetadata = {
  annotations: McpStandardToolAnnotations;
  _meta: {
    [DYSFLOW_WORKFLOW_META_KEY]: {
      phases: ReturnType<typeof buildAgentWorkflowMetadata>["workflowPhases"];
      status: ReturnType<typeof buildAgentWorkflowMetadata>["status"];
    };
  };
};

/**
 * The tools/list surface is a routing advertisement, not the deep contract.
 * Keep only facts a client needs before selecting a tool; workflow guidance
 * remains available through schema/describe_tool.
 */
export function buildCompactToolAdvertisementMetadata(
  name: string,
  access: McpToolAccess,
): CompactToolAdvertisementMetadata {
  const full = buildToolAdvertisementMetadata(name, access);
  const workflow = buildAgentWorkflowMetadata(name);
  return {
    annotations: full.annotations,
    _meta: {
      [DYSFLOW_WORKFLOW_META_KEY]: {
        phases: [...workflow.workflowPhases],
        status: workflow.status,
      },
    },
  };
}

/** Build a bounded description from the canonical tool contract registry. */
export function buildCompactToolAdvertisementDescription(
  name: string,
  access: McpToolAccess,
): string {
  const contract = MCP_TOOL_CONTRACTS[name as keyof typeof MCP_TOOL_CONTRACTS];
  const summary = contract?.summary ?? "MCP tool contract.";
  if (access === "read-only") return `${summary} Read-only; no project or Access writes.`;
  if (contract?.dryRunDefault === true) {
    return `${summary} Plans by default; apply:true is the explicit commit signal and remains write-gated.`;
  }
  return `${summary} Write execution remains explicitly gated.`;
}

type JsonSchemaNode = Record<string, unknown>;

const SAFETY_PARAMETER_DESCRIPTIONS: Record<string, string> = {
  allowWrites: "Writes require both process and project write gates.",
  allowedProcedures:
    "Execution is limited to the configured procedure allowlist and fails closed when unavailable.",
  apply: "Set apply:true to commit mutations; omitted or false plans only.",
  compile: "Compilation is human-owned; this flag never bypasses the manual compile gate.",
  confirm: "Required confirmation for a destructive filesystem transition.",
  confirmedRequiresConfirmation:
    "Required explicit approval for a destructive operation after safety checks.",
  dryRun:
    "The safe preview path; use the canonical apply flag to commit when this tool supports it.",
  force: "Enables destructive cleanup only after ownership and safety checks.",
  mode: "Select read or write behavior; write behavior remains gated.",
  strictContext: "Strict project-context matching fails closed on ambiguity or mismatch.",
};

function compactSchemaNode(node: JsonSchemaNode, propertyName?: string): JsonSchemaNode {
  const result: JsonSchemaNode = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "description") continue;
    if (key === "properties" && isRecord(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [
          name,
          isRecord(child) ? compactSchemaNode(child, name) : child,
        ]),
      );
      continue;
    }
    if (key === "items" && isRecord(value)) {
      result[key] = compactSchemaNode(value);
      continue;
    }
    if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(value)) {
      result[key] = value.map((child) => (isRecord(child) ? compactSchemaNode(child) : child));
      continue;
    }
    result[key] = value;
  }
  if (propertyName !== undefined && SAFETY_PARAMETER_DESCRIPTIONS[propertyName] !== undefined) {
    result.description = SAFETY_PARAMETER_DESCRIPTIONS[propertyName];
  }
  return result;
}

function isRecord(value: unknown): value is JsonSchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Preserve the complete invocation shape while removing non-safety prose. */
export function compactToolInputSchema(schema: unknown): unknown {
  return isRecord(schema) ? compactSchemaNode(schema) : schema;
}
