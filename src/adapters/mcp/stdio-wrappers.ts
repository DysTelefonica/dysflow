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
      const record =
        typeof err === "object" && err !== null ? (err as Record<string, unknown>) : undefined;
      const nestedMessage =
        typeof record?.message === "object" && record.message !== null
          ? (record.message as Record<string, unknown>)
          : undefined;
      const message =
        err instanceof Error
          ? err.message
          : typeof record?.message === "string"
            ? record.message
            : typeof nestedMessage?.message === "string"
              ? nestedMessage.message
              : String(err);
      const code =
        typeof record?.code === "string" && record.code.length > 0 ? record.code : "MCP_TOOL_ERROR";
      const remediation =
        typeof record?.remediation === "string" && record.remediation.length > 0
          ? record.remediation
          : typeof nestedMessage?.remediation === "string" && nestedMessage.remediation.length > 0
            ? nestedMessage.remediation
            : "Inspect the typed error code and message, correct the reported condition, then retry.";
      const error = {
        code,
        errorCode: code,
        message,
        errorMessage: message,
        remediation,
        diagnostics: [{ code, severity: "error", message, remediation }],
      };
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error }) }],
        isError: true,
        ok: false,
        error,
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
        item.type === "text" ? { ...item, text: sanitizeMcpErrorContentText(item.text) } : item,
      ),
    };
  };
}

function sanitizeMcpErrorContentText(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return sanitizeMcpErrorMessage(text);
  }

  const error = errorObject(parsed);
  if (error === undefined) return sanitizeMcpErrorMessage(text);

  const configPath = error.configPath;
  const resolvedConfig = error.resolvedConfig;
  const sanitized = sanitizeMcpErrorMessage(text);

  try {
    const sanitizedPayload = JSON.parse(sanitized) as unknown;
    const sanitizedError = errorObject(sanitizedPayload);
    if (sanitizedError === undefined) return sanitized;
    // setup_project intentionally publishes these typed, secret-free fields so
    // callers can correct the accepted bootstrap candidate. Preserve them while
    // the surrounding free-form message and remediation remain path-sanitized.
    if (configPath !== undefined) sanitizedError.configPath = configPath;
    if (resolvedConfig !== undefined) sanitizedError.resolvedConfig = resolvedConfig;
    return JSON.stringify(sanitizedPayload);
  } catch {
    return sanitized;
  }
}

function errorObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const error = (value as Record<string, unknown>).error;
  return typeof error === "object" && error !== null && !Array.isArray(error)
    ? (error as Record<string, unknown>)
    : undefined;
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
