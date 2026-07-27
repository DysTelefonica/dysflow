import { buildAgentWorkflowMetadata } from "./agent-workflow-registry.js";
import type { DysflowMcpTool, McpToolResult } from "./result-translation.js";
import { withSchemaVersion } from "./result-translation.js";

export const MCP_TOOL_NOT_FOUND = "MCP_TOOL_NOT_FOUND";
const MAX_SUGGESTION_NAME_LENGTH = 128;

type UnknownToolResolution =
  | { kind: "superseded"; supersededBy: string }
  | { kind: "suggested"; suggestedToolName: string }
  | { kind: "unmatched" };

/**
 * Builds the wire-level unknown-tool response without consulting request arguments.
 * The caller-provided name is the only request data retained, making the payload safe
 * for the future invocation aggregation planned in #1197.
 */
export function unknownToolResult(
  attemptedToolName: string,
  tools: readonly DysflowMcpTool[],
): McpToolResult {
  const advertisedToolNames = tools.filter((tool) => tool.hidden !== true).map((tool) => tool.name);
  const resolution = resolveUnknownTool(attemptedToolName, advertisedToolNames);
  const message = messageFor(attemptedToolName, resolution);
  const remediation = remediationFor(attemptedToolName, resolution);

  return withSchemaVersion({
    content: [{ type: "text", text: `${MCP_TOOL_NOT_FOUND}: ${message}` }],
    isError: true,
    ok: false,
    error: {
      code: MCP_TOOL_NOT_FOUND,
      errorCode: MCP_TOOL_NOT_FOUND,
      message,
      errorMessage: message,
      attemptedToolName,
      ...(resolution.kind === "suggested"
        ? { suggestedToolName: resolution.suggestedToolName }
        : {}),
      ...(resolution.kind === "superseded" ? { supersededBy: resolution.supersededBy } : {}),
      remediation,
      diagnostics: [
        {
          code: MCP_TOOL_NOT_FOUND,
          severity: "error",
          message,
          remediation,
        },
      ],
      relatedIssueNumbers: ["#1199"],
    },
  });
}

function resolveUnknownTool(
  attemptedToolName: string,
  advertisedToolNames: readonly string[],
): UnknownToolResolution {
  const workflow = buildAgentWorkflowMetadata(attemptedToolName);
  if (workflow.status === "legacy" && workflow.supersededBy !== undefined) {
    return { kind: "superseded", supersededBy: workflow.supersededBy };
  }

  const suggestedToolName = closestSafeToolName(attemptedToolName, advertisedToolNames);
  return suggestedToolName === undefined
    ? { kind: "unmatched" }
    : { kind: "suggested", suggestedToolName };
}

function messageFor(attemptedToolName: string, resolution: UnknownToolResolution): string {
  if (resolution.kind === "superseded") {
    return `No tool named "${attemptedToolName}". It was superseded by "${resolution.supersededBy}".`;
  }
  return `No tool named "${attemptedToolName}".`;
}

function remediationFor(attemptedToolName: string, resolution: UnknownToolResolution): string {
  if (resolution.kind === "superseded") {
    return `Use "${resolution.supersededBy}" instead. Inspect its contract with describe_tool({ name: "${resolution.supersededBy}" }).`;
  }
  if (resolution.kind === "suggested") {
    return `No tool named "${attemptedToolName}". Did you mean "${resolution.suggestedToolName}"? Inspect it with describe_tool({ name: "${resolution.suggestedToolName}" }).`;
  }
  return `Call schema({ view: 'compact' }) to list available tools, or describe_tool({ name: '<tool>' }) to inspect one contract.`;
}

function closestSafeToolName(
  attemptedToolName: string,
  advertisedToolNames: readonly string[],
): string | undefined {
  if (attemptedToolName.length > MAX_SUGGESTION_NAME_LENGTH) return undefined;
  const attempted = attemptedToolName.toLowerCase();
  const maxDistance = attempted.length <= 5 ? 1 : attempted.length <= 12 ? 2 : 3;
  let bestName: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  let tied = false;

  for (const toolName of advertisedToolNames) {
    const candidate = toolName.toLowerCase();
    if (Math.abs(attempted.length - candidate.length) > maxDistance) continue;
    const distance = levenshteinDistance(attempted, candidate);
    const relativeDistance = distance / Math.max(attempted.length, candidate.length, 1);
    if (distance > maxDistance || relativeDistance > 0.2) continue;
    if (distance < bestDistance) {
      bestName = toolName;
      bestDistance = distance;
      tied = false;
    } else if (distance === bestDistance) {
      tied = true;
    }
  }

  return tied ? undefined : bestName;
}

function levenshteinDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[right.length] ?? right.length;
}
