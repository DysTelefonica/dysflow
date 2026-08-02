/**
 * MCP adapter context passed to tool handlers.
 * Lives in the adapter layer — NEVER import this from src/core/.
 */
export interface McpToolContext {
  progressToken?: string | number;
  /**
   * Privacy-safe audit evidence accumulated by dispatch wrappers and emitted
   * with the invocation telemetry entry after the handler completes.
   */
  auditEvents?: string[];
  /**
   * Project root authenticated by a successful one-shot recovery consume.
   * The stdio seam may use this handler-only evidence to rebind telemetry;
   * raw caller arguments must never populate it.
   */
  authenticatedTelemetryProjectRoot?: string;
  /**
   * Writes a notifications/progress JSON-RPC frame to the runtime output.
   * No-op when progressToken is absent.
   */
  sendProgress?(progress: number, total?: number, message?: string): void;
}
