import { sanitizeMcpErrorMessage } from "../../core/utils/sanitize-error.js";
import type { DysflowMcpTool } from "./result-translation.js";

/**
 * Wraps a tool handler so that thrown exceptions are caught and returned as a
 * valid McpToolResult with isError:true, instead of propagating as an unhandled
 * rejection.
 *
 * This mirrors the try/catch that previously lived in stdio.ts callTool().
 */
export function wrapWithErrorAbsorber(
  handler: DysflowMcpTool["handler"],
): DysflowMcpTool["handler"] {
  return async (input, context) => {
    try {
      return await handler(input, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `MCP_TOOL_ERROR: ${message}` }],
        isError: true,
        ok: false,
      };
    }
  };
}

/**
 * Wraps a tool handler so that isError:true results have their text content
 * passed through sanitizeMcpErrorMessage(), stripping Windows, UNC, and POSIX
 * paths from error output.
 *
 * Non-error results pass through unchanged.
 */
export function wrapWithSanitizer(handler: DysflowMcpTool["handler"]): DysflowMcpTool["handler"] {
  return async (input, context) => {
    const result = await handler(input, context);
    if (!result.isError) return result;
    return {
      ...result,
      content: result.content.map((item) =>
        item.type === "text" ? { ...item, text: sanitizeMcpErrorMessage(item.text) } : item,
      ),
    };
  };
}

/**
 * Builds a Map of hidden tools keyed by tool name.
 *
 * The returned map contains only tools with hidden:true. This is used by the
 * SDK wiring to handle tools/call for hidden tools without registering them via
 * server.tool() (which would make them visible in tools/list).
 */
export function buildHiddenToolRegistry(tools: DysflowMcpTool[]): Map<string, DysflowMcpTool> {
  const registry = new Map<string, DysflowMcpTool>();
  for (const tool of tools) {
    if (tool.hidden === true) {
      registry.set(tool.name, tool);
    }
  }
  return registry;
}
