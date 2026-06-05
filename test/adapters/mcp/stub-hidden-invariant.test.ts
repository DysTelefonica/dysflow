/**
 * Invariant test: stub/hidden state MUST have exactly one source of truth.
 *
 * The parity registry (`tool-parity-registry.ts`) is that source. The set of
 * tools marked `status: "pending"` MUST equal the set of tools that dispatch
 * marks `hidden: true` in the registered tool list, and MUST equal the result
 * of `isHiddenStubTool` / `pendingToolNames()`.
 *
 * This test locks the invariant established by #433 so the two lists can never
 * silently diverge again. It works at the public port (registered tool objects
 * + exported registry helpers), not at implementation internals.
 */
import { describe, expect, it } from "vitest";
import {
  isHiddenStubTool,
  pendingToolNames,
  TOOL_PARITY_REGISTRY,
} from "../../../src/adapters/mcp/tool-parity-registry";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

describe("stub/hidden invariant — registry is the single source of truth (#433)", () => {
  const services = {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };

  it("pendingToolNames() returns only verify_binary and reconcile_binary", () => {
    const pending = pendingToolNames();
    expect(pending.size).toBe(2);
    expect(pending.has("verify_binary")).toBe(true);
    expect(pending.has("reconcile_binary")).toBe(true);
  });

  it("isHiddenStubTool matches pendingToolNames for every tool", () => {
    const pending = pendingToolNames();
    for (const entry of TOOL_PARITY_REGISTRY) {
      expect(isHiddenStubTool(entry.name)).toBe(pending.has(entry.name));
    }
  });

  it("dispatch hidden flags equal the registry pending set — no manual list can diverge", () => {
    const tools = createDysflowMcpTools(services, true);
    const pending = pendingToolNames();

    // Every tool the registry marks pending MUST be hidden in the registered list.
    for (const name of pending) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `${name} must be registered`).toBeDefined();
      expect(tool?.hidden, `${name} must be hidden (registry says pending)`).toBe(true);
    }

    // Every hidden tool in the registered list MUST be pending in the registry.
    const hiddenInDispatch = tools.filter((t) => t.hidden === true).map((t) => t.name);

    expect(hiddenInDispatch.sort()).toEqual([...pending].sort());
  });

  it("direct stub call still returns TOOL_NOT_IMPLEMENTED when vbaSyncToolService is configured", async () => {
    const stubCalls: string[] = [];
    const tools = createDysflowMcpTools(
      {
        ...services,
        vbaSyncToolService: {
          execute: async (toolName) => {
            stubCalls.push(toolName);
            return {
              ok: false,
              error: {
                code: "TOOL_NOT_IMPLEMENTED" as const,
                message: "not implemented",
                retryable: false,
              },
              diagnostics: [],
              durationMs: 0,
            };
          },
        },
      },
      true,
    );

    for (const name of pendingToolNames()) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `${name} must still be registered for direct calls`).toBeDefined();
      const result = await tool?.handler({});
      expect(result?.isError, `${name} direct call must return an error`).toBe(true);
    }
  });
});
