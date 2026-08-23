/**
 * Issue #1490 — the `TOOL_NOT_FOUND` recovery guidance must name a BOUNDED
 * discovery view.
 *
 * Before this fix the message read:
 *
 *   "Tool 'X' not found. Call the 'schema' tool (no filter) to list every
 *    advertised tool name."
 *
 * `schema` with no filter resolves `view` to `"full"`, which serializes the
 * complete JSON Schema of every advertised tool — measured at ~785 KB / ~196k
 * tokens on a 94-tool runtime, returned with `isError: false`. So the recovery
 * path for a one-character typo silently consumed an entire agent context
 * window.
 *
 * These tests are anchored to the RUNTIME, not to a sentence: whatever view the
 * message names, that view is actually invoked and must (a) list every
 * advertised tool name and (b) cost a small fraction of the full view. A future
 * rewording that still points somewhere unbounded fails here.
 */

import { describe, expect, it } from "vitest";
import { createDescribeToolTool, createSchemaTool } from "../../../src/adapters/mcp/schema-tool.js";

type ToolEntry = { name?: unknown };

async function unknownToolMessage(): Promise<string> {
  const result = await createDescribeToolTool().handler({ name: "definitely_not_a_dysflow_tool" });
  expect(result.isError).toBe(true);
  return result.content[0]?.text ?? "";
}

async function schemaToolNames(input: unknown): Promise<{ names: string[]; bytes: number }> {
  const result = await createSchemaTool().handler(input);
  expect(result.isError).toBe(false);
  const text = result.content[0]?.text ?? "";
  const catalog = JSON.parse(text) as { tools?: ToolEntry[] };
  const names = (catalog.tools ?? [])
    .map((tool) => tool.name)
    .filter((name): name is string => typeof name === "string");
  return { names, bytes: Buffer.byteLength(text, "utf8") };
}

/** The bounded view the guidance is expected to name, parsed out of the message. */
function namedView(message: string): string | undefined {
  return message.match(/view:\s*'([a-z]+)'/)?.[1];
}

describe("#1490 TOOL_NOT_FOUND guidance", () => {
  it("does not send the caller to the unbounded full view", async () => {
    const message = await unknownToolMessage();
    expect(message).toContain("TOOL_NOT_FOUND");
    // The exact trap: "(no filter)" resolves to view:"full".
    expect(message).not.toMatch(/no filter/i);
    expect(message).not.toMatch(/view:\s*'full'/);
  });

  it("names a view that actually lists every callable tool name", async () => {
    const message = await unknownToolMessage();
    expect(message).toMatch(/every callable tool name/i);
    expect(message).not.toMatch(/every advertised tool name/i);
    const view = namedView(message);
    expect(view, "guidance must name a concrete schema view").toBeDefined();

    const bounded = await schemaToolNames({ view });
    const full = await schemaToolNames({ view: "full" });

    // The recovery must answer the question it is given: "which names exist?"
    expect(bounded.names.length).toBe(full.names.length);
    expect(new Set(bounded.names)).toEqual(new Set(full.names));
  });

  it("names a view that costs a small fraction of the full view", async () => {
    const view = namedView(await unknownToolMessage());
    const bounded = await schemaToolNames({ view });
    const full = await schemaToolNames({ view: "full" });

    // Measured at v2.38.2: index ~35 KB vs full ~785 KB (~4.5%). A generous
    // ceiling still fails any view that is unbounded in practice.
    expect(bounded.bytes).toBeLessThan(full.bytes * 0.25);
  });
});
