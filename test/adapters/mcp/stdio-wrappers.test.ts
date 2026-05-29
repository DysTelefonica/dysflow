import { describe, expect, it } from "vitest";
import type { DysflowMcpTool } from "../../../src/adapters/mcp/tools";
import {
  buildHiddenToolRegistry,
  wrapWithErrorAbsorber,
  wrapWithSanitizer,
} from "../../../src/adapters/mcp/stdio-wrappers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(overrides: Partial<DysflowMcpTool> = {}): DysflowMcpTool {
  return {
    name: "test_tool",
    description: "A test tool",
    handler: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// wrapWithErrorAbsorber
// ---------------------------------------------------------------------------

describe("wrapWithErrorAbsorber", () => {
  it("catches a thrown Error and returns isError result with MCP_TOOL_ERROR prefix", async () => {
    const handler = wrapWithErrorAbsorber(async () => {
      throw new Error("something went wrong");
    });

    const result = await handler(undefined, undefined);

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "MCP_TOOL_ERROR: something went wrong",
    });
  });

  it("catches a thrown non-Error string and returns isError result", async () => {
    const handler = wrapWithErrorAbsorber(async () => {
      // eslint-disable-next-line no-throw-literal
      throw "a raw string error";
    });

    const result = await handler(undefined, undefined);

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "MCP_TOOL_ERROR: a raw string error",
    });
  });

  it("passes through a successful result unchanged", async () => {
    const successResult = { content: [{ type: "text" as const, text: "all good" }], isError: false };
    const handler = wrapWithErrorAbsorber(async () => successResult);

    const result = await handler(undefined, undefined);

    expect(result).toEqual(successResult);
  });

  it("passes through an isError:true result without double-wrapping", async () => {
    const errorResult = {
      content: [{ type: "text" as const, text: "MCP_TOOL_ERROR: already an error" }],
      isError: true,
    };
    const handler = wrapWithErrorAbsorber(async () => errorResult);

    const result = await handler(undefined, undefined);

    expect(result).toEqual(errorResult);
  });
});

// ---------------------------------------------------------------------------
// wrapWithSanitizer
// ---------------------------------------------------------------------------

describe("wrapWithSanitizer", () => {
  it("scrubs a Windows path from an isError:true result text", async () => {
    const windowsPath = "C:\\Users\\alice\\project\\front.accdb";
    const handler = wrapWithSanitizer(async () => ({
      content: [{ type: "text" as const, text: `failed at ${windowsPath}` }],
      isError: true,
    }));

    const result = await handler(undefined, undefined);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[PATH]");
    expect(result.content[0]?.text).not.toContain("C:\\Users\\alice");
  });

  it("scrubs a UNC path from an isError:true result text", async () => {
    const uncPath = "\\\\server\\share\\data.mdb";
    const handler = wrapWithSanitizer(async () => ({
      content: [{ type: "text" as const, text: `open failed: ${uncPath}` }],
      isError: true,
    }));

    const result = await handler(undefined, undefined);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[PATH]");
    expect(result.content[0]?.text).not.toContain("\\\\server");
  });

  it("passes through an isError:false result unchanged", async () => {
    const successResult = {
      content: [{ type: "text" as const, text: "C:\\some\\path.accdb all good" }],
      isError: false,
    };
    const handler = wrapWithSanitizer(async () => successResult);

    const result = await handler(undefined, undefined);

    // sanitizer must NOT touch non-error results
    expect(result).toEqual(successResult);
  });

  it("passes through isError:true result with no paths unchanged", async () => {
    const noPathResult = {
      content: [{ type: "text" as const, text: "generic failure message" }],
      isError: true,
    };
    const handler = wrapWithSanitizer(async () => noPathResult);

    const result = await handler(undefined, undefined);

    expect(result.content[0]?.text).toBe("generic failure message");
  });
});

// ---------------------------------------------------------------------------
// buildHiddenToolRegistry
// ---------------------------------------------------------------------------

describe("buildHiddenToolRegistry", () => {
  it("returns only hidden tools from a mixed array", () => {
    const visible = makeTool({ name: "visible_tool" });
    const hidden = makeTool({ name: "hidden_tool", hidden: true });
    const anotherVisible = makeTool({ name: "another_visible" });

    const registry = buildHiddenToolRegistry([visible, hidden, anotherVisible]);

    expect(registry.size).toBe(1);
    expect(registry.has("hidden_tool")).toBe(true);
    expect(registry.has("visible_tool")).toBe(false);
    expect(registry.has("another_visible")).toBe(false);
  });

  it("returns an empty map when no tools are hidden", () => {
    const tools = [makeTool({ name: "a" }), makeTool({ name: "b" })];

    const registry = buildHiddenToolRegistry(tools);

    expect(registry.size).toBe(0);
  });

  it("returns all tools when every tool is hidden", () => {
    const tools = [
      makeTool({ name: "x", hidden: true }),
      makeTool({ name: "y", hidden: true }),
      makeTool({ name: "z", hidden: true }),
    ];

    const registry = buildHiddenToolRegistry(tools);

    expect(registry.size).toBe(3);
    expect(registry.has("x")).toBe(true);
    expect(registry.has("y")).toBe(true);
    expect(registry.has("z")).toBe(true);
  });

  it("uses tool.name as the map key", () => {
    const hidden = makeTool({ name: "my_hidden_tool", hidden: true });

    const registry = buildHiddenToolRegistry([hidden]);

    expect(registry.get("my_hidden_tool")).toBe(hidden);
  });
});
