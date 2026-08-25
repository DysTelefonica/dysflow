import {
  resolvePreferredToolWarnings,
  type ToolSelectionDescriptor,
} from "../../core/runtime/preferred-tool-warning.js";
import { buildAgentWorkflowMetadata } from "./agent-workflow-registry.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import type { DysflowMcpTool, McpToolResult } from "./result-translation.js";
import type { JsonObjectSchema } from "./schemas.js";

const FORCE_SPECIALIZED_SCHEMA = {
  type: "boolean" as const,
  default: false,
  description:
    "Suppress preferred-tool guidance for this call when granular or legacy behavior is intentional. The flag is consumed by the dispatcher and is not forwarded to the tool implementation.",
};

export function withPreferredToolControlSchema(
  name: string,
  schema: JsonObjectSchema,
): JsonObjectSchema {
  const workflow = buildAgentWorkflowMetadata(name);
  const access = MCP_TOOL_CONTRACTS[name as keyof typeof MCP_TOOL_CONTRACTS]?.access ?? "read-only";
  const eligible =
    workflow.status === "legacy" || (workflow.status === "specialized" && access !== "read-only");
  if (!eligible) return schema;
  return {
    ...schema,
    type: "object",
    additionalProperties: schema.additionalProperties ?? false,
    properties: {
      ...(schema.properties ?? {}),
      forceSpecialized: FORCE_SPECIALIZED_SCHEMA,
    },
  };
}

function descriptorFor(tool: DysflowMcpTool): ToolSelectionDescriptor {
  const workflow = buildAgentWorkflowMetadata(tool.name);
  const access =
    MCP_TOOL_CONTRACTS[tool.name as keyof typeof MCP_TOOL_CONTRACTS]?.access ?? "read-only";
  return {
    name: tool.name,
    status: workflow.status,
    phases: workflow.workflowPhases,
    access,
    preferredFor: workflow.preferFor,
    ...(workflow.supersededBy === undefined ? {} : { supersededBy: workflow.supersededBy }),
    ...(workflow.migrationGuidance === undefined
      ? {}
      : { migrationGuidance: workflow.migrationGuidance }),
  };
}

function inputWithoutControlFlag(input: unknown): {
  forceSpecialized: boolean;
  forwarded: unknown;
} {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { forceSpecialized: false, forwarded: input };
  }
  const { forceSpecialized, ...forwarded } = input as Record<string, unknown>;
  return { forceSpecialized: forceSpecialized === true, forwarded };
}

function appendWarnings(result: McpToolResult, warnings: readonly Record<string, unknown>[]) {
  if (result.isError || warnings.length === 0) return result;
  const first = result.content[0];
  if (first === undefined) return result;
  let payload: unknown;
  try {
    payload = JSON.parse(first.text);
  } catch {
    return result;
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return result;
  const record = payload as Record<string, unknown>;
  const existing = Array.isArray(record.warnings) ? record.warnings : [];
  return {
    ...result,
    content: [
      { ...first, text: JSON.stringify({ ...record, warnings: [...existing, ...warnings] }) },
      ...result.content.slice(1),
    ],
  };
}

/** Apply the catalog policy once at the final in-memory dispatch seam. */
export function withPreferredToolWarnings(
  tools: readonly DysflowMcpTool[],
  release: string,
): DysflowMcpTool[] {
  const catalog = tools.map(descriptorFor);
  return tools.map((tool, index) => {
    const descriptor = catalog[index];
    if (descriptor === undefined) return tool;
    const eligible =
      descriptor.status === "legacy" ||
      (descriptor.status === "specialized" && descriptor.access !== "read-only");
    if (!eligible) return tool;
    return {
      ...tool,
      inputSchema: withPreferredToolControlSchema(
        tool.name,
        tool.inputSchema ?? { type: "object", additionalProperties: false, properties: {} },
      ),
      handler: async (input, context) => {
        const { forceSpecialized, forwarded } = inputWithoutControlFlag(input);
        const result = await tool.handler(forwarded, context);
        const warnings = resolvePreferredToolWarnings({
          called: descriptor,
          catalog,
          release,
          forceSpecialized,
        });
        return appendWarnings(result, warnings);
      },
    };
  });
}
