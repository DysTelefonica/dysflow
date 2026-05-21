/**
 * MCP adapter context passed to tool handlers.
 * Lives in the adapter layer — NEVER import this from src/core/.
 */
export interface McpToolContext {
  progressToken?: string | number;
  /**
   * Writes a notifications/progress JSON-RPC frame to the runtime output.
   * No-op when progressToken is absent.
   */
  sendProgress?(progress: number, total?: number, message?: string): void;
}
