/**
 * SDK-based MCP adapter tests.
 *
 * These tests exercise the SDK path (startWithSdkServer) using InMemoryTransport
 * instead of PassThrough streams, validating the same protocol behaviors as the
 * legacy JsonLineMcpStdioRuntime tests but through the official SDK client/server.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ProgressNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import type { DysflowMcpTool } from "../../../src/adapters/mcp/tools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a linked InMemoryTransport pair, starts the SDK server with the
 * given tools on the server transport, connects a Client on the client
 * transport, and returns the connected client.
 *
 * The teardown Promise resolves when the server finishes (i.e. after
 * serverTransport.close() is called, which happens automatically on
 * client.close()).
 */
async function createSdkTestHarness(tools: DysflowMcpTool[]): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  // Start the SDK server on the server-side transport (does not block — server
  // stays alive until the transport is closed).
  const serverDone = startWithSdkServer(tools, serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);

  const close = async () => {
    await client.close();
    // Give server time to process the close
    await serverDone.catch(() => {
      // ignore close errors
    });
  };

  return { client, close };
}

// ─────────────────────────────────────────────────────────────────────────────
// Behavior 1 — tools/list returns only non-hidden tools
// ─────────────────────────────────────────────────────────────────────────────

describe("SDK path — tools/list", () => {
  it("returns only non-hidden tools", async () => {
    const tools: DysflowMcpTool[] = [
      {
        name: "visible_tool",
        description: "I am visible",
        handler: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
      },
      {
        name: "hidden_tool",
        description: "I am hidden",
        hidden: true,
        handler: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
      },
    ];

    const { client, close } = await createSdkTestHarness(tools);
    try {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name);
      expect(names).toContain("visible_tool");
      expect(names).not.toContain("hidden_tool");
    } finally {
      await close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Behavior 2 — tools/call with valid tool returns correct result
// ─────────────────────────────────────────────────────────────────────────────

describe("SDK path — tools/call success", () => {
  it("calls a valid tool and returns its result", async () => {
    const tools: DysflowMcpTool[] = [
      {
        name: "echo_tool",
        description: "Echoes args",
        handler: async (args) => ({
          content: [{ type: "text", text: JSON.stringify(args) }],
          isError: false,
        }),
      },
    ];

    const { client, close } = await createSdkTestHarness(tools);
    try {
      const result = await client.callTool({ name: "echo_tool", arguments: { hello: "world" } });
      expect(result.isError).toBeFalsy();
      expect(result.content).toEqual([{ type: "text", text: '{"hello":"world"}' }]);
    } finally {
      await close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Behavior 3 — handler exception → isError:true (not a rejected promise)
// ─────────────────────────────────────────────────────────────────────────────

describe("SDK path — tool handler exception", () => {
  it("catches a thrown error and returns isError:true result", async () => {
    const tools: DysflowMcpTool[] = [
      {
        name: "boom_tool",
        description: "Always throws",
        handler: async () => {
          throw new Error("simulated tool failure");
        },
      },
    ];

    const { client, close } = await createSdkTestHarness(tools);
    try {
      // Must NOT throw — error must surface as isError:true
      const result = await client.callTool({ name: "boom_tool", arguments: {} });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(text).toContain("simulated tool failure");
    } finally {
      await close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Behavior 4 — error messages have file paths scrubbed
// ─────────────────────────────────────────────────────────────────────────────

describe("SDK path — error sanitization", () => {
  it("scrubs Windows file paths from error messages", async () => {
    const tools: DysflowMcpTool[] = [
      {
        name: "path_leak_tool",
        description: "Throws with path in message",
        handler: async () => {
          throw new Error("RUNNER_TIMEOUT while opening C:\\Users\\Jane\\E2E_testing\\front.accdb");
        },
      },
    ];

    const { client, close } = await createSdkTestHarness(tools);
    try {
      const result = await client.callTool({ name: "path_leak_tool", arguments: {} });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(text).not.toContain("C:\\Users\\Jane");
      expect(text).toContain("[PATH]");
    } finally {
      await close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Behavior 5 — unknown tool name → isError:true with appropriate message
// ─────────────────────────────────────────────────────────────────────────────

describe("SDK path — unknown tool", () => {
  it("returns isError:true when calling a tool that does not exist", async () => {
    const { client, close } = await createSdkTestHarness([]);
    try {
      const result = await client.callTool({ name: "nonexistent_tool", arguments: {} });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(text).toContain("nonexistent_tool");
    } finally {
      await close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Behavior 6 — progress token → notifications/progress before result
// ─────────────────────────────────────────────────────────────────────────────

describe("SDK path — progress notifications", () => {
  it("receives progress notifications before the final result when progressToken is present", async () => {
    const tools: DysflowMcpTool[] = [
      {
        name: "progress_tool",
        description: "Sends progress",
        handler: async (_args, ctx) => {
          ctx?.sendProgress?.(1, 3, "step one");
          ctx?.sendProgress?.(2, 3, "step two");
          return { content: [{ type: "text", text: "done" }], isError: false };
        },
      },
    ];

    const { client, close } = await createSdkTestHarness(tools);
    try {
      const progressEvents: Array<{ progress: number; total?: number; message?: string }> = [];

      const result = await client.callTool(
        { name: "progress_tool", arguments: {} },
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

      expect(result.isError).toBeFalsy();
      expect(result.content).toEqual([{ type: "text", text: "done" }]);
      expect(progressEvents).toHaveLength(2);
      expect(progressEvents[0]).toMatchObject({ progress: 1, total: 3, message: "step one" });
      expect(progressEvents[1]).toMatchObject({ progress: 2, total: 3, message: "step two" });
    } finally {
      await close();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Behavior 7 — no progress frame when token absent
  // ─────────────────────────────────────────────────────────────────────────

  it("receives no progress notifications when no onprogress callback is provided", async () => {
    const tools: DysflowMcpTool[] = [
      {
        name: "progress_noop_tool",
        description: "Calls sendProgress but no token",
        handler: async (_args, ctx) => {
          // sendProgress is undefined when no token — must not throw
          ctx?.sendProgress?.(50, undefined, undefined);
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

      // Call without onprogress — no progressToken sent in _meta
      const result = await client.callTool({ name: "progress_noop_tool", arguments: {} });

      expect(result.isError).toBeFalsy();
      expect(notificationCount).toBe(0);
    } finally {
      await close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Behavior 8 — hidden tools: callable but not in tools/list
// ─────────────────────────────────────────────────────────────────────────────

describe("SDK path — hidden tools", () => {
  it("hidden tools are callable but absent from tools/list", async () => {
    const tools: DysflowMcpTool[] = [
      {
        name: "hidden_callable",
        description: "Hidden but callable",
        hidden: true,
        handler: async () => ({
          content: [{ type: "text", text: "hidden result" }],
          isError: false,
        }),
      },
    ];

    const { client, close } = await createSdkTestHarness(tools);
    try {
      // Should not appear in list
      const list = await client.listTools();
      expect(list.tools.map((t) => t.name)).not.toContain("hidden_callable");

      // But must be callable
      const result = await client.callTool({ name: "hidden_callable", arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(result.content).toEqual([{ type: "text", text: "hidden result" }]);
    } finally {
      await close();
    }
  });
});
