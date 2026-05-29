/**
 * SDK-based progress notification tests.
 *
 * Validates that the SDK server path correctly delivers progress notifications
 * to the client before the final tool result, and that no notifications are
 * sent when no progress token is present.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ProgressNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import type { DysflowMcpTool } from "../../../src/adapters/mcp/tools.js";

async function createSdkTestHarness(tools: DysflowMcpTool[]): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);

  const close = async () => {
    await client.close();
    await serverDone.catch(() => {
      // ignore close errors
    });
  };

  return { client, close };
}

describe("SDK path — progress notifications (progress-sdk)", () => {
  it("delivers progress notifications with token before final result", async () => {
    const tools: DysflowMcpTool[] = [
      {
        name: "dysflow.progress.test",
        description: "Tool that emits progress",
        handler: async (_args, context) => {
          context?.sendProgress?.(40, 100, "Executing");
          return { content: [{ type: "text", text: "done" }], isError: false };
        },
      },
    ];

    const { client, close } = await createSdkTestHarness(tools);
    try {
      const progressEvents: Array<{
        progress: number;
        total?: number;
        message?: string;
      }> = [];

      const result = await client.callTool(
        { name: "dysflow.progress.test", arguments: {} },
        undefined,
        {
          onprogress: (notification) => {
            progressEvents.push({
              progress: notification.progress,
              total: notification.total,
              message: notification.message,
            });
          },
        },
      );

      // Notification arrived before result
      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0]).toMatchObject({
        progress: 40,
        total: 100,
        message: "Executing",
      });

      // Result is correct
      expect(result.isError).toBeFalsy();
      expect(result.content).toEqual([{ type: "text", text: "done" }]);
    } finally {
      await close();
    }
  });

  it("emits no notifications/progress when progressToken is absent", async () => {
    const tools: DysflowMcpTool[] = [
      {
        name: "dysflow.progress.noop",
        description: "Tool that emits progress but has no token",
        handler: async (_args, context) => {
          // sendProgress is undefined when no token — calling it must not throw
          context?.sendProgress?.(50, undefined, undefined);
          return { content: [{ type: "text", text: "done" }], isError: false };
        },
      },
    ];

    const { client, close } = await createSdkTestHarness(tools);
    try {
      let notificationCount = 0;
      client.setNotificationHandler(ProgressNotificationSchema, () => {
        notificationCount++;
      });

      // No onprogress callback → no progressToken in _meta
      const result = await client.callTool({
        name: "dysflow.progress.noop",
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      expect(notificationCount).toBe(0);
    } finally {
      await close();
    }
  });

  it("omits total and message from notification when not provided to sendProgress", async () => {
    const tools: DysflowMcpTool[] = [
      {
        name: "dysflow.progress.minimal",
        description: "Tool that emits progress with only progress value",
        handler: async (_args, context) => {
          context?.sendProgress?.(50);
          return { content: [{ type: "text", text: "done" }], isError: false };
        },
      },
    ];

    const { client, close } = await createSdkTestHarness(tools);
    try {
      const progressEvents: Array<{
        progress: number;
        total?: number;
        message?: string;
      }> = [];

      await client.callTool({ name: "dysflow.progress.minimal", arguments: {} }, undefined, {
        onprogress: (notification) => {
          progressEvents.push({
            progress: notification.progress,
            total: notification.total,
            message: notification.message,
          });
        },
      });

      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0]?.progress).toBe(50);
      // total and message should be absent or undefined
      expect(progressEvents[0]?.total).toBeUndefined();
      expect(progressEvents[0]?.message).toBeUndefined();
    } finally {
      await close();
    }
  });
});
