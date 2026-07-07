/**
 * PR-1 (issue #762, v1.20.0) — integration tests for the `humanCompileReminder`
 * surface emitted in tool results.
 *
 * The reminder is added at the MCP dispatch layer (`dispatch-factory.ts`)
 * for the vba-sync tool family: `import_modules`, `import_all`,
 * `delete_module`, `test_vba`. The recording side (when persistence happens,
 * the state is updated) lives in the vba-modules adapter. These tests
 * exercise the FULL path:
 *
 *   createDispatchTool(...) → handler(input) → McpToolResult
 *
 * with a fake `vbaSyncToolService` that returns deterministic success. No
 * MSACCESS, no PowerShell — pure adapter-level wiring.
 *
 * Note on `run_vba` / `dysflow_vba_execute`: those go through
 * `alias-tools.ts` and `tools.ts` respectively, NOT through
 * `dispatch-factory.ts`. They share the same `translateCoreResultToMcpContent`
 * translation surface, but they are tested separately. This file focuses on
 * the dispatch-factory path which covers the bulk of the vba-sync family.
 *
 * TDD discipline:
 *   - Fixture gate: every test clears the human-compile state via
 *     `clearHumanCompileState(accessPath)` so atoms cannot leak into each
 *     other.
 *   - Refactor-safety: assertions are on the OUTCOME field
 *     (`humanCompileReminder` presence / absence / value), not on internal
 *     helper calls.
 *   - Three paths per slice: happy + sad + edge.
 */
import { describe, expect, it } from "vitest";
import { createDispatchTool } from "../../../src/adapters/mcp/dispatch-factory";
import {
  clearHumanCompileState,
  isHumanCompilePending,
  recordPersistence,
  recordVerifyFail,
  recordVerifyOk,
} from "../../../src/core/runtime/human-compile-state";
import { successResult } from "../../../src/core/contracts/index";
import type { OperationResult } from "../../../src/core/contracts/index";
import type { VbaSyncPort } from "../../../src/core/contracts/index";
import type { DysflowMcpServices } from "../../../src/adapters/mcp/result-translation";

const ACCESS_PATH_A = "C:/repo/hcr/projA/front.accdb";
const ACCESS_PATH_B = "C:/repo/hcr/projB/front.accdb";

/**
 * Build a `DysflowMcpServices` whose vbaSyncToolService is a fake executor.
 * The fake returns the supplied `data` shape wrapped in successResult. Any
 * tool that lands on the vba-sync route (import_modules, import_all,
 * delete_module, run_vba, test_vba, verify_code, ...) gets this same data.
 */
function makeServicesWithFakeSync(fakeData: unknown): DysflowMcpServices & {
  vbaSyncToolService: VbaSyncPort;
} {
  const vbaSyncToolService: VbaSyncPort = {
    async execute(_toolName: string, _input: unknown): Promise<OperationResult<unknown>> {
      return successResult(fakeData);
    },
  };
  return {
    vbaService: { async execute() { return successResult({ returnValue: "ok" }); } },
    queryService: { async execute() { return successResult({ rows: [] }); } },
    diagnosticsService: { async run() { return successResult({ checks: [] }); } },
    vbaSyncToolService,
  };
}

function parseHandlerContent<T = unknown>(
  content: readonly { type: "text"; text: string }[],
): T {
  const first = content[0];
  if (first === undefined) throw new Error("handler returned no content");
  return JSON.parse(first.text) as T;
}

/**
 * Cleanup helper to be called at the end of every test so state does not
 * leak into sibling tests.
 */
function resetState(...paths: string[]): void {
  for (const p of paths) clearHumanCompileState(p);
}

describe("humanCompileReminder (#762) — emitted on vba-sync tool results", () => {
  it("happy: dysflow_import_modules (real, no prior verify_code) emits humanCompileReminder with the persistence timestamp", async () => {
    clearHumanCompileState(ACCESS_PATH_A);
    recordPersistence(ACCESS_PATH_A);

    const services = makeServicesWithFakeSync({ imported: ["Module_A"] });
    const tool = createDispatchTool("import_modules", services, true, undefined, {});

    const result = await tool.handler({
      accessPath: ACCESS_PATH_A,
      moduleNames: ["Module_A"],
      dryRun: false,
    });

    expect(result.isError).toBe(false);
    expect(result.ok).toBe(true);
    const data = parseHandlerContent<Record<string, unknown>>(result.content);
    expect(typeof data.humanCompileReminder).toBe("string");
    expect(data.humanCompileReminder as string).toMatch(/compile/i);
    // The reminder must reference an ISO timestamp placeholder — the implementation
    // substitutes the actual `lastPersistenceAt` for the consumer.
    expect(data.humanCompileReminder as string).toMatch(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );

    resetState(ACCESS_PATH_A);
  });

  it("happy 2: dysflow_import_modules + dysflow_verify_code(ok) → subsequent dysflow_test_vba has NO humanCompileReminder", async () => {
    clearHumanCompileState(ACCESS_PATH_A);
    recordPersistence(ACCESS_PATH_A);
    recordVerifyOk(ACCESS_PATH_A);

    const services = makeServicesWithFakeSync([{ ok: true, procedure: "Test_A" }]);
    const tool = createDispatchTool("test_vba", services, true, undefined, {});

    const result = await tool.handler({
      accessPath: ACCESS_PATH_A,
      proceduresJson: JSON.stringify([{ procedure: "Test_A", args: [] }]),
    });

    expect(result.isError).toBe(false);
    expect(result.ok).toBe(true);
    const data = parseHandlerContent<Record<string, unknown>>(result.content);
    // After a successful verify, the reminder must NOT appear in the result.
    expect(data.humanCompileReminder).toBeUndefined();

    resetState(ACCESS_PATH_A);
  });

  it("sad: dysflow_test_vba after a FAILED verify still surfaces humanCompileReminder (failed verify does NOT clear the flag)", async () => {
    clearHumanCompileState(ACCESS_PATH_A);
    recordPersistence(ACCESS_PATH_A);
    // The recording is conservative: a failed verify means the user has NOT
    // confirmed the binary state, so the reminder stays visible.
    recordVerifyFail(ACCESS_PATH_A);

    // Sanity check: the state is still pending.
    expect(isHumanCompilePending(ACCESS_PATH_A)).toBe(true);

    const services = makeServicesWithFakeSync([{ ok: true, procedure: "Test_X" }]);
    const tool = createDispatchTool("test_vba", services, true, undefined, {});

    const result = await tool.handler({
      accessPath: ACCESS_PATH_A,
      proceduresJson: JSON.stringify([{ procedure: "Test_X", args: [] }]),
    });

    expect(result.isError).toBe(false);
    expect(result.ok).toBe(true);
    const data = parseHandlerContent<Record<string, unknown>>(result.content);
    expect(typeof data.humanCompileReminder).toBe("string");

    resetState(ACCESS_PATH_A);
  });

  it("edge: state for a different accessPath does not affect this project's reminder", async () => {
    // Project A has pending persistence → reminder.
    // Project B has no recorded events → no reminder.
    clearHumanCompileState(ACCESS_PATH_A);
    clearHumanCompileState(ACCESS_PATH_B);
    recordPersistence(ACCESS_PATH_A);

    const servicesA = makeServicesWithFakeSync({ imported: ["X"] });
    const toolA = createDispatchTool("import_modules", servicesA, true, undefined, {});
    const resultA = await toolA.handler({
      accessPath: ACCESS_PATH_A,
      moduleNames: ["X"],
      dryRun: false,
    });
    const dataA = parseHandlerContent<Record<string, unknown>>(resultA.content);
    expect(typeof dataA.humanCompileReminder).toBe("string");

    const servicesB = makeServicesWithFakeSync({ imported: ["Y"] });
    const toolB = createDispatchTool("import_modules", servicesB, true, undefined, {});
    const resultB = await toolB.handler({
      accessPath: ACCESS_PATH_B,
      moduleNames: ["Y"],
      dryRun: false,
    });
    const dataB = parseHandlerContent<Record<string, unknown>>(resultB.content);
    expect(dataB.humanCompileReminder).toBeUndefined();

    resetState(ACCESS_PATH_A, ACCESS_PATH_B);
  });

  it("edge: a non-reminder vba-sync tool (e.g. export_modules) does NOT emit the reminder", async () => {
    // export_modules does not mutate the binary; it is NOT in the reminder
    // surface. The dispatch layer MUST NOT add the field to its result.
    clearHumanCompileState(ACCESS_PATH_A);
    recordPersistence(ACCESS_PATH_A);

    const services = makeServicesWithFakeSync({ exported: ["Module_X"] });
    const tool = createDispatchTool("export_modules", services, true, undefined, {});

    const result = await tool.handler({
      accessPath: ACCESS_PATH_A,
      moduleNames: ["Module_X"],
    });

    expect(result.isError).toBe(false);
    expect(result.ok).toBe(true);
    const data = parseHandlerContent<Record<string, unknown>>(result.content);
    expect(data.humanCompileReminder).toBeUndefined();

    resetState(ACCESS_PATH_A);
  });

  it("edge: errored tool result does NOT carry humanCompileReminder (failures skip the field)", async () => {
    // When the underlying vbaSyncToolService returns a failure, the
    // dispatcher propagates that error envelope. The reminder is an
    // outcome field on the success path — it must not be grafted onto
    // a failure response.
    clearHumanCompileState(ACCESS_PATH_A);
    recordPersistence(ACCESS_PATH_A);

    const services = makeServicesWithFakeSync({ unused: true });
    services.vbaSyncToolService.execute = async () =>
      // biome-ignore lint/suspicious/noExplicitAny: failure envelope shape
      ({
        ok: false,
        error: { code: "TEST_ERROR", message: "deliberate" },
        diagnostics: [],
        durationMs: 0,
      } as any);
    const tool = createDispatchTool("import_modules", services, true, undefined, {});

    const result = await tool.handler({
      accessPath: ACCESS_PATH_A,
      moduleNames: ["X"],
      dryRun: false,
    });

    expect(result.isError).toBe(true);
    expect(result.ok).toBe(false);
    // The error envelope is `<CODE>: <message>`; it must NOT contain the
    // reminder text — the reminder is only on success paths.
    const first = result.content[0];
    if (first === undefined) throw new Error("handler returned no content");
    expect(first.text).not.toContain("humanCompileReminder");
    expect(first.text).not.toMatch(/Dysflow did not compile/);

    resetState(ACCESS_PATH_A);
  });
});