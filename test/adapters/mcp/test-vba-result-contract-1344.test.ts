import { describe, expect, it, vi } from "vitest";
import { validateToolResult } from "../../../src/adapters/mcp/contracts/result-validation.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import {
  VbaExecutionAdapter,
  type VbaSyncOrchestrator,
} from "../../../src/adapters/vba-sync/vba-execution-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";

const ALLOWED_PROCEDURES = ["Test_One", "Test_Two"] as const;

function createTestVbaTool(rawRunnerData: unknown) {
  const executeMappedTool = vi.fn().mockResolvedValue(successResult(rawRunnerData));
  const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
  const adapter = new VbaExecutionAdapter(orchestrator, undefined, ALLOWED_PROCEDURES);
  const tools = createDysflowMcpTools({
    services: {
      vbaService: {
        async execute() {
          return successResult({ returnValue: "unused" });
        },
      },
      queryService: {
        async execute() {
          return successResult({ rows: [] });
        },
      },
      diagnosticsService: {
        async run() {
          return successResult({ checks: [] });
        },
      },
      vbaSyncToolService: {
        execute(name: string, input: Record<string, unknown>) {
          return adapter.execute(name, input);
        },
      },
    },
    writes: true,
    writeExecutionPolicy: "developer",
  });
  const tool = tools.find((candidate) => candidate.name === "test_vba");
  if (tool === undefined) throw new Error("test_vba not registered");
  if (tool.resultContract === undefined) throw new Error("test_vba result contract missing");
  return { ...tool, resultContract: tool.resultContract };
}

function payloadFrom(result: Awaited<ReturnType<ReturnType<typeof createTestVbaTool>["handler"]>>) {
  const text = result.content[0]?.text;
  if (text === undefined) throw new Error("test_vba returned no text content");
  return JSON.parse(text) as unknown;
}

describe("test_vba apply result contract — #1344", () => {
  it.each([
    {
      label: "singleton",
      raw: {
        ok: true,
        procedure: "Test_One",
        argsCount: 0,
        returnValue: true,
        returnType: "Boolean",
        byref_values: {},
        payload: { passed: true },
        logs: ["one"],
        error: null,
        durationMs: 5,
      },
      procedures: ["Test_One"],
    },
    {
      label: "array",
      raw: [
        {
          ok: true,
          procedure: "Test_One",
          argsCount: 0,
          returnValue: true,
          returnType: "Boolean",
          byref_values: {},
          payload: { index: 1 },
          logs: ["one"],
          error: null,
          durationMs: 5,
        },
        {
          ok: true,
          procedure: "Test_Two",
          argsCount: 1,
          returnValue: "ok",
          returnType: "String",
          byref_values: { 0: "changed" },
          payload: { index: 2 },
          logs: ["two"],
          error: null,
          durationMs: 8,
        },
      ],
      procedures: ["Test_One", "Test_Two"],
    },
  ])("translates and validates the $label runner shape through the real MCP handler", async ({
    raw,
    procedures,
  }) => {
    const tool = createTestVbaTool(raw);
    const result = await tool.handler({
      proceduresJson: JSON.stringify(procedures.map((procedure) => ({ procedure, args: [] }))),
      apply: true,
    });
    const payload = payloadFrom(result);

    expect(result.isError).toBe(false);
    expect(
      validateToolResult({
        toolName: tool.name,
        contract: tool.resultContract,
        payload,
        policy: "enforce",
      }),
    ).toEqual({ ok: true });
    expect(payload).toEqual({
      mode: "apply",
      passed: procedures.length,
      failed: 0,
      tests: Array.isArray(raw) ? raw : [raw],
    });
  });
});
