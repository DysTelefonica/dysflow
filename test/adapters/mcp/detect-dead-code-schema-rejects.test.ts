import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

/**
 * Phase 3 (issue #705 — `detect-dead-code`): the input schema for
 * `detect_dead_code` MUST reject unknown properties (`additionalProperties:
 * false`) and bad scope values so the runtime can refuse ill-formed calls
 * without invoking the handler.
 *
 * This test exercises the schema indirectly through the tool handler — the
 * `validateInput` helper used by every other modern tool returns the
 * INVALID_INPUT envelope before the handler runs.
 */

function makeBaseServices(): DysflowMcpServices {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
}

describe("detect_dead_code — input schema rejects bad input (#705)", () => {
  it("returns isError:true (MCP_INPUT_INVALID) when scope is not in the enum", async () => {
    const tools = createDysflowMcpTools(makeBaseServices());
    const tool = tools.find((t) => t.name === "detect_dead_code");
    expect(tool).toBeDefined();

    const result = await tool?.handler({
      scope: "bogus",
      modules: { ModA: "Public Sub A(): End Sub\r\n" },
    });

    expect(result?.isError).toBe(true);
    expect(result?.ok).toBe(false);
    const text = result?.content?.[0]?.text ?? "";
    expect(text).toMatch(/MCP_INPUT_INVALID|INVALID_INPUT/);
  });

  it("returns isError:true when unknown extra fields are present (additionalProperties:false)", async () => {
    const tools = createDysflowMcpTools(makeBaseServices());
    const tool = tools.find((t) => t.name === "detect_dead_code");
    expect(tool).toBeDefined();

    const result = await tool?.handler({
      scope: "binary",
      modules: { ModA: "Public Sub A(): End Sub\r\n" },
      extraNotInSchema: 1,
    });

    expect(result?.isError).toBe(true);
    expect(result?.ok).toBe(false);
    const text = result?.content?.[0]?.text ?? "";
    expect(text).toMatch(/MCP_INPUT_INVALID|INVALID_INPUT/);
  });

  // Fix #2 — `modules` is optional in the schema. The handler MUST
  // attempt the project-source-tree fallback when the caller omits
  // `modules`, and return `MODULE_NOT_FOUND` when neither the inline
  // map nor the fallback can resolve any source. Without this, the
  // schema's `required: ["modules"]` gate would shadow the documented
  // fallback and make the handler unreachable.
  it("accepts input without inline modules and returns MODULE_NOT_FOUND when the fallback cannot resolve anything", async () => {
    const tools = createDysflowMcpTools(makeBaseServices());
    const tool = tools.find((t) => t.name === "detect_dead_code");
    expect(tool).toBeDefined();

    const result = await tool?.handler({
      scope: "binary",
    });

    // No modules provided inline AND no access context resolver was wired
    // → the fallback returns undefined → handler translates to MODULE_NOT_FOUND.
    expect(result?.isError).toBe(true);
    expect(result?.ok).toBe(false);
    const text = result?.content?.[0]?.text ?? "";
    expect(text).toMatch(/MODULE_NOT_FOUND/);
  });

  it("accepts input without inline modules but with destinationRoot mismatch — also MODULE_NOT_FOUND", async () => {
    const tools = createDysflowMcpTools(makeBaseServices());
    const tool = tools.find((t) => t.name === "detect_dead_code");
    expect(tool).toBeDefined();

    const result = await tool?.handler({
      scope: "binary",
      destinationRoot: "C:/unrelated/path/that/does/not/match",
    });

    expect(result?.isError).toBe(true);
    expect(result?.ok).toBe(false);
    const text = result?.content?.[0]?.text ?? "";
    expect(text).toMatch(/MODULE_NOT_FOUND/);
  });
});
