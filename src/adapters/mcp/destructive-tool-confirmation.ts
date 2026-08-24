import type { McpToolResult } from "./result-translation.js";
import { withSchemaVersion } from "./result-translation.js";

/**
 * Public destructive operations that require an explicit, tool-specific
 * acknowledgement before apply mode may reach a service adapter.
 *
 * `access_force_cleanup_orphaned` retains its stricter, PID-bound HR-2
 * handler because that contract also proves process ownership and liveness.
 */
export const DESTRUCTIVE_TOOL_CONFIRMATIONS = {
  delete_module: "delete_module_precheck",
  compact_repair: "compact_repair_precheck",
  relink_directory: "relink_directory_precheck",
  localize_backend_links: "localize_backend_precheck",
  drop_table: "drop_table_precheck",
  teardown_fixture: "teardown_fixture_precheck",
} as const;

export type DestructiveToolName = keyof typeof DESTRUCTIVE_TOOL_CONFIRMATIONS;

export function isDestructiveTool(toolName: string): toolName is DestructiveToolName {
  return DESTRUCTIVE_TOOL_CONFIRMATIONS[toolName as DestructiveToolName] !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDestructiveToolApplyCall(input: unknown, toolName: string): boolean {
  return isRecord(input) && input.apply === true && isDestructiveTool(toolName);
}

function confirmationRequired(
  toolName: DestructiveToolName,
  expected: (typeof DESTRUCTIVE_TOOL_CONFIRMATIONS)[DestructiveToolName],
  input: Record<string, unknown>,
): McpToolResult {
  const missingFields = [
    ...(input.implements_check === expected ? [] : ["implements_check"]),
    ...(input.confirmedRequiresConfirmation === true ? [] : ["confirmedRequiresConfirmation"]),
  ];
  const message =
    `${toolName} is destructive. Re-run with implements_check: ` +
    `"${expected}" AND confirmedRequiresConfirmation: true.`;
  return withSchemaVersion({
    content: [{ type: "text", text: `CONFIRMATION_REQUIRED: ${message}` }],
    isError: true,
    ok: false,
    error: {
      code: "CONFIRMATION_REQUIRED",
      errorCode: "CONFIRMATION_REQUIRED",
      message,
      errorMessage: message,
      toolName,
      missingFields,
      // The public error contract historically types remediation as prose.
      // This gate intentionally emits the issue's machine-copyable object;
      // the cast preserves source compatibility for older result consumers.
      remediation: {
        implements_check: expected,
        confirmedRequiresConfirmation: true,
      } as unknown as string,
      diagnostics: [
        {
          code: "CONFIRMATION_REQUIRED",
          severity: "error",
          message,
        },
      ],
      relatedIssueNumbers: ["#1537"],
    },
  });
}

/**
 * Enforce the second-confirmation contract at the MCP dispatch boundary.
 * Plan mode and trusted internal composition bypass it; public apply mode
 * must provide both exact confirmation fields.
 */
export function enforceDestructiveToolConfirmation(
  input: unknown,
  toolName: string,
  options: { internalCall?: boolean } = {},
): McpToolResult | undefined {
  if (options.internalCall === true || !isRecord(input) || input.apply !== true) {
    return undefined;
  }
  const expected = DESTRUCTIVE_TOOL_CONFIRMATIONS[toolName as DestructiveToolName];
  if (expected === undefined) return undefined;

  if (input.implements_check !== undefined && input.implements_check !== expected) {
    const message = `${toolName} rejected implements_check; expected "${expected}".`;
    return withSchemaVersion({
      content: [{ type: "text", text: `MCP_INPUT_INVALID: ${message}` }],
      isError: true,
      ok: false,
      error: {
        code: "MCP_INPUT_INVALID",
        errorCode: "MCP_INPUT_INVALID",
        message,
        errorMessage: message,
        rejectedFlag: "implements_check",
        expected,
        toolName,
        remediation: `Set implements_check to "${expected}" and confirm the destructive operation explicitly.`,
        diagnostics: [{ code: "MCP_INPUT_INVALID", severity: "error", message }],
        relatedIssueNumbers: ["#1537"],
      },
    });
  }

  if (input.implements_check !== expected || input.confirmedRequiresConfirmation !== true) {
    return confirmationRequired(toolName as DestructiveToolName, expected, input);
  }
  return undefined;
}
