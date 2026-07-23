/**
 * Issue #1057 (Round-15 F5 + F6) — on-demand per-tool introspection.
 *
 * F5: a `describe_tool({ name })` MCP tool returns the full contract for
 * one tool (description + params + returns + errorCodes + useCases)
 * without the consumer having to fetch the whole `schema` catalog or
 * probe params by trial and error.
 *
 * F6: `useCases` documents WHEN to reach for a tool (e.g.
 * `vba_orphan_audit` for "find test procedures registered in the binary
 * but missing from source"), so capabilities discovery stops depending
 * on out-of-band skill docs.
 */

import { describe, expect, it } from "vitest";
import { createDescribeToolTool } from "../../../src/adapters/mcp/schema-tool";

async function callDescribe(input: unknown) {
  const tool = createDescribeToolTool();
  const result = await tool.handler(input);
  const text = result.content[0]?.text ?? "";
  const parsed = (() => {
    try {
      return JSON.parse(text.replace(/^[A-Z_]+: /, "")) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  })();
  return { result, parsed, text };
}

describe("describe_tool (#1057 F5)", () => {
  it("returns description + params for delete_module", async () => {
    const { result, parsed } = await callDescribe({ name: "delete_module" });
    expect(result.isError).toBe(false);
    expect(parsed?.description).toMatch(/delete/i);
    expect(parsed?.params).toBeDefined();
    const params = parsed?.params as Record<string, { type: string; required: boolean }>;
    expect(params.moduleName).toMatchObject({ type: "string" });
  });

  it("accepts toolName as an alias of name", async () => {
    const { result, parsed } = await callDescribe({ toolName: "verify_code" });
    expect(result.isError).toBe(false);
    expect(parsed?.name).toBe("verify_code");
  });

  it("rejects an unknown tool with a typed error", async () => {
    const { result, text } = await callDescribe({ name: "no_such_tool" });
    expect(result.isError).toBe(true);
    expect(text).toMatch(/TOOL_NOT_FOUND|not found|unknown/i);
  });

  it("rejects a missing name with MCP_INPUT_INVALID", async () => {
    const { result, text } = await callDescribe({});
    expect(result.isError).toBe(true);
    expect(text).toMatch(/MCP_INPUT_INVALID/);
    expect(text).toMatch(/name/);
  });
});

describe("useCases metadata (#1057 F6)", () => {
  it("describe_tool surfaces useCases for discovery-relevant tools", async () => {
    for (const name of [
      "vba_orphan_audit",
      "detect_dead_code",
      "compare_backends",
      "access_force_cleanup_orphaned",
    ]) {
      const { parsed } = await callDescribe({ name });
      const useCases = parsed?.useCases as string[] | undefined;
      expect(Array.isArray(useCases), `${name} useCases must be an array`).toBe(true);
      expect(useCases?.length, `${name} must document at least one use case`).toBeGreaterThan(0);
    }
  });

  it("every described tool carries a useCases array (possibly empty)", async () => {
    const { parsed } = await callDescribe({ name: "exists" });
    expect(Array.isArray(parsed?.useCases)).toBe(true);
  });
});
