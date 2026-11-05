import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { TestRunProgressCallback } from "../../core/test-runs/detached-test-runner.js";
import { type StdioServerOptions, startWithSdkServer } from "./stdio.js";
import type { DysflowMcpTool } from "./tools.js";

/** The longest timer Node accepts; the run itself is bounded by the tool's own timeout. */
const NO_CLIENT_TIMEOUT_MS = 2_147_483_647;

/**
 * Issue #1993 — call one tool through the real MCP server pipeline, in process.
 *
 * The call crosses the same `tools/call` handler a stdio client reaches:
 * input sanitizing, error absorption, result validation and the response
 * envelope. The resolved value is therefore the tool result exactly as a
 * synchronous MCP caller receives it, and `onProgress` receives the same
 * progress notifications that caller would.
 */
export async function callToolInProcess(
  tools: DysflowMcpTool[],
  serverOptions: StdioServerOptions,
  name: string,
  args: Record<string, unknown>,
  onProgress?: TestRunProgressCallback,
): Promise<unknown> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverStarted = startWithSdkServer(tools, serverTransport, serverOptions);
  const client = new Client({ name: "dysflow-test-runner", version: "1.0.0" }, {});
  await client.connect(clientTransport);
  try {
    await serverStarted;
    return await client.callTool({ name, arguments: args }, undefined, {
      timeout: NO_CLIENT_TIMEOUT_MS,
      ...(onProgress === undefined
        ? {}
        : {
            onprogress: (notification) =>
              onProgress(notification.progress, notification.total, notification.message),
          }),
    });
  } finally {
    await client.close();
  }
}
