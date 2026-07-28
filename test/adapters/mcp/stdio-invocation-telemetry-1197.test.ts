import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  InvocationTelemetryContextResolver,
  InvocationTelemetryEntry,
  InvocationTelemetryRecorder,
} from "../../../src/adapters/mcp/invocation-telemetry.js";
import { createInvocationTelemetryContextResolver } from "../../../src/adapters/mcp/invocation-telemetry.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import type { DysflowMcpTool } from "../../../src/adapters/mcp/tools.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-stdio-invocations-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

async function harness(
  tools: DysflowMcpTool[],
  recorder: InvocationTelemetryRecorder,
  invocationContextResolver?: InvocationTelemetryContextResolver,
) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport, {
    invocationRecorder: recorder,
    invocationContextResolver,
  });
  const client = new Client({ name: "telemetry-test", version: "1" }, { capabilities: {} });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await serverDone.catch(() => undefined);
    },
  };
}

describe("stdio tools/call structural telemetry seam (#1197)", () => {
  it("fails closed before resolving config for an invalid explicit contextId", async () => {
    const startup = tempRoot();
    const resolveTarget = vi.fn(async () => ({
      cwd: startup,
      enabled: true,
      writeExecutionPolicy: "developer" as const,
    }));
    const resolveContext = createInvocationTelemetryContextResolver({
      fallback: {
        cwd: startup,
        enabled: true,
        writeExecutionPolicy: "safe-by-default",
      },
      resolveTarget,
    });

    const invalid = await resolveContext({ contextId: 42 });
    await invalid.recorder.record({
      timestamp: "2026-07-28T00:00:00.000Z",
      tool: "schema",
      action: "diagnostics",
      operationId: null,
      projectId: null,
      outcome: "ok",
      failureClass: "none",
      errorCode: null,
      durationMs: 1,
      writeIntent: "read",
      paramNamesPresent: ["contextId"],
      missingParams: [],
      rejectedParams: [],
      unknownToolName: null,
    });

    expect(resolveTarget).not.toHaveBeenCalled();
    await expect(
      readFile(join(startup, ".dysflow", "runtime", "invocations.jsonl"), "utf8"),
    ).rejects.toThrow();

    await resolveContext({ contextId: "trace-42" });
    expect(resolveTarget).toHaveBeenCalledOnce();
  });

  it("records every registered tool, including read-only calls, plus unknown attempts", async () => {
    const recorded: InvocationTelemetryEntry[] = [];
    const recorder: InvocationTelemetryRecorder = {
      record: vi.fn(async (entry) => {
        recorded.push(entry);
      }),
    };
    const tools: DysflowMcpTool[] = ["schema", "describe_tool", "custom_future_tool"].map(
      (name) => ({
        name,
        description: name,
        handler: async () => ({
          content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }],
          isError: false,
          ok: true,
        }),
      }),
    );
    const { client, close } = await harness(tools, recorder);
    try {
      for (const tool of tools) {
        await client.callTool({ name: tool.name, arguments: { projectId: "p" } });
      }
      await client.callTool({ name: "missing_tool", arguments: { guessed: true } });
    } finally {
      await close();
    }

    expect(recorded.map((entry) => entry.tool)).toEqual([
      "schema",
      "describe_tool",
      "custom_future_tool",
      "missing_tool",
    ]);
    expect(recorded.slice(0, 3).every((entry) => entry.outcome === "ok")).toBe(true);
    expect(recorded[3]).toMatchObject({
      failureClass: "contract",
      unknownToolName: "missing_tool",
      paramNamesPresent: ["guessed"],
    });
  });

  it("observes handler validation failures and stores only argument names", async () => {
    const recorded: InvocationTelemetryEntry[] = [];
    const recorder: InvocationTelemetryRecorder = {
      record: async (entry) => {
        recorded.push(entry);
      },
    };
    const tool: DysflowMcpTool = {
      name: "query_execute",
      description: "reject",
      handler: async () => ({
        content: [{ type: "text", text: "MCP_INPUT_INVALID" }],
        isError: true,
        ok: false,
        error: {
          code: "MCP_INPUT_INVALID",
          message: "mode is required",
          rejectedFlag: "mode",
        },
      }),
    };
    const { client, close } = await harness([tool], recorder);
    try {
      await client.callTool({
        name: "query_execute",
        arguments: {
          password: "never-log-me",
          sql: "SELECT secret FROM private",
          sourcePath: "C:/private.accdb",
        },
      });
    } finally {
      await close();
    }

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      tool: "query_execute",
      failureClass: "contract",
      rejectedParams: ["mode"],
      paramNamesPresent: ["password", "sourcePath", "sql"],
    });
    expect(JSON.stringify(recorded[0])).not.toMatch(/never-log-me|SELECT secret|private\.accdb/);
  });

  it("uses the per-call project context for the sink and write policy", async () => {
    const fallback: InvocationTelemetryEntry[] = [];
    const projectA: InvocationTelemetryEntry[] = [];
    const projectB: InvocationTelemetryEntry[] = [];
    const recorder = (entries: InvocationTelemetryEntry[]): InvocationTelemetryRecorder => ({
      record: async (entry) => {
        entries.push(entry);
      },
    });
    const tools: DysflowMcpTool[] = ["import_modules"].map((name) => ({
      name,
      description: name,
      handler: async () => ({
        content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }],
        isError: false,
        ok: true,
      }),
    }));
    const { client, close } = await harness(tools, recorder(fallback), async (args) => {
      const projectId =
        args !== null && typeof args === "object"
          ? (args as Record<string, unknown>).projectId
          : undefined;
      return projectId === "a"
        ? { recorder: recorder(projectA), writeExecutionPolicy: "developer" }
        : { recorder: recorder(projectB), writeExecutionPolicy: "safe-by-default" };
    });
    try {
      await client.callTool({ name: "import_modules", arguments: { projectId: "a" } });
      await client.callTool({ name: "import_modules", arguments: { projectId: "b" } });
    } finally {
      await close();
    }

    expect(fallback).toEqual([]);
    expect(projectA).toHaveLength(1);
    expect(projectA[0]?.writeIntent).toBe("apply");
    expect(projectB).toHaveLength(1);
    expect(projectB[0]?.writeIntent).toBe("dryRun");
  });
});
