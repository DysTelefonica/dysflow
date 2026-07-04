import { describe, expect, it, vi } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

/**
 * Phase 3 (issue #705 — `detect-dead-code`): the handler MUST be a pure
 * string-in / string-out call. It MUST NOT open Access, MUST NOT spawn
 * PowerShell, MUST NOT call into `services.vbaSyncToolService`, and MUST
 * NOT mutate the filesystem. The handler is the modern MCP counterpart
 * to the pure `detectDeadCode` core function — it never touches the binary
 * or any FS path, so there is no need to mock `findVbaReferences`.
 */

function makeBaseServices(): DysflowMcpServices {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
    // Track calls — the handler MUST NOT invoke `vbaSyncToolService.execute` because
    // that path opens Access via the runner.
    vbaSyncToolService: {
      execute: vi.fn(async () => successResult({ returnValue: "should-not-be-called" })),
    },
  };
}

describe("dysflow_detect_dead_code — handler never opens Access (#705)", () => {
  it("does not invoke vbaSyncToolService.execute and reports a non-empty findings list", async () => {
    const services = makeBaseServices();
    const tools = createDysflowMcpTools(services);
    const tool = tools.find((t) => t.name === "dysflow_detect_dead_code");
    expect(tool).toBeDefined();

    const result = await tool?.handler({
      scope: "binary",
      modules: {
        ModA: ["Option Explicit", "", "Private Sub UnusedProc()", "End Sub"].join("\r\n"),
      },
    });

    // No Access / PowerShell / FS path touched — the vbaSyncToolService.execute
    // spy must remain uncalled.
    expect(services.vbaSyncToolService?.execute).not.toHaveBeenCalled();

    expect(result?.isError).toBe(false);
    expect(result?.ok).toBe(true);
    const text = result?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text) as { findings: unknown[] };
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThan(0);
  });
});
