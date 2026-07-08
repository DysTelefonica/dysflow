/**
 * Regression guard for issue #644 — runtime-guard regression at the MCP
 * dispatch layer.
 *
 * The previous unit-test coverage at
 * `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts` exercises
 * `VbaModulesAdapter.execute` directly with mocked orchestrator dependencies.
 * That pin is necessary but NOT sufficient: a regression in the MCP dispatch
 * chain (schema validation stripping `exportPath`, the dispatch handler
 * dropping it, or a transform between SDK input and adapter `params`) would
 * not surface in that unit test, but would surface in the E2E at
 * `test/e2e/runtime-guard-mcp-integration.e2e.test.ts:309-331` — and that E2E
 * is expensive (Access/COM available, singleFork, long timeouts).
 *
 * This test goes through the SAME dispatch path the E2E does — schema
 * validation, dispatch factory handler, `services.vbaSyncToolService.execute`,
 * and the real `VbaModulesAdapter.execute` — minus the SDK transport layer.
 * That keeps it cheap (no InMemoryTransport, no Access COM) while still
 * catching every regression between MCP input and adapter `params`.
 *
 * The fixture mirrors the E2E harness at lines 80-101: the orchestrator
 * returns a runtime `destinationRoot` (simulating misconfigured project
 * config / MCP context defaults), the user passes a SAFE `exportPath`, and
 * the runtime guard MUST NOT fire. Pre-#644 this test was RED because the
 * F1 destinationRoot guard (#619) fired even when the user had supplied an
 * explicit, safe `exportPath`.
 */

import { describe, expect, it, vi } from "vitest";
import type { DysflowMcpTool, McpToolResult } from "../../../src/adapters/mcp/tools.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import type { VbaModulesExecutionTarget } from "../../../src/adapters/vba-sync/vba-modules-adapter.js";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter.js";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import { successResult } from "../../../src/core/contracts/index.js";

const RUNTIME_HOME = "C:/runtime/dysflow";
const RUNTIME_APP = "C:/runtime/dysflow/app/scripts";
const SAFE_EXPORT_PATH = "C:/projects/myapp/src";
const RUNTIME_ENV = { DYSFLOW_HOME: RUNTIME_HOME } as unknown as Record<string, string | undefined>;

type Harness = {
  executeMappedTool: ReturnType<typeof vi.fn>;
  vbaSyncToolService: {
    execute: ReturnType<typeof vi.fn>;
  };
  resolveExecutionTarget: ReturnType<typeof vi.fn>;
  tools: DysflowMcpTool[];
};

function makeHarness(): Harness {
  // PowerShell executor MUST NOT be invoked for the safe-exportPath case —
  // the guard is supposed to trust the user's explicit override and let the
  // request flow through to the runner. The dispatch path here routes through
  // `orchestrator.executeMappedTool` after the F1 guard, so we stub that
  // hook to a benign success — never the PowerShell executor itself.
  const resolveExecutionTarget = vi.fn(
    async (): Promise<OperationResult<VbaModulesExecutionTarget>> =>
      successResult<VbaModulesExecutionTarget>({
        accessDbPath: "C:/projects/myapp/MyApp.accdb",
        backendPath: "C:/projects/myapp/MyApp_be.accdb",
        destinationRoot: RUNTIME_APP,
        projectRoot: RUNTIME_APP,
        projectId: "test-project",
        configSource: "explicit-request",
      }),
  );
  const executeMappedTool = vi.fn(async () => successResult({ ok: true }));
  const validateStrictContext = vi.fn(() => successResult<undefined>(undefined));
  const runPreflightCleanup = vi.fn();

  const adapter = new VbaModulesAdapter({
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    cwd: RUNTIME_HOME,
    env: RUNTIME_ENV,
    executeMappedTool,
    resolveExecutionTarget,
    validateStrictContext,
    runPreflightCleanup,
    executor: vi.fn(),
  });

  // Wire vbaSyncToolService through the real adapter — the same shape the
  // E2E harness uses. This is what the dispatch factory's `case "vba-sync"`
  // branch calls.
  const vbaSyncToolService = {
    execute: vi.fn(
      async (toolName: string, input: unknown): Promise<OperationResult<unknown>> =>
        adapter.execute(toolName, (input ?? {}) as Record<string, unknown>),
    ),
  };

  const services = {
    vbaService: { execute: vi.fn() },
    queryService: { execute: vi.fn() },
    diagnosticsService: { run: vi.fn() },
    vbaSyncToolService,
  };
  // writesEnabled=true because the runtime guard should fire (or NOT fire)
  // BEFORE the write-gate; this proves the isWithinRuntime check is the one
  // making the decision, not MCP_WRITES_DISABLED.
  const tools = createDysflowMcpTools({
    services: services,
    writes: true,
  });

  return { executeMappedTool, vbaSyncToolService, resolveExecutionTarget, tools };
}

function toolByName(tools: DysflowMcpTool[], name: string): DysflowMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

describe("Issue #644 — runtime guard allow-case: exportPath safe path through MCP dispatch (cheap regression)", () => {
  it("export_modules dispatch handler forwards exportPath to the adapter and does NOT trigger INVALID_INPUT (#644)", async () => {
    const { tools, vbaSyncToolService, executeMappedTool, resolveExecutionTarget } = makeHarness();
    const tool = toolByName(tools, "export_modules");

    // The dispatch-factory's handler is `async (input) => {...}` — call it
    // with the MCP-shape input. This goes through validateInput(schema) →
    // services.vbaSyncToolService.execute → adapter.execute. The cheap unit
    // layer that previously bypassed MCP stops at adapter.execute.
    const result = (await tool.handler({
      exportPath: SAFE_EXPORT_PATH,
      moduleNames: ["Module1"],
    })) as McpToolResult;

    // Contract: the dispatch handler returned success (or a non-guard
    // downstream failure). The runtime guard's specific rejection must NOT
    // fire.
    expect(result.isError).toBe(false);
    const text = result.content[0]?.text ?? "";
    expect(text).not.toMatch(/INVALID_INPUT/);
    expect(text).not.toMatch(/production runtime|inside the runtime/i);

    // The dispatch chain reached vbaSyncToolService → adapter →
    // executeMappedTool. Pin both: the service received the exportPath
    // forward (no schema stripping / dispatch transform dropped the field),
    // and the adapter reached the runner (the guard did NOT block the safe
    // exportPath).
    expect(vbaSyncToolService.execute).toHaveBeenCalledWith(
      "export_modules",
      expect.objectContaining({ exportPath: SAFE_EXPORT_PATH, moduleNames: ["Module1"] }),
    );
    expect(resolveExecutionTarget).toHaveBeenCalled();
    expect(executeMappedTool).toHaveBeenCalled();
  });

  it("export_all dispatch handler forwards exportPath to the adapter and does NOT trigger INVALID_INPUT (#644)", async () => {
    const { tools, vbaSyncToolService, executeMappedTool, resolveExecutionTarget } = makeHarness();
    const tool = toolByName(tools, "export_all");

    const result = (await tool.handler({
      exportPath: SAFE_EXPORT_PATH,
    })) as McpToolResult;

    expect(result.isError).toBe(false);
    const text = result.content[0]?.text ?? "";
    expect(text).not.toMatch(/INVALID_INPUT/);
    expect(text).not.toMatch(/production runtime|inside the runtime/i);

    expect(vbaSyncToolService.execute).toHaveBeenCalledWith(
      "export_all",
      expect.objectContaining({ exportPath: SAFE_EXPORT_PATH }),
    );
    expect(resolveExecutionTarget).toHaveBeenCalled();
    expect(executeMappedTool).toHaveBeenCalled();
  });

  it("export_modules dispatch handler refuses exportPath INSIDE the runtime with INVALID_INPUT (#574 / #644 parity)", async () => {
    // Companion test: pin the SAME dispatch path's negative case. The MCP
    // exportPath guard (#574) must STILL fire when the user passes an
    // exportPath inside the runtime, even if the orchestrator would have
    // resolved a safe destinationRoot. Without this companion test, a
    // future regression that disables the exportPath guard could go
    // unnoticed because the safe-path tests would still pass.
    const { tools, executeMappedTool } = makeHarness();
    const tool = toolByName(tools, "export_modules");

    const result = (await tool.handler({
      exportPath: RUNTIME_APP,
      moduleNames: ["Module1"],
    })) as McpToolResult;

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/INVALID_INPUT/);
    expect(text).toMatch(/production runtime|inside the runtime/i);
    expect(executeMappedTool).not.toHaveBeenCalled();
  });
});
